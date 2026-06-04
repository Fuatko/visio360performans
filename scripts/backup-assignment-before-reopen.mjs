#!/usr/bin/env node
/**
 * Tek bir değerlendirme atamasını yeniden açmadan ÖNCE yedekler.
 *
 * Çıktı: backups/assignments/<timestamp>_<degerlendiren>_<hedef>_<context>.json
 *
 * Örnek:
 *   node scripts/backup-assignment-before-reopen.mjs --assignment-id e55d4e0d-0120-4e55-89a0-d0ef6fd16836
 *   node scripts/backup-assignment-before-reopen.mjs --evaluator "Ender ÜSTÜNGEL" --target "Baran YILDIZ" --context kulup_ogretmeni
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getSupabaseClient } from './_load-env.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

function parseArgs(argv) {
  const out = { periodId: DEFAULT_PERIOD }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--assignment-id') out.assignmentId = argv[++i]
    else if (a === '--evaluator') out.evaluatorName = argv[++i]
    else if (a === '--target') out.targetName = argv[++i]
    else if (a === '--context') out.matrixContext = argv[++i]
    else if (a === '--period-id') out.periodId = argv[++i]
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

function slug(s) {
  return String(s || 'unknown')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
}

async function resolveAssignmentId(sb, opts) {
  if (opts.assignmentId) return opts.assignmentId

  if (!opts.evaluatorName || !opts.targetName || !opts.matrixContext) {
    throw new Error('--assignment-id veya (--evaluator + --target + --context) gerekli')
  }

  const { data: evaluators } = await sb.from('users').select('id,name').ilike('name', `%${opts.evaluatorName.split(' ')[0]}%`)
  const ev = (evaluators || []).find((u) =>
    u.name.toLocaleLowerCase('tr-TR').includes(opts.evaluatorName.split(' ')[0].toLocaleLowerCase('tr-TR'))
  )
  if (!ev) throw new Error(`Değerlendiren bulunamadı: ${opts.evaluatorName}`)

  const { data: targets } = await sb.from('users').select('id,name').ilike('name', `%${opts.targetName.split(' ').pop()}%`)
  const tg = (targets || []).find((u) => {
    const n = u.name.toLocaleLowerCase('tr-TR')
    const parts = opts.targetName.toLocaleLowerCase('tr-TR').split(/\s+/)
    return parts.every((p) => n.includes(p))
  })
  if (!tg) throw new Error(`Hedef bulunamadı: ${opts.targetName}`)

  const { data: rows, error } = await sb
    .from('evaluation_assignments')
    .select('id')
    .eq('period_id', opts.periodId)
    .eq('evaluator_id', ev.id)
    .eq('target_id', tg.id)
    .eq('matrix_context', opts.matrixContext)
    .maybeSingle()

  if (error) throw error
  if (!rows?.id) {
    throw new Error(
      `Atama yok: ${ev.name} → ${tg.name} (${opts.matrixContext}) dönem ${opts.periodId}`
    )
  }
  return rows.id
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) {
    console.log(`Kullanım:
  node scripts/backup-assignment-before-reopen.mjs --assignment-id <uuid>
  node scripts/backup-assignment-before-reopen.mjs --evaluator "..." --target "..." --context genel|kulup_ogretmeni|...
`)
    process.exit(0)
  }

  const sb = await getSupabaseClient()
  const assignmentId = await resolveAssignmentId(sb, opts)

  const { data: assignment, error: aErr } = await sb
    .from('evaluation_assignments')
    .select(
      '*, evaluator:evaluator_id(id,name), target:target_id(id,name), evaluation_periods(id,name,status)'
    )
    .eq('id', assignmentId)
    .maybeSingle()
  if (aErr) throw aErr
  if (!assignment) throw new Error(`Atama bulunamadı: ${assignmentId}`)

  const [{ data: responses, error: rErr }, { data: standards, error: sErr }] = await Promise.all([
    sb.from('evaluation_responses').select('*').eq('assignment_id', assignmentId),
    sb.from('international_standard_scores').select('*').eq('assignment_id', assignmentId),
  ])
  if (rErr) throw rErr
  if (sErr && String(sErr.code || '') !== '42P01') throw sErr

  const exportedAt = new Date().toISOString()
  const payload = {
    backup_kind: 'assignment_reopen_snapshot',
    exported_at: exportedAt,
    assignment_id: assignmentId,
    period_id: assignment.period_id,
    matrix_context: assignment.matrix_context,
    assignment,
    evaluation_responses: responses || [],
    international_standard_scores: standards || [],
    meta: {
      evaluator_name: assignment.evaluator?.name || null,
      target_name: assignment.target?.name || null,
      response_count: (responses || []).length,
      standard_score_count: (standards || []).length,
      status_at_backup: assignment.status,
      completed_at_at_backup: assignment.completed_at,
    },
  }

  const dir = resolve(root, 'backups/assignments')
  mkdirSync(dir, { recursive: true })
  const fileName = [
    exportedAt.replace(/[:.]/g, '-').slice(0, 19),
    slug(assignment.evaluator?.name),
    slug(assignment.target?.name),
    slug(assignment.matrix_context),
  ].join('_') + '.json'
  const filePath = resolve(dir, fileName)
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')

  console.log('✓ Atama yedeği alındı')
  console.log('  dosya:', filePath)
  console.log('  atama:', assignmentId)
  console.log('  çift:', `${assignment.evaluator?.name} → ${assignment.target?.name}`)
  console.log('  bağlam:', assignment.matrix_context)
  console.log('  durum:', assignment.status, '| yanıt:', payload.meta.response_count)
  console.log('')
  console.log('Sonraki adım (yeniden aç):')
  console.log(`  node scripts/reopen-evaluation-assignment.mjs --assignment-id ${assignmentId} --backup-file "${filePath}"`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
