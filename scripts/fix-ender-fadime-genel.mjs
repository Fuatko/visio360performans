#!/usr/bin/env node
/**
 * Ender ÜSTÜNGEL + Fadime ALPARSLAN — genel matris düzeltmeleri
 *
 * Ender: değerlendiren (85) tamam; değerlendirilen tarafı eksik (yalnızca Ayşegül, kısmi 13/21).
 * Fadime: değerlendirilen (5); değerlendiren olmamalı (0).
 *
 *   node scripts/fix-ender-fadime-genel.mjs
 *   node scripts/fix-ender-fadime-genel.mjs --apply
 */
import { spawnSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const APPLY = process.argv.includes('--apply')

/** Paul GEORGES ile aynı genel değerlendirici seti + öz değerlendirme */
const ENDER_GENEL_EVALUATORS = [
  'Paul GEORGES',
  'Ayşegül KAZMAZ',
  'Rengin TAMKAN DOĞAN',
  'Stanislaw EON DU VAL',
  'Ender ÜSTÜNGEL',
]

const PARTIAL_REOPEN = [
  { evaluator: 'Ayşegül KAZMAZ', target: 'Ender ÜSTÜNGEL', context: 'genel', reason: '13/21 kısmi genel' },
  { evaluator: 'Jennifer COLOMB ŞENER', target: 'Fadime ALPARSLAN', context: 'genel', reason: '2/21 kısmi genel' },
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

async function findUser(sb, name) {
  const { data, error } = await sb.from('users').select('id, name').eq('name', name).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Kullanıcı bulunamadı: ${name}`)
  return data
}

async function countResponses(sb, assignmentId) {
  const { count } = await sb
    .from('evaluation_responses')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)
  return count || 0
}

async function main() {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  const ender = await findUser(sb, 'Ender ÜSTÜNGEL')
  const fadime = await findUser(sb, 'Fadime ALPARSLAN')

  console.log(`\n=== Ender ÜSTÜNGEL — genel değerlendirilen atamaları ===`)
  const toAdd = []
  for (const evName of ENDER_GENEL_EVALUATORS) {
    const ev = await findUser(sb, evName)
    const { data: existing } = await sb
      .from('evaluation_assignments')
      .select('id, status')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', ev.id)
      .eq('target_id', ender.id)
      .eq('matrix_context', 'genel')
      .maybeSingle()

    if (existing?.id) {
      const n = await countResponses(sb, existing.id)
      console.log(`  ✓ ${evName} → Ender (${existing.status}, ${n} cevap)`)
    } else {
      console.log(`  + EKLE: ${evName} → Ender (genel, pending)`)
      toAdd.push({ evaluator_id: ev.id, evaluator_name: evName })
    }
  }

  console.log(`\n=== Fadime ALPARSLAN — değerlendiren kontrolü ===`)
  const { count: fadimeEvalCount } = await sb
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', fadime.id)
    .eq('matrix_context', 'genel')
  console.log(`  genel değerlendiren atama: ${fadimeEvalCount ?? 0} (beklenen: 0)`)

  const { data: fadimeTargets } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, status')
    .eq('period_id', PERIOD)
    .eq('target_id', fadime.id)
    .eq('matrix_context', 'genel')
  const evalIds = [...new Set((fadimeTargets || []).map((a) => a.evaluator_id))]
  const { data: evUsers } = await sb.from('users').select('id, name').in('id', evalIds)
  const evBy = new Map((evUsers || []).map((u) => [u.id, u.name]))
  console.log(`\n=== Fadime — genel değerlendirilen (${(fadimeTargets || []).length}) ===`)
  for (const a of fadimeTargets || []) {
    const n = await countResponses(sb, a.id)
    console.log(`  ${evBy.get(a.evaluator_id)} | ${a.status} | ${n} cevap`)
  }

  console.log(`\n=== Kısmi formlar (yeniden açılacak) ===`)
  for (const row of PARTIAL_REOPEN) {
    console.log(`  ${row.evaluator} → ${row.target}: ${row.reason}`)
  }

  if (!APPLY) {
    console.log(`\nDry-run. Uygulamak için:\n  node scripts/fix-ender-fadime-genel.mjs --apply`)
    return
  }

  console.log(`\n=== Uygulanıyor ===`)

  for (const row of toAdd) {
    const { error } = await sb.from('evaluation_assignments').insert({
      period_id: PERIOD,
      evaluator_id: row.evaluator_id,
      target_id: ender.id,
      matrix_context: 'genel',
      status: 'pending',
    })
    if (error) throw new Error(`Atama eklenemedi (${row.evaluator_name}): ${error.message}`)
    console.log(`  + ${row.evaluator_name} → Ender eklendi`)
  }

  // Jennifer → Fadime kapsam onarımı (Proje kategorisi)
  const jFix = spawnSync(process.execPath, [resolve(__dirname, 'fix-jennifer-fadime-genel-scope.mjs'), '--apply'], {
    encoding: 'utf8',
    cwd: root,
  })
  if (jFix.stdout) console.log(jFix.stdout.trim())
  if (jFix.status !== 0) {
    console.error(jFix.stderr || jFix.stdout)
    throw new Error('Jennifer → Fadime kapsam onarımı başarısız')
  }

  for (const row of PARTIAL_REOPEN) {
    const r = spawnSync(
      process.execPath,
      [
        resolve(__dirname, 'reopen-evaluation-assignment.mjs'),
        '--evaluator',
        row.evaluator,
        '--target',
        row.target,
        '--context',
        row.context,
      ],
      { encoding: 'utf8', cwd: root }
    )
    if (r.stdout) console.log(r.stdout.trim())
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout)
      throw new Error(`Yeniden açılamadı: ${row.evaluator} → ${row.target}`)
    }
  }

  console.log(`\n✓ Tamamlandı. Ender için ${toAdd.length} yeni genel atama; kısmi formlar pending.`)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
