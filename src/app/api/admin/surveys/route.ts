import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import type { SurveyQuestionType } from '@/types/database'

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

function slugify(input: string) {
  const base = String(input || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'anket'
}

const QUESTION_TYPES: SurveyQuestionType[] = ['likert', 'single', 'multi', 'text', 'nps', 'yesno', 'date', 'rank']

type QuestionInput = {
  id?: string
  question_type?: string
  text?: string
  text_en?: string | null
  text_fr?: string | null
  options?: unknown
  scale_min?: number | null
  scale_max?: number | null
  is_required?: boolean
  sort_order?: number
}

type SaveBody = {
  id?: string
  org_id?: string | null
  title?: string
  title_en?: string | null
  title_fr?: string | null
  description?: string | null
  description_en?: string | null
  description_fr?: string | null
  status?: string
  access_type?: string
  is_anonymous?: boolean
  start_date?: string | null
  end_date?: string | null
  questions?: QuestionInput[]
}

// ---------------------------------------------------------------------------
// GET: liste (?org_id=) veya tek anket + soruları (?id=)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:surveys:get', String(s.uid || ''), 90, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const id = String(url.searchParams.get('id') || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : String(url.searchParams.get('org_id') || '').trim()

  // Tek anket detayı (builder için soruları da getir)
  if (id) {
    const { data: survey, error } = await supabase.from('surveys').select('*').eq('id', id).maybeSingle()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    if (!survey) return NextResponse.json({ success: false, error: 'Anket bulunamadı' }, { status: 404 })
    if (s.role === 'org_admin' && String(survey.organization_id || '') !== orgId) {
      return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
    }
    const { data: questions } = await supabase
      .from('survey_questions')
      .select('*')
      .eq('survey_id', id)
      .order('sort_order', { ascending: true })
    const { count } = await supabase
      .from('survey_responses')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', id)
    return NextResponse.json({ success: true, survey, questions: questions || [], response_count: count || 0 })
  }

  // Liste
  let q = supabase.from('surveys').select('*').order('created_at', { ascending: false }).limit(500)
  if (s.role === 'org_admin') {
    if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })
    q = q.eq('organization_id', orgId)
  } else if (orgId) {
    q = q.eq('organization_id', orgId)
  }
  const { data: surveys, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })

  // Yanıt sayıları
  const ids = (surveys || []).map((x: any) => x.id)
  const counts: Record<string, number> = {}
  if (ids.length) {
    const { data: resp } = await supabase.from('survey_responses').select('survey_id').in('survey_id', ids)
    for (const r of resp || []) counts[(r as any).survey_id] = (counts[(r as any).survey_id] || 0) + 1
  }
  const items = (surveys || []).map((x: any) => ({ ...x, response_count: counts[x.id] || 0 }))
  return NextResponse.json({ success: true, items })
}

// ---------------------------------------------------------------------------
// POST: anket oluştur/güncelle (+ opsiyonel soru listesi = builder kaydı)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:surveys:post', String(s.uid || ''), 40, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as SaveBody
  const id = String(body.id || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : String(body.org_id || '').trim()
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({ success: false, error: 'Başlık gerekli' }, { status: 400 })

  const status = ['draft', 'active', 'closed'].includes(String(body.status)) ? String(body.status) : 'draft'
  const accessType = ['internal', 'public', 'both'].includes(String(body.access_type)) ? String(body.access_type) : 'both'

  const meta: any = {
    organization_id: orgId,
    title,
    title_en: body.title_en ? String(body.title_en) : null,
    title_fr: body.title_fr ? String(body.title_fr) : null,
    description: body.description ? String(body.description) : null,
    description_en: body.description_en ? String(body.description_en) : null,
    description_fr: body.description_fr ? String(body.description_fr) : null,
    status,
    access_type: accessType,
    is_anonymous: typeof body.is_anonymous === 'boolean' ? body.is_anonymous : false,
    start_date: body.start_date ? String(body.start_date) : null,
    end_date: body.end_date ? String(body.end_date) : null,
    updated_at: new Date().toISOString(),
  }

  let surveyId = id
  if (id) {
    // Güncelleme — org_admin yalnızca kendi kurumunu düzenleyebilir
    if (s.role === 'org_admin') {
      const { data: existing } = await supabase.from('surveys').select('organization_id').eq('id', id).maybeSingle()
      if (!existing || String((existing as any).organization_id || '') !== orgId) {
        return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
      }
    }
    const { error } = await supabase.from('surveys').update(meta).eq('id', id)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  } else {
    // Yeni — benzersiz slug üret
    let slug = slugify(title)
    const { data: clash } = await supabase.from('surveys').select('id').eq('slug', slug).maybeSingle()
    if (clash) slug = `${slug}-${Math.abs(hashStr(title + status + accessType)) % 100000}`
    meta.slug = slug
    meta.created_by = s.uid ? String(s.uid) : null
    const { data: created, error } = await supabase.from('surveys').insert(meta).select('id').single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    surveyId = (created as any).id
  }

  // Sorular gönderildiyse tam senkron (sil-yeniden ekle: builder basitliği)
  if (Array.isArray(body.questions)) {
    await supabase.from('survey_questions').delete().eq('survey_id', surveyId)
    const rows = body.questions
      .map((qn, idx) => normalizeQuestion(qn, surveyId, idx))
      .filter((x): x is NonNullable<typeof x> => x !== null)
    if (rows.length) {
      const { error: qErr } = await supabase.from('survey_questions').insert(rows)
      if (qErr) return NextResponse.json({ success: false, error: qErr.message }, { status: 400 })
    }
  }

  return NextResponse.json({ success: true, id: surveyId })
}

// ---------------------------------------------------------------------------
// DELETE: ?id=  (cascade ile soru/yanıt/analizler de gider)
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:surveys:delete', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const id = String(new URL(req.url).searchParams.get('id') || '').trim()
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  if (s.role === 'org_admin') {
    const { data: existing } = await supabase.from('surveys').select('organization_id').eq('id', id).maybeSingle()
    if (!existing || String((existing as any).organization_id || '') !== String(s.org_id || '')) {
      return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
    }
  }

  const { error } = await supabase.from('surveys').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}

// ---- helpers ----
function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

function normalizeQuestion(qn: QuestionInput, surveyId: string, idx: number) {
  const text = String(qn.text || '').trim()
  if (!text) return null
  const type = QUESTION_TYPES.includes(qn.question_type as SurveyQuestionType)
    ? (qn.question_type as SurveyQuestionType)
    : 'text'
  return {
    survey_id: surveyId,
    question_type: type,
    text,
    text_en: qn.text_en ? String(qn.text_en) : null,
    text_fr: qn.text_fr ? String(qn.text_fr) : null,
    options: qn.options ?? null,
    scale_min: typeof qn.scale_min === 'number' ? qn.scale_min : null,
    scale_max: typeof qn.scale_max === 'number' ? qn.scale_max : null,
    is_required: typeof qn.is_required === 'boolean' ? qn.is_required : false,
    sort_order: typeof qn.sort_order === 'number' ? qn.sort_order : idx,
  }
}
