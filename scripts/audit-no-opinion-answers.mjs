#!/usr/bin/env node
/**
 * Tüm aktif dönem sorularında canlı + snapshot şık sayısı (5 beklenir, no_opinion zorunlu)
 * Usage: node scripts/audit-no-opinion-answers.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  for (const f of ['.env.local', '.env', '.env.vercel.prod']) {
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
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

const PERF = new Set([5, 3, 1, 0])

function isNoInfo(a) {
  const t = `${a.text || ''} ${a.text_fr || ''}`.toLowerCase()
  if (/bilgim\s*yok|fikrim\s*yok|bilgi\s*yok|je\s+ne\s+sais|aucune\s+idée|sans\s+avis/.test(t)) return true
  const lvl = String(a.level ?? '').toLowerCase()
  return ['no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok'].includes(lvl)
}

function active(a) {
  return a.is_active !== false
}

function analyzeAnswers(rows) {
  const act = rows.filter(active)
  const noInfo = act.filter(isNoInfo)
  const scored = act.filter((a) => !isNoInfo(a))
  const perfScores = new Set(
    scored
      .filter((a) => Number(a.std_score) === Number(a.reel_score) && PERF.has(Math.round(Number(a.std_score))))
      .map((a) => Math.round(Number(a.std_score)))
  )
  return {
    activeCount: act.length,
    noInfoCount: noInfo.length,
    perfDistinct: perfScores.size,
    hasNoInfo: noInfo.length >= 1,
    ok: act.length >= 5 && noInfo.length >= 1,
    jobScaleOk: perfScores.size === 4 && noInfo.length >= 1 && act.length >= 5,
  }
}

function chunkIds(ids, size) {
  const out = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

async function fetchAll(table, select, filterFn) {
  const pageSize = 1000
  let from = 0
  const all = []
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (filterFn) q = filterFn(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  const { data: periods, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, name, status')
    .eq('status', 'active')
  if (pErr) throw pErr
  if (!periods?.length) {
    console.log('Aktif dönem yok.')
    return
  }

  console.log('=== Aktif dönemler ===')
  for (const p of periods) console.log(`  ${p.id}  ${p.name}`)

  const issues = []
  let totalQuestions = 0
  let okCount = 0

  for (const period of periods) {
    const periodId = period.id
    const [epq, epdq, epdc] = await Promise.all([
      fetchAll('evaluation_period_questions', 'question_id', (q) =>
        q.eq('period_id', periodId).eq('is_active', true)
      ),
      fetchAll('evaluation_period_duty_questions', 'question_id,duty_id', (q) =>
        q.eq('period_id', periodId).eq('is_active', true)
      ),
      fetchAll('evaluation_period_duty_categories', 'category_id,duty_id', (q) =>
        q.eq('period_id', periodId).eq('is_active', true)
      ),
    ])
    const catIds = [...new Set(epdc.map((r) => r.category_id).filter(Boolean))]
    let dutyCatQ = []
    if (catIds.length) {
      for (const batch of chunkIds(catIds, 100)) {
        const { data, error } = await supabase.from('questions').select('id').in('category_id', batch)
        if (error) throw error
        dutyCatQ.push(...(data || []))
      }
    }
    const questionIds = [
      ...new Set([
        ...epq.map((r) => r.question_id),
        ...epdq.map((r) => r.question_id),
        ...dutyCatQ.map((r) => r.id),
      ].filter(Boolean)),
    ]
    totalQuestions += questionIds.length

    if (!questionIds.length) continue

    const [liveRows, snapRows] = await Promise.all([
      fetchAll('question_answers', '*', (q) => q.in('question_id', questionIds)),
      fetchAll('evaluation_period_answers_snapshot', '*', (q) => q.eq('period_id', periodId).in('question_id', questionIds)),
    ])

    const liveByQ = new Map()
    for (const a of liveRows) {
      const qid = a.question_id
      if (!liveByQ.has(qid)) liveByQ.set(qid, [])
      liveByQ.get(qid).push(a)
    }
    const snapByQ = new Map()
    for (const a of snapRows) {
      const qid = a.question_id
      if (!snapByQ.has(qid)) snapByQ.set(qid, [])
      snapByQ.get(qid).push(a)
    }

    for (const qid of questionIds) {
      const live = analyzeAnswers(liveByQ.get(qid) || [])
      const snap = analyzeAnswers(snapByQ.get(qid) || [])
      const ok = live.ok && snap.ok
      if (ok) okCount++
      else {
        issues.push({
          period: period.name,
          kaynak: epq.some((r) => r.question_id === qid) ? 'genel' : 'yan_gorev',
          question_id: qid,
          live_active: live.activeCount,
          live_no_info: live.noInfoCount,
          live_perf: live.perfDistinct,
          snap_active: snap.activeCount,
          snap_no_info: snap.noInfoCount,
          snap_perf: snap.perfDistinct,
        })
      }
    }
  }

  console.log('\n=== Özet ===')
  console.log(`Toplam soru (aktif dönem): ${totalQuestions}`)
  console.log(`Tamam (canlı≥5 + snap≥5 + Bilgim yok): ${okCount}`)
  console.log(`Sorunlu: ${issues.length}`)

  if (issues.length) {
    console.log('\n=== Sorunlu sorular (ilk 50) ===')
    console.table(issues.slice(0, 50))
    if (issues.length > 50) console.log(`... +${issues.length - 50} daha`)
    process.exit(1)
  }

  console.log('\n✓ Tüm sorularda canlı ve snapshot 5 şık + no_opinion mevcut.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
