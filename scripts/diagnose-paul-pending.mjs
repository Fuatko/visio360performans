#!/usr/bin/env node
/** Paul GEORGES operasyonel özet — terminal çıktısı */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const PAUL = '6350a539-e0aa-49b7-8895-9ee572124bfe'
const ENDER = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.paul-fr.tmp', '.env.local']) {
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

const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli (.env.visio360.tmp)')
  process.exit(1)
}

const sb = createClient(url, key)

async function fetchAssignments(evaluatorId) {
  const page = 1000
  let from = 0
  const out = []
  while (true) {
    const { data, error } = await sb
      .from('evaluation_assignments')
      .select('id, target_id, matrix_context, status, slug')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', evaluatorId)
      .range(from, from + page - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < page) break
    from += page
  }
  return out
}

async function responseStats(assignmentIds) {
  const stats = new Map()
  const chunk = 80
  for (let i = 0; i < assignmentIds.length; i += chunk) {
    const ids = assignmentIds.slice(i, i + chunk)
    const { data, error } = await sb
      .from('evaluation_responses')
      .select('assignment_id, question_id')
      .in('assignment_id', ids)
    if (error) throw error
    for (const r of data || []) {
      const aid = r.assignment_id
      if (!stats.has(aid)) stats.set(aid, new Set())
      stats.get(aid).add(r.question_id)
    }
  }
  return stats
}

function groupByContext(rows, statusFilter) {
  const m = new Map()
  for (const r of rows) {
    if (statusFilter === 'pending' && r.status === 'completed') continue
    if (statusFilter === 'completed' && r.status !== 'completed') continue
    const ctx = r.matrix_context || 'genel'
    m.set(ctx, (m.get(ctx) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

async function main() {
  const [paulRows, enderRows, usersRes] = await Promise.all([
    fetchAssignments(PAUL),
    fetchAssignments(ENDER),
    sb.from('users').select('id, name'),
  ])
  if (usersRes.error) throw usersRes.error
  const nameBy = new Map((usersRes.data || []).map((u) => [u.id, u.name]))

  const paulPending = paulRows.filter((r) => r.status !== 'completed')
  const pendingIds = paulPending.map((r) => r.id)
  const respMap = await responseStats(pendingIds)

  console.log('\n=== Paul GEORGES — özet ===')
  console.log({
    toplam: paulRows.length,
    bekleyen: paulPending.length,
    tamamlanan: paulRows.length - paulPending.length,
  })

  console.log('\n--- Bekleyen (matrix_context) ---')
  for (const [ctx, n] of groupByContext(paulRows, 'pending')) {
    console.log(`  ${ctx}: ${n}`)
  }

  console.log('\n--- Tamamlanan (matrix_context) ---')
  for (const [ctx, n] of groupByContext(paulRows, 'completed')) {
    console.log(`  ${ctx}: ${n}`)
  }

  const partial = paulPending
    .map((a) => ({
      ...a,
      answered: respMap.get(a.id)?.size || 0,
    }))
    .filter((a) => a.answered > 0)
    .sort((a, b) => b.answered - a.answered)

  const partialByCtx = new Map()
  for (const a of partial) {
    const ctx = a.matrix_context || 'genel'
    partialByCtx.set(ctx, (partialByCtx.get(ctx) || 0) + 1)
  }
  console.log('\n--- Yarım kalan (pending + ≥1 cevap) ---')
  console.log(`  toplam: ${partial.length}`)
  for (const [ctx, n] of [...partialByCtx.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ctx}: ${n}`)
  }

  if (partial.length) {
    console.log('\n--- Yarım kalan detay (ilk 25) ---')
    for (const a of partial.slice(0, 25)) {
      console.log(
        `  [${a.matrix_context || 'genel'}] ${nameBy.get(a.target_id) || a.target_id} — ${a.answered} soru — ${a.id}`
      )
    }
    if (partial.length > 25) console.log(`  ... +${partial.length - 25} daha`)
  }

  const paulGenelPending = paulPending.filter((r) => (r.matrix_context || 'genel') === 'genel')
  const paulGenelTargets = new Set(
    paulRows.filter((r) => (r.matrix_context || 'genel') === 'genel').map((r) => r.target_id)
  )
  const enderGenelTargets = new Set(
    enderRows.filter((r) => (r.matrix_context || 'genel') === 'genel').map((r) => r.target_id)
  )

  console.log('\n--- Genel hedef sayısı ---')
  console.log({ paul: paulGenelTargets.size, ender: enderGenelTargets.size, paul_bekleyen_genel: paulGenelPending.length })

  const genelStarted = paulGenelPending.filter((a) => (respMap.get(a.id)?.size || 0) > 0)
  console.log(`  genel başlamış (bekleyen): ${genelStarted.length}`)

  console.log('\n--- Bekleyen GENEL — başlamış olanlar ---')
  for (const a of genelStarted.sort((x, y) => (respMap.get(y.id)?.size || 0) - (respMap.get(x.id)?.size || 0))) {
    console.log(`  ${nameBy.get(a.target_id)} — ${respMap.get(a.id)?.size} soru`)
  }

  console.log('\n--- Bekleyen GENEL — henüz başlamamış (ilk 40 isim) ---')
  const genelNotStarted = paulGenelPending
    .filter((a) => !(respMap.get(a.id)?.size))
    .map((a) => nameBy.get(a.target_id) || a.target_id)
    .sort((a, b) => String(a).localeCompare(String(b), 'tr'))
  for (const n of genelNotStarted.slice(0, 40)) console.log(`  ${n}`)
  if (genelNotStarted.length > 40) console.log(`  ... +${genelNotStarted.length - 40} kişi`)

  console.log('\n--- Genel parity farkı ---')
  const missingInPaul = [...enderGenelTargets].filter((id) => !paulGenelTargets.has(id))
  const extraInPaul = [...paulGenelTargets].filter((id) => !enderGenelTargets.has(id))
  if (!missingInPaul.length && !extraInPaul.length) console.log('  OK — hedef seti aynı')
  else {
    for (const id of missingInPaul) console.log(`  Paul eksik: ${nameBy.get(id)}`)
    for (const id of extraInPaul) console.log(`  Paul fazla: ${nameBy.get(id)}`)
  }

  console.log('\nSQL (Supabase): sql/diagnose-paul-pending-operasyon.sql')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
