import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalAssignmentId, canonicalUserId, userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'
import { matrixEvaluationContextLabel, normalizeMatrixContext } from '@/lib/matrix-evaluation-context'
import { effectiveCoreGeneralMatrixContext } from '@/lib/server/okul-yasam-coordinator-context'
import {
  computeAssignmentScoringHints,
  positionLevelLabel,
  responseNumericScore,
  type EvaluatorAnswerDetailLang,
  type EvaluatorAnswerDetailRow,
} from '@/lib/server/evaluator-answer-detail'
import {
  buildQuestionTextMap,
  canonicalUuid,
  resolveQuestionDisplayText,
} from '@/lib/server/question-text-resolve'

const ASSIGNMENTS_PAGE = 1000
const RESPONSES_IN_CHUNK = 100
const POSTGREST_MAX_ROWS = 1000
const USERS_IN_CHUNK = 200

export type FetchEvaluatorAnswerDetailParams = {
  periodId: string
  orgId: string
  lang: EvaluatorAnswerDetailLang
  targetIdFilter?: string
  deptKey?: string
  matrixFilter?: string
}

export type FetchEvaluatorAnswerDetailResult = {
  rows: EvaluatorAnswerDetailRow[]
  assignmentCount: number
  uniqueTargets: number
  uniqueEvaluators: number
}

function normDeptKey(s: string) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
    .replace(/\u0131/g, 'i')
}

function deptMatchesFilter(deptKey: string, targetDept: unknown, userDept: unknown) {
  if (!deptKey) return true
  const dT = normDeptKey(String(targetDept ?? ''))
  const dU = normDeptKey(String(userDept ?? ''))
  return dT === deptKey || dU === deptKey
}

function pickCatName(row: Record<string, unknown>, lang: EvaluatorAnswerDetailLang): string {
  if (lang === 'fr') return String(row.name_fr || row.name || '')
  if (lang === 'en') return String(row.name_en || row.name || '')
  return String(row.name || '')
}

function pickLatestBy<T extends Record<string, unknown>>(rows: T[], key: string): Map<string, T> {
  const m = new Map<string, T>()
  for (const r of rows || []) {
    const k = String(r?.[key] || '').trim()
    if (!k) continue
    m.set(k, r)
  }
  return m
}

type AssignRow = {
  id: string
  evaluator_id: string
  target_id: string
  matrix_context: string | null
  evaluator: {
    id?: string
    name?: string
    department?: string
    position_level?: string
    title?: string
    organization_id?: string
  } | null
  target: { id?: string; name?: string; department?: string; organization_id?: string } | null
}

