#!/usr/bin/env node
/** Hedef kişi başına değerlendiren sayısı — atama durumu ve matris dilimi kırılımı */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const ORG = process.env.ORG_ID || 'e03a6045-5a9c-4015-9763-2b869657eb42'
const SAMPLE = Number(process.env.SAMPLE || 8)

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

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli')
  process.exit(1)
}
const sb = createClient(url, key)

function normCtx(v) {
  const x = String(v || 'genel').trim() || 'genel'
  return x === 'genel' ? 'genel' : x
}

async function fetchAllAssignments() {
  const out = []
  let from = 0
  const page = 1000
  while (true) {
    const { data, error } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, target_id, status, matrix_context, completed_at')
      .eq('period_id', PERIOD)
      .range(from, from + page - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < page) break
    from += page
  }
  return out
}

async function fetchUsers(ids) {
  const map = new Map()
  const chunk = 200
  for (let i = 0; i < ids.length; i += chunk) {
    const { data, error } = await sb.from('users').select('id,name,organization_id').in('id', ids.slice(i, i + chunk))
    if (error) throw error
    for (const u of data || []) map.set(u.id, u)
  }
  return map
}

async function scorableByAssignment(ids) {
  const has = new Set()
  const chunk = 80
  for (let i = 0; i < ids.length; i += chunk) {
    const { data, error } = await sb
      .from('evaluation_responses')
      .select('assignment_id, reel_score, std_score')
      .in('assignment_id', ids.slice(i, i + chunk))
    if (error) throw error
    for (const r of data || []) {
      const n = Number(r.reel_score ?? r.std_score ?? 0)
      if (Number.isFinite(n) && n > 0) has.add(r.assignment_id)
    }
  }
  return has
}

const assignments = await fetchAllAssignments()
const targetIds = [...new Set(assignments.map((a) => a.target_id).filter(Boolean))]
const userMap = await fetchUsers([...new Set(assignments.flatMap((a) => [a.target_id, a.evaluator_id]))])
const orgAssignments = assignments.filter((a) => String(userMap.get(a.target_id)?.organization_id || '') === ORG)
const completedIds = orgAssignments.filter((a) => a.status === 'completed').map((a) => a.id)
const scorable = await scorableByAssignment(completedIds)

const byTarget = new Map()
for (const a of orgAssignments) {
  const tid = a.target_id
  if (!byTarget.has(tid)) {
    byTarget.set(tid, {
      name: userMap.get(tid)?.name || tid.slice(0, 8),
      all: [],
      completed: [],
      pending: [],
      byCtx: new Map(),
    })
  }
  const row = byTarget.get(tid)
  row.all.push(a)
  if (a.status === 'completed') row.completed.push(a)
  else row.pending.push(a)
  const ctx = normCtx(a.matrix_context)
  if (!row.byCtx.has(ctx)) row.byCtx.set(ctx, { all: new Set(), completed: new Set(), pending: new Set(), scorableCompleted: new Set() })
  const c = row.byCtx.get(ctx)
  c.all.add(a.evaluator_id)
  if (a.status === 'completed') {
    c.completed.add(a.evaluator_id)
    if (scorable.has(a.id)) c.scorableCompleted.add(a.evaluator_id)
  } else c.pending.add(a.evaluator_id)
}

const stats = [...byTarget.entries()].map(([tid, row]) => {
  const peerAll = new Set(row.all.map((a) => a.evaluator_id).filter((eid) => eid !== tid))
  const peerCompleted = new Set(row.completed.map((a) => a.evaluator_id).filter((eid) => eid !== tid))
  const peerPending = new Set(row.pending.map((a) => a.evaluator_id).filter((eid) => eid !== tid))
  const genel = row.byCtx.get('genel') || { completed: new Set(), scorableCompleted: new Set(), pending: new Set() }
  return {
    tid,
    name: row.name,
    assignedEvaluators: peerAll.size,
    completedEvaluators: peerCompleted.size,
    pendingEvaluators: peerPending.size,
    genelCompletedScorable: genel.scorableCompleted.size,
    genelPending: genel.pending.size,
    ctxBreakdown: [...row.byCtx.entries()]
      .map(([ctx, c]) => ({
        ctx,
        assigned: c.all.size,
        completed: c.completed.size,
        pending: c.pending.size,
        scorableCompleted: c.scorableCompleted.size,
      }))
      .sort((a, b) => b.completed - a.completed || a.ctx.localeCompare(b.ctx, 'tr')),
  }
})

stats.sort((a, b) => a.completedEvaluators - b.completedEvaluators || a.name.localeCompare(b.name, 'tr'))

console.log(`Dönem: ${PERIOD}`)
console.log(`Kurum: ${ORG}`)
console.log(`Toplam hedef (kurum): ${stats.length}`)
console.log('')

const low = stats.filter((s) => s.genelCompletedScorable <= 1).slice(0, SAMPLE)
console.log(`=== Genel dilimde tamamlanmış+puanlanabilir ≤1 olan örnekler (ilk ${low.length}) ===`)
for (const s of low) {
  console.log(`\n${s.name}`)
  console.log(`  Tüm bağlamlar: atanan=${s.assignedEvaluators} tamamlanan=${s.completedEvaluators} bekleyen=${s.pendingEvaluators}`)
  console.log(`  Genel (rapor özeti): puanlanabilir tamamlanan=${s.genelCompletedScorable} bekleyen=${s.genelPending}`)
  for (const c of s.ctxBreakdown) {
    console.log(
      `    [${c.ctx}] atanan=${c.assigned} tamamlanan=${c.completed} bekleyen=${c.pending} puanlanabilir=${c.scorableCompleted}`
    )
  }
}

const multiCtx = stats
  .filter((s) => s.ctxBreakdown.length > 1 && s.completedEvaluators >= 3 && s.genelCompletedScorable <= 1)
  .slice(0, 5)
console.log(`\n=== Yan görevde 3+ değerlendiren ama genelde ≤1 (ilk ${multiCtx.length}) ===`)
for (const s of multiCtx) {
  console.log(`\n${s.name}: genel=${s.genelCompletedScorable} toplam tamamlanan=${s.completedEvaluators}`)
  for (const c of s.ctxBreakdown) console.log(`  [${c.ctx}] puanlanabilir tamamlanan=${c.scorableCompleted}`)
}

const summary = {
  targets: stats.length,
  genelScorableLe1: stats.filter((s) => s.genelCompletedScorable <= 1).length,
  hasPendingEvaluators: stats.filter((s) => s.pendingEvaluators > 0).length,
  completedGtGenel: stats.filter((s) => s.completedEvaluators > s.genelCompletedScorable).length,
}
console.log('\n=== Özet ===')
console.log(summary)
