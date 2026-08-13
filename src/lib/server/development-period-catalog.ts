import type { SupabaseClient } from '@supabase/supabase-js'
import { isPersonalDevelopmentPeriod } from '@/lib/evaluation-period-kind'
import { isPgEnabled, query as pgQuery } from '@/lib/db'

export type DevelopmentPeriodMeta = {
  id: string
  name: string
  resultsReleased: boolean
  totalAsTarget: number
  completedAsTarget: number
  canViewPlan: boolean
}

type TargetAssignmentRow = {
  id?: string
  status?: string
  period_id?: string
  evaluation_periods?: {
    id?: string
    name?: string
    name_en?: string | null
    name_fr?: string | null
    results_released?: boolean
    assessment_kind?: string | null
  } | null
}

export async function buildDevelopmentPeriodCatalog(params: {
  supabase: SupabaseClient
  targetAssignments: TargetAssignmentRow[]
  pickPeriodName: (p: any) => string
  isAdmin: boolean
}) {
  const { supabase, targetAssignments, pickPeriodName, isAdmin } = params
  const rawTargetCount = targetAssignments.length

  const periodIds = [
    ...new Set(
      targetAssignments
        .map((a) => String(a.period_id || a.evaluation_periods?.id || '').trim())
        .filter(Boolean)
    ),
  ]

  const periodById = new Map<string, any>()
  if (periodIds.length) {
    // pg yolu: aynı select, = any(...) ile. Deploy-güvenli: env yok → Supabase (verilen client).
    if (isPgEnabled()) {
      const r = await pgQuery<any>(
        'select id, name, name_en, name_fr, results_released, assessment_kind from evaluation_periods where id = any($1::uuid[])',
        [periodIds]
      )
      r.rows.forEach((p: any) => {
        if (p?.id) periodById.set(String(p.id), p)
      })
    } else {
      const { data: periodRows, error } = await supabase
        .from('evaluation_periods')
        .select('id, name, name_en, name_fr, results_released, assessment_kind')
        .in('id', periodIds)
      if (error) throw error
      ;(periodRows || []).forEach((p: any) => {
        if (p?.id) periodById.set(String(p.id), p)
      })
    }
  }

  const periodMetaMap = new Map<string, DevelopmentPeriodMeta>()
  let devTargetCount = 0

  targetAssignments.forEach((a) => {
    const pid = String(a.period_id || a.evaluation_periods?.id || '').trim()
    if (!pid) return
    const period = periodById.get(pid) || a.evaluation_periods
    if (!period) return
    if (!isPersonalDevelopmentPeriod(period.assessment_kind)) return
    devTargetCount += 1

    const pname = pickPeriodName(period)
    if (!pname) return
    const released = Boolean(period.results_released ?? false)
    const cur =
      periodMetaMap.get(pid) ||
      ({
        id: pid,
        name: pname,
        resultsReleased: released,
        totalAsTarget: 0,
        completedAsTarget: 0,
        canViewPlan: false,
      } satisfies DevelopmentPeriodMeta)
    cur.totalAsTarget += 1
    if (a.status === 'completed') cur.completedAsTarget += 1
    periodMetaMap.set(pid, cur)
  })

  const periods = Array.from(periodMetaMap.values())
    .map((p) => ({
      ...p,
      canViewPlan: p.completedAsTarget > 0 && (isAdmin || p.resultsReleased),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  return { periods, periodById, rawTargetCount, devTargetCount }
}
