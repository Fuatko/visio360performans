#!/usr/bin/env node
/**
 * Tam genel (21 soru) kuralından etkilenen kişiler — eski sistemde genel sayılıp yeni kuralda sayılmayanlar.
 * Usage: node scripts/diagnose-partial-genel-eval.mjs [period_id]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = process.argv[2] || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

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

function numericScore(r) {
  const n = Number(r?.reel_score ?? r?.std_score ?? r?.score ?? 0)
  return Number.isFinite(n) ? n : 0
}

function responseScope(r, dutyOnly) {
  const stored = String(r?.question_scope || '').trim()
  if (stored === 'duty' || stored === 'period') return stored
  const qid = String(r?.question_id || '').trim()
  if (qid && dutyOnly.has(qid)) return 'duty'
  return 'period'
}

async function fetchBasePeriodQuestionIds(sb, periodId) {
  const base = new Set()
  const snap = await sb.from('evaluation_period_questions_snapshot').select('id').eq('period_id', periodId)
  if (!snap.error && (snap.data || []).length) {
    ;(snap.data || []).forEach((r) => r?.id && base.add(String(r.id)))
    return base
  }
  const live = await sb.from('evaluation_period_questions').select('question_id').eq('period_id', periodId).eq('is_active', true)
  if (!live.error) {
    ;(live.data || []).forEach((r) => r?.question_id && base.add(String(r.question_id)))
  }
  return base
}

async function fetchCorePeriodQuestionCount(sb, periodId) {
  const baseIds = await fetchBasePeriodQuestionIds(sb, periodId)
  if (!baseIds.size) return 0
  const { data: epdc } = await sb
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', periodId)
    .eq('is_active', true)
  const dutyCats = new Set((epdc || []).map((r) => String(r.category_id)))
  const { data: questions } = await sb.from('questions').select('id, category_id').in('id', [...baseIds])
  let core = 0
  for (const q of questions || []) {
    if (dutyCats.has(String(q.category_id || ''))) continue
    core++
  }
  return core || baseIds.size
}

async function fetchDutyOnlyForTarget(sb, periodId, targetId, baseIds) {
  const { data: dutyRows } = await sb
    .from('evaluation_period_user_duties')
    .select('duty_id')
    .eq('period_id', periodId)
    .eq('user_id', targetId)
    .eq('is_active', true)
  const dutyIds = [...new Set((dutyRows || []).map((r) => String(r.duty_id || '')).filter(Boolean))]
  if (!dutyIds.length) return new Set()

  const only = new Set()
  const { data: qLinks } = await sb
    .from('evaluation_period_duty_questions')
    .select('question_id')
    .eq('period_id', periodId)
    .in('duty_id', dutyIds)
    .eq('is_active', true)
  ;(qLinks || []).forEach((r) => {
    const qid = String(r.question_id || '')
    if (qid && !baseIds.has(qid)) only.add(qid)
  })

  const { data: catLinks } = await sb
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', periodId)
    .in('duty_id', dutyIds)
    .eq('is_active', true)
  const catIds = [...new Set((catLinks || []).map((r) => String(r.category_id || '')).filter(Boolean))]
  if (catIds.length) {
    const { data: qs } = await sb.from('questions').select('id').in('category_id', catIds)
    ;(qs || []).forEach((q) => {
      const qid = String(q.id || '')
      if (qid && !baseIds.has(qid)) only.add(qid)
    })
  }
  return only
}

async function main() {
  loadEnv()
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) {
    console.error('Missing SUPABASE credentials')
    process.exit(1)
  }
  const sb = createClient(url, key)

  const baseIds = await fetchBasePeriodQuestionIds(sb, PERIOD)
  const coreCount = await fetchCorePeriodQuestionCount(sb, PERIOD)
  const expected = coreCount >= 21 ? 21 : coreCount
  console.log(`\nDönem: ${PERIOD}`)
  console.log(`Snapshot toplam soru: ${baseIds.size}`)
  console.log(`Temel dönem soru (yan görev kat. hariç): ${coreCount}`)
  console.log(`Standart genel form eşiği: ${expected}\n`)

  const { data: assignments, error: aErr } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, target_id, status, matrix_context')
    .eq('period_id', PERIOD)
    .eq('status', 'completed')
  if (aErr) throw aErr

  const genelAssignments = (assignments || []).filter((a) => (a.matrix_context || 'genel') === 'genel')
  const allAssignments = assignments || []
  const assignmentIds = [...new Set([...genelAssignments, ...allAssignments].map((a) => String(a.id)))]
  const responsesByAssignment = new Map()
  for (let i = 0; i < assignmentIds.length; i += 80) {
    const chunk = assignmentIds.slice(i, i + 80)
    const { data: resp, error: rErr } = await sb.from('evaluation_responses').select('*').in('assignment_id', chunk)
    if (rErr) throw rErr
    for (const r of resp || []) {
      const aid = String(r.assignment_id)
      const cur = responsesByAssignment.get(aid) || []
      cur.push(r)
      responsesByAssignment.set(aid, cur)
    }
  }

  const targetIds = [...new Set(allAssignments.map((a) => String(a.target_id)))]
  const dutyOnlyCache = new Map()
  for (const tid of targetIds) {
    dutyOnlyCache.set(tid, await fetchDutyOnlyForTarget(sb, PERIOD, tid, baseIds))
  }

  const byTarget = new Map()
  for (const a of genelAssignments) {
    const tid = String(a.target_id)
    const responses = responsesByAssignment.get(String(a.id)) || []
    const dutyOnly = dutyOnlyCache.get(tid) || new Set()
    let hasScorable = false
    const periodQ = new Set()
    let dutyAnswerCount = 0
    for (const r of responses) {
      const scope = responseScope(r, dutyOnly)
      const qid = String(r.question_id || '').trim()
      if (!qid) continue
      if (scope === 'duty') {
        dutyAnswerCount++
        continue
      }
      periodQ.add(qid)
      if (numericScore(r) > 0) hasScorable = true
    }
    if (!byTarget.has(tid)) {
      byTarget.set(tid, { periodQ: new Set(), hasScorable: false, dutyAnswers: 0, genelAssignments: 0 })
    }
    const row = byTarget.get(tid)
    row.genelAssignments++
    periodQ.forEach((q) => row.periodQ.add(q))
    row.hasScorable = row.hasScorable || hasScorable
    row.dutyAnswers += dutyAnswerCount
  }

  // Yan görev matrisi atamaları (genel dışı)
  const dutyMatrixByTarget = new Map()
  for (const a of allAssignments) {
    const mctx = String(a.matrix_context || 'genel')
    if (mctx === 'genel' || mctx === 'okul_yasam') continue
    const tid = String(a.target_id)
    const responses = responsesByAssignment.get(String(a.id)) || []
    if (!responses.length) continue
    const cur = dutyMatrixByTarget.get(tid) || { contexts: new Set(), answers: 0 }
    cur.contexts.add(mctx)
    cur.answers += responses.length
    dutyMatrixByTarget.set(tid, cur)
  }

  const userIds = [...new Set([...targetIds, ...allAssignments.map((a) => String(a.evaluator_id))])]
  const { data: users } = await sb.from('users').select('id, name, department').in('id', userIds)
  const userBy = new Map((users || []).map((u) => [String(u.id), u]))

  const affected = []
  for (const [tid, v] of byTarget) {
    const periodCount = v.periodQ.size
    const oldIncluded = v.hasScorable
    const newIncluded = oldIncluded && expected > 0 && periodCount >= expected
    if (oldIncluded && !newIncluded) {
      const u = userBy.get(tid)
      const dutyM = dutyMatrixByTarget.get(tid)
      affected.push({
        name: u?.name || tid,
        dept: u?.department || '—',
        periodAnswered: periodCount,
        expected,
        dutyAnswers: v.dutyAnswers,
        genelAssignments: v.genelAssignments,
        dutyMatrixContexts: dutyM ? [...dutyM.contexts].join(', ') : '',
        dutyMatrixAnswers: dutyM?.answers || 0,
      })
    }
  }

  affected.sort((a, b) => a.periodAnswered - b.periodAnswered || a.name.localeCompare(b.name, 'tr'))

  console.log(`=== Kısmi genel (eski: dahil → yeni: hariç): ${affected.length} hedef kişi ===\n`)
  for (const r of affected) {
    console.log(
      `  ${r.name} (${r.dept}) — genel soru: ${r.periodAnswered}/${r.expected}, yan görev cevap: ${r.dutyAnswers}, genel atama: ${r.genelAssignments}` +
        (r.dutyMatrixContexts ? ` | yan görev matris: ${r.dutyMatrixContexts} (${r.dutyMatrixAnswers} cevap)` : '')
    )
  }

  const aysegul = affected.filter((r) => /ayşegül|aysegul/i.test(r.name) && /kazmaz/i.test(r.name))
  console.log(`\nAyşegül KAZMAZ bu listede: ${aysegul.length ? 'EVET' : 'HAYIR'}`)
  if (aysegul[0]) console.log('  →', aysegul[0])

  const onlyPartial = affected.filter((r) => r.periodAnswered > 0 && r.periodAnswered < expected)
  console.log(`\nÖzet: ${onlyPartial.length} kişi 1–${expected - 1} genel soru ile kısmi; ${affected.length - onlyPartial.length} kişi başka nedenle listede.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
