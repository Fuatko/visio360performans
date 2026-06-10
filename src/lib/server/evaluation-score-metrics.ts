/**
 * Trim (min/max kırpma) ve 100 puan normalizasyonu — temel görev / ek görev ayrı.
 *
 * Kurallar (sıra önemli):
 * 1) Her soru için: o soruya gelen en az MIN_PEER_RESPONSES_FOR_QUESTION_TRIM cevap (fikrim yok dahil)
 * 2) Kişi bazında trim raporu: en az MIN_PEER_EVALUATORS_FOR_PERSON_TRIM tamamlamış ekip değerlendiricisi
 * Trim hesabı: (1) sağlandıktan sonra yalnızca puanlanabilir skorlarda min/max kırpılır
 * Her iki koşul sağlanmazsa trim skoru üretilmez (0, applied: false)
 */

/** Soru başına trim için minimum ekip cevabı (fikrim yok dahil) */
export const MIN_PEER_RESPONSES_FOR_QUESTION_TRIM = 7

/** Trim hesabı için soru başına minimum puanlanabilir ekip cevabı */
export const MIN_SCORABLE_FOR_TRIM_MATH = 3

/** Kişi düzeyinde trim raporu için minimum ekip değerlendiricisi */
export const MIN_PEER_EVALUATORS_FOR_PERSON_TRIM = 3

/** @deprecated MIN_PEER_RESPONSES_FOR_QUESTION_TRIM kullanın */
export const MIN_PEER_SCORES_FOR_QUESTION_TRIM = MIN_PEER_RESPONSES_FOR_QUESTION_TRIM

export function mean(nums: number[]) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function trimmedMeanDetail(scorableScores: number[], totalResponseCount?: number) {
  const xs = scorableScores.filter((n) => Number.isFinite(n) && n > 0)
  const nResponses = Number.isFinite(totalResponseCount) ? Number(totalResponseCount) : xs.length

  if (nResponses < MIN_PEER_RESPONSES_FOR_QUESTION_TRIM) {
    return { value: xs.length ? mean(xs) : 0, applied: false, n: nResponses, scorableN: xs.length }
  }
  if (xs.length < MIN_SCORABLE_FOR_TRIM_MATH) {
    return { value: xs.length ? mean(xs) : 0, applied: false, n: nResponses, scorableN: xs.length }
  }
  xs.sort((a, b) => a - b)
  const trimmed = xs.slice(1, xs.length - 1)
  return { value: mean(trimmed), applied: true, n: nResponses, scorableN: xs.length }
}

/** Aynı değerlendiricinin yinelenen ataması soru başına tek cevap sayılır. */
function peerEvaluatorKey(e: any): string {
  return String(e?.evaluatorId ?? e?.evaluator_id ?? '').trim()
}

export function countPeerEvaluatorsForPersonTrim(evaluations: any[]): number {
  const ids = new Set<string>()
  evaluations.forEach((e) => {
    if (e.isSelf) return
    const key = peerEvaluatorKey(e)
    if (key) ids.add(key)
  })
  return ids.size
}

/** @deprecated countPeerEvaluatorsForPersonTrim kullanın */
export function countPeerEvaluatorsWithScorableScores(
  evaluations: any[],
  scope: 'period' | 'duty'
): number {
  const hasScorableKey = scope === 'duty' ? 'hasDutyScorableResponses' : 'hasScorableResponses'
  return evaluations.filter((e) => !e.isSelf && e[hasScorableKey]).length
}

export function isPersonPeerTrimEligible(peerEvaluatorCount: number): boolean {
  return peerEvaluatorCount >= MIN_PEER_EVALUATORS_FOR_PERSON_TRIM
}

function answeredQuestionIdsKey(scope: 'period' | 'duty') {
  return scope === 'duty' ? 'answeredQuestionIdsDuty' : 'answeredQuestionIds'
}

