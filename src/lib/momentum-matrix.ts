import type { PeriodComparisonPersonRow } from '@/lib/admin-department-ranking'

/**
 * Performans × İvme matrisi. Yatay eksen bu dönemki puan, dikey eksen önceki
 * döneme göre değişim. Yeni hesap yapmaz: dönem karşılaştırma raporunun
 * kişi satırlarını (PeriodComparisonPersonRow) yerleştirir.
 *
 * Eşikler YALNIZ burada tanımlıdır; uygulamanın geri kalanıyla tutarlı
 * (4.0 güçlü sınırı, 0.25 anlamlı değişim sınırı).
 */
export const MOMENTUM_PERF_HIGH = 4.0
export const MOMENTUM_PERF_MID = 3.0
export const MOMENTUM_DELTA_UP = 0.25
export const MOMENTUM_DELTA_DOWN = -0.25

// Puanlar 2 haneye yuvarlı; sınır değerin kayan nokta hatasıyla kaçmaması için.
const EPS = 1e-9

export type MomentumPerf = 'high' | 'mid' | 'low'
export type MomentumTrend = 'up' | 'flat' | 'down'

export function momentumPerfLevel(cur: number): MomentumPerf {
  if (cur >= MOMENTUM_PERF_HIGH - EPS) return 'high'
  if (cur >= MOMENTUM_PERF_MID - EPS) return 'mid'
  return 'low'
}

export function momentumTrendLevel(delta: number): MomentumTrend {
  if (delta >= MOMENTUM_DELTA_UP - EPS) return 'up'
  if (delta <= MOMENTUM_DELTA_DOWN + EPS) return 'down'
  return 'flat'
}

/** Dikkat gerektiren iki hücre: yüksek+düşüyor (erozyon) ve düşük+düşüyor (acil). */
export function isMomentumAttentionCell(perf: MomentumPerf, trend: MomentumTrend): boolean {
  return trend === 'down' && (perf === 'high' || perf === 'low')
}

export type MomentumCell = {
  perf: MomentumPerf
  trend: MomentumTrend
  attention: boolean
  /** Puana göre yüksekten düşüğe, eşitlikte ada göre. */
  people: PeriodComparisonPersonRow[]
}

export type MomentumMatrix = {
  /** 9 hücre; ızgara sırası: ivme yukarıdan aşağı (up, flat, down) × performans soldan sağa (low, mid, high). */
  cells: MomentumCell[]
  placedCount: number
  /** Önceki dönemde puanı olmadığı için matrise girmeyen kişi sayısı. */
  noPrevCount: number
}

export const MOMENTUM_TRENDS: MomentumTrend[] = ['up', 'flat', 'down']
export const MOMENTUM_PERFS: MomentumPerf[] = ['low', 'mid', 'high']

export function buildMomentumMatrix(people: PeriodComparisonPersonRow[], noPrevCount = 0): MomentumMatrix {
  const cells: MomentumCell[] = []
  for (const trend of MOMENTUM_TRENDS) {
    for (const perf of MOMENTUM_PERFS) {
      cells.push({ perf, trend, attention: isMomentumAttentionCell(perf, trend), people: [] })
    }
  }
  const cellOf = (perf: MomentumPerf, trend: MomentumTrend) => cells.find((c) => c.perf === perf && c.trend === trend)!
  for (const p of people) {
    cellOf(momentumPerfLevel(p.cur), momentumTrendLevel(p.delta)).people.push(p)
  }
  for (const c of cells) {
    c.people.sort((a, b) => b.cur - a.cur || a.name.localeCompare(b.name, 'tr'))
  }
  return { cells, placedCount: people.length, noPrevCount }
}

/** Çıktı sırası: önce dikkat gerektiren iki hücre, sonra performans yüksekten düşüğe, ivme yukarıdan aşağı. */
export function momentumExportCellOrder(matrix: MomentumMatrix): MomentumCell[] {
  const rank = (c: MomentumCell) =>
    (c.attention ? 0 : 100) +
    (c.perf === 'high' ? 0 : c.perf === 'mid' ? 10 : 20) +
    (c.trend === 'up' ? 0 : c.trend === 'flat' ? 1 : 2)
  return [...matrix.cells].sort((a, b) => rank(a) - rank(b))
}
