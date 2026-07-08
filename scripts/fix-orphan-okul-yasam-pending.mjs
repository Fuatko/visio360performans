#!/usr/bin/env node
/**
 * Yinelenen pending atamaları temizler:
 * Aynı dönem + değerlendirici + hedef + dilim (genel↔okul_yasam birleşik) için
 * tamamlanmış atama varken, yanıtsız pending kopyayı siler.
 *
 *   node scripts/fix-orphan-okul-yasam-pending.mjs --dry-run
 *   node scripts/fix-orphan-okul-yasam-pending.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const APPLY = process.argv.includes('--apply')

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.paul-fr.tmp', '.env.local', '.env.vercel.prod']) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  }
}
loadEnv()

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('SUPABASE credentials missing')
  process.exit(1)
}
const sb = createClient(url, key)

function sliceKey(ctx) {
  const v = String(ctx || 'genel').trim() || 'genel'
  return v === 'okul_yasam' ? 'genel' : v
}

async function fetchAllPending() {
  const out = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, target_id, matrix_context, status, evaluator:evaluator_id(name), target:target_id(name)')
      .eq('period_id', PERIOD)
      .eq('status', 'pending')
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

async function responseCount(assignmentId) {
  const { count } = await sb
    .from('evaluation_responses')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)
  return count || 0
}

async function main() {
  console.log(`Dönem: ${PERIOD}`)
  console.log(`Mod: ${APPLY ? 'APPLY (silme)' : 'DRY-RUN'}\n`)

  const pending = await fetchAllPending()
  console.log(`Toplam pending: ${pending.length}`)

  const toDelete = []
  for (const p of pending) {
    const sk = sliceKey(p.matrix_context)
    const pendingResponses = await responseCount(p.id)
    if (pendingResponses > 0) {
      console.log(`  ATLA (pending yanıtı var): ${p.evaluator?.name} → ${p.target?.name} [${p.matrix_context || 'genel'}]`)
      continue
    }

    const { data: siblings } = await sb
      .from('evaluation_assignments')
      .select('id, status, matrix_context')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', p.evaluator_id)
      .eq('target_id', p.target_id)
      .eq('status', 'completed')

    const completedInSlice = (siblings || []).filter((s) => sliceKey(s.matrix_context) === sk)
    if (!completedInSlice.length) {
      console.log(`  ATLA (tamamlanmış kardeş yok): ${p.evaluator?.name} → ${p.target?.name} [${p.matrix_context || 'genel'}]`)
      continue
    }

    toDelete.push(p)
    const labels = completedInSlice.map((s) => `${s.matrix_context || 'genel'}:${s.id.slice(0, 8)}`).join(', ')
    console.log(`  SİL: ${p.evaluator?.name} → ${p.target?.name} [${p.matrix_context || 'genel'}] — tamamlanmış kardeş: ${labels}`)
  }

  console.log(`\nSilinecek yinelenen pending: ${toDelete.length}`)
  if (!toDelete.length) return

  if (!APPLY) {
    console.log('\nUygulamak için: node scripts/fix-orphan-okul-yasam-pending.mjs --apply')
    return
  }

  for (const p of toDelete) {
    const { error } = await sb.from('evaluation_assignments').delete().eq('id', p.id)
    if (error) {
      console.error('Silme hatası', p.id, error.message)
      process.exit(1)
    }
  }
  console.log(`\n✓ ${toDelete.length} gereksiz pending atama silindi.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
