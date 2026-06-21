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

export type DepartmentCategoryHeatmap = {
  categories: string[]
  departments: string[]
  value: (dept: string, cat: string) => number | null
  color: (v: number | null) => string
  usesMatrixScoring: boolean
}

export function departmentCategoryHeatmapColor(v: number | null): string {
  if (v === null) return 'bg-[var(--surface-2)]'
  if (v >= 4) return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100'
  if (v >= 3) return 'bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100'
  if (v >= 2) return 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
  return 'bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-100'
}

function buildDepartmentCategoryHeatmapFromAgg(
  deptMap: Map<string, Map<string, { sum: number; count: number }>>,
  categoriesSet: Set<string>,
  categoryOrder?: Array<{ key: string; label: string }>,
  usesMatrixScoring = false
): DepartmentCategoryHeatmap {
  let categories = Array.from(categoriesSet.values())
  if (categoryOrder?.length) {
    const orderLabels = categoryOrder.map((c) => c.label)
    const orderSet = new Set(orderLabels)
    categories = [
      ...orderLabels.filter((l) => categoriesSet.has(l)),
      ...categories.filter((c) => !orderSet.has(c)).sort((a, b) => a.localeCompare(b, 'tr')),
    ]
  } else {
    categories.sort((a, b) => a.localeCompare(b, 'tr'))
  }
  const departments = Array.from(deptMap.keys()).sort((a, b) => a.localeCompare(b, 'tr'))
  const value = (dept: string, cat: string) => {
    const cur = deptMap.get(dept)?.get(cat)
    if (!cur?.count) return null
    return roundPeriodScore(cur.sum / cur.count)
  }
  return {
    categories,
    departments,
    value,
    color: departmentCategoryHeatmapColor,
    usesMatrixScoring,
  }
}

export function buildMatrixDepartmentCategoryHeatmap(
  rankings: Array<{
    targetDept: string
    categories: Array<{
      categoryLabel: string
      peerAvg: number
      answeredQuestionCount: number
    }>
  }>,
  categoryOrder?: Array<{ key: string; label: string }>
): DepartmentCategoryHeatmap {
  const deptMap = new Map<string, Map<string, { sum: number; count: number }>>()
  const categoriesSet = new Set<string>()
  rankings.forEach((person) => {
    const dept = normalizeResultDepartment(person.targetDept)
    person.categories.forEach((cat) => {
      if (cat.peerAvg <= 0 || cat.answeredQuestionCount <= 0) return
      const label = cat.categoryLabel
      categoriesSet.add(label)
      const d = deptMap.get(dept) || new Map<string, { sum: number; count: number }>()
      const cur = d.get(label) || { sum: 0, count: 0 }
      cur.sum += cat.peerAvg
      cur.count += 1
      d.set(label, cur)
      deptMap.set(dept, d)
    })
  })
  return buildDepartmentCategoryHeatmapFromAgg(deptMap, categoriesSet, categoryOrder, true)
}

export function buildLegacyDepartmentCategoryHeatmap(
  results: Array<{
    targetDept: string
    categoryCompare?: Array<{ name?: string; peer?: number | null }>
  }>
): DepartmentCategoryHeatmap {
  const deptMap = new Map<string, Map<string, { sum: number; count: number }>>()
  const categoriesSet = new Set<string>()
  results.forEach((r) => {
    const dept = normalizeResultDepartment(r.targetDept)
    ;(r.categoryCompare || []).forEach((c) => {
      const cat = String(c?.name || '').trim()
      if (!cat) return
      const peer = Number(c?.peer || 0)
      if (!Number.isFinite(peer) || peer <= 0) return
      categoriesSet.add(cat)
      const d = deptMap.get(dept) || new Map<string, { sum: number; count: number }>()
      const cur = d.get(cat) || { sum: 0, count: 0 }
      cur.sum += peer
      cur.count += 1
      d.set(cat, cur)
      deptMap.set(dept, d)
    })
  })
  return buildDepartmentCategoryHeatmapFromAgg(deptMap, categoriesSet, undefined, false)
}

export type ScoreDistributionBucket = { label: string; count: number }

