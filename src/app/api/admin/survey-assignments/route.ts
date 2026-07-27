import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

function isMissingTable(err: any): boolean {
  return err?.code === '42P01' || /survey_assignment/i.test(String(err?.message || ''))
}

const MISSING_HINT =
  'Anket atama tabloları bulunamadı. Lütfen sql/survey-assignments.sql dosyasını Supabase üzerinde çalıştırın.'

const SCOPE_MODES = ['category', 'question', 'mixed']

type AssignmentInput = {
  user_id?: string
  scope_mode?: string
  categories?: string[]
  question_ids?: string[]
}

// ---------------------------------------------------------------------------
// GET: ?survey_id=  → atanabilir kullanıcılar, anket soruları ve mevcut atamalar
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:survey-assign:get', String(s.uid || ''), 90, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const surveyId = String(new URL(req.url).searchParams.get('survey_id') || '').trim()
  if (!surveyId) return NextResponse.json({ success: false, error: 'survey_id gerekli' }, { status: 400 })

  const { data: survey } = await supabase.from('surveys').select('id, organization_id').eq('id', surveyId).maybeSingle()
  if (!survey) return NextResponse.json({ success: false, error: 'Anket bulunamadı' }, { status: 404 })
  const orgId = String((survey as any).organization_id || '')
  if (s.role === 'org_admin' && orgId !== String(s.org_id || '')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const [questionsRes, usersRes] = await Promise.all([
    supabase
      .from('survey_questions')
      .select('id, text, category, question_type, sort_order')
      .eq('survey_id', surveyId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('users')
      .select('id, name, email, title, department, status, organization_id')
      .eq('organization_id', orgId)
      .order('name'),
  ])
  if (questionsRes.error) return NextResponse.json({ success: false, error: questionsRes.error.message }, { status: 400 })

  // Mevcut atamalar (tablolar yoksa boş liste + hint)
  let assignments: any[] = []
  const headRes = await supabase.from('survey_assignments').select('*').eq('survey_id', surveyId)
  if (headRes.error) {
    if (isMissingTable(headRes.error)) {
      return NextResponse.json({
        success: true,
        needs_migration: true,
        hint: MISSING_HINT,
        questions: questionsRes.data || [],
        users: usersRes.data || [],
        assignments: [],
      })
    }
    return NextResponse.json({ success: false, error: headRes.error.message }, { status: 400 })
  }
  const heads = (headRes.data || []) as Array<{ id: string; user_id: string; scope_mode: string; status: string }>
  const headIds = heads.map((h) => h.id)
  let catRows: Array<{ assignment_id: string; category: string }> = []
  let qRows: Array<{ assignment_id: string; question_id: string }> = []
  if (headIds.length) {
    const [c, q] = await Promise.all([
      supabase.from('survey_assignment_categories').select('assignment_id, category').in('assignment_id', headIds),
      supabase.from('survey_assignment_questions').select('assignment_id, question_id').in('assignment_id', headIds),
    ])
    catRows = (c.data || []) as any[]
    qRows = (q.data || []) as any[]
  }
  assignments = heads.map((h) => ({
    user_id: h.user_id,
    scope_mode: h.scope_mode,
    status: h.status,
    categories: catRows.filter((r) => r.assignment_id === h.id).map((r) => r.category),
    question_ids: qRows.filter((r) => r.assignment_id === h.id).map((r) => r.question_id),
  }))

  return NextResponse.json({
    success: true,
    questions: questionsRes.data || [],
    users: usersRes.data || [],
    assignments,
  })
}

// ---------------------------------------------------------------------------
// POST: { survey_id, assignments: [...] } → ankete ait atamaları tam senkronla
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:survey-assign:post', String(s.uid || ''), 40, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as { survey_id?: string; assignments?: AssignmentInput[] }
  const surveyId = String(body.survey_id || '').trim()
  if (!surveyId) return NextResponse.json({ success: false, error: 'survey_id gerekli' }, { status: 400 })

  const { data: survey } = await supabase.from('surveys').select('id, organization_id').eq('id', surveyId).maybeSingle()
  if (!survey) return NextResponse.json({ success: false, error: 'Anket bulunamadı' }, { status: 404 })
  const orgId = String((survey as any).organization_id || '')
  if (s.role === 'org_admin' && orgId !== String(s.org_id || '')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const incoming = Array.isArray(body.assignments) ? body.assignments : []

  // Yalnızca gerçekten içerik atanmış kullanıcıları tut (kategori veya tekil soru).
  const cleaned = incoming
    .map((a) => ({
      user_id: String(a.user_id || '').trim(),
      scope_mode: SCOPE_MODES.includes(String(a.scope_mode)) ? String(a.scope_mode) : 'mixed',
      categories: Array.from(new Set((a.categories || []).map((c) => String(c).trim()).filter(Boolean))),
      question_ids: Array.from(new Set((a.question_ids || []).map((q) => String(q).trim()).filter(Boolean))),
    }))
    .filter((a) => a.user_id && (a.categories.length > 0 || a.question_ids.length > 0))

  // Mevcut atama başlıkları
  const existingRes = await supabase.from('survey_assignments').select('id, user_id').eq('survey_id', surveyId)
  if (existingRes.error) {
    if (isMissingTable(existingRes.error)) {
      return NextResponse.json({ success: false, error: MISSING_HINT, needs_migration: true }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: existingRes.error.message }, { status: 400 })
  }
  const existing = (existingRes.data || []) as Array<{ id: string; user_id: string }>
  const keepUserIds = new Set(cleaned.map((a) => a.user_id))

  // 1) Artık atanmamış kullanıcıların başlıklarını sil (cascade child'ları da temizler)
  const toDelete = existing.filter((e) => !keepUserIds.has(String(e.user_id))).map((e) => e.id)
  if (toDelete.length) {
    const del = await supabase.from('survey_assignments').delete().in('id', toDelete)
    if (del.error) return NextResponse.json({ success: false, error: del.error.message }, { status: 400 })
  }

  // 2) Her atamayı upsert + child'ları yeniden yaz
  const nowIso = new Date().toISOString()
  for (const a of cleaned) {
    const existingHead = existing.find((e) => String(e.user_id) === a.user_id)
    let assignmentId = existingHead?.id
    if (assignmentId) {
      const up = await supabase
        .from('survey_assignments')
        .update({ scope_mode: a.scope_mode, status: 'assigned', updated_at: nowIso })
        .eq('id', assignmentId)
      if (up.error) return NextResponse.json({ success: false, error: up.error.message }, { status: 400 })
    } else {
      const ins = await supabase
        .from('survey_assignments')
        .insert({
          survey_id: surveyId,
          user_id: a.user_id,
          scope_mode: a.scope_mode,
          status: 'assigned',
          assigned_by: s.uid ? String(s.uid) : null,
        })
        .select('id')
        .single()
      if (ins.error || !ins.data) {
        return NextResponse.json({ success: false, error: ins.error?.message || 'Atama oluşturulamadı' }, { status: 400 })
      }
      assignmentId = (ins.data as any).id
    }

    // Child satırları sil-yeniden ekle (basit senkron)
    await supabase.from('survey_assignment_categories').delete().eq('assignment_id', assignmentId)
    await supabase.from('survey_assignment_questions').delete().eq('assignment_id', assignmentId)
    if (a.categories.length) {
      const cErr = (
        await supabase
          .from('survey_assignment_categories')
          .insert(a.categories.map((category) => ({ assignment_id: assignmentId, category })))
      ).error
      if (cErr) return NextResponse.json({ success: false, error: cErr.message }, { status: 400 })
    }
    if (a.question_ids.length) {
      const qErr = (
        await supabase
          .from('survey_assignment_questions')
          .insert(a.question_ids.map((question_id) => ({ assignment_id: assignmentId, question_id })))
      ).error
      if (qErr) return NextResponse.json({ success: false, error: qErr.message }, { status: 400 })
    }
  }

  return NextResponse.json({ success: true, count: cleaned.length })
}
