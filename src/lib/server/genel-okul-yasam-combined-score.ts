import { normalizeMatrixContext } from '@/lib/matrix-evaluation-context'
import { roundReportScore } from '@/lib/score-format'
import { buildCategoryCompareForScope } from '@/lib/server/evaluation-response-scope'
import { buildScopeScoreSummary } from '@/lib/server/evaluation-score-metrics'

export type OkulYasamPeerSummary = {
  peerAvg: number
  peerAvgRaw: number
  peerAvgTrimmed: number
  peerAvgTrimmedRaw: number
  peerTrimEligible: boolean
  peerEvaluatorCount: number
}

/** Tam hassasiyetle ortalama; yuvarlama çağıran tarafa bırakılır. */
export function averageScoresExact(...scores: Array<number | null | undefined>): number {
  const valid = scores.filter((s) => Number.isFinite(s) && Number(s) > 0) as number[]
  if (!valid.length) return 0
  return valid.reduce((a, b) => a + b, 0) / valid.length
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

  const peerAvgRaw = peerEvals.reduce((s, e) => s + Number(e.avgScore || 0), 0) / peerEvals.length
  const peerAvg = roundReportScore(peerAvgRaw)

  const categoryCompare = buildCategoryCompareForScope(oyEvals, 'period', categoryWeightByName)
  const periodMetrics = buildScopeScoreSummary({
    evaluations: oyEvals.filter((e) => !e.isSelf),
    scope: 'period',
    categoryCompare,
    categoryWeightByName,
    assessmentKind,
    overallAvg: peerAvg,
  })

  const peerAvgTrimmedRaw = Number(periodMetrics?.peerAvgTrimmed ?? 0)
  return {
    peerAvg,
    peerAvgRaw,
    peerAvgTrimmed: roundReportScore(peerAvgTrimmedRaw),
    peerAvgTrimmedRaw,
    peerTrimEligible: periodMetrics?.peerTrimEligible === true,
    peerEvaluatorCount: peerEvals.length,
  }
}

export function computeGenelOkulYasamCombinedScores(input: {
  genelOverallAvg: number
  genelOverallAvgRaw?: number
  genelOverallAvgTrimmed: number
  genelOverallAvgTrimmedRaw?: number
  genelPeerTrimEligible: boolean
  okulYasam: OkulYasamPeerSummary | null
}) {
  const oy = input.okulYasam
  const genelRaw = Number(input.genelOverallAvgRaw ?? input.genelOverallAvg)
  const oyRaw = oy ? Number(oy.peerAvgRaw ?? oy.peerAvg) : 0

  const combinedAvg = roundReportScore(averageScoresExact(genelRaw, oyRaw > 0 ? oyRaw : null))

  const trimPartsRaw: number[] = []
  if (input.genelPeerTrimEligible) {
    const g = Number(input.genelOverallAvgTrimmedRaw ?? input.genelOverallAvgTrimmed)
    if (g > 0) trimPartsRaw.push(g)
  }
  if (oy?.peerTrimEligible) {
    const t = Number(oy.peerAvgTrimmedRaw ?? oy.peerAvgTrimmed)
    if (t > 0) trimPartsRaw.push(t)
  }
  const combinedTrimmed = trimPartsRaw.length ? roundReportScore(averageScoresExact(...trimPartsRaw)) : 0

  return {
    genelOkulYasamCombinedAvg: combinedAvg,
    genelOkulYasamCombinedTrimmed: combinedTrimmed,
    genelOkulYasamCombinedTrimEligible: trimPartsRaw.length > 0,
    okulYasamPeerAvg: oy?.peerAvg ?? 0,
    okulYasamPeerAvgTrimmed: oy?.peerAvgTrimmed ?? 0,
    okulYasamPeerTrimEligible: oy?.peerTrimEligible === true,
    hasOkulYasamEvaluation: Boolean(oy && oy.peerAvg > 0),
  }
}
