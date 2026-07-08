#!/usr/bin/env node
/** Utku AYTAÇ — matris yapı soru bazlı puan teşhisi */
import { getSupabaseClient } from './_load-env.mjs'
import { fetchEvaluatorAnswerDetailRows } from '../src/lib/server/evaluator-answer-detail-fetch.ts'
import {
  computeMatrixStructureScoresForTarget,
  filterMatrixStructureScoringRows,
} from '../src/lib/server/matrix-structure-scoring.ts'
import { canonicalUserId } from '../src/lib/server/evaluation-identity.ts'
import { coreMatrixResponsePriority } from '../src/lib/server/core-general-report-merge.ts'

const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const TARGET_NAME = process.env.TARGET_NAME || 'Utku'

function round2(n) {
  return Math.round(n * 100) / 100
}

function mean(nums) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

async function main() {
  const sb = await getSupabaseClient()
  const { data: period } = await sb
    .from('evaluation_periods')
    .select('organization_id')
    .eq('id', PERIOD)
    .single()
  if (!period) throw new Error('Dönem bulunamadı')

  const orgId = period.organization_id
  const fetched = await fetchEvaluatorAnswerDetailRows(sb, {
    periodId: PERIOD,
    orgId,
    lang: 'tr',
    deptKey: '',
  })

  const targetRows = fetched.rows.filter((r) =>
    String(r.targetName || '')
      .toLocaleLowerCase('tr-TR')
      .includes(TARGET_NAME.toLocaleLowerCase('tr-TR'))
  )
  if (!targetRows.length) {
    console.log('Hedef bulunamadı:', TARGET_NAME)
    return
  }

  const targetId = canonicalUserId(targetRows[0].targetId) || targetRows[0].targetId
  const targetName = targetRows[0].targetName
  const onlyTarget = fetched.rows.filter(
    (r) => (canonicalUserId(r.targetId) || r.targetId) === targetId
  )

  const system = computeMatrixStructureScoresForTarget(onlyTarget)
  const scoring = filterMatrixStructureScoringRows(onlyTarget)

  console.log('===', targetName, '===')
  console.log('Sistem overallPeerAvg:', system?.overallPeerAvg)
  console.log('Sistem answeredQuestionCount:', system?.answeredQuestionCount)
  console.log('')

  // Düz ortalama: tüm puanlı satırların ortalaması (soru ağırlığı yok)
  const flatScores = scoring.map((r) => Number(r.score))
  const flatExact = mean(flatScores)
  console.log('Düz ortalama (tüm puanlı satırlar /', flatScores.length, '):', flatExact.toFixed(6), '→', round2(flatExact))

  // Soru bazlı — yuvarlama yok
  const byQuestion = new Map()
  for (const row of scoring) {
    const qid = row.questionId
    if (!byQuestion.has(qid)) {
      byQuestion.set(qid, {
        text: row.questionText?.slice(0, 60),
        order: row.questionOrder,
        evaluators: new Map(),
      })
    }
    const acc = byQuestion.get(qid)
    const priority = coreMatrixResponsePriority(row.matrixContext)
    const cur = acc.evaluators.get(row.evaluatorId)
    const next = { score: Number(row.score), priority, name: row.evaluatorName, ctx: row.matrixContext }
    if (!cur || priority < cur.priority || (priority === cur.priority && next.score > cur.score)) {
      acc.evaluators.set(row.evaluatorId, next)
    }
  }

  const questionAvgsExact = []
  const questionAvgsRound2 = []
  console.log('\n--- Soru bazlı kırılım ---')
  const sorted = [...byQuestion.entries()].sort((a, b) => a[1].order - b[1].order)
  for (const [qid, acc] of sorted) {
    const scores = [...acc.evaluators.values()].map((e) => e.score)
    const avgExact = mean(scores)
    const avgR2 = round2(avgExact)
    questionAvgsExact.push(avgExact)
    questionAvgsRound2.push(avgR2)
    console.log(
      `S${acc.order} | ${scores.length} değ. | exact=${avgExact.toFixed(6)} r2=${avgR2.toFixed(2)} | ${acc.text}`
    )
  }

  const overallExact = mean(questionAvgsExact)
  const overallFromRound2Questions = mean(questionAvgsRound2)
  const overallRound2Exact = round2(overallExact)
  const overallRound2FromRound2Q = round2(overallFromRound2Questions)

  console.log('\n--- Genel ortalama karşılaştırma ---')
  console.log('Soru ort. (exact) → genel exact     :', overallExact.toFixed(6))
  console.log('Soru ort. (exact) → round2          :', overallRound2Exact)
  console.log('Soru ort. (round2) → genel exact    :', overallFromRound2Questions.toFixed(6))
  console.log('Soru ort. (round2) → round2         :', overallRound2FromRound2Q)
  console.log('Sistem computeMatrixStructure       :', system?.overallPeerAvg)

  // Değerlendirici bazlı: her değerlendiricinin tüm sorularının ortalaması, sonra değerlendirici ortalaması
  const byEvaluator = new Map()
  for (const row of scoring) {
    const eid = row.evaluatorId
    if (!byEvaluator.has(eid)) byEvaluator.set(eid, { name: row.evaluatorName, scores: [] })
    byEvaluator.get(eid).scores.push(Number(row.score))
  }
  // dedupe: same evaluator might appear in genel+okul for same question - use per-question dedupe first
  const byEvaluatorDeduped = new Map()
  for (const [, acc] of byQuestion) {
    for (const [eid, e] of acc.evaluators) {
      if (!byEvaluatorDeduped.has(eid)) byEvaluatorDeduped.set(eid, { name: e.name, scores: [] })
      byEvaluatorDeduped.get(eid).scores.push(e.score)
    }
  }

  const evalAvgs = [...byEvaluatorDeduped.values()].map((e) => ({
    name: e.name,
    avg: mean(e.scores),
    n: e.scores.length,
  }))
  const evaluatorPoolExact = mean(evalAvgs.map((e) => e.avg))
  console.log('\nDeğerlendirici ortalamasının ortalaması (', evalAvgs.length, 'kişi):', evaluatorPoolExact.toFixed(6), '→', round2(evaluatorPoolExact))

  console.log('\n--- Değerlendiriciler (soru sayısı / ort) ---')
  evalAvgs.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  for (const e of evalAvgs) {
    console.log(`  ${e.name.padEnd(28)} ${String(e.n).padStart(2)} soru  avg=${e.avg.toFixed(4)}`)
  }

  // Ham satır sayısı vs dedupe
  console.log('\nHam scoring satırı:', scoring.length)
  console.log('Benzersiz soru:', byQuestion.size)
  console.log('Benzersiz değerlendirici (dedupe):', byEvaluatorDeduped.size)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
