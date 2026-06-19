#!/usr/bin/env node
/** Genel & Okul Yaşam birleşik skor — Utku ve tüm kişiler için hesap doğrulama */
import { getSupabaseClient } from './_load-env.mjs'

const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

function numericScore(r) {
  const n = Number(r?.reel_score ?? r?.std_score ?? r?.score ?? 0)
  return Number.isFinite(n) ? n : 0
}

function assignmentAvg(responses) {
  const scorable = (responses || []).filter((r) => numericScore(r) > 0)
  if (!scorable.length) return { avg: 0, scorable: false }
  const sum = scorable.reduce((s, r) => s + numericScore(r), 0)
  return { avg: sum / scorable.length, scorable: true }
}

function round2(v) {
  return Math.round(v * 100) / 100
}

function average2(...scores) {
  const valid = scores.filter((s) => Number.isFinite(s) && s > 0)
  if (!valid.length) return 0
  return round2(valid.reduce((a, b) => a + b, 0) / valid.length)
}

function averageExact(...scores) {
  const valid = scores.filter((s) => Number.isFinite(s) && s > 0)
  if (!valid.length) return 0
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

async function main() {
  const sb = await getSupabaseClient()

  const { data: coeffs } = await sb
    .from('evaluation_period_coefficients')
    .select('evaluator_level, weight')
    .eq('period_id', PERIOD)
  const weightByLevel = Object.fromEntries((coeffs || []).map((c) => [c.evaluator_level, Number(c.weight ?? 1)]))
  const weightFor = (isSelf, level) => Number(weightByLevel[isSelf ? 'self' : level || 'peer'] ?? 1)

  const { data: users } = await sb.from('users').select('id, name').order('name')
  const nameById = new Map((users || []).map((u) => [u.id, u.name]))

  let from = 0
  const assignments = []
  while (true) {
    const { data, error } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, target_id, matrix_context, status, evaluator:evaluator_id(name, position_level)')
      .eq('period_id', PERIOD)
      .eq('status', 'completed')
      .in('matrix_context', ['genel', 'okul_yasam'])
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    assignments.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  const respByAsg = new Map()
  for (let i = 0; i < assignments.length; i += 50) {
    const ids = assignments.slice(i, i + 50).map((a) => a.id)
    const { data: resp } = await sb
      .from('evaluation_responses')
      .select('assignment_id, reel_score, std_score, score')
      .in('assignment_id', ids)
    for (const r of resp || []) {
      const list = respByAsg.get(r.assignment_id) || []
      list.push(r)
      respByAsg.set(r.assignment_id, list)
    }
  }

  const byTarget = new Map()
  for (const a of assignments) {
    const tid = a.target_id
    const ctx = a.matrix_context || 'genel'
    const isSelf = a.evaluator_id === tid
    const { avg, scorable } = assignmentAvg(respByAsg.get(a.id))
    if (!scorable) continue
    if (!byTarget.has(tid)) byTarget.set(tid, { genel: [], oy: [] })
    const bucket = ctx === 'okul_yasam' ? 'oy' : 'genel'
    if (bucket === 'oy' && isSelf) continue
    byTarget.get(tid)[bucket].push({
      avg,
      isSelf,
      level: isSelf ? 'self' : a.evaluator?.position_level || 'peer',
      name: a.evaluator?.name,
    })
  }

  const mismatches = []
  let utkuLine = null

  for (const [tid, buckets] of byTarget.entries()) {
    const genelScorable = buckets.genel.filter((e) => e.avg > 0)
    if (!genelScorable.length) continue

    const wSum = genelScorable.reduce((s, e) => s + weightFor(e.isSelf, e.level), 0)
    const genelExact =
      wSum > 0
        ? genelScorable.reduce((s, e) => s + e.avg * weightFor(e.isSelf, e.level), 0) / wSum
        : 0
    const genelRounded = round2(genelExact)

    const oyPeers = buckets.oy.filter((e) => !e.isSelf && e.avg > 0)
    const oyExact = oyPeers.length ? oyPeers.reduce((s, e) => s + e.avg, 0) / oyPeers.length : 0
    const oyRounded = oyPeers.length ? round2(oyExact) : 0

    if (oyExact <= 0) continue

    const combinedExact = averageExact(genelExact, oyExact)
    const combinedFromRounded = average2(genelRounded, oyRounded)
    const combinedCorrect = round2(combinedExact)
    const delta = Math.abs(combinedFromRounded - combinedCorrect)

    const row = {
      name: nameById.get(tid) || tid,
      genelExact,
      genelRounded,
      oyExact,
      oyRounded,
      combinedExact,
      combinedCorrect,
      combinedFromRounded,
      delta,
    }

    if (row.name.includes('Utku')) utkuLine = row
    if (delta >= 0.005) mismatches.push(row)
  }

  mismatches.sort((a, b) => b.delta - a.delta)

  console.log('=== Utku AYTAÇ ===')
  if (utkuLine) {
    console.log(JSON.stringify(utkuLine, null, 2))
    console.log(
      `Manuel (gösterilen genel + oy)/2: (${utkuLine.genelRounded} + ${utkuLine.oyRounded}) / 2 = ${round2((utkuLine.genelRounded + utkuLine.oyRounded) / 2)}`
    )
    console.log(
      `Doğru (tam hassasiyet sonra yuvarla): (${utkuLine.genelExact.toFixed(6)} + ${utkuLine.oyExact.toFixed(6)}) / 2 = ${utkuLine.combinedExact.toFixed(6)} → ${utkuLine.combinedCorrect}`
    )
    console.log(`Mevcut kod (önce yuvarla sonra ortala): ${utkuLine.combinedFromRounded}`)
  } else {
    console.log('Utku bulunamadı veya okul yaşam yok')
  }

  console.log(`\n=== Yuvarlama farkı ≥0.005 olan kişiler: ${mismatches.length} ===`)
  for (const m of mismatches.slice(0, 15)) {
    console.log(
      `${m.name}: genel=${m.genelExact.toFixed(4)}/${m.genelRounded} oy=${m.oyExact.toFixed(4)}/${m.oyRounded} birleşik=${m.combinedCorrect} kod=${m.combinedFromRounded} Δ=${m.delta.toFixed(3)}`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
