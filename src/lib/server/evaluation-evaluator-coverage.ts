import { canonicalAssignmentId, canonicalUserId, userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'
import {
  isPeriodSummaryMatrixContext,
  matrixEvaluationContextLabel,
  normalizeMatrixContext,
} from '@/lib/matrix-evaluation-context'

export type EvaluatorCoverageSlice = {
  matrixContext: string
  matrixLabel: string
  assigned: number
  completedScorable: number
  /** Formu tamamlamış; yalnızca fikrim yok / puanlanabilir cevap yok */
  completedNoOpinion: number
  pending: number
}

export type EvaluatorCoverageRow = {
  evaluatorId: string
  evaluatorName: string
  matrixContext: string
  matrixLabel: string
  status: string
  hasScorableResponses: boolean
}

export type PeerEvaluatorCoverage = {
  peerEvaluatorAssigned: number
  peerEvaluatorCompletedScorable: number
  /** Tamamlamış ama hiç puanlanabilir cevap vermemiş benzersiz değerlendiren */
  peerEvaluatorCompletedNoOpinion: number
  peerEvaluatorPending: number
  peerEvaluatorCountGenel: number
  bySlice: EvaluatorCoverageSlice[]
  rows: EvaluatorCoverageRow[]
}

function assignmentHasScorableResponses(assignmentId: string, responsesByAssignment: Map<string, any[]>): boolean {
  const aid = String(assignmentId || '').trim()
  const responses =
    responsesByAssignment.get(canonicalAssignmentId(aid)) || responsesByAssignment.get(aid) || []
  return responses.some((r) => {
    const n = Number(r?.reel_score ?? r?.std_score ?? 0)
    return Number.isFinite(n) && n > 0
  })
}

function sliceSortOrder(ctx: string) {
  if (ctx === 'genel') return '0'
  if (ctx === 'okul_yasam') return '1'
  return `2_${ctx}`
}

export function buildPeerEvaluatorCoverage(
  assignments: any[],
  targetId: string,
  responsesByAssignment: Map<string, any[]>
): PeerEvaluatorCoverage {
  const assignedPeers = new Set<string>()
  const completedAnyPeers = new Set<string>()
  const completedScorablePeers = new Set<string>()
  const pendingPeers = new Set<string>()
  const genelCompletedScorablePeers = new Set<string>()
  const byCtx = new Map<
    string,
    {
      assigned: Set<string>
      completedAny: Set<string>
      completedScorable: Set<string>
      pending: Set<string>
    }
  >()
  const rows: EvaluatorCoverageRow[] = []

  for (const a of assignments || []) {
    const tid = String(a?.target_id ?? a?.target?.id ?? '').trim()
    const eid = String(a?.evaluator_id ?? a?.evaluator?.id ?? '').trim()
    if (!eid || userIdsEqualForSelfEval(eid, tid || targetId)) continue

    const eKey = canonicalUserId(eid) || eid
    const matrixContext = normalizeMatrixContext(a?.matrix_context)
    const matrixLabel = matrixEvaluationContextLabel(matrixContext)
    const status = String(a?.status || 'pending')
    const isCompleted = status === 'completed'
    const scorable = isCompleted && assignmentHasScorableResponses(String(a?.id ?? ''), responsesByAssignment)

    assignedPeers.add(eKey)
    if (!isCompleted) pendingPeers.add(eKey)
    if (isCompleted) completedAnyPeers.add(eKey)
    if (scorable) completedScorablePeers.add(eKey)
    if (scorable && isPeriodSummaryMatrixContext(matrixContext)) genelCompletedScorablePeers.add(eKey)

    if (!byCtx.has(matrixContext)) {
      byCtx.set(matrixContext, {
        assigned: new Set(),
        completedAny: new Set(),
        completedScorable: new Set(),
        pending: new Set(),
      })
    }
    const slice = byCtx.get(matrixContext)!
    slice.assigned.add(eKey)
    if (!isCompleted) slice.pending.add(eKey)
    if (isCompleted) slice.completedAny.add(eKey)
    if (scorable) slice.completedScorable.add(eKey)

    rows.push({
      evaluatorId: eid,
      evaluatorName: String(a?.evaluator?.name || a?.evaluator_name || '-').trim() || '-',
      matrixContext,
      matrixLabel,
      status,
      hasScorableResponses: scorable,
    })
  }

  const completedNoOpinionPeers = new Set(
    [...completedAnyPeers].filter((k) => !completedScorablePeers.has(k) && !pendingPeers.has(k))
  )

  const countNoOpinionInSlice = (slice: {
    completedAny: Set<string>
    completedScorable: Set<string>
    pending: Set<string>
  }) =>
    [...slice.completedAny].filter((k) => !slice.completedScorable.has(k) && !slice.pending.has(k)).length

  const bySlice = Array.from(byCtx.entries())
    .map(([matrixContext, slice]) => ({
      matrixContext,
      matrixLabel: matrixEvaluationContextLabel(matrixContext),
      assigned: slice.assigned.size,
      completedScorable: slice.completedScorable.size,
      completedNoOpinion: countNoOpinionInSlice(slice),
      pending: slice.pending.size,
    }))
    .sort((a, b) => sliceSortOrder(a.matrixContext).localeCompare(sliceSortOrder(b.matrixContext), 'tr'))

  rows.sort(
    (a, b) =>
      sliceSortOrder(a.matrixContext).localeCompare(sliceSortOrder(b.matrixContext), 'tr') ||
      a.evaluatorName.localeCompare(b.evaluatorName, 'tr') ||
      a.status.localeCompare(b.status, 'tr')
  )

  return {
    peerEvaluatorAssigned: assignedPeers.size,
    peerEvaluatorCompletedScorable: completedScorablePeers.size,
    peerEvaluatorCompletedNoOpinion: completedNoOpinionPeers.size,
    peerEvaluatorPending: pendingPeers.size,
    peerEvaluatorCountGenel: genelCompletedScorablePeers.size,
    bySlice,
    rows,
  }
}
