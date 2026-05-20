export type QuestionScope = 'period' | 'duty'

export type AssignmentScoreBundle = {
  avgScore: number
  hasScorableResponses: boolean
  categories: Array<{ name: string; score: number }>
  questionScores: Array<{ questionId: string; category: string; score: number }>
  responseCount: number
  distinctQuestionCount: number
  distinctCategoryCount: number
  zeroScoreCount: number
  missingCategoryCount: number
}

type CategoryLookup = { key: string; label: string }

function numericScore(r: any): number {
  const n = Number(r?.reel_score ?? r?.std_score ?? r?.score ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function responseScopeOf(
  r: any,
  dutyOnlyQuestionIds: Set<string>
): QuestionScope {
  const stored = String(r?.question_scope || '').trim()
  if (stored === 'duty' || stored === 'period') return stored
  const qid = String(r?.question_id || '').trim()
  if (qid && dutyOnlyQuestionIds.has(qid)) return 'duty'
  return 'period'
}

export function splitResponsesByScope(
  responses: any[],
  dutyOnlyQuestionIds: Set<string>
): { period: any[]; duty: any[] } {
  const period: any[] = []
  const duty: any[] = []
  for (const r of responses || []) {
    if (responseScopeOf(r, dutyOnlyQuestionIds) === 'duty') duty.push(r)
    else period.push(r)
  }
  return { period, duty }
}

export function aggregateAssignmentResponses(
  assignmentResponses: any[],
  opts: {
    dutyOnlyQuestionIds: Set<string>
    categoryByQuestionId: Map<string, CategoryLookup>
    categoryById: Map<string, CategoryLookup>
  }
): { period: AssignmentScoreBundle; duty: AssignmentScoreBundle } {
  const { period: periodRows, duty: dutyRows } = splitResponsesByScope(
    assignmentResponses,
    opts.dutyOnlyQuestionIds
  )
  return {
    period: buildBundle(periodRows, opts),
    duty: buildBundle(dutyRows, opts),
  }
}

function buildBundle(
  assignmentResponses: any[],
  opts: {
    categoryByQuestionId: Map<string, CategoryLookup>
    categoryById: Map<string, CategoryLookup>
  }
): AssignmentScoreBundle {
  const scorable = assignmentResponses.filter((r) => numericScore(r) > 0)
  const sumResp = scorable.reduce((sum, r) => sum + numericScore(r), 0)
  const denomResp = scorable.length
  const rawAvg = denomResp ? sumResp / denomResp : 0
  const avgScore = Number.isFinite(rawAvg) ? Math.round(rawAvg * 10) / 10 : 0

  const catAgg: Record<string, { sum: number; count: number }> = {}
  const qAgg: Record<string, { sum: number; count: number; category: string }> = {}

  assignmentResponses.forEach((r) => {
    const qid = String(r?.question_id || '').trim()
    const cid = String(r?.category_id || '').trim()
    const info = qid ? opts.categoryByQuestionId.get(qid) : null
    const byId = !info?.key && cid ? opts.categoryById.get(cid) : null
    const name = (info?.key || byId?.key || String(r.category_name || '').trim() || 'Genel').toString()
    const score = numericScore(r)
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
    score: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
  }))
  const questionScores = Object.entries(qAgg).map(([questionId, v]) => ({
    questionId,
    category: v.category,
    score: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
  }))

  const distinctQuestions = new Set(
    assignmentResponses.map((r) => String(r?.question_id || '').trim()).filter(Boolean)
  )
  const zeroScoreCount = assignmentResponses.reduce(
    (n, r) => n + (numericScore(r) === 0 ? 1 : 0),
    0
  )
  const missingCategoryCount = assignmentResponses.reduce((n, r) => {
    const hasName = String(r?.category_name || '').trim().length > 0
    const hasId = String(r?.category_id || '').trim().length > 0
    return n + (!hasName && !hasId ? 1 : 0)
  }, 0)

  return {
    avgScore,
    hasScorableResponses: scorable.length > 0,
    categories,
    questionScores,
    responseCount: assignmentResponses.length,
    distinctQuestionCount: distinctQuestions.size,
    distinctCategoryCount: Object.keys(catAgg).length,
    zeroScoreCount,
    missingCategoryCount,
  }
}

export function finalizeTargetScopeAverages(
  evaluations: any[],
  weightForEval: (e: any) => number
) {
  const periodScorable = evaluations.filter((e) => e.hasScorableResponses)
  const dutyScorable = evaluations.filter((e) => e.hasDutyScorableResponses)

  const wAvg = (rows: Array<{ w: number; v: number }>) => {
    const valid = rows.filter((x) => Number.isFinite(x.v) && x.v > 0 && Number.isFinite(x.w) && x.w > 0)
    if (!valid.length) return 0
    const sumW = valid.reduce((s, x) => s + x.w, 0)
    if (!sumW) return 0
    const sum = valid.reduce((s, x) => s + x.w * x.v, 0)
    return Math.round((sum / sumW) * 10) / 10
  }

  const selfEval = evaluations.find((e) => e.isSelf)
  const peerEvals = evaluations.filter((e) => !e.isSelf)
  const peerPeriod = peerEvals.filter((e) => e.hasScorableResponses)
  const peerDuty = peerEvals.filter((e) => e.hasDutyScorableResponses)

  return {
    overallAvgPeriod: wAvg(periodScorable.map((e) => ({ w: weightForEval(e), v: e.avgScore || 0 }))),
    overallAvgDuty: dutyScorable.length
      ? wAvg(dutyScorable.map((e) => ({ w: weightForEval(e), v: e.avgScoreDuty || 0 })))
      : null,
    selfScorePeriod: selfEval?.avgScore ?? 0,
    selfScoreDuty: selfEval?.hasDutyScorableResponses ? selfEval?.avgScoreDuty ?? 0 : null,
    peerAvgPeriod: peerPeriod.length
      ? Math.round((peerPeriod.reduce((s, e) => s + (e.avgScore || 0), 0) / peerPeriod.length) * 10) / 10
      : 0,
    peerAvgDuty: peerDuty.length
      ? Math.round((peerDuty.reduce((s, e) => s + (e.avgScoreDuty || 0), 0) / peerDuty.length) * 10) / 10
      : null,
    hasDutyScope: dutyScorable.length > 0,
  }
}

export function buildCategoryCompareForScope(
  evaluations: any[],
  scope: 'period' | 'duty',
  categoryWeightByName: Record<string, number>
) {
  const catMap: Record<string, { selfSum: number; selfCount: number; peerSum: number; peerCount: number }> = {}
  evaluations.forEach((e) => {
    const cats = scope === 'duty' ? e.categoriesDuty || [] : e.categories || []
    cats.forEach((c: any) => {
      const name = String(c.name || 'Genel')
      if (!catMap[name]) catMap[name] = { selfSum: 0, selfCount: 0, peerSum: 0, peerCount: 0 }
      const score = Number(c.score || 0)
      if (e.isSelf) {
        catMap[name].selfSum += score
        catMap[name].selfCount += 1
      } else {
        catMap[name].peerSum += score
        catMap[name].peerCount += 1
      }
    })
  })
  return Object.entries(catMap).map(([name, v]) => {
    const self = v.selfCount ? Math.round((v.selfSum / v.selfCount) * 10) / 10 : 0
    const peer = v.peerCount ? Math.round((v.peerSum / v.peerCount) * 10) / 10 : 0
    return {
      name,
      self,
      peer,
      diff: Math.round((self - peer) * 10) / 10,
      weight: Number(categoryWeightByName[name] ?? 1),
      peerTrimmed: 0,
    }
  })
}
