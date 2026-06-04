#!/usr/bin/env node
/**
 * Yaşam koordinatörleri (Onur ERMAN, Ayşegül KAZMAZ) — genel 8 kategori uygula
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/apply-yasam-koordinator-genel-8.mjs
 *
 * SQL alternatifi: sql/fix-yasam-koordinator-genel-8-kategoriler.sql (Supabase SQL Editor, postgres rolü)
 */
import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const PERIOD_ID = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const EVALUATOR_NAMES = ['Onur ERMAN', 'Ayşegül KAZMAZ']
const CATEGORY_IDS = [
  'a41e0b6b-d9f0-476b-aac1-ec7265813643', // Mesleki Sorumluluk
  'e54d6a2e-dd67-4e8c-8b48-0456f0b6d9dd', // Pedagojik Yetkinlikler
  '80ab1cea-1d41-4996-bdfc-c3624d12402f', // Ölçme & Değerlendirme
  '2d2a0881-ac59-43af-b43b-d65df3593475', // Teknolojik Yetkinlikler
  '24265170-2255-4e21-942e-4a70f4e0dd50', // Veli İletişimi
  '3361c52e-abd5-4c9f-b758-defb70a22b51', // Öğrenci İlişkileri ve Empati
  '716e059d-121c-47cc-9c5a-b565a566e9d5', // Proje, Etkinlik ve Kurumsal Katkı
  '1bbd8465-51d5-47bc-9fbe-eb67701d9d42', // Kurum İçi İletişim ve İşbirliği
]

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )
}

const env = {
  ...loadEnvFile(new URL('../.env.local', import.meta.url).pathname),
  ...loadEnvFile(new URL('../.env.runtime', import.meta.url).pathname),
  ...process.env,
}

const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local veya ortam değişkeni)')
  process.exit(1)
}

const sb = createClient(url, key)

async function main() {
  const { data: users, error: uErr } = await sb.from('users').select('id, name').in('name', EVALUATOR_NAMES)
  if (uErr) throw uErr
  const evaluators = new Map(users.map((u) => [u.name, u.id]))
  for (const n of EVALUATOR_NAMES) {
    if (!evaluators.has(n)) throw new Error(`Kullanıcı bulunamadı: ${n}`)
  }

  const { data: assignments, error: aErr } = await sb
    .from('evaluation_assignments')
    .select('evaluator_id, target_id')
    .eq('period_id', PERIOD_ID)
    .in('evaluator_id', [...evaluators.values()])
  if (aErr) throw aErr

  const genelPairs = assignments.filter((a) => true)
  const byEvaluator = new Map()
  for (const a of genelPairs) {
    const list = byEvaluator.get(a.evaluator_id) || []
    list.push(a.target_id)
    byEvaluator.set(a.evaluator_id, list)
  }

  // matrix_context = genel only (null counts as genel in app; filter in query)
  const { data: genelAssign, error: gErr } = await sb
    .from('evaluation_assignments')
    .select('evaluator_id, target_id, matrix_context')
    .eq('period_id', PERIOD_ID)
    .in('evaluator_id', [...evaluators.values()])
  if (gErr) throw gErr

  const pairs = genelAssign.filter((r) => !r.matrix_context || r.matrix_context === 'genel')

  for (const [evaluatorId, _] of evaluators) {
    const scopeRow = {
      period_id: PERIOD_ID,
      evaluator_id: evaluatorId,
      restrict_period: true,
      duty_mode: 'none',
      duty_package_ids: [],
      updated_at: new Date().toISOString(),
    }
    const { error: scopeErr } = await sb
      .from('evaluation_period_evaluator_scope')
      .upsert(scopeRow, { onConflict: 'period_id,evaluator_id' })
    if (scopeErr) throw scopeErr

    await sb
      .from('evaluation_period_evaluator_categories')
      .delete()
      .eq('period_id', PERIOD_ID)
      .eq('evaluator_id', evaluatorId)
      .eq('scope_kind', 'period')

    const { error: ecErr } = await sb.from('evaluation_period_evaluator_categories').insert(
      CATEGORY_IDS.map((category_id) => ({
        period_id: PERIOD_ID,
        evaluator_id: evaluatorId,
        category_id,
        scope_kind: 'period',
        is_active: true,
      }))
    )
    if (ecErr) throw ecErr
  }

  for (const row of pairs) {
    const scopeRow = {
      period_id: PERIOD_ID,
      evaluator_id: row.evaluator_id,
      target_id: row.target_id,
      matrix_context: 'genel',
      restrict_period: true,
      duty_mode: 'none',
      duty_package_ids: [],
      updated_at: new Date().toISOString(),
    }
    const { error: tsErr } = await sb
      .from('evaluation_period_evaluator_target_scope')
      .upsert(scopeRow, { onConflict: 'period_id,evaluator_id,target_id,matrix_context' })
    if (tsErr) throw tsErr

    await sb
      .from('evaluation_period_evaluator_target_categories')
      .delete()
      .eq('period_id', PERIOD_ID)
      .eq('evaluator_id', row.evaluator_id)
      .eq('target_id', row.target_id)
      .eq('matrix_context', 'genel')
      .eq('scope_kind', 'period')

    const { error: tcErr } = await sb.from('evaluation_period_evaluator_target_categories').insert(
      CATEGORY_IDS.map((category_id) => ({
        period_id: PERIOD_ID,
        evaluator_id: row.evaluator_id,
        target_id: row.target_id,
        matrix_context: 'genel',
        category_id,
        scope_kind: 'period',
        is_active: true,
      }))
    )
    if (tcErr) throw tcErr
  }

  const summary = {}
  for (const name of EVALUATOR_NAMES) {
    const eid = evaluators.get(name)
    const count = pairs.filter((p) => p.evaluator_id === eid).length
    summary[name] = count
  }
  console.log('Tamamlandı — genel hedef sayıları:', summary)
  console.log('Doğrulama: psql veya sql/diagnose-yasam-koordinator-genel-8-kilit-dogrula.sql')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
