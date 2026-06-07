#!/usr/bin/env node
/** Üst kutu (benzersiz kişi) vs dilim tablosu (dilim×kişi) farkını analiz eder */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const ORG = process.env.ORG_ID || 'e03a6045-5a9c-4015-9763-2b869657eb42'
const TARGET = process.env.TARGET_ID || ''

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
  console.error('SUPABASE credentials missing')
  process.exit(1)
}
const sb = createClient(url, key)

function normCtx(v) {
  const x = String(v || 'genel').trim() || 'genel'
  return x === 'genel' ? 'genel' : x
}

async function fetchAssignmentsForTarget(targetId) {
  const out = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, target_id, status, matrix_context, evaluator:evaluator_id(id,name)')
      .eq('period_id', PERIOD)
      .eq('target_id', targetId)
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

async function scorableMap(ids) {
  const map = new Map()
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    const { data, error } = await sb.from('evaluation_responses').select('assignment_id, reel_score, std_score').in('assignment_id', chunk)
    if (error) throw error
    for (const r of data || []) {
      const n = Number(r.reel_score ?? r.std_score ?? 0)
      if (!map.has(r.assignment_id)) map.set(r.assignment_id, false)
      if (Number.isFinite(n) && n > 0) map.set(r.assignment_id, true)
    }
  }
  return map
}

function analyze(targetId, targetName, assignments, scorable) {
  const peers = assignments.filter((a) => a.evaluator_id !== targetId)
  const byCtx = new Map()
  const uniqueAssigned = new Set()
  const uniqueScored = new Set()
  const uniqueNoOpinionOnly = new Set()
  const uniquePending = new Set()
  const uniqueGenelScored = new Set()
  const evaluatorSlices = new Map()

  for (const a of peers) {
    const eid = a.evaluator_id
    const ename = a.evaluator?.name || eid.slice(0, 8)
    const ctx = normCtx(a.matrix_context)
    const done = a.status === 'completed'
    const score = done && scorable.get(a.id) === true

    uniqueAssigned.add(eid)
    if (!done) uniquePending.add(eid)
    if (score) uniqueScored.add(eid)
    if (score && ctx === 'genel') uniqueGenelScored.add(eid)

    if (!byCtx.has(ctx)) byCtx.set(ctx, { assigned: new Set(), scored: new Set(), noOp: new Set(), pending: new Set() })
    const s = byCtx.get(ctx)
    s.assigned.add(eid)
    if (!done) s.pending.add(eid)
    else if (score) s.scored.add(eid)
    else s.noOp.add(eid)

    if (!evaluatorSlices.has(eid)) evaluatorSlices.set(eid, { name: ename, slices: [] })
    evaluatorSlices.get(eid).slices.push({ ctx, done, score, noOp: done && !score })
  }

  for (const [eid, info] of evaluatorSlices) {
    const anyScore = info.slices.some((x) => x.score)
    const allDone = info.slices.every((x) => x.done)
    const anyPending = info.slices.some((x) => !x.done)
    if (allDone && !anyScore && !anyPending) uniqueNoOpinionOnly.add(eid)
  }

  const sliceRows = [...byCtx.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const sumAssigned = sliceRows.reduce((n, [, s]) => n + s.assigned.size, 0)
  const sumScored = sliceRows.reduce((n, [, s]) => n + s.scored.size, 0)
  const sumNoOp = sliceRows.reduce((n, [, s]) => n + s.noOp.size, 0)

  return {
    targetName,
    unique: {
      assigned: uniqueAssigned.size,
      scored: uniqueScored.size,
      noOpinionOnly: uniqueNoOpinionOnly.size,
      pending: uniquePending.size,
      genelScored: uniqueGenelScored.size,
    },
    sliceSum: { assigned: sumAssigned, scored: sumScored, noOpinion: sumNoOp },
    sliceRows,
    evaluatorSlices,
  }
}

async function findMatchingTarget() {
  const { data: users } = await sb.from('users').select('id,name').eq('organization_id', ORG)
  for (const u of users || []) {
    const assignments = await fetchAssignmentsForTarget(u.id)
    if (!assignments.length) continue
    const scorable = await scorableMap(assignments.map((a) => a.id))
    const r = analyze(u.id, u.name, assignments, scorable)
    if (
      r.unique.assigned === 10 &&
      r.unique.scored === 7 &&
      r.unique.noOpinionOnly === 3 &&
      r.sliceSum.noOpinion === 6
    ) {
      return { targetId: u.id, ...r }
    }
  }
  return null
}

async function main() {
  let targetId = TARGET
  let result

  if (targetId) {
    const { data: u } = await sb.from('users').select('id,name').eq('id', targetId).maybeSingle()
    const assignments = await fetchAssignmentsForTarget(targetId)
    const scorable = await scorableMap(assignments.map((a) => a.id))
    result = { targetId, ...analyze(targetId, u?.name || targetId, assignments, scorable) }
  } else {
    const match = await findMatchingTarget()
    if (!match) {
      console.log('Ekranla birebir eşleşen hedef bulunamadı; tüm hedeflerden örnekler:')
      const { data: users } = await sb.from('users').select('id,name').eq('organization_id', ORG).limit(88)
      for (const u of users || []) {
        const assignments = await fetchAssignmentsForTarget(u.id)
        if (assignments.length < 5) continue
        const scorable = await scorableMap(assignments.map((a) => a.id))
        const r = analyze(u.id, u.name, assignments, scorable)
        if (r.unique.assigned >= 8) {
          console.log(
            `\n${r.targetName}: üst=${r.unique.assigned}/${r.unique.scored}/${r.unique.noOpinionOnly} tabloToplam=${r.sliceSum.assigned}/${r.sliceSum.scored}/${r.sliceSum.noOpinion}`
          )
        }
      }
      return
    }
    result = match
  }

  console.log(`\n=== ${result.targetName} ===`)
  console.log('ÜST KUTULAR (benzersiz kişi):', result.unique)
  console.log('TABLO SÜTUN TOPLAMI (dilim bazlı, aynı kişi birden fazla dilimde sayılır):', result.sliceSum)
  console.log('\nDilim kırılımı:')
  for (const [ctx, s] of result.sliceRows) {
    console.log(`  ${ctx}: atanan=${s.assigned.size} değerlendi=${s.scored.size} fikrimYok=${s.noOp.size}`)
  }
  console.log('\nKişi bazlı (hangi dilimlerde):')
  for (const [, info] of result.evaluatorSlices) {
    const tags = info.slices.map((x) => `${x.ctx}:${x.score ? 'puan' : x.noOp ? 'fikrimYok' : 'bekliyor'}`).join(', ')
    console.log(`  ${info.name} → ${tags}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
