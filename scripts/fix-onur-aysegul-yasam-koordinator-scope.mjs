#!/usr/bin/env node
/**
 * Onur ERMAN & Ayşegül KAZMAZ — yasam_koordinatoru kapsamı (yalnızca Okul İçi Yaşam Koordinatörü paketi)
 *
 *   node scripts/fix-onur-aysegul-yasam-koordinator-scope.mjs
 *   node scripts/fix-onur-aysegul-yasam-koordinator-scope.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
/** gorev_4 — Okul İçi Yaşam Koordinatörü (Kulüp gorev_7 değil) */
const YASAM_DUTY = 'e8fa6928-4a58-4dd4-aa1e-2352bf3bbdae'
const TARGETS = ['Onur ERMAN', 'Ayşegül KAZMAZ']
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

async function questionCountForDuty(dutyId) {
  const { data: cat } = await sb
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', PERIOD)
    .eq('duty_id', dutyId)
    .eq('is_active', true)
  const cids = (cat || []).map((r) => r.category_id).filter(Boolean)
  if (!cids.length) return 0
  const { data: qs } = await sb.from('questions').select('id').in('category_id', cids)
  return (qs || []).length
}

async function main() {
  const { data: users } = await sb.from('users').select('id, name').in('name', TARGETS)
  const targetIds = (users || []).map((u) => u.id)
  if (targetIds.length !== 2) throw new Error('Onur veya Ayşegül bulunamadı')

  const { data: assigns } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, target_id, status, evaluator:evaluator_id(name), target:target_id(name)')
    .eq('period_id', PERIOD)
    .in('target_id', targetIds)
    .eq('matrix_context', 'yasam_koordinatoru')

  const yasamQ = await questionCountForDuty(YASAM_DUTY)
  const { data: sinifDuty } = await sb
    .from('evaluation_duties')
    .select('id, name')
    .eq('period_id', PERIOD)
    .ilike('name', '%Sınıf Öğretmeni%')
    .maybeSingle()
  const sinifQ = sinifDuty?.id ? await questionCountForDuty(sinifDuty.id) : 0

  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run')
  console.log({
    yasam_atama: assigns?.length || 0,
    yasam_soru_beklenen: yasamQ,
    sinif_soru_karsilastirma: sinifQ,
  })
  console.log(
    'ornek',
    (assigns || []).slice(0, 6).map((a) => `${a.evaluator?.name} → ${a.target?.name} (${a.status})`)
  )

  if (!APPLY) {
    console.log('\nUygulamak: node scripts/fix-onur-aysegul-yasam-koordinator-scope.mjs --apply')
    return
  }

  for (const a of assigns || []) {
    const row = {
      period_id: PERIOD,
      evaluator_id: a.evaluator_id,
      target_id: a.target_id,
      matrix_context: 'yasam_koordinatoru',
      restrict_period: true,
      duty_mode: 'categories',
      duty_package_ids: [YASAM_DUTY],
      updated_at: new Date().toISOString(),
    }
    const { error } = await sb.from('evaluation_period_evaluator_target_scope').upsert(row, {
      onConflict: 'period_id,evaluator_id,target_id,matrix_context',
    })
    if (error) throw error

    await sb
      .from('evaluation_period_evaluator_target_categories')
      .delete()
      .eq('period_id', PERIOD)
      .eq('evaluator_id', a.evaluator_id)
      .eq('target_id', a.target_id)
      .eq('matrix_context', 'yasam_koordinatoru')
  }

  const { count } = await sb
    .from('evaluation_period_evaluator_target_scope')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .in('target_id', targetIds)
    .eq('matrix_context', 'yasam_koordinatoru')

  console.log('\nSonuç:', { yasam_scope_satir: count ?? 0 })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
