import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

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

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  // Form load endpoint: rate limit by user to avoid corporate NAT false-positives
  const rl = await rateLimitByUser(req, 'evaluation:load:get', s.uid, 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const { slug } = await ctx.params
  const slugStr = String(slug || '').trim()
  if (!slugStr) return NextResponse.json({ success: false, error: 'slug gerekli' }, { status: 400 })

  const selectAssign = `
    *,
    evaluator:evaluator_id(name, preferred_language),
    target:target_id(name, department),
    evaluation_periods(id, name, name_en, name_fr, status, organization_id)
  `

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugStr)
  let assignData: any = null

  if (isUuid) {
    const { data, error } = await supabase.from('evaluation_assignments').select(selectAssign).eq('id', slugStr).maybeSingle()
    if (error) return NextResponse.json({ success: false, error: error.message || 'Atama alınamadı' }, { status: 400 })
    assignData = data
  }

  if (!assignData) {
    const { data, error } = await supabase.from('evaluation_assignments').select(selectAssign).eq('slug', slugStr).maybeSingle()
    if (error) return NextResponse.json({ success: false, error: error.message || 'Atama alınamadı' }, { status: 400 })
    assignData = data
  }

  if (!assignData) return NextResponse.json({ success: false, error: 'Değerlendirme bulunamadı' }, { status: 404 })

  if (String(assignData.evaluator_id) !== String(s.uid)) {
    return NextResponse.json({ success: false, error: 'Bu değerlendirmeye erişim yetkiniz yok' }, { status: 403 })
  }
  if (assignData.status === 'completed') {
    return NextResponse.json({ success: false, error: 'Bu değerlendirme zaten tamamlanmış' }, { status: 409 })
  }
  if (assignData.evaluation_periods?.status !== 'active') {
    return NextResponse.json({ success: false, error: 'Bu değerlendirme dönemi aktif değil' }, { status: 409 })
  }

  // If period content snapshot exists, prefer snapshot tables for questions/answers (content immutability).
  const periodId = String(assignData.period_id || assignData?.evaluation_periods?.id || '').trim()
  let useSnapshot = false
  if (periodId) {
    try {
      const probe = await supabase.from('evaluation_period_questions_snapshot').select('id').eq('period_id', periodId).limit(1)
      if (!probe.error && (probe.data || []).length > 0) useSnapshot = true
    } catch {
      // ignore (tables may not exist)
    }
  }

  // Optional: period question selection
  let periodQuestionIds: string[] | null = null
  if (!useSnapshot) {
    try {
      const { data: pq, error: pqErr } = await supabase
        .from('evaluation_period_questions')
        .select('question_id, sort_order, is_active')
        .eq('period_id', assignData.period_id)
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at')
      if (!pqErr) {
        const ids = (pq || []).map((r: any) => r.question_id).filter(Boolean)
        if (ids.length > 0) periodQuestionIds = ids
      }
    } catch {
      // ignore missing table
    }
  }

  // International standards (org scoped)
  let standards: any[] = []
  const orgId = assignData?.evaluation_periods?.organization_id as string | null | undefined
  if (orgId) {
    try {
      const { data: stds, error: stdErr } = await supabase
        .from('international_standards')
        .select('id,code,title,description,sort_order,is_active,created_at')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at')
      if (!stdErr) standards = (stds || []) as any[]
    } catch {
      // ignore if table missing
    }
  }

  // Existing standard scores (if any)
  let standardScores: any[] = []
  try {
    const { data, error } = await supabase
      .from('international_standard_scores')
      .select('standard_id, score, justification, created_at')
      .eq('assignment_id', assignData.id)
    if (!error && data) standardScores = data as any[]
  } catch {
    // ignore missing table
  }

  let questions: any[] = []
  const answersByQuestion: Record<string, any[]> = {}

  if (useSnapshot && periodId) {
    // Snapshot tables already contain localized names; we only provide structure to the UI.
    const [qSnapRes, aSnapRes, catSnapRes, mainSnapRes] = await Promise.all([
      supabase
        .from('evaluation_period_questions_snapshot')
        .select('id, category_id, text, text_en, text_fr, sort_order, is_active')
        .eq('period_id', periodId)
        .order('sort_order')
        .order('snapshotted_at'),
      supabase
        .from('evaluation_period_answers_snapshot')
        .select('id, question_id, text, text_en, text_fr, std_score, reel_score, sort_order, is_active')
        .eq('period_id', periodId)
        .order('sort_order')
        .order('snapshotted_at'),
      supabase
        .from('evaluation_period_categories_snapshot')
        .select('id, main_category_id, name, name_en, name_fr, is_active, sort_order')
        .eq('period_id', periodId),
      supabase
        .from('evaluation_period_main_categories_snapshot')
        .select('id, name, name_en, name_fr, is_active, status, sort_order')
        .eq('period_id', periodId),
    ])

    if (qSnapRes.error) {
      return NextResponse.json({ success: false, error: qSnapRes.error.message || 'Snapshot soruları alınamadı' }, { status: 400 })
    }
    if (aSnapRes.error) {
      return NextResponse.json({ success: false, error: aSnapRes.error.message || 'Snapshot cevapları alınamadı' }, { status: 400 })
    }

    const catById = new Map<string, any>()
    ;((catSnapRes.data || []) as any[]).forEach((c) => {
      if (c?.id) catById.set(String(c.id), c)
    })
    const mainById = new Map<string, any>()
    ;((mainSnapRes.data || []) as any[]).forEach((m) => {
      if (m?.id) mainById.set(String(m.id), m)
    })

    const qs = (qSnapRes.data || []) as any[]
    questions = qs
      .filter((q) => (typeof q.is_active === 'boolean' ? q.is_active : true))
      .map((q) => {
        const cat = q?.category_id ? catById.get(String(q.category_id)) : null
        const mc = cat?.main_category_id ? mainById.get(String(cat.main_category_id)) : null
        return {
          id: q.id,
          text: q.text,
          text_en: q.text_en ?? null,
          text_fr: q.text_fr ?? null,
          order_num: q.sort_order ?? 0,
          sort_order: q.sort_order ?? null,
          category_id: q.category_id,
          question_categories: cat
            ? {
                name: cat.name,
                name_en: cat.name_en ?? null,
                name_fr: cat.name_fr ?? null,
                main_categories: mc
                  ? {
                      name: mc.name,
                      name_en: mc.name_en ?? null,
                      name_fr: mc.name_fr ?? null,
                      status: mc.status ?? null,
                      is_active: typeof mc.is_active === 'boolean' ? mc.is_active : null,
                    }
                  : { name: '-', name_en: null, name_fr: null, status: null, is_active: null },
              }
            : null,
        }
      })

    ;((aSnapRes.data || []) as any[]).forEach((a: any) => {
      if (typeof a.is_active === 'boolean' && !a.is_active) return
      const qid = String(a.question_id || '')
      if (!qid) return
      if (!answersByQuestion[qid]) answersByQuestion[qid] = []
      answersByQuestion[qid].push({
        id: a.id,
        question_id: a.question_id,
        text: a.text,
        text_en: a.text_en ?? null,
        text_fr: a.text_fr ?? null,
        std_score: a.std_score ?? 0,
        reel_score: a.reel_score ?? 0,
        order_num: a.sort_order ?? 0,
        sort_order: a.sort_order ?? null,
      })
    })
  } else {
    // Questions (supports both question_categories and categories FK variants)
    const orderCols = ['sort_order', 'order_num'] as const
    const fetchQuestions = async (mode: 'question_categories' | 'categories') => {
      const select =
        mode === 'question_categories'
          ? `
        *,
        question_categories:category_id(
          name, name_en, name_fr,
          main_categories(*)
        )
      `
          : `
        *,
        categories:category_id(
          name, name_en, name_fr,
          main_categories(*)
        )
      `
      let lastErr: any = null
      for (const col of orderCols) {
        const q = supabase.from('questions').select(select)
        if (periodQuestionIds && periodQuestionIds.length) q.in('id', periodQuestionIds)
        const res = await q.order(col)
        if (!res.error) return (res.data || []) as any[]
        const code = (res.error as any)?.code
        const msg = String((res.error as any)?.message || '')
        if (code === '42703' && (msg.includes('order_num') || msg.includes('sort_order'))) {
          lastErr = res.error
          continue
        }
        throw res.error
      }
      if (lastErr) throw lastErr
      return []
    }

    let questionsData: any[] = []
    try {
      questionsData = await fetchQuestions('question_categories')
    } catch {
      questionsData = await fetchQuestions('categories')
    }

    questions = (questionsData || []).filter((q: any) => {
      const cat = q.question_categories || q.categories
      const mc: any = cat?.main_categories
      if (!mc) return true
      if (typeof mc.is_active === 'boolean') return mc.is_active
      if (typeof mc.status === 'string') return mc.status === 'active'
      return true
    })

    // Answers
    const questionIds = questions.map((q: any) => q.id)
    const fetchAnswers = async (table: 'answers' | 'question_answers') => {
      let lastErr: any = null
      for (const col of ['order_num', 'sort_order'] as const) {
        const res = await supabase.from(table).select('*').in('question_id', questionIds).order(col)
        if (!res.error) return (res.data || []) as any[]
        const code = (res.error as any)?.code
        const msg = String((res.error as any)?.message || '')
        if (code === '42703' && (msg.includes('order_num') || msg.includes('sort_order'))) {
          lastErr = res.error
          continue
        }
        throw res.error
      }
      if (lastErr) throw lastErr
      return []
    }

    let answersData: any[] = []
    try {
      answersData = questionIds.length ? await fetchAnswers('answers') : []
    } catch {
      answersData = questionIds.length ? await fetchAnswers('question_answers') : []
    }

    ;(answersData || []).forEach((a: any) => {
      const qid = String(a.question_id || '')
      if (!qid) return
      if (!answersByQuestion[qid]) answersByQuestion[qid] = []
      answersByQuestion[qid].push(a)
    })
  }

  // Existing responses (if any)
  let existingResponses: any[] = []
  try {
    const { data, error } = await supabase.from('evaluation_responses').select('*').eq('assignment_id', assignData.id)
    if (!error && data) existingResponses = data as any[]
  } catch {
    // ignore
  }

  return NextResponse.json({
    success: true,
    assignment: assignData,
    questions,
    answersByQuestion,
    standards,
    standardScores,
    existingResponses,
  })
}

