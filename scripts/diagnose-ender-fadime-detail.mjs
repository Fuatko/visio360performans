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

async function detailTarget(name) {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
  const { data: u } = await sb.from('users').select('id').eq('name', name).single()
  const { data: asg } = await sb
    .from('evaluation_assignments')
    .select('id, evaluator_id, status, matrix_context')
    .eq('period_id', PERIOD)
    .eq('target_id', u.id)
    .eq('matrix_context', 'genel')

  const evalIds = [...new Set((asg || []).map((a) => a.evaluator_id))]
  const { data: evs } = await sb.from('users').select('id, name').in('id', evalIds)
  const evBy = new Map((evs || []).map((e) => [e.id, e.name]))

  console.log(`\n=== ${name} — genel hedef atamaları ===`)
  const allPeriod = new Set()
  for (const a of asg || []) {
    const { data: resp } = await sb
      .from('evaluation_responses')
      .select('question_id, question_scope')
      .eq('assignment_id', a.id)
    const period = new Set()
    const duty = new Set()
    for (const r of resp || []) {
      const q = String(r.question_id)
      if (r.question_scope === 'duty') duty.add(q)
      else {
        period.add(q)
        allPeriod.add(q)
      }
    }
    console.log(`  ${evBy.get(a.evaluator_id)} | ${a.status} | period=${period.size} duty=${duty.size}`)
  }
  console.log(`  BİRLEŞİK period soru: ${allPeriod.size}`)
}

async function whoShouldEvaluateEnder() {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
  const { data: ender } = await sb.from('users').select('id').eq('name', 'Ender ÜSTÜNGEL').single()
  // Evaluators who have Ender in their genel OUT list (they evaluate ender)
  const { data: rows } = await sb
    .from('evaluation_assignments')
    .select('evaluator_id')
    .eq('period_id', PERIOD)
    .eq('target_id', ender.id)
    .eq('matrix_context', 'genel')

  const have = new Set((rows || []).map((r) => r.evaluator_id))

  // Evaluators in genel pool who list ender when they evaluate others - check inverse:
  // People who Ender evaluates in genel - should they also evaluate Ender back?
  const { data: enderOut } = await sb
    .from('evaluation_assignments')
    .select('target_id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ender.id)
    .eq('matrix_context', 'genel')
    .eq('status', 'completed')

  const { data: paul } = await sb.from('users').select('id').eq('name', 'Paul GEORGES').single()
  const { data: paulTargets } = await sb
    .from('evaluation_assignments')
    .select('target_id')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', paul.id)
    .eq('matrix_context', 'genel')

  const paulHasEnder = (paulTargets || []).some((t) => t.target_id === ender.id)
  console.log(`\nPaul genel listesinde Ender var mı: ${paulHasEnder}`)
  console.log(`Paul genel hedef sayısı: ${(paulTargets || []).length}`)

  // Count evaluators with same genel target set size as Paul (~85) who include Ender
  const { data: allGenelEval } = await sb
    .from('evaluation_assignments')
    .select('evaluator_id, target_id')
    .eq('period_id', PERIOD)
    .eq('matrix_context', 'genel')

  const byEval = new Map()
  for (const r of allGenelEval || []) {
    const e = String(r.evaluator_id)
    if (!byEval.has(e)) byEval.set(e, new Set())
    byEval.get(e).add(String(r.target_id))
  }

  let shouldHaveEnder = 0
  const missing = []
  const { data: allUsers } = await sb.from('users').select('id, name')
  const nameBy = new Map((allUsers || []).map((u) => [u.id, u.name]))

  for (const [evalId, targets] of byEval) {
    if (targets.has(String(ender.id)) && evalId !== String(ender.id)) {
      shouldHaveEnder++
      if (!have.has(evalId)) missing.push(nameBy.get(evalId))
    }
  }
  console.log(`\nGenel değerlendirenlerin Ender'i hedef listesinde olan: ${shouldHaveEnder}`)
  console.log(`Bunların Ender'e ataması eksik: ${missing.length}`)
  if (missing.length) console.log(missing.slice(0, 30).join(', '), missing.length > 30 ? `...+${missing.length - 30}` : '')
}

async function main() {
  await detailTarget('Ender ÜSTÜNGEL')
  await detailTarget('Fadime ALPARSLAN')
  await whoShouldEvaluateEnder()
}

main()
