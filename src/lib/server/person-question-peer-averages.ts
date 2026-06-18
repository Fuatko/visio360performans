import type { EvaluatorAnswerDetailRow } from '@/lib/server/evaluator-answer-detail'
import { normalizeMatrixContext } from '@/lib/matrix-evaluation-context'

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
  /** @deprecated UI artık kategori bazında gruplar; matris alanı geriye dönük uyumluluk için */
  matrixContext: string
  matrixLabel: string
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

/** Düşük = öncelikli (genel > okul yaşam > yan görev) */
function matrixSourcePriority(matrixContext: string): number {
  const ctx = normalizeMatrixContext(matrixContext)
  if (ctx === 'genel') return 0
  if (ctx === 'okul_yasam') return 1
  return 2
}

type EvaluatorEntry = PersonQuestionEvaluatorScore & { _priority: number }

function shouldPreferEvaluatorRow(current: EvaluatorEntry | undefined, next: EvaluatorEntry): boolean {
  if (!current) return true
  const curScorable = current.score != null
  const nextScorable = next.score != null
  if (!curScorable && nextScorable) return true
  if (curScorable && !nextScorable) return false
  if (!curScorable && !nextScorable) return next._priority < current._priority
  return next._priority < current._priority
}

/**
 * Soru bazında tek satır: aynı soru farklı matrislerde (genel / okul yaşam vb.) gelse bile birleştirilir.
 * Her değerlendirici soru başına en fazla bir kez listelenir.
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
    byEvaluator: Map<string, EvaluatorEntry>
  }

  const byQuestionId = new Map<string, Acc>()

  for (const row of rows) {
    if (excludeSelf && row.isSelf) continue
    const key = row.questionId
    if (!key) continue

    let acc = byQuestionId.get(key)
    if (!acc) {
      acc = {
        questionId: row.questionId,
        questionText: row.questionText,
        questionOrder: row.questionOrder,
        categoryLabel: row.categoryLabel,
        byEvaluator: new Map(),
      }
      byQuestionId.set(key, acc)
    }

    if (row.questionOrder < acc.questionOrder || !acc.questionText) {
      acc.questionOrder = row.questionOrder
      acc.questionText = row.questionText
    }
    if (row.categoryLabel && row.categoryLabel !== '—') {
      acc.categoryLabel = row.categoryLabel
    }

    const priority = matrixSourcePriority(row.matrixContext)
    const next: EvaluatorEntry = {
      evaluatorId: row.evaluatorId,
      evaluatorName: row.evaluatorName,
      evaluatorTitle: row.evaluatorTitle,
      evaluatorLevelLabel: row.evaluatorLevelLabel,
      isSelf: row.isSelf,
      score: row.isScorable ? row.score : null,
      _priority: priority,
    }
    const cur = acc.byEvaluator.get(row.evaluatorId)
    if (shouldPreferEvaluatorRow(cur, next)) {
      acc.byEvaluator.set(row.evaluatorId, next)
    }
  }

  const out: PersonQuestionPeerAverageRow[] = []
  for (const acc of byQuestionId.values()) {
    const evaluators = [...acc.byEvaluator.values()]
      .map(({ _priority: _, ...rest }) => rest)
      .sort(sortEvaluators)
    const scores = evaluators.map((e) => e.score).filter((s): s is number => s != null)
    const noOpinionCount = evaluators.filter((e) => e.score == null).length
    out.push({
      questionId: acc.questionId,
      questionText: acc.questionText,
      questionOrder: acc.questionOrder,
      categoryLabel: acc.categoryLabel,
      matrixContext: '',
      matrixLabel: '',
      peerAvg: scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      evaluatorCount: evaluators.filter((e) => e.score != null).length,
      scorableResponseCount: scores.length,
      noOpinionCount,
      evaluators,
    })
  }

  out.sort((a, b) => {
    const c = a.categoryLabel.localeCompare(b.categoryLabel, 'tr')
    if (c) return c
    if (a.questionOrder !== b.questionOrder) return a.questionOrder - b.questionOrder
    return a.questionText.localeCompare(b.questionText, 'tr')
  })

  return out
}
