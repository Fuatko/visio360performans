#!/usr/bin/env node
/** Utku — gerçek kişi karnesi pipeline vs matris yapı */
import { getSupabaseClient } from './_load-env.mjs'
import {
  buildMatrixReportPeriodGroups,
  consolidateCoreGeneralEvaluations,
} from '../src/lib/server/matrix-report-slices.ts'
import {
  computeMatrixStructureScoresForTarget,
  filterMatrixStructureScoringRows,
} from '../src/lib/server/matrix-structure-scoring.ts'
import { fetchEvaluatorAnswerDetailRows } from '../src/lib/server/evaluator-answer-detail-fetch.ts'
import { canonicalUserId } from '../src/lib/server/evaluation-identity.ts'
import { MERGED_GENEL_SLICE_CONTEXT } from '../src/lib/admin-person-report-card-display.ts'
import { buildScopeScoreSummary } from '../src/lib/server/evaluation-score-metrics.ts'
import { buildCategoryCompareForScope, finalizeTargetScopeAverages } from '../src/lib/server/evaluation-response-scope.ts'

const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

async function loadCategories(sb, periodId) {
  const { data: pq } = await sb
    .from('period_questions')
    .select('question_id, category_id, sort_order, questions(id, text_tr, category_id, categories(id, key, label_tr))')
    .eq('period_id', periodId)
  const categoryByQuestionId = new Map()
  const categoryById = new Map()
  const categoryWeightByName = {}
  for (const row of pq || []) {
    const qid = String(row.question_id || '')
    const cat = row.questions?.categories
    const key = String(cat?.key || cat?.label_tr || 'Genel')
    const label = String(cat?.label_tr || key)
    if (qid) categoryByQuestionId.set(qid, { key, label })
    if (cat?.id) categoryById.set(String(cat.id), { key, label })
    categoryWeightByName[key] = 1
  }
  return { categoryByQuestionId, categoryById, categoryWeightByName }
}

