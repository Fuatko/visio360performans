#!/usr/bin/env node
/** Utku — kişi karnesi (birleşik genel+oy) vs matris yapı soru bazlı fark analizi */
import { getSupabaseClient } from './_load-env.mjs'
import { createClient } from '@supabase/supabase-js'

const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

function round2(n) {
  return Math.round(n * 100) / 100
}
function mean(nums) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
function numericScore(r) {
  const n = Number(r?.reel_score ?? r?.std_score ?? r?.score ?? 0)
  return Number.isFinite(n) ? n : 0
}

function coreMatrixResponsePriority(ctx) {
  const v = String(ctx || 'genel').trim()
  if (v === 'genel') return 0
  if (v === 'okul_yasam') return 1
  return 2
}

function mergeResponsesByQuestionPriority(entries) {
  const byQ = new Map()
  for (const { matrixContext, responses } of entries) {
    const p = coreMatrixResponsePriority(matrixContext)
    for (const r of responses) {
      const qid = String(r?.question_id || '').trim()
      if (!qid) continue
      const cur = byQ.get(qid)
      if (!cur || p < cur.p) byQ.set(qid, { r, p })
    }
  }
  return [...byQ.values()].map((x) => x.r)
}

function buildBundleFromResponses(responses) {
  const scorable = responses.filter((r) => numericScore(r) > 0)
  const sumResp = scorable.reduce((sum, r) => sum + numericScore(r), 0)
  const avgScore = scorable.length ? round2(sumResp / scorable.length) : 0
  const qAgg = {}
  for (const r of responses) {
    const score = numericScore(r)
    const qid = String(r?.question_id || '').trim()
    if (!qid || score <= 0) continue
    if (!qAgg[qid]) qAgg[qid] = { sum: 0, count: 0 }
    qAgg[qid].sum += score
    qAgg[qid].count += 1
  }
  const questionScores = Object.entries(qAgg).map(([questionId, v]) => ({
    questionId,
    score: v.count ? round2(v.sum / v.count) : 0,
    scoreExact: v.count ? v.sum / v.count : 0,
  }))
  return { avgScore, avgScoreExact: scorable.length ? sumResp / scorable.length : 0, questionScores, scorableCount: scorable.length }
}

function consolidateCoreGeneralEvaluations(evaluations) {
  const groups = new Map()
  for (const e of evaluations) {
    const k = e.isSelf ? '__self__' : String(e.evaluatorId || '')
    const list = groups.get(k) || []
    list.push(e)
    groups.set(k, list)
  }
  const out = []
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0])
      continue
    }
    const mergedResponses = mergeResponsesByQuestionPriority(
      list.map((e) => ({
        matrixContext: String(e.sourceMatrixContext || 'genel'),
        responses: [...(e.periodRawResponses || [])],
      }))
    )
    const bundle = buildBundleFromResponses(mergedResponses)
    const base = [...list].sort(
      (a, b) =>
        coreMatrixResponsePriority(String(a.sourceMatrixContext || 'genel')) -
        coreMatrixResponsePriority(String(b.sourceMatrixContext || 'genel'))
    )[0]
    out.push({ ...base, avgScore: bundle.avgScore, avgScoreExact: bundle.avgScoreExact, questionScores: bundle.questionScores })
  }
  return out
}

