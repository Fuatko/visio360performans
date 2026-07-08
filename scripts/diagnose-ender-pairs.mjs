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

async function main() {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  const pairs = [
    ['Paul GEORGES', 'Ender ÜSTÜNGEL'],
    ['Ender ÜSTÜNGEL', 'Paul GEORGES'],
    ['Paul GEORGES', 'Fadime ALPARSLAN'],
    ['Ender ÜSTÜNGEL', 'Fadime ALPARSLAN'],
    ['Ender ÜSTÜNGEL', 'Ender ÜSTÜNGEL'],
    ['Fadime ALPARSLAN', 'Fadime ALPARSLAN'],
  ]

  const names = [...new Set(pairs.flat())]
  const { data: users } = await sb.from('users').select('id, name').in('name', names)
  const byName = new Map((users || []).map((u) => [u.name, u.id]))

  for (const [ev, tg] of pairs) {
    const { data: rows } = await sb
      .from('evaluation_assignments')
      .select('id, status, matrix_context')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', byName.get(ev))
      .eq('target_id', byName.get(tg))
    console.log(`\n${ev} → ${tg}:`)
    if (!rows?.length) {
      console.log('  ATAMA YOK')
      continue
    }
    for (const r of rows) {
      const { count } = await sb.from('evaluation_responses').select('id', { count: 'exact', head: true }).eq('assignment_id', r.id)
      console.log(`  ${r.matrix_context || 'genel'} | ${r.status} | ${count} cevap`)
    }
  }

  // How many evaluators have Ender in their genel list (evaluator side)
  const enderId = byName.get('Ender ÜSTÜNGEL')
  const { count: evalEnderCount } = await sb
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', enderId)
    .eq('matrix_context', 'genel')

  const { count: tgtEnderCount } = await sb
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('target_id', enderId)
    .eq('matrix_context', 'genel')

  console.log(`\nEnder genel: değerlendiren=${evalEnderCount}, değerlendirilen=${tgtEnderCount}`)
}

main()