async function main() {
  const sb = await getSupabaseClient()
  const { data: period } = await sb.from('evaluation_periods').select('organization_id, assessment_kind').eq('id', PERIOD).single()
  const orgId = period.organization_id

  const { data: utku } = await sb
    .from('users')
    .select('id, name')
    .eq('organization_id', orgId)
    .ilike('name', '%Utku%AYTA%')
    .maybeSingle()
  if (!utku) throw new Error('Utku yok')

  const { categoryByQuestionId, categoryById, categoryWeightByName } = await loadCategories(sb, PERIOD)

  const { data: assignments } = await sb
    .from('evaluation_assignments')
    .select(
      `id, evaluator_id, target_id, status, completed_at, matrix_context,
       evaluator:evaluator_id(id, name, position_level),
       evaluation_periods(id, name, start_date, end_date, assessment_kind, organization_id)`
    )
    .eq('target_id', utku.id)
    .eq('status', 'completed')

  const periodAssignments = (assignments || []).filter((a) => String(a.evaluation_periods?.id) === PERIOD)
  const assignmentIds = periodAssignments.map((a) => String(a.id))

  const responsesByAssignment = new Map()
  const CHUNK = 100
  for (let i = 0; i < assignmentIds.length; i += CHUNK) {
    const chunk = assignmentIds.slice(i, i + CHUNK)
    let from = 0
    while (true) {
      const { data } = await sb
        .from('evaluation_responses')
        .select('assignment_id, question_id, category_id, reel_score, std_score, category_name')
        .in('assignment_id', chunk)
        .range(from, from + 999)
      for (const r of data || []) {
        const aid = String(r.assignment_id)
        const list = responsesByAssignment.get(aid) || []
        list.push(r)
        responsesByAssignment.set(aid, list)
      }
      if ((data || []).length < 1000) break
      from += 1000
    }
  }

  const standardsByAssignment = new Map()
  const groups = buildMatrixReportPeriodGroups({
    assignments: periodAssignments,
    responsesByAssignment,
    standardsByAssignment,
    categoryByQuestionId,
    categoryById,
    categoryWeightByName,
    includeSelf: false,
  })

  const periodGroup = groups.find((g) => g.periodId === PERIOD)
  const mergedSlice = periodGroup?.slices.find((s) => s.matrixContext === MERGED_GENEL_SLICE_CONTEXT)

  console.log('=== KİŞİ KARNESİ (gerçek pipeline) ===')
  if (mergedSlice) {
    console.log('peerAvg:              ', mergedSlice.peerAvg)
    console.log('peerAvgTrimmed:       ', mergedSlice.peerAvgTrimmed)
    console.log('overallAvg:           ', mergedSlice.overallAvg)
    console.log('overallAvgTrimmed:    ', mergedSlice.overallAvgTrimmed)
    console.log('peerTrimEligible:     ', mergedSlice.peerTrimEligible)
    console.log('peerEvaluatorCount:   ', mergedSlice.peerEvaluatorCount)
  } else {
    console.log('Merged slice bulunamadı')
  }

  const fetched = await fetchEvaluatorAnswerDetailRows(sb, {
    periodId: PERIOD,
    orgId,
    lang: 'tr',
    targetId: utku.id,
  })
  const targetKey = canonicalUserId(utku.id) || utku.id
  const onlyTarget = fetched.rows.filter((r) => (canonicalUserId(r.targetId) || r.targetId) === targetKey)
  const matrix = computeMatrixStructureScoresForTarget(onlyTarget, { targetName: utku.name })

  console.log('\n=== MATRİS YAPI ===')
  console.log('overallPeerAvg:       ', matrix?.overallPeerAvg)
  console.log('overallPeerAvgExact:  ', matrix?.overallPeerAvgExact?.toFixed(6))
  console.log('questionAvgSum:       ', matrix?.questionAvgSum?.toFixed(6))
  console.log('answeredQuestionCount:', matrix?.answeredQuestionCount)

  // Manual peer avg from karne evals (rebuild)
  const coreAssignments = periodAssignments.filter((a) => {
    const ctx = String(a.matrix_context || '')
    return ctx === 'genel' || ctx === 'okul_yasam'
  })
  const numericScore = (r) => Number(r?.reel_score ?? r?.std_score ?? 0)
  const rawEvals = []
  for (const a of coreAssignments) {
    const eid = String(a.evaluator_id || '')
    const tid = String(a.target_id || '')
    if (eid === tid) continue
    const responses = responsesByAssignment.get(String(a.id)) || []
    const scorable = responses.filter((r) => numericScore(r) > 0)
    const avgExact = scorable.length ? scorable.reduce((s, r) => s + numericScore(r), 0) / scorable.length : 0
    rawEvals.push({
      evaluatorId: a.evaluator_id,
      evaluatorName: a.evaluator?.name,
      isSelf: false,
      sourceMatrixContext: a.matrix_context,
      avgScore: Math.round(avgExact * 100) / 100,
      hasScorableResponses: scorable.length > 0,
      periodRawResponses: responses,
      categories: [],
      questionScores: [],
      answeredQuestionIds: [],
    })
  }

  const consolidated = consolidateCoreGeneralEvaluations(rawEvals, categoryByQuestionId, categoryById)
  const peerScorable = consolidated.filter((e) => !e.isSelf && e.hasScorableResponses)
  const scopeAvgs = finalizeTargetScopeAverages(consolidated, () => 1)
  const categoryCompare = buildCategoryCompareForScope(consolidated, 'period', categoryWeightByName)
  const periodMetrics = buildScopeScoreSummary({
    evaluations: consolidated,
    scope: 'period',
    categoryCompare,
    categoryWeightByName,
    assessmentKind: period.assessment_kind || 'development_360',
    overallAvg: scopeAvgs.overallAvgPeriod,
  })

  console.log('\n=== EL İLE YENİDEN (consolidated) ===')
  console.log('peerAvgPeriod raw:    ', scopeAvgs.peerAvgPeriod)
  console.log('peer exact (manual):  ', (peerScorable.reduce((s, e) => s + Number(e.avgScore || 0), 0) / peerScorable.length).toFixed(6))
  console.log('peer exact unrounded:', (peerScorable.reduce((s, e) => {
    const responses = e.periodRawResponses || []
    const sc = responses.filter((r) => numericScore(r) > 0)
    const avg = sc.length ? sc.reduce((a, r) => a + numericScore(r), 0) / sc.length : 0
    return s + avg
  }, 0) / peerScorable.length).toFixed(6))
  console.log('overallAvgTrimmed:    ', periodMetrics?.overallAvgTrimmed)
  console.log('peerAvgTrimmed:       ', periodMetrics?.peerAvgTrimmed)
  console.log('peerTrimEligible:     ', periodMetrics?.peerTrimEligible)

  console.log('\n=== FARK ===')
  const karnePeer = mergedSlice?.peerAvg ?? scopeAvgs.peerAvgPeriod
  const karneTrim = mergedSlice?.overallAvgTrimmed ?? periodMetrics?.overallAvgTrimmed
  console.log('Matris exact - Karne peerAvg     :', (matrix.overallPeerAvgExact - karnePeer).toFixed(6))
  console.log('Matris exact - Karne trim        :', (matrix.overallPeerAvgExact - karneTrim).toFixed(6))

  // Category compare weighted?
  const catPeerAvg = categoryCompare.filter((c) => c.peer > 0)
  const catMean = catPeerAvg.length
    ? catPeerAvg.reduce((s, c) => s + c.peer, 0) / catPeerAvg.length
    : 0
  console.log('Kategori peer ort (unweighted):   ', catMean.toFixed(6))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
