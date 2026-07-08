#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

const CAT8 = [
  'a41e0b6b-d9f0-476b-aac1-ec7265813643',
  'e54d6a2e-dd67-4e8c-8b48-0456f0b6d9dd',
  '80ab1cea-1d41-4996-bdfc-c3624d12402f',
  '2d2a0881-ac59-43af-b43b-d65df3593475',
  '24265170-2255-4e21-942e-4a70f4e0dd50',
  '3361c52e-abd5-4c9f-b758-defb70a22b51',
  '716e059d-121c-47cc-9c5a-b565a566e9d5',
  '1bbd8465-51d5-47bc-9fbe-eb67701d9d42',
]

const CAT5_AYSEGUL = [
  '1bbd8465-51d5-47bc-9fbe-eb67701d9d42',
  '24265170-2255-4e21-942e-4a70f4e0dd50',
  '3361c52e-abd5-4c9f-b758-defb70a22b51',
  '716e059d-121c-47cc-9c5a-b565a566e9d42',
  'a41e0b6b-d9f0-476b-aac1-ec7265813643',
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

async function countQsInCats(sb, catIds) {
  const { data: snap } = await sb
    .from('evaluation_period_questions_snapshot')
    .select('id, category_id')
    .eq('period_id', PERIOD)
  const set = new Set(catIds.map(String))
  return (snap || []).filter((q) => set.has(String(q.category_id))).length
}

async function main() {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  const q8 = await countQsInCats(sb, CAT8)
  const q5 = await countQsInCats(sb, CAT5_AYSEGUL)
  console.log(`8 kategori modelinde beklenen soru (snapshot): ${q8}`)
  console.log(`Ayşegül'ün mevcut 5 kategori modelinde soru: ${q5}`)
  console.log(`Ayşegül'ün formlarında gerçek yanıt: 13 (DB)`)

  const { count: onurGenel } = await sb
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', (await sb.from('users').select('id').eq('name', 'Onur ERMAN').single()).data.id)
    .eq('matrix_context', 'genel')

  const { count: aysegulGenel } = await sb
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', (await sb.from('users').select('id').eq('name', 'Ayşegül KAZMAZ').single()).data.id)
    .eq('matrix_context', 'genel')

  console.log(`\nOnur genel OUT atama: ${onurGenel} (beklenen ~77)`)
  console.log(`Ayşegül genel OUT atama: ${aysegulGenel} (beklenen ~77)`)
}

main()
