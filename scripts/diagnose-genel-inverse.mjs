#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.local', '.env']) {
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

async function whoEvaluatesTarget(targetName) {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
  const { data: tg } = await sb.from('users').select('id').eq('name', targetName).single()
  const { data: rows } = await sb
    .from('evaluation_assignments')
    .select('evaluator_id')
    .eq('period_id', PERIOD)
    .eq('target_id', tg.id)
    .eq('matrix_context', 'genel')
  const eids = [...new Set((rows || []).map((r) => r.evaluator_id))]
  const { data: evs } = await sb.from('users').select('name').in('id', eids)
  return (evs || []).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'tr'))
}

async function whoHasTargetInOutList(targetName) {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
  const { data: tg } = await sb.from('users').select('id').eq('name', targetName).single()
  const { data: rows } = await sb
    .from('evaluation_assignments')
    .select('evaluator_id')
    .eq('period_id', PERIOD)
    .eq('target_id', tg.id)
    .eq('matrix_context', 'genel')
  // This is the same as whoEvaluatesTarget - assignments ARE the out list

  // Who should evaluate based on large-pool evaluators having target in list
  const { data: all } = await sb
    .from('evaluation_assignments')
    .select('evaluator_id, target_id')
    .eq('period_id', PERIOD)
    .eq('matrix_context', 'genel')

  const outCount = new Map()
  for (const r of all || []) {
    const e = String(r.evaluator_id)
    outCount.set(e, (outCount.get(e) || 0) + 1)
  }

  const largeEvaluators = [...outCount.entries()].filter(([, c]) => c >= 70).map(([e]) => e)
  const { data: users } = await sb.from('users').select('id, name').in('id', largeEvaluators)
  const withTarget = []
  for (const u of users || []) {
    const has = (all || []).some((r) => r.evaluator_id === u.id && r.target_id === tg.id)
    if (has) withTarget.push(u.name)
  }
  return withTarget.sort((a, b) => a.localeCompare(b, 'tr'))
}

async function main() {
  for (const t of ['Paul GEORGES', 'Ender ÜSTÜNGEL', 'Ayşegül KAZMAZ', 'Fadime ALPARSLAN']) {
    const evals = await whoEvaluatesTarget(t)
    const inLargePool = await whoHasTargetInOutList(t)
    console.log(`\n${t}:`)
    console.log(`  değerlendiren (atama): ${evals.length} → ${evals.join(', ')}`)
    console.log(`  büyük havuz (≥70 hedef) değerlendirenlerde listede: ${inLargePool.length} → ${inLargePool.join(', ')}`)
  }
}

main()
