import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalUserId } from '@/lib/server/evaluation-identity'
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

export type MatrixStructurePeriodSummary = {
  targetCount: number
  targetsWithScores: number
  completedAssignmentCount: number
  pendingAssignmentCount: number
  uniqueEvaluatorCount: number
  uniqueQuestionCount: number
  categoryCount: number
  excludedDutyMatrixCount: number
}

export type MatrixStructureReportPayload = {
  periodSummary: MatrixStructurePeriodSummary
  categoryLabels: Array<{ key: string; label: string }>
  rankings: MatrixStructurePersonScore[]
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
  const uniqueTargets = new Set(fetched.rows.map((r) => r.targetId).filter(Boolean))

  let completedAssignmentCount = 0
  let pendingAssignmentCount = 0
  let excludedDutyMatrixCount = 0
  const coreTargets = new Set<string>()

  const { data: allAssignments, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select('id, target_id, status, matrix_context, evaluator:evaluator_id(organization_id), target:target_id(organization_id)')
    .eq('period_id', periodId)
  if (aErr) throw new Error(aErr.message || 'Atamalar alınamadı')

  for (const a of allAssignments || []) {
    const ctx = normalizeMatrixContext((a as { matrix_context?: string }).matrix_context)
    const tOrg = String(
      (a as { target?: { organization_id?: string } }).target?.organization_id || ''
    )
    const eOrg = String(
      (a as { evaluator?: { organization_id?: string } }).evaluator?.organization_id || ''
    )
    if (tOrg !== orgId && eOrg !== orgId) continue

    if (isDutyMatrixContext(ctx)) {
      excludedDutyMatrixCount += 1
      continue
    }
    if (!isCoreGeneralReportMatrixContext(ctx)) continue

    const tid = String((a as { target_id?: string }).target_id || '')
    if (tid) coreTargets.add(canonicalUserId(tid) || tid)

    const status = String((a as { status?: string }).status || '')
    if (status === 'completed') completedAssignmentCount += 1
    else pendingAssignmentCount += 1
  }

  return {
    periodSummary: {
      targetCount: uniqueTargets.size || coreTargets.size,
      targetsWithScores: rankings.length,
      completedAssignmentCount,
      pendingAssignmentCount,
      uniqueEvaluatorCount: uniqueEvaluators.size,
      uniqueQuestionCount: uniqueQuestions.size,
      categoryCount: categoryLabels.length,
      excludedDutyMatrixCount,
    },
    categoryLabels,
    rankings,
  }
}
