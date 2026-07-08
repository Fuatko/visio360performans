#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

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

async function fetchDutyOnly(sb, periodId, targetId, baseIds) {
  const { data: dutyRows } = await sb
    .from('evaluation_period_user_duties')
    .select('duty_id')
    .eq('period_id', periodId)
    .eq('user_id', targetId)
    .eq('is_active', true)
  const dutyIds = [...new Set((dutyRows || []).map((r) => String(r.duty_id || '')).filter(Boolean))]
  const only = new Set()
  if (!dutyIds.length) return only
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
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
  const { data: u } = await sb.from('users').select('id').eq('name', 'Fadime ALPARSLAN').single()

  const { data: duties } = await sb
    .from('evaluation_period_user_duties')
    .select('duty_id, duty_titles(title)')
    .eq('period_id', PERIOD)
    .eq('user_id', u.id)
  console.log('Fadime duties:', duties)

  const snap = await sb.from('evaluation_period_questions_snapshot').select('id').eq('period_id', PERIOD)
  const baseIds = new Set((snap.data || []).map((r) => String(r.id)))
  const dutyOnly = await fetchDutyOnly(sb, PERIOD, u.id, baseIds)
  console.log('dutyOnly question count:', dutyOnly.size)

  const { data: asg } = await sb
    .from('evaluation_assignments')
    .select('id')
    .eq('period_id', PERIOD)
    .eq('target_id', u.id)
    .eq('matrix_context', 'genel')
    .eq('status', 'completed')

  const periodQ = new Set()
  for (const a of asg || []) {
    const { data: resp } = await sb.from('evaluation_responses').select('question_id, question_scope').eq('assignment_id', a.id)
    for (const r of resp || []) {
      const qid = String(r.question_id)
      const stored = r.question_scope || 'period'
      let scope = stored
      if (stored !== 'duty' && stored !== 'period') scope = dutyOnly.has(qid) ? 'duty' : 'period'
      if (scope === 'period') periodQ.add(qid)
    }
  }
  console.log('periodQ with dutyOnly logic:', periodQ.size)
}

main()
