type SupabaseLike = {
  from: (table: string) => any
}

export type DutyScopeMeta = {
  dutyQuestionIds: Set<string>
  dutyOnlyQuestionIds: Set<string>
  questionDutyMap: Map<string, { dutyId: string; dutyName: string }>
}

function isMissingTable(error: any) {
  const code = String(error?.code || '')
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')
}

export async function fetchBasePeriodQuestionIds(supabase: SupabaseLike, periodId: string) {
  const base = new Set<string>()
  if (!periodId) return base

  try {
    const probe = await supabase
      .from('evaluation_period_questions_snapshot')
      .select('id')
      .eq('period_id', periodId)
      .limit(1)
    if (!probe.error && (probe.data || []).length > 0) {
      const { data, error } = await supabase
        .from('evaluation_period_questions_snapshot')
        .select('id')
        .eq('period_id', periodId)
      if (!error) {
        ;((data || []) as any[]).forEach((r) => {
          if (r?.id) base.add(String(r.id))
        })
        return base
      }
    }
  } catch {
    // ignore
  }

  try {
    const { data, error } = await supabase
      .from('evaluation_period_questions')
      .select('question_id')
      .eq('period_id', periodId)
      .eq('is_active', true)
    if (!error) {
      ;((data || []) as any[]).forEach((r) => {
        if (r?.question_id) base.add(String(r.question_id))
      })
    }
  } catch {
    // ignore
  }

  return base
}

export async function fetchDutyQuestionIds(supabase: SupabaseLike, periodId: string, targetId: string) {
  if (!periodId || !targetId) return new Set<string>()

  const { data: dutyRows, error: dutyErr } = await supabase
    .from('evaluation_period_user_duties')
    .select('duty_id')
    .eq('period_id', periodId)
    .eq('user_id', targetId)
    .eq('is_active', true)

  if (dutyErr) {
    if (isMissingTable(dutyErr)) return new Set<string>()
    throw dutyErr
  }

  const dutyIds = Array.from(new Set(((dutyRows || []) as any[]).map((r) => String(r.duty_id || '')).filter(Boolean)))
  if (!dutyIds.length) return new Set<string>()

  const [categoryRes, questionRes, dutiesRes] = await Promise.all([
    supabase
      .from('evaluation_period_duty_categories')
      .select('duty_id, category_id')
      .eq('period_id', periodId)
      .in('duty_id', dutyIds)
      .eq('is_active', true),
    supabase
      .from('evaluation_period_duty_questions')
      .select('duty_id, question_id')
      .eq('period_id', periodId)
      .in('duty_id', dutyIds)
      .eq('is_active', true),
    supabase.from('evaluation_duties').select('id, name, name_fr').eq('period_id', periodId).in('id', dutyIds),
  ])

  if (categoryRes.error) {
    if (isMissingTable(categoryRes.error)) return new Set<string>()
    throw categoryRes.error
  }
  if (questionRes.error) {
    if (isMissingTable(questionRes.error)) return new Set<string>()
    throw questionRes.error
  }

  const dutyNameById = new Map<string, string>()
  ;((dutiesRes.data || []) as any[]).forEach((d) => {
    if (d?.id) dutyNameById.set(String(d.id), String(d.name || d.name_fr || 'Ek görev'))
  })

  const questionIds = new Set<string>()
  const categoryIds = Array.from(
    new Set(((categoryRes.data || []) as any[]).map((r) => String(r.category_id || '')).filter(Boolean))
  )

  ;((questionRes.data || []) as any[]).forEach((r) => {
    const qid = String(r.question_id || '')
    if (qid) questionIds.add(qid)
  })

  if (categoryIds.length) {
    const { data: categoryQuestions, error: qErr } = await supabase
      .from('questions')
      .select('id')
      .in('category_id', categoryIds)
    if (qErr) throw qErr
    ;((categoryQuestions || []) as any[]).forEach((q) => {
      if (q?.id) questionIds.add(String(q.id))
    })
  }

  return questionIds
}

