#!/usr/bin/env node
/**
 * ADIM 1+2: Kurumsal 2026 soru FR metinlerini canlı + snapshot'a uygula
 * Kaynak: data/corporate-2026-questions-fr.json
 * Usage: node scripts/apply-corporate-2026-fr-questions.mjs [--apply]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const APPLY = process.argv.includes('--apply')

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.local']) {
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

const sb = createClient(
  (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const frRows = JSON.parse(readFileSync(resolve(root, 'data/corporate-2026-questions-fr.json'), 'utf8'))
const frById = new Map(frRows.map((r) => [r.id, r.text_fr]))

async function main() {
  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run')
  console.log('FR kayıt:', frById.size)

  let badDup = 0
  const seen = new Map()
  for (const [id, fr] of frById) {
    const k = String(fr || '').trim().toLowerCase()
    if (seen.has(k)) badDup++
    else seen.set(k, id)
  }
  console.log('Benzersiz FR metin:', seen.size, 'tekrar:', badDup)

  if (!APPLY) {
    console.log('\nUygulamak: node scripts/apply-corporate-2026-fr-questions.mjs --apply')
    return
  }

  let qOk = 0
  for (const [id, text_fr] of frById) {
    const { error } = await sb.from('questions').update({ text_fr }).eq('id', id)
    if (!error) qOk++
    else console.warn('question', id, error.message)
  }
  console.log('questions live:', qOk)

  let snapOk = 0
  for (const [id, text_fr] of frById) {
    const { error } = await sb
      .from('evaluation_period_questions_snapshot')
      .update({ text_fr })
      .eq('period_id', PERIOD)
      .eq('id', id)
    if (!error) snapOk++
  }
  console.log('snapshot questions:', snapOk)

  // Doğrulama genel
  const { data: epq } = await sb
    .from('evaluation_period_questions')
    .select('question_id')
    .eq('period_id', PERIOD)
    .eq('is_active', true)
  const ids = epq.map((r) => r.question_id)
  const { data: qs } = await sb.from('questions').select('id,text,text_fr').in('id', ids)
  const dupFr = new Map()
  for (const q of qs || []) {
    const fr = String(q.text_fr || '').trim().toLowerCase()
    dupFr.set(fr, (dupFr.get(fr) || 0) + 1)
  }
  const worst = [...dupFr.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])
  console.log('Genel soru FR tekrar (max):', worst[0] || 'yok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
