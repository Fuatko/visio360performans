#!/usr/bin/env node
/** Utku — admin results API tüm skor alanları */
import { getSupabaseClient } from './_load-env.mjs'

const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

async function main() {
  const sb = await getSupabaseClient()
  const { data: period } = await sb.from('evaluation_periods').select('organization_id').eq('id', PERIOD).single()
  const orgId = period.organization_id

  const { data: utku } = await sb
    .from('users')
    .select('id, name')
    .eq('organization_id', orgId)
    .ilike('name', '%Utku%AYTA%')
    .maybeSingle()
  if (!utku) throw new Error('Utku yok')

  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  // Use internal computation via ts imports instead
  const { fetchEvaluatorAnswerDetailRows } = await import('../src/lib/server/evaluator-answer-detail-fetch.ts')
  const { aggregatePersonQuestionPeerAverages } = await import('../src/lib/server/person-question-peer-averages.ts')
  const { computeMatrixStructureScoresForTarget } = await import('../src/lib/server/matrix-structure-scoring.ts')
  const { computeGenelOkulYasamCombinedScores, computeOkulYasamPeerSummary } = await import('../src/lib/server/genel-okul-yasam-combined-score.ts')

  const fetched = await fetchEvaluatorAnswerDetailRows(sb, {
    periodId: PERIOD,
    orgId,
    lang: 'tr',
    targetId: utku.id,
  })
  const rows = fetched.rows.filter((r) => String(r.targetId) === String(utku.id) || true)
  const utkuRows = rows.filter((r) => /utku/i.test(r.targetName || ''))

  const pq = aggregatePersonQuestionPeerAverages(utkuRows, { excludeSelf: true })
  const qAvgs = pq.filter((q) => q.peerAvg != null).map((q) => q.peerAvg)
  const qAvgsExact = pq
    .filter((q) => q.scorableResponseCount > 0)
    .map((q) => {
      const sc = q.evaluators.filter((e) => e.score != null).map((e) => Number(e.score))
      return sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : 0
    })
  const pqOverall = qAvgsExact.length ? qAvgsExact.reduce((a, b) => a + b, 0) / qAvgsExact.length : 0

  const matrix = computeMatrixStructureScoresForTarget(utkuRows)

  console.log('=== UTKU SKOR ALANLARI ===\n')
  console.log('Matris yapı overallPeerAvgExact:', matrix?.overallPeerAvgExact?.toFixed(6))
  console.log('Matris yapı overallPeerAvg:     ', matrix?.overallPeerAvg)
  console.log('Person Q peer avg (exact):      ', pqOverall.toFixed(6))
  console.log('Person Q peer avg (round2/q):   ', (qAvgs.reduce((a, b) => a + b, 0) / (qAvgs.length || 1)).toFixed(6))

  // Simulate results route fields — need full eval pipeline
  const { buildMatrixReportPeriodGroups } = await import('../src/lib/server/matrix-report-slices.ts')
  const { MERGED_GENEL_SLICE_CONTEXT } = await import('../src/lib/admin-person-report-card-display.ts')

  const { data: assignments } = await sb
    .from('evaluation_assignments')
    .select(
      `id, evaluator_id, target_id, status, matrix_context,
       evaluator:evaluator_id(id, name, position_level),
       evaluation_periods(id, name, start_date, end_date, assessment_kind, organization_id)`
    )
    .eq('target_id', utku.id)
    .eq('status', 'completed')

  const periodAssignments = (assignments || []).filter((a) => String(a.evaluation_periods?.id) === PERIOD)
  const assignmentIds = periodAssignments.map((a) => String(a.id))
  const responsesByAssignment = new Map()
  for (let i = 0; i < assignmentIds.length; i += 100) {
    const chunk = assignmentIds.slice(i, i + 100)
    const { data } = await sb
      .from('evaluation_responses')
      .select('assignment_id, question_id, category_id, reel_score, std_score, category_name')
      .in('assignment_id', chunk)
    for (const r of data || []) {
      const aid = String(r.assignment_id)
      const list = responsesByAssignment.get(aid) || []
      list.push(r)
      responsesByAssignment.set(aid, list)
    }
  }

  const { data: pqRows } = await sb
    .from('period_questions')
    .select('question_id, category_id, questions(id, categories(id, key, label_tr))')
    .eq('period_id', PERIOD)
  const categoryByQuestionId = new Map()
  const categoryById = new Map()
  const categoryWeightByName = {}
  for (const row of pqRows || []) {
    const qid = String(row.question_id || '')
    const cat = row.questions?.categories
    const key = String(cat?.key || cat?.label_tr || 'Genel')
    const label = String(cat?.label_tr || key)
    if (qid) categoryByQuestionId.set(qid, { key, label })
    if (cat?.id) categoryById.set(String(cat.id), { key, label })
    categoryWeightByName[key] = 1
  }

  const groups = buildMatrixReportPeriodGroups({
    assignments: periodAssignments,
    responsesByAssignment,
    standardsByAssignment: new Map(),
    categoryByQuestionId,
    categoryById,
    categoryWeightByName,
    includeSelf: false,
  })
  const merged = groups.find((g) => g.periodId === PERIOD)?.slices.find((s) => s.matrixContext === MERGED_GENEL_SLICE_CONTEXT)

  console.log('\nKişi karnesi merged peerAvg:          ', merged?.peerAvg)
  console.log('Kişi karnesi merged overallAvgTrimmed: ', merged?.overallAvgTrimmed)

  // Category compare from merged slice
  if (merged?.categoryCompare?.length) {
    const catPeers = merged.categoryCompare.filter((c) => c.peer > 0).map((c) => c.peer)
    const catMean = catPeers.reduce((a, b) => a + b, 0) / catPeers.length
    console.log('Karne kategori peer ort (unweighted):  ', catMean.toFixed(6), `(${catPeers.length} kat)`)
    for (const c of merged.categoryCompare) {
      if (c.peer > 0) console.log(`  ${c.name}: peer=${c.peer}`)
    }
  }

  // matrix categories from matrix report
  if (matrix?.categories?.length) {
    const catPeers = matrix.categories.map((c) => c.peerAvg)
    const catMean = catPeers.reduce((a, b) => a + b, 0) / catPeers.length
    console.log('\nMatris kategori peer ort (round2/q):   ', catMean.toFixed(6), `(${catPeers.length} kat)`)
    for (const c of matrix.categories) {
      console.log(`  ${c.categoryLabel}: peer=${c.peerAvg}`)
    }
  }

  // genelOkulYasam combined — need evalsAll mock from results... use merged + oy split
  const oySummary = computeOkulYasamPeerSummary(
    periodAssignments
      .filter((a) => String(a.evaluator_id) !== String(a.target_id))
      .map((a) => {
        const responses = responsesByAssignment.get(String(a.id)) || []
        const sc = responses.filter((r) => Number(r.reel_score ?? r.std_score ?? 0) > 0)
        const avg = sc.length ? sc.reduce((s, r) => s + Number(r.reel_score ?? r.std_score ?? 0), 0) / sc.length : 0
        return {
          matrixContext: a.matrix_context,
          isSelf: false,
          hasScorableResponses: sc.length > 0,
          avgScore: Math.round(avg * 100) / 100,
        }
      }),
    categoryWeightByName,
    'development_360'
  )
  const combined = computeGenelOkulYasamCombinedScores({
    genelOverallAvg: merged?.peerAvg ?? 0,
    genelOverallAvgRaw: merged?.peerAvg ?? 0,
    genelOverallAvgTrimmed: merged?.overallAvgTrimmed ?? 0,
    genelPeerTrimEligible: merged?.peerTrimEligible === true,
    okulYasam: oySummary,
  })
  console.log('\ngenelOkulYasamCombinedAvg:             ', combined.genelOkulYasamCombinedAvg)
  console.log('okulYasamPeerAvg:                      ', combined.okulYasamPeerAvg)

  // Search for 4.919 — brute force nearby formulas
  const candidates = {
    matrixExact: matrix?.overallPeerAvgExact,
    matrixR2: matrix?.overallPeerAvg,
    karnePeer: merged?.peerAvg,
    pqExact: pqOverall,
    catKarne: merged?.categoryCompare?.filter((c) => c.peer > 0).reduce((s, c) => s + c.peer, 0) / (merged?.categoryCompare?.filter((c) => c.peer > 0).length || 1),
    catMatrix: matrix?.categories?.reduce((s, c) => s + c.peerAvg, 0) / (matrix?.categories?.length || 1),
    combined: combined.genelOkulYasamCombinedAvg,
  }
  console.log('\n--- 4.919 adayları ---')
  for (const [k, v] of Object.entries(candidates)) {
    if (v == null) continue
    const diff = Math.abs(Number(v) - 4.919)
    console.log(`${k.padEnd(14)} ${Number(v).toFixed(6)}  Δ=${diff.toFixed(6)}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
