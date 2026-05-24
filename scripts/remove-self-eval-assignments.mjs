#!/usr/bin/env node
/**
 * Tüm öz değerlendirme atamalarını (evaluator_id = target_id) siler.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/remove-self-eval-assignments.mjs
 *   PERIOD_ID=uuid USER_ID=uuid node scripts/remove-self-eval-assignments.mjs --dry-run
 *   PERIOD_ID=uuid USER_ID=uuid node scripts/remove-self-eval-assignments.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const periodId = (process.env.PERIOD_ID || '').trim()
const userId = (process.env.USER_ID || '').trim()
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply')

if (!url || !key) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli')
  process.exit(1)
}
if (!periodId || !userId) {
  console.error('PERIOD_ID ve USER_ID zorunlu (yalnızca tek kişinin öz ataması)')
  process.exit(1)
}

const supabase = createClient(url.replace(/\/$/, ''), key)

function idsEqual(a, b) {
  const sa = String(a ?? '').trim()
  const sb = String(b ?? '').trim()
  if (!sa || !sb) return false
  if (sa === sb) return true
  if (sa.toLowerCase() === sb.toLowerCase()) return true
  const na = sa.replace(/-/g, '').toLowerCase()
  const nb = sb.replace(/-/g, '').toLowerCase()
  return na.length >= 32 && nb.length >= 32 && na === nb
}

async function main() {
  const PAGE = 1000
  const selfRows = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('evaluation_assignments')
      .select('id, period_id, evaluator_id, target_id, status, matrix_context')
      .eq('period_id', periodId)
      .range(from, from + PAGE - 1)
    if (error) throw error
    const page = data || []
    for (const row of page) {
      if (!idsEqual(row.evaluator_id, row.target_id)) continue
      if (!idsEqual(row.evaluator_id, userId)) continue
      selfRows.push(row)
    }
    if (page.length < PAGE) break
    from += PAGE
  }

  console.log(`Öz atama: ${selfRows.length}${dryRun ? ' (dry-run)' : ''}`)
  for (const r of selfRows.slice(0, 50)) {
    console.log(`  ${r.id} period=${r.period_id} status=${r.status} ctx=${r.matrix_context || 'genel'}`)
  }
  if (selfRows.length > 50) console.log(`  ... +${selfRows.length - 50} daha`)

  if (dryRun || !selfRows.length) return

  const ids = selfRows.map((r) => r.id)
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    await supabase.from('evaluation_responses').delete().in('assignment_id', chunk)
    try {
      await supabase.from('international_standard_scores').delete().in('assignment_id', chunk)
    } catch {
      /* tablo yoksa atla */
    }
    const { error } = await supabase.from('evaluation_assignments').delete().in('id', chunk)
    if (error) throw error
  }
  console.log(`Silindi: ${ids.length} atama`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