export type CategorySummaryRow = { name: string; avg: number }

export type MatrixChartsReport = {
  overallDistribution: ScoreDistributionBucket[]
  categorySummary: { top: CategorySummaryRow[]; bottom: CategorySummaryRow[] }
  usesMatrixScoring: boolean
}

const SCORE_DISTRIBUTION_BUCKETS = [
  { label: '0-2', from: 0, to: 2 },
  { label: '2-3', from: 2, to: 3 },
  { label: '3-4', from: 3, to: 4 },
  { label: '4-5', from: 4, to: 5.01 },
]

function bucketOverallScores(scores: number[]): ScoreDistributionBucket[] {
  const buckets = SCORE_DISTRIBUTION_BUCKETS.map((b) => ({ label: b.label, count: 0 }))
  scores.forEach((raw) => {
    const v = Number(raw || 0)
    if (!Number.isFinite(v) || v <= 0) return
    const bucket = SCORE_DISTRIBUTION_BUCKETS.find((x) => v >= x.from && v < x.to)
    if (!bucket) return
    const idx = SCORE_DISTRIBUTION_BUCKETS.indexOf(bucket)
    buckets[idx].count += 1
  })
  return buckets
}

function buildCategorySummaryRows(
  map: Record<string, { sum: number; count: number }>
): { top: CategorySummaryRow[]; bottom: CategorySummaryRow[] } {
  const rows = Object.entries(map)
    .map(([name, v]) => ({
      name,
      avg: v.count ? roundPeriodScore(v.sum / v.count) : 0,
    }))
    .filter((r) => r.avg > 0)
    .sort((a, b) => b.avg - a.avg)
  return {
    top: rows.slice(0, 5),
    bottom: rows.slice(-5).reverse(),
  }
}

export function buildMatrixChartsReport(
  rankings: Array<{
    overallPeerAvg: number
    answeredQuestionCount: number
    categories: Array<{
      categoryLabel: string
      peerAvg: number
      answeredQuestionCount: number
    }>
  }>
): MatrixChartsReport {
  const scores = rankings
    .filter((r) => r.overallPeerAvg > 0 && r.answeredQuestionCount > 0)
    .map((r) => r.overallPeerAvg)
  const map: Record<string, { sum: number; count: number }> = {}
  rankings.forEach((person) => {
    person.categories.forEach((cat) => {
      if (cat.peerAvg <= 0 || cat.answeredQuestionCount <= 0) return
      const name = cat.categoryLabel
      if (!map[name]) map[name] = { sum: 0, count: 0 }
      map[name].sum += cat.peerAvg
      map[name].count += 1
    })
  })
  return {
    overallDistribution: bucketOverallScores(scores),
    categorySummary: buildCategorySummaryRows(map),
    usesMatrixScoring: true,
  }
}

export function buildLegacyChartsReport(
  results: Array<{
    overallAvg?: number | null
    categoryCompare?: Array<{ name?: string; peer?: number | null }>
  }>
): MatrixChartsReport {
  const scores = results.map((r) => Number(r.overallAvg || 0)).filter((n) => n > 0)
  const map: Record<string, { sum: number; count: number }> = {}
  results.forEach((r) => {
    ;(r.categoryCompare || []).forEach((c) => {
      const name = String(c?.name || '').trim()
      if (!name) return
      const peer = Number(c?.peer || 0)
      if (!Number.isFinite(peer) || peer <= 0) return
      if (!map[name]) map[name] = { sum: 0, count: 0 }
      map[name].sum += peer
      map[name].count += 1
    })
  })
  return {
    overallDistribution: bucketOverallScores(scores),
    categorySummary: buildCategorySummaryRows(map),
    usesMatrixScoring: false,
  }
}

export function normalizeResultDepartment(dept: string | undefined | null): string {
  return String(dept || '-').trim() || '-'
}

export type DeptRiskAnalyticsWeights = {
  riskOverall: number
  riskTrend: number
  riskGap: number
  riskCoverage: number
  warningLowScoreThreshold: number
}

export type DeptRiskScorecardInput = {
  dept: string
  overall: number
  riskScore: number
}

