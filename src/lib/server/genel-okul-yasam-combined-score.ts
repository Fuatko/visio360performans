import { normalizeMatrixContext } from '@/lib/matrix-evaluation-context'
import { buildCategoryCompareForScope } from '@/lib/server/evaluation-response-scope'
import { buildScopeScoreSummary } from '@/lib/server/evaluation-score-metrics'

export type OkulYasamPeerSummary = {
  peerAvg: number
  peerAvgTrimmed: number
  peerTrimEligible: boolean
  peerEvaluatorCount: number
}

export function averageAvailableScores(...scores: Array<number | null | undefined>): number {
  const valid = scores.filter((s) => Number.isFinite(s) && Number(s) > 0) as number[]
  if (!valid.length) return 0
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100
}

/** Okul Yaşam — yalnızca ekip puanları (genel sıralamadaki okul yaşam tablosu ile aynı mantık). */
export function computeOkulYasamPeerSummary(
  evaluations: any[],
  categoryWeightByName: Record<string, number>,
  assessmentKind: string
): OkulYasamPeerSummary | null {
  const oyEvals = (evaluations || []).filter(
    (e) => normalizeMatrixContext(e?.matrixContext) === 'okul_yasam'
  )
  const peerEvals = oyEvals.filter((e) => !e.isSelf && e.hasScorableResponses)
  if (!peerEvals.length) return null

  const peerAvg =
    Math.round((peerEvals.reduce((s, e) => s + Number(e.avgScore || 0), 0) / peerEvals.length) * 100) / 100

  const categoryCompare = buildCategoryCompareForScope(oyEvals, 'period', categoryWeightByName)
  const periodMetrics = buildScopeScoreSummary({
    evaluations: oyEvals.filter((e) => !e.isSelf),
    scope: 'period',
    categoryCompare,
    categoryWeightByName,
    assessmentKind,
    overallAvg: peerAvg,
  })

  return {
    peerAvg,
    peerAvgTrimmed: periodMetrics?.peerAvgTrimmed ?? 0,
    peerTrimEligible: periodMetrics?.peerTrimEligible === true,
    peerEvaluatorCount: peerEvals.length,
  }
}

export function computeGenelOkulYasamCombinedScores(input: {
  genelOverallAvg: number
  genelOverallAvgTrimmed: number
  genelPeerTrimEligible: boolean
  okulYasam: OkulYasamPeerSummary | null
}) {
  const oy = input.okulYasam
  const combinedAvg = averageAvailableScores(input.genelOverallAvg, oy?.peerAvg)
  const trimParts: number[] = []
  if (input.genelPeerTrimEligible && input.genelOverallAvgTrimmed > 0) {
    trimParts.push(input.genelOverallAvgTrimmed)
  }
  if (oy?.peerTrimEligible && oy.peerAvgTrimmed > 0) {
    trimParts.push(oy.peerAvgTrimmed)
  }
  const combinedTrimmed = trimParts.length ? averageAvailableScores(...trimParts) : 0

  return {
    genelOkulYasamCombinedAvg: combinedAvg,
    genelOkulYasamCombinedTrimmed: combinedTrimmed,
    genelOkulYasamCombinedTrimEligible: trimParts.length > 0,
    okulYasamPeerAvg: oy?.peerAvg ?? 0,
    okulYasamPeerAvgTrimmed: oy?.peerAvgTrimmed ?? 0,
    okulYasamPeerTrimEligible: oy?.peerTrimEligible === true,
    hasOkulYasamEvaluation: Boolean(oy && oy.peerAvg > 0),
  }
}
