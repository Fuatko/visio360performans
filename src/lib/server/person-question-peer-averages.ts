import type { EvaluatorAnswerDetailRow } from '@/lib/server/evaluator-answer-detail'

export type PersonQuestionEvaluatorScore = {
  evaluatorId: string
  evaluatorName: string
  evaluatorTitle: string
  evaluatorLevelLabel: string
  isSelf: boolean
  /** null = fikrim yok */
  score: number | null
}

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
  evaluators: PersonQuestionEvaluatorScore[]
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function sortEvaluators(a: PersonQuestionEvaluatorScore, b: PersonQuestionEvaluatorScore) {
  if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
  return a.evaluatorName.localeCompare(b.evaluatorName, 'tr')
}

/**
 * Soru bazında tüm değerlendirenlerin puan ortalaması (öz dahil) ve değerlendirici kırılımı.
 * Aynı değerlendirici aynı soruya birden fazla yanıt verdiyse son değer kullanılır.
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
    byEvaluator: Map<string, PersonQuestionEvaluatorScore>
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
      }
      byKey.set(key, acc)
    }
    acc.byEvaluator.set(row.evaluatorId, {
      evaluatorId: row.evaluatorId,
      evaluatorName: row.evaluatorName,
      evaluatorTitle: row.evaluatorTitle,
      evaluatorLevelLabel: row.evaluatorLevelLabel,
      isSelf: row.isSelf,
      score: row.isScorable ? row.score : null,
    })
  }

  const out: PersonQuestionPeerAverageRow[] = []
  for (const acc of byKey.values()) {
    const evaluators = [...acc.byEvaluator.values()].sort(sortEvaluators)
    const scores = evaluators.map((e) => e.score).filter((s): s is number => s != null)
    const noOpinionCount = evaluators.filter((e) => e.score == null).length
    out.push({
      questionId: acc.questionId,
      questionText: acc.questionText,
      questionOrder: acc.questionOrder,
      categoryLabel: acc.categoryLabel,
      matrixContext: acc.matrixContext,
      matrixLabel: acc.matrixLabel,
      peerAvg: scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      evaluatorCount: evaluators.filter((e) => e.score != null).length,
      scorableResponseCount: scores.length,
      noOpinionCount,
      evaluators,
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
