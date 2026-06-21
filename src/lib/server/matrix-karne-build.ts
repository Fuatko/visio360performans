import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalUserId } from '@/lib/server/evaluation-identity'
import { fetchEvaluatorAnswerDetailRows } from '@/lib/server/evaluator-answer-detail-fetch'
import type { EvaluatorAnswerDetailLang, EvaluatorAnswerDetailRow } from '@/lib/server/evaluator-answer-detail'
import {
  isDutyMatrixContext,
  matrixEvaluationContextLabel,
  normalizeMatrixContext,
} from '@/lib/matrix-evaluation-context'
import {
  computeMatrixStructureScoresForDutyContext,
  computeMatrixStructureScoresForTarget,
  type MatrixStructurePersonScore,
} from '@/lib/server/matrix-structure-scoring'
import { assessmentKindLabel, normalizeAssessmentKind } from '@/lib/evaluation-period-kind'
import { buildMatrixKarneSwot, type MatrixKarneSwot } from '@/lib/matrix-karne-swot'

export type MatrixKarnePeriodSlice = {
  matrixContext: string
  matrixContextLabel: string
  isDuty: boolean
  score: MatrixStructurePersonScore
  swot: MatrixKarneSwot
  selfCategoryByKey: Record<string, number>
}

export type MatrixKarnePeriodBlock = {
  periodId: string
  periodName: string
  assessmentKind: string
  assessmentLabel: string
  categoryLabels: Array<{ key: string; label: string }>
  core: MatrixKarnePeriodSlice | null
  dutySlices: MatrixKarnePeriodSlice[]
}

export type MatrixKarneAssessmentGroup = {
  assessmentKind: string
  assessmentLabel: string
  periods: MatrixKarnePeriodBlock[]
}

export type MatrixKarnePayload = {
  person: {
    id: string
    name: string
    department: string
    title: string
    dutyNames: string[]
  }
  assessmentGroups: MatrixKarneAssessmentGroup[]
}

function buildSelfCategoryByKey(rows: EvaluatorAnswerDetailRow[]) {
  const acc = new Map<string, { label: string; scores: number[] }>()
  for (const row of rows) {
    if (!row.isSelf || !row.isScorable) continue
    const score = Number(row.score)
    if (!Number.isFinite(score) || score <= 0) continue
    const key = row.categoryKey || row.categoryLabel || '—'
    const label = row.categoryLabel || row.categoryKey || '—'
    const cur = acc.get(key) || { label, scores: [] }
    cur.scores.push(score)
    acc.set(key, cur)
  }
  const out = new Map<string, number>()
  for (const [key, v] of acc) {
    if (!v.scores.length) continue
    out.set(key, Math.round((v.scores.reduce((a, b) => a + b, 0) / v.scores.length) * 100) / 100)
  }
  return out
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

function buildSlice(
  score: MatrixStructurePersonScore,
  matrixContext: string,
  matrixContextLabel: string,
  isDuty: boolean,
  selfCategoryByKey: Map<string, number>
): MatrixKarnePeriodSlice {
  const selfRecord: Record<string, number> = {}
  selfCategoryByKey.forEach((v, k) => {
    selfRecord[k] = v
  })
  return {
    matrixContext,
    matrixContextLabel,
    isDuty,
    score,
    swot: buildMatrixKarneSwot(score.categories),
    selfCategoryByKey: selfRecord,
  }
}

async function buildPeriodBlock(
  supabase: SupabaseClient,
  input: {
    periodId: string
    periodName: string
    assessmentKind: string
    orgId: string
    personId: string
    lang: EvaluatorAnswerDetailLang
  }
): Promise<MatrixKarnePeriodBlock | null> {
  const fetched = await fetchEvaluatorAnswerDetailRows(supabase, {
    periodId: input.periodId,
    orgId: input.orgId,
    lang: input.lang,
    targetIdFilter: input.personId,
  })
  if (!fetched.rows.length) return null

  const personKey = canonicalUserId(input.personId) || input.personId
  const targetRows = fetched.rows.filter(
    (r) => (canonicalUserId(r.targetId) || r.targetId) === personKey
  )
  if (!targetRows.length) return null

  const meta = {
    targetName: targetRows[0]?.targetName || '-',
    targetDept: targetRows[0]?.targetDept || '-',
  }
  const selfCategoryByKey = buildSelfCategoryByKey(targetRows)

  const coreScore = computeMatrixStructureScoresForTarget(targetRows, meta)
  const dutyContexts = new Set<string>()
  for (const row of targetRows) {
    if (row.isSelf) continue
    const ctx = normalizeMatrixContext(row.matrixContext)
    if (isDutyMatrixContext(ctx) && row.isScorable && Number(row.score) > 0) {
      dutyContexts.add(ctx)
    }
  }

  const dutySlices: MatrixKarnePeriodSlice[] = []
  for (const ctx of [...dutyContexts].sort((a, b) =>
    matrixEvaluationContextLabel(a).localeCompare(matrixEvaluationContextLabel(b), 'tr')
  )) {
    const dutyScore = computeMatrixStructureScoresForDutyContext(targetRows, ctx, meta)
    if (dutyScore && dutyScore.answeredQuestionCount > 0) {
      dutySlices.push(
        buildSlice(dutyScore, ctx, matrixEvaluationContextLabel(ctx), true, selfCategoryByKey)
      )
    }
  }

  const core = coreScore && coreScore.answeredQuestionCount > 0
    ? buildSlice(
        coreScore,
        'genel_okul_yasam',
        input.lang === 'en'
          ? 'General & School Life'
          : input.lang === 'fr'
            ? 'Général & Vie scolaire'
            : 'Genel & Okul Yaşam',
        false,
        selfCategoryByKey
      )
    : null

  if (!core && !dutySlices.length) return null

  const allScores = [core?.score, ...dutySlices.map((d) => d.score)].filter(Boolean) as MatrixStructurePersonScore[]
  const kind = normalizeAssessmentKind(input.assessmentKind)

  return {
    periodId: input.periodId,
    periodName: input.periodName,
    assessmentKind: kind,
    assessmentLabel: assessmentKindLabel(kind, input.lang),
    categoryLabels: collectCategoryLabels(allScores),
    core,
    dutySlices,
  }
}

async function loadPersonDutyNames(
  supabase: SupabaseClient,
  personId: string,
  periodIds: string[]
): Promise<string[]> {
  if (!periodIds.length) return []
  const names = new Set<string>()
  try {
    const { data: udRows } = await supabase
      .from('evaluation_period_user_duties')
      .select('duty_id, period_id')
      .eq('user_id', personId)
      .in('period_id', periodIds)
      .eq('is_active', true)
    const dutyIds = [...new Set(((udRows || []) as any[]).map((r) => String(r.duty_id || '')).filter(Boolean))]
    if (!dutyIds.length) return []
    const { data: dutyDefs } = await supabase
      .from('evaluation_duties')
      .select('id, name, name_fr')
      .in('id', dutyIds)
    ;((dutyDefs || []) as any[]).forEach((d) => {
      const name = String(d.name || d.name_fr || '').trim()
      if (name) names.add(name)
    })
  } catch {
    // optional
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'tr'))
}

