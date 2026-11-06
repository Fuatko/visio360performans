/**
 * /api/dashboard/summary — by_period satırının istemciye giden biçimi.
 * Route dosyası yardımcı export edemediği için burada; test: scripts/check-dashboard-summary-payload.ts
 *
 * İZİN LİSTESİ: yalnız aşağıda adı geçen alanlar tek tek yazılır; kaynak nesne kopyalanmaz.
 * about_me_completed / target_total / target_completed "seni kaç kişi değerlendirdi" demektir;
 * sunucuda kalır, dışarı yalnız doğru/yanlış çıkar. pending / completed çalışanın KENDİ görev
 * sayacıdır (ana pano dönem seçimi buna bağlı) — kalır.
 */
import type { DashboardPeriodSummary } from '@/lib/dashboard-evaluations-filter'

export type DashboardPeriodSummaryPublic = {
  period_id: string
  name: string
  name_en: string | null
  name_fr: string | null
  period_status: string | null
  pending: number
  completed: number
  hasAboutMe: boolean
  hasTargetAssignments: boolean
}

export function serializeDashboardPeriodSummary(row: DashboardPeriodSummary): DashboardPeriodSummaryPublic {
  return {
    period_id: row.period_id,
    name: row.name,
    name_en: row.name_en,
    name_fr: row.name_fr,
    period_status: row.period_status,
    pending: row.pending,
    completed: row.completed,
    hasAboutMe: (row.about_me_completed ?? 0) > 0,
    hasTargetAssignments: (row.target_total ?? 0) > 0,
  }
}

export function serializeDashboardPeriodSummaries(rows: DashboardPeriodSummary[]): DashboardPeriodSummaryPublic[] {
  return rows.map(serializeDashboardPeriodSummary)
}
