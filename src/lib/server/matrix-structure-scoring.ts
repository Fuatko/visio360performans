import { isCoreGeneralReportMatrixContext } from '@/lib/matrix-evaluation-context'
import { coreMatrixResponsePriority } from '@/lib/server/core-general-report-merge'
import type { EvaluatorAnswerDetailRow } from '@/lib/server/evaluator-answer-detail'

export type MatrixStructureQuestionScorer = {
  evaluatorId: string
  evaluatorName: string
  score: number
  matrixContext: string
}

export type MatrixStructureQuestionScore = {
  questionId: string
  questionText: string
  questionOrder: number
  categoryKey: string
  categoryLabel: string
  peerAvg: number
  peerAvgExact: number
  scoreSum: number
  scorerCount: number
  scorers: MatrixStructureQuestionScorer[]
}

export type MatrixStructureCategoryScore = {
  categoryKey: string
  categoryLabel: string
  peerAvg: number
  questionCount: number
  answeredQuestionCount: number
}

export type MatrixStructurePersonScore = {
  targetId: string
  targetName: string
  targetDept: string
  overallPeerAvg: number
  overallPeerAvgExact: number
  questionAvgSum: number
  answeredQuestionCount: number
  categories: MatrixStructureCategoryScore[]
  questions: MatrixStructureQuestionScore[]
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function meanExact(nums: number[]) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function meanPositive(nums: number[]) {
  if (!nums.length) return 0
  return round2(meanExact(nums))
}

type QuestionAcc = {
  questionId: string
  questionText: string
  questionOrder: number
  categoryKey: string
  categoryLabel: string
  byEvaluator: Map<
    string,
    { score: number; priority: number; evaluatorName: string; matrixContext: string }
  >
}

function shouldReplaceEvaluatorScore(
  current: { score: number; priority: number } | undefined,
  next: { score: number; priority: number }
) {
  if (!current) return true
  if (next.priority < current.priority) return true
  if (next.priority > current.priority) return false
  return next.score > current.score
}

/** Matris yapı (genel+okul yaşam birleşik): yalnızca ekip, puanlı (1–5) yanıtlar. */
export function filterMatrixStructureScoringRows(rows: EvaluatorAnswerDetailRow[]) {
  return rows.filter(
    (r) =>
      !r.isSelf &&
      isCoreGeneralReportMatrixContext(r.matrixContext) &&
      r.isScorable &&
      Number(r.score) > 0
  )
}

export function computeMatrixStructureScoresForTarget(
  rows: EvaluatorAnswerDetailRow[],
  targetMeta?: { targetName?: string; targetDept?: string }
): MatrixStructurePersonScore | null {
  const filtered = filterMatrixStructureScoringRows(rows)
  if (!filtered.length) return null

  const targetId = filtered[0].targetId
  const byQuestion = new Map<string, QuestionAcc>()

  for (const row of filtered) {
    const qid = row.questionId
    if (!qid) continue
    let acc = byQuestion.get(qid)
    if (!acc) {
      acc = {
        questionId: qid,
        questionText: row.questionText,
        questionOrder: row.questionOrder,
        categoryKey: row.categoryKey || row.categoryLabel || '—',
        categoryLabel: row.categoryLabel || row.categoryKey || '—',
        byEvaluator: new Map(),
      }
      byQuestion.set(qid, acc)
    }
    if (row.questionOrder < acc.questionOrder || !acc.questionText) {
      acc.questionOrder = row.questionOrder
      acc.questionText = row.questionText
    }
    if (row.categoryLabel && row.categoryLabel !== '—') {
      acc.categoryLabel = row.categoryLabel
      acc.categoryKey = row.categoryKey || row.categoryLabel
    }

    const priority = coreMatrixResponsePriority(row.matrixContext)
    const next = {
      score: Number(row.score),
      priority,
      evaluatorName: row.evaluatorName || '-',
      matrixContext: row.matrixContext || 'genel',
    }
    const cur = acc.byEvaluator.get(row.evaluatorId)
    if (shouldReplaceEvaluatorScore(cur, next)) {
      acc.byEvaluator.set(row.evaluatorId, next)
    }
  }

  const questions: MatrixStructureQuestionScore[] = []
  const byCategory = new Map<string, { label: string; questionAvgs: number[] }>()

  for (const acc of byQuestion.values()) {
    const scorerEntries = [...acc.byEvaluator.entries()]
    const scores = scorerEntries.map(([, e]) => e.score)
    if (!scores.length) continue
    const peerAvgExact = meanExact(scores)
    const peerAvg = round2(peerAvgExact)
    const scorers: MatrixStructureQuestionScorer[] = scorerEntries
      .map(([evaluatorId, e]) => ({
        evaluatorId,
        evaluatorName: e.evaluatorName,
        score: e.score,
        matrixContext: e.matrixContext,
      }))
      .sort((a, b) => a.evaluatorName.localeCompare(b.evaluatorName, 'tr'))
    questions.push({
      questionId: acc.questionId,
      questionText: acc.questionText,
      questionOrder: acc.questionOrder,
      categoryKey: acc.categoryKey,
      categoryLabel: acc.categoryLabel,
      peerAvg,
      peerAvgExact,
      scoreSum: scores.reduce((a, b) => a + b, 0),
      scorerCount: scores.length,
      scorers,
    })
    const catKey = acc.categoryKey || acc.categoryLabel
    const cur = byCategory.get(catKey) || { label: acc.categoryLabel, questionAvgs: [] }
    cur.questionAvgs.push(peerAvg)
    byCategory.set(catKey, cur)
  }

  questions.sort((a, b) => {
    const c = a.categoryLabel.localeCompare(b.categoryLabel, 'tr')
    if (c) return c
    if (a.questionOrder !== b.questionOrder) return a.questionOrder - b.questionOrder
    return a.questionText.localeCompare(b.questionText, 'tr')
  })

  const categories: MatrixStructureCategoryScore[] = [...byCategory.entries()]
    .map(([categoryKey, v]) => ({
      categoryKey,
      categoryLabel: v.label,
      peerAvg: meanPositive(v.questionAvgs),
      questionCount: v.questionAvgs.length,
      answeredQuestionCount: v.questionAvgs.length,
    }))
    .sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel, 'tr'))

  const questionAvgSum = questions.reduce((a, q) => a + q.peerAvgExact, 0)
  const overallPeerAvgExact = questions.length ? questionAvgSum / questions.length : 0
  const overallPeerAvg = round2(overallPeerAvgExact)

  return {
    targetId,
    targetName: targetMeta?.targetName || filtered[0].targetName,
    targetDept: targetMeta?.targetDept || filtered[0].targetDept,
    overallPeerAvg,
    overallPeerAvgExact,
    questionAvgSum,
    answeredQuestionCount: questions.length,
    categories,
    questions,
  }
}

export function computeMatrixStructureScoresByTarget(rows: EvaluatorAnswerDetailRow[]): MatrixStructurePersonScore[] {
  const byTarget = new Map<string, EvaluatorAnswerDetailRow[]>()
  for (const row of rows) {
    const tid = row.targetId
    if (!tid) continue
    const list = byTarget.get(tid) || []
    list.push(row)
    byTarget.set(tid, list)
  }

  const out: MatrixStructurePersonScore[] = []
  for (const [, targetRows] of byTarget) {
    const score = computeMatrixStructureScoresForTarget(targetRows)
    if (score && score.answeredQuestionCount > 0) out.push(score)
  }

  out.sort((a, b) => {
    if (b.overallPeerAvg !== a.overallPeerAvg) return b.overallPeerAvg - a.overallPeerAvg
    return a.targetName.localeCompare(b.targetName, 'tr')
  })

  return out
}
