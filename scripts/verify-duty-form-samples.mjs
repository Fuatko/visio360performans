#!/usr/bin/env node
/**
 * Deploy sonrası: belirli atamalarda beklenen soru paketini doğrula (READ-ONLY)
 * Usage: node scripts/verify-duty-form-samples.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

const SAMPLES = [
  { evaluator: 'Ender ÜSTÜNGEL', target: 'Berna BENER', ctx: 'sinif_ogretmeni', expectDuty: 'Sınıf Öğretmeni' },
  { evaluator: 'Paul GEORGES', target: 'Binnaz BAYRAK ONUR', ctx: 'sinif_ogretmeni', expectDuty: 'Sınıf Öğretmeni' },
  { evaluator: 'Ender ÜSTÜNGEL', target: 'Binnaz BAYRAK ONUR', ctx: 'bilimsel_etkinlik_koordinatoru', expectDuty: 'Bilimsel' },
  { evaluator: 'Berna SÖĞÜTLÜ', target: 'Altan KILIÇ', ctx: 'zumre', expectDuty: 'Zümre' },
  { evaluator: 'Ender ÜSTÜNGEL', target: 'Paul LAFORGE', ctx: 'kulup_ogretmeni', expectDuty: 'Kulüp' },
]

const DUTY_FRAGMENTS = {
  zumre: ['zumre', 'zümre'],
  sinif_ogretmeni: ['sinif ogretmen', 'sınıf öğretmen'],
  kulup_ogretmeni: ['kulup', 'kulüp'],
  nobetci_ogretmeni: ['nobetci', 'nöbetçi'],
  bilimsel_etkinlik_koordinatoru: ['bilimsel etkinlik', 'bilimsel faaliyet'],
}

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

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
}

function findDutyId(duties, ctx) {
  const frags = DUTY_FRAGMENTS[ctx]
  if (!frags) return null
  for (const d of duties) {
    const n = norm(d.name)
    if (frags.some((f) => n.includes(norm(f)))) return d
  }
  return null
}

async function questionsForDuty(sb, dutyId) {
  const { data: dc } = await sb
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', PERIOD)
    .eq('duty_id', dutyId)
  const cids = (dc || []).map((r) => r.category_id)
  const { data: qs } = await sb
    .from('questions')
    .select('id, text, category_id, question_categories:name')
    .in('category_id', cids.length ? cids : ['00000000-0000-0000-0000-000000000000'])
  return qs || []
}

async function main() {
  loadEnv()
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: duties } = await sb.from('evaluation_duties').select('id, name').eq('period_id', PERIOD)

  console.log('\n=== FORM ÖRNEK DOĞRULAMA (deploy sonrası beklenen) ===\n')

  for (const s of SAMPLES) {
    const { data: ev } = await sb.from('users').select('id').eq('name', s.evaluator).maybeSingle()
    const { data: tg } = await sb.from('users').select('id').eq('name', s.target).maybeSingle()
    if (!ev || !tg) {
      console.log(`SKIP ${s.evaluator} → ${s.target} (kullanıcı yok)`)
      continue
    }
    const { data: asg } = await sb
      .from('evaluation_assignments')
      .select('id, status')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ev.id)
      .eq('target_id', tg.id)
      .eq('matrix_context', s.ctx)
      .maybeSingle()

    const duty = findDutyId(duties || [], s.ctx)
    const qs = duty ? await questionsForDuty(sb, duty.id) : []
    const cats = [...new Set(qs.map((q) => q.question_categories?.name || '?'))]

    console.log(`${s.evaluator} → ${s.target} [${s.ctx}]`)
    console.log(`  atama: ${asg ? asg.id + ' (' + asg.status + ')' : 'YOK'}`)
    console.log(`  paket: ${duty?.name || '?'} | ${qs.length} soru`)
    console.log(`  kategoriler: ${cats.join(' | ')}`)
    console.log(`  örnek soru: ${(qs[0]?.text || '').slice(0, 70)}…`)
    console.log('')
  }

  console.log('Canlı test: https://visio360pds.vercel.app (gizli pencere + taslak temiz)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
