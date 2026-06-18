/** Raporlarda gösterim ve sıralama için standart ondalık hassasiyet (5'lik ölçek). */
export const REPORT_SCORE_DECIMALS = 2 as const
export const REPORT_SCORE_FACTOR = 10 ** REPORT_SCORE_DECIMALS

/** Yuvarlama: standart matematiksel (0.5 ve üzeri yukarı). */
export function roundReportScore(value: number | null | undefined): number {
  const v = Number(value ?? 0)
  if (!Number.isFinite(v)) return 0
  return Math.round(v * REPORT_SCORE_FACTOR) / REPORT_SCORE_FACTOR
}

export function formatReportScore(value: number | null | undefined, empty = '—'): string {
  const v = Number(value ?? 0)
  if (!Number.isFinite(v)) return empty
  return v.toFixed(REPORT_SCORE_DECIMALS)
}
