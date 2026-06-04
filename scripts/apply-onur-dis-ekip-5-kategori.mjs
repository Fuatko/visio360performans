#!/usr/bin/env node
/**
 * Onur ERMAN — ekip dışı okul_yasam: 5 kategori (genel havuzdan alt küme)
 * Kendi ekibi genel 21 soru — dokunulmaz.
 *
 * 5 kategori:
 *   Mesleki Sorumluluk, Veli İletişimi, Öğrenci İlişkileri ve Empati,
 *   Proje/Etkinlik/Kurumsal Katkı, Kurum İçi İletişim ve İşbirliği
 *
 * Usage: node scripts/apply-onur-dis-ekip-5-kategori.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const ONUR = '83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679'
const TEAM = ['Oğuzhan ÇETİN', 'Gülen ERMAN', 'Ayşegül KAZMAZ', 'Baran YILDIZ']

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

  const { data: teamUsers } = await sb.from('users').select('id').in('name', TEAM)
  const teamIds = new Set((teamUsers || []).map((u) => u.id))

  const { data: oy } = await sb
    .from('evaluation_assignments')
    .select('target_id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ONUR)
    .eq('matrix_context', 'okul_yasam')

  const disTargets = [...new Set((oy || []).map((a) => a.target_id).filter((id) => !teamIds.has(id)))]
  console.log(`Ekip dışı okul_yasam hedef: ${disTargets.length}, 5 kategori id: ${cat5.length}`)
  if (dryRun) return

  // Değerlendirici varsayılan kategorileri (matris UI) — 5'e indir
  await sb
    .from('evaluation_period_evaluator_categories')
    .delete()
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ONUR)
    .eq('scope_kind', 'period')
  const evalCatRows = cat5.map((category_id) => ({
    period_id: PERIOD,
    evaluator_id: ONUR,
    category_id,
    scope_kind: 'period',
    is_active: true,
  }))
  const { error: evalErr } = await sb.from('evaluation_period_evaluator_categories').insert(evalCatRows)
  if (evalErr) throw evalErr

  for (const targetId of disTargets) {
    await sb
      .from('evaluation_period_evaluator_target_categories')
      .delete()
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ONUR)
      .eq('target_id', targetId)
      .eq('matrix_context', 'okul_yasam')

    const catRows = cat5.map((category_id) => ({
      period_id: PERIOD,
      evaluator_id: ONUR,
      target_id: targetId,
      matrix_context: 'okul_yasam',
      category_id,
      scope_kind: 'period',
      is_active: true,
    }))
    const { error: catErr } = await sb.from('evaluation_period_evaluator_target_categories').upsert(catRows, {
      onConflict: 'period_id,evaluator_id,target_id,category_id,scope_kind',
      ignoreDuplicates: false,
    })
    if (catErr) throw catErr

    // 8'den 5'e indirildiyse fazla kategorileri sil
    const { data: remaining } = await sb
      .from('evaluation_period_evaluator_target_categories')
      .select('category_id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ONUR)
      .eq('target_id', targetId)
      .eq('matrix_context', 'okul_yasam')
    const allowed = new Set(cat5)
    const extra = (remaining || []).filter((r) => !allowed.has(r.category_id)).map((r) => r.category_id)
    if (extra.length) {
      await sb
        .from('evaluation_period_evaluator_target_categories')
        .delete()
        .eq('period_id', PERIOD)
        .eq('evaluator_id', ONUR)
        .eq('target_id', targetId)
        .eq('matrix_context', 'okul_yasam')
        .in('category_id', extra)
    }

    await sb.from('evaluation_period_evaluator_target_scope').upsert(
      {
        period_id: PERIOD,
        evaluator_id: ONUR,
        target_id: targetId,
        matrix_context: 'okul_yasam',
        restrict_period: true,
        duty_mode: 'none',
        duty_package_ids: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'period_id,evaluator_id,target_id,matrix_context' }
    )
  }

  // Örnek doğrulama
  const sampleTarget = disTargets[0]
  const { count } = await sb
    .from('evaluation_period_evaluator_target_categories')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ONUR)
    .eq('target_id', sampleTarget)
    .eq('matrix_context', 'okul_yasam')

  console.log(`Tamamlandı. Örnek hedef kategori satırı: ${count} (beklenen 5)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
