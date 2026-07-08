#!/usr/bin/env node
/** Jennifer → Fadime genel kapsam: boş kategori satırını Proje kategorisi ile onar */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const JENNIFER = 'afae4ea3-8aab-4c83-8ba0-08edc870be25'
const FADIME = 'ce3a9ae6-cb9a-4bbe-a183-65b031d6a8dc'
const PROJE_CAT = '716e059d-121c-47cc-9c5a-b565a566e9d5'
const APPLY = process.argv.includes('--apply')

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.paul-fr.tmp', '.env.local']) {
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
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function main() {
  const { data: cats } = await sb
    .from('evaluation_period_evaluator_target_categories')
    .select('category_id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', JENNIFER)
    .eq('target_id', FADIME)
    .eq('matrix_context', 'genel')
    .eq('is_active', true)

  console.log('Mevcut genel kategori sayısı:', cats?.length || 0)
  if ((cats || []).length > 0) {
    console.log('Onarım gerekmez.')
    return
  }

  console.log(APPLY ? 'Uygulanıyor…' : 'Dry-run: genel hedef kapsamına Proje kategorisi eklenecek')
  if (!APPLY) {
    console.log('Çalıştır: node scripts/fix-jennifer-fadime-genel-scope.mjs --apply')
    return
  }

  await sb.from('evaluation_period_evaluator_target_scope').upsert(
    {
      period_id: PERIOD,
      evaluator_id: JENNIFER,
      target_id: FADIME,
      matrix_context: 'genel',
      restrict_period: true,
      duty_mode: 'none',
      duty_package_ids: [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'period_id,evaluator_id,target_id,matrix_context' }
  )

  await sb
    .from('evaluation_period_evaluator_target_categories')
    .delete()
    .eq('period_id', PERIOD)
    .eq('evaluator_id', JENNIFER)
    .eq('target_id', FADIME)
    .eq('matrix_context', 'genel')

  const { error } = await sb.from('evaluation_period_evaluator_target_categories').upsert(
    {
      period_id: PERIOD,
      evaluator_id: JENNIFER,
      target_id: FADIME,
      matrix_context: 'genel',
      category_id: PROJE_CAT,
      scope_kind: 'period',
      is_active: true,
    },
    { onConflict: 'period_id,evaluator_id,target_id,category_id,scope_kind' }
  )
  if (error) throw error
  console.log('Tamam — Jennifer → Fadime genel: Proje kategorisi (2 soru) bağlandı.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
