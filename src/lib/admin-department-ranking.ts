import {
  DEPT_SIZE_TIER_DISPLAY_ORDER,
  departmentSizeTier,
  type DepartmentSizeTier,
} from '@/lib/department-size-tier'

export type DepartmentRankingRow = {
  department: string
  peopleCount: number
  avgOverall: number
  bestPerson: string
  bestScore: number
  worstPerson: string
  worstScore: number
  sizeTier: DepartmentSizeTier
  rankInTier: number
}

export type DepartmentRankingGroups = {
  tiers: Array<{ tier: DepartmentSizeTier; rows: DepartmentRankingRow[] }>
  allRows: DepartmentRankingRow[]
}

export function buildDepartmentRankingGroups<T>(
  items: T[],
  opts: {
    include: (item: T) => boolean
    departmentOf: (item: T) => string
    personNameOf: (item: T) => string
    scoreOf: (item: T) => number
  }
): DepartmentRankingGroups {
  type Agg = { sum: number; count: number; people: Array<{ name: string; score: number }> }
  const map = new Map<string, Agg>()
  items.forEach((item) => {
    if (!opts.include(item)) return
    const dept = opts.departmentOf(item)
    const score = opts.scoreOf(item)
    const cur = map.get(dept) || { sum: 0, count: 0, people: [] }
    cur.sum += score
    cur.count += 1
    cur.people.push({ name: opts.personNameOf(item), score: Math.round(score * 100) / 100 })
    map.set(dept, cur)
  })
  const baseRows = Array.from(map.entries()).map(([department, v]) => {
    const avgOverall = v.count ? Math.round((v.sum / v.count) * 100) / 100 : 0
    const sortedP = [...v.people].sort((a, b) => b.score - a.score)
    const best = sortedP[0]
    const worst = sortedP[sortedP.length - 1]
    return {
      department,
      peopleCount: v.count,
      avgOverall,
      bestPerson: best?.name || '—',
      bestScore: best?.score ?? 0,
      worstPerson: worst?.name || '—',
      worstScore: worst?.score ?? 0,
      sizeTier: departmentSizeTier(v.count),
      rankInTier: 0,
    }
  })
  const byTier = new Map<DepartmentSizeTier, DepartmentRankingRow[]>()
  DEPT_SIZE_TIER_DISPLAY_ORDER.forEach((tier) => byTier.set(tier, []))
  baseRows.forEach((row) => {
    byTier.get(row.sizeTier)!.push(row)
  })
  const tiers = DEPT_SIZE_TIER_DISPLAY_ORDER.map((tier) => {
    const sorted = [...(byTier.get(tier) || [])].sort((a, b) => b.avgOverall - a.avgOverall)
    return {
      tier,
      rows: sorted.map((r, idx) => ({ ...r, rankInTier: idx + 1 })),
    }
  }).filter((g) => g.rows.length > 0)
  const allRows = tiers.flatMap((g) => g.rows)
  return { tiers, allRows }
}

export type DeptPeopleGroup<TRow> = {
  department: string
  peopleCount: number
  avgOverall: number
  rows: TRow[]
}

export function buildDepartmentPeopleRankingGroups<T, TRow>(
  items: T[],
  opts: {
    include: (item: T) => boolean
    departmentOf: (item: T) => string
    scoreOf: (item: T) => number
    mapRow: (item: T, rankInDept: number) => TRow
  }
): DeptPeopleGroup<TRow>[] {
  const byDept = new Map<string, T[]>()
  items.forEach((item) => {
    if (!opts.include(item)) return
    const dept = opts.departmentOf(item)
    const cur = byDept.get(dept) || []
    cur.push(item)
    byDept.set(dept, cur)
  })
  const groups: DeptPeopleGroup<TRow>[] = []
  byDept.forEach((people, department) => {
    const sorted = [...people].sort((a, b) => opts.scoreOf(b) - opts.scoreOf(a))
    const sum = sorted.reduce((s, item) => s + opts.scoreOf(item), 0)
    const avgOverall = Math.round((sum / sorted.length) * 100) / 100
    groups.push({
      department,
      peopleCount: sorted.length,
      avgOverall,
      rows: sorted.map((item, idx) => opts.mapRow(item, idx + 1)),
    })
  })
  groups.sort((a, b) => b.peopleCount - a.peopleCount || b.avgOverall - a.avgOverall)
  return groups
}