export type RiskScorecardExplain = {
  lowScore: number
  trend: number
  gap: number
  coverage: number
}

export type RiskScorecardRow = {
  targetId: string
  name: string
  dept: string
  overall: number
  overallTrim: number
  combinedOverall: number | null
  combinedOverallTrim: number | null
  hasCombined: boolean
  delta: number
  deltaTrim: number
  deltaCombined: number | null
  deltaCombinedTrim: number | null
  avgGap: number
  peerEvalCount: number
  riskScore: number
  riskScoreTrim: number
  riskScoreCombined: number | null
  riskScoreCombinedTrim: number | null
  explain: RiskScorecardExplain
  explainTrim: RiskScorecardExplain
  explainCombined: RiskScorecardExplain | null
  explainCombinedTrim: RiskScorecardExplain | null
}

export type OrganizationHealthReport = {
  score: number
  parts: { performance: number; participation: number; coverage: number; trend: number }
  usesMatrixScoring: boolean
}

export type OrganizationHealthWeights = {
  healthPerformance: number
  healthParticipation: number
  healthCoverage: number
  healthTrend: number
}

export type DepartmentAnalyticsRow = {
  department: string
  people: number
  avgRisk: number
  highRisk: number
  lowScore: number
  avgOverall: number
  delta: number | null
  rank: number
}

export type DepartmentAnalyticsReport = {
  riskRank: DepartmentAnalyticsRow[]
  healthRank: DepartmentAnalyticsRow[]
  usesMatrixScoring: boolean
}

function deptAnalyticsClamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function normalizeDeptRiskWeights(w: DeptRiskAnalyticsWeights) {
  const sum = w.riskOverall + w.riskTrend + w.riskGap + w.riskCoverage || 1
  return {
    riskOverall: w.riskOverall / sum,
    riskTrend: w.riskTrend / sum,
    riskGap: w.riskGap / sum,
    riskCoverage: w.riskCoverage / sum,
  }
}

function matrixPeerEvaluatorCount(person: {
  questions: Array<{ scorers?: Array<{ evaluatorId: string }> }>
}) {
  const ids = new Set<string>()
  for (const q of person.questions) {
    for (const s of q.scorers || []) {
      if (s.evaluatorId) ids.add(s.evaluatorId)
    }
  }
  return ids.size
}

function matrixPersonAvgSelfTeamGap(
  person: {
    categories: Array<{
      categoryKey: string
      categoryLabel: string
      peerAvg: number
      answeredQuestionCount: number
    }>
    questions: Array<{ questionId: string; categoryLabel: string; categoryKey?: string }>
  },
  result:
    | {
        categoryCompare?: Array<{ name?: string; self?: number }>
        categoryQuestions?: Record<
          string,
          Array<{ questionId?: string; questionText?: string; self?: number; selfCount?: number }>
        >
      }
    | undefined
): number {
  if (!result) return 0
  const gaps: number[] = []
  person.categories.forEach((cat) => {
    if (cat.peerAvg <= 0 || cat.answeredQuestionCount <= 0) return
    const questionIds = person.questions
      .filter((q) => {
        const qCat = normCategoryKey(q.categoryLabel)
        const cCat = normCategoryKey(cat.categoryLabel)
        const cKey = normCategoryKey(cat.categoryKey)
        return qCat === cCat || (cKey.length > 0 && normCategoryKey(String(q.categoryKey || '')) === cKey)
      })
      .map((q) => q.questionId)
    const self = categorySelfScore(result, cat.categoryLabel, questionIds)
    const peer = roundPeriodScore(cat.peerAvg)
    if (self > 0 && peer > 0) gaps.push(Math.abs(self - peer))
  })
  return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
}