async function fetchResponses(sb, assignmentIds) {
  const map = new Map()
  const CHUNK = 100
  for (let i = 0; i < assignmentIds.length; i += CHUNK) {
    const chunk = assignmentIds.slice(i, i + CHUNK)
    let from = 0
    while (true) {
      const { data, error } = await sb
        .from('evaluation_responses')
        .select('assignment_id, question_id, category_id, reel_score, std_score')
        .in('assignment_id', chunk)
        .range(from, from + 999)
      if (error) throw error
      for (const r of data || []) {
        const aid = String(r.assignment_id)
        const list = map.get(aid) || []
        list.push(r)
        map.set(aid, list)
      }
      if ((data || []).length < 1000) break
      from += 1000
    }
  }
  return map
}

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
  if (!utku) throw new Error('Utku bulunamadı')
  console.log('Hedef:', utku.name, utku.id)

  const { data: assignments } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, target_id, matrix_context, status, evaluator:evaluator_id(id, name, position_level)')
    .eq('period_id', PERIOD)
    .eq('target_id', utku.id)
    .eq('status', 'completed')

  const core = (assignments || []).filter((a) => {
    const ctx = String(a.matrix_context || '')
    return ctx === 'genel' || ctx === 'okul_yasam'
  })
  const peerCore = core.filter((a) => String(a.evaluator_id) !== String(a.target_id))

  const responsesByAssignment = await fetchResponses(
    sb,
    core.map((a) => String(a.id))
  )

  const rawEvals = []
  for (const a of peerCore) {
    const responses = responsesByAssignment.get(String(a.id)) || []
    const bundle = buildBundleFromResponses(responses)
    rawEvals.push({
      evaluatorId: a.evaluator_id,
      evaluatorName: a.evaluator?.name || '-',
      isSelf: false,
      sourceMatrixContext: a.matrix_context,
      avgScore: bundle.avgScore,
      avgScoreExact: bundle.avgScoreExact,
      questionScores: bundle.questionScores,
      periodRawResponses: responses,
      scorableCount: bundle.scorableCount,
    })
  }

  const consolidated = consolidateCoreGeneralEvaluations(rawEvals)

  // A) Kişi karnesi: değerlendirici ortalamasının ortalaması (round2 her değerlendirici)
  const peerAvgsRound2 = consolidated.map((e) => e.avgScore)
  const peerAvgsExact = consolidated.map((e) => e.avgScoreExact)
  const karnePeerAvgR2 = round2(mean(peerAvgsRound2))
  const karnePeerAvgExact = mean(peerAvgsExact)

  // B) Soru bazlı (matris yapı): her soru için değerlendirici dedupe, sonra soru ort, sonra genel
  const byQuestion = new Map()
  for (const e of consolidated) {
    for (const qs of e.questionScores) {
      if (!byQuestion.has(qs.questionId)) byQuestion.set(qs.questionId, [])
      byQuestion.get(qs.questionId).push({ name: e.evaluatorName, score: qs.scoreExact ?? qs.score })
    }
  }
  const questionAvgsExact = [...byQuestion.values()].map((scores) => mean(scores.map((s) => s.score)))
  const matrixExact = mean(questionAvgsExact)

  // C) Soru bazlı ama her değerlendirici soru ort. round2 önce
  const byQuestionFromRaw = new Map()
  for (const row of rawEvals) {
    const ctx = row.sourceMatrixContext
    for (const r of row.periodRawResponses) {
      const qid = String(r.question_id || '')
      const score = numericScore(r)
      if (!qid || score <= 0) continue
      if (!byQuestionFromRaw.has(qid)) byQuestionFromRaw.set(qid, new Map())
      const evMap = byQuestionFromRaw.get(qid)
      const eid = row.evaluatorId
      const priority = coreMatrixResponsePriority(ctx)
      const cur = evMap.get(eid)
      const next = { score, priority, name: row.evaluatorName }
      if (!cur || priority < cur.priority || (priority === cur.priority && score > cur.score)) {
        evMap.set(eid, next)
      }
    }
  }
  const qAvgsFromRaw = [...byQuestionFromRaw.values()].map((m) => mean([...m.values()].map((x) => x.score)))
  const matrixFromRawExact = mean(qAvgsFromRaw)

  // D) genelOkulYasamCombined: avg(genel peer, oy peer) ayrı dilimler
  const genelOnly = rawEvals.filter((e) => e.sourceMatrixContext === 'genel')
  const oyOnly = rawEvals.filter((e) => e.sourceMatrixContext === 'okul_yasam')
  const genelPeerExact = mean(genelOnly.map((e) => e.avgScoreExact))
  const oyPeerExact = oyOnly.length ? mean(oyOnly.map((e) => e.avgScoreExact)) : 0
  const combinedSeparateExact = oyPeerExact > 0 ? (genelPeerExact + oyPeerExact) / 2 : genelPeerExact
  const combinedSeparateR2 = round2(combinedSeparateExact)

  // E) Tüm yanıtlar düz ortalama (113 satır)
  const allScores = []
  for (const e of rawEvals) {
    for (const r of e.periodRawResponses) {
      const s = numericScore(r)
      if (s > 0) allScores.push(s)
    }
  }

  console.log('\n=== KARŞILAŞTIRMA ===')
  console.log('Değerlendirici sayısı (ham):', rawEvals.length, '| birleşik:', consolidated.length)
  console.log('Soru sayısı (birleşik):', byQuestion.size)
  console.log('')
  console.log('A) Kişi karnesi peerAvg (eval avg, round2/eval):     exact=', karnePeerAvgExact.toFixed(6), ' round2=', karnePeerAvgR2)
  console.log('B) Matris yapı (soru bazlı, consolidated Q):         exact=', matrixExact.toFixed(6), ' round2=', round2(matrixExact))
  console.log('C) Matris yapı (soru bazlı, raw dedupe):             exact=', matrixFromRawExact.toFixed(6), ' round2=', round2(matrixFromRawExact))
  console.log('D) genelOkulYasamCombined (genel+oy /2):             exact=', combinedSeparateExact.toFixed(6), ' round2=', combinedSeparateR2)
  console.log('E) Düz tüm puanlı satır ort.:                        exact=', mean(allScores).toFixed(6), ' n=', allScores.length)

  console.log('\n--- Değerlendirici kırılım (birleşik) ---')
  for (const e of consolidated.sort((a, b) => a.evaluatorName.localeCompare(b.evaluatorName, 'tr'))) {
    console.log(
      `  ${e.evaluatorName.padEnd(28)} ctx=${String(e.sourceMatrixContext).padEnd(10)} soru=${String(e.scorableCount ?? e.questionScores.length).padStart(2)} exact=${e.avgScoreExact.toFixed(4)} r2=${e.avgScore.toFixed(2)}`
    )
  }

  // F) round2 per question per evaluator path (buildBundle rounds per assignment before merge?)
  console.log('\n--- F) buildBundle round2 etkisi ---')
  const perEvalRound2ThenAvg = round2(mean(rawEvals.map((e) => e.avgScore)))
  const perEvalExactThenAvg = mean(rawEvals.map((e) => e.avgScoreExact))
  console.log('Ham eval (round2/evaluator) ort:', perEvalRound2ThenAvg, '| exact:', perEvalExactThenAvg.toFixed(6))

  // G) Question avg using round2 per question per evaluator from consolidated bundles
  const qAvgsFromConsRound2 = []
  for (const [, scores] of byQuestion) {
    qAvgsFromConsRound2.push(mean(scores.map((s) => round2(s.score))))
  }
  console.log('Soru ort (eval soru skorları exact) /21:', matrixExact.toFixed(6))
  console.log('Soru ort (eval soru skorları round2) /21:', round2(mean(qAvgsFromConsRound2)), ' exact=', mean(qAvgsFromConsRound2).toFixed(6))

  // H) Which evaluators have both genel and oy?
  const both = new Map()
  for (const e of rawEvals) {
    const id = String(e.evaluatorId)
    if (!both.has(id)) both.set(id, new Set())
    both.get(id).add(e.sourceMatrixContext)
  }
  console.log('\n--- Hem genel hem oy olan değerlendiriciler ---')
  for (const [id, ctxs] of both) {
    if (ctxs.size > 1) {
      const rows = rawEvals.filter((e) => String(e.evaluatorId) === id)
      const merged = consolidated.find((e) => String(e.evaluatorId) === id)
      console.log(`  ${rows[0].evaluatorName}: genel=${rows.find((r) => r.sourceMatrixContext === 'genel')?.avgScoreExact.toFixed(4)} oy=${rows.find((r) => r.sourceMatrixContext === 'okul_yasam')?.avgScoreExact.toFixed(4)} merged=${merged?.avgScoreExact.toFixed(4)}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
