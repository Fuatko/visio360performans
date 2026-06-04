#!/usr/bin/env node
/**
 * Ender ÜSTÜNGEL — değerlendirici olarak sinif_ogretmeni atamalarını kaldırır.
 *
 *   node scripts/fix-ender-remove-sinif-evaluator.mjs
 *   node scripts/fix-ender-remove-sinif-evaluator.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const ENDER = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
const MATRIX = 'sinif_ogretmeni'
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
  const { data: u, error: uErr } = await sb.from('users').select('name').eq('id', ENDER).single()
  if (uErr || u?.name !== 'Ender ÜSTÜNGEL') {
    throw new Error(`Güvenlik: ${ENDER} Ender ÜSTÜNGEL değil (${u?.name || uErr?.message})`)
  }

  const { data: assignments } = await sb
    .from('evaluation_assignments')
    .select('id, target_id, status, slug')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ENDER)
    .eq('matrix_context', MATRIX)

  const byStatus = {}
  for (const a of assignments || []) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1
  }

  const { count: paulSinif } = await sb
    .from('evaluation_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', '6350a539-e0aa-49b7-8895-9ee572124bfe')
    .eq('matrix_context', MATRIX)

  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run')
  console.log({
    ender_sinif_atama: assignments?.length || 0,
    durum: byStatus,
    paul_sinif_degistirilmez: paulSinif,
  })

  if (!APPLY) {
    console.log('\nUygulamak: node scripts/fix-ender-remove-sinif-evaluator.mjs --apply')
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
    .eq('evaluator_id', ENDER)
    .eq('matrix_context', MATRIX)

  await sb
    .from('evaluation_period_evaluator_target_scope')
    .delete()
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ENDER)
    .eq('matrix_context', MATRIX)

  const { count: left } = await sb
    .from('evaluation_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ENDER)
    .eq('matrix_context', MATRIX)

  const { data: matrixBreak } = await sb
    .from('evaluation_assignments')
    .select('matrix_context, status')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ENDER)

  const summary = {}
  for (const r of matrixBreak || []) {
    const k = r.matrix_context || 'genel'
    summary[k] = (summary[k] || 0) + 1
  }

  console.log({ ender_sinif_kalan: left, ender_kalan_matris: summary })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