/** MATRIX yapı kişi puanlarından tam risk kartı (kurum sağlığı ekranı). */
export function buildMatrixRiskScorecard(
  rankings: Array<{
    targetId: string
    targetName: string
    targetDept: string
    overallPeerAvg: number
    answeredQuestionCount: number
    categories: Array<{
      categoryKey: string
      categoryLabel: string
      peerAvg: number
      answeredQuestionCount: number
    }>
    questions: Array<{
      questionId: string
      categoryLabel: string
      categoryKey?: string
      scorers?: Array<{ evaluatorId: string }>
    }>
  }>,
  prevRankings: Array<{
    targetId: string
    overallPeerAvg: number
    answeredQuestionCount: number
  }>,
  results: Array<{
    targetId: string
    categoryCompare?: Array<{ name?: string; self?: number }>
    categoryQuestions?: Record<
      string,
      Array<{ questionId?: string; questionText?: string; self?: number; selfCount?: number }>
    >
  }>,
  weights: DeptRiskAnalyticsWeights
): RiskScorecardRow[] {
  const prevByTarget = new Map<string, number>()
  prevRankings.forEach((r) => {
    if (r.overallPeerAvg > 0 && r.answeredQuestionCount > 0) {
      prevByTarget.set(String(r.targetId), roundPeriodScore(r.overallPeerAvg))
    }
  })
  const resultsByTarget = new Map(results.map((r) => [String(r.targetId), r]))
  const w = normalizeDeptRiskWeights(weights)

  const rows: RiskScorecardRow[] = []
  rankings.forEach((person) => {
    if (person.overallPeerAvg <= 0 || person.answeredQuestionCount <= 0) return
    const overall = roundPeriodScore(person.overallPeerAvg)
    const prev = prevByTarget.get(String(person.targetId))
    const delta = prev === undefined ? 0 : roundPeriodScore(overall - prev)
    const lowScoreRisk = deptAnalyticsClamp01((3.5 - overall) / 2.5)
    const trendRisk = prev === undefined ? 0.5 : deptAnalyticsClamp01((0 - delta) / 1.2)
    const avgGap = roundPeriodScore(matrixPersonAvgSelfTeamGap(person, resultsByTarget.get(String(person.targetId))))
    const gapRisk = deptAnalyticsClamp01(avgGap / 1.5)
    const peerEvalCount = matrixPeerEvaluatorCount(person)
    const coverageRisk = deptAnalyticsClamp01((4 - Math.min(4, peerEvalCount)) / 4)
    const explain: RiskScorecardExplain = {
      lowScore: Math.round(lowScoreRisk * 100),
      trend: Math.round(trendRisk * 100),
      gap: Math.round(gapRisk * 100),
      coverage: Math.round(coverageRisk * 100),
    }
    const riskScore = Math.round(
      100 *
        (w.riskOverall * lowScoreRisk +
          w.riskTrend * trendRisk +
          w.riskGap * gapRisk +
          w.riskCoverage * coverageRisk)
    )
    rows.push({
      targetId: person.targetId,
      name: person.targetName,
      dept: normalizeResultDepartment(person.targetDept),
      overall,
      overallTrim: 0,
      combinedOverall: null,
      combinedOverallTrim: null,
      hasCombined: false,
      delta,
      deltaTrim: 0,
      deltaCombined: null,
      deltaCombinedTrim: null,
      avgGap,
      peerEvalCount,
      riskScore,
      riskScoreTrim: 0,
      riskScoreCombined: null,
      riskScoreCombinedTrim: null,
      explain,
      explainTrim: explain,
      explainCombined: null,
      explainCombinedTrim: null,
    })
  })

  rows.sort((a, b) => b.riskScore - a.riskScore)
  return rows
}

/** MATRIX yapı kişi puanlarından birim risk/performans analitiği için risk kartı. */
export function buildMatrixDeptRiskScorecard(
  rankings: Array<{
    targetId: string
    targetName: string
    targetDept: string
    overallPeerAvg: number
    answeredQuestionCount: number
    categories: Array<{
      categoryKey: string
      categoryLabel: string
      peerAvg: number
      answeredQuestionCount: number
    }>
    questions: Array<{
      questionId: string
      categoryLabel: string
      categoryKey?: string
      scorers?: Array<{ evaluatorId: string }>
    }>
  }>,
  prevRankings: Array<{
    targetId: string
    overallPeerAvg: number
    answeredQuestionCount: number
  }>,
  results: Array<{
    targetId: string
    categoryCompare?: Array<{ name?: string; self?: number }>
    categoryQuestions?: Record<
      string,
      Array<{ questionId?: string; questionText?: string; self?: number; selfCount?: number }>
    >
  }>,
  weights: DeptRiskAnalyticsWeights
): DeptRiskScorecardInput[] {
  return buildMatrixRiskScorecard(rankings, prevRankings, results, weights).map((r) => ({
    dept: r.dept,
    overall: r.overall,
    riskScore: r.riskScore,
  }))
}

