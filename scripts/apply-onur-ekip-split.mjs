#!/usr/bin/env node
/**
 * Onur ERMAN: ekip genel 21 | ekip dışı okul_yasam 5 kategori
 * Usage: node scripts/apply-onur-ekip-split.mjs [--dry-run]
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

async function resolveDisCatIds(sb) {
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
  const catDis = await resolveDisCatIds(sb)

  const { data: teamUsers } = await sb.from('users').select('id, name').in('name', TEAM)
  const teamIds = new Set((teamUsers || []).map((u) => u.id))

  const { data: genel } = await sb
    .from('evaluation_assignments')
    .select('id, target_id, status')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ONUR)
    .eq('matrix_context', 'genel')

  const disEkip = (genel || []).filter((a) => !teamIds.has(a.target_id))
  const ekip = (genel || []).filter((a) => teamIds.has(a.target_id))

  console.log(`Ekip genel: ${ekip.length}, ekip dışı taşınacak: ${disEkip.length}, 5 kategori id: ${catDis.length}`)
  if (dryRun) return

  // Ekip dışı: genel → okul_yasam
  for (const row of disEkip) {
    const { data: existing } = await sb
      .from('evaluation_assignments')
      .select('id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ONUR)
      .eq('target_id', row.target_id)
      .eq('matrix_context', 'okul_yasam')
      .maybeSingle()

    if (!existing) {
      const { error } = await sb.from('evaluation_assignments').insert({
        period_id: PERIOD,
        evaluator_id: ONUR,
        target_id: row.target_id,
        matrix_context: 'okul_yasam',
        status: 'pending',
      })
      if (error) throw error
    }

    await sb.from('evaluation_responses').delete().eq('assignment_id', row.id)
    await sb.from('evaluation_assignments').delete().eq('id', row.id)

    await sb.from('evaluation_period_evaluator_target_scope').upsert(
      {
        period_id: PERIOD,
        evaluator_id: ONUR,
        target_id: row.target_id,
        matrix_context: 'okul_yasam',
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
      .eq('evaluator_id', ONUR)
      .eq('target_id', row.target_id)
      .eq('matrix_context', 'okul_yasam')

    const catRows = catDis.map((category_id) => ({
      period_id: PERIOD,
      evaluator_id: ONUR,
      target_id: row.target_id,
      matrix_context: 'okul_yasam',
      category_id,
      scope_kind: 'period',
      is_active: true,
    }))
    const { error: catErr } = await sb.from('evaluation_period_evaluator_target_categories').upsert(catRows, {
      onConflict: 'period_id,evaluator_id,target_id,category_id,scope_kind',
      ignoreDuplicates: false,
    })
    if (catErr && !String(catErr.message || '').includes('duplicate')) throw catErr

    await sb
      .from('evaluation_period_evaluator_target_categories')
      .delete()
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ONUR)
      .eq('target_id', row.target_id)
      .eq('matrix_context', 'genel')
    await sb
      .from('evaluation_period_evaluator_target_scope')
      .delete()
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ONUR)
      .eq('target_id', row.target_id)
      .eq('matrix_context', 'genel')
  }

  // Kendi ekibi: genel tam 21
  for (const tid of teamIds) {
    await sb
      .from('evaluation_period_evaluator_target_categories')
      .delete()
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ONUR)
      .eq('target_id', tid)
      .eq('matrix_context', 'genel')

    await sb.from('evaluation_period_evaluator_target_scope').upsert(
      {
        period_id: PERIOD,
        evaluator_id: ONUR,
        target_id: tid,
        matrix_context: 'genel',
        restrict_period: false,
        duty_mode: 'none',
        duty_package_ids: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'period_id,evaluator_id,target_id,matrix_context' }
    )
  }

  const { count: genelCount } = await sb
    .from('evaluation_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ONUR)
    .eq('matrix_context', 'genel')
  const { count: oyCount } = await sb
    .from('evaluation_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ONUR)
    .eq('matrix_context', 'okul_yasam')

  console.log(`Tamamlandı. genel=${genelCount}, okul_yasam=${oyCount}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