export async function fetchDutyScopeMetaForTarget(
  supabase: SupabaseLike,
  periodId: string,
  targetId: string
): Promise<DutyScopeMeta> {
  const [baseIds, dutyQuestionIds] = await Promise.all([
    fetchBasePeriodQuestionIds(supabase, periodId),
    fetchDutyQuestionIds(supabase, periodId, targetId),
  ])

  const dutyOnlyQuestionIds = new Set<string>()
  dutyQuestionIds.forEach((id) => {
    if (!baseIds.has(id)) dutyOnlyQuestionIds.add(id)
  })

  const questionDutyMap = new Map<string, { dutyId: string; dutyName: string }>()
  if (!dutyQuestionIds.size) {
    return { dutyQuestionIds, dutyOnlyQuestionIds, questionDutyMap }
  }

  const { data: dutyRows } = await supabase
    .from('evaluation_period_user_duties')
    .select('duty_id')
    .eq('period_id', periodId)
    .eq('user_id', targetId)
    .eq('is_active', true)
  const dutyIds = Array.from(new Set(((dutyRows || []) as any[]).map((r) => String(r.duty_id || '')).filter(Boolean)))
  if (!dutyIds.length) {
    return { dutyQuestionIds, dutyOnlyQuestionIds, questionDutyMap }
  }

  const [dutiesRes, qLinks, catLinks] = await Promise.all([
    supabase.from('evaluation_duties').select('id, name, name_fr').eq('period_id', periodId).in('id', dutyIds),
    supabase
      .from('evaluation_period_duty_questions')
      .select('duty_id, question_id')
      .eq('period_id', periodId)
      .in('duty_id', dutyIds)
      .eq('is_active', true),
    supabase
      .from('evaluation_period_duty_categories')
      .select('duty_id, category_id')
      .eq('period_id', periodId)
      .in('duty_id', dutyIds)
      .eq('is_active', true),
  ])

  const dutyNameById = new Map<string, string>()
  ;((dutiesRes.data || []) as any[]).forEach((d) => {
    if (d?.id) dutyNameById.set(String(d.id), String(d.name || d.name_fr || 'Ek görev'))
  })

  ;((qLinks.data || []) as any[]).forEach((r) => {
    const qid = String(r.question_id || '')
    const did = String(r.duty_id || '')
    if (!qid || !did) return
    questionDutyMap.set(qid, { dutyId: did, dutyName: dutyNameById.get(did) || 'Ek görev' })
  })

  const catByDuty = new Map<string, string[]>()
  ;((catLinks.data || []) as any[]).forEach((r) => {
    const did = String(r.duty_id || '')
    const cid = String(r.category_id || '')
    if (!did || !cid) return
    const cur = catByDuty.get(did) || []
    cur.push(cid)
    catByDuty.set(did, cur)
  })

  for (const [did, cids] of catByDuty) {
    if (!cids.length) continue
    const { data: qs } = await supabase.from('questions').select('id').in('category_id', cids)
    ;((qs || []) as any[]).forEach((q) => {
      const qid = String(q.id || '')
      if (!qid || questionDutyMap.has(qid)) return
      questionDutyMap.set(qid, { dutyId: did, dutyName: dutyNameById.get(did) || 'Ek görev' })
    })
  }

  return { dutyQuestionIds, dutyOnlyQuestionIds, questionDutyMap }
}

/** Hedef kullanıcı → yalnızca ek görev kapsamındaki soru id'leri */
export async function buildDutyScopeIndexForPeriod(supabase: SupabaseLike, periodId: string) {
  const index = new Map<string, Set<string>>()
  if (!periodId) return index

  const baseIds = await fetchBasePeriodQuestionIds(supabase, periodId)

  const { data: userDuties, error } = await supabase
    .from('evaluation_period_user_duties')
    .select('user_id')
    .eq('period_id', periodId)
    .eq('is_active', true)

  if (error) {
    if (isMissingTable(error)) return index
    throw error
  }

  const targetIds = Array.from(new Set(((userDuties || []) as any[]).map((r) => String(r.user_id || '')).filter(Boolean)))
  await Promise.all(
    targetIds.map(async (targetId) => {
      const dutyIds = await fetchDutyQuestionIds(supabase, periodId, targetId)
      const only = new Set<string>()
      dutyIds.forEach((id) => {
        if (!baseIds.has(id)) only.add(id)
      })
      if (only.size) index.set(targetId, only)
    })
  )

  return index
}

export function questionScopeForId(
  questionId: string,
  meta: DutyScopeMeta
): { scope: 'period' | 'duty'; dutyId: string | null } {
  const qid = String(questionId || '')
  if (meta.dutyOnlyQuestionIds.has(qid)) {
    const d = meta.questionDutyMap.get(qid)
    return { scope: 'duty', dutyId: d?.dutyId || null }
  }
  return { scope: 'period', dutyId: null }
}

export async function resolvePeriodQuestionIdsForTarget(
  supabase: SupabaseLike,
  periodId: string,
  targetId: string,
  baseQuestionIds: string[] | null
) {
  const resolved = new Set<string>((baseQuestionIds || []).map(String).filter(Boolean))
  const dutyQuestionIds = await fetchDutyQuestionIds(supabase, periodId, targetId)
  dutyQuestionIds.forEach((id) => resolved.add(id))

  if (!baseQuestionIds && resolved.size === 0) return null
  return Array.from(resolved)
}

/** Snapshot sonrası ek görev sorularını canlı tablodan yükler */
export async function loadDutyQuestionsForEvaluation(
  supabase: SupabaseLike,
  periodId: string,
  targetId: string,
  existingQuestionIds: Set<string>
) {
  const meta = await fetchDutyScopeMetaForTarget(supabase, periodId, targetId)
  const extraIds = [...meta.dutyOnlyQuestionIds].filter((id) => !existingQuestionIds.has(id))
  if (!extraIds.length) return { questions: [] as any[], meta }

  const orderCols = ['sort_order', 'order_num'] as const
  const fetchQuestions = async (mode: 'question_categories' | 'categories') => {
    const select =
      mode === 'question_categories'
        ? `*, question_categories:category_id(name, name_en, name_fr, main_categories(*))`
        : `*, categories:category_id(name, name_en, name_fr, main_categories(*))`
    let lastErr: any = null
    for (const col of orderCols) {
      const res = await supabase.from('questions').select(select).in('id', extraIds).order(col)
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

  let rows: any[] = []
  try {
    rows = await fetchQuestions('question_categories')
  } catch {
    rows = await fetchQuestions('categories')
  }

  const questions = rows.map((q) => {
    const qid = String(q.id)
    const duty = meta.questionDutyMap.get(qid)
    return {
      ...q,
      question_scope: 'duty' as const,
      duty_id: duty?.dutyId || null,
      duty_name: duty?.dutyName || 'Ek görev',
    }
  })

  return { questions, meta }
}
