#!/usr/bin/env node
/**
 * Utku AYTAÇ — 21 soru tek tek: kim kaç verdi, soru ort., toplam/21
 * Kullanıcı el hesabı (4,897) ile sistem (4,91) farkını satır satır karşılaştırır.
 */
import { getSupabaseClient } from './_load-env.mjs'
import { fetchEvaluatorAnswerDetailRows } from '../src/lib/server/evaluator-answer-detail-fetch.ts'
import {
  computeMatrixStructureScoresForTarget,
  filterMatrixStructureScoringRows,
} from '../src/lib/server/matrix-structure-scoring.ts'
import { canonicalUserId } from '../src/lib/server/evaluation-identity.ts'
import { coreMatrixResponsePriority } from '../src/lib/server/core-general-report-merge.ts'

const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

function mean(nums) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function buildQuestionMap(scoring, { genelOnly = false, dedupe = true } = {}) {
  const rows = genelOnly ? scoring.filter((r) => r.matrixContext === 'genel') : scoring
  const byQuestion = new Map()

  for (const row of rows) {
    const qid = row.questionId
    if (!qid) continue
    if (!byQuestion.has(qid)) {
      byQuestion.set(qid, {
        questionId: qid,
        order: row.questionOrder,
        text: row.questionText || '',
        scores: [],
      })
    }
    const acc = byQuestion.get(qid)
    if (row.questionOrder < acc.order) acc.order = row.questionOrder
    if (row.questionText) acc.text = row.questionText

    if (!dedupe) {
      acc.scores.push({
        evaluatorId: row.evaluatorId,
        name: row.evaluatorName,
        score: Number(row.score),
        ctx: row.matrixContext,
      })
      continue
    }

    const priority = coreMatrixResponsePriority(row.matrixContext)
    const idx = acc.scores.findIndex((s) => s.evaluatorId === row.evaluatorId)
    const next = {
      evaluatorId: row.evaluatorId,
      name: row.evaluatorName,
      score: Number(row.score),
      ctx: row.matrixContext,
      priority,
    }
    if (idx < 0) {
      acc.scores.push(next)
    } else {
      const cur = acc.scores[idx]
      if (
        priority < cur.priority ||
        (priority === cur.priority && next.score > cur.score)
      ) {
        acc.scores[idx] = next
      }
    }
  }

  return [...byQuestion.values()].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    return a.text.localeCompare(b.text, 'tr')
  })
}

function summarize(questions, label) {
  const avgs = questions.map((q) => mean(q.scores.map((s) => s.score)))
  const sum = avgs.reduce((a, b) => a + b, 0)
  const overall = sum / (avgs.length || 1)
  console.log(`\n${'='.repeat(72)}`)
  console.log(label)
  console.log(`Soru sayısı: ${questions.length} | Toplam soru ort.: ${sum.toFixed(6)} | /${questions.length} = ${overall.toFixed(6)} | round2 = ${round2(overall)}`)
  return { questions, avgs, sum, overall }
}

