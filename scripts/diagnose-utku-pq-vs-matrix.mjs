#!/usr/bin/env node
/** Utku — matris vs person-Q satır satır fark */
import { getSupabaseClient } from './_load-env.mjs'
import { fetchEvaluatorAnswerDetailRows } from '../src/lib/server/evaluator-answer-detail-fetch.ts'
import {
  computeMatrixStructureScoresForTarget,
  filterMatrixStructureScoringRows,
} from '../src/lib/server/matrix-structure-scoring.ts'
import { aggregatePersonQuestionPeerAverages } from '../src/lib/server/person-question-peer-averages.ts'
import { coreMatrixResponsePriority } from '../src/lib/server/core-general-report-merge.ts'

const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

function mean(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

async function main() {
  const sb = await getSupabaseClient()
  const { data: period } = await sb.from('evaluation_periods').select('organization_id').eq('id', PERIOD).single()
  const { data: utku } = await sb
    .from('users')
    .select('id, name')
    .eq('organization_id', period.organization_id)
    .ilike('name', '%Utku%AYTA%')
    .single()

  const fetched = await fetchEvaluatorAnswerDetailRows(sb, {
    periodId: PERIOD,
    orgId: period.organization_id,
    lang: 'tr',
    targetIdFilter: utku.id,
  })

  const matrixRows = filterMatrixStructureScoringRows(fetched.rows)
  const matrix = computeMatrixStructureScoresForTarget(fetched.rows)
  const pqWithSelf = aggregatePersonQuestionPeerAverages(fetched.rows)
  const pqNoSelf = aggregatePersonQuestionPeerAverages(fetched.rows, { excludeSelf: true })

  const pqExact = (rows) => {
    const avgs = rows
      .filter((q) => q.scorableResponseCount > 0)
      .map((q) => mean(q.evaluators.filter((e) => e.score != null).map((e) => Number(e.score))))
    return mean(avgs)
  }

  console.log('Toplam fetch satır:', fetched.rows.length)
  console.log('Matrix scoring satır:', matrixRows.length)
  console.log('Self satır (fetch):', fetched.rows.filter((r) => r.isSelf).length)
  console.log('')
  console.log('Matrix exact:', matrix?.overallPeerAvgExact?.toFixed(6))
  console.log('PQ with self exact:', pqExact(pqWithSelf).toFixed(6), ' soru:', pqWithSelf.length)
  console.log('PQ no self exact:', pqExact(pqNoSelf).toFixed(6), ' soru:', pqNoSelf.length)

  const matrixQ = new Map(matrix?.questions.map((q) => [q.questionId, q]) || [])
  console.log('\n--- Soru bazında fark (PQ no-self vs matrix) ---')
  for (const pq of pqNoSelf.sort((a, b) => a.questionOrder - b.questionOrder)) {
    const mq = matrixQ.get(pq.questionId)
    const pqE = mean(pq.evaluators.filter((e) => e.score != null).map((e) => Number(e.score)))
    const diff = mq ? pqE - mq.peerAvgExact : null
    if (mq && Math.abs(diff) > 0.0001) {
      console.log(`S${pq.questionOrder} PQ=${pqE.toFixed(6)} MX=${mq.peerAvgExact.toFixed(6)} Δ=${diff.toFixed(6)} n=${pq.scorableResponseCount}/${mq.scorerCount}`)
      console.log(`  ${pq.questionText.slice(0, 70)}`)
    }
  }

  // Check if person Q includes non-core contexts
  const ctxSet = new Set(fetched.rows.map((r) => r.matrixContext))
  console.log('\nMatrix contexts in fetch:', [...ctxSet].join(', '))

  const coreOnly = fetched.rows.filter((r) => r.matrixContext === 'genel' || r.matrixContext === 'okul_yasam')
  const pqCore = aggregatePersonQuestionPeerAverages(coreOnly, { excludeSelf: true })
  console.log('PQ core-only no-self exact:', pqExact(pqCore).toFixed(6), ' soru:', pqCore.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
