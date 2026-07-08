#!/usr/bin/env node
/** Jennifer → Fadime değerlendirme formu teşhisi */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.paul-fr.tmp', '.env.local', '.env.vercel.prod']) {
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

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli')
  process.exit(1)
}
const sb = createClient(url, key)

async function findUser(q) {
  const { data } = await sb.from('users').select('id,name,email').ilike('name', `%${q}%`)
  return (data || []).find((u) => String(u.name || '').toLowerCase().includes(q.toLowerCase())) || data?.[0]
}

async function main() {
  const jennifer = await findUser('Jennifer')
  const fadime = await findUser('Fadime')
  console.log('Jennifer:', jennifer?.name, jennifer?.id)
  console.log('Fadime:', fadime?.name, fadime?.id)
  if (!jennifer || !fadime) {
    console.error('Kullanıcı bulunamadı')
    process.exit(1)
  }

  const { data: assignments } = await sb
    .from('evaluation_assignments')
    .select('id, slug, status, matrix_context, period_id, created_at')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', jennifer.id)
    .eq('target_id', fadime.id)

  console.log('\n=== ATAMALAR ===')
  for (const a of assignments || []) {
    console.log(a)
  }

  for (const ctx of ['genel', 'okul_yasam']) {
    const { data: scope } = await sb
      .from('evaluation_period_evaluator_target_scope')
      .select('*')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', jennifer.id)
      .eq('target_id', fadime.id)
      .eq('matrix_context', ctx)
      .maybeSingle()
    console.log(`\n=== TARGET SCOPE (${ctx}) ===`, scope || 'YOK')

    const { data: cats } = await sb
      .from('evaluation_period_evaluator_target_categories')
      .select('category_id, scope_kind, matrix_context')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', jennifer.id)
      .eq('target_id', fadime.id)
      .eq('matrix_context', ctx)
      .eq('is_active', true)
    console.log(`Kategoriler (${ctx}):`, cats?.length || 0, cats)
  }

  const { data: evalScope } = await sb
    .from('evaluation_period_evaluator_scope')
    .select('*')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', jennifer.id)
    .maybeSingle()
  console.log('\n=== EVALUATOR DEFAULT SCOPE ===', evalScope || 'YOK')

  const { data: evalCats } = await sb
    .from('evaluation_period_evaluator_categories')
    .select('category_id, scope_kind')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', jennifer.id)
    .eq('is_active', true)
  console.log('Evaluator cats:', evalCats?.length || 0)

  const catIds = new Set((evalCats || []).map((c) => c.category_id))
  for (const ctx of ['genel', 'okul_yasam']) {
    const { data: tc } = await sb
      .from('evaluation_period_evaluator_target_categories')
      .select('category_id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', jennifer.id)
      .eq('target_id', fadime.id)
      .eq('matrix_context', ctx)
    tc?.forEach((r) => catIds.add(r.category_id))
  }

  if (catIds.size) {
    const { data: catNames } = await sb
      .from('evaluation_period_categories_snapshot')
      .select('id, name')
      .eq('period_id', PERIOD)
      .in('id', [...catIds])
    console.log('\n=== KATEGORİ ADLARI ===')
    catNames?.forEach((c) => console.log(c.id, c.name))
  }

  const projeCat = '716e059d-121c-47cc-9c5a-b565a566e9d5'
  const { data: qs } = await sb
    .from('evaluation_period_questions_snapshot')
    .select('id, category_id, text')
    .eq('period_id', PERIOD)
    .eq('category_id', projeCat)
  console.log('\n=== PROJE KATEGORİSİ SORULARI (snapshot) ===', qs?.length || 0)
  qs?.forEach((q) => console.log('-', q.id, String(q.text || '').slice(0, 60)))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
