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

async function compareTarget(name) {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
  const { data: u } = await sb.from('users').select('id').eq('name', name).single()
  if (!u) return console.log(`${name}: not found`)

  const { data: genel } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, status, matrix_context')
    .eq('period_id', PERIOD)
    .eq('target_id', u.id)
    .eq('matrix_context', 'genel')

  const nullGenel = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, status')
    .eq('period_id', PERIOD)
    .eq('target_id', u.id)
    .is('matrix_context', null)

  const ids = [...(genel || []).map((a) => a.id), ...(nullGenel.data || []).map((a) => a.id)]
  let respTotal = 0
  for (let i = 0; i < ids.length; i += 50) {
    const { count } = await sb.from('evaluation_responses').select('id', { count: 'exact', head: true }).in('assignment_id', ids.slice(i, i + 50))
    respTotal += count || 0
  }

  const { data: kulup } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, status')
    .eq('period_id', PERIOD)
    .eq('target_id', u.id)
    .eq('matrix_context', 'kulup_ogretmeni')

  let kulupResp = 0
  for (const a of kulup || []) {
    const { count } = await sb.from('evaluation_responses').select('id', { count: 'exact', head: true }).eq('assignment_id', a.id)
    kulupResp += count || 0
  }

  console.log(`\n${name}:`)
  console.log(`  genel atama (matrix_context=genel): ${(genel || []).length}`)
  console.log(`  genel atama (matrix_context null): ${(nullGenel.data || []).length}`)
  console.log(`  genel tamamlanan: ${[...(genel || []), ...(nullGenel.data || [])].filter((a) => a.status === 'completed').length}`)
  console.log(`  genel cevap satırı: ${respTotal}`)
  console.log(`  kulup_ogretmeni atama: ${(kulup || []).length}, cevap: ${kulupResp}`)

  // Who evaluates as genel
  const evalIds = [...new Set([...(genel || []).map((a) => a.evaluator_id), ...(nullGenel.data || []).map((a) => a.evaluator_id)])]
  if (evalIds.length) {
    const { data: evs } = await sb.from('users').select('name').in('id', evalIds)
    console.log(`  değerlendirenler: ${(evs || []).map((e) => e.name).join(', ')}`)
  }
}

async function main() {
  await compareTarget('Ender ÜSTÜNGEL')
  await compareTarget('Fadime ALPARSLAN')
  await compareTarget('Paul GEORGES')
  await compareTarget('Ayşegül KAZMAZ')
}

main()
