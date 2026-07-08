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

async function listGenelTargets(evaluatorName) {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
  const { data: ev } = await sb.from('users').select('id').eq('name', evaluatorName).single()
  const { data: rows } = await sb
    .from('evaluation_assignments')
    .select('target_id, status')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ev.id)
    .eq('matrix_context', 'genel')
  const tids = [...new Set((rows || []).map((r) => r.target_id))]
  const { data: tgts } = await sb.from('users').select('id, name').in('id', tids)
  const names = (tgts || []).map((t) => t.name).sort((a, b) => a.localeCompare(b, 'tr'))
  const hasEnder = names.some((n) => n === 'Ender ÜSTÜNGEL')
  const hasFadime = names.some((n) => n === 'Fadime ALPARSLAN')
  console.log(`\n${evaluatorName}: ${names.length} genel hedef | Ender=${hasEnder} Fadime=${hasFadime}`)
}

async function evaluatorsWithTarget(targetName) {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
  const { data: tg } = await sb.from('users').select('id').eq('name', targetName).single()
  const { data: rows } = await sb
    .from('evaluation_assignments')
    .select('evaluator_id, status')
    .eq('period_id', PERIOD)
    .eq('target_id', tg.id)
    .eq('matrix_context', 'genel')
  const eids = [...new Set((rows || []).map((r) => r.evaluator_id))]
  const { data: evs } = await sb.from('users').select('name').in('id', eids)
  console.log(`\n${targetName} değerlendirenler (${(evs || []).length}):`, (evs || []).map((e) => e.name).join(', '))
}

async function main() {
  for (const n of ['Paul GEORGES', 'Ender ÜSTÜNGEL', 'Ayşegül KAZMAZ', 'Onur ERMAN', 'Şule KOÇAK']) {
    await listGenelTargets(n)
  }
  await evaluatorsWithTarget('Ender ÜSTÜNGEL')
  await evaluatorsWithTarget('Fadime ALPARSLAN')
  await evaluatorsWithTarget('Paul GEORGES')
}

main()
