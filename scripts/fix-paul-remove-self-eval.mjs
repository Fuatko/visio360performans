#!/usr/bin/env node
/** Paul GEORGES öz değerlendirme atamalarını sil */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const PAUL = '6350a539-e0aa-49b7-8895-9ee572124bfe'
const APPLY = process.argv.includes('--apply')

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.local']) {
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

const sb = createClient(
  (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function main() {
  const { data: u } = await sb.from('users').select('name').eq('id', PAUL).single()
  if (u?.name !== 'Paul GEORGES') throw new Error(`Güvenlik: ${PAUL} Paul GEORGES değil`)

  const { data: rows } = await sb
    .from('evaluation_assignments')
    .select('id, matrix_context, status')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', PAUL)
    .eq('target_id', PAUL)

  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run')
  console.log('Silinecek öz değerlendirme:', rows || [])

  if (!APPLY || !rows?.length) {
    if (!APPLY) console.log('\nUygulamak: node scripts/fix-paul-remove-self-eval.mjs --apply')
    return
  }

  const ids = rows.map((r) => r.id)
  await sb.from('evaluation_responses').delete().in('assignment_id', ids)
  try {
    await sb.from('international_standard_scores').delete().in('assignment_id', ids)
  } catch {
    /* optional table */
  }
  await sb
    .from('evaluation_period_evaluator_target_categories')
    .delete()
    .eq('period_id', PERIOD)
    .eq('evaluator_id', PAUL)
    .eq('target_id', PAUL)
  await sb
    .from('evaluation_period_evaluator_target_scope')
    .delete()
    .eq('period_id', PERIOD)
    .eq('evaluator_id', PAUL)
    .eq('target_id', PAUL)
  const { error } = await sb.from('evaluation_assignments').delete().in('id', ids)
  if (error) throw error

  const { data: left } = await sb
    .from('evaluation_assignments')
    .select('id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', PAUL)
    .eq('target_id', PAUL)
  const { count: genel } = await sb
    .from('evaluation_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', PAUL)
    .eq('matrix_context', 'genel')

  console.log('\nSonuç:', { oz_kalan: left?.length || 0, paul_genel_toplam: genel })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
