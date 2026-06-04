#!/usr/bin/env node
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
  process.exit(1)
}

const PERIOD_ID = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const ASSIGNMENT_ID = '13291cb5-98b8-4980-8525-e1b7048138b2'

const sb = createClient(url, key)
await sb.from('evaluation_responses').delete().eq('assignment_id', ASSIGNMENT_ID)
await sb.from('international_standard_scores').delete().eq('assignment_id', ASSIGNMENT_ID)
const { error, count } = await sb
  .from('evaluation_assignments')
  .delete({ count: 'exact' })
  .eq('id', ASSIGNMENT_ID)
  .eq('period_id', PERIOD_ID)

if (error) {
  console.error('delete failed:', error.message)
  process.exit(1)
}

const { count: selfLeft } = await sb
  .from('evaluation_assignments')
  .select('id', { count: 'exact', head: true })
  .eq('period_id', PERIOD_ID)
  .filter('evaluator_id', 'eq', 'target_id')

console.log('deleted_count', count ?? 1)
console.log('self_assignments_left_in_period', selfLeft ?? 0)
console.log('period', PERIOD_ID)
console.log('assignment', ASSIGNMENT_ID)
console.log('done')
