#!/usr/bin/env node
/**
 * Genel 360 trim teşhisi — benzersiz değerlendirici / soru, atama yinelenmesi, matris.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const TARGET_NAME = process.env.TARGET_NAME || 'Ilgın'

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.paul-fr.tmp', '.env.local', '.env.vercel.prod']) {
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
loadEnv()

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli')
  process.exit(1)
}
const sb = createClient(url, key)

function score(r) {
  const n = Number(r?.reel_score ?? r?.std_score ?? 0)
  return Number.isFinite(n) ? n : 0
}

async function main() {
  const { data: users } = await sb.from('users').select('id,name').ilike('name', `%${TARGET_NAME}%`)
  const target = (users || []).find((u) => String(u.name || '').includes(TARGET_NAME)) || users?.[0]
  if (!target) {
    console.error('Hedef yok')
    process.exit(1)
  }
  console.log('\n=== HEDEF ===', target.name, target.id)

  const { data: assignments, error: aErr } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, target_id, status, matrix_context, completed_at, slug')
    .eq('period_id', PERIOD)
    .eq('target_id', target.id)
    .eq('status', 'completed')
  if (aErr) throw aErr

  const all = assignments || []
  const genelPeer = all.filter((a) => {
    const ctx = String(a.matrix_context ?? 'genel').trim() || 'genel'
    return ctx === 'genel' && String(a.evaluator_id) !== String(a.target_id)
  })

  console.log('\n=== GENEL TAMAMLANMIŞ (öz hariç) ===')
  console.log('Atama satırı:', genelPeer.length)
  const byEvaluator = new Map()
  for (const a of genelPeer) {
    const eid = String(a.evaluator_id)
    const cur = byEvaluator.get(eid) || []
    cur.push(a)
    byEvaluator.set(eid, cur)
  }
  console.log('Benzersiz değerlendirici:', byEvaluator.size)
  for (const [eid, rows] of byEvaluator) {
    const { data: u } = await sb.from('users').select('name').eq('id', eid).maybeSingle()
    console.log(
      ' -',
      u?.name || eid,
      `| atama:${rows.length}`,
      rows.map((r) => r.id.slice(0, 8)).join(',')
    )
  }

  const aids = genelPeer.map((a) => a.id)
  const responses = []
  for (let i = 0; i < aids.length; i += 80) {
    const { data, error } = await sb
      .from('evaluation_responses')
      .select('assignment_id, question_id, reel_score, std_score, question_scope')
      .in('assignment_id', aids.slice(i, i + 80))
    if (error) throw error
    responses.push(...(data || []))
  }
  console.log('\n=== YANITLAR (genel atamalar) ===')
  console.log('Toplam satır:', responses.length)

  const evalByAid = new Map(genelPeer.map((a) => [a.id, a.evaluator_id]))
  const byQuestionUnique = new Map()
  const byQuestionIfDedupeEvaluator = new Map()
  const byQuestionScorableOnly = new Map()

  for (const r of responses) {
    const qid = String(r.question_id || '').trim()
    if (!qid) continue
    const eid = String(evalByAid.get(r.assignment_id) || '')
    if (!byQuestionUnique.has(qid)) byQuestionUnique.set(qid, new Set())
    byQuestionUnique.get(qid).add(`${r.assignment_id}::${eid}`)

    if (!byQuestionIfDedupeEvaluator.has(qid)) byQuestionIfDedupeEvaluator.set(qid, new Set())
    byQuestionIfDedupeEvaluator.get(qid).add(eid)

    if (score(r) > 0) {
      if (!byQuestionScorableOnly.has(qid)) byQuestionScorableOnly.set(qid, new Set())
      byQuestionScorableOnly.get(qid).add(eid)
    }
  }

  const countsRaw = [...byQuestionUnique.values()].map((s) => s.size)
  const countsDedupe = [...byQuestionIfDedupeEvaluator.values()].map((s) => s.size)
  const countsScorable = [...byQuestionScorableOnly.values()].map((s) => s.size)

  console.log('\n=== SORU BAŞINA CEVAP (fikrim yok dahil) ===')
  console.log('Yanıtlı soru:', byQuestionIfDedupeEvaluator.size)
  console.log('Benzersiz değerlendirici/soru — min:', Math.min(...countsDedupe), 'max:', Math.max(...countsDedupe))
  console.log('Atama satırı/soru (yinelenme varsa şişer) — min:', Math.min(...countsRaw), 'max:', Math.max(...countsRaw))

  const dist = {}
  for (const n of countsDedupe) dist[n] = (dist[n] || 0) + 1
  console.log('Dağılım (benzersiz değerlendirici/soru):', dist)

  if (countsScorable.length) {
    const sd = {}
    for (const n of countsScorable) sd[n] = (sd[n] || 0) + 1
    console.log('\n=== SADECE PUANLI (fikrim yok hariç) soru başına ===')
    console.log('min/max:', Math.min(...countsScorable), Math.max(...countsScorable), 'Dağılım:', sd)
  }

  const sampleQ = [...byQuestionIfDedupeEvaluator.entries()][0]
  if (sampleQ) {
    const [qid, evals] = sampleQ
    console.log('\nÖrnek soru', qid.slice(0, 8), '— benzersiz değerlendirici:', evals.size)
  }

  const scorableEvals = new Set()
  for (const r of responses) {
    if (score(r) > 0) scorableEvals.add(String(evalByAid.get(r.assignment_id) || ''))
  }
  console.log('\n=== PUAN VEREN (genel atama) ===', scorableEvals.size)

  const periodOnly = new Map()
  for (const r of responses) {
    if (String(r.question_scope || '') === 'duty') continue
    const qid = String(r.question_id || '').trim()
    const eid = String(evalByAid.get(r.assignment_id) || '')
    if (!qid || !eid) continue
    if (!periodOnly.has(qid)) periodOnly.set(qid, new Set())
    periodOnly.get(qid).add(eid)
  }
  const periodCounts = [...periodOnly.values()].map((s) => s.size)
  if (periodCounts.length) {
    console.log('\n=== PERIOD SCOPE (duty hariç) soru başına ===')
    console.log('min/max:', Math.min(...periodCounts), Math.max(...periodCounts))
    const pd = {}
    for (const n of periodCounts) pd[n] = (pd[n] || 0) + 1
    console.log('Dağılım:', pd)
  }

  console.log('\n=== TRIM BEKLENTİSİ ===')
  const minD = countsDedupe.length ? Math.min(...countsDedupe) : 0
  console.log('min≥7 (tüm sorular):', minD >= 7 && byEvaluator.size >= 3 ? 'EVET' : 'HAYIR')
  console.log('min≥7 (kısmi soru):', countsDedupe.filter((n) => n >= 7).length, 'soru')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
