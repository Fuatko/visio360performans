#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

const BEKLENEN8 = [
  'Mesleki Sorumluluk',
  'Pedagojik Yetkinlik',
  'Ölçme ve Değerlendirme',
  'Teknolojik Yetkinlikler',
  'Veli İletişimi',
  'Öğrenci İlişkileri ve Empati',
  'Proje, Etkinlik ve Kurumsal Katkı',
  'Kurum İçi İletişim ve İşbirliği',
]

const BEKLENEN9 = [...BEKLENEN8, 'Mesleki Gelişim']

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

async function resolveCats(sb, names) {
  const { data: cats } = await sb
    .from('evaluation_period_categories_snapshot')
    .select('id, name')
    .eq('period_id', PERIOD)
  const out = []
  for (const want of names) {
    const hit = (cats || []).find((c) => {
      const n = c.name
      if (n === want) return true
      if (want.startsWith('Pedagojik') && n.toLowerCase().startsWith('pedagojik')) return true
      if (want.startsWith('Ölçme') && (n.includes('Ölçme') || n.includes('olcme'))) return true
      if (want.startsWith('Kurum İçi') && n.includes('Kurum') && n.includes('İletişim')) return true
      if (want.startsWith('Proje') && n.startsWith('Proje')) return true
      return false
    })
    if (hit) out.push(hit)
  }
  return out
}

async function countQs(sb, catIds, onePerCat = false) {
  const { data: qs } = await sb
    .from('evaluation_period_questions_snapshot')
    .select('id, category_id, sort_order')
    .eq('period_id', PERIOD)
    .in('category_id', catIds)
    .order('sort_order')
  if (!onePerCat) return qs?.length || 0
  const seen = new Set()
  let n = 0
  for (const q of qs || []) {
    const c = String(q.category_id)
    if (seen.has(c)) continue
    seen.add(c)
    n++
  }
  return n
}

async function main() {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  const c8 = await resolveCats(sb, BEKLENEN8)
  const c9 = await resolveCats(sb, BEKLENEN9)

  console.log('=== KİLİTLİ 8 KATEGORİ (repo/SQL) ===')
  c8.forEach((c) => console.log(`  ${c.name}`))
  console.log(`  Soru (tümü): ${await countQs(sb, c8.map((c) => c.id), false)}`)
  console.log(`  Soru (1/kat): ${await countQs(sb, c8.map((c) => c.id), true)}`)

  console.log('\n=== 9 KATEGORİ (+ Mesleki Gelişim) ===')
  c9.forEach((c) => console.log(`  ${c.name}`))
  console.log(`  Soru (tümü): ${await countQs(sb, c9.map((c) => c.id), false)}`)
  console.log(`  Soru (1/kat): ${await countQs(sb, c9.map((c) => c.id), true)}`)

  // Onur missing assignments vs Ayşegül
  const { data: users } = await sb.from('users').select('id, name').in('name', ['Onur ERMAN', 'Ayşegül KAZMAZ', 'Paul GEORGES'])
  const by = Object.fromEntries((users || []).map((u) => [u.name, u.id]))

  const { data: aysegulTargets } = await sb
    .from('evaluation_assignments')
    .select('target_id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', by['Ayşegül KAZMAZ'])
    .eq('matrix_context', 'genel')

  const { data: onurTargets } = await sb
    .from('evaluation_assignments')
    .select('target_id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', by['Onur ERMAN'])
    .eq('matrix_context', 'genel')

  const aSet = new Set((aysegulTargets || []).map((r) => r.target_id))
  const oSet = new Set((onurTargets || []).map((r) => r.target_id))
  const onlyAysegul = [...aSet].filter((id) => !oSet.has(id))

  console.log(`\n=== Onur eksik genel atamaları ===`)
  console.log(`Ayşegül genel hedef: ${aSet.size}`)
  console.log(`Onur genel hedef: ${oSet.size}`)
  console.log(`Onur'da eksik (Ayşegül'de var): ${onlyAysegul.length}`)

  if (onlyAysegul.length > 0 && onlyAysegul.length <= 10) {
    const { data: names } = await sb.from('users').select('name').in('id', onlyAysegul.slice(0, 10))
    console.log('Örnek eksik:', (names || []).map((n) => n.name).join(', '))
  }
}

main()
