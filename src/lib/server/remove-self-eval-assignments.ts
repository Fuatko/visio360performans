import { userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'

/** Yalnızca verilen dönem(ler) + isteğe bağlı tek kullanıcı; diğer dönemlere dokunulmaz. */
const PAGE = 1000

export type SelfAssignmentRow = {
  id: string
  period_id: string
  evaluator_id: string
  target_id: string
  status: string | null
  matrix_context?: string | null
  evaluator?: { name?: string | null } | null
  target?: { name?: string | null } | null
  period?: { name?: string | null; organization_id?: string | null } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowMatchesUser(row: SelfAssignmentRow, userId: string): boolean {
  return (
    userIdsEqualForSelfEval(row.evaluator_id, userId) || userIdsEqualForSelfEval(row.target_id, userId)
  )
}

export async function fetchSelfEvaluationAssignments(
  supabase: any,
  opts: { periodId?: string; organizationId?: string; userId?: string }
): Promise<SelfAssignmentRow[]> {
  const periodId = opts.periodId?.trim()
  const organizationId = opts.organizationId?.trim()
  const userId = opts.userId?.trim()

  let periodIds: string[] | null = null
  if (periodId) {
    periodIds = [periodId]
  } else if (organizationId) {
    const { data: periods, error: pErr } = await supabase
      .from('evaluation_periods')
      .select('id')
      .eq('organization_id', organizationId)
    if (pErr) throw pErr
    periodIds = ((periods || []) as { id: string }[]).map((p) => String(p.id)).filter(Boolean)
    if (!periodIds.length) return []
  }

  const rows: SelfAssignmentRow[] = []
  const queryBase = () => {
    let q = supabase
      .from('evaluation_assignments')
      .select(
        'id, period_id, evaluator_id, target_id, status, matrix_context, evaluator:evaluator_id(name), target:target_id(name), period:period_id(name, organization_id)'
      )
    if (periodIds?.length === 1) q = q.eq('period_id', periodIds[0])
    else if (periodIds && periodIds.length > 1) q = q.in('period_id', periodIds)
    return q
  }

  let from = 0
  for (;;) {
    const res = await queryBase().range(from, from + PAGE - 1)
    if (res.error) throw res.error
    const page = (res.data || []) as SelfAssignmentRow[]
    for (const row of page) {
      if (!userIdsEqualForSelfEval(row.evaluator_id, row.target_id)) continue
      if (userId && !rowMatchesUser(row, userId)) continue
      rows.push(row)
    }
    if (page.length < PAGE) break
    from += PAGE
  }
  return rows
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteInChunks(supabase: any, table: string, column: string, ids: string[]) {
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { error } = await supabase.from(table).delete().in(column, chunk)
    if (error) throw error
  }
}

function isMissingTableError(message: string) {
  return /does not exist|relation .* does not exist/i.test(message)
}

export type RemoveSelfAssignmentsResult = {
  found: number
  deleted: number
  deleted_responses: number
  items: Array<{
    id: string
    period_id: string
    period_name: string | null
    evaluator_name: string | null
    status: string | null
    matrix_context: string | null
  }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function removeSelfEvaluationAssignments(
  supabase: any,
  opts: { periodId?: string; organizationId?: string; userId?: string }
): Promise<RemoveSelfAssignmentsResult> {
  const selfRows = await fetchSelfEvaluationAssignments(supabase, opts)
  const assignmentIds = selfRows.map((r) => String(r.id)).filter(Boolean)

  if (!assignmentIds.length) {
    return { found: 0, deleted: 0, deleted_responses: 0, items: [] }
  }

  let deletedResponses = 0
  const { count: respCountBefore } = await supabase
    .from('evaluation_responses')
    .select('id', { count: 'exact', head: true })
    .in('assignment_id', assignmentIds)
  deletedResponses = Number(respCountBefore || 0)

  await deleteInChunks(supabase, 'evaluation_responses', 'assignment_id', assignmentIds)
  try {
    await deleteInChunks(supabase, 'international_standard_scores', 'assignment_id', assignmentIds)
  } catch (scoreErr: unknown) {
    const msg = scoreErr instanceof Error ? scoreErr.message : String(scoreErr)
    if (!isMissingTableError(msg)) throw scoreErr
  }

  await deleteInChunks(supabase, 'evaluation_assignments', 'id', assignmentIds)

  const items = selfRows.map((r) => ({
    id: String(r.id),
    period_id: String(r.period_id),
    period_name: (r.period as { name?: string } | null)?.name ?? null,
    evaluator_name: (r.evaluator as { name?: string } | null)?.name ?? null,
    status: r.status ?? null,
    matrix_context: r.matrix_context ? String(r.matrix_context) : null,
  }))

  return {
    found: selfRows.length,
    deleted: assignmentIds.length,
    deleted_responses: deletedResponses,
    items,
  }
}
