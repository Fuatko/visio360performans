#!/usr/bin/env node
/**
 * Onur ERMAN & Ayşegül KAZMAZ — tüm yasam_koordinatoru atamalarını yeniden açar
 * (eski yanıtlar silinir → yeni 9 soruluk form).
 *
 *   node scripts/reopen-onur-aysegul-yasam-all.mjs
 *   node scripts/reopen-onur-aysegul-yasam-all.mjs --apply
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getSupabaseClient } from './_load-env.mjs'

const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const TARGETS = ['Onur ERMAN', 'Ayşegül KAZMAZ']
const MATRIX = 'yasam_koordinatoru'
const APPLY = process.argv.includes('--apply')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const sb = await getSupabaseClient()

  const { data: targetUsers, error: tErr } = await sb.from('users').select('id,name').in('name', TARGETS)
  if (tErr) throw tErr
  if ((targetUsers || []).length !== 2) throw new Error('Onur veya Ayşegül bulunamadı')

  const targetIds = targetUsers.map((u) => u.id)

  const { data: assignments, error: aErr } = await sb
    .from('evaluation_assignments')
    .select(
      'id,status,completed_at,slug,evaluator:evaluator_id(name),target:target_id(name)'
    )
    .eq('period_id', PERIOD)
    .eq('matrix_context', MATRIX)
    .in('target_id', targetIds)
  if (aErr) throw aErr

  const ids = (assignments || []).map((a) => a.id)
  if (!ids.length) throw new Error('yasam_koordinatoru ataması yok')

  const respCounts = {}
  for (const id of ids) {
    const { count } = await sb
      .from('evaluation_responses')
      .select('id', { count: 'exact', head: true })
      .eq('assignment_id', id)
    respCounts[id] = count ?? 0
  }

  const summary = {
    tamamlanan: (assignments || []).filter((a) => a.status === 'completed').length,
    bekleyen: (assignments || []).filter((a) => a.status !== 'completed').length,
    toplam_yanit: Object.values(respCounts).reduce((s, n) => s + n, 0),
  }

  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run')
  console.log(summary)
  for (const a of assignments || []) {
    console.log(
      `  ${a.status.padEnd(9)} ${a.evaluator?.name} → ${a.target?.name} | yanıt: ${respCounts[a.id]}`
    )
  }

  if (!APPLY) {
    console.log('\nUygulamak: node scripts/reopen-onur-aysegul-yasam-all.mjs --apply')
    return
  }

  const backupDir = resolve(root, 'backups/assignments')
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = resolve(backupDir, `${stamp}_onur-aysegul_yasam_koordinatoru_bulk.json`)

  const backupPayload = {
    backup_kind: 'yasam_koordinatoru_bulk_reopen',
    period_id: PERIOD,
    matrix_context: MATRIX,
    targets: TARGETS,
    created_at: new Date().toISOString(),
    assignments: [],
  }

  for (const a of assignments || []) {
    const { data: responses } = await sb.from('evaluation_responses').select('*').eq('assignment_id', a.id)
    backupPayload.assignments.push({
      assignment: a,
      responses: responses || [],
    })
  }
  writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8')
  console.log('\nYedek:', backupPath)

  await sb.from('evaluation_responses').delete().in('assignment_id', ids)
  try {
    await sb.from('international_standard_scores').delete().in('assignment_id', ids)
  } catch {
    /* optional table */
  }

  const { error: uErr } = await sb
    .from('evaluation_assignments')
    .update({ status: 'pending', completed_at: null })
    .in('id', ids)
  if (uErr) throw uErr

  const { data: after } = await sb
    .from('evaluation_assignments')
    .select('id,status')
    .in('id', ids)

  const pendingN = (after || []).filter((r) => r.status === 'pending').length
  const { count: leftResp } = await sb
    .from('evaluation_responses')
    .select('id', { count: 'exact', head: true })
    .in('assignment_id', ids)

  console.log('\nSonuç:', {
    atama: ids.length,
    pending: pendingN,
    kalan_yanit: leftResp ?? 0,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
