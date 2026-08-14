import { userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'
import { isPgEnabled, query as pgQuery } from '@/lib/db'

/** Yalnızca verilen dönem(ler) + isteğe bağlı tek kullanıcı; diğer dönemlere dokunulmaz. */
const PAGE = 1000

/** pg sorgusunu supabase-uyumlu { data, error } şekline sarar (hata fırlatmaz). */
async function pgRes<T = Record<string, unknown>>(text: string, paramsArr?: unknown[]): Promise<{ data: T[]; error: any }> {
  try {
    const { rows } = await pgQuery<T>(text, paramsArr)
    return { data: rows, error: null }
  } catch (e) {
    return { data: [], error: e }
  }
}

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
    const { data: periods, error: pErr } = isPgEnabled()
      ? await pgRes('select id from evaluation_periods where organization_id = $1', [organizationId])
      : await supabase
          .from('evaluation_periods')
          .select('id')
          .eq('organization_id', organizationId)
    if (pErr) throw pErr
    periodIds = ((periods || []) as { id: string }[]).map((p) => String(p.id)).filter(Boolean)
    if (!periodIds.length) return []
  }

  const rows: SelfAssignmentRow[] = []

  // period filtresi BİREBİR: tek dönem → =$1; çok dönem → =any; hiçbiri → filtresiz (mevcut sözleşme).
  const buildPgPeriodWhere = (): { clause: string; params: unknown[]; nextParam: number } => {
    if (periodIds?.length === 1) return { clause: 'where a.period_id = $1', params: [periodIds[0]], nextParam: 2 }
    if (periodIds && periodIds.length > 1) return { clause: 'where a.period_id = any($1::uuid[])', params: [periodIds], nextParam: 2 }
    return { clause: '', params: [], nextParam: 1 }
  }

  const fetchPage = async (from: number): Promise<SelfAssignmentRow[]> => {
    if (isPgEnabled()) {
      // embed → JOIN (evaluator/target→users, period→evaluation_periods). Sayfalama: order by a.id + limit/offset (stabil).
      const w = buildPgPeriodWhere()
      const p = [...w.params, PAGE, from]
      const res = await pgRes<SelfAssignmentRow>(
        `select a.id, a.period_id, a.evaluator_id, a.target_id, a.status, a.matrix_context,
           case when ev.id is not null then jsonb_build_object('name', ev.name) else null end as evaluator,
           case when tg.id is not null then jsonb_build_object('name', tg.name) else null end as target,
           case when p.id is not null then jsonb_build_object('name', p.name, 'organization_id', p.organization_id) else null end as period
         from evaluation_assignments a
         left join users ev on ev.id = a.evaluator_id
         left join users tg on tg.id = a.target_id
         left join evaluation_periods p on p.id = a.period_id
         ${w.clause}
         order by a.id asc
         limit $${w.nextParam} offset $${w.nextParam + 1}`,
        p
      )
      if (res.error) throw res.error
      return res.data
    }
    let q = supabase
      .from('evaluation_assignments')
      .select(
        'id, period_id, evaluator_id, target_id, status, matrix_context, evaluator:evaluator_id(name), target:target_id(name), period:period_id(name, organization_id)'
      )
    if (periodIds?.length === 1) q = q.eq('period_id', periodIds[0])
    else if (periodIds && periodIds.length > 1) q = q.in('period_id', periodIds)
    const res = await q.range(from, from + PAGE - 1)
    if (res.error) throw res.error
    return (res.data || []) as SelfAssignmentRow[]
  }

  let from = 0
  for (;;) {
    const page = await fetchPage(from)
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
    if (isPgEnabled()) {
      // table/column çağıranlar tarafından SABİT literal olarak veriliyor (evaluation_responses/
      // international_standard_scores/evaluation_assignments + assignment_id/id) → enjeksiyon yok.
      // Silinen küme birebir aynı: WHERE <column> = any(chunk). Eksik tablo (int_standard_scores)
      // → pg 'relation ... does not exist' fırlatır, çağıran try/catch (isMissingTableError) yakalar.
      await pgQuery(`delete from ${table} where ${column} = any($1::uuid[])`, [chunk])
    } else {
      const { error } = await supabase.from(table).delete().in(column, chunk)
      if (error) throw error
    }
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
  if (isPgEnabled()) {
    const cRes = await pgRes<{ count: number }>(
      'select count(*)::int as count from evaluation_responses where assignment_id = any($1::uuid[])',
      [assignmentIds]
    )
    deletedResponses = Number(cRes.data[0]?.count || 0)
  } else {
    const { count: respCountBefore } = await supabase
      .from('evaluation_responses')
      .select('id', { count: 'exact', head: true })
      .in('assignment_id', assignmentIds)
    deletedResponses = Number(respCountBefore || 0)
  }

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
