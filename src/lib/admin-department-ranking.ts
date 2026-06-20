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

export function normalizeResultDepartment(dept: string | undefined | null): string {
  return String(dept || '-').trim() || '-'
}