function buildPeerQuestionTrimInputs(
  peerEvalsAll: any[],
  scope: 'period' | 'duty'
): {
  peerQuestionScores: Map<string, { category: string; scores: number[] }>
  responseCountByQuestion: Map<string, number>
  uniquePeerEvaluatorCount: number
} {
  const qKey = scope === 'duty' ? 'questionScoresDuty' : 'questionScores'
  const hasScorableKey = scope === 'duty' ? 'hasDutyScorableResponses' : 'hasScorableResponses'
  const answeredKey = answeredQuestionIdsKey(scope)

  const responseEvaluatorsByQuestion = new Map<string, Set<string>>()
  const scoreByQuestionEvaluator = new Map<string, Map<string, { score: number; category: string }>>()
  const uniquePeerIds = new Set<string>()

  peerEvalsAll.forEach((e) => {
    const ekey = peerEvaluatorKey(e)
    if (!ekey) return
    uniquePeerIds.add(ekey)

    const ids = (e[answeredKey] || []) as string[]
    ids.forEach((raw) => {
      const qid = String(raw || '').trim()
      if (!qid) return
      if (!responseEvaluatorsByQuestion.has(qid)) responseEvaluatorsByQuestion.set(qid, new Set())
      responseEvaluatorsByQuestion.get(qid)!.add(ekey)
    })

    if (!e[hasScorableKey]) return
    ;((e[qKey] || []) as any[]).forEach((qs: any) => {
      const qid = String(qs?.questionId || '').trim()
      if (!qid) return
      const v = Number(qs?.score || 0)
      if (!Number.isFinite(v) || v <= 0) return
      const cat = String(qs?.category || 'Genel')
      if (!scoreByQuestionEvaluator.has(qid)) scoreByQuestionEvaluator.set(qid, new Map())
      scoreByQuestionEvaluator.get(qid)!.set(ekey, { score: v, category: cat })
    })
  })

  const responseCountByQuestion = new Map<string, number>()
  responseEvaluatorsByQuestion.forEach((evaluators, qid) => {
    responseCountByQuestion.set(qid, evaluators.size)
  })

  const peerQuestionScores = new Map<string, { category: string; scores: number[] }>()
  scoreByQuestionEvaluator.forEach((evalMap, qid) => {
    const scores: number[] = []
    let category = 'Genel'
    evalMap.forEach((entry) => {
      scores.push(entry.score)
      category = entry.category || category
    })
    peerQuestionScores.set(qid, { category, scores })
  })

  return {
    peerQuestionScores,
    responseCountByQuestion,
    uniquePeerEvaluatorCount: uniquePeerIds.size,
  }
}

export function weightedAvg(rows: Array<{ w: number; v: number }>) {
  const valid = rows.filter((x) => Number.isFinite(x.v) && x.v > 0 && Number.isFinite(x.w) && x.w > 0)
  if (!valid.length) return 0
  const sumW = valid.reduce((s, x) => s + x.w, 0)
  if (!sumW) return 0
  return valid.reduce((s, x) => s + x.v * x.w, 0) / sumW
}

export type CategoryCompareRow = {
  name: string
  self: number
  peer: number
  diff: number
  weight: number
  peerTrimmed: number
  peerTrimAppliedCount?: number
  peerTrimQuestionCount?: number
}

export function inferMaxScoreScale(assessmentKind: string, peakResponseScore: number) {
  if (assessmentKind === 'job_evaluation') return 5
  if (peakResponseScore > 10) return Math.max(11, Math.ceil(peakResponseScore))
  return 5
}

/** Ortalama skoru ölçek üst sınırına göre 0–100 */
export function scoreToPercent100(avgOnScale: number, maxScale: number): number | null {
  if (!Number.isFinite(avgOnScale) || avgOnScale <= 0 || maxScale <= 0) return null
  const pct = (avgOnScale / maxScale) * 100
  return Math.min(100, Math.round(pct * 10) / 10)
}

export function countDistinctQuestions(
  evaluations: any[],
  scope: 'period' | 'duty'
): number {
  const ids = new Set<string>()
  evaluations.forEach((e) => {
    const qs = scope === 'duty' ? e.questionScoresDuty : e.questionScores
    ;(qs || []).forEach((q: any) => {
      const id = String(q?.questionId || '').trim()
      if (id) ids.add(id)
    })
  })
  return ids.size
}

