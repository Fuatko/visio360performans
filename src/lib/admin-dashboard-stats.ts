import { matrixEvaluationContextLabel, normalizeMatrixContext } from '@/lib/matrix-evaluation-context'

export type AdminAssignmentRow = {
  id: string
  status?: string | null
  period_id?: string | null
  evaluator_id?: string | null
  target_id?: string | null
  matrix_context?: string | null
  completed_at?: string | null
  evaluator?: { name?: string | null; department?: string | null } | null
  target?: { name?: string | null; department?: string | null } | null
  evaluation_periods?: {
    name?: string | null
    name_en?: string | null
    name_fr?: string | null
    status?: string | null
  } | null
}

export type MatrixBreakdownRow = {
  matrix_context: string
  label: string
  total: number
  completed: number
  pending: number
}

export type EvaluatorDashboardSummary = {
  evaluator_id: string
  name: string
  department: string | null
  will_evaluate_total: number
  will_evaluate_completed: number
  will_evaluate_pending: number
  by_matrix: MatrixBreakdownRow[]
  will_be_evaluated_total: number
  will_be_evaluated_completed: number
  will_be_evaluated_pending: number
}

export type PeriodDashboardRow = {
  period_id: string
  name: string
  name_en: string | null
  name_fr: string | null
  period_status: string | null
  assignments: number
  completed: number
  pending: number
  unique_evaluators: number
  unique_targets: number
  by_matrix: MatrixBreakdownRow[]
}

export type AdminDashboardStats = {
  organizations: number
  users: number
  periods: number
  assignments: number
  completed: number
  pending: number
  unique_evaluators: number
  unique_targets: number
  completion_rate: number
  by_matrix: MatrixBreakdownRow[]
}

function isCompleted(a: AdminAssignmentRow) {
  return String(a.status || '') === 'completed'
}

function isPendingActive(a: AdminAssignmentRow) {
  return String(a.status || '') === 'pending' && a.evaluation_periods?.status === 'active'
}

export function buildMatrixBreakdown(rows: AdminAssignmentRow[]): MatrixBreakdownRow[] {
  const map = new Map<string, MatrixBreakdownRow>()
  for (const a of rows) {
    const ctx = normalizeMatrixContext(a.matrix_context)
    const cur = map.get(ctx) || {
      matrix_context: ctx,
      label: matrixEvaluationContextLabel(ctx),
      total: 0,
      completed: 0,
      pending: 0,
    }
    cur.total += 1
    if (isCompleted(a)) cur.completed += 1
    else if (isPendingActive(a)) cur.pending += 1
    map.set(ctx, cur)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function buildEvaluatorSummaries(rows: AdminAssignmentRow[]): EvaluatorDashboardSummary[] {
  const byEval = new Map<string, EvaluatorDashboardSummary>()
  const asTarget = new Map<string, AdminAssignmentRow[]>()

  for (const a of rows) {
    const eid = String(a.evaluator_id || '')
    const tid = String(a.target_id || '')
    if (!eid) continue

    if (!byEval.has(eid)) {
      byEval.set(eid, {
        evaluator_id: eid,
        name: String(a.evaluator?.name || eid),
        department: a.evaluator?.department ? String(a.evaluator.department) : null,
        will_evaluate_total: 0,
        will_evaluate_completed: 0,
        will_evaluate_pending: 0,
        by_matrix: [],
        will_be_evaluated_total: 0,
        will_be_evaluated_completed: 0,
        will_be_evaluated_pending: 0,
      })
    }
    const ev = byEval.get(eid)!
    ev.will_evaluate_total += 1
    if (isCompleted(a)) ev.will_evaluate_completed += 1
    else if (isPendingActive(a)) ev.will_evaluate_pending += 1

    if (tid) {
      const list = asTarget.get(tid) || []
      list.push(a)
      asTarget.set(tid, list)
    }
  }

  for (const [eid, ev] of byEval) {
    const mine = rows.filter((r) => String(r.evaluator_id) === eid)
    ev.by_matrix = buildMatrixBreakdown(mine)
    const incoming = asTarget.get(eid) || []
    ev.will_be_evaluated_total = incoming.length
    ev.will_be_evaluated_completed = incoming.filter(isCompleted).length
    ev.will_be_evaluated_pending = incoming.filter(isPendingActive).length
  }

  return [...byEval.values()].sort((a, b) => {
    if (b.will_evaluate_pending !== a.will_evaluate_pending) return b.will_evaluate_pending - a.will_evaluate_pending
    return a.name.localeCompare(b.name, 'tr')
  })
}

export function buildPeriodSummaries(rows: AdminAssignmentRow[]): PeriodDashboardRow[] {
  const map = new Map<string, PeriodDashboardRow>()

  for (const a of rows) {
    const pid = String(a.period_id || '')
    if (!pid) continue
    if (!map.has(pid)) {
      map.set(pid, {
        period_id: pid,
        name: String(a.evaluation_periods?.name || ''),
        name_en: a.evaluation_periods?.name_en ?? null,
        name_fr: a.evaluation_periods?.name_fr ?? null,
        period_status: a.evaluation_periods?.status ?? null,
        assignments: 0,
        completed: 0,
        pending: 0,
        unique_evaluators: 0,
        unique_targets: 0,
        by_matrix: [],
      })
    }
    const row = map.get(pid)!
    row.assignments += 1
    if (isCompleted(a)) row.completed += 1
    else if (isPendingActive(a)) row.pending += 1
  }

  for (const row of map.values()) {
    const periodRows = rows.filter((r) => String(r.period_id) === row.period_id)
    row.by_matrix = buildMatrixBreakdown(periodRows)
    row.unique_evaluators = new Set(periodRows.map((r) => String(r.evaluator_id || '')).filter(Boolean)).size
    row.unique_targets = new Set(periodRows.map((r) => String(r.target_id || '')).filter(Boolean)).size
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

export function buildAdminDashboardStats(
  rows: AdminAssignmentRow[],
  meta: { organizations: number; users: number; periods: number }
): AdminDashboardStats {
  const completed = rows.filter(isCompleted).length
  const pending = rows.filter(isPendingActive).length
  const total = rows.length
  return {
    organizations: meta.organizations,
    users: meta.users,
    periods: meta.periods,
    assignments: total,
    completed,
    pending,
    unique_evaluators: new Set(rows.map((r) => String(r.evaluator_id || '')).filter(Boolean)).size,
    unique_targets: new Set(rows.map((r) => String(r.target_id || '')).filter(Boolean)).size,
    completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    by_matrix: buildMatrixBreakdown(rows),
  }
}
