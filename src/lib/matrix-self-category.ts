import type { EvaluatorAnswerDetailRow } from '@/lib/server/evaluator-answer-detail'

export function buildSelfCategoryByKeyFromRows(rows: EvaluatorAnswerDetailRow[]): Record<string, number> {
  const acc = new Map<string, number[]>()
  for (const row of rows) {
    if (!row.isSelf || !row.isScorable) continue
    const score = Number(row.score)
    if (!Number.isFinite(score) || score <= 0) continue
    const key = row.categoryKey || row.categoryLabel || '—'
    const list = acc.get(key) || []
    list.push(score)
    acc.set(key, list)
  }
  const out: Record<string, number> = {}
  for (const [key, scores] of acc) {
    if (!scores.length) continue
    out[key] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
  }
  return out
}