export function buildMatrixOrganizationHealth(
  rankings: Array<{ overallPeerAvg: number; answeredQuestionCount: number }>,
  participation: { totals?: { total?: number; completed?: number } } | null | undefined,
  coverage:
    | Array<{
        managerCompleted?: number
        peerCompleted?: number
        subordinateCompleted?: number
        executiveCompleted?: number
      }>
    | null
    | undefined,
  deptMoves: Array<{ delta: number }>,
  weights: OrganizationHealthWeights
): OrganizationHealthReport {
  const scores = rankings
    .filter((r) => r.overallPeerAvg > 0 && r.answeredQuestionCount > 0)
    .map((r) => r.overallPeerAvg)
  const avgOverall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const perfScore = deptAnalyticsClamp01(avgOverall / 5)

  const participationRate = participation?.totals?.total
    ? Number(participation.totals.completed || 0) / Number(participation.totals.total || 1)
    : 0.75

  const coverageRows = coverage || []
  const coverageScore = coverageRows.length
    ? coverageRows.reduce((acc, r) => {
        const nonSelf =
          Number(r.managerCompleted || 0) +
          Number(r.peerCompleted || 0) +
          Number(r.subordinateCompleted || 0) +
          Number(r.executiveCompleted || 0)
        return acc + deptAnalyticsClamp01(nonSelf / 5)
      }, 0) / coverageRows.length
    : 0.7

  const trendScore = deptMoves.length
    ? deptMoves.reduce((acc, r) => acc + deptAnalyticsClamp01((Number(r.delta || 0) + 1) / 2), 0) / deptMoves.length
    : 0.6

  const sum =
    weights.healthPerformance +
      weights.healthParticipation +
      weights.healthCoverage +
      weights.healthTrend || 1
  const w = {
    healthPerformance: weights.healthPerformance / sum,
    healthParticipation: weights.healthParticipation / sum,
    healthCoverage: weights.healthCoverage / sum,
    healthTrend: weights.healthTrend / sum,
  }

  const score = Math.round(
    100 *
      (w.healthPerformance * perfScore +
        w.healthParticipation * participationRate +
        w.healthCoverage * coverageScore +
        w.healthTrend * trendScore)
  )

  return {
    score,
    parts: {
      performance: Math.round(perfScore * 100),
      participation: Math.round(participationRate * 100),
      coverage: Math.round(coverageScore * 100),
      trend: Math.round(trendScore * 100),
    },
    usesMatrixScoring: true,
  }
}

export function buildDepartmentAnalyticsReport(
  scorecard: DeptRiskScorecardInput[],
  deptMoves: Array<{ department: string; delta: number }>,
  warningLowScoreThreshold: number,
  usesMatrixScoring: boolean
): DepartmentAnalyticsReport {
  const byDept = new Map<string, { sumRisk: number; n: number; highRisk: number; lowScore: number; avgOverallSum: number }>()
  scorecard.forEach((r) => {
    const dept = String(r.dept || '-').trim() || '-'
    const cur = byDept.get(dept) || { sumRisk: 0, n: 0, highRisk: 0, lowScore: 0, avgOverallSum: 0 }
    cur.sumRisk += Number(r.riskScore || 0)
    cur.n += 1
    if (Number(r.riskScore || 0) >= 70) cur.highRisk += 1
    if (Number(r.overall || 0) <= warningLowScoreThreshold) cur.lowScore += 1
    cur.avgOverallSum += Number(r.overall || 0)
    byDept.set(dept, cur)
  })

  const trendByDept = new Map<string, number>()
  deptMoves.forEach((d) => trendByDept.set(String(d.department), Number(d.delta || 0)))

  const rows = Array.from(byDept.entries()).map(([department, v]) => {
    const avgRisk = v.n ? Math.round((v.sumRisk / v.n) * 100) / 100 : 0
    const avgOverall = v.n ? Math.round((v.avgOverallSum / v.n) * 100) / 100 : 0
    const delta = trendByDept.get(department) ?? null
    return {
      department,
      people: v.n,
      avgRisk,
      highRisk: v.highRisk,
      lowScore: v.lowScore,
      avgOverall,
      delta,
      rank: 0,
    }
  })

  const riskRank = [...rows].sort((a, b) => b.avgRisk - a.avgRisk).map((r, i) => ({ ...r, rank: i + 1 }))
  const healthRank = [...rows].sort((a, b) => b.avgOverall - a.avgOverall).map((r, i) => ({ ...r, rank: i + 1 }))

  return { riskRank, healthRank, usesMatrixScoring }
}