export function buildDepartmentRankingFromMatrixStructure(
  rankings: Array<{
    targetName: string
    targetDept: string
    overallPeerAvg: number
    answeredQuestionCount: number
  }>
): DepartmentRankingGroups {
  return buildDepartmentRankingGroups(rankings, {
    include: (r) => r.overallPeerAvg > 0 && r.answeredQuestionCount > 0,
    departmentOf: (r) => normalizeResultDepartment(r.targetDept),
    personNameOf: (r) => r.targetName,
    scoreOf: (r) => r.overallPeerAvg,
  })
}

export function buildMatrixFullRanking(
  rankings: Array<{
    targetId: string
    targetName: string
    targetDept: string
    overallPeerAvg: number
    answeredQuestionCount: number
  }>
): Array<{
  rank: number
  targetId: string
  name: string
  dept: string
  matrixScore: number
  questionCount: number
}> {
  return rankings
    .filter((r) => r.overallPeerAvg > 0 && r.answeredQuestionCount > 0)
    .map((r, idx) => ({
      rank: idx + 1,
      targetId: r.targetId,
      name: r.targetName,
      dept: normalizeResultDepartment(r.targetDept),
      matrixScore: Math.round(r.overallPeerAvg * 100) / 100,
      questionCount: r.answeredQuestionCount,
    }))
}

export function buildMatrixDepartmentPeopleRankingGroups(
  rankings: Array<{
    targetId: string
    targetName: string
    targetDept: string
    overallPeerAvg: number
    answeredQuestionCount: number
  }>
): DeptPeopleGroup<{
  rankInDept: number
  targetId: string
  name: string
  matrixScore: number
  questionCount: number
}>[] {
  return buildDepartmentPeopleRankingGroups(rankings, {
    include: (r) => r.overallPeerAvg > 0 && r.answeredQuestionCount > 0,
    departmentOf: (r) => normalizeResultDepartment(r.targetDept),
    scoreOf: (r) => r.overallPeerAvg,
    mapRow: (r, rankInDept) => ({
      rankInDept,
      targetId: r.targetId,
      name: r.targetName,
      matrixScore: Math.round(r.overallPeerAvg * 100) / 100,
      questionCount: r.answeredQuestionCount,
    }),
  })
}

export type PeriodComparisonPersonRow = {
  name: string
  dept: string
  cur: number
  prev: number
  delta: number
}

export type PeriodComparisonDeptRow = {
  department: string
  cur: number
  prev: number
  delta: number
  nCur: number
  nPrev: number
}

export type PeriodComparisonTrend = {
  peopleUp: PeriodComparisonPersonRow[]
  peopleDown: PeriodComparisonPersonRow[]
  deptMoves: PeriodComparisonDeptRow[]
  usesMatrixScoring: boolean
}

const PERIOD_TREND_N = 8

function roundPeriodScore(n: number) {
  return Math.round(n * 100) / 100
}

function finalizePeriodComparisonTrend(
  people: PeriodComparisonPersonRow[],
  deptMoves: PeriodComparisonDeptRow[],
  usesMatrixScoring: boolean
): PeriodComparisonTrend {
  const byDeltaDesc = [...people].sort((a, b) => b.delta - a.delta)
  const byDeltaAsc = [...people].sort((a, b) => a.delta - b.delta)
  return {
    peopleUp: byDeltaDesc.filter((x) => x.delta > 0).slice(0, PERIOD_TREND_N),
    peopleDown: byDeltaAsc.filter((x) => x.delta < 0).slice(0, PERIOD_TREND_N),
    deptMoves: deptMoves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    usesMatrixScoring,
  }
}

