import { normalizeMatrixContext, matrixEvaluationContextLabel, isDutyMatrixContext, coreGeneralReportSliceKey } from '@/lib/matrix-evaluation-context'
import { MERGED_GENEL_SLICE_CONTEXT, GENEL_ONLY_SLICE_CONTEXT } from '@/lib/admin-person-report-card-display'
import { coreMatrixResponsePriority, mergeResponsesByQuestionPriority } from '@/lib/server/core-general-report-merge'
import { effectiveCoreGeneralMatrixContext } from '@/lib/server/okul-yasam-coordinator-context'
import { userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'
import {
  buildCategoryCompareForScope,
  finalizeTargetScopeAverages,
  type AssignmentScoreBundle,
} from '@/lib/server/evaluation-response-scope'
import { buildScopeScoreSummary, computeQuestionBasedPeerOverall } from '@/lib/server/evaluation-score-metrics'

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
  peerAvgExact?: number
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
  const avgScore = denomResp ? Math.round((sumResp / denomResp) * 100) / 100 : 0

  const catAgg: Record<string, { sum: number; count: number }> = {}
  const qAgg: Record<string, { sum: number; count: number; category: string }> = {}
  responses.forEach((r) => {
    const score = numericScore(r)
    const qid = String(r?.question_id || '').trim()
    const cid = String(r?.category_id || '').trim()
    const info = qid ? categoryByQuestionId.get(qid) : null
    const byId = !info?.key && cid ? categoryById.get(cid) : null
    const name = (info?.key || byId?.key || String(r.category_name || '').trim() || 'Genel').toString()
    if (score <= 0) return
    if (!catAgg[name]) catAgg[name] = { sum: 0, count: 0 }
    catAgg[name].sum += score
    catAgg[name].count += 1
    if (qid) {
      if (!qAgg[qid]) qAgg[qid] = { sum: 0, count: 0, category: name }
      qAgg[qid].sum += score
      qAgg[qid].count += 1
    }
  })

  const categories = Object.entries(catAgg).map(([name, v]) => ({
    name,
    score: v.count ? Math.round((v.sum / v.count) * 100) / 100 : 0,
  }))
  const questionScores = Object.entries(qAgg).map(([questionId, v]) => ({
    questionId,
    category: v.category,
    score: v.count ? Math.round((v.sum / v.count) * 100) / 100 : 0,
  }))

  return {
    avgScore,
    hasScorableResponses: scorable.length > 0,
    categories,
    questionScores,
    answeredQuestionIds: Array.from(
      new Set(responses.map((r) => String(r?.question_id || '').trim()).filter(Boolean))
    ),
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

/** Genel + Okul Yaşam: aynı değerlendiren için yanıtları soru önceliğiyle birleştirir. */
export function consolidateCoreGeneralEvaluations(
  evaluations: any[],
  categoryByQuestionId: Map<string, { key: string; label: string }>,
  categoryById: Map<string, { key: string; label: string }>
): any[] {
  const groups = new Map<string, any[]>()
  for (const e of evaluations) {
    const k = e.isSelf ? '__self__' : String(e.evaluatorId || '')
    const list = groups.get(k) || []
    list.push(e)
    groups.set(k, list)
  }

  const out: any[] = []
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0])
      continue
    }
    const mergedResponses = mergeResponsesByQuestionPriority(
      list.map((e) => ({
        matrixContext: String(e.sourceMatrixContext || 'genel'),
        responses: [...(e.periodRawResponses || []), ...(e.dutyRawResponses || [])],
      }))
    )
    const bundle = buildBundleFromResponses(mergedResponses, categoryByQuestionId, categoryById)
    const base = [...list].sort(
      (a, b) =>
        coreMatrixResponsePriority(String(a.sourceMatrixContext || 'genel')) -
        coreMatrixResponsePriority(String(b.sourceMatrixContext || 'genel'))
    )[0]
    const standardsAvg =
      list.filter((e) => Number(e.standardsAvg || 0) > 0).length > 0
        ? Math.round(
            (list.reduce((s, e) => s + Number(e.standardsAvg || 0), 0) /
              list.filter((e) => Number(e.standardsAvg || 0) > 0).length) *
              100
          ) / 100
        : 0

    out.push({
      ...base,
      avgScore: bundle.avgScore,
      hasScorableResponses: bundle.hasScorableResponses,
      categories: bundle.categories,
      questionScores: bundle.questionScores,
      answeredQuestionIds: bundle.answeredQuestionIds,
      periodRawResponses: mergedResponses,
      dutyRawResponses: [],
      standardsAvg,
    })
  }
  return out
}

function sliceSortOrder(ctx: string) {
  if (ctx === MERGED_GENEL_SLICE_CONTEXT) return '0'
  if (ctx === GENEL_ONLY_SLICE_CONTEXT) return '1'
  if (coreGeneralReportSliceKey(ctx) === 'genel') return '0'
  return `2_${ctx}`
}

