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

type Body = {
  assignment_id?: string
  responses?: Record<string, string[]>
  standard_scores?: Record<string, { score: number; rationale?: string }>
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  // Submission endpoint: limit by user (not IP) to avoid corporate NAT false-positives.
  // 20/min is generous for autosave-style clients while still preventing abuse.
  const rl = rateLimitByUser(req, 'evaluation:submit:post', s.uid, 20, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const assignmentId = String(body.assignment_id || '').trim()
  const responses = (body.responses || {}) as Record<string, string[]>
  const standardScores = (body.standard_scores || {}) as Record<string, { score: number; rationale?: string }>
  if (!assignmentId) return NextResponse.json({ success: false, error: 'assignment_id gerekli' }, { status: 400 })

  // Validate assignment ownership + status
  const { data: assignment, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select('id,evaluator_id,target_id,status,period_id,evaluation_periods(status,organization_id)')
    .eq('id', assignmentId)
    .maybeSingle()
  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atama alınamadı' }, { status: 400 })
  if (!assignment) return NextResponse.json({ success: false, error: 'Atama bulunamadı' }, { status: 404 })
  if (String((assignment as any).evaluator_id) !== String(s.uid)) {
    return NextResponse.json({ success: false, error: 'Bu değerlendirmeye erişim yetkiniz yok' }, { status: 403 })
  }

  // KVKK: cross-org guard (defense-in-depth)
  // Even though assignment creation already checks org, keep submit resilient against bad/old data.
  const periodOrgId = (assignment as any).evaluation_periods?.organization_id ? String((assignment as any).evaluation_periods.organization_id) : ''
  if (periodOrgId) {
    const { data: me, error: meErr } = await supabase.from('users').select('id,organization_id').eq('id', s.uid).maybeSingle()
    if (meErr || !me) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })
    if (String((me as any).organization_id || '') !== periodOrgId) {
      return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
    }
  }
  if ((assignment as any).status === 'completed') {
    return NextResponse.json({ success: false, error: 'Bu değerlendirme zaten tamamlanmış' }, { status: 409 })
  }
  if ((assignment as any).evaluation_periods?.status && String((assignment as any).evaluation_periods.status) !== 'active') {
    return NextResponse.json({ success: false, error: 'Bu değerlendirme dönemi aktif değil' }, { status: 409 })
  }

  // Load questions + answers for scoring (respects period selection if table exists)
  let periodQuestionIds: string[] | null = null
  try {
    const { data: pq, error: pqErr } = await supabase
      .from('evaluation_period_questions')
      .select('question_id, sort_order, is_active')
      .eq('period_id', (assignment as any).period_id)
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at')
    if (!pqErr) {
      const ids = (pq || []).map((r: any) => r.question_id).filter(Boolean)
      if (ids.length > 0) periodQuestionIds = ids
    }
  } catch {
    // ignore
  }

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

  const questionIds = questions.map((q: any) => q.id)
  const answersData = questionIds.length ? (await supabase.from('answers').select('*').in('question_id', questionIds)).data || [] : []
  const answersByQuestion = new Map<string, any[]>()
  ;(answersData as any[]).forEach((a) => {
    const qid = String(a.question_id || '')
    if (!qid) return
    const cur = answersByQuestion.get(qid) || []
    cur.push(a)
    answersByQuestion.set(qid, cur)
  })

  const isNoInfo = (a: any) => Number(a?.std_score || 0) === 0 && Number(a?.reel_score || 0) === 0

  // Validate unanswered
  const unanswered = questions.filter((q: any) => !responses[q.id] || (responses[q.id] || []).length === 0)
  if (unanswered.length > 0) {
    return NextResponse.json({ success: false, error: `${unanswered.length} soru cevaplanmamış` }, { status: 400 })
  }

  // Standards: if present, require scores
  // (If standards table is not installed or empty, skip)
  let standards: any[] = []
  try {
    const orgId = (assignment as any)?.evaluation_periods?.organization_id as string | null | undefined
    if (orgId) {
      const { data } = await supabase
        .from('international_standards')
        .select('id,is_active')
        .eq('organization_id', orgId)
        .eq('is_active', true)
      standards = (data || []) as any[]
    }
  } catch {
    // ignore
  }

  if (standards.length > 0) {
    const missing = standards.filter((st: any) => !standardScores[st.id] || !Number(standardScores[st.id]?.score || 0))
    if (missing.length > 0) {
      return NextResponse.json({ success: false, error: 'Tüm standartları puanlamalısınız.' }, { status: 400 })
    }

    const payload = standards.map((st: any) => ({
      assignment_id: assignmentId,
      standard_id: st.id,
      score: Number(standardScores[st.id]?.score || 0),
      justification: (standardScores[st.id]?.rationale || '').trim() || null,
    }))

    try {
      const { error } = await supabase.from('international_standard_scores').upsert(payload, { onConflict: 'assignment_id,standard_id' })
      if (error) throw error
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.toLowerCase().includes('no unique') || msg.toLowerCase().includes('no unique or exclusion')) {
        await supabase.from('international_standard_scores').delete().eq('assignment_id', assignmentId)
        const { error: insErr } = await supabase.from('international_standard_scores').insert(payload)
        if (insErr) return NextResponse.json({ success: false, error: insErr.message || 'Standartlar kaydedilemedi' }, { status: 400 })
      } else if (String(e?.code || '') === '42P01') {
        return NextResponse.json({ success: false, error: 'Uluslararası standart tabloları yok. Admin önce SQL dosyasını çalıştırmalı.' }, { status: 400 })
      } else {
        return NextResponse.json({ success: false, error: msg || 'Standartlar kaydedilemedi' }, { status: 400 })
      }
    }
  }

  // Build response rows with scoring
  const rows: any[] = []
  for (const q of questions) {
    const selectedIds = responses[q.id] || []
    const allAnswers = answersByQuestion.get(String(q.id)) || []
    const selected = allAnswers.filter((a: any) => selectedIds.includes(String(a.id)))
    const meaningful = selected.filter((a: any) => !isNoInfo(a))
    if (meaningful.length === 0) continue
    const avgStd = meaningful.reduce((sum: number, a: any) => sum + Number(a.std_score || 0), 0) / meaningful.length
    const avgReel = meaningful.reduce((sum: number, a: any) => sum + Number(a.reel_score || 0), 0) / meaningful.length
    rows.push({
      assignment_id: assignmentId,
      question_id: q.id,
      answer_ids: selectedIds,
      std_score: avgStd,
      reel_score: avgReel,
      category_name: (q as any).question_categories?.name || (q as any).categories?.name || null,
    })
  }

  // Save responses (idempotent)
  const saveResponses = async (payload: any[]) => {
    if (!payload.length) return
    try {
      const { error } = await supabase.from('evaluation_responses').upsert(payload, { onConflict: 'assignment_id,question_id' })
      if (!error) return
      throw error
    } catch (e: any) {
      const msg = String(e?.message || '')
      const code = String(e?.code || '')
      if (code === 'PGRST204' && msg.includes("'answer_ids'")) {
        const stripped = payload.map(({ answer_ids: _answer_ids, ...rest }) => rest)
        const { error: retryErr } = await supabase.from('evaluation_responses').upsert(stripped, { onConflict: 'assignment_id,question_id' })
        if (!retryErr) return
        throw retryErr
      }
      if (msg.toLowerCase().includes('no unique') || msg.toLowerCase().includes('no unique or exclusion')) {
        await supabase.from('evaluation_responses').delete().eq('assignment_id', assignmentId)
        const { error: insErr } = await supabase.from('evaluation_responses').insert(payload)
        if (!insErr) return
        const insMsg = String((insErr as any)?.message || '')
        const insCode = String((insErr as any)?.code || '')
        if (insCode === 'PGRST204' && insMsg.includes("'answer_ids'")) {
          const stripped = payload.map(({ answer_ids: _answer_ids, ...rest }) => rest)
          const { error: insRetryErr } = await supabase.from('evaluation_responses').insert(stripped)
          if (!insRetryErr) return
          throw insRetryErr
        }
        throw insErr
      }
      throw e
    }
  }

  try {
    await saveResponses(rows)
  } catch (e: any) {
    const detail = e?.message || e?.details || e?.hint || 'unknown'
    return NextResponse.json({ success: false, error: `Yanıtlar kaydedilemedi (${detail})` }, { status: 400 })
  }

  const { error: updErr } = await supabase
    .from('evaluation_assignments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', assignmentId)
  if (updErr) {
    const detail = (updErr as any)?.message || (updErr as any)?.details || (updErr as any)?.hint || 'unknown'
    return NextResponse.json({ success: false, error: `Atama güncellenemedi (${detail})` }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

