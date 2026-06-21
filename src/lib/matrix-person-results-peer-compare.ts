import type { MatrixPersonResultsRow } from '@/lib/server/matrix-person-results-report-build'
import type { MatrixStructurePersonScore } from '@/lib/server/matrix-structure-scoring'

export type MatrixPersonSliceRef = { type: 'core' } | { type: 'duty'; matrixContext: string }

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function getPersonSliceScore(
  person: MatrixPersonResultsRow,
  ref: MatrixPersonSliceRef
): MatrixStructurePersonScore | null {
  if (ref.type === 'core') return person.core
  return person.dutySlices.find((d) => d.matrixContext === ref.matrixContext)?.score ?? null
}

export type CategoryPeerBenchmarkRow = {
  key: string
  name: string
  person: number
  orgAvg: number
}

export type PeerRankingRow = {
  name: string
  value: number
  isSelected: boolean
}

export type OrgPeerBenchmark = {
  rank: number
  total: number
  orgAvgOverall: number
  categoryRows: CategoryPeerBenchmarkRow[]
  rankingRows: PeerRankingRow[]
}

export function buildOrgPeerBenchmark(
  people: MatrixPersonResultsRow[],
  targetId: string,
  ref: MatrixPersonSliceRef
): OrgPeerBenchmark | null {
  const entries = people
    .map((p) => ({
      targetId: p.targetId,
      targetName: p.targetName,
      score: getPersonSliceScore(p, ref),
    }))
    .filter((e) => e.score && e.score.overallPeerAvg > 0)

  if (!entries.length) return null

  const selected = entries.find((e) => e.targetId === targetId)
  if (!selected?.score) return null

  const others = entries.filter((e) => e.targetId !== targetId)
  const orgAvgOverall = others.length
    ? round2(others.reduce((s, e) => s + (e.score?.overallPeerAvg || 0), 0) / others.length)
    : 0

  const sorted = [...entries].sort(
    (a, b) => (b.score?.overallPeerAvg || 0) - (a.score?.overallPeerAvg || 0)
  )
  const rank = sorted.findIndex((e) => e.targetId === targetId) + 1

  const categoryRows: CategoryPeerBenchmarkRow[] = selected.score.categories
    .filter((c) => c.peerAvg > 0)
    .map((cat) => {
      const peerAvgs = others
        .map(
          (e) =>
            e.score?.categories.find((c) => c.categoryKey === cat.categoryKey)?.peerAvg ?? 0
        )
        .filter((v) => v > 0)
      const orgAvg = peerAvgs.length
        ? round2(peerAvgs.reduce((a, b) => a + b, 0) / peerAvgs.length)
        : 0
      return {
        key: cat.categoryKey,
        name: cat.categoryLabel,
        person: cat.peerAvg,
        orgAvg,
      }
    })
    .filter((r) => r.person > 0)

  const top = sorted.slice(0, 12)
  const selectedInTop = top.some((e) => e.targetId === targetId)
  const rankingSource = selectedInTop
    ? top
    : [...top.filter((e) => e.targetId !== targetId).slice(0, 11), selected]

  const rankingRows: PeerRankingRow[] = rankingSource
    .sort((a, b) => (b.score?.overallPeerAvg || 0) - (a.score?.overallPeerAvg || 0))
    .map((e) => ({
      name: e.targetName,
      value: e.score?.overallPeerAvg || 0,
      isSelected: e.targetId === targetId,
    }))

  return { rank, total: entries.length, orgAvgOverall, categoryRows, rankingRows }
}
