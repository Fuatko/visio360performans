import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalUserId, userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'
import { fetchEvaluatorAnswerDetailRows } from '@/lib/server/evaluator-answer-detail-fetch'
import type { EvaluatorAnswerDetailLang } from '@/lib/server/evaluator-answer-detail'
import {
  isCoreGeneralReportMatrixContext,
  isDutyMatrixContext,
  normalizeMatrixContext,
} from '@/lib/matrix-evaluation-context'
import {
  computeMatrixStructureScoresByTarget,
  filterMatrixStructureScoringRows,
  type MatrixStructurePersonScore,
} from '@/lib/server/matrix-structure-scoring'

export type MatrixStructureUnscoredReason =
  | 'no_peer_assignment'
  | 'pending_peer_only'
  | 'no_scorable_peer'
  | 'duty_matrix_only'

export type MatrixStructureUnscoredTarget = {
  targetId: string
  targetName: string
  targetDept: string
  reason: MatrixStructureUnscoredReason
  completedPeerAssignments: number
  pendingPeerAssignments: number
}

export type MatrixStructurePeriodSummary = {
  targetCount: number
  targetsWithScores: number
  unscoredCount: number
  completedAssignmentCount: number
  pendingAssignmentCount: number
  uniqueEvaluatorCount: number
  uniqueQuestionCount: number
  categoryCount: number
  excludedDutyMatrixCount: number
}

export type MatrixStructureReportPayload = {
  periodSummary: MatrixStructurePeriodSummary
  unscoredTargets: MatrixStructureUnscoredTarget[]
  categoryLabels: Array<{ key: string; label: string }>
  rankings: MatrixStructurePersonScore[]
}

function normDeptKey(s: string) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
    .replace(/\u0131/g, 'i')
}

function deptMatches(deptKey: string, dept: unknown) {
  if (!deptKey) return true
  return normDeptKey(String(dept ?? '')) === deptKey
}

function unscoredReasonFor(
  tidKey: string,
  coreTargets: Set<string>,
  stats: {
    completedPeerAssignments: number
    pendingPeerAssignments: number
    hasScorablePeer: boolean
  }
): MatrixStructureUnscoredReason {
  if (!coreTargets.has(tidKey)) return 'duty_matrix_only'
  if (stats.completedPeerAssignments === 0 && stats.pendingPeerAssignments === 0) return 'no_peer_assignment'
  if (stats.completedPeerAssignments === 0 && stats.pendingPeerAssignments > 0) return 'pending_peer_only'
  return 'no_scorable_peer'
}