export type EarlyWarningItem = {
  level: 'high' | 'medium'
  title: string
  detail: string
}

export type WarningRuleItem = {
  key: string
  title: string
  logic: string
  count: number
}

export type EarlyWarningsReport = {
  warnings: EarlyWarningItem[]
  rules: WarningRuleItem[]
  usesMatrixScoring: boolean
}

const EARLY_WARNING_HIGH_GAP = 1.0
const EARLY_WARNING_LOW_COVERAGE = 3

function earlyWarningLabel(
  lang: 'tr' | 'en' | 'fr',
  key:
    | 'high_risk_people'
    | 'low_score'
    | 'dept_drop'
    | 'person_drop'
    | 'low_coverage'
    | 'high_gap'
    | 'org_health'
    | 'no_alert',
  usesMatrixScoring = false
): string {
  if (key === 'person_drop') {
    if (usesMatrixScoring) {
      return lang === 'en' ? 'Person MATRIX drop' : lang === 'fr' ? 'Baisse MATRIX (personne)' : 'Kişi MATRIX düşüşü'
    }
    return lang === 'en' ? 'Person performance drop' : lang === 'fr' ? 'Baisse performance (personne)' : 'Kişi performans düşüşü'
  }
  const map: Record<Exclude<typeof key, 'person_drop'>, { tr: string; en: string; fr: string }> = {
    high_risk_people: {
      tr: 'Yüksek riskli kişiler',
      en: 'High risk people',
      fr: 'Risque élevé (personnes)',
    },
    low_score: {
      tr: 'Düşük skor eşiği',
      en: 'Low score threshold',
      fr: 'Seuil score bas',
    },
    dept_drop: {
      tr: 'Birim düşüşü',
      en: 'Department drop',
      fr: 'Baisse département',
    },
    low_coverage: {
      tr: 'Düşük değerlendiren kapsamı',
      en: 'Low evaluator coverage',
      fr: 'Faible couverture évaluateurs',
    },
    high_gap: {
      tr: 'Yüksek öz–ekip farkı',
      en: 'High self–team gap',
      fr: 'Écart auto–équipe élevé',
    },
    org_health: {
      tr: 'Organizasyon sağlık indeksi kritik seviyede',
      en: 'Organization health index critical',
      fr: 'Indice santé organisation critique',
    },
    no_alert: {
      tr: 'Acil uyarı yok',
      en: 'No urgent warning',
      fr: 'Pas d’alerte urgente',
    },
  }
  return map[key][lang]
}

