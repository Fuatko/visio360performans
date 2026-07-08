#!/usr/bin/env node
/** Onur & Ayşegül — genel vs yaşam koordinatörü rapor teşhisi */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const NAMES = ['Onur ERMAN', 'Ayşegül KAZMAZ']

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
  const { data: catLinks } = await sb
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', periodId)
    .in('duty_id', dutyIds)
    .eq('is_active', true)
  const catIds = [...new Set((catLinks || []).map((r) => String(r.category_id || '')).filter(Boolean))]
  if (catIds.length) {
    const { data: qs } = await sb.from('questions').select('id').in('category_id', catIds)
    ;(qs || []).forEach((q) => only.add(String(q.id)))
  }
  return only
}

async function main() {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  const { data: snap } = await sb.from('evaluation_period_questions_snapshot').select('id').eq('period_id', PERIOD)
  const baseIds = new Set((snap || []).map((r) => String(r.id)))

  const { data: epdc } = await sb
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', PERIOD)
    .eq('is_active', true)
  const dutyCats = new Set((epdc || []).map((r) => String(r.category_id)))
  const { data: questions } = await sb.from('questions').select('id, category_id').in('id', [...baseIds])
  let coreCount = 0
  for (const q of questions || []) {
    if (!dutyCats.has(String(q.category_id || ''))) coreCount++
  }
  const expected = coreCount >= 21 ? 21 : coreCount

  for (const name of NAMES) {
    const { data: u } = await sb.from('users').select('id, name, department').eq('name', name).single()
    console.log(`\n${'='.repeat(70)}\n${name} (${u.department})\n${'='.repeat(70)}`)

    // AS TARGET — genel scoring eligibility
    const { data: genelTgt } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, status')
      .eq('period_id', PERIOD)
      .eq('target_id', u.id)
      .eq('matrix_context', 'genel')
      .eq('status', 'completed')

    const dutyOnly = await fetchDutyOnly(sb, PERIOD, u.id, baseIds)
    const allPeriodQ = new Set()
    let hasScorable = false
    console.log(`\n[HEDEF] Genel değerlendirilen — tamamlanan ${(genelTgt || []).length} atama:`)
    for (const a of genelTgt || []) {
      const { data: ev } = await sb.from('users').select('name').eq('id', a.evaluator_id).single()
      const { data: resp } = await sb
        .from('evaluation_responses')
        .select('question_id, question_scope, reel_score, std_score, score')
        .eq('assignment_id', a.id)
      const periodQ = new Set()
      for (const r of resp || []) {
        const qid = String(r.question_id)
        const scope = r.question_scope === 'duty' ? 'duty' : dutyOnly.has(qid) ? 'duty' : 'period'
        if (scope === 'period') {
          periodQ.add(qid)
          allPeriodQ.add(qid)
        }
        const n = Number(r.reel_score ?? r.std_score ?? r.score ?? 0)
        if (n > 0) hasScorable = true
      }
      console.log(`  ← ${ev?.name}: period=${periodQ.size}, toplam_yanıt=${(resp || []).length}`)
    }
    const qualifies = hasScorable && allPeriodQ.size >= expected
    console.log(`  BİRLEŞİK period soru: ${allPeriodQ.size}/${expected} | genel skora dahil: ${qualifies ? 'EVET' : 'HAYIR'}`)

    // yasam_koordinatoru AS TARGET
    const { data: yasamTgt } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, status')
      .eq('period_id', PERIOD)
      .eq('target_id', u.id)
      .eq('matrix_context', 'yasam_koordinatoru')
    console.log(`\n[HEDEF] yasam_koordinatoru atama: ${(yasamTgt || []).length} (${(yasamTgt || []).filter((a) => a.status === 'completed').length} tamamlandı)`)

    // AS EVALUATOR — genel OUT (8 category model)
    const { data: genelOut } = await sb
      .from('evaluation_assignments')
      .select('id, status')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', u.id)
      .eq('matrix_context', 'genel')
    const completedOut = (genelOut || []).filter((a) => a.status === 'completed')
    console.log(`\n[DEĞERLENDİREN] genel OUT: ${(genelOut || []).length} (${completedOut.length} tamamlandı)`)

    // Sample completed genel OUT — question count per assignment
    const samples = completedOut.slice(0, 3)
    for (const a of samples) {
      const { data: asg } = await sb.from('evaluation_assignments').select('target_id').eq('id', a.id).single()
      const { data: tg } = await sb.from('users').select('name').eq('id', asg.target_id).single()
      const { data: resp } = await sb
        .from('evaluation_responses')
        .select('question_id, question_scope')
        .eq('assignment_id', a.id)
      const periodQ = new Set()
      for (const r of resp || []) {
        if (r.question_scope !== 'duty') periodQ.add(String(r.question_id))
      }
      // scoped categories for this pair
      const { data: cats } = await sb
        .from('evaluation_period_evaluator_target_categories')
        .select('category_id')
        .eq('period_id', PERIOD)
        .eq('evaluator_id', u.id)
        .eq('target_id', asg.target_id)
        .eq('matrix_context', 'genel')
        .eq('is_active', true)
      console.log(`  → ${tg?.name}: yanıt=${(resp || []).length}, period_soru=${periodQ.size}, kapsam_kategori=${cats?.length ?? 'yok (tam)'}`)
    }

    // Category scope count for evaluator
    const { data: scopeRows } = await sb
      .from('evaluation_period_evaluator_target_categories')
      .select('target_id, category_id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', u.id)
      .eq('matrix_context', 'genel')
      .eq('is_active', true)
    const byTarget = new Map()
    for (const r of scopeRows || []) {
      const t = String(r.target_id)
      byTarget.set(t, (byTarget.get(t) || 0) + 1)
    }
    const catCounts = [...byTarget.values()]
    if (catCounts.length) {
      const uniq = [...new Set(catCounts)]
      console.log(`  Genel kapsam: ${byTarget.size} hedefte kategori sayısı dağılımı: ${uniq.join(', ')}`)
    }

    // kulup, nobet as evaluator
    for (const ctx of ['kulup_ogretmeni', 'nobetci_ogretmeni', 'yasam_koordinatoru']) {
      const { count } = await sb
        .from('evaluation_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('period_id', PERIOD)
        .eq('evaluator_id', u.id)
        .eq('matrix_context', ctx)
      const { count: done } = await sb
        .from('evaluation_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('period_id', PERIOD)
        .eq('evaluator_id', u.id)
        .eq('matrix_context', ctx)
        .eq('status', 'completed')
      if (count) console.log(`  ${ctx}: ${count} atama (${done} tamamlandı)`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