async function main() {
  const sb = await getSupabaseClient()
  const { data: period } = await sb
    .from('evaluation_periods')
    .select('organization_id')
    .eq('id', PERIOD)
    .single()
  if (!period) throw new Error('Dönem bulunamadı')

  const fetched = await fetchEvaluatorAnswerDetailRows(sb, {
    periodId: PERIOD,
    orgId: period.organization_id,
    lang: 'tr',
  })

  const utkuRow = fetched.rows.find((r) => /utku/i.test(String(r.targetName || '')))
  if (!utkuRow) throw new Error('Utku bulunamadı')

  const targetKey = canonicalUserId(utkuRow.targetId) || utkuRow.targetId
  const onlyTarget = fetched.rows.filter(
    (r) => (canonicalUserId(r.targetId) || r.targetId) === targetKey
  )
  const scoring = filterMatrixStructureScoringRows(onlyTarget)
  const system = computeMatrixStructureScoresForTarget(onlyTarget)

  console.log('Hedef:', utkuRow.targetName)
  console.log('Sistem overallPeerAvg:', system?.overallPeerAvg, '| answeredQuestionCount:', system?.answeredQuestionCount)

  // A) Sistem mantığı: genel+oy birleşik, değerlendirici başına tek puan (genel öncelik)
  const merged = buildQuestionMap(scoring, { genelOnly: false, dedupe: true })
  const rMerged = summarize(merged, 'A) SİSTEM — genel+okul yaşam birleşik, dedupe (genel öncelik)')

  for (let i = 0; i < merged.length; i++) {
    const q = merged[i]
    const scores = q.scores.map((s) => s.score)
    const avg = rMerged.avgs[i]
    console.log(`\nSoru ${i + 1} (order ${q.order}) | ${q.scores.length} kişi | ort=${avg.toFixed(6)} | round2=${round2(avg)}`)
    console.log(`  ${q.text.slice(0, 70)}`)
    for (const s of q.scores.sort((a, b) => a.name.localeCompare(b.name, 'tr'))) {
      console.log(`    ${s.name.padEnd(32)} ${s.score}  [${s.ctx}]`)
    }
  }

  // B) Yalnızca genel dilimi, dedupe yok (her satır ayrı — çift sayım riski)
  const genelRaw = buildQuestionMap(scoring, { genelOnly: true, dedupe: false })
  summarize(genelRaw, 'B) Yalnızca GENEL satırları, dedupe YOK')

  // C) Yalnızca genel, değerlendirici başına tek satır
  const genelDeduped = buildQuestionMap(scoring, { genelOnly: true, dedupe: true })
  const rGenel = summarize(genelDeduped, 'C) Yalnızca GENEL, değerlendirici dedupe')

  // D) Birleşik ama dedupe yok (ham satırlar — kullanıcı Excel’de böyle yapmış olabilir mi?)
  const mergedRaw = buildQuestionMap(scoring, { genelOnly: false, dedupe: false })
  summarize(mergedRaw, 'D) Birleşik, dedupe YOK (ham satırlar)')

  // E) round2 her soruda sonra /21
  const round2PerQ = mean(rMerged.avgs.map(round2))
  console.log(`\nE) Her soru ort. round2 sonra /21: ${round2PerQ.toFixed(6)} (round2=${round2(round2PerQ)})`)

  // F) Sistem questions array ile karşılaştır
  console.log('\nF) Sistem computeMatrixStructure questions ile satır satır karşılaştırma:')
  for (const sq of system?.questions || []) {
    const mq = merged.find((q) => q.questionId === sq.questionId)
    const diff = mq ? Math.abs(sq.peerAvg - mean(mq.scores.map((s) => s.score))) : null
    if (diff != null && diff > 0.0001) {
      console.log(`  FARK soru ${sq.questionId.slice(0, 8)} sistem=${sq.peerAvg} manuel=${mean(mq.scores.map((s) => s.score)).toFixed(4)}`)
    }
  }
  console.log('  (fark yoksa sistem ile A aynı)')

  // G) 4.897 hedef — hangi soru ortalamaları farklı?
  const targetSum = 4.897 * 21
  console.log(`\nG) Hedef 4.897 → soru ort. toplamı = ${targetSum.toFixed(6)}`)
  console.log(`   Sistem A toplamı     = ${rMerged.sum.toFixed(6)} (fark ${(rMerged.sum - targetSum).toFixed(6)})`)
  console.log(`   Yalnızca genel C     = ${rGenel.sum.toFixed(6)} (fark ${(rGenel.sum - targetSum).toFixed(6)})`)

  // Soru soru fark: merged vs genel-only
  console.log('\nH) Soru bazında birleşik vs yalnızca-genel farkı (oy-only 5 puanlar etkiler):')
  for (let i = 0; i < merged.length; i++) {
    const m = merged[i]
    const g = genelDeduped.find((x) => x.questionId === m.questionId)
    const avgM = mean(m.scores.map((s) => s.score))
    const avgG = g ? mean(g.scores.map((s) => s.score)) : 0
    if (Math.abs(avgM - avgG) > 0.0001 || m.scores.length !== (g?.scores.length || 0)) {
      const oyOnly = m.scores.filter(
        (s) => s.ctx === 'okul_yasam' && !(g?.scores || []).some((x) => x.evaluatorId === s.evaluatorId)
      )
      console.log(
        `  S${m.order} birleşik=${avgM.toFixed(4)} (${m.scores.length} kişi) genel=${avgG.toFixed(4)} (${g?.scores.length || 0} kişi) Δ=${(avgM - avgG).toFixed(4)}`
      )
      for (const s of oyOnly) {
        console.log(`    + oy-only: ${s.name} = ${s.score}`)
      }
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
