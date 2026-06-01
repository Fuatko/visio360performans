#!/usr/bin/env node
/**
 * Canlı DB: her dönem sorusunda 4 şık (5,3,1 + Bilgim yok) var mı?
 * Usage: node scripts/audit-four-options-live.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
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
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key)

function isNoInfo(a) {
  const lvl = String(a.level || '').toLowerCase().trim()
  const t = `${a.text || ''} ${a.text_fr || ''}`.toLowerCase()
  if (['no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok'].includes(lvl)) return true
  return /bilgim\s*yok|fikrim\s*yok|je\s+ne\s+sais/.test(t)
}

function analyzeAnswers(rows) {
  const active = rows.filter((a) => a.is_active !== false)
  const perf531 = active.filter((a) => !isNoInfo(a) && [5, 3, 1].includes(Math.round(Number(a.std_score || 0))))
  const noInfo = active.filter(isNoInfo)
  const perf0 = active.filter((a) => !isNoInfo(a) && Math.round(Number(a.std_score || 0)) === 0)
  const ok = active.length === 4 && perf531.length === 3 && noInfo.length === 1 && perf0.length === 0
  const scores = [...new Set(perf531.map((a) => Math.round(Number(a.std_score))))].sort((a, b) => b - a)
  return { active: active.length, perf531: perf531.length, noInfo: noInfo.length, perf0: perf0.length, scores, ok }
}

async function fetchAllQuestionIds(periodId) {
  const ids = new Set()
  const { data: genel } = await supabase
    .from('evaluation_period_questions')
    .select('question_id')
    .eq('period_id', periodId)
    .eq('is_active', true)
  genel?.forEach((r) => ids.add(r.question_id))

  const { data: dutyDirect } = await supabase
    .from('evaluation_period_duty_questions')
    .select('question_id')
    .eq('period_id', periodId)
    .eq('is_active', true)
  dutyDirect?.forEach((r) => ids.add(r.question_id))

  const { data: dutyCats } = await supabase
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', periodId)
    .eq('is_active', true)
  const catIds = [...new Set((dutyCats || []).map((r) => r.category_id).filter(Boolean))]
  if (catIds.length) {
    const { data: qs } = await supabase.from('questions').select('id').in('category_id', catIds)
    qs?.forEach((r) => ids.add(r.id))
  }
  return [...ids]
}

async function fetchAnswersForQuestions(questionIds) {
  const byQ = new Map()
  const chunk = 80
  for (let i = 0; i < questionIds.length; i += chunk) {
    const slice = questionIds.slice(i, i + chunk)
    const { data, error } = await supabase
      .from('question_answers')
      .select('id, question_id, std_score, reel_score, level, text, text_fr, sort_order, is_active')
      .in('question_id', slice)
    if (error) throw error
    for (const row of data || []) {
      const list = byQ.get(row.question_id) || []
      list.push(row)
      byQ.set(row.question_id, list)
    }
  }
  return byQ
}

async function fetchSnapshotCounts(periodId, questionIds) {
  const byQ = new Map()
  const chunk = 80
  for (let i = 0; i < questionIds.length; i += chunk) {
    const slice = questionIds.slice(i, i + chunk)
    const { data, error } = await supabase
      .from('evaluation_period_answers_snapshot')
      .select('question_id, is_active, level, text, text_fr, std_score')
      .eq('period_id', periodId)
      .in('question_id', slice)
    if (error) throw error
    for (const row of data || []) {
      const list = byQ.get(row.question_id) || []
      list.push(row)
      byQ.set(row.question_id, list)
    }
  }
  return byQ
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

  let totalFail = 0
  for (const period of periods) {
    console.log('\n===', period.name, '===', period.id)
    const qids = await fetchAllQuestionIds(period.id)
    console.log('Benzersiz soru:', qids.length)

    const liveByQ = await fetchAnswersForQuestions(qids)
    const snapByQ = await fetchSnapshotCounts(period.id, qids)

    const liveFail = []
    const snapFail = []
    let liveOk = 0
    let snapOk = 0

    for (const qid of qids) {
      const live = analyzeAnswers(liveByQ.get(qid) || [])
      const snapRows = (snapByQ.get(qid) || []).map((r) => ({
        ...r,
        is_active: r.is_active !== false,
      }))
      const snap = analyzeAnswers(snapRows)

      if (live.ok) liveOk++
      else liveFail.push({ qid, ...live })

      if (snap.ok) snapOk++
      else snapFail.push({ qid, ...snap })
    }

    console.log('CANLI  — tamam:', liveOk, '| hatali:', liveFail.length)
    console.log('SNAPSHOT — tamam:', snapOk, '| hatali:', snapFail.length)

    if (liveFail.length) {
      console.log('\nCanli hatali (ilk 15):')
      liveFail.slice(0, 15).forEach((f) => {
        console.log(' ', f.qid, '| aktif:', f.active, 'perf531:', f.perf531, 'bilgim:', f.noInfo, 'puanlar:', f.scores.join(','))
      })
    }
    if (snapFail.length) {
      console.log('\nSnapshot hatali (ilk 15):')
      snapFail.slice(0, 15).forEach((f) => {
        console.log(' ', f.qid, '| aktif:', f.active, 'perf531:', f.perf531, 'bilgim:', f.noInfo)
      })
    }
    totalFail += liveFail.length + snapFail.length
  }

  console.log('\n--- SONUC ---')
  if (totalFail === 0) console.log('TUM SORULAR: 4 sik (5,3,1 + Bilgim yok) — canli ve snapshot OK')
  else console.log('UYARI: hatali kayit var — yukaridaki question_id listesine bakin')
  process.exit(totalFail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