function buildDeptMovesFromScoreMaps(
  curMap: Map<string, { sum: number; count: number }>,
  prevMap: Map<string, { sum: number; count: number }>
): PeriodComparisonDeptRow[] {
  const deptKeys = new Set<string>([...curMap.keys(), ...prevMap.keys()])
  const deptMoves: PeriodComparisonDeptRow[] = []
  deptKeys.forEach((department) => {
    const c = curMap.get(department)
    const p = prevMap.get(department)
    const nCur = c?.count ?? 0
    const nPrev = p?.count ?? 0
    if (!nCur || !nPrev) return
    const curAvg = roundPeriodScore(c!.sum / nCur)
    const prevAvg = roundPeriodScore(p!.sum / nPrev)
    deptMoves.push({
      department,
      cur: curAvg,
      prev: prevAvg,
      delta: roundPeriodScore(curAvg - prevAvg),
      nCur,
      nPrev,
    })
  })
  return deptMoves
}

export function buildPeriodComparisonTrendFromResults(
  results: Array<{ targetId: string; targetName: string; targetDept: string; overallAvg?: number | null }>,
  prevResults: Array<{ targetId: string; targetName: string; targetDept: string; overallAvg?: number | null }>
): PeriodComparisonTrend {
  if (!results.length || !prevResults.length) {
    return { peopleUp: [], peopleDown: [], deptMoves: [], usesMatrixScoring: false }
  }
  const prevByTarget = new Map<string, number>()
  prevResults.forEach((r) => {
    prevByTarget.set(String(r.targetId), Number(r.overallAvg || 0))
  })
  const people: PeriodComparisonPersonRow[] = []
  results.forEach((r) => {
    const pid = String(r.targetId)
    if (!prevByTarget.has(pid)) return
    const prev = prevByTarget.get(pid)!
    const cur = Number(r.overallAvg || 0)
    people.push({
      name: r.targetName,
      dept: normalizeResultDepartment(r.targetDept),
      cur: roundPeriodScore(cur),
      prev: roundPeriodScore(prev),
      delta: roundPeriodScore(cur - prev),
    })
  })
  const deptAgg = (rows: typeof results) => {
    const m = new Map<string, { sum: number; count: number }>()
    rows.forEach((r) => {
      const d = normalizeResultDepartment(r.targetDept)
      const cur = m.get(d) || { sum: 0, count: 0 }
      cur.sum += Number(r.overallAvg || 0)
      cur.count += 1
      m.set(d, cur)
    })
    return m
  }
  return finalizePeriodComparisonTrend(people, buildDeptMovesFromScoreMaps(deptAgg(results), deptAgg(prevResults)), false)
}

export function buildMatrixPeriodComparisonTrend(
  rankings: Array<{
    targetId: string
    targetName: string
    targetDept: string
    overallPeerAvg: number
    answeredQuestionCount: number
  }>,
  prevRankings: Array<{
    targetId: string
    targetName: string
    targetDept: string
    overallPeerAvg: number
    answeredQuestionCount: number
  }>
): PeriodComparisonTrend {
  if (!rankings.length || !prevRankings.length) {
    return { peopleUp: [], peopleDown: [], deptMoves: [], usesMatrixScoring: true }
  }
  const prevByTarget = new Map<string, number>()
  prevRankings.forEach((r) => {
    if (r.overallPeerAvg > 0 && r.answeredQuestionCount > 0) {
      prevByTarget.set(String(r.targetId), roundPeriodScore(r.overallPeerAvg))
    }
  })
  const people: PeriodComparisonPersonRow[] = []
  rankings.forEach((r) => {
    if (r.overallPeerAvg <= 0 || r.answeredQuestionCount <= 0) return
    const pid = String(r.targetId)
    if (!prevByTarget.has(pid)) return
    const prev = prevByTarget.get(pid)!
    const cur = roundPeriodScore(r.overallPeerAvg)
    people.push({
      name: r.targetName,
      dept: normalizeResultDepartment(r.targetDept),
      cur,
      prev,
      delta: roundPeriodScore(cur - prev),
    })
  })
  const deptAgg = (rows: typeof rankings) => {
    const m = new Map<string, { sum: number; count: number }>()
    rows.forEach((r) => {
      if (r.overallPeerAvg <= 0 || r.answeredQuestionCount <= 0) return
      const d = normalizeResultDepartment(r.targetDept)
      const cur = m.get(d) || { sum: 0, count: 0 }
      cur.sum += r.overallPeerAvg
      cur.count += 1
      m.set(d, cur)
    })
    return m
  }
  return finalizePeriodComparisonTrend(people, buildDeptMovesFromScoreMaps(deptAgg(rankings), deptAgg(prevRankings)), true)
}

