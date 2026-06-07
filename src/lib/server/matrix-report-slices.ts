import { normalizeMatrixContext, matrixEvaluationContextLabel, isDutyMatrixContext } from '@/lib/matrix-evaluation-context'
import { userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'
import {
  buildCategoryCompareForScope,
  finalizeTargetScopeAverages,
  type AssignmentScoreBundle,
} from '@/lib/server/evaluation-response-scope'
import { buildScopeScoreSummary } from '@/lib/server/evaluation-score-metrics'

export type MatrixReportSlice = {
  periodId: string
  periodName: string
  periodNameEn?: string | null
  periodNameFr?: string | null
  startDate?: string | null
  endDate?: string | null
  assessmentKind: string
  assessmentLabel: string
  matrixContext: string
  matrixLabel: string
  isDutyMatrix: boolean
  overallAvg: number
  peerAvg: number
  peerAvgTrimmed: number
  overallAvgTrimmed: number
  score100: number | null
  score100Trimmed: number | null
  evaluatorCount: number
  peerEvaluatorCount: number
  peerTrimEligible?: boolean
  hasSelfEvaluation: boolean
  standardAvg: number
  standardCount: number
  categoryCompare: Array<{ name: string; self: number; peer: number; diff: number; weight: number; peerTrimmed: number }>
  swot: {
    peer: {
      strengths: Array<{ name: string; score: number }>
      weaknesses: Array<{ name: string; score: number }>
    }
  }
  aiSummary: string
}

export type MatrixReportPeriodGroup = {
  periodId: string
  periodName: string
  startDate?: string | null
  endDate?: string | null
  assessmentKind: string
  assessmentLabel: string
  slices: MatrixReportSlice[]
}

function buildBundleFromResponses(
  responses: any[],
  categoryByQuestionId: Map<string, { key: string; label: string }>,
  categoryById: Map<string, { key: string; label: string }>
): AssignmentScoreBundle {
  const numericScore = (r: any) => {
    const n = Number(r?.reel_score ?? r?.std_score ?? r?.score ?? 0)
    return Number.isFinite(n) ? n : 0
  }
  const scorable = responses.filter((r) => numericScore(r) > 0)
  const sumResp = scorable.reduce((sum, r) => sum + numericScore(r), 0)
  const denomResp = scorable.length
  const avgScore = denomResp ? Math.round((sumResp / denomResp) * 10) / 10 : 0

  const catAgg: Record<string, { sum: number; count: number }> = {}
  responses.forEach((r) => {
    const score = numericScore(r)
    if (score <= 0) return
    const qid = String(r?.question_id || '').trim()
    const cid = String(r?.category_id || '').trim()
    const info = qid ? categoryByQuestionId.get(qid) : null
    const byId = !info?.key && cid ? categoryById.get(cid) : null
    const name = (info?.key || byId?.key || String(r.category_name || '').trim() || 'Genel').toString()
    if (!catAgg[name]) catAgg[name] = { sum: 0, count: 0 }
    catAgg[name].sum += score
    catAgg[name].count += 1
  })

  const categories = Object.entries(catAgg).map(([name, v]) => ({
    name,
    score: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
  }))

  return {
    avgScore,
    hasScorableResponses: scorable.length > 0,
    categories,
    questionScores: [],
    responseCount: responses.length,
    distinctQuestionCount: new Set(responses.map((r) => String(r?.question_id || '')).filter(Boolean)).size,
    distinctCategoryCount: Object.keys(catAgg).length,
    zeroScoreCount: responses.filter((r) => numericScore(r) === 0).length,
    missingCategoryCount: 0,
  }
}

function assessmentKindLabel(kind: string) {
  if (kind === 'job_evaluation') return 'İş Değerlendirmesi'
  if (kind === 'other') return 'Diğer Değerlendirme'
  return 'Kişisel Gelişim'
}

function buildSwot(categoryCompare: Array<{ name: string; peer: number }>) {
  const sorted = [...categoryCompare].sort((a, b) => (b.peer || 0) - (a.peer || 0))
  const strengths = sorted.filter((c) => (c.peer || 0) >= 3.5).slice(0, 5).map((c) => ({ name: c.name, score: c.peer }))
  const weaknesses = sorted
    .filter((c) => (c.peer || 0) > 0 && (c.peer || 0) < 3.5)
    .slice(-5)
    .map((c) => ({ name: c.name, score: c.peer }))
  return { peer: { strengths, weaknesses } }
}

function sliceSortOrder(ctx: string) {
  if (ctx === 'genel') return '0'
  if (ctx === 'okul_yasam') return '1'
  return `2_${ctx}`
}

export function buildMatrixReportPeriodGroups(input: {
  assignments: any[]
  responsesByAssignment: Map<string, any[]>
  standardsByAssignment: Map<string, any[]>
  categoryByQuestionId: Map<string, { key: string; label: string }>
  categoryById: Map<string, { key: string; label: string }>
  categoryWeightByName?: Record<string, number>
  /** Öz değerlendirme dahil edilsin mi (varsayılan: hayır — yalnızca üst yönetici/peer) */
  includeSelf?: boolean
}): MatrixReportPeriodGroup[] {
  const categoryWeightByName = input.categoryWeightByName || {}
  const includeSelf = input.includeSelf === true

  type SliceAcc = {
    periodId: string
    periodName: string
    periodNameEn?: string | null
    periodNameFr?: string | null
    startDate?: string | null
    endDate?: string | null
    assessmentKind: string
    matrixContext: string
    evaluations: any[]
    standards: { total: number; count: number }
    hasSelf: boolean
  }

  const bySlice = new Map<string, SliceAcc>()

  for (const assignment of input.assignments || []) {
    const period = assignment.evaluation_periods || {}
    const periodId = String(period.id || '')
    if (!periodId) continue

    const matrixContext = normalizeMatrixContext(assignment.matrix_context)
    const key = `${periodId}::${matrixContext}`
    const eid = String(assignment.evaluator_id || '')
    const tid = String(assignment.target_id || '')
    const isSelf = userIdsEqualForSelfEval(eid, tid)

    if (isSelf && !includeSelf) {
      // Öz satırını metriklerden çıkar; yalnızca bayrak için işaretle
      if (!bySlice.has(key)) {
        bySlice.set(key, {
          periodId,
          periodName: String(period.name || ''),
          periodNameEn: period.name_en || null,
          periodNameFr: period.name_fr || null,
          startDate: period.start_date || null,
          endDate: period.end_date || null,
          assessmentKind: String(period.assessment_kind || 'development_360'),
          matrixContext,
          evaluations: [],
          standards: { total: 0, count: 0 },
          hasSelf: true,
        })
      } else {
        bySlice.get(key)!.hasSelf = true
      }
      continue
    }

    const aid = String(assignment.id || '')
    const responses = input.responsesByAssignment.get(aid) || []
    if (!responses.length) continue

    const bundle = buildBundleFromResponses(responses, input.categoryByQuestionId, input.categoryById)

    if (!bySlice.has(key)) {
      bySlice.set(key, {
        periodId,
        periodName: String(period.name || ''),
        periodNameEn: period.name_en || null,
        periodNameFr: period.name_fr || null,
        startDate: period.start_date || null,
        endDate: period.end_date || null,
        assessmentKind: String(period.assessment_kind || 'development_360'),
        matrixContext,
        evaluations: [],
        standards: { total: 0, count: 0 },
        hasSelf: isSelf,
      })
    }

    const acc = bySlice.get(key)!
    if (isSelf) acc.hasSelf = true

    let stdTotal = 0
    let stdCount = 0
    ;(input.standardsByAssignment.get(aid) || []).forEach((st) => {
      const score = Number(st.score || 0)
      if (Number.isFinite(score) && score > 0) {
        stdTotal += score
        stdCount += 1
        acc.standards.total += score
        acc.standards.count += 1
      }
    })

    acc.evaluations.push({
      evaluatorId: assignment.evaluator_id,
      evaluatorName: assignment.evaluator?.name || '-',
      isSelf,
      evaluatorLevel: isSelf ? 'self' : assignment.evaluator?.position_level || 'peer',
      avgScore: bundle.avgScore,
      hasScorableResponses: bundle.hasScorableResponses,
      categories: bundle.categories,
      questionScores: bundle.questionScores,
      avgScoreDuty: null,
      hasDutyScorableResponses: false,
      categoriesDuty: [],
      standardsAvg: stdCount ? Math.round((stdTotal / stdCount) * 10) / 10 : 0,
    })
  }

  const periodMap = new Map<string, MatrixReportPeriodGroup>()

  for (const acc of bySlice.values()) {
    if (!acc.evaluations.length) continue

    const evals = acc.evaluations
    const scopeAvgs = finalizeTargetScopeAverages(evals, () => 1)
    const categoryCompare = buildCategoryCompareForScope(evals, 'period', categoryWeightByName)
    const assessmentKind = acc.assessmentKind
    const periodMetrics = buildScopeScoreSummary({
      evaluations: evals,
      scope: 'period',
      categoryCompare,
      categoryWeightByName,
      assessmentKind,
      overallAvg: scopeAvgs.overallAvgPeriod,
    })

    const compareForSwot = periodMetrics?.categoryCompare || categoryCompare
    const swot = buildSwot(compareForSwot)
    const matrixLabel = matrixEvaluationContextLabel(acc.matrixContext)
    const peerCount = evals.filter((e) => !e.isSelf && e.hasScorableResponses).length

    const slice: MatrixReportSlice = {
      periodId: acc.periodId,
      periodName: acc.periodName,
      periodNameEn: acc.periodNameEn,
      periodNameFr: acc.periodNameFr,
      startDate: acc.startDate,
      endDate: acc.endDate,
      assessmentKind,
      assessmentLabel: assessmentKindLabel(assessmentKind),
      matrixContext: acc.matrixContext,
      matrixLabel,
      isDutyMatrix: isDutyMatrixContext(acc.matrixContext),
      overallAvg: scopeAvgs.overallAvgPeriod ?? 0,
      peerAvg: scopeAvgs.peerAvgPeriod ?? 0,
      peerAvgTrimmed: periodMetrics?.peerAvgTrimmed ?? 0,
      overallAvgTrimmed: periodMetrics?.overallAvgTrimmed ?? 0,
      score100: periodMetrics?.score100 ?? null,
      score100Trimmed: periodMetrics?.score100Trimmed ?? null,
      evaluatorCount: evals.length,
      peerEvaluatorCount: peerCount,
      peerTrimEligible: periodMetrics?.peerTrimEligible ?? false,
      hasSelfEvaluation: acc.hasSelf,
      standardAvg: acc.standards.count
        ? Math.round((acc.standards.total / acc.standards.count) * 10) / 10
        : 0,
      standardCount: acc.standards.count,
      categoryCompare: compareForSwot,
      swot,
      aiSummary:
        swot.peer.strengths.length || swot.peer.weaknesses.length
          ? `${matrixLabel} — Güçlü: ${swot.peer.strengths.map((x) => x.name).join(', ') || '-'}. Gelişim: ${swot.peer.weaknesses.map((x) => x.name).join(', ') || '-'}.`
          : `${matrixLabel}: yeterli kategori verisi yok.`,
    }

    if (!periodMap.has(acc.periodId)) {
      periodMap.set(acc.periodId, {
        periodId: acc.periodId,
        periodName: acc.periodName,
        startDate: acc.startDate,
        endDate: acc.endDate,
        assessmentKind,
        assessmentLabel: assessmentKindLabel(assessmentKind),
        slices: [],
      })
    }
    periodMap.get(acc.periodId)!.slices.push(slice)
  }

  return Array.from(periodMap.values())
    .map((g) => ({
      ...g,
      slices: g.slices.sort((a, b) => sliceSortOrder(a.matrixContext).localeCompare(sliceSortOrder(b.matrixContext), 'tr')),
    }))
    .sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')))
}

/** Geriye uyumluluk: düz kart listesi (her dilim ayrı kart) */
export function flattenMatrixReportSlices(groups: MatrixReportPeriodGroup[]): MatrixReportSlice[] {
  return groups.flatMap((g) => g.slices)
}

export function buildMatrixReportSummary(slices: MatrixReportSlice[]) {
  const allStrengths = slices.flatMap((c) => c.swot.peer.strengths.map((x) => x.name)).filter(Boolean)
  const allWeaknesses = slices.flatMap((c) => c.swot.peer.weaknesses.map((x) => x.name)).filter(Boolean)
  const countByName = (items: string[]) =>
    Array.from(
      items.reduce((m, name) => {
        m.set(name, (m.get(name) || 0) + 1)
        return m
      }, new Map<string, number>())
    )
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

  return {
    commonStrengths: countByName(allStrengths),
    commonRisks: countByName(allWeaknesses),
    narrative:
      slices.length === 0
        ? 'Bu kişi için tamamlanmış değerlendirme bulunamadı.'
        : `${slices.length} ayrı rapor dilimi (genel + yan görevler ayrı). Öz değerlendirme yoksa yalnızca üst yönetici/ekip puanları gösterilir; her dilim için ayrı SWOT hesaplanır.`,
  }
}
