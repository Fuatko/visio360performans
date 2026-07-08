#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

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

  const { data: epdc } = await sb
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', PERIOD)
    .eq('is_active', true)
  const dutyCats = new Set((epdc || []).map((r) => String(r.category_id)))

  const { data: snapQs } = await sb
    .from('evaluation_period_questions_snapshot')
    .select('id, category_id, sort_order')
    .eq('period_id', PERIOD)
    .order('sort_order')

  const { data: cats } = await sb
    .from('evaluation_period_categories_snapshot')
    .select('id, name, sort_order')
    .eq('period_id', PERIOD)

  const catName = new Map((cats || []).map((c) => [String(c.id), c.name]))
  const byCat = new Map()
  for (const q of snapQs || []) {
    const c = String(q.category_id)
    if (dutyCats.has(c)) continue
    if (!byCat.has(c)) byCat.set(c, [])
    byCat.get(c).push(String(q.id))
  }

  console.log('=== Standart genel havuzu (yan görev kat. hariç) ===\n')
  const rows = []
  for (const [cid, qids] of byCat) {
    rows.push({ name: catName.get(cid) || cid, count: qids.length, id: cid })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  let total = 0
  for (const r of rows) {
    total += r.count
    console.log(`${r.name}: ${r.count} soru`)
  }
  console.log(`\nToplam: ${rows.length} kategori, ${total} soru`)

  // 9-cat beklenen (Paul tam genel — kapsam kaydı yok)
  // Locked 8+1: add Mesleki Gelişim for 9?
  const beklenen9names = [
    'Mesleki Sorumluluk',
    'Pedagojik Yetkinlik',
    'Ölçme',
    'Teknolojik',
    'Veli İletişimi',
    'Öğrenci İlişkileri',
    'Proje',
    'Kurum İçi İletişim',
    'Mesleki Gelişim',
  ]
  console.log('\n=== 9 kategori eşleştirme (isim araması) ===')
  const matched = []
  for (const want of beklenen9names) {
    const hit = rows.find((r) => r.name.toLowerCase().includes(want.toLowerCase().split(' ')[0]))
    if (hit) matched.push(hit)
    console.log(`  ${want} → ${hit ? `${hit.name} (${hit.count} soru)` : 'BULUNAMADI'}`)
  }

  // 1 soru/kategori seçimi → 9 soru
  let nineQ = 0
  console.log('\n=== 9 soru modeli (her kategoriden 1. soru) ===')
  for (const m of matched) {
    console.log(`  ${m.name}: 1 soru`)
    nineQ++
  }
  console.log(`Toplam: ${nineQ} soru`)

  // Ayşegül wrong 5 vs beklenen 9
  const wrong5 = [
    'Kurum İçi İletişim ve İşbirliği',
    'Veli İletişimi',
    'Öğrenci İlişkileri ve Empati',
    'Proje, Etkinlik ve Kurumsal Katkı',
    'Mesleki Sorumluluk',
  ]
  console.log('\n=== Ayşegül mevcut 5 kategori (YANLIŞ — MD hedef modeli sızıntısı?) ===')
  wrong5.forEach((n) => console.log(`  - ${n}`))
  console.log('\nEksik (9 için): Pedagojik, Ölçme, Teknolojik (+ belki Mesleki Gelişim)')
  console.log('Fazla yanlış eşleşme: 5-kat = MD→Onur/Ayşegül HEDEF modeli, OUT modeli değil')
}

main()