export function peakResponseScoreFromEvaluations(evaluations: any[], scope: 'period' | 'duty') {
  let peak = 0
  evaluations.forEach((e) => {
    const qs = scope === 'duty' ? e.questionScoresDuty : e.questionScores
    ;(qs || []).forEach((q: any) => {
      const v = Number(q?.score || 0)
      if (Number.isFinite(v) && v > peak) peak = v
    })
    const avg = scope === 'duty' ? Number(e.avgScoreDuty || 0) : Number(e.avgScore || 0)
    if (avg > peak) peak = avg
  })
  return peak
}

/**
 * Ekip değerlendiricileri arasında soru bazlı trim → kategori peerTrimmed → ağırlıklı genel trim.
 */
export function computePeerTrimMetrics(
  evaluations: any[],
  scope: 'period' | 'duty',
  categoryCompare: Array<{
    name: string
    self: number
    peer: number
    diff: number
    weight?: number
  }>,
  categoryWeightByName: Record<string, number>
): {
  categoryCompare: CategoryCompareRow[]
  peerAvgTrimmed: number
  overallAvgTrimmed: number
  peerTrimEligible: boolean
} {
  const peerEvalsAll = evaluations.filter((e) => !e.isSelf)

  const emptyTrim = (reasonEligible: boolean) => {
    const categoryCompareOut: CategoryCompareRow[] = (categoryCompare || []).map((c) => {
      const name = String(c.name || 'Genel')
      return {
        name,
        self: Number(c.self || 0),
        peer: Number(c.peer || 0),
        diff: Number(c.diff || 0),
        weight: Number(categoryWeightByName[name] ?? c.weight ?? 1),
        peerTrimmed: 0,
        peerTrimAppliedCount: 0,
        peerTrimQuestionCount: 0,
      }
    })
    return {
      categoryCompare: categoryCompareOut,
      peerAvgTrimmed: 0,
      overallAvgTrimmed: 0,
      peerTrimEligible: reasonEligible,
    }
  }

  // 1) Önce soru bazında cevap sayısı (≥7 / soru, fikrim yok dahil; benzersiz değerlendirici)
  const { peerQuestionScores, responseCountByQuestion, uniquePeerEvaluatorCount } =
    buildPeerQuestionTrimInputs(peerEvalsAll, scope)

  const answeredCounts = [...responseCountByQuestion.values()].filter((n) => n > 0)
  const minResponsesAmongAnsweredQuestions = answeredCounts.length ? Math.min(...answeredCounts) : 0
  // Kişi düzeyinde trim raporu: yanıtlanan her soruda en az 7 cevap olmalı (kısmi trim yok)
  if (minResponsesAmongAnsweredQuestions < MIN_PEER_RESPONSES_FOR_QUESTION_TRIM) {
    return emptyTrim(false)
  }

  const trimmedByCategory = new Map<string, number[]>()
  const trimMetaByCategory = new Map<string, { total: number; applied: number }>()
  let trimmedQuestionCount = 0

  peerQuestionScores.forEach((v, qid) => {
    const responseN = responseCountByQuestion.get(qid) ?? v.scores.length
    const t = trimmedMeanDetail(v.scores, responseN)
    if (!t.applied || !Number.isFinite(t.value) || t.value <= 0) return
    trimmedQuestionCount += 1
    const cat = String(v.category || 'Genel')
    const cur = trimmedByCategory.get(cat) || []
    cur.push(t.value)
    trimmedByCategory.set(cat, cur)
    const meta = trimMetaByCategory.get(cat) || { total: 0, applied: 0 }
    meta.total += 1
    if (t.applied) meta.applied += 1
    trimMetaByCategory.set(cat, meta)
  })

  if (!trimmedQuestionCount) {
    return emptyTrim(false)
  }

  // 2) Sonra kişi bazında benzersiz değerlendirici sayısı (≥3)
  if (!isPersonPeerTrimEligible(uniquePeerEvaluatorCount)) {
    return emptyTrim(false)
  }

  const peerTrimmedForCat = (cat: string) => {
    const xs = trimmedByCategory.get(cat) || []
    if (!xs.length) return 0
    return Math.round(mean(xs) * 10) / 10
  }

  const categoryCompareOut: CategoryCompareRow[] = (categoryCompare || []).map((c) => {
    const name = String(c.name || 'Genel')
    return {
      name,
      self: Number(c.self || 0),
      peer: Number(c.peer || 0),
      diff: Number(c.diff || 0),
      weight: Number(categoryWeightByName[name] ?? c.weight ?? 1),
      peerTrimmed: peerTrimmedForCat(name),
      peerTrimAppliedCount: trimMetaByCategory.get(name)?.applied || 0,
      peerTrimQuestionCount: trimMetaByCategory.get(name)?.total || 0,
    }
  })

  const rowsForOverall = categoryCompareOut
    .map((c) => ({ w: c.weight, v: c.peerTrimmed }))
    .filter((x) => Number.isFinite(x.v) && x.v > 0 && Number.isFinite(x.w) && x.w > 0)

  const peerAvgTrimmed = rowsForOverall.length ? Math.round(weightedAvg(rowsForOverall) * 10) / 10 : 0
  const overallAvgTrimmed = peerAvgTrimmed

  return {
    categoryCompare: categoryCompareOut,
    peerAvgTrimmed,
    overallAvgTrimmed,
    peerTrimEligible: trimmedQuestionCount > 0 && peerAvgTrimmed > 0,
  }
}

