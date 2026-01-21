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
    evaluation_periods(id, name, status, organization_id)
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

  // Optional: period question selection
  let periodQuestionIds: string[] | null = null
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

  const questions = (questionsData || []).filter((q: any) => {
    const cat = q.question_categories || q.categories
    const mc: any = cat?.main_categories
    if (!mc) return true
    if (typeof mc.is_active === 'boolean') return mc.is_active
    if (typeof mc.status === 'string') return mc.status === 'active'
    return true
  })

  // Answers
  const questionIds = questions.map((q: any) => q.id)
  const fetchAnswers = async () => {
    let lastErr: any = null
    for (const col of ['order_num', 'sort_order'] as const) {
      const res = await supabase.from('answers').select('*').in('question_id', questionIds).order(col)
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

  const answersData = questionIds.length ? await fetchAnswers() : []
  const answersByQuestion: Record<string, any[]> = {}
  ;(answersData || []).forEach((a: any) => {
    const qid = String(a.question_id || '')
    if (!qid) return
    if (!answersByQuestion[qid]) answersByQuestion[qid] = []
    answersByQuestion[qid].push(a)
  })

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

