#!/usr/bin/env node
/**
 * Değerlendirme atamasını yeniden açar (yanıtları siler, pending yapar).
 * Varsayılan: önce otomatik yedek alır. --skip-backup ile atlanabilir (önerilmez).
 *
 * Örnek:
 *   node scripts/reopen-evaluation-assignment.mjs --evaluator "Ender ÜSTÜNGEL" --target "Baran YILDIZ" --context kulup_ogretmeni
 *   node scripts/reopen-evaluation-assignment.mjs --assignment-id <uuid> --dry-run
 */
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getSupabaseClient } from './_load-env.mjs'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

function parseArgs(argv) {
  const out = { periodId: DEFAULT_PERIOD, skipBackup: false, dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--assignment-id') out.assignmentId = argv[++i]
    else if (a === '--evaluator') out.evaluatorName = argv[++i]
    else if (a === '--target') out.targetName = argv[++i]
    else if (a === '--context') out.matrixContext = argv[++i]
    else if (a === '--period-id') out.periodId = argv[++i]
    else if (a === '--backup-file') out.backupFile = argv[++i]
    else if (a === '--skip-backup') out.skipBackup = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
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

  const { data: row, error } = await sb
    .from('evaluation_assignments')
    .select('id')
    .eq('period_id', opts.periodId)
    .eq('evaluator_id', ev.id)
    .eq('target_id', tg.id)
    .eq('matrix_context', opts.matrixContext)
    .maybeSingle()
  if (error) throw error
  if (!row?.id) throw new Error(`Atama bulunamadı: ${ev.name} → ${tg.name} (${opts.matrixContext})`)
  return row.id
}

function runBackup(opts, assignmentId) {
  const args = [resolve(scriptsDir, 'backup-assignment-before-reopen.mjs'), '--assignment-id', assignmentId]
  if (opts.periodId !== DEFAULT_PERIOD) args.push('--period-id', opts.periodId)
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: resolve(scriptsDir, '..') })
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout)
    throw new Error('Yedek alınamadı — yeniden açma iptal edildi')
  }
  console.log(r.stdout)
  const match = (r.stdout || '').match(/dosya:\s*(.+)/)
  return match ? match[1].trim() : null
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help) {
    console.log(`Kullanım:
  node scripts/reopen-evaluation-assignment.mjs --assignment-id <uuid>
  node scripts/reopen-evaluation-assignment.mjs --evaluator "..." --target "..." --context kulup_ogretmeni

Seçenekler:
  --backup-file <path>   Yedek zaten alındıysa (tekrar almaz)
  --skip-backup          Yedeksiz aç (önerilmez)
  --dry-run              Sadece durumu göster, değiştirme
`)
    process.exit(0)
  }

  const sb = await getSupabaseClient()
  const assignmentId = await resolveAssignmentId(sb, opts)

  const { data: before, error: bErr } = await sb
    .from('evaluation_assignments')
    .select('id,status,completed_at,matrix_context,evaluator:evaluator_id(name),target:target_id(name)')
    .eq('id', assignmentId)
    .single()
  if (bErr) throw bErr

  const { count: respBefore } = await sb
    .from('evaluation_responses')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)

  console.log('=== Yeniden açma öncesi ===')
  console.log('  atama:', assignmentId)
  console.log('  çift:', `${before.evaluator?.name} → ${before.target?.name}`)
  console.log('  bağlam:', before.matrix_context)
  console.log('  durum:', before.status, '| yanıt:', respBefore ?? 0)

  if (opts.dryRun) {
    console.log('\n(dry-run — değişiklik yapılmadı)')
    return
  }

  let backupFile = opts.backupFile
  if (!opts.skipBackup && !backupFile) {
    console.log('\n=== Yedek alınıyor ===')
    backupFile = runBackup(opts, assignmentId)
  } else if (backupFile && !existsSync(backupFile)) {
    throw new Error(`Yedek dosyası bulunamadı: ${backupFile}`)
  } else if (opts.skipBackup) {
    console.warn('\n⚠ --skip-backup: yedek alınmadan devam ediliyor')
  }

  console.log('\n=== Yeniden açılıyor ===')
  const { error: d1 } = await sb.from('evaluation_responses').delete().eq('assignment_id', assignmentId)
  if (d1) throw d1
  await sb.from('international_standard_scores').delete().eq('assignment_id', assignmentId)

  const { data: after, error: uErr } = await sb
    .from('evaluation_assignments')
    .update({ status: 'pending', completed_at: null })
    .eq('id', assignmentId)
    .select('id,status,completed_at,matrix_context')
    .single()
  if (uErr) throw uErr

  const { count: respAfter } = await sb
    .from('evaluation_responses')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)

  console.log('✓ Tamamlandı')
  console.log('  durum:', after.status, '| yanıt:', respAfter ?? 0)
  if (backupFile) console.log('  yedek:', backupFile)
  console.log('\nGeri yükleme gerekirse:')
  console.log(`  node scripts/restore-assignment-from-backup.mjs "${backupFile || 'backups/assignments/....json'}"`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
