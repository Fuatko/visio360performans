#!/usr/bin/env node
/**
 * Ayşegül KAZMAZ — tüm genel değerlendirmeler: 5 kategori (Okul İçi Yaşam Koordinatörü)
 * Yan görev kartları (kulup, nöbet vb.) dokunulmaz.
 *
 * Usage: node scripts/apply-aysegul-genel-5-kategori.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const AYSEGUL = '9db639d7-e80b-415b-90d1-b7f9e65fa6c2'

const CAT_WANTED = [
  'Mesleki Sorumluluk',
  'Veli İletişimi',
  'Öğrenci İlişkileri ve Empati',
  'Proje, Etkinlik ve Kurumsal Katkı',
  'Kurum İçi İletişim ve İşbirliği',
]

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.local']) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^[\"']|[\"']$/g, '')
    }
  }
}

function matchCat(wanted, name) {
  const n = String(name || '')
  if (n === wanted) return true
  if (wanted === 'Kurum İçi İletişim ve İşbirliği' && /Kurum.*İletişim/i.test(n)) return true
  if (wanted.startsWith('Proje') && /^Proje/i.test(n)) return true
  return false
}

async function resolveCatIds(sb) {
  const { data: cs } = await sb
    .from('evaluation_period_categories_snapshot')
    .select('id, name')
    .eq('period_id', PERIOD)
  const ids = []
  for (const w of CAT_WANTED) {
    const m = (cs || []).find((c) => matchCat(w, c.name))
    if (!m) throw new Error(`Kategori bulunamadı: ${w}`)
    ids.push(m.id)
  }
  return ids
}

async function main() {
  loadEnv()
  const dryRun = process.argv.includes('--dry-run')
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const cat5 = await resolveCatIds(sb)

  const { data: genel } = await sb
    .from('evaluation_assignments')
    .select('target_id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', AYSEGUL)
    .eq('matrix_context', 'genel')

  const targets = [...new Set((genel || []).map((a) => a.target_id))]
  console.log(`Genel hedef: ${targets.length}, 5 kategori`)
  if (dryRun) return

  await sb
    .from('evaluation_period_evaluator_categories')
    .delete()
    .eq('period_id', PERIOD)
    .eq('evaluator_id', AYSEGUL)
    .eq('scope_kind', 'period')
  const { error: evalErr } = await sb.from('evaluation_period_evaluator_categories').insert(
    cat5.map((category_id) => ({
      period_id: PERIOD,
      evaluator_id: AYSEGUL,
      category_id,
      scope_kind: 'period',
      is_active: true,
    }))
  )
  if (evalErr) throw evalErr

  for (const targetId of targets) {
    await sb
      .from('evaluation_period_evaluator_target_categories')
      .delete()
      .eq('period_id', PERIOD)
      .eq('evaluator_id', AYSEGUL)
      .eq('target_id', targetId)
      .eq('matrix_context', 'genel')

    const catRows = cat5.map((category_id) => ({
      period_id: PERIOD,
      evaluator_id: AYSEGUL,
      target_id: targetId,
      matrix_context: 'genel',
      category_id,
      scope_kind: 'period',
      is_active: true,
    }))
    const { error: catErr } = await sb.from('evaluation_period_evaluator_target_categories').insert(catRows)
    if (catErr) throw catErr

    await sb.from('evaluation_period_evaluator_target_scope').upsert(
      {
        period_id: PERIOD,
        evaluator_id: AYSEGUL,
        target_id: targetId,
        matrix_context: 'genel',
        restrict_period: true,
        duty_mode: 'none',
        duty_package_ids: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'period_id,evaluator_id,target_id,matrix_context' }
    )
  }

  console.log(`Tamamlandı. ${targets.length} hedef × 5 kategori`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
