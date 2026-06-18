import type { EvaluatorAnswerDetailRow } from '@/lib/server/evaluator-answer-detail'

export type PersonQuestionPeerAverageRow = {
  questionId: string
  questionText: string
  questionOrder: number
  categoryLabel: string
  matrixContext: string
  matrixLabel: string
  /** Tüm değerlendirenlerin basit aritmetik ortalaması (fikrim yok hariç) */
  peerAvg: number | null
  evaluatorCount: number
  scorableResponseCount: number
  noOpinionCount: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/**
 * Soru bazında tüm değerlendirenlerin puan ortalaması (öz dahil).
 * Aynı değerlendirici aynı soruya birden fazla yanıt verdiyse tek puan sayılır (son değer).
 */
export function aggregatePersonQuestionPeerAverages(
  rows: EvaluatorAnswerDetailRow[],
  opts?: { excludeSelf?: boolean }
): PersonQuestionPeerAverageRow[] {
  const excludeSelf = opts?.excludeSelf === true
  type Acc = {
    questionId: string
    questionText: string
    questionOrder: number
    categoryLabel: string
    matrixContext: string
    matrixLabel: string
    byEvaluator: Map<string, number>
    noOpinionEvaluators: Set<string>
  }

  const byKey = new Map<string, Acc>()

  for (const row of rows) {
    if (excludeSelf && row.isSelf) continue
    const key = `${row.matrixContext}::${row.questionId}`
    let acc = byKey.get(key)
    if (!acc) {
      acc = {
        questionId: row.questionId,
        questionText: row.questionText,
        questionOrder: row.questionOrder,
        categoryLabel: row.categoryLabel,
        matrixContext: row.matrixContext,
        matrixLabel: row.matrixLabel,
        byEvaluator: new Map(),
        noOpinionEvaluators: new Set(),
      }
      byKey.set(key, acc)
    }
    if (row.isScorable) {
      acc.byEvaluator.set(row.evaluatorId, row.score)
      acc.noOpinionEvaluators.delete(row.evaluatorId)
    } else if (!acc.byEvaluator.has(row.evaluatorId)) {
      acc.noOpinionEvaluators.add(row.evaluatorId)
    }
  }

  const out: PersonQuestionPeerAverageRow[] = []
  for (const acc of byKey.values()) {
    const scores = [...acc.byEvaluator.values()]
    out.push({
      questionId: acc.questionId,
      questionText: acc.questionText,
      questionOrder: acc.questionOrder,
      categoryLabel: acc.categoryLabel,
      matrixContext: acc.matrixContext,
      matrixLabel: acc.matrixLabel,
      peerAvg: scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      evaluatorCount: acc.byEvaluator.size,
      scorableResponseCount: scores.length,
      noOpinionCount: acc.noOpinionEvaluators.size,
    })
  }

  out.sort((a, b) => {
    const m = a.matrixLabel.localeCompare(b.matrixLabel, 'tr')
    if (m) return m
    if (a.questionOrder !== b.questionOrder) return a.questionOrder - b.questionOrder
    return a.questionText.localeCompare(b.questionText, 'tr')
  })

  return out
}
