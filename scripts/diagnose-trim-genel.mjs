#!/usr/bin/env node
/** Genel 360: soru başına benzersiz değerlendirici cevap sayısı + trim uygunluğu */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const TARGET_NAME = process.env.TARGET_NAME || 'Ilgın'

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.paul-fr.tmp', '.env.local', '.env.vercel.prod']) {
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

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli')
  process.exit(1)
}
const sb = createClient(url, key)

function score(r) {
  const n = Number(r?.reel_score ?? r?.std_score ?? r?.score ?? 0)
  return Number.isFinite(n) ? n : 0
}

async function main() {
  const { data: users } = await sb.from('users').select('id,name').ilike('name', `%${TARGET_NAME}%`)
  const target = (users || []).find((u) => String(u.name || '').includes(TARGET_NAME)) || users?.[0]
  if (!target) {
    console.error('Hedef bulunamadı:', TARGET_NAME)
    process.exit(1)
  }
  console.log('Hedef:', target.name, target.id)

  const { data: assignments, error: aErr } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, target_id, status, matrix_context')
    .eq('period_id', PERIOD)
    .eq('target_id', target.id)
    .eq('status', 'completed')
  if (aErr) throw aErr

  const genel = (assignments || []).filter((a) => {
    const ctx = String(a.matrix_context || 'genel').trim() || 'genel'
    return ctx === 'genel' && String(a.evaluator_id) !== String(a.target_id)
  })
  console.log('Genel tamamlanmış ekip ataması:', genel.length)
  console.log(
    'Matris kırılımı (tüm):',
    Object.entries(
      (assignments || []).reduce((m, a) => {
        const c = String(a.matrix_context || 'genel').trim() || 'genel'
        m[c] = (m[c] || 0) + 1
        return m
      }, {})
    )
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
  )

  const aids = genel.map((a) => a.id)
  const responses = []
  for (let i = 0; i < aids.length; i += 100) {
    const { data, error } = await sb
      .from('evaluation_responses')
      .select('assignment_id, question_id, reel_score, std_score')
      .in('assignment_id', aids.slice(i, i + 100))
    if (error) throw error
    responses.push(...(data || []))
  }

  const evalByAid = new Map(genel.map((a) => [a.id, a.evaluator_id]))
  const byQuestion = new Map()
  for (const r of responses) {
    const qid = String(r.question_id || '').trim()
    if (!qid) continue
    const eid = String(evalByAid.get(r.assignment_id) || '')
    if (!byQuestion.has(qid)) byQuestion.set(qid, { evaluators: new Set(), scorable: new Map() })
    const row = byQuestion.get(qid)
    row.evaluators.add(eid)
    const s = score(r)
    if (s > 0) row.scorable.set(eid, s)
  }

  const counts = [...byQuestion.values()].map((v) => v.evaluators.size)
  const minC = counts.length ? Math.min(...counts) : 0
  const maxC = counts.length ? Math.max(...counts) : 0
  const trimmable = [...byQuestion.entries()].filter(([, v]) => v.evaluators.size >= 7).length

  console.log('Genel soru sayısı (yanıtlı):', byQuestion.size)
  console.log('Soru başına cevap — min:', minC, 'max:', maxC, 'ortalama:', counts.length ? (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1) : 0)
  console.log('≥7 cevaplı soru sayısı:', trimmable)
  console.log('Trim raporu (mevcut kısmi kural):', trimmable > 0 && genel.length >= 3 ? 'EVET' : 'HAYIR')
  console.log('Trim raporu (sıkı: tüm sorular ≥7):', counts.length > 0 && minC >= 7 && genel.length >= 3 ? 'EVET' : 'HAYIR')

  const sample = [...byQuestion.entries()].slice(0, 5).map(([qid, v]) => ({
    qid: qid.slice(0, 8),
    responses: v.evaluators.size,
    scorable: v.scorable.size,
  }))
  console.log('Örnek sorular:', sample)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
