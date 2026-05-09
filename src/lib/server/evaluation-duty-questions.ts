type SupabaseLike = {
  from: (table: string) => any
}

function isMissingTable(error: any) {
  const code = String(error?.code || '')
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')
}

async function fetchDutyQuestionIds(supabase: SupabaseLike, periodId: string, targetId: string) {
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

  const [categoryRes, questionRes] = await Promise.all([
    supabase
      .from('evaluation_period_duty_categories')
      .select('category_id')
      .eq('period_id', periodId)
      .in('duty_id', dutyIds)
      .eq('is_active', true),
    supabase
      .from('evaluation_period_duty_questions')
      .select('question_id')
      .eq('period_id', periodId)
      .in('duty_id', dutyIds)
      .eq('is_active', true),
  ])

  if (categoryRes.error) {
    if (isMissingTable(categoryRes.error)) return new Set<string>()
    throw categoryRes.error
  }
  if (questionRes.error) {
    if (isMissingTable(questionRes.error)) return new Set<string>()
    throw questionRes.error
  }

  const questionIds = new Set<string>(
    ((questionRes.data || []) as any[]).map((r) => String(r.question_id || '')).filter(Boolean)
  )
  const categoryIds = Array.from(
    new Set(((categoryRes.data || []) as any[]).map((r) => String(r.category_id || '')).filter(Boolean))
  )

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