export async function fetchEvaluatorAnswerDetailRows(
  supabase: SupabaseClient,
  params: FetchEvaluatorAnswerDetailParams
): Promise<FetchEvaluatorAnswerDetailResult> {
  const { periodId, orgId, lang: safeLang, targetIdFilter = '', deptKey = '', matrixFilter = '' } = params

  const assignments: AssignRow[] = []
  let from = 0
  while (true) {
    const { data: rows, error } = await supabase
      .from('evaluation_assignments')
      .select(
        `
        id, evaluator_id, target_id, matrix_context,
        evaluator:evaluator_id(id, name, department, position_level, title, organization_id),
        target:target_id(id, name, department, organization_id)
      `
      )
      .eq('period_id', periodId)
      .eq('status', 'completed')
      .order('id', { ascending: true })
      .range(from, from + ASSIGNMENTS_PAGE - 1)
    if (error) throw new Error(error.message || 'Atamalar alınamadı')
    assignments.push(...((rows || []) as AssignRow[]))
    if ((rows || []).length < ASSIGNMENTS_PAGE) break
    from += ASSIGNMENTS_PAGE
  }

  const targetIdRaw = (a: AssignRow) => String(a?.target_id ?? a?.target?.id ?? '').trim()
  const targetIds = Array.from(new Set(assignments.map((a) => targetIdRaw(a)).filter(Boolean)))
  const userByTargetId = new Map<string, { department?: string | null; organization_id?: string | null; name?: string | null }>()
  for (let off = 0; off < targetIds.length; off += USERS_IN_CHUNK) {
    const chunk = targetIds.slice(off, off + USERS_IN_CHUNK)
    const { data: urows, error: uErr } = await supabase
      .from('users')
      .select('id, organization_id, name, department')
      .in('id', chunk)
    if (uErr) throw new Error(uErr.message || 'Kullanıcılar alınamadı')
    ;(urows || []).forEach((u: { id?: string; department?: string; organization_id?: string; name?: string }) => {
      const id = String(u?.id || '').trim()
      if (!id) return
      userByTargetId.set(id, u)
      const ck = canonicalUserId(id)
      if (ck) userByTargetId.set(ck, u)
    })
  }

  const passesFilters = (a: AssignRow) => {
    const tid = targetIdRaw(a)
    if (!tid) return false
    const u = userByTargetId.get(tid) || userByTargetId.get(canonicalUserId(tid))
    const tOrg = a?.target?.organization_id ?? u?.organization_id
    if (String(tOrg || '') !== orgId) return false
    if (targetIdFilter && canonicalUserId(targetIdFilter) !== canonicalUserId(tid)) return false
    if (deptKey && !deptMatchesFilter(deptKey, a?.target?.department, u?.department)) return false
    const mctx = normalizeMatrixContext(a.matrix_context)
    if (matrixFilter && mctx !== matrixFilter) return false
    return true
  }

  const filtered = assignments.filter(passesFilters)
  if (!filtered.length) {
    return { rows: [], assignmentCount: 0, uniqueTargets: 0, uniqueEvaluators: 0 }
  }

  const assignmentIds = filtered.map((a) => String(a.id))
  const responsesByAssignment = new Map<string, Array<Record<string, unknown>>>()
  for (let i = 0; i < assignmentIds.length; i += RESPONSES_IN_CHUNK) {
    const chunk = assignmentIds.slice(i, i + RESPONSES_IN_CHUNK)
    let rFrom = 0
    while (true) {
      const { data: respRows, error: rErr } = await supabase
        .from('evaluation_responses')
        .select('*')
        .in('assignment_id', chunk)
        .order('id', { ascending: true })
        .range(rFrom, rFrom + POSTGREST_MAX_ROWS - 1)
      if (rErr) throw new Error(rErr.message || 'Yanıtlar alınamadı')
      const rows = respRows || []
      for (const r of rows) {
        const raw = String((r as { assignment_id?: string }).assignment_id || '')
        if (!raw) continue
        const ck = canonicalAssignmentId(raw)
        const cur = responsesByAssignment.get(ck) || responsesByAssignment.get(raw) || []
        cur.push(r as Record<string, unknown>)
        if (ck) responsesByAssignment.set(ck, cur)
        if (raw !== ck) responsesByAssignment.set(raw, cur)
      }
      if (rows.length < POSTGREST_MAX_ROWS) break
      rFrom += POSTGREST_MAX_ROWS
    }
  }

  const evaluatorWeightByLevel: Record<string, number> = {}
  const [periodWeights, orgEval, defEval] = await Promise.all([
    supabase.from('evaluation_period_evaluator_weights').select('position_level,weight').eq('period_id', periodId),
    supabase.from('evaluator_weights').select('position_level,weight').eq('organization_id', orgId).order('created_at', { ascending: false }),
    supabase.from('evaluator_weights').select('position_level,weight').is('organization_id', null).order('created_at', { ascending: false }),
  ])
  if (!periodWeights.error && (periodWeights.data || []).length) {
    ;(periodWeights.data || []).forEach((r: { position_level?: string; weight?: number }) => {
      const lvl = String(r.position_level || '')
      if (!lvl) return
      evaluatorWeightByLevel[lvl] = Number(r.weight ?? 1)
    })
  } else {
    const orgMap = pickLatestBy((orgEval.data || []) as Array<Record<string, unknown>>, 'position_level')
    const defMap = pickLatestBy((defEval.data || []) as Array<Record<string, unknown>>, 'position_level')
    for (const lvl of ['executive', 'manager', 'peer', 'subordinate', 'self']) {
      const row = orgMap.get(lvl) || defMap.get(lvl)
      evaluatorWeightByLevel[lvl] = Number((row as { weight?: number })?.weight ?? 1)
    }
  }
  if (!evaluatorWeightByLevel.self) evaluatorWeightByLevel.self = 1

  const categoryLabelByKey = new Map<string, string>()
  try {
    const snapCats = await supabase
      .from('evaluation_period_categories_snapshot')
      .select('name,name_en,name_fr')
      .eq('period_id', periodId)
    if (!snapCats.error) {
      ;(snapCats.data || []).forEach((r: Record<string, unknown>) => {
        const key = String(r?.name || '').trim()
        if (!key) return
        categoryLabelByKey.set(key, (pickCatName(r, safeLang) || key).trim())
      })
    }
  } catch {
    /* ignore */
  }

  const allQuestionIds: string[] = []
  for (const rows of responsesByAssignment.values()) {
    for (const r of rows) {
      const qid = canonicalUuid(r.question_id)
      if (qid) allQuestionIds.push(qid)
    }
  }
  const questionTextById = await buildQuestionTextMap(supabase, periodId, allQuestionIds, safeLang)

  const dutyNameById = new Map<string, string>()
  try {
    const { data: dutyDefs } = await supabase
      .from('evaluation_duties')
      .select('id, name, name_fr')
      .eq('period_id', periodId)
      .eq('is_active', true)
    ;((dutyDefs || []) as Array<{ id?: string; name?: string; name_fr?: string }>).forEach((d) => {
      const id = String(d.id || '')
      if (!id) return
      dutyNameById.set(id, String(d.name || d.name_fr || 'Görev'))
    })
  } catch {
    /* ignore */
  }

  const reportRows: EvaluatorAnswerDetailRow[] = []
  const assignmentHintsCache = new Map<string, string[]>()

  for (const a of filtered) {
    const aid = String(a.id)
    const aidKey = canonicalAssignmentId(aid)
    const responses = responsesByAssignment.get(aidKey) || responsesByAssignment.get(aid) || []
    if (!responses.length) continue

    const evalId = String(a.evaluator?.id || a.evaluator_id || '')
    const targetId = String(a.target?.id || a.target_id || '')
    const tidKey = canonicalUserId(targetId)
    const u = userByTargetId.get(targetId) || (tidKey ? userByTargetId.get(tidKey) : undefined)
    const isSelf = userIdsEqualForSelfEval(evalId, targetId)
    const evaluatorLevel = isSelf ? 'self' : String(a.evaluator?.position_level || 'peer')
    const evaluatorWeight = Number(evaluatorWeightByLevel[evaluatorLevel] ?? 1)
    const matrixContext = effectiveCoreGeneralMatrixContext(a.matrix_context, {
      evaluatorTitle: a.evaluator?.title,
      evaluatorName: a.evaluator?.name,
      targetName: a.target?.name || u?.name,
    })
    const matrixLabel = matrixEvaluationContextLabel(matrixContext)

    const scores = responses.map((r) => responseNumericScore(r))
    const hints = computeAssignmentScoringHints(scores)
    assignmentHintsCache.set(aid, hints)

    for (const r of responses) {
      const qid = canonicalUuid(r.question_id) || String(r.question_id || '').trim()
      const qMeta = resolveQuestionDisplayText(questionTextById, qid, safeLang)
      const score = responseNumericScore(r)
      const categoryKey = String(r.category_name || r.category_id || '').trim() || '—'
      const categoryLabel = categoryLabelByKey.get(categoryKey) || categoryKey
      const questionScope = String(r.question_scope || '').trim() === 'duty' ? 'duty' : 'period'
      const dutyId = String(r.duty_id || '').trim() || null
      const dutyName = dutyId ? dutyNameById.get(dutyId) || dutyId : null

      reportRows.push({
        assignmentId: aid,
        targetId,
        targetName: String(a.target?.name || u?.name || '-'),
        targetDept: String(a.target?.department || u?.department || '-'),
        evaluatorId: evalId,
        evaluatorName: String(a.evaluator?.name || '-'),
        evaluatorTitle: String(a.evaluator?.title || '-'),
        evaluatorDept: String(a.evaluator?.department || '-'),
        evaluatorLevel,
        evaluatorLevelLabel: positionLevelLabel(evaluatorLevel, safeLang),
        evaluatorWeight,
        matrixContext,
        matrixLabel,
        isSelf,
        categoryKey,
        categoryLabel,
        questionId: qid,
        questionText: qMeta.text,
        questionOrder: qMeta.order,
        score,
        isScorable: score > 0,
        questionScope,
        dutyId,
        dutyName,
        assignmentHints: hints,
      })
    }
  }

  reportRows.sort((a, b) => {
    const t = a.targetName.localeCompare(b.targetName, 'tr')
    if (t) return t
    const m = a.matrixLabel.localeCompare(b.matrixLabel, 'tr')
    if (m) return m
    const e = a.evaluatorName.localeCompare(b.evaluatorName, 'tr')
    if (e) return e
    if (a.questionOrder !== b.questionOrder) return a.questionOrder - b.questionOrder
    return a.questionText.localeCompare(b.questionText, 'tr')
  })

  const uniqueTargets = new Set(reportRows.map((r) => r.targetId))
  const uniqueEvaluators = new Set(reportRows.map((r) => r.evaluatorId))

  return {
    rows: reportRows,
    assignmentCount: assignmentHintsCache.size,
    uniqueTargets: uniqueTargets.size,
    uniqueEvaluators: uniqueEvaluators.size,
  }
}