export function buildEarlyWarningsReport(
  riskScorecard: RiskScorecardRow[],
  periodTrend: PeriodComparisonTrend,
  organizationHealth: OrganizationHealthReport,
  thresholds: { warningDropThreshold: number; warningLowScoreThreshold: number },
  lang: 'tr' | 'en' | 'fr',
  usesMatrixScoring: boolean
): EarlyWarningsReport {
  const scoreLabel = usesMatrixScoring ? 'MATRIX' : lang === 'en' ? 'Score' : lang === 'fr' ? 'Score' : 'Skor'
  const warnings: EarlyWarningItem[] = []

  riskScorecard
    .filter((r) => r.riskScore >= 70)
    .slice(0, 5)
    .forEach((r) => {
      warnings.push({
        level: 'high',
        title: `${r.name} (${r.dept})`,
        detail: `Risk ${r.riskScore}/100 | ${scoreLabel} ${r.overall.toFixed(2)} | Δ ${r.delta.toFixed(2)} | Gap ${r.avgGap.toFixed(2)}`,
      })
    })

  riskScorecard
    .filter((r) => r.overall <= thresholds.warningLowScoreThreshold)
    .slice(0, 3)
    .forEach((r) => {
      warnings.push({
        level: 'medium',
        title: `${earlyWarningLabel(lang, 'low_score', usesMatrixScoring)}: ${r.name}`,
        detail:
          lang === 'en'
            ? `${scoreLabel} ${r.overall.toFixed(2)} (threshold ${thresholds.warningLowScoreThreshold.toFixed(2)})`
            : lang === 'fr'
              ? `${scoreLabel} ${r.overall.toFixed(2)} (seuil ${thresholds.warningLowScoreThreshold.toFixed(2)})`
              : `${usesMatrixScoring ? 'MATRIX skor' : 'Genel skor'} ${r.overall.toFixed(2)} (eşik ${thresholds.warningLowScoreThreshold.toFixed(2)})`,
      })
    })

  periodTrend.peopleDown
    .filter((p) => p.delta <= thresholds.warningDropThreshold)
    .slice(0, 5)
    .forEach((p) => {
      warnings.push({
        level: 'medium',
        title: `${earlyWarningLabel(lang, 'person_drop', usesMatrixScoring)}: ${p.name}`,
        detail:
          lang === 'en'
            ? `${p.dept} | ${scoreLabel} ${p.prev.toFixed(2)} → ${p.cur.toFixed(2)} (Δ ${p.delta.toFixed(2)})`
            : lang === 'fr'
              ? `${p.dept} | ${scoreLabel} ${p.prev.toFixed(2)} → ${p.cur.toFixed(2)} (Δ ${p.delta.toFixed(2)})`
              : `${p.dept} | ${scoreLabel} ${p.prev.toFixed(2)} → ${p.cur.toFixed(2)} (Δ ${p.delta.toFixed(2)})`,
      })
    })

  periodTrend.deptMoves
    .filter((d) => d.delta <= thresholds.warningDropThreshold)
    .slice(0, 5)
    .forEach((d) => {
      warnings.push({
        level: 'medium',
        title: `${earlyWarningLabel(lang, 'dept_drop', usesMatrixScoring)}: ${d.department}`,
        detail:
          lang === 'en'
            ? `${scoreLabel} dept avg ${d.prev.toFixed(2)} → ${d.cur.toFixed(2)} (Δ ${d.delta.toFixed(2)})`
            : lang === 'fr'
              ? `Moy. ${scoreLabel} ${d.prev.toFixed(2)} → ${d.cur.toFixed(2)} (Δ ${d.delta.toFixed(2)})`
              : `${usesMatrixScoring ? 'MATRIX birim ort.' : 'Birim ort.'} ${d.prev.toFixed(2)} → ${d.cur.toFixed(2)} (Δ ${d.delta.toFixed(2)})`,
      })
    })

  if (usesMatrixScoring) {
    riskScorecard
      .filter((r) => r.peerEvalCount < EARLY_WARNING_LOW_COVERAGE)
      .slice(0, 3)
      .forEach((r) => {
        warnings.push({
          level: 'medium',
          title: `${earlyWarningLabel(lang, 'low_coverage', usesMatrixScoring)}: ${r.name}`,
          detail:
            lang === 'en'
              ? `${r.dept} | ${r.peerEvalCount} evaluators (min ${EARLY_WARNING_LOW_COVERAGE})`
              : lang === 'fr'
                ? `${r.dept} | ${r.peerEvalCount} évaluateurs (min ${EARLY_WARNING_LOW_COVERAGE})`
                : `${r.dept} | ${r.peerEvalCount} değerlendiren (min ${EARLY_WARNING_LOW_COVERAGE})`,
        })
      })

    riskScorecard
      .filter((r) => r.avgGap >= EARLY_WARNING_HIGH_GAP)
      .slice(0, 3)
      .forEach((r) => {
        warnings.push({
          level: 'medium',
          title: `${earlyWarningLabel(lang, 'high_gap', usesMatrixScoring)}: ${r.name}`,
          detail:
            lang === 'en'
              ? `${r.dept} | gap ${r.avgGap.toFixed(2)} (threshold ${EARLY_WARNING_HIGH_GAP.toFixed(1)})`
              : lang === 'fr'
                ? `${r.dept} | écart ${r.avgGap.toFixed(2)} (seuil ${EARLY_WARNING_HIGH_GAP.toFixed(1)})`
                : `${r.dept} | gap ${r.avgGap.toFixed(2)} (eşik ${EARLY_WARNING_HIGH_GAP.toFixed(1)})`,
        })
      })
  }

  if (organizationHealth.score < 60) {
    warnings.push({
      level: 'high',
      title: earlyWarningLabel(lang, 'org_health', usesMatrixScoring),
      detail:
        lang === 'en'
          ? `${usesMatrixScoring ? 'MATRIX-based ' : ''}health index ${organizationHealth.score}/100`
          : lang === 'fr'
            ? `Indice santé ${usesMatrixScoring ? 'MATRIX ' : ''}${organizationHealth.score}/100`
            : `${usesMatrixScoring ? 'MATRIX tabanlı ' : ''}kurum sağlığı ${organizationHealth.score}/100`,
    })
  }

  if (!warnings.length) {
    warnings.push({
      level: 'medium',
      title: earlyWarningLabel(lang, 'no_alert', usesMatrixScoring),
      detail:
        lang === 'en'
          ? 'No critical situation observed at current thresholds.'
          : lang === 'fr'
            ? 'Aucune situation critique aux seuils actuels.'
            : 'Mevcut eşiklerde kritik bir durum gözlenmedi.',
    })
  }

  const scoreLogicPrefix = usesMatrixScoring ? 'MATRIX ' : ''
  const rules: WarningRuleItem[] = [
    {
      key: 'high_risk',
      title: earlyWarningLabel(lang, 'high_risk_people', usesMatrixScoring),
      logic: 'riskScore >= 70',
      count: riskScorecard.filter((r) => r.riskScore >= 70).length,
    },
    {
      key: 'low_score',
      title: earlyWarningLabel(lang, 'low_score', usesMatrixScoring),
      logic: `${scoreLogicPrefix}overall <= ${thresholds.warningLowScoreThreshold.toFixed(2)}`,
      count: riskScorecard.filter((r) => r.overall <= thresholds.warningLowScoreThreshold).length,
    },
    {
      key: 'person_drop',
      title: earlyWarningLabel(lang, 'person_drop', usesMatrixScoring),
      logic: `${scoreLogicPrefix}person Δ <= ${thresholds.warningDropThreshold.toFixed(2)}`,
      count: periodTrend.peopleDown.filter((p) => p.delta <= thresholds.warningDropThreshold).length,
    },
    {
      key: 'dept_drop',
      title: earlyWarningLabel(lang, 'dept_drop', usesMatrixScoring),
      logic: `${scoreLogicPrefix}dept Δ <= ${thresholds.warningDropThreshold.toFixed(2)}`,
      count: periodTrend.deptMoves.filter((d) => d.delta <= thresholds.warningDropThreshold).length,
    },
  ]

  if (usesMatrixScoring) {
    rules.push(
      {
        key: 'low_coverage',
        title: earlyWarningLabel(lang, 'low_coverage', usesMatrixScoring),
        logic: `peerEvaluators < ${EARLY_WARNING_LOW_COVERAGE}`,
        count: riskScorecard.filter((r) => r.peerEvalCount < EARLY_WARNING_LOW_COVERAGE).length,
      },
      {
        key: 'high_gap',
        title: earlyWarningLabel(lang, 'high_gap', usesMatrixScoring),
        logic: `avgGap >= ${EARLY_WARNING_HIGH_GAP.toFixed(1)}`,
        count: riskScorecard.filter((r) => r.avgGap >= EARLY_WARNING_HIGH_GAP).length,
      }
    )
  }

  return {
    warnings: warnings.slice(0, 12),
    rules,
    usesMatrixScoring,
  }
}
