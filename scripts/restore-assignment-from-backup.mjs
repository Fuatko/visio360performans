#!/usr/bin/env node
/**
 * backup-assignment-before-reopen.mjs çıktısından tek atamayı geri yükler.
 * Tam DB restore değildir — yalnızca o atamanın yanıtları + durumu.
 *
 * Örnek:
 *   node scripts/restore-assignment-from-backup.mjs backups/assignments/2026-06-03T21-00-00_Ender_Baran_kulup_ogretmeni.json
 *   node scripts/restore-assignment-from-backup.mjs backups/assignments/foo.json --dry-run
 */
import { readFileSync } from 'fs'
import { getSupabaseClient } from './_load-env.mjs'

function parseArgs(argv) {
  const out = { dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--help' || a === '-h') out.help = true
    else if (!a.startsWith('-') && !out.file) out.file = a
  }
  return out
}

async function main() {
  const opts = parseArgs(process.argv)
  if (opts.help || !opts.file) {
    console.log(`Kullanım:
  node scripts/restore-assignment-from-backup.mjs <yedek.json> [--dry-run]
`)
    process.exit(opts.help ? 0 : 1)
  }

  const payload = JSON.parse(readFileSync(opts.file, 'utf8'))
  if (payload.backup_kind !== 'assignment_reopen_snapshot') {
    throw new Error('Geçersiz yedek dosyası (backup_kind assignment_reopen_snapshot olmalı)')
  }

  const assignmentId = String(payload.assignment_id || '')
  if (!assignmentId) throw new Error('assignment_id yok')

  const sb = await getSupabaseClient()

  const { data: current, error: cErr } = await sb
    .from('evaluation_assignments')
    .select('id,status,evaluator:evaluator_id(name),target:target_id(name),matrix_context')
    .eq('id', assignmentId)
    .maybeSingle()
  if (cErr) throw cErr
  if (!current) throw new Error(`Canlı atama bulunamadı: ${assignmentId}`)

  console.log('=== Yedekten geri yükleme ===')
  console.log('  dosya:', opts.file)
  console.log('  yedek tarihi:', payload.exported_at)
  console.log('  çift:', `${payload.meta?.evaluator_name} → ${payload.meta?.target_name}`)
  console.log('  yedekte yanıt:', payload.meta?.response_count ?? payload.evaluation_responses?.length ?? 0)
  console.log('  yedekte durum:', payload.meta?.status_at_backup)

  if (opts.dryRun) {
    console.log('\n(dry-run — değişiklik yapılmadı)')
    return
  }

  await sb.from('evaluation_responses').delete().eq('assignment_id', assignmentId)
  await sb.from('international_standard_scores').delete().eq('assignment_id', assignmentId)

  const responses = payload.evaluation_responses || []
  if (responses.length) {
    const { error: insErr } = await sb.from('evaluation_responses').insert(
      responses.map((r) => {
        const { id, created_at, updated_at, ...rest } = r
        return { ...rest, assignment_id: assignmentId }
      })
    )
    if (insErr) {
      // Eski şema: tüm satırları olduğu gibi dene
      const { error: ins2 } = await sb.from('evaluation_responses').insert(responses)
      if (ins2) throw ins2
    }
  }

  const standards = payload.international_standard_scores || []
  if (standards.length) {
    const { error: stdErr } = await sb.from('international_standard_scores').upsert(
      standards.map((s) => ({ ...s, assignment_id: assignmentId })),
      { onConflict: 'assignment_id,standard_id' }
    )
    if (stdErr && String(stdErr.code || '') !== '42P01') throw stdErr
  }

  const a = payload.assignment || {}
  const { error: uErr } = await sb
    .from('evaluation_assignments')
    .update({
      status: a.status || payload.meta?.status_at_backup || 'completed',
      completed_at: a.completed_at ?? payload.meta?.completed_at_at_backup ?? null,
    })
    .eq('id', assignmentId)
  if (uErr) throw uErr

  const { count } = await sb
    .from('evaluation_responses')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)

  console.log('\n✓ Geri yüklendi')
  console.log('  atama:', assignmentId)
  console.log('  yanıt sayısı:', count ?? 0)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
