import type { MatrixStructureCategoryScore } from '@/lib/server/matrix-structure-scoring'

export type MatrixKarneSwotItem = { name: string; score: number }

export type MatrixKarneSwot = {
  strengths: MatrixKarneSwotItem[]
  weaknesses: MatrixKarneSwotItem[]
  opportunities: MatrixKarneSwotItem[]
  threats: MatrixKarneSwotItem[]
}

export function buildMatrixKarneSwot(categories: MatrixStructureCategoryScore[]): MatrixKarneSwot {
  const scored = categories
    .filter((c) => Number(c.peerAvg) > 0)
    .map((c) => ({ name: c.categoryLabel, score: c.peerAvg }))
    .sort((a, b) => b.score - a.score)

  const strengths = scored.filter((c) => c.score >= 4).slice(0, 5)
  const weaknesses = scored.filter((c) => c.score > 0 && c.score < 3.5).slice(-5).reverse()
  const opportunities = scored.filter((c) => c.score >= 3.5 && c.score < 4).slice(0, 5)
  const threats = scored.filter((c) => c.score > 0 && c.score < 3).slice(-3).reverse()

  return { strengths, weaknesses, opportunities, threats }
}

export function matrixKarneCategoryChartRows(
  categories: MatrixStructureCategoryScore[],
  selfByKey?: Map<string, number>
) {
  return categories
    .filter((c) => c.peerAvg > 0 || (selfByKey?.get(c.categoryKey) || 0) > 0)
    .map((c) => ({
      name: c.categoryLabel,
      self: selfByKey?.get(c.categoryKey) || 0,
      peer: c.peerAvg || 0,
    }))
}