export async function buildMatrixKarneForPerson(
  supabase: SupabaseClient,
  input: {
    personId: string
    orgId: string
    lang: EvaluatorAnswerDetailLang
    periodId?: string
  }
): Promise<MatrixKarnePayload> {
  const { personId, orgId, lang, periodId } = input

  const { data: person, error: pErr } = await supabase
    .from('users')
    .select('id, name, department, title, organization_id')
    .eq('id', personId)
    .maybeSingle()
  if (pErr || !person) throw new Error('Kişi bulunamadı')
  if (String((person as any).organization_id || '') !== orgId) {
    throw new Error('KVKK: kurum yetkisi yok')
  }

  let periodQuery = supabase
    .from('evaluation_periods')
    .select('id, name, name_en, name_fr, assessment_kind, results_released, created_at')
    .eq('organization_id', orgId)
    .eq('results_released', true)
    .order('created_at', { ascending: false })

  if (periodId) periodQuery = periodQuery.eq('id', periodId)

  const { data: periods, error: perErr } = await periodQuery
  if (perErr) throw new Error(perErr.message || 'Dönemler alınamadı')

  const periodList = (periods || []) as Array<{
    id: string
    name: string
    name_en?: string | null
    name_fr?: string | null
    assessment_kind?: string | null
  }>

  const periodBlocks: MatrixKarnePeriodBlock[] = []
  for (const p of periodList) {
    const block = await buildPeriodBlock(supabase, {
      periodId: String(p.id),
      periodName:
        lang === 'en'
          ? String(p.name_en || p.name || '')
          : lang === 'fr'
            ? String(p.name_fr || p.name || '')
            : String(p.name || ''),
      assessmentKind: String(p.assessment_kind || 'development_360'),
      orgId,
      personId,
      lang,
    })
    if (block) periodBlocks.push(block)
  }

  const dutyNames = await loadPersonDutyNames(
    supabase,
    personId,
    periodBlocks.map((b) => b.periodId)
  )

  const byKind = new Map<string, MatrixKarnePeriodBlock[]>()
  for (const block of periodBlocks) {
    const list = byKind.get(block.assessmentKind) || []
    list.push(block)
    byKind.set(block.assessmentKind, list)
  }

  const kindOrder = ['job_evaluation', 'development_360', 'other']
  const assessmentGroups: MatrixKarneAssessmentGroup[] = []
  for (const kind of kindOrder) {
    const blocks = byKind.get(kind)
    if (!blocks?.length) continue
    assessmentGroups.push({
      assessmentKind: kind,
      assessmentLabel: assessmentKindLabel(kind, lang),
      periods: blocks,
    })
  }
  for (const [kind, blocks] of byKind) {
    if (kindOrder.includes(kind)) continue
    assessmentGroups.push({
      assessmentKind: kind,
      assessmentLabel: assessmentKindLabel(kind, lang),
      periods: blocks,
    })
  }

  return {
    person: {
      id: String((person as any).id),
      name: String((person as any).name || ''),
      department: String((person as any).department || ''),
      title: String((person as any).title || ''),
      dutyNames,
    },
    assessmentGroups,
  }
}