export type CategoryPeerHighlightRow = {
  name: string
  dept: string
  peer: number
}

export type CategoryPeerHighlightBlock = {
  cat: string
  categoryKey: string
  count: number
  top: CategoryPeerHighlightRow[]
  bottom: CategoryPeerHighlightRow[]
}

export function buildMatrixCategoryPeerHighlights(
  rankings: Array<{
    targetName: string
    targetDept: string
    categories: Array<{
      categoryKey: string
      categoryLabel: string
      peerAvg: number
      answeredQuestionCount: number
    }>
  }>,
  categoryOrder?: Array<{ key: string; label: string }>
): CategoryPeerHighlightBlock[] {
  const byCatKey = new Map<string, { label: string; rows: CategoryPeerHighlightRow[] }>()
  rankings.forEach((person) => {
    person.categories.forEach((cat) => {
      if (cat.peerAvg <= 0 || cat.answeredQuestionCount <= 0) return
      const key = cat.categoryKey || cat.categoryLabel
      const cur = byCatKey.get(key) || { label: cat.categoryLabel, rows: [] }
      cur.rows.push({
        name: person.targetName,
        dept: normalizeResultDepartment(person.targetDept),
        peer: roundPeriodScore(cat.peerAvg),
      })
      byCatKey.set(key, cur)
    })
  })
  const blocks = [...byCatKey.entries()]
    .map(([categoryKey, v]) => {
      const rows = [...v.rows].sort((a, b) => b.peer - a.peer)
      return {
        categoryKey,
        cat: v.label,
        count: rows.length,
        top: rows.slice(0, 3),
        bottom: [...rows].sort((a, b) => a.peer - b.peer).slice(0, 3),
      }
    })
    .filter((b) => b.count >= 2)
  if (categoryOrder?.length) {
    const orderMap = new Map(categoryOrder.map((c, i) => [c.key, i]))
    blocks.sort((a, b) => {
      const ia = orderMap.get(a.categoryKey) ?? 999
      const ib = orderMap.get(b.categoryKey) ?? 999
      if (ia !== ib) return ia - ib
      return a.cat.localeCompare(b.cat, 'tr')
    })
  } else {
    blocks.sort((a, b) => b.count - a.count || a.cat.localeCompare(b.cat, 'tr'))
  }
  return blocks
}

export function buildLegacyCategoryPeerHighlightsFromResults(
  results: Array<{
    targetName: string
    targetDept: string
    categoryCompare?: Array<{ name?: string; peer?: number | null }>
  }>
): CategoryPeerHighlightBlock[] {
  const catNames = new Set<string>()
  results.forEach((r) => {
    ;(r.categoryCompare || []).forEach((c) => {
      const name = String(c?.name || '').trim()
      if (name) catNames.add(name)
    })
  })
  return Array.from(catNames)
    .map((cat) => {
      const rows: CategoryPeerHighlightRow[] = []
      results.forEach((r) => {
        const cc = (r.categoryCompare || []).find((c) => String(c?.name || '') === cat)
        const peer = Number(cc?.peer || 0)
        if (peer > 0) {
          rows.push({
            name: r.targetName,
            dept: normalizeResultDepartment(r.targetDept),
            peer: roundPeriodScore(peer),
          })
        }
      })
      rows.sort((a, b) => b.peer - a.peer)
      return { categoryKey: cat, cat, count: rows.length, top: rows.slice(0, 3), bottom: [...rows].sort((a, b) => a.peer - b.peer).slice(0, 3) }
    })
    .filter((b) => b.count >= 2)
    .sort((a, b) => b.count - a.count)
}

