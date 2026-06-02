#!/usr/bin/env node
/**
 * Dönemdeki tüm matrix_context değerlerini listeler; tanımlı yan görev presetleriyle karşılaştırır.
 * Usage: node scripts/audit-duty-matrix-contexts.mjs [period_id]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const DUTY_PRESETS = [
  'zumre',
  'sinif_ogretmeni',
  'rehberlik_ogretmeni',
  'nobetci_ogretmeni',
  'kulup_ogretmeni',
  'formator',
  'yasam_koordinatoru',
  'bilimsel_etkinlik_koordinatoru',
]

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
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
const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const periodId = process.argv[2] || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const PAGE = 1000
let from = 0
const rows = []
for (;;) {
  const { data, error } = await sb
    .from('evaluation_assignments')
    .select('matrix_context, status')
    .eq('period_id', periodId)
    .range(from, from + PAGE - 1)
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  rows.push(...(data || []))
  if ((data || []).length < PAGE) break
  from += PAGE
}

const byCtx = new Map()
for (const r of rows) {
  const ctx = String(r.matrix_context || 'genel').trim() || 'genel'
  const cur = byCtx.get(ctx) || { total: 0, completed: 0, pending: 0 }
  cur.total += 1
  if (r.status === 'completed') cur.completed += 1
  else cur.pending += 1
  byCtx.set(ctx, cur)
}

console.log('period_id', periodId)
console.log('assignments_total', rows.length)
console.log('')
console.log('matrix_context | atama | tamamlanan | bekleyen | preset_taniniyor')
for (const [ctx, c] of [...byCtx.entries()].sort((a, b) => b[1].total - a[1].total)) {
  const known = ctx === 'genel' || ctx === 'okul_yasam' || DUTY_PRESETS.includes(ctx)
  const custom = !known && /^[a-z][a-z0-9_]{1,48}$/i.test(ctx)
  const flag = known ? 'EVET' : custom ? 'OZEL_CODE' : 'BILINMEYEN'
  console.log(`${ctx} | ${c.total} | ${c.completed} | ${c.pending} | ${flag}`)
}

const missingCtx = rows.filter((r) => r.matrix_context == null || String(r.matrix_context).trim() === '')
if (missingCtx.length) {
  console.log('\nUYARI: matrix_context bos/null atama:', missingCtx.length)
}
