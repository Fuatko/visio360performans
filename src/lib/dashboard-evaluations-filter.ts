import { isCategoryMatrixContext, normalizeMatrixContext } from '@/lib/matrix-evaluation-context'

/** Değerlendiren listesi: kategori matrisi varken «genel» satırlarını gizle (evaluations API ile aynı). */
export function filterEvaluatorAssignmentsForDashboard<
  T extends { period_id?: string; matrix_context?: string | null },
>(raw: T[]): T[] {
  const byPeriod = new Map<string, T[]>()
  for (const row of raw) {
    const pid = String(row.period_id || '')
    if (!byPeriod.has(pid)) byPeriod.set(pid, [])
    byPeriod.get(pid)!.push(row)
  }
  const out: T[] = []
  for (const list of byPeriod.values()) {
    const hasCategoryMatrix = list.some((a) => isCategoryMatrixContext(a.matrix_context))
    if (hasCategoryMatrix) {
      out.push(...list.filter((a) => normalizeMatrixContext(a.matrix_context) !== 'genel'))
    } else {
      out.push(...list)
    }
  }
  return out
}

export type DashboardPeriodSummary = {
  period_id: string
  name: string
  name_en: string | null
  name_fr: string | null
  period_status: string | null
  pending: number
  completed: number
  about_me_completed: number
}

export function buildDashboardPeriodSummaries(
  assignments: Array<{
    period_id?: string
    status?: string
    evaluation_periods?: {
      name?: string | null
      name_en?: string | null
      name_fr?: string | null
      status?: string | null
    } | null
  }>,
  aboutMe: Array<{ period_id?: string }>
): DashboardPeriodSummary[] {
  const map = new Map<string, DashboardPeriodSummary>()

  const ensure = (periodId: string, ep: (typeof assignments)[0]['evaluation_periods']) => {
    if (!map.has(periodId)) {
      map.set(periodId, {
        period_id: periodId,
        name: String(ep?.name || ''),
        name_en: ep?.name_en ?? null,
        name_fr: ep?.name_fr ?? null,
        period_status: ep?.status ?? null,
        pending: 0,
        completed: 0,
        about_me_completed: 0,
      })
    }
    return map.get(periodId)!
  }

  for (const a of assignments) {
    const pid = String(a.period_id || '')
    if (!pid) continue
    const row = ensure(pid, a.evaluation_periods)
    if (a.status === 'completed') row.completed += 1
    else if (a.status === 'pending' && a.evaluation_periods?.status === 'active') row.pending += 1
  }

  for (const a of aboutMe) {
    const pid = String(a.period_id || '')
    if (!pid) continue
    const row = ensure(pid, (a as { evaluation_periods?: (typeof assignments)[0]['evaluation_periods'] }).evaluation_periods)
    row.about_me_completed += 1
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}
