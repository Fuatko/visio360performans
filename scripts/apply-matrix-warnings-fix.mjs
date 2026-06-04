#!/usr/bin/env node
/**
 * Matrix audit uyarıları (19 atama) — güvenli düzeltme
 * Usage: node scripts/apply-matrix-warnings-fix.mjs [--apply]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const APPLY = process.argv.includes('--apply')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

const PAUL_LAFORGE = 'd2ce2e2b-ac5c-4f26-95ce-ff7dc3c98c9e'
const PAUL_GEORGES = '6350a539-e0aa-49b7-8895-9ee572124bfe'
const EBRU = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
const SULE = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
const GOKHAN = '4a92e11a-809f-45ef-a3dc-71ed77a8624c'
const DUTY_KULUP = 'ed8f387d-ee3f-473e-a54f-321c521c4a10'

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

async function findWrongPending() {
  const rules = [
    { target_id: EBRU, matrix_context: 'zumre', label: 'Ebru hedef zümre' },
    { target_id: SULE, matrix_context: 'rehberlik_ogretmeni', label: 'Şule hedef rehberlik' },
    { target_id: GOKHAN, matrix_context: 'sinif_ogretmeni', label: 'Gökhan hedef sınıf' },
  ]
  const out = []
  for (const r of rules) {
    const { data } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, status')
      .eq('period_id', PERIOD)
      .eq('target_id', r.target_id)
      .eq('matrix_context', r.matrix_context)
      .eq('status', 'pending')
    ;(data || []).forEach((a) => out.push({ ...a, rule: r.label }))
  }
  return out
}

async function main() {
  if (PAUL_LAFORGE === PAUL_GEORGES) {
    console.error('Güvenlik: Paul ID çakışması')
    process.exit(1)
  }

  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run\n')

  const { data: laforgeDuty } = await sb
    .from('evaluation_period_user_duties')
    .select('duty_id')
    .eq('period_id', PERIOD)
    .eq('user_id', PAUL_LAFORGE)
    .eq('duty_id', DUTY_KULUP)
    .maybeSingle()

  console.log('1) Paul LAFORGE kulüp görevi:', laforgeDuty ? 'zaten var' : 'EKLENECEK')

  const wrong = await findWrongPending()
  console.log(`2) Silinecek pending yanlış atama: ${wrong.length}`)
  wrong.forEach((w) => console.log(`   - ${w.rule} id=${w.id}`))

  if (!wrong.length && laforgeDuty) {
    console.log('\nDeğişiklik gerekmiyor.')
    return
  }

  if (!APPLY) {
    console.log('\nUygula: node scripts/apply-matrix-warnings-fix.mjs --apply')
    return
  }

  if (!laforgeDuty) {
    const { error } = await sb.from('evaluation_period_user_duties').insert({
      period_id: PERIOD,
      user_id: PAUL_LAFORGE,
      duty_id: DUTY_KULUP,
      is_active: true,
    })
    if (error) throw new Error(`Paul LAFORGE duty: ${error.message}`)
    console.log('Paul LAFORGE kulüp görevi eklendi.')
  }

  const ids = wrong.map((w) => w.id)
  if (ids.length) {
    const { data: resp } = await sb.from('evaluation_responses').select('id').in('assignment_id', ids)
    if (resp?.length) {
      const { error } = await sb.from('evaluation_responses').delete().in('assignment_id', ids)
      if (error) throw error
      console.log(`Yanıt silindi: ${resp.length}`)
    }

    const { error: delErr } = await sb.from('evaluation_assignments').delete().in('id', ids)
    if (delErr) throw new Error(delErr.message)
    console.log(`Atama silindi: ${ids.length}`)
  }

  console.log('\nDoğrulama — kalan yanlış pending:')
  const remain = await findWrongPending()
  console.log(remain.length ? remain : 'OK: 0')

  const { data: plDuty } = await sb
    .from('evaluation_period_user_duties')
    .select('evaluation_duties(name)')
    .eq('period_id', PERIOD)
    .eq('user_id', PAUL_LAFORGE)
    .eq('is_active', true)
  console.log(
    'Paul LAFORGE görevleri:',
    (plDuty || []).map((r) => r.evaluation_duties?.name).join(', ') || '(boş)'
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