export async function buildMatrixStructureReport(
  supabase: SupabaseClient,
  input: {
    periodId: string
    orgId: string
    lang: EvaluatorAnswerDetailLang
    department?: string
  }
): Promise<MatrixStructureReportPayload> {
  const { periodId, orgId, lang, department = '' } = input

  const fetched = await fetchEvaluatorAnswerDetailRows(supabase, {
    periodId,
    orgId,
    lang,
    deptKey: department,
  })

  const scoringRows = filterMatrixStructureScoringRows(fetched.rows)
  const rankings = computeMatrixStructureScoresByTarget(fetched.rows)

  const categoryMap = new Map<string, string>()
  for (const row of scoringRows) {
    const key = row.categoryKey || row.categoryLabel || '—'
    const label = row.categoryLabel || row.categoryKey || '—'
    categoryMap.set(key, label)
  }
  for (const person of rankings) {
    for (const cat of person.categories) {
      categoryMap.set(cat.categoryKey, cat.categoryLabel)
    }
  }
  const categoryLabels = [...categoryMap.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'))

  const uniqueQuestions = new Set(scoringRows.map((r) => r.questionId).filter(Boolean))
  const uniqueEvaluators = new Set(scoringRows.map((r) => r.evaluatorId).filter(Boolean))
  const scoredTargetKeys = new Set(rankings.map((r) => canonicalUserId(r.targetId) || r.targetId))

  const uniqueTargets = new Set<string>()
  for (const row of fetched.rows) {
    const key = canonicalUserId(row.targetId) || row.targetId
    if (key) uniqueTargets.add(key)
  }

  const targetMeta = new Map<string, { name: string; dept: string }>()
  for (const row of fetched.rows) {
    const key = canonicalUserId(row.targetId) || row.targetId
    if (!key) continue
    targetMeta.set(key, { name: row.targetName || '-', dept: row.targetDept || '-' })
  }

  let completedAssignmentCount = 0
  let pendingAssignmentCount = 0
  let excludedDutyMatrixCount = 0
  const coreTargets = new Set<string>()
  const peerStatsByTarget = new Map<
    string,
    { completedPeerAssignments: number; pendingPeerAssignments: number; hasScorablePeer: boolean }
  >()

  const deptKey = department ? normDeptKey(department) : ''

  const { data: allAssignments, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select(
      'id, target_id, evaluator_id, status, matrix_context, evaluator:evaluator_id(organization_id), target:target_id(id, name, department, organization_id)'
    )
    .eq('period_id', periodId)
  if (aErr) throw new Error(aErr.message || 'Atamalar alınamadı')

  for (const a of allAssignments || []) {
    const ctx = normalizeMatrixContext((a as { matrix_context?: string }).matrix_context)
    const target = (a as { target?: { id?: string; name?: string; department?: string; organization_id?: string } })
      .target
    const tOrg = String(target?.organization_id || '')
    const eOrg = String(
      (a as { evaluator?: { organization_id?: string } }).evaluator?.organization_id || ''
    )
    if (tOrg !== orgId && eOrg !== orgId) continue

    if (isDutyMatrixContext(ctx)) {
      excludedDutyMatrixCount += 1
      continue
    }
    if (!isCoreGeneralReportMatrixContext(ctx)) continue

    const tidRaw = String((a as { target_id?: string }).target_id || target?.id || '')
    const tidKey = canonicalUserId(tidRaw) || tidRaw
    if (!tidKey) continue
    if (!deptMatches(deptKey, target?.department)) continue

    coreTargets.add(tidKey)
    targetMeta.set(tidKey, {
      name: String(target?.name || targetMeta.get(tidKey)?.name || '-'),
      dept: String(target?.department || targetMeta.get(tidKey)?.dept || '-'),
    })

    const status = String((a as { status?: string }).status || '')
    if (status === 'completed') completedAssignmentCount += 1
    else pendingAssignmentCount += 1

    const evaluatorId = String((a as { evaluator_id?: string }).evaluator_id || '')
    if (userIdsEqualForSelfEval(evaluatorId, tidRaw)) continue

    const cur = peerStatsByTarget.get(tidKey) || {
      completedPeerAssignments: 0,
      pendingPeerAssignments: 0,
      hasScorablePeer: false,
    }
    if (status === 'completed') cur.completedPeerAssignments += 1
    else cur.pendingPeerAssignments += 1
    peerStatsByTarget.set(tidKey, cur)
  }

  for (const row of scoringRows) {
    const tidKey = canonicalUserId(row.targetId) || row.targetId
    if (!tidKey) continue
    const cur = peerStatsByTarget.get(tidKey)
    if (cur) cur.hasScorablePeer = true
  }

  const unscoredTargets: MatrixStructureUnscoredTarget[] = []
  for (const tidKey of uniqueTargets) {
    if (scoredTargetKeys.has(tidKey)) continue
    const meta = targetMeta.get(tidKey) || { name: '-', dept: '-' }
    const stats = peerStatsByTarget.get(tidKey) || {
      completedPeerAssignments: 0,
      pendingPeerAssignments: 0,
      hasScorablePeer: false,
    }
    unscoredTargets.push({
      targetId: tidKey,
      targetName: meta.name,
      targetDept: meta.dept,
      reason: unscoredReasonFor(tidKey, coreTargets, stats),
      completedPeerAssignments: stats.completedPeerAssignments,
      pendingPeerAssignments: stats.pendingPeerAssignments,
    })
  }
  unscoredTargets.sort((a, b) => a.targetName.localeCompare(b.targetName, 'tr'))

  return {
    periodSummary: {
      targetCount: uniqueTargets.size,
      targetsWithScores: rankings.length,
      unscoredCount: unscoredTargets.length,
      completedAssignmentCount,
      pendingAssignmentCount,
      uniqueEvaluatorCount: uniqueEvaluators.size,
      uniqueQuestionCount: uniqueQuestions.size,
      categoryCount: categoryLabels.length,
      excludedDutyMatrixCount,
    },
    unscoredTargets,
    categoryLabels,
    rankings,
  }
}