/** UI: trim yalnızca uygunluk bayrağı açıksa gösterilir (normal ortalamayla karıştırılmaz). */
export function displayTrimScore(
  peerTrimEligible: boolean | undefined,
  value: number | null | undefined
): number | null {
  if (!peerTrimEligible) return null
  const v = Number(value ?? 0)
  if (!Number.isFinite(v) || v <= 0) return null
  return Math.round(v * 10) / 10
}

export type ScopeScoreSummary = {
  peerAvgTrimmed: number
  overallAvgTrimmed: number
  score100: number | null
  score100Trimmed: number | null
  questionCount: number
  maxScale: number
  peerTrimEligible: boolean
  peerEvaluatorCount: number
}

export type TrimDetail = { value: number; applied: boolean; n: number; scorableN?: number }

export type CategoryQuestionRow = {
  questionId: string
  questionText: string
  self: number
  peer: number
  peerTrimmed: number
  peerTrimApplied: boolean
  peerTrimN: number
  diff: number
  selfCount: number
  peerCount: number
}

/** Ekip değerlendiricileri arasında soru bazlı trim (temel / ek görev). */
export function buildTrimByQuestionMap(
  peerEvals: any[],
  scope: 'period' | 'duty',
  normalizeQuestionId: (raw: string) => string = (raw) => String(raw || '').trim()
): Map<string, TrimDetail> {
  const { peerQuestionScores, responseCountByQuestion } = buildPeerQuestionTrimInputs(peerEvals, scope)

  const trimByQuestion = new Map<string, TrimDetail>()
  peerQuestionScores.forEach((v, rawQid) => {
    const qid = normalizeQuestionId(rawQid)
    const responseN = responseCountByQuestion.get(rawQid) ?? responseCountByQuestion.get(qid) ?? v.scores.length
    trimByQuestion.set(qid, trimmedMeanDetail(v.scores, responseN))
  })
  return trimByQuestion
}

