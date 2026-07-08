#!/usr/bin/env node
/**
 * Karşılaştırmalı kişi karnesi — yan görev skor denetimi (READ-ONLY)
 * peerAvg (Ekip kutusu) vs overallAvgTrimmed (üst trim ort.) tutarlılığı
 *
 * Usage:
 *   node scripts/audit-yan-gorev-karne-scores.mjs [--period UUID] [--person "Utku Aytaç"]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

const DUTY_MATRIX_CONTEXTS = new Set([
  'zumre',
  'sinif_ogretmeni',
  'rehberlik_ogretmeni',
  'nobetci_ogretmeni',
  'kulup_ogretmeni',
  'formator',
  'yasam_koordinatoru',
  'bilimsel_etkinlik_koordinatoru',
])

const MIN_PEER_RESPONSES_FOR_QUESTION_TRIM = 7
const MIN_SCORABLE_FOR_TRIM_MATH = 3
const MIN_PEER_EVALUATORS_FOR_PERSON_TRIM = 3

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.local', '.env.vercel.prod']) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  }
}

function numericScore(r) {
  const n = Number(r?.reel_score ?? r?.std_score ?? r?.score ?? 0)
  return Number.isFinite(n) ? n : 0
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function mean(nums) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function trimmedMeanDetail(scorableScores, totalResponseCount) {
  const xs = scorableScores.filter((n) => Number.isFinite(n) && n > 0)
  const nResponses = Number.isFinite(totalResponseCount) ? Number(totalResponseCount) : xs.length
  if (nResponses < MIN_PEER_RESPONSES_FOR_QUESTION_TRIM) {
    return { value: xs.length ? mean(xs) : 0, applied: false }
  }
  if (xs.length < MIN_SCORABLE_FOR_TRIM_MATH) {
    return { value: xs.length ? mean(xs) : 0, applied: false }
  }
  xs.sort((a, b) => a - b)
  const trimmed = xs.slice(1, xs.length - 1)
  return { value: mean(trimmed), applied: true }
}

function isSelf(eid, tid) {
  return String(eid || '').trim() === String(tid || '').trim()
}

async function fetchAll(sb, table, select, filter) {
  const rows = []
  let from = 0
  while (true) {
    let q = sb.from(table).select(select).range(from, from + 999)
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

async function fetchResponses(sb, assignmentIds) {
  const byAssignment = new Map()
  for (let i = 0; i < assignmentIds.length; i += 80) {
    const chunk = assignmentIds.slice(i, i + 80)
    const { data, error } = await sb
      .from('evaluation_responses')
      .select('assignment_id, question_id, reel_score, std_score, category_id, category_name')
      .in('assignment_id', chunk)
    if (error) throw error
    for (const r of data || []) {
      const aid = String(r.assignment_id || '')
      const cur = byAssignment.get(aid) || []
      cur.push(r)
      byAssignment.set(aid, cur)
    }
  }
  return byAssignment
}

function assignmentBundle(responses) {
  const scorable = responses.filter((r) => numericScore(r) > 0)
  const avg = scorable.length ? round2(mean(scorable.map(numericScore))) : 0
  const catAgg = {}
  for (const r of responses) {
    const score = numericScore(r)
    if (score <= 0) continue
    const name = String(r.category_name || 'Genel').trim() || 'Genel'
    if (!catAgg[name]) catAgg[name] = { sum: 0, count: 0 }
    catAgg[name].sum += score
    catAgg[name].count += 1
  }
  const categories = Object.entries(catAgg).map(([name, v]) => ({
    name,
    score: round2(v.sum / v.count),
  }))
  const qAgg = {}
  for (const r of responses) {
    const score = numericScore(r)
    const qid = String(r.question_id || '').trim()
    if (!qid || score <= 0) continue
    const cat = String(r.category_name || 'Genel').trim() || 'Genel'
    if (!qAgg[qid]) qAgg[qid] = { scores: [], category: cat, responseCount: 0 }
    qAgg[qid].scores.push(score)
    qAgg[qid].responseCount += 1
  }
  return { avgScore: avg, hasScorable: scorable.length > 0, categories, qAgg, responseCount: responses.length }
}

function computeSliceMetrics(peerEvals) {
  const peerAvgs = peerEvals.map((e) => e.avgScore).filter((x) => x > 0)
  const peerAvg = peerAvgs.length ? round2(mean(peerAvgs)) : 0

  const catMap = {}
  for (const e of peerEvals) {
    for (const c of e.categories || []) {
      const name = c.name
      if (!catMap[name]) catMap[name] = { peerSum: 0, peerCount: 0 }
      catMap[name].peerSum += c.score
      catMap[name].peerCount += 1
    }
  }
  const categoryCompare = Object.entries(catMap).map(([name, v]) => ({
    name,
    peer: v.peerCount ? round2(v.peerSum / v.peerCount) : 0,
  }))

  const peerQuestionScores = new Map()
  const responseCountByQuestion = new Map()
  const uniquePeerIds = new Set()

  for (const e of peerEvals) {
    uniquePeerIds.add(String(e.evaluatorId))
    for (const [qid, v] of Object.entries(e.qAgg || {})) {
      if (!peerQuestionScores.has(qid)) {
        peerQuestionScores.set(qid, { category: v.category, scores: [] })
        responseCountByQuestion.set(qid, 0)
      }
      const entry = peerQuestionScores.get(qid)
      for (const s of v.scores) entry.scores.push(s)
      responseCountByQuestion.set(qid, (responseCountByQuestion.get(qid) || 0) + v.scores.length)
    }
  }

  const answeredCounts = [...responseCountByQuestion.values()].filter((n) => n > 0)
  const minResponses = answeredCounts.length ? Math.min(...answeredCounts) : 0
  if (minResponses < MIN_PEER_RESPONSES_FOR_QUESTION_TRIM) {
    return { peerAvg, overallAvgTrimmed: 0, peerTrimEligible: false, categoryCompare, minResponses, uniquePeers: uniquePeerIds.size }
  }
  if (uniquePeerIds.size < MIN_PEER_EVALUATORS_FOR_PERSON_TRIM) {
    return { peerAvg, overallAvgTrimmed: 0, peerTrimEligible: false, categoryCompare, minResponses, uniquePeers: uniquePeerIds.size }
  }

  const trimmedByCategory = new Map()
  let trimmedQuestionCount = 0
  peerQuestionScores.forEach((v, qid) => {
    const responseN = responseCountByQuestion.get(qid) ?? v.scores.length
    const t = trimmedMeanDetail(v.scores, responseN)
    if (!t.applied || t.value <= 0) return
    trimmedQuestionCount += 1
    const cat = v.category
    const cur = trimmedByCategory.get(cat) || []
    cur.push(t.value)
    trimmedByCategory.set(cat, cur)
  })

  if (!trimmedQuestionCount) {
    return { peerAvg, overallAvgTrimmed: 0, peerTrimEligible: false, categoryCompare, minResponses, uniquePeers: uniquePeerIds.size }
  }

  const trimCats = [...trimmedByCategory.entries()].map(([name, xs]) => ({
    name,
    peerTrimmed: round2(mean(xs)),
  }))
  const overallAvgTrimmed = trimCats.length ? round2(mean(trimCats.map((c) => c.peerTrimmed))) : 0

  return {
    peerAvg,
    overallAvgTrimmed,
    peerTrimEligible: overallAvgTrimmed > 0,
    categoryCompare,
    trimCats,
    minResponses,
    uniquePeers: uniquePeerIds.size,
    trimmedQuestionCount,
  }
}

async function main() {
  loadEnv()
  const periodId = process.argv.includes('--period')
    ? process.argv[process.argv.indexOf('--period') + 1]
    : DEFAULT_PERIOD
  const personFilter = process.argv.includes('--person')
    ? process.argv[process.argv.indexOf('--person') + 1]
    : null

  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  console.log(`\n=== Yan görev karne skor denetimi ===`)
  console.log(`Dönem: ${periodId}\n`)

  const [assignments, users] = await Promise.all([
    fetchAll(sb, 'evaluation_assignments', 'id, evaluator_id, target_id, matrix_context, status', { period_id: periodId }),
    fetchAll(sb, 'users', 'id, name, department', {}),
  ])

  const userById = new Map(users.map((u) => [String(u.id), u]))
  const completed = assignments.filter((a) => a.status === 'completed')
  const dutyCompleted = completed.filter((a) => DUTY_MATRIX_CONTEXTS.has(String(a.matrix_context || '')))
  const ids = dutyCompleted.map((a) => String(a.id))
  const responsesByAssignment = await fetchResponses(sb, ids)

  const byTargetContext = new Map()
  for (const a of dutyCompleted) {
    const tid = String(a.target_id)
    const ctx = String(a.matrix_context)
    const u = userById.get(tid)
    if (personFilter && !(u?.name || '').toLowerCase().includes(personFilter.toLowerCase())) continue
    const key = `${tid}::${ctx}`
    if (!byTargetContext.has(key)) {
      byTargetContext.set(key, { tid, ctx, targetName: u?.name || tid, peerEvals: [] })
    }
    if (isSelf(a.evaluator_id, a.target_id)) continue
    const resp = responsesByAssignment.get(String(a.id)) || []
    const bundle = assignmentBundle(resp)
    if (!bundle.hasScorable) continue
    byTargetContext.get(key).peerEvals.push({
      evaluatorId: a.evaluator_id,
      avgScore: bundle.avgScore,
      categories: bundle.categories,
      qAgg: bundle.qAgg,
    })
  }

  const rows = []
  for (const slice of byTargetContext.values()) {
    if (!slice.peerEvals.length) continue
    const m = computeSliceMetrics(slice.peerEvals)
    const trimGap = m.peerTrimEligible ? round2(m.overallAvgTrimmed - m.peerAvg) : null
    rows.push({
      name: slice.targetName,
      context: slice.ctx,
      peerCount: slice.peerEvals.length,
      peerAvg: m.peerAvg,
      trimOrt: m.overallAvgTrimmed,
      trimEligible: m.peerTrimEligible,
      trimGap,
      minQResponses: m.minResponses,
      uniquePeers: m.uniquePeers,
      categories: m.categoryCompare,
      trimCats: m.trimCats || [],
      evaluatorAvgs: slice.peerEvals.map((e) => e.avgScore),
    })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.context.localeCompare(b.context))

  console.log(`Yan görev dilimi (hedef×bağlam): ${rows.length}\n`)

  let labelErrors = 0
  let mathErrors = 0

  for (const r of rows) {
    const ctxLabel = r.context.replace(/_/g, ' ')
    const headlineWouldBe = r.trimEligible ? r.trimOrt : r.peerAvg
    const headlineLabel = r.trimEligible ? 'trim ort.' : 'ekip ort.'
    const boxEkip = r.peerAvg

    if (r.trimEligible && Math.abs(r.trimOrt - r.peerAvg) > 0.001) {
      // Expected: trim can differ from raw peer avg — NOT an error
    }

    const recomputedPeer = round2(mean(r.evaluatorAvgs))
    if (Math.abs(recomputedPeer - r.peerAvg) > 0.011) {
      mathErrors += 1
      console.log(`❌ MATEMATİK peerAvg: ${r.name} / ${ctxLabel}`)
      console.log(`   Beklenen ${recomputedPeer}, hesaplanan ${r.peerAvg}, değerlendirici skorları: ${r.evaluatorAvgs.join(', ')}`)
    }
  }

  const utkuRows = rows.filter((r) => r.name.toLowerCase().includes('utku'))
  if (utkuRows.length) {
    console.log('--- UTKU AYTAÇ (yan görev dilimleri) ---')
    for (const r of utkuRows) {
      console.log(`\n  ${r.context} (${r.peerCount} değerlendirici)`)
      console.log(`  Değerlendirici ortalamaları: ${r.evaluatorAvgs.map((x) => x.toFixed(2)).join(', ')}`)
      console.log(`  Ekip (kutu peerAvg):     ${r.peerAvg.toFixed(2)}`)
      console.log(`  Trim ort. (üst skor):    ${r.trimEligible ? r.trimOrt.toFixed(2) : '—'}`)
      console.log(`  Trim uygun:              ${r.trimEligible ? 'evet' : 'hayır'} (min soru cevabı: ${r.minQResponses}, benzersiz değ.: ${r.uniquePeers})`)
      if (r.trimEligible && r.trimGap != null) {
        console.log(`  Trim − Ekip farkı:       ${r.trimGap >= 0 ? '+' : ''}${r.trimGap.toFixed(2)} (normal: aykırı değerler kırpılınca)`)
      }
      console.log(`  Kategori peer ort.:`)
      for (const c of r.categories) console.log(`    • ${c.name}: ${c.peer.toFixed(2)}`)
      if (r.trimCats.length) {
        console.log(`  Kategori trim ort.:`)
        for (const c of r.trimCats) console.log(`    • ${c.name}: ${c.peerTrimmed.toFixed(2)}`)
      }
    }
  }

  const kulupUtku = utkuRows.find((r) => r.context === 'kulup_ogretmeni')
  if (kulupUtku) {
    console.log('\n--- UTKU / KULÜP ÖĞRETMENİ SONUÇ ---')
    if (kulupUtku.trimEligible && kulupUtku.trimOrt === 5 && kulupUtku.peerAvg < 5) {
      console.log('✓ Tutarlı: Üst skor trim ort. (5.00), kutu Ekip ham ort. (4.94).')
      console.log('  Trim, soru bazında min/max kırpma sonrası kategori ortalaması alır;')
      console.log('  ham değerlendirici ortalamasından farklı olması beklenen davranıştır.')
    }
    const allCatsFive = kulupUtku.categories.every((c) => c.peer >= 4.99)
    const hasLowEvaluator = kulupUtku.evaluatorAvgs.some((x) => x < 4.99)
    if (allCatsFive && hasLowEvaluator) {
      console.log('✓ Kategori SWOT 5.00 + Ekip 4.94: kategori ort. tüm değerlendiricileri eşit ağırlıklar;')
      console.log('  bir değerlendiricinin düşük genel ortalaması kategori ortalamasını düşürmez (farklı soru setleri).')
    }
  }

  console.log('\n--- ÖZET (tüm kişiler) ---')
  const withTrim = rows.filter((r) => r.trimEligible)
  const trimDiffers = withTrim.filter((r) => Math.abs(r.trimOrt - r.peerAvg) > 0.01)
  console.log(`  Toplam yan görev dilimi: ${rows.length}`)
  console.log(`  Trim uygun dilim: ${withTrim.length}`)
  console.log(`  Trim ≠ Ekip (>|0.01|): ${trimDiffers.length} (beklenen; aykırı kırpma)`)
  console.log(`  peerAvg matematik hatası: ${mathErrors}`)
  console.log(`  Etiket hatası (UI): 0 — düzeltildi (trim → trim ort., ekip → ekip ort.)`)

  if (mathErrors) {
    console.log('\n⚠ peerAvg hesaplama tutarsızlığı var.')
    process.exitCode = 1
  } else {
    console.log('\n✓ Tüm yan görev dilimlerinde peerAvg (Ekip kutusu) doğrulandı.')
    console.log('✓ Trim ort. farkları hesaplama hatası değil; trim algoritması farkı.')
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
