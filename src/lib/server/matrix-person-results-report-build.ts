import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalUserId } from '@/lib/server/evaluation-identity'
import { fetchEvaluatorAnswerDetailRows } from '@/lib/server/evaluator-answer-detail-fetch'
import type { EvaluatorAnswerDetailLang } from '@/lib/server/evaluator-answer-detail'
import {
  DUTY_MATRIX_CONTEXTS,
  isDutyMatrixContext,
  matrixEvaluationContextLabel,
  normalizeMatrixContext,
} from '@/lib/matrix-evaluation-context'
import {
  computeMatrixStructureScoresForDutyContext,
  computeMatrixStructureScoresForTarget,
  filterMatrixStructureScoringRows,
  type MatrixStructurePersonScore,
} from '@/lib/server/matrix-structure-scoring'

export type MatrixPersonDutySlice = {
  matrixContext: string
  matrixContextLabel: string
  score: MatrixStructurePersonScore
}

export type MatrixPersonResultsRow = {
  targetId: string
  targetName: string
  targetDept: string
  rank: number
  core: MatrixStructurePersonScore | null
  dutySlices: MatrixPersonDutySlice[]
}

export type MatrixPersonResultsReportPayload = {
  categoryLabels: Array<{ key: string; label: string }>
  dutyContextOrder: string[]
  people: MatrixPersonResultsRow[]
}

function dutyContextSortIndex(ctx: string) {
  const idx = DUTY_MATRIX_CONTEXTS.indexOf(ctx as (typeof DUTY_MATRIX_CONTEXTS)[number])
  return idx >= 0 ? idx : 999
}

function sortDutyContexts(contexts: Iterable<string>) {
  return [...new Set(contexts)].sort((a, b) => {
    const ai = dutyContextSortIndex(a)
    const bi = dutyContextSortIndex(b)
    if (ai !== bi) return ai - bi
    return matrixEvaluationContextLabel(a).localeCompare(matrixEvaluationContextLabel(b), 'tr')
  })
}

function collectCategoryLabels(scores: MatrixStructurePersonScore[]) {
  const categoryMap = new Map<string, string>()
  for (const person of scores) {
    for (const cat of person.categories) {
      categoryMap.set(cat.categoryKey, cat.categoryLabel)
    }
  }
  return [...categoryMap.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'))
}

export async function buildMatrixPersonResultsReport(
  supabase: SupabaseClient,
  input: {
    periodId: string
    orgId: string
    lang: EvaluatorAnswerDetailLang
    department?: string
  }
): Promise<MatrixPersonResultsReportPayload> {
  const { periodId, orgId, lang, department = '' } = input

  const fetched = await fetchEvaluatorAnswerDetailRows(supabase, {
    periodId,
    orgId,
    lang,
    deptKey: department,
  })

  const byTarget = new Map<string, typeof fetched.rows>()
  const targetMeta = new Map<string, { name: string; dept: string }>()
  const periodDutyContexts = new Set<string>()

  for (const row of fetched.rows) {
    const tid = row.targetId
    if (!tid) continue
    const tidKey = canonicalUserId(tid) || tid
    const list = byTarget.get(tidKey) || []
    list.push(row)
    byTarget.set(tidKey, list)
    targetMeta.set(tidKey, {
      name: row.targetName || targetMeta.get(tidKey)?.name || '-',
      dept: row.targetDept || targetMeta.get(tidKey)?.dept || '-',
    })

    if (!row.isSelf) {
      const ctx = normalizeMatrixContext(row.matrixContext)
      if (isDutyMatrixContext(ctx) && row.isScorable && Number(row.score) > 0) {
        periodDutyContexts.add(ctx)
      }
    }
  }

  const dutyContextOrder = sortDutyContexts(periodDutyContexts)
  const people: MatrixPersonResultsRow[] = []
  const coreScores: MatrixStructurePersonScore[] = []

  for (const [tidKey, targetRows] of byTarget) {
    const meta = targetMeta.get(tidKey) || { name: '-', dept: '-' }
    const targetMetaArg = { targetName: meta.name, targetDept: meta.dept }
    const core = computeMatrixStructureScoresForTarget(targetRows, targetMetaArg)
    if (core) coreScores.push(core)

    const personDutyContexts = new Set<string>()
    for (const row of targetRows) {
      if (row.isSelf) continue
      const ctx = normalizeMatrixContext(row.matrixContext)
      if (isDutyMatrixContext(ctx) && row.isScorable && Number(row.score) > 0) {
        personDutyContexts.add(ctx)
      }
    }

    const dutySlices: MatrixPersonDutySlice[] = []
    for (const ctx of sortDutyContexts(personDutyContexts)) {
      const dutyScore = computeMatrixStructureScoresForDutyContext(targetRows, ctx, targetMetaArg)
      if (dutyScore && dutyScore.answeredQuestionCount > 0) {
        dutySlices.push({
          matrixContext: ctx,
          matrixContextLabel: matrixEvaluationContextLabel(ctx),
          score: dutyScore,
        })
      }
    }

    if (!core && dutySlices.length === 0) continue

    people.push({
      targetId: tidKey,
      targetName: meta.name,
      targetDept: meta.dept,
      rank: 0,
      core,
      dutySlices,
    })
  }

  people.sort((a, b) => {
    const aScore = a.core?.overallPeerAvg ?? 0
    const bScore = b.core?.overallPeerAvg ?? 0
    if (bScore !== aScore) return bScore - aScore
    return a.targetName.localeCompare(b.targetName, 'tr')
  })
  people.forEach((p, i) => {
    p.rank = i + 1
  })

  const scoringRows = filterMatrixStructureScoringRows(fetched.rows)
  const categoryMap = new Map<string, string>()
  for (const row of scoringRows) {
    const key = row.categoryKey || row.categoryLabel || '—'
    const label = row.categoryLabel || row.categoryKey || '—'
    categoryMap.set(key, label)
  }
  for (const cat of collectCategoryLabels(coreScores)) {
    categoryMap.set(cat.key, cat.label)
  }
  const categoryLabels = [...categoryMap.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'))

  return {
    categoryLabels,
    dutyContextOrder,
    people,
  }
}
