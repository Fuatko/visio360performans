#!/usr/bin/env node
/**
 * Evren SAĞBİLİ — dönemdeki tüm hedef-atamalarını kaldırır.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/remove-evren-sagbili-assignments.mjs
 *
 * SQL alternatifi: sql/fix-evren-sagbili-remove-all-assignments.sql
 */
import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const PERIOD_ID = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const TARGET_NAME = 'Evren SAĞBİLİ'
const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv(path) {
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
  ...loadEnv(join(__dirname, '../.env.local')),
  ...loadEnv(join(__dirname, '../.env.runtime')),
  ...process.env,
}

const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli')
  process.exit(1)
}

const sb = createClient(url, key)

const { data: user, error: uErr } = await sb.from('users').select('id').eq('name', TARGET_NAME).maybeSingle()
if (uErr || !user?.id) {
  console.error('Kullanıcı bulunamadı:', TARGET_NAME, uErr?.message)
  process.exit(1)
}

const targetId = user.id

const { data: assignments, error: aErr } = await sb
  .from('evaluation_assignments')
  .select('id')
  .eq('period_id', PERIOD_ID)
  .eq('target_id', targetId)
if (aErr) {
  console.error(aErr.message)
  process.exit(1)
}

const ids = (assignments || []).map((r) => r.id)
console.log('atama_sayisi', ids.length)

if (ids.length) {
  await sb.from('evaluation_responses').delete().in('assignment_id', ids)
  await sb.from('international_standard_scores').delete().in('assignment_id', ids)
  const { error: delA } = await sb.from('evaluation_assignments').delete().in('id', ids)
  if (delA) {
    console.error('assignments delete:', delA.message)
    process.exit(1)
  }
}

await sb
  .from('evaluation_period_evaluator_target_categories')
  .delete()
  .eq('period_id', PERIOD_ID)
  .eq('target_id', targetId)
await sb
  .from('evaluation_period_evaluator_target_scope')
  .delete()
  .eq('period_id', PERIOD_ID)
  .eq('target_id', targetId)
await sb.from('evaluation_period_user_duties').delete().eq('period_id', PERIOD_ID).eq('user_id', targetId)

const { count } = await sb
  .from('evaluation_assignments')
  .select('id', { count: 'exact', head: true })
  .eq('period_id', PERIOD_ID)
  .eq('target_id', targetId)

console.log('kalan_atama', count ?? 0)
console.log('done')
