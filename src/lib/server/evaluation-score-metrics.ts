/**
 * Trim (min/max kırpma) ve 100 puan normalizasyonu — temel görev / ek görev ayrı.
 */

export function mean(nums: number[]) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function trimmedMeanDetail(nums: number[]) {
  const xs = nums.filter((n) => Number.isFinite(n))
  if (!xs.length) return { value: 0, applied: false, n: 0 }
  if (xs.length < 3) return { value: mean(xs), applied: false, n: xs.length }
  xs.sort((a, b) => a - b)
  const trimmed = xs.slice(1, xs.length - 1)
  return { value: mean(trimmed), applied: true, n: xs.length }
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
} {
  const qKey = scope === 'duty' ? 'questionScoresDuty' : 'questionScores'
  const hasScorableKey = scope === 'duty' ? 'hasDutyScorableResponses' : 'hasScorableResponses'

  const peerEvals = evaluations.filter(
    (e) => !e.isSelf && e[hasScorableKey]
  )

  const peerQuestionScores = new Map<string, { category: string; scores: number[] }>()
  peerEvals.forEach((e) => {
    ;((e[qKey] || []) as any[]).forEach((qs: any) => {
      const qid = String(qs?.questionId || '').trim()
      if (!qid) return
      const v = Number(qs?.score || 0)
      if (!Number.isFinite(v) || v <= 0) return
      const cat = String(qs?.category || 'Genel')
      const cur = peerQuestionScores.get(qid) || { category: cat, scores: [] as number[] }
      cur.category = cur.category || cat
      cur.scores.push(v)
      peerQuestionScores.set(qid, cur)
    })
  })

  const trimmedByCategory = new Map<string, number[]>()
  const trimMetaByCategory = new Map<string, { total: number; applied: number }>()

  peerQuestionScores.forEach((v) => {
    const t = trimmedMeanDetail(v.scores)
    if (!Number.isFinite(t.value) || t.value <= 0) return
    const cat = String(v.category || 'Genel')
    const cur = trimmedByCategory.get(cat) || []
    cur.push(t.value)
    trimmedByCategory.set(cat, cur)
    const meta = trimMetaByCategory.get(cat) || { total: 0, applied: 0 }
    meta.total += 1
    if (t.applied) meta.applied += 1
    trimMetaByCategory.set(cat, meta)
  })

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

  return { categoryCompare: categoryCompareOut, peerAvgTrimmed, overallAvgTrimmed }
}

export type ScopeScoreSummary = {
  peerAvgTrimmed: number
  overallAvgTrimmed: number
  score100: number | null
  score100Trimmed: number | null
  questionCount: number
  maxScale: number
}

export type TrimDetail = { value: number; applied: boolean; n: number }

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
  const qKey = scope === 'duty' ? 'questionScoresDuty' : 'questionScores'
  const hasKey = scope === 'duty' ? 'hasDutyScorableResponses' : 'hasScorableResponses'

  const peerQuestionScores = new Map<string, { scores: number[] }>()
  peerEvals
    .filter((e) => e[hasKey])
    .forEach((e) => {
      ;((e[qKey] || []) as any[]).forEach((qs: any) => {
        const qid = normalizeQuestionId(String(qs?.questionId || '').trim())
        if (!qid) return
        const v = Number(qs?.score || 0)
        if (!Number.isFinite(v) || v <= 0) return
        const cur = peerQuestionScores.get(qid) || { scores: [] as number[] }
        cur.scores.push(v)
        peerQuestionScores.set(qid, cur)
      })
    })

  const trimByQuestion = new Map<string, TrimDetail>()
  peerQuestionScores.forEach((v, qid) => {
    trimByQuestion.set(qid, trimmedMeanDetail(v.scores))
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
        const peerTrimmed = tm.value ? Math.round(Number(tm.value) * 10) / 10 : 0
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

  return {
    categoryCompare: trim.categoryCompare,
    peerAvgTrimmed: trim.peerAvgTrimmed,
    overallAvgTrimmed: trim.overallAvgTrimmed,
    score100: scoreToPercent100(avg, maxScale),
    score100Trimmed: scoreToPercent100(trim.overallAvgTrimmed, maxScale),
    questionCount,
    maxScale,
  }
}
