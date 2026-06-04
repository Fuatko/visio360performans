#!/usr/bin/env node
/** Genel atamalarda eski «48 cevaplanmamış» uyarısı — kimler etkilenirdi */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      const k = m[1]
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  }
}

loadEnv()

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const PERIOD = process.argv[2] || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const supabase = createClient(url, key)

async function main() {
  const { data: epq, error: e1 } = await supabase
    .from('evaluation_period_questions')
    .select('question_id')
    .eq('period_id', PERIOD)
    .eq('is_active', true)
  if (e1) throw e1

  const { data: epdc, error: e2 } = await supabase
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', PERIOD)
    .eq('is_active', true)
  if (e2) throw e2

  const dutyCat = new Set((epdc || []).map((r) => String(r.category_id)))
  const qIds = [...new Set((epq || []).map((r) => String(r.question_id)))]

  const { data: questions, error: e3 } = await supabase
    .from('questions')
    .select('id, category_id')
    .in('id', qIds)
  if (e3) throw e3

  let dogru = 0
  let fazla = 0
  for (const q of questions || []) {
    const cid = String(q.category_id || '')
    if (dutyCat.has(cid)) fazla++
    else dogru++
  }

  console.log('\n=== Dönem özeti ===')
  console.log({ toplam_donem_soru: qIds.length, beklenen_genel_soru: dogru, eski_hatali_fazla_soru: fazla })

  const { data: assignments, error: e4 } = await supabase
    .from('evaluation_assignments')
    .select('id, evaluator_id, target_id, status, matrix_context')
    .eq('period_id', PERIOD)
  if (e4) throw e4

  const genel = (assignments || []).filter((a) => (a.matrix_context || 'genel') === 'genel')
  const pending = genel.filter((a) => a.status !== 'completed')
  const with48 = genel.filter(() => fazla === 48)

  console.log('\n=== Genel atamalar ===')
  console.log({
    toplam_genel: genel.length,
    bekleyen: pending.length,
    tamamlanan: genel.length - pending.length,
    eski_uyari_fazla: fazla,
  })

  const userIds = [...new Set(genel.flatMap((a) => [a.evaluator_id, a.target_id]))]
  const { data: users, error: e5 } = await supabase.from('users').select('id, name').in('id', userIds)
  if (e5) throw e5
  const nameBy = new Map((users || []).map((u) => [u.id, u.name]))

  const rows = genel
    .map((a) => ({
      degerlendiren: nameBy.get(a.evaluator_id) || a.evaluator_id,
      hedef: nameBy.get(a.target_id) || a.target_id,
      status: a.status,
      beklenen_genel_soru: dogru,
      eski_fazla: fazla,
      assignment_id: a.id,
    }))
    .sort((a, b) => String(a.degerlendiren).localeCompare(String(b.degerlendiren), 'tr'))

  console.log(`\n=== Etkilenen genel atamalar (hepsi aynı ${fazla} fazla uyarısı) — ${rows.length} kayıt ===`)
  for (const r of rows.filter((r) => r.status !== 'completed').slice(0, 30)) {
    console.log(`  [${r.status}] ${r.degerlendiren} → ${r.hedef} (form ~${r.beklenen_genel_soru})`)
  }
  if (pending.length > 30) console.log(`  ... +${pending.length - 30} bekleyen daha`)

  const dilara = rows.filter((r) => /dilara/i.test(r.hedef) && /adaş|adas/i.test(r.hedef))
  if (dilara.length) {
    console.log('\n=== Dilara ADAŞ ===')
    for (const r of dilara) console.log(r)
  }

  const enderDilara = rows.find(
    (r) => /ender/i.test(r.degerlendiren) && /dilara/i.test(r.hedef)
  )
  if (enderDilara) {
    console.log('\n=== Ender → Dilara ===')
    console.log(enderDilara)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
