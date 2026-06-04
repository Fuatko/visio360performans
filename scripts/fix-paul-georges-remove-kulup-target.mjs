#!/usr/bin/env node
/**
 * Paul GEORGES — hedef olarak kulüp öğretmeni değerlendirmesini kaldırır.
 *
 *   node scripts/fix-paul-georges-remove-kulup-target.mjs
 *   node scripts/fix-paul-georges-remove-kulup-target.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const PAUL = '6350a539-e0aa-49b7-8895-9ee572124bfe'
const KULUP_DUTY = 'ed8f387d-ee3f-473e-a54f-321c521c4a10'
const MATRIX = 'kulup_ogretmeni'
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
  const { data: u, error: uErr } = await sb.from('users').select('name').eq('id', PAUL).single()
  if (uErr || u?.name !== 'Paul GEORGES') {
    throw new Error(`Güvenlik: ${PAUL} Paul GEORGES değil (${u?.name || uErr?.message})`)
  }

  const { data: duties } = await sb
    .from('evaluation_period_user_duties')
    .select('id, duty_id')
    .eq('period_id', PERIOD)
    .eq('user_id', PAUL)
    .eq('duty_id', KULUP_DUTY)

  const { data: assignments } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, status, slug')
    .eq('period_id', PERIOD)
    .eq('target_id', PAUL)
    .eq('matrix_context', MATRIX)

  const { data: scopeRows } = await sb
    .from('evaluation_period_evaluator_target_scope')
    .select('evaluator_id, matrix_context')
    .eq('period_id', PERIOD)
    .eq('target_id', PAUL)
    .eq('matrix_context', MATRIX)

  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run')
  console.log({
    kulup_gorev_kaydi: duties?.length || 0,
    kulup_hedef_atama: assignments?.length || 0,
    kulup_scope_satir: scopeRows?.length || 0,
    atamalar: (assignments || []).map((a) => ({
      id: a.id,
      status: a.status,
      evaluator_id: a.evaluator_id,
    })),
  })

  if (!APPLY) {
    console.log('\nUygulamak: node scripts/fix-paul-georges-remove-kulup-target.mjs --apply')
    return
  }

  const ids = (assignments || []).map((r) => r.id)
  if (ids.length) {
    await sb.from('evaluation_responses').delete().in('assignment_id', ids)
    try {
      await sb.from('international_standard_scores').delete().in('assignment_id', ids)
    } catch {
      /* optional */
    }
    const { error: delA } = await sb.from('evaluation_assignments').delete().in('id', ids)
    if (delA) throw delA
  }

  await sb
    .from('evaluation_period_evaluator_target_categories')
    .delete()
    .eq('period_id', PERIOD)
    .eq('target_id', PAUL)
    .eq('matrix_context', MATRIX)

  await sb
    .from('evaluation_period_evaluator_target_scope')
    .delete()
    .eq('period_id', PERIOD)
    .eq('target_id', PAUL)
    .eq('matrix_context', MATRIX)

  await sb
    .from('evaluation_period_user_duties')
    .delete()
    .eq('period_id', PERIOD)
    .eq('user_id', PAUL)
    .eq('duty_id', KULUP_DUTY)

  const { count: leftAssign } = await sb
    .from('evaluation_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('target_id', PAUL)
    .eq('matrix_context', MATRIX)

  const { count: leftDuty } = await sb
    .from('evaluation_period_user_duties')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('user_id', PAUL)
    .eq('duty_id', KULUP_DUTY)

  console.log('\nSonuç:', {
    paul_kulup_atama_kalan: leftAssign ?? 0,
    paul_kulup_gorev_kalan: leftDuty ?? 0,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
