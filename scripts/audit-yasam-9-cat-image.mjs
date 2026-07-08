#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const DUTY_ID = 'e8fa6928-4a58-4dd4-aa1e-2352bf3bbdae'
const CAT9 = [
  'Prosedür ve Süreç Tasarımı',
  'Sorun Çözme ve Operasyonel Etkinlik',
  'Süreç Takibi ve Raporlama',
  'Nöbet Sistemi Yönetimi',
  'Kulüp ve Etkinlik Koordinasyonu',
  'Acil ve Son Dakika Düzenlemeler',
  'Müdür Yardımcılarıyla İşbirliği',
  'Veli-Öğretmen Görüşme Organizasyonu',
  'Okul Yaşam Alanları & Güvenlik',
]

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.local', '.env']) {
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

async function main() {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  // Duty package categories in DB
  const { data: duty } = await sb.from('evaluation_duties').select('id, name, code').eq('id', DUTY_ID).single()
  console.log('Görev paketi:', duty)

  const { data: dutyCats } = await sb
    .from('categories')
    .select('id, name, parent_id')
    .eq('parent_id', 'a629925c-bfd6-4db6-aa24-90a0be29ce6d')

  console.log('\n=== DB alt kategoriler (yaşam koordinatörü) ===')
  for (const want of CAT9) {
    const hit = (dutyCats || []).find((c) => c.name === want || c.name.includes(want.slice(0, 15)))
    console.log(`  ${want}: ${hit ? hit.id : 'YOK'}`)
  }

  const { data: dutyQ } = await sb
    .from('evaluation_period_duty_questions')
    .select('question_id, duty_id')
    .eq('period_id', PERIOD)
    .eq('duty_id', DUTY_ID)
    .eq('is_active', true)
  console.log(`\nDönem duty soru bağlantısı: ${dutyQ?.length || 0}`)

  if (dutyQ?.length) {
    const qids = dutyQ.map((r) => r.question_id)
    const { data: qs } = await sb.from('questions').select('id, category_id, text').in('id', qids)
    const catIds = [...new Set((qs || []).map((q) => q.category_id))]
    const { data: cats } = await sb.from('categories').select('id, name').in('id', catIds)
    const catBy = new Map((cats || []).map((c) => [c.id, c.name]))
    console.log('\nDuty soruları kategori bazlı:')
    const byCat = new Map()
    for (const q of qs || []) {
      const n = catBy.get(q.category_id) || '?'
      byCat.set(n, (byCat.get(n) || 0) + 1)
    }
    for (const [n, c] of byCat) console.log(`  ${n}: ${c} soru`)
    console.log(`  TOPLAM: ${qs?.length} soru, ${byCat.size} kategori`)
  }

  const { data: users } = await sb.from('users').select('id, name').in('name', ['Onur ERMAN', 'Ayşegül KAZMAZ'])
  const by = Object.fromEntries((users || []).map((u) => [u.name, u.id]))

  for (const name of ['Onur ERMAN', 'Ayşegül KAZMAZ']) {
    const eid = by[name]
    console.log(`\n=== ${name} — yasam_koordinatoru EVALUATOR (OUT) ===`)
    const { count } = await sb
      .from('evaluation_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('period_id', PERIOD)
      .eq('evaluator_id', eid)
      .eq('matrix_context', 'yasam_koordinatoru')
    console.log(`  OUT atama: ${count}`)

    const { count: tgt } = await sb
      .from('evaluation_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('period_id', PERIOD)
      .eq('target_id', eid)
      .eq('matrix_context', 'yasam_koordinatoru')
    console.log(`  TARGET atama: ${tgt}`)

    // sample OUT if any
    const { data: sample } = await sb
      .from('evaluation_assignments')
      .select('id, target_id, status')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', eid)
      .eq('matrix_context', 'yasam_koordinatoru')
      .limit(3)
    for (const a of sample || []) {
      const { data: tg } = await sb.from('users').select('name').eq('id', a.target_id).single()
      const { count: rc } = await sb.from('evaluation_responses').select('id', { count: 'exact', head: true }).eq('assignment_id', a.id)
      console.log(`    → ${tg?.name} (${a.status}): ${rc} cevap`)
    }
  }

  // Who evaluates with yasam_koordinatoru as evaluator
  console.log('\n=== yasam_koordinatoru — kim değerlendiriyor? ===')
  const { data: yasamAsg } = await sb
    .from('evaluation_assignments')
    .select('evaluator_id')
    .eq('period_id', PERIOD)
    .eq('matrix_context', 'yasam_koordinatoru')
    .limit(500)
  const evalIds = [...new Set((yasamAsg || []).map((r) => r.evaluator_id))]
  const { data: evs } = await sb.from('users').select('name').in('id', evalIds)
  const names = (evs || []).map((e) => e.name).sort()
  console.log(names.join(', '))
}

main()