export type SelfTeamGapCategoryRow = {
  person: string
  dept: string
  category: string
  self: number
  peer: number
  diff: number
}

export type SelfTeamGapQuestionRow = {
  person: string
  dept: string
  category: string
  question: string
  self: number
  peer: number
  diff: number
}

export type SelfTeamGapReports = {
  topCategoryGaps: SelfTeamGapCategoryRow[]
  topQuestionGaps: SelfTeamGapQuestionRow[]
  usesMatrixScoring: boolean
}

const GAP_TOP_N = 25

function normCategoryKey(s: string) {
  return String(s || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
}

function findSelfQuestionScore(
  result: {
    categoryQuestions?: Record<
      string,
      Array<{ questionId?: string; self?: number; selfCount?: number }>
    >
  },
  questionId: string
): number {
  const qid = String(questionId || '').trim()
  if (!qid) return 0
  for (const rows of Object.values(result.categoryQuestions || {})) {
    const hit = (rows || []).find((x) => String(x.questionId || '').trim() === qid)
    if (hit && Number(hit.selfCount || 0) > 0 && Number(hit.self || 0) > 0) {
      return roundPeriodScore(Number(hit.self))
    }
  }
  return 0
}

function categorySelfScore(
  result: {
    categoryCompare?: Array<{ name?: string; self?: number }>
    categoryQuestions?: Record<
      string,
      Array<{ questionId?: string; self?: number; selfCount?: number }>
    >
  },
  categoryLabel: string,
  questionIds: string[]
): number {
  const fromQuestions = questionIds
    .map((qid) => findSelfQuestionScore(result, qid))
    .filter((s) => s > 0)
  if (fromQuestions.length) {
    return roundPeriodScore(fromQuestions.reduce((a, b) => a + b, 0) / fromQuestions.length)
  }
  const cc = (result.categoryCompare || []).find(
    (c) => normCategoryKey(String(c.name || '')) === normCategoryKey(categoryLabel)
  )
  if (cc && Number(cc.self || 0) > 0) return roundPeriodScore(Number(cc.self))
  return 0
}

export function buildMatrixSelfTeamGapReports(
  rankings: Array<{
    targetId: string
    targetName: string
    targetDept: string
    categories: Array<{
      categoryKey: string
      categoryLabel: string
      peerAvg: number
      answeredQuestionCount: number
    }>
    questions: Array<{
      questionId: string
      questionText: string
      categoryKey?: string
      categoryLabel: string
      peerAvg: number
      scorerCount: number
    }>
  }>,
  results: Array<{
    targetId: string
    categoryCompare?: Array<{ name?: string; self?: number }>
    categoryQuestions?: Record<
      string,
      Array<{ questionId?: string; questionText?: string; self?: number; selfCount?: number }>
    >
  }>,
  resolveQuestionLabel?: (questionId: string, fallbackText: string) => string
): SelfTeamGapReports {
  const resultsByTarget = new Map(results.map((r) => [String(r.targetId), r]))
  const categoryRows: SelfTeamGapCategoryRow[] = []
  const questionRows: SelfTeamGapQuestionRow[] = []

  rankings.forEach((person) => {
    const result = resultsByTarget.get(String(person.targetId))
    if (!result) return
    const dept = normalizeResultDepartment(person.targetDept)

    person.categories.forEach((cat) => {
      if (cat.peerAvg <= 0 || cat.answeredQuestionCount <= 0) return
      const questionIds = person.questions
        .filter((q) => {
          const qCat = normCategoryKey(q.categoryLabel)
          const cCat = normCategoryKey(cat.categoryLabel)
          const cKey = normCategoryKey(cat.categoryKey)
          return qCat === cCat || (cKey.length > 0 && normCategoryKey(String((q as { categoryKey?: string }).categoryKey || '')) === cKey)
        })
        .map((q) => q.questionId)
      const self = categorySelfScore(result, cat.categoryLabel, questionIds)
      const peer = roundPeriodScore(cat.peerAvg)
      if (!(self > 0 && peer > 0)) return
      categoryRows.push({
        person: person.targetName,
        dept,
        category: cat.categoryLabel,
        self,
        peer,
        diff: roundPeriodScore(self - peer),
      })
    })

    person.questions.forEach((q) => {
      if (q.peerAvg <= 0 || q.scorerCount <= 0) return
      const self = findSelfQuestionScore(result, q.questionId)
      const peer = roundPeriodScore(q.peerAvg)
      if (!(self > 0 && peer > 0)) return
      const questionText = resolveQuestionLabel
        ? resolveQuestionLabel(q.questionId, q.questionText)
        : q.questionText
      questionRows.push({
        person: person.targetName,
        dept,
        category: q.categoryLabel,
        question: questionText,
        self,
        peer,
        diff: roundPeriodScore(self - peer),
      })
    })
  })

  const byAbsDesc = <T extends { diff: number }>(a: T, b: T) => Math.abs(b.diff) - Math.abs(a.diff)
  categoryRows.sort(byAbsDesc)
  questionRows.sort(byAbsDesc)

  return {
    topCategoryGaps: categoryRows.slice(0, GAP_TOP_N),
    topQuestionGaps: questionRows.slice(0, GAP_TOP_N),
    usesMatrixScoring: true,
  }
}

export function buildLegacySelfTeamGapReports(
  results: Array<{
    targetName: string
    targetDept: string
    categoryCompare?: Array<{ name?: string; self?: number; peer?: number; diff?: number }>
    categoryQuestions?: Record<
      string,
      Array<{
        questionId?: string
        questionText?: string
        categoryLabel?: string
        categoryKey?: string
        self?: number
        peer?: number
        selfCount?: number
        peerCount?: number
        diff?: number
      }>
    >
  }>,
  resolveQuestionLabel?: (questionId: string, fallbackText: string) => string
): SelfTeamGapReports {
  const categoryRows: SelfTeamGapCategoryRow[] = []
  const questionRows: SelfTeamGapQuestionRow[] = []

  results.forEach((r) => {
    ;(r.categoryCompare || []).forEach((c) => {
      const self = Number(c?.self || 0)
      const peer = Number(c?.peer || 0)
      if (!(self > 0 && peer > 0)) return
      const diff = Number(c?.diff ?? self - peer)
      categoryRows.push({
        person: r.targetName,
        dept: normalizeResultDepartment(r.targetDept),
        category: String(c?.name || ''),
        self: roundPeriodScore(self),
        peer: roundPeriodScore(peer),
        diff: roundPeriodScore(diff),
      })
    })
    Object.values(r.categoryQuestions || {}).forEach((qs) => {
      ;(qs || []).forEach((q) => {
        const selfCount = Number(q?.selfCount || 0)
        const peerCount = Number(q?.peerCount || 0)
        if (!(selfCount > 0 && peerCount > 0)) return
        const self = Number(q?.self || 0)
        const peer = Number(q?.peer || 0)
        const diff = Number(q?.diff ?? self - peer)
        const catLabel = String(q?.categoryLabel || q?.categoryKey || '')
        questionRows.push({
          person: r.targetName,
          dept: normalizeResultDepartment(r.targetDept),
          category: catLabel,
          question: resolveQuestionLabel
            ? resolveQuestionLabel(String(q?.questionId || ''), String(q?.questionText || ''))
            : String(q?.questionText || ''),
          self: roundPeriodScore(self),
          peer: roundPeriodScore(peer),
          diff: roundPeriodScore(diff),
        })
      })
    })
  })

  const byAbsDesc = <T extends { diff: number }>(a: T, b: T) => Math.abs(b.diff) - Math.abs(a.diff)
  categoryRows.sort(byAbsDesc)
  questionRows.sort(byAbsDesc)

  return {
    topCategoryGaps: categoryRows.slice(0, GAP_TOP_N),
    topQuestionGaps: questionRows.slice(0, GAP_TOP_N),
    usesMatrixScoring: false,
  }
}

export function normalizeResultDepartment(dept: string | undefined | null): string {
  return String(dept || '-').trim() || '-'
}
