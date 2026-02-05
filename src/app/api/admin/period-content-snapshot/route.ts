import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

type Body = { period_id?: string; overwrite?: boolean }

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

function isMissingRelation(err: any) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return code === '42P01' || msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('relation')
}

function chunk<T>(arr: T[], size = 500) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:period-content-snapshot:post', String(s.uid || ''), 10, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const periodId = String(body.period_id || '').trim()
  const overwrite = body.overwrite !== false
  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  // KVKK defense: org_admin can only snapshot their org's period
  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String((period as any).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  // Ensure snapshot tables exist (otherwise give actionable hint)
  try {
    const probe = await supabase.from('evaluation_period_questions_snapshot').select('id').limit(1)
    if (probe.error && isMissingRelation(probe.error)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Snapshot tabloları bulunamadı',
          hint: 'Supabase SQL Editor’da sql/period-content-snapshot.sql dosyasını çalıştırın.',
          detail: probe.error.message || String(probe.error),
        },
        { status: 400 }
      )
    }
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'Snapshot tabloları kontrol edilemedi',
        hint: 'Supabase SQL Editor’da sql/period-content-snapshot.sql dosyasını çalıştırın.',
        detail: e?.message || String(e),
      },
      { status: 400 }
    )
  }

  // Optional: period question selection (if installed)
  let periodQuestionIds: string[] | null = null
  try {
    const { data: pq, error: pqErr } = await supabase
      .from('evaluation_period_questions')
      .select('question_id, sort_order, is_active')
      .eq('period_id', periodId)
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at')
    if (!pqErr) {
      const ids = (pq || []).map((r: any) => String(r.question_id || '')).filter(Boolean)
      if (ids.length) periodQuestionIds = ids
    }
  } catch {
    // ignore missing table
  }

  // Load questions + category + main category. Support both schemas:
  const orderCols = ['sort_order', 'order_num'] as const
  const fetchQuestions = async (mode: 'question_categories' | 'categories') => {
    const select =
      mode === 'question_categories'
        ? `
        id, category_id, text, text_en, text_fr, sort_order, order_num, is_active,
        question_categories:category_id(
          id, main_category_id,
          name, name_en, name_fr,
          description, description_en, description_fr,
          sort_order, is_active,
          main_categories:main_category_id(
            id,
            name, name_en, name_fr,
            description, description_en, description_fr,
            sort_order, is_active, status
          )
        )
      `
        : `
        id, category_id, text, text_en, text_fr, sort_order, order_num, is_active,
        categories:category_id(
          id, main_category_id,
          name, name_en, name_fr,
          description, description_en, description_fr,
          sort_order, is_active,
          main_categories:main_category_id(
            id,
            name, name_en, name_fr,
            description, description_en, description_fr,
            sort_order, is_active, status
          )
        )
      `
    let lastErr: any = null
    for (const col of orderCols) {
      const q = supabase.from('questions').select(select)
      if (periodQuestionIds && periodQuestionIds.length) q.in('id', periodQuestionIds)
      const res = await q.order(col)
      if (!res.error) return (res.data || []) as any[]
      const code = String((res.error as any)?.code || '')
      if (code === '42703') {
        lastErr = res.error
        continue
      }
      throw res.error
    }
    if (lastErr) throw lastErr
    return []
  }

  let questions: any[] = []
  let categorySource: 'question_categories' | 'categories' = 'question_categories'
  try {
    questions = await fetchQuestions('question_categories')
    categorySource = 'question_categories'
  } catch {
    questions = await fetchQuestions('categories')
    categorySource = 'categories'
  }

  // Filter out inactive main categories if that field exists (defensive)
  questions = (questions || []).filter((q: any) => {
    const cat = q?.question_categories || q?.categories
    const mc = cat?.main_categories
    if (!mc) return true
    if (typeof mc.is_active === 'boolean') return mc.is_active
    if (typeof mc.status === 'string') return mc.status === 'active'
    return true
  })

  const questionIds = (questions || []).map((q: any) => String(q?.id || '')).filter(Boolean)
  if (!questionIds.length) {
    return NextResponse.json({ success: false, error: 'Snapshot için soru bulunamadı' }, { status: 400 })
  }

  // Load answers from `answers` first, fall back to `question_answers`.
  // We keep the payload shape compatible with evaluation UI (std_score/reel_score).
  let answers: any[] = []
  let answersSourceTable: 'answers' | 'question_answers' = 'answers'
  const fetchAnswers = async (table: 'answers' | 'question_answers') => {
    let lastErr: any = null
    for (const col of ['sort_order', 'order_num'] as const) {
      const res = await supabase.from(table).select('*').in('question_id', questionIds).order(col)
      if (!res.error) return (res.data || []) as any[]
      const code = String((res.error as any)?.code || '')
      if (code === '42703') {
        lastErr = res.error
        continue
      }
      throw res.error
    }
    if (lastErr) throw lastErr
    return []
  }

  try {
    answers = await fetchAnswers('answers')
    answersSourceTable = 'answers'
  } catch (e: any) {
    if (isMissingRelation(e)) {
      answers = await fetchAnswers('question_answers')
      answersSourceTable = 'question_answers'
    } else {
      // If `answers` exists but had a different error, still try fallback best-effort.
      try {
        answers = await fetchAnswers('question_answers')
        answersSourceTable = 'question_answers'
      } catch {
        throw e
      }
    }
  }

  // Overwrite existing snapshot rows for the period.
  if (overwrite) {
    const dels = await Promise.all([
      supabase.from('evaluation_period_answers_snapshot').delete().eq('period_id', periodId),
      supabase.from('evaluation_period_questions_snapshot').delete().eq('period_id', periodId),
      supabase.from('evaluation_period_categories_snapshot').delete().eq('period_id', periodId),
      supabase.from('evaluation_period_main_categories_snapshot').delete().eq('period_id', periodId),
    ])
    const delErr = dels.map((x) => (x as any)?.error).find(Boolean)
    if (delErr) {
      return NextResponse.json({ success: false, error: 'Mevcut snapshot temizlenemedi', detail: delErr.message || String(delErr) }, { status: 400 })
    }
  }

  // Build snapshot payloads (dedupe by id)
  const mainMap = new Map<string, any>()
  const catMap = new Map<string, any>()
  const qPayload: any[] = []

  for (const q of questions) {
    const cat = q?.question_categories || q?.categories
    const mc = cat?.main_categories
    if (mc?.id && !mainMap.has(String(mc.id))) {
      mainMap.set(String(mc.id), {
        period_id: periodId,
        id: mc.id,
        name: mc.name || '-',
        name_en: mc.name_en ?? null,
        name_fr: mc.name_fr ?? null,
        description: mc.description ?? null,
        description_en: mc.description_en ?? null,
        description_fr: mc.description_fr ?? null,
        sort_order: mc.sort_order ?? null,
        is_active: typeof mc.is_active === 'boolean' ? mc.is_active : null,
        status: typeof mc.status === 'string' ? mc.status : null,
        source_table: 'main_categories',
      })
    }
    if (cat?.id && !catMap.has(String(cat.id))) {
      catMap.set(String(cat.id), {
        period_id: periodId,
        id: cat.id,
        main_category_id: cat.main_category_id ?? (mc?.id || null),
        name: cat.name || '-',
        name_en: cat.name_en ?? null,
        name_fr: cat.name_fr ?? null,
        description: cat.description ?? null,
        description_en: cat.description_en ?? null,
        description_fr: cat.description_fr ?? null,
        sort_order: cat.sort_order ?? null,
        is_active: typeof cat.is_active === 'boolean' ? cat.is_active : null,
        source_table: categorySource,
      })
    }

    qPayload.push({
      period_id: periodId,
      id: q.id,
      category_id: cat?.id || q.category_id || null,
      text: q.text || '-',
      text_en: q.text_en ?? null,
      text_fr: q.text_fr ?? null,
      sort_order: q.sort_order ?? q.order_num ?? null,
      is_active: typeof q.is_active === 'boolean' ? q.is_active : null,
      category_source: q?.question_categories ? 'question_categories' : q?.categories ? 'categories' : categorySource,
    })
  }

  const aPayload = (answers || []).map((a: any) => ({
    period_id: periodId,
    id: a.id,
    question_id: a.question_id,
    text: a.text || '-',
    text_en: a.text_en ?? null,
    text_fr: a.text_fr ?? null,
    level: a.level ?? null,
    std_score: a.std_score ?? null,
    reel_score: a.reel_score ?? null,
    sort_order: a.sort_order ?? a.order_num ?? null,
    is_active: typeof a.is_active === 'boolean' ? a.is_active : null,
    source_table: answersSourceTable,
  }))

  const mainPayload = Array.from(mainMap.values())
  const catPayload = Array.from(catMap.values())

  // Insert in chunks for safety
  const insertChunked = async (table: string, rows: any[]) => {
    for (const part of chunk(rows, 500)) {
      const { error } = await supabase.from(table).insert(part)
      if (error) throw error
    }
  }

  try {
    if (mainPayload.length) await insertChunked('evaluation_period_main_categories_snapshot', mainPayload)
    if (catPayload.length) await insertChunked('evaluation_period_categories_snapshot', catPayload)
    if (qPayload.length) await insertChunked('evaluation_period_questions_snapshot', qPayload)
    if (aPayload.length) await insertChunked('evaluation_period_answers_snapshot', aPayload)
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'Snapshot kaydedilemedi',
        detail: e?.message || String(e),
        hint: 'Supabase SQL Editor’da sql/period-content-snapshot.sql dosyasını çalıştırdığınızdan emin olun.',
      },
      { status: 400 }
    )
  }

  return NextResponse.json({
    success: true,
    period_id: periodId,
    counts: {
      main_categories: mainPayload.length,
      categories: catPayload.length,
      questions: qPayload.length,
      answers: aPayload.length,
    },
  })
}