function coreGeneralMergedSliceLabel(): string {
  return 'Genel değerlendirme & Okul Yaşam'
}

function coreGeneralOnlySliceLabel(): string {
  return 'Genel değerlendirme'
}

function buildSliceFromAcc(
  acc: {
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
  },
  input: {
    categoryByQuestionId: Map<string, { key: string; label: string }>
    categoryById: Map<string, { key: string; label: string }>
    categoryWeightByName: Record<string, number>
  },
  opts: { consolidateGenelOy: boolean; matrixLabel: string }
): MatrixReportSlice | null {
  if (!acc.evaluations.length) return null

  if (opts.consolidateGenelOy) {
    acc.evaluations = consolidateCoreGeneralEvaluations(
      acc.evaluations,
      input.categoryByQuestionId,
      input.categoryById
    )
  }

  const evals = acc.evaluations
  const scopeAvgs = finalizeTargetScopeAverages(evals, () => 1)
  const peerEvalsOnly = evals.filter((e) => !e.isSelf && e.hasScorableResponses)
  const questionBasedPeer = opts.consolidateGenelOy
    ? computeQuestionBasedPeerOverall(peerEvalsOnly)
    : null
  const peerAvgDisplay =
    questionBasedPeer && questionBasedPeer.questionCount > 0
      ? questionBasedPeer.rounded
      : (scopeAvgs.peerAvgPeriod ?? 0)
  const overallAvgDisplay =
    questionBasedPeer && questionBasedPeer.questionCount > 0 && !acc.hasSelf
      ? questionBasedPeer.rounded
      : (scopeAvgs.overallAvgPeriod ?? 0)
  const categoryCompare = buildCategoryCompareForScope(evals, 'period', input.categoryWeightByName)
  const assessmentKind = acc.assessmentKind
  const periodMetrics = buildScopeScoreSummary({
    evaluations: evals,
    scope: 'period',
    categoryCompare,
    categoryWeightByName: input.categoryWeightByName,
    assessmentKind,
    overallAvg: overallAvgDisplay,
  })

  const compareForSwot = periodMetrics?.categoryCompare || categoryCompare
  const swot = buildSwot(compareForSwot)
  const peerCount = evals.filter((e) => !e.isSelf).length

  return {
    periodId: acc.periodId,
    periodName: acc.periodName,
    periodNameEn: acc.periodNameEn,
    periodNameFr: acc.periodNameFr,
    startDate: acc.startDate,
    endDate: acc.endDate,
    assessmentKind,
    assessmentLabel: assessmentKindLabel(assessmentKind),
    matrixContext: acc.matrixContext,
    matrixLabel: opts.matrixLabel,
    isDutyMatrix: isDutyMatrixContext(acc.matrixContext),
    overallAvg: overallAvgDisplay,
    peerAvg: peerAvgDisplay,
    peerAvgExact: questionBasedPeer?.exact,
    peerAvgTrimmed: periodMetrics?.peerAvgTrimmed ?? 0,
    overallAvgTrimmed: periodMetrics?.overallAvgTrimmed ?? 0,
    score100: periodMetrics?.score100 ?? null,
    score100Trimmed: periodMetrics?.score100Trimmed ?? null,
    evaluatorCount: evals.length,
    peerEvaluatorCount: peerCount,
    peerTrimEligible: periodMetrics?.peerTrimEligible ?? false,
    hasSelfEvaluation: acc.hasSelf,
    standardAvg: acc.standards.count
      ? Math.round((acc.standards.total / acc.standards.count) * 100) / 100
      : 0,
    standardCount: acc.standards.count,
    categoryCompare: compareForSwot,
    swot,
    aiSummary:
      swot.peer.strengths.length || swot.peer.weaknesses.length
        ? `${opts.matrixLabel} — Güçlü: ${swot.peer.strengths.map((x) => x.name).join(', ') || '-'}. Gelişim: ${swot.peer.weaknesses.map((x) => x.name).join(', ') || '-'}.`
        : `${opts.matrixLabel}: yeterli kategori verisi yok.`,
  }
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
    const effectiveCtx = effectiveCoreGeneralMatrixContext(matrixContext, {
      evaluatorTitle: assignment.evaluator?.title,
      evaluatorName: assignment.evaluator?.name,
      targetName: assignment.target?.name,
    })
    const isCoreGenel = effectiveCtx === 'genel' || effectiveCtx === 'okul_yasam'
    const sliceContext = isCoreGenel
      ? MERGED_GENEL_SLICE_CONTEXT
      : matrixContext
    const key = `${periodId}::${sliceContext}`
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
          matrixContext: sliceContext,
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
        matrixContext: sliceContext,
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
      sourceMatrixContext: effectiveCtx,
      avgScore: bundle.avgScore,
      hasScorableResponses: bundle.hasScorableResponses,
      categories: bundle.categories,
      questionScores: bundle.questionScores,
      answeredQuestionIds: bundle.answeredQuestionIds,
      periodRawResponses: isDutyMatrixContext(matrixContext) ? [] : responses,
      dutyRawResponses: isDutyMatrixContext(matrixContext) ? responses : [],
      avgScoreDuty: null,
      hasDutyScorableResponses: false,
      categoriesDuty: [],
      standardsAvg: stdCount ? Math.round((stdTotal / stdCount) * 100) / 100 : 0,
    })

    if (matrixContext === 'genel') {
      const genelOnlyKey = `${periodId}::${GENEL_ONLY_SLICE_CONTEXT}`
      if (!bySlice.has(genelOnlyKey)) {
        bySlice.set(genelOnlyKey, {
          periodId,
          periodName: String(period.name || ''),
          periodNameEn: period.name_en || null,
          periodNameFr: period.name_fr || null,
          startDate: period.start_date || null,
          endDate: period.end_date || null,
          assessmentKind: String(period.assessment_kind || 'development_360'),
          matrixContext: GENEL_ONLY_SLICE_CONTEXT,
          evaluations: [],
          standards: { total: 0, count: 0 },
          hasSelf: isSelf,
        })
      }
      const genelAcc = bySlice.get(genelOnlyKey)!
      if (isSelf) genelAcc.hasSelf = true
      let genelStdTotal = 0
      let genelStdCount = 0
      ;(input.standardsByAssignment.get(aid) || []).forEach((st) => {
        const score = Number(st.score || 0)
        if (Number.isFinite(score) && score > 0) {
          genelStdTotal += score
          genelStdCount += 1
          genelAcc.standards.total += score
          genelAcc.standards.count += 1
        }
      })
      genelAcc.evaluations.push({
        evaluatorId: assignment.evaluator_id,
        evaluatorName: assignment.evaluator?.name || '-',
        isSelf,
        evaluatorLevel: isSelf ? 'self' : assignment.evaluator?.position_level || 'peer',
        sourceMatrixContext: effectiveCtx,
        avgScore: bundle.avgScore,
        hasScorableResponses: bundle.hasScorableResponses,
        categories: bundle.categories,
        questionScores: bundle.questionScores,
        answeredQuestionIds: bundle.answeredQuestionIds,
        periodRawResponses: responses,
        dutyRawResponses: [],
        avgScoreDuty: null,
        hasDutyScorableResponses: false,
        categoriesDuty: [],
        standardsAvg: genelStdCount ? Math.round((genelStdTotal / genelStdCount) * 100) / 100 : 0,
      })
    }
  }

  const periodMap = new Map<string, MatrixReportPeriodGroup>()
  const sliceInput = {
    categoryByQuestionId: input.categoryByQuestionId,
    categoryById: input.categoryById,
    categoryWeightByName,
  }

  const mergedByPeriod = new Map<string, SliceAcc>()
  for (const acc of bySlice.values()) {
    if (acc.matrixContext === MERGED_GENEL_SLICE_CONTEXT) {
      mergedByPeriod.set(acc.periodId, acc)
    }
  }

  for (const acc of bySlice.values()) {
    if (!acc.evaluations.length) continue

    const hasOkulYasamInPeriod = (mergedByPeriod.get(acc.periodId)?.evaluations || []).some(
      (e) => String(e.sourceMatrixContext || '') === 'okul_yasam'
    )

    if (acc.matrixContext === GENEL_ONLY_SLICE_CONTEXT && !hasOkulYasamInPeriod) {
      continue
    }

    let matrixLabel = matrixEvaluationContextLabel(acc.matrixContext)
    let consolidateGenelOy = false
    if (acc.matrixContext === MERGED_GENEL_SLICE_CONTEXT) {
      matrixLabel = coreGeneralMergedSliceLabel()
      consolidateGenelOy = true
    } else if (acc.matrixContext === GENEL_ONLY_SLICE_CONTEXT) {
      matrixLabel = coreGeneralOnlySliceLabel()
    }

    const slice = buildSliceFromAcc(acc, sliceInput, { consolidateGenelOy, matrixLabel })
    if (!slice) continue

    if (!periodMap.has(acc.periodId)) {
      periodMap.set(acc.periodId, {
        periodId: acc.periodId,
        periodName: acc.periodName,
        startDate: acc.startDate,
        endDate: acc.endDate,
        assessmentKind: acc.assessmentKind,
        assessmentLabel: assessmentKindLabel(acc.assessmentKind),
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
        : `${slices.length} rapor dilimi: Genel & Okul Yaşam birleşik, yalnızca genel (Okul Yaşam varsa) ve yan görevler ayrı kartlarda.`,
  }
}