/** Kategori → soru listesi (öz/ekip/trim) drill-down. */
export function buildCategoryQuestionsMap(
  evals: any[],
  scope: 'period' | 'duty',
  trimByQuestion: Map<string, TrimDetail>,
  resolveQuestion: (questionId: string) => { text: string; order: number },
  normalizeQuestionId: (raw: string) => string = (raw) => String(raw || '').trim()
): Record<string, CategoryQuestionRow[]> {
  const qKey = scope === 'duty' ? 'questionScoresDuty' : 'questionScores'
  const qMap: Record<
    string,
    Record<
      string,
      {
        questionId: string
        questionText: string
        order: number
        selfSum: number
        selfCount: number
        peerSum: number
        peerCount: number
      }
    >
  > = {}

  evals.forEach((e) => {
    ;((e[qKey] || []) as any[]).forEach((qs: any) => {
      const qid = normalizeQuestionId(String(qs?.questionId || '').trim())
      if (!qid) return
      const cat = String(qs?.category || 'Genel').trim() || 'Genel'
      if (!qMap[cat]) qMap[cat] = {}
      if (!qMap[cat][qid]) {
        const meta = resolveQuestion(qid)
        qMap[cat][qid] = {
          questionId: qid,
          questionText: (meta.text || qid).trim(),
          order: meta.order,
          selfSum: 0,
          selfCount: 0,
          peerSum: 0,
          peerCount: 0,
        }
      }
      const score = Number(qs?.score ?? 0)
      if (!Number.isFinite(score)) return
      if (e.isSelf) {
        qMap[cat][qid].selfSum += score
        qMap[cat][qid].selfCount += 1
      } else {
        qMap[cat][qid].peerSum += score
        qMap[cat][qid].peerCount += 1
      }
    })
  })

  const out: Record<string, CategoryQuestionRow[]> = {}
  Object.entries(qMap).forEach(([cat, qm]) => {
    const rows = Object.values(qm)
      .sort((a, b) => (a.order - b.order) || a.questionText.localeCompare(b.questionText, 'tr'))
      .map((x) => {
        const self = x.selfCount ? Math.round((x.selfSum / x.selfCount) * 10) / 10 : 0
        const peer = x.peerCount ? Math.round((x.peerSum / x.peerCount) * 10) / 10 : 0
        const diff = self && peer ? Math.round((self - peer) * 10) / 10 : 0
        const tm = trimByQuestion.get(x.questionId) || { value: peer, applied: false, n: x.peerCount }
        const peerTrimmed =
          tm.applied && tm.value ? Math.round(Number(tm.value) * 10) / 10 : 0
        return {
          questionId: x.questionId,
          questionText: x.questionText,
          self,
          peer,
          peerTrimmed,
          peerTrimApplied: Boolean(tm.applied),
          peerTrimN: Number(tm.n || 0),
          diff,
          selfCount: x.selfCount,
          peerCount: x.peerCount,
        }
      })
    out[cat] = rows
  })
  return out
}

export function buildScopeScoreSummary(opts: {
  evaluations: any[]
  scope: 'period' | 'duty'
  categoryCompare: Array<{ name: string; self: number; peer: number; diff: number; weight?: number }>
  categoryWeightByName: Record<string, number>
  assessmentKind: string
  overallAvg: number | null
}): (ScopeScoreSummary & { categoryCompare: CategoryCompareRow[] }) | null {
  const hasKey = opts.scope === 'duty' ? 'hasDutyScorableResponses' : 'hasScorableResponses'
  const scorable = opts.evaluations.some((e) => e[hasKey])
  if (!scorable) return null

  const peerEvaluatorCount = countPeerEvaluatorsForPersonTrim(opts.evaluations)
  const trim = computePeerTrimMetrics(
    opts.evaluations,
    opts.scope,
    opts.categoryCompare,
    opts.categoryWeightByName
  )
  const peak = peakResponseScoreFromEvaluations(opts.evaluations, opts.scope)
  const maxScale = inferMaxScoreScale(opts.assessmentKind, peak)
  const questionCount = countDistinctQuestions(opts.evaluations, opts.scope)
  const avg = opts.overallAvg ?? 0
  const trimScore100 = trim.peerTrimEligible
    ? scoreToPercent100(trim.overallAvgTrimmed, maxScale)
    : null

  return {
    categoryCompare: trim.categoryCompare,
    peerAvgTrimmed: trim.peerAvgTrimmed,
    overallAvgTrimmed: trim.overallAvgTrimmed,
    score100: scoreToPercent100(avg, maxScale),
    score100Trimmed: trimScore100,
    questionCount,
    maxScale,
    peerTrimEligible: trim.peerTrimEligible,
    peerEvaluatorCount,
  }
}
