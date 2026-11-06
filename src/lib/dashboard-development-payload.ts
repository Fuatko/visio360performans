/**
 * /api/dashboard/development — dönem bilgisinin istemciye giden biçimi.
 * Route dosyası yardımcı export edemediği için burada; test: scripts/check-dashboard-development-payload.ts
 *
 * totalAsTarget / completedAsTarget "seni kaç kişi değerlendirdi" demektir; sunucuda kapılar
 * (canViewPlan, awaiting_evaluations) için kullanılır, çalışana yalnız doğru/yanlış gider.
 */
import type { DevelopmentPeriodMeta } from '@/lib/server/development-period-catalog'

export function evaluationCompleteFrom(meta: Pick<DevelopmentPeriodMeta, 'totalAsTarget' | 'completedAsTarget'>): boolean {
  return meta.totalAsTarget > 0 && meta.completedAsTarget >= meta.totalAsTarget
}

export type DevelopmentPeriodPublic = {
  id: string
  name: string
  resultsReleased: boolean
  canViewPlan: boolean
  evaluationComplete: boolean
}

/** Yanıta giden dönem satırı — alanlar tek tek yazılır, sayılar kopyalanmaz. */
export function serializeDevelopmentPeriod(p: DevelopmentPeriodMeta): DevelopmentPeriodPublic {
  return {
    id: p.id,
    name: p.name,
    resultsReleased: p.resultsReleased,
    canViewPlan: p.canViewPlan,
    evaluationComplete: evaluationCompleteFrom(p),
  }
}

export function serializeDevelopmentPeriods(periods: DevelopmentPeriodMeta[]): DevelopmentPeriodPublic[] {
  return periods.map(serializeDevelopmentPeriod)
}

export function buildMetaForPeriod(
  periodId: string,
  periodRow: any,
  assignments: Array<{ status?: string }>,
  pickPeriodName: (p: any) => string,
  isAdmin: boolean
): DevelopmentPeriodMeta | null {
  if (!periodRow) return null
  const pname = pickPeriodName(periodRow)
  if (!pname) return null
  const completedAsTarget = assignments.filter((a) => a.status === 'completed').length
  return {
    id: periodId,
    name: pname,
    resultsReleased: Boolean(periodRow.results_released ?? false),
    totalAsTarget: assignments.length,
    completedAsTarget,
    canViewPlan: completedAsTarget > 0 && (isAdmin || Boolean(periodRow.results_released)),
  }
}

/**
 * Plan üretilmeden önceki erken durum. Çalışanda dönem yayınlanmamışken "henüz değerlendirme gelmedi"
 * ile "yayınlanmadı" AYIRT EDİLMEZ (ikisi de not_released) — aksi halde yayından önce "hakkımda en az
 * bir değerlendirme geldi mi" sorusu yanıtlanır. Yayından sonra / yönetimde mevcut davranış.
 */
export function developmentEarlyPlanStatus(input: {
  isAdmin: boolean
  completedAsTarget: number
  resultsReleased: boolean
}): 'not_released' | 'awaiting_evaluations' | null {
  if (!input.isAdmin && !input.resultsReleased) return 'not_released'
  if (input.completedAsTarget === 0) return 'awaiting_evaluations'
  return null
}
