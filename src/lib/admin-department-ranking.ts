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

export function normalizeResultDepartment(dept: string | undefined | null): string {
  return String(dept || '-').trim() || '-'
}
