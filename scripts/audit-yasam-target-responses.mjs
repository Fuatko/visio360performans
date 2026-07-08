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

  for (const tgName of ['Onur ERMAN', 'Ayşegül KAZMAZ']) {
    const { data: tg } = await sb.from('users').select('id').eq('name', tgName).single()
    const { data: rows } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, status')
      .eq('period_id', PERIOD)
      .eq('target_id', tg.id)
      .eq('matrix_context', 'yasam_koordinatoru')

    console.log(`\n=== ${tgName} — yasam_koordinatoru HEDEF ===`)
    for (const a of rows || []) {
      const { data: ev } = await sb.from('users').select('name').eq('id', a.evaluator_id).single()
      const { data: resp } = await sb
        .from('evaluation_responses')
        .select('question_id, question_scope')
        .eq('assignment_id', a.id)
      const duty = (resp || []).filter((r) => r.question_scope === 'duty').length
      const period = (resp || []).filter((r) => r.question_scope !== 'duty').length
      console.log(`  ${ev?.name} | ${a.status} | toplam=${(resp || []).length} (duty=${duty}, period=${period})`)
    }
  }
}

main()
