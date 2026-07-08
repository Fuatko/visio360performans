#!/usr/bin/env node
/**
 * Yan görev raporları — genel / okul yaşam skor karışımı denetimi (READ-ONLY)
 * Usage: node scripts/verify-yan-gorev-report-isolation.mjs [--period UUID]
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

const MATRIX_LABELS = {
  zumre: 'Zümre Başkanı',
  sinif_ogretmeni: 'Sınıf Öğretmeni',
  rehberlik_ogretmeni: 'Rehberlik Öğretmeni',
  nobetci_ogretmeni: 'Nöbetçi Öğretmen',
  kulup_ogretmeni: 'Kulüp Öğretmeni',
  formator: 'Formatör',
  yasam_koordinatoru: 'Okul İçi Yaşam Koordinatörü',
  bilimsel_etkinlik_koordinatoru: 'Bilimsel Etkinlik Koordinatörü',
  genel: 'Genel değerlendirme',
  okul_yasam: 'Okul Yaşam',
}

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
  const n = Number(r?.reel_score ?? r?.std_score ?? 0)
  return Number.isFinite(n) ? n : 0
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function avgScores(rows) {
  const scorable = rows.filter((r) => numericScore(r) > 0)
  if (!scorable.length) return null
  return round2(scorable.reduce((s, r) => s + numericScore(r), 0) / scorable.length)
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

async function fetchResponsesByAssignmentIds(sb, assignmentIds) {
  const byAssignment = new Map()
  for (let i = 0; i < assignmentIds.length; i += 80) {
    const chunk = assignmentIds.slice(i, i + 80)
    const { data, error } = await sb
      .from('evaluation_responses')
      .select('assignment_id, question_id, reel_score, std_score, question_scope')
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

function isSelf(evaluatorId, targetId) {
  return String(evaluatorId || '').trim() === String(targetId || '').trim()
}

function peerAvgsForAssignments(assignments, responsesByAssignment) {
  const byTarget = new Map()
  for (const a of assignments) {
    if (isSelf(a.evaluator_id, a.target_id)) continue
    const resp = responsesByAssignment.get(String(a.id)) || []
    const avg = avgScores(resp)
    if (avg == null) continue
    const tid = String(a.target_id)
    const cur = byTarget.get(tid) || []
    cur.push(avg)
    byTarget.set(tid, cur)
  }
  const out = new Map()
  for (const [tid, avgs] of byTarget) {
    out.set(tid, round2(avgs.reduce((s, x) => s + x, 0) / avgs.length))
  }
  return out
}

async function main() {
  loadEnv()
  const periodId = process.argv.includes('--period')
    ? process.argv[process.argv.indexOf('--period') + 1]
    : DEFAULT_PERIOD

  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  console.log(`\n=== Yan görev rapor izolasyon denetimi ===`)
  console.log(`Dönem: ${periodId}\n`)

  const [assignments, users, snapQs, dutyCatLinks] = await Promise.all([
    fetchAll(sb, 'evaluation_assignments', 'id, evaluator_id, target_id, matrix_context, status', {
      period_id: periodId,
    }),
    fetchAll(sb, 'users', 'id, name, department', {}),
    fetchAll(sb, 'evaluation_period_questions_snapshot', 'id, category_id', { period_id: periodId }),
    fetchAll(sb, 'evaluation_period_duty_categories', 'category_id, duty_id', { period_id: periodId }),
  ])

  const userById = new Map(users.map((u) => [String(u.id), u]))
  const dutyCatIds = new Set(dutyCatLinks.map((r) => String(r.category_id || '')))

  const genelCoreQuestionIds = new Set()
  for (const q of snapQs) {
    const cid = String(q.category_id || '')
    if (!dutyCatIds.has(cid)) genelCoreQuestionIds.add(String(q.id))
  }

  const completed = assignments.filter((a) => a.status === 'completed')
  const dutyAssignments = completed.filter((a) => DUTY_MATRIX_CONTEXTS.has(String(a.matrix_context || '')))
  const genelAssignments = completed.filter((a) => a.matrix_context === 'genel')
  const oyAssignments = completed.filter((a) => a.matrix_context === 'okul_yasam')

  const allIds = completed.map((a) => String(a.id))
  console.log('Cevaplar yükleniyor…')
  const responsesByAssignment = await fetchResponsesByAssignmentIds(sb, allIds)

  const okulYasamQuestionIds = new Set()
  for (const a of oyAssignments) {
    for (const r of responsesByAssignment.get(String(a.id)) || []) {
      const qid = String(r.question_id || '')
      if (qid) okulYasamQuestionIds.add(qid)
    }
  }

  console.log(`Tamamlanan atama sayıları:`)
  console.log(`  Genel: ${genelAssignments.length}`)
  console.log(`  Okul Yaşam: ${oyAssignments.length}`)
  console.log(`  Yan görev matris: ${dutyAssignments.length}`)
  console.log(`  Genel çekirdek soru (görev kategorisi dışı): ${genelCoreQuestionIds.size}`)
  console.log(`  Okul Yaşam benzersiz soru: ${okulYasamQuestionIds.size}\n`)

  const genelLeakRows = []
  const oyLeakRows = []
  let dutyResponseTotal = 0
  let dutyScorableTotal = 0

  for (const a of dutyAssignments) {
    const resp = responsesByAssignment.get(String(a.id)) || []
    for (const r of resp) {
      dutyResponseTotal++
      if (numericScore(r) <= 0) continue
      dutyScorableTotal++
      const qid = String(r.question_id || '')
      if (genelCoreQuestionIds.has(qid)) {
        genelLeakRows.push({
          matrixContext: a.matrix_context,
          target: userById.get(String(a.target_id))?.name || a.target_id,
          questionId: qid,
        })
      }
      if (okulYasamQuestionIds.has(qid)) {
        oyLeakRows.push({
          matrixContext: a.matrix_context,
          target: userById.get(String(a.target_id))?.name || a.target_id,
          questionId: qid,
        })
      }
    }
  }

  console.log('--- TEST 1: Soru karışımı (yan görev atamaları) ---')
  console.log(`  Toplam yan görev cevabı: ${dutyResponseTotal} (puanlanabilir: ${dutyScorableTotal})`)
  console.log(`  Genel çekirdek soru sızıntısı: ${genelLeakRows.length}`)
  console.log(`  Okul Yaşam soru sızıntısı: ${oyLeakRows.length}`)
  if (genelLeakRows.length) {
    console.log('  ⚠ Örnek genel sızıntılar (ilk 5):')
    genelLeakRows.slice(0, 5).forEach((x) =>
      console.log(`    ${x.target} / ${MATRIX_LABELS[x.matrixContext] || x.matrixContext}`)
    )
  } else {
    console.log('  ✓ Yan görev atamalarında genel çekirdek soru yok')
  }
  if (!oyLeakRows.length) console.log('  ✓ Yan görev atamalarında Okul Yaşam sorusu yok')

  const genelOverallByTarget = peerAvgsForAssignments(genelAssignments, responsesByAssignment)
  const oyOverallByTarget = peerAvgsForAssignments(oyAssignments, responsesByAssignment)

  const dutySlicePeerAvg = new Map()
  for (const a of dutyAssignments) {
    if (isSelf(a.evaluator_id, a.target_id)) continue
    const tid = String(a.target_id)
    const ctx = String(a.matrix_context)
    const key = `${tid}::${ctx}`
    const resp = responsesByAssignment.get(String(a.id)) || []
    const avg = avgScores(resp)
    if (avg == null) continue
    const cur = dutySlicePeerAvg.get(key) || []
    cur.push(avg)
    dutySlicePeerAvg.set(key, cur)
  }

  const suspiciousSameAsGenel = []
  const suspiciousSameAsOy = []
  const sliceSummaries = []

  for (const [key, avgs] of dutySlicePeerAvg) {
    const [tid, ctx] = key.split('::')
    const dutyPeer = round2(avgs.reduce((s, x) => s + x, 0) / avgs.length)
    const genel = genelOverallByTarget.get(tid)
    const oy = oyOverallByTarget.get(tid)
    const u = userById.get(tid)
    sliceSummaries.push({
      name: u?.name || tid,
      dept: u?.department || '',
      context: ctx,
      label: MATRIX_LABELS[ctx] || ctx,
      dutyPeer,
      genel: genel ?? null,
      okulYasam: oy ?? null,
      peerCount: avgs.length,
    })
    if (genel != null && Math.abs(dutyPeer - genel) < 0.001) {
      suspiciousSameAsGenel.push({ name: u?.name, ctx, dutyPeer, genel })
    }
    if (oy != null && Math.abs(dutyPeer - oy) < 0.001) {
      suspiciousSameAsOy.push({ name: u?.name, ctx, dutyPeer, oy })
    }
  }

  console.log('\n--- TEST 2: Skor kaynağı (yan görev ekip ort. vs genel / OY) ---')
  console.log(`  Yan görev dilimi (hedef×bağlam): ${sliceSummaries.length}`)
  console.log(`  Genel ile birebir aynı (±0.001): ${suspiciousSameAsGenel.length}`)
  console.log(`  Okul Yaşam ile birebir aynı (±0.001): ${suspiciousSameAsOy.length}`)
  if (suspiciousSameAsGenel.length) {
    console.log('  Not: Aynı rakam tesadüf olabilir; asıl kanıt TEST 1 soru kümesi ayrımıdır.')
    suspiciousSameAsGenel.slice(0, 6).forEach((x) =>
      console.log(`    ${x.name} — ${MATRIX_LABELS[x.ctx]}: yan=${x.dutyPeer} genel=${x.genel}`)
    )
  }

  const byContext = new Map()
  for (const s of sliceSummaries) {
    if (!byContext.has(s.context)) byContext.set(s.context, [])
    byContext.get(s.context).push(s)
  }

  console.log('\n--- TEST 3: Yan görev rapor dilimleri (UI ile aynı mantık) ---')
  const sortedContexts = [...byContext.keys()].sort((a, b) =>
    (MATRIX_LABELS[a] || a).localeCompare(MATRIX_LABELS[b] || b, 'tr')
  )
  if (!sortedContexts.length) {
    console.log('  (Puanlanabilir yan görev dilimi yok — raporlar boş görünür)')
  }
  for (const ctx of sortedContexts) {
    const rows = byContext.get(ctx).sort((a, b) => b.dutyPeer - a.dutyPeer)
    const label = MATRIX_LABELS[ctx] || ctx
    console.log(`\n  YAN GÖREV — ${label.toUpperCase()} (${rows.length} kişi)`)
    console.log('  #  Kişi                          YanGörev  Genel   OkulYş  Değ.')
    rows.slice(0, 10).forEach((r, i) => {
      const g = r.genel != null ? r.genel.toFixed(2) : '  —  '
      const o = r.okulYasam != null ? r.okulYasam.toFixed(2) : '  —  '
      console.log(
        `  ${String(i + 1).padStart(2)}  ${r.name.slice(0, 28).padEnd(28)}  ${r.dutyPeer.toFixed(2).padStart(6)}  ${String(g).padStart(5)}  ${String(o).padStart(5)}    ${r.peerCount}`
      )
    })
    if (rows.length > 10) console.log(`  … +${rows.length - 10} kişi daha`)
  }

  console.log('\n--- SONUÇ ---')
  if (genelLeakRows.length || oyLeakRows.length) {
    console.log('⚠ Yan görev formlarında genel veya Okul Yaşam sorusu tespit edildi.')
    process.exitCode = 1
  } else if (sliceSummaries.length > 0) {
    console.log('✓ Soru setleri ayrı: yan görev cevapları genel/Okul Yaşam sorularını içermiyor.')
    console.log('✓ Yan görev rapor skorları yalnızca ilgili matris atamalarından hesaplanıyor.')
    console.log('  Tabloda yalnızca «YanGörev» sütunu gösterilir; Genel/OkulYş karşılaştırma içindir.')
  } else {
    console.log('✓ Soru karışımı temiz; puanlanabilir yan görev verisi bulunamadı.')
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
