#!/usr/bin/env node
/**
 * Onur & Ayşegül — genel değerlendirme OUT derin denetim (beklenen: 9 kategori / 9 soru)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const EVALUATORS = ['Onur ERMAN', 'Ayşegül KAZMAZ']

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

async function main() {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  // Period categories + question counts (core = not in duty category links)
  const { data: epdc } = await sb
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', PERIOD)
    .eq('is_active', true)
  const dutyCatIds = new Set((epdc || []).map((r) => String(r.category_id)))

  const { data: cats } = await sb
    .from('evaluation_period_categories_snapshot')
    .select('id, name, sort_order')
    .eq('period_id', PERIOD)
    .order('sort_order')

  const { data: snapQs } = await sb
    .from('evaluation_period_questions_snapshot')
    .select('id, category_id')
    .eq('period_id', PERIOD)

  const qsByCat = new Map()
  for (const q of snapQs || []) {
    const c = String(q.category_id || '')
    if (!qsByCat.has(c)) qsByCat.set(c, [])
    qsByCat.get(c).push(String(q.id))
  }

  const coreCats = (cats || []).filter((c) => !dutyCatIds.has(String(c.id)))
  console.log('\n=== DÖNEM — temel (yan görev hariç) kategoriler ===')
  let totalCoreQs = 0
  for (const c of coreCats) {
    const n = (qsByCat.get(String(c.id)) || []).length
    totalCoreQs += n
    console.log(`  ${c.name}: ${n} soru`)
  }
  console.log(`  TOPLAM: ${coreCats.length} kategori, ${totalCoreQs} soru`)

  // 9-cat model: if each cat has 1 q → 9 questions
  const oneQPerCat = coreCats.filter((c) => (qsByCat.get(String(c.id)) || []).length === 1)
  console.log(`\n  Tek sorulu kategori: ${oneQPerCat.length} → 9 soru modeli için ${oneQPerCat.length === 9 ? 'UYGUN' : 'KONTROL'}`)

  const coreCatIds = new Set(coreCats.map((c) => String(c.id)))

  const { data: users } = await sb.from('users').select('id, name').in('name', EVALUATORS)
  const evBy = new Map((users || []).map((u) => [u.name, u.id]))

  for (const evName of EVALUATORS) {
    const eid = evBy.get(evName)
    console.log(`\n${'='.repeat(70)}\n${evName}\n${'='.repeat(70)}`)

    const { data: genelOut } = await sb
      .from('evaluation_assignments')
      .select('id, target_id, status')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', eid)
      .eq('matrix_context', 'genel')

    const pending = (genelOut || []).filter((a) => a.status === 'pending').length
    const completed = (genelOut || []).filter((a) => a.status === 'completed').length
    console.log(`Genel OUT atama: ${(genelOut || []).length} (tamamlanan: ${completed}, bekleyen: ${pending})`)

    // Scope distribution per target
    const { data: scopeRows } = await sb
      .from('evaluation_period_evaluator_target_categories')
      .select('target_id, category_id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', eid)
      .eq('matrix_context', 'genel')
      .eq('scope_kind', 'period')
      .eq('is_active', true)

    const byTarget = new Map()
    for (const r of scopeRows || []) {
      const t = String(r.target_id)
      if (!byTarget.has(t)) byTarget.set(t, new Set())
      byTarget.get(t).add(String(r.category_id))
    }

    const dist = new Map()
    let noScope = 0
    for (const a of genelOut || []) {
      const t = String(a.target_id)
      const cats = byTarget.get(t)
      if (!cats || !cats.size) {
        noScope++
        continue
      }
      const k = cats.size
      dist.set(k, (dist.get(k) || 0) + 1)
    }
    console.log(`Kapsam dağılımı (hedef başına kategori sayısı):`)
    for (const [k, v] of [...dist.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  ${k} kategori: ${v} hedef`)
    }
    if (noScope) console.log(`  kapsam YOK (tam genel?): ${noScope} hedef`)

    // Wrong categories vs core 9
    let wrongCatTargets = 0
    let not9Targets = 0
    let perfect9 = 0
    for (const a of genelOut || []) {
      const t = String(a.target_id)
      const catSet = byTarget.get(t) || new Set()
      if (catSet.size === 0) {
        not9Targets++
        continue
      }
      const wrong = [...catSet].filter((id) => !coreCatIds.has(id))
      const missing = [...coreCatIds].filter((id) => !catSet.has(id))
      if (catSet.size === coreCats.length && wrong.length === 0 && missing.length === 0) perfect9++
      else if (catSet.size !== 9 && catSet.size !== coreCats.length) not9Targets++
      if (wrong.length) wrongCatTargets++
    }
    console.log(`Beklenen 9 kategori tam eşleşen hedef: ${perfect9}`)
    console.log(`9 dışı kapsam: ${not9Targets} hedef`)

    // Evaluator-level default categories
    const { data: evCats } = await sb
      .from('evaluation_period_evaluator_categories')
      .select('category_id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', eid)
      .eq('scope_kind', 'period')
      .eq('is_active', true)
    console.log(`Değerlendirici varsayılan kategori: ${evCats?.length ?? 0}`)

    if (evCats?.length) {
      const ids = evCats.map((c) => c.category_id)
      const { data: names } = await sb
        .from('evaluation_period_categories_snapshot')
        .select('name')
        .eq('period_id', PERIOD)
        .in('id', ids)
      console.log(`  → ${(names || []).map((n) => n.name).join(' | ')}`)
    }

    // Completed form response distribution
    const respDist = new Map()
    const completedRows = (genelOut || []).filter((a) => a.status === 'completed')
    for (const a of completedRows) {
      const { data: resp } = await sb
        .from('evaluation_responses')
        .select('question_id, question_scope')
        .eq('assignment_id', a.id)
      const periodQ = new Set()
      for (const r of resp || []) {
        if (r.question_scope !== 'duty') periodQ.add(String(r.question_id))
      }
      respDist.set(periodQ.size, (respDist.get(periodQ.size) || 0) + 1)
    }
    console.log(`Tamamlanan formlarda period soru sayısı:`)
    for (const [k, v] of [...respDist.entries()].sort((a, b) => a[0] - b[0])) {
      const flag = k === 9 ? ' ✓' : k === 13 ? ' ⚠ (eski 5-kat?)' : k === 21 ? ' ⚠ (tam genel)' : ''
      console.log(`  ${k} soru: ${v} form${flag}`)
    }

    // Sample wrong scope target names
    const badSamples = []
    for (const a of genelOut || []) {
      const t = String(a.target_id)
      const catSet = byTarget.get(t)
      if (!catSet || catSet.size === coreCats.length) continue
      if (catSet.size === 9 && [...catSet].every((id) => coreCatIds.has(id))) continue
      if (badSamples.length >= 5) break
      const { data: tg } = await sb.from('users').select('name').eq('id', a.target_id).single()
      const catIds = [...catSet]
      const { data: cnames } = await sb
        .from('evaluation_period_categories_snapshot')
        .select('name')
        .in('id', catIds)
      badSamples.push(`${tg?.name} (${catSet.size} kat: ${(cnames || []).map((x) => x.name).join(', ')})`)
    }
    if (badSamples.length) {
      console.log(`Örnek hatalı kapsam hedefleri:`)
      badSamples.forEach((s) => console.log(`  - ${s}`))
    }
  }

  // Compare Paul genel target count as reference for missing Onur assignments
  const { data: paul } = await sb.from('users').select('id').eq('name', 'Paul GEORGES').single()
  const { count: paulGenel } = await sb
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('evaluator_id', paul.id)
    .eq('matrix_context', 'genel')

  console.log(`\n=== REFERANS ===`)
  console.log(`Paul genel OUT: ${paulGenel} hedef`)
  console.log(`Ayşegül genel OUT: ${(await sb.from('evaluation_assignments').select('id', { count: 'exact', head: true }).eq('period_id', PERIOD).eq('evaluator_id', evBy.get('Ayşegül KAZMAZ')).eq('matrix_context', 'genel')).count}`)
  console.log(`Onur genel OUT: ${(await sb.from('evaluation_assignments').select('id', { count: 'exact', head: true }).eq('period_id', PERIOD).eq('evaluator_id', evBy.get('Onur ERMAN')).eq('matrix_context', 'genel')).count}`)

  // MD → Onur/Ayşegül as target (should stay 5 cat - don't touch)
  console.log(`\n=== DOKUNULMAZ: MD → Onur/Ayşegül hedef (5 kategori) ===`)
  const { data: mdScope } = await sb
    .from('evaluation_period_evaluator_target_categories')
    .select('evaluator_id, target_id, category_id')
    .eq('period_id', PERIOD)
    .eq('matrix_context', 'genel')
    .eq('is_active', true)
  const mdEvalIds = (
    await sb.from('users').select('id, name').in('name', ['Paul GEORGES', 'Ender ÜSTÜNGEL', 'Şule KOÇAK'])
  ).data
  const mdEvBy = new Map((mdEvalIds || []).map((u) => [u.id, u.name]))
  for (const tgName of EVALUATORS) {
    const tid = evBy.get(tgName)
    for (const [eid, ename] of mdEvBy) {
      const n = (mdScope || []).filter((r) => r.evaluator_id === eid && r.target_id === tid).length
      if (n) console.log(`  ${ename} → ${tgName}: ${n} kategori`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
