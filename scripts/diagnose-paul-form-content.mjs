#!/usr/bin/env node
/** Paul — genel vs yan görev form içeriği teşhisi */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const PAUL = '6350a539-e0aa-49b7-8895-9ee572124bfe'

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

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function dutyCategoryIds() {
  const { data } = await sb
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', PERIOD)
    .eq('is_active', true)
  return new Set((data || []).map((r) => String(r.category_id)))
}

async function periodQuestions() {
  const { data: epq } = await sb
    .from('evaluation_period_questions')
    .select('question_id')
    .eq('period_id', PERIOD)
    .eq('is_active', true)
  const ids = [...new Set((epq || []).map((r) => r.question_id))]
  const { data: qs } = await sb
    .from('questions')
    .select('id, category_id, text, text_fr, sort_order')
    .in('id', ids)
  return qs || []
}

function analyze(label, questions, dutyCats) {
  const genel = questions.filter((q) => !dutyCats.has(String(q.category_id)))
  const duty = questions.filter((q) => dutyCats.has(String(q.category_id)))

  const dupFr = new Map()
  for (const q of genel) {
    const fr = String(q.text_fr || '').trim().toLowerCase()
    if (!fr) continue
    dupFr.set(fr, (dupFr.get(fr) || 0) + 1)
  }
  const dupes = [...dupFr.entries()].filter(([, n]) => n > 1)

  const frEqTr = genel.filter(
    (q) => String(q.text_fr || '').trim().toLowerCase() === String(q.text || '').trim().toLowerCase()
  ).length
  const frEmpty = genel.filter((q) => !String(q.text_fr || '').trim()).length

  console.log(`\n=== ${label} ===`)
  console.log({
    toplam_donem: questions.length,
    genel_kategori_soru: genel.length,
    yan_gorev_kategori_soru: duty.length,
    genel_fr_bos: frEmpty,
    genel_fr_tr_ayni: frEqTr,
    genel_tekrarlayan_fr_metin: dupes.length,
  })
  if (dupes.length) {
    console.log('  Örnek tekrar FR (ilk 5):')
    dupes.slice(0, 5).forEach(([t, n]) => console.log(`    [${n}x] ${t.slice(0, 70)}`))
  }
  return { genel, duty }
}

async function categoriesForQuestions(genelQs) {
  const catIds = [...new Set(genelQs.map((q) => q.category_id))]
  const { data: cats } = await sb
    .from('question_categories')
    .select('id, name, name_fr')
    .in('id', catIds)
  console.log('\n--- Genel kategoriler (soru sayısı) ---')
  const byCat = new Map()
  for (const q of genelQs) {
    byCat.set(q.category_id, (byCat.get(q.category_id) || 0) + 1)
  }
  for (const c of cats || []) {
    const n = byCat.get(c.id) || 0
    const fr = String(c.name_fr || '').trim()
    const tr = String(c.name || '').trim()
    console.log(`  ${n} soru | FR: ${fr || '(boş)'} | TR: ${tr}`)
  }
}

async function main() {
  const dutyCats = await dutyCategoryIds()
  const allQ = await periodQuestions()
  analyze('Dönem havuzu', allQ, dutyCats)

  const { data: sampleGenel } = await sb
    .from('evaluation_assignments')
    .select('id, target:target_id(name)')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', PAUL)
    .eq('matrix_context', 'genel')
    .eq('status', 'pending')
    .limit(1)
    .single()

  const { data: sampleSinif } = await sb
    .from('evaluation_assignments')
    .select('id, target:target_id(name)')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', PAUL)
    .eq('matrix_context', 'sinif_ogretmeni')
    .eq('status', 'pending')
    .limit(1)
    .single()

  console.log('\nÖrnek atamalar:', {
    genel: sampleGenel?.target?.name,
    sinif: sampleSinif?.target?.name,
  })

  const { genel } = analyze('Yalnızca genel kategoriler', allQ, dutyCats)
  await categoriesForQuestions(genel)

  // Duty questions per matrix type
  for (const ctx of ['sinif_ogretmeni', 'zumre', 'nobetci_ogretmeni', 'kulup_ogretmeni']) {
    const { data: epdc } = await sb
      .from('evaluation_period_duty_categories')
      .select('category_id, duty_id, evaluation_duties(name, name_fr)')
      .eq('period_id', PERIOD)
      .eq('is_active', true)
    const dutyIds = new Set()
    for (const r of epdc || []) {
      const d = r.evaluation_duties
      const n = String(d?.name || '').toLowerCase()
      const code = ctx.replace(/_/g, ' ')
      if (n.includes(code.split(' ')[0]) || n.includes(ctx.replace('ogretmeni', ''))) dutyIds.add(r.duty_id)
    }
    const catIds = new Set(
      (epdc || []).filter((r) => dutyIds.has(r.duty_id)).map((r) => String(r.category_id))
    )
    const dutyQ = allQ.filter((q) => catIds.has(String(q.category_id)))
    if (dutyQ.length) {
      const frDup = dutyQ.filter(
        (q, i, arr) =>
          arr.findIndex((x) => String(x.text_fr).toLowerCase() === String(q.text_fr).toLowerCase()) !== i
      ).length
      console.log(`\n${ctx}: ~${dutyQ.length} soru, fr tekrar: ${frDup}`)
    }
  }
}

main().catch(console.error)
