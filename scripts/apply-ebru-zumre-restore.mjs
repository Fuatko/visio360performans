#!/usr/bin/env node
/** Ebru zümre görev profili + hedef zümre atamaları. Usage: --apply */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APPLY = process.argv.includes('--apply')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const EBRU = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
const DUTY_ZUMRE = '0a63eda7-0c2d-465c-bdbc-41a33725cbe0'
const EVALUATORS = [
  'Ender ÜSTÜNGEL',
  'Paul GEORGES',
  'Yaprak BENER CHAPDELAINE',
  'Rengin TAMKAN DOĞAN',
  'Gülnaz PEKİN',
  'Berna SÖĞÜTLÜ',
]

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.local']) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim().replace(/^[\"']|[\"']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  }
}
loadEnv()
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  console.log(APPLY ? 'APPLY' : 'dry-run')
  const { data: users } = await sb.from('users').select('id,name').in('name', EVALUATORS)
  const byName = new Map((users || []).map((u) => [u.name, u.id]))

  if (!APPLY) {
    console.log('Ebru zümre görevi +', EVALUATORS.length, 'değerlendiren → Ebru hedef zumre')
    return
  }

  const { data: exDuty } = await sb
    .from('evaluation_period_user_duties')
    .select('user_id')
    .eq('period_id', PERIOD)
    .eq('user_id', EBRU)
    .eq('duty_id', DUTY_ZUMRE)
    .maybeSingle()
  if (!exDuty) {
    const { error } = await sb.from('evaluation_period_user_duties').insert({
      period_id: PERIOD,
      user_id: EBRU,
      duty_id: DUTY_ZUMRE,
      is_active: true,
    })
    if (error) throw error
    console.log('Ebru → Zümre Başkanı görevi eklendi')
  }

  for (const name of EVALUATORS) {
    const evId = byName.get(name)
    if (!evId) continue
    const { data: genel } = await sb
      .from('evaluation_assignments')
      .select('id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', evId)
      .eq('target_id', EBRU)
      .eq('matrix_context', 'genel')
      .limit(1)
    if (!genel?.length) continue
    const { data: ex } = await sb
      .from('evaluation_assignments')
      .select('id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', evId)
      .eq('target_id', EBRU)
      .eq('matrix_context', 'zumre')
      .limit(1)
    if (ex?.length) continue
    await sb.from('evaluation_assignments').insert({
      period_id: PERIOD,
      evaluator_id: evId,
      target_id: EBRU,
      matrix_context: 'zumre',
      status: 'pending',
    })
    console.log('Atama:', name, '→ Ebru zumre')
  }

  const { data: duties } = await sb
    .from('evaluation_period_user_duties')
    .select('evaluation_duties(name)')
    .eq('period_id', PERIOD)
    .eq('user_id', EBRU)
  console.log('Ebru görevler:', (duties || []).map((d) => d.evaluation_duties?.name))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
