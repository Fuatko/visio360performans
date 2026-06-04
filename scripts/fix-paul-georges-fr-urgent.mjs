#!/usr/bin/env node
/**
 * Acil: 2026 dönemi FR metinleri (snapshot + canlı) + Paul GEORGES hesabı (fr, atama teşhisi)
 * Usage: node scripts/fix-paul-georges-fr-urgent.mjs [--apply]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const APPLY = process.argv.includes('--apply')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const PAUL_ID = '6350a539-e0aa-49b7-8895-9ee572124bfe'
const ENDER_ID = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.paul-fr.tmp', '.env.local', '.env']) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      const k = m[1]
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  }
}

loadEnv()

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

const PLACEHOLDER_Q = /^(question|q)\s*[:\-]?\s*\d*\s*$/i
const PLACEHOLDER_A = /^(answer|réponse|q|question)\s*[:\-]?\s*\d*\s*$/i
const NUMERIC_ONLY = /^[0-9]+([.,][0-9]+)?$/

const ANSWER_PATCH = new Map([
  ['Fikrim yok', 'Aucune idée'],
  ['Fikrim yok.', 'Aucune idée'],
  ['Bilgim yok', 'Je ne sais pas'],
  ['Bilgim yok.', 'Je ne sais pas'],
  ['3 (Beklentiyi karşılar)', 'Répond aux attentes'],
  ['Beklentiyi karşılar', 'Répond aux attentes'],
  ['Beklentiyi Karşılar', 'Répond aux attentes'],
  ['İyi', 'Forte'],
  ['Iyi', 'Forte'],
  ['Zayıf', 'Faible'],
  ['Zayif', 'Faible'],
  ['Orta', 'Moyen'],
  ['Orta (Beklentiyi Karşılar)', 'Répond aux attentes'],
])

function scoreFr(std) {
  const n = Math.round(Number(std))
  if (n === 5) return 'Forte'
  if (n === 3) return 'Répond aux attentes'
  if (n === 1) return 'Faible'
  if (n === 0) return 'Aucune idée'
  return null
}

function patternFr(text) {
  const t = String(text || '')
  if (/fikrim\s*yok|bilgim\s*yok|bilgi\s*yok/i.test(t)) return 'Aucune idée'
  if (/beklentiyi\s*kar[sş]ılar|beklentiyi\s*karsilar/i.test(t)) return 'Répond aux attentes'
  if (/^iyi$/i.test(t.trim())) return 'Forte'
  if (/^zay[iı]f$/i.test(t.trim())) return 'Faible'
  if (/^orta(\s*\(|$)/i.test(t.trim())) return 'Moyen'
  return null
}

function needsFrFix(fr, tr) {
  const f = String(fr || '').trim()
  const t = String(tr || '').trim()
  if (!t) return false
  if (!f) return true
  if (f.toLowerCase() === t.toLowerCase()) return true
  if (PLACEHOLDER_Q.test(f) || PLACEHOLDER_A.test(f) || NUMERIC_ONLY.test(f)) return true
  return false
}

function bestFrMap(rows, trKey, frKey) {
  const map = new Map()
  for (const r of rows) {
    const tr = String(r[trKey] || '').trim()
    const fr = String(r[frKey] || '').trim()
    if (!tr || !fr || needsFrFix(fr, tr)) continue
    const prev = map.get(tr)
    if (!prev || fr.length > prev.length) map.set(tr, fr)
  }
  return map
}

async function fetchAll(table, select, filter) {
  const page = 1000
  let from = 0
  const out = []
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + page - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < page) break
    from += page
  }
  return out
}

async function batchUpdate(table, rows, buildPatch) {
  let ok = 0
  for (const r of rows) {
    const patch = buildPatch(r)
    if (!patch || !Object.keys(patch).length) continue
    const { error } = await supabase.from(table).update(patch).eq('id', r.id)
    if (error) {
      console.warn(`  update fail ${table} ${r.id}:`, error.message)
      continue
    }
    ok++
  }
  return ok
}

async function batchUpdateSnapQuestions(rows) {
  let ok = 0
  for (const r of rows) {
    const { error } = await supabase
      .from('evaluation_period_questions_snapshot')
      .update({ text_fr: r.text_fr })
      .eq('period_id', PERIOD)
      .eq('id', r.id)
    if (!error) ok++
  }
  return ok
}

async function batchUpdateSnapAnswers(rows) {
  let ok = 0
  for (const r of rows) {
    const { error } = await supabase
      .from('evaluation_period_answers_snapshot')
      .update({ text_fr: r.text_fr })
      .eq('period_id', PERIOD)
      .eq('id', r.id)
    if (!error) ok++
  }
  return ok
}

async function diagnose() {
  const paul = await supabase.from('users').select('id,name,preferred_language,role').eq('id', PAUL_ID).maybeSingle()
  const snapQ = await fetchAll(
    'evaluation_period_questions_snapshot',
    'id,text,text_fr,is_active',
    (q) => q.eq('period_id', PERIOD)
  )
  const snapA = await fetchAll(
    'evaluation_period_answers_snapshot',
    'id,text,text_fr,std_score,is_active',
    (q) => q.eq('period_id', PERIOD)
  )

  const qActive = snapQ.filter((r) => r.is_active !== false)
  const aActive = snapA.filter((r) => r.is_active !== false)

  const qBad = qActive.filter((r) => needsFrFix(r.text_fr, r.text))
  const aBad = aActive.filter((r) => needsFrFix(r.text_fr, r.text))

  const { data: paulAssign } = await supabase
    .from('evaluation_assignments')
    .select('status')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', PAUL_ID)
  const { data: enderAssign } = await supabase
    .from('evaluation_assignments')
    .select('status')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ENDER_ID)

  const paulPending = (paulAssign || []).filter((a) => a.status !== 'completed').length
  const enderPending = (enderAssign || []).filter((a) => a.status !== 'completed').length

  console.log('\n=== Paul GEORGES hesap ===')
  console.log(paul.data)
  console.log('\n=== Snapshot FR (formda kullanılan) ===')
  console.log({
    soru_toplam: qActive.length,
    soru_fr_eksik_veya_bozuk: qBad.length,
    cevap_toplam: aActive.length,
    cevap_fr_eksik_veya_bozuk: aBad.length,
  })
  console.log('\n=== Atamalar (pending) ===')
  console.log({ paul_pending: paulPending, ender_pending: enderPending, fark: enderPending - paulPending })

  return { qBad, aBad, paul: paul.data }
}

async function applyFrFixes() {
  console.log('\n--- FR harmonize (canlı + snapshot) ---')

  const liveQ = await fetchAll('questions', 'id,text,text_fr')
  const liveQA = await fetchAll('question_answers', 'id,text,text_fr,std_score')
  let liveA = []
  try {
    liveA = await fetchAll('answers', 'id,text,text_fr,std_score')
  } catch {
    /* optional table */
  }

  const qMap = bestFrMap(liveQ, 'text', 'text_fr')
  const aMap = bestFrMap([...liveQA, ...liveA], 'text', 'text_fr')

  let n = 0
  for (const q of liveQ) {
    if (!needsFrFix(q.text_fr, q.text)) continue
    const fr = qMap.get(String(q.text).trim()) || String(q.text).trim()
    if (!fr) continue
    const { error } = await supabase.from('questions').update({ text_fr: fr }).eq('id', q.id)
    if (!error) n++
  }
  console.log(`  questions live: ${n}`)

  n = 0
  for (const row of [...liveQA, ...liveA]) {
    if (!needsFrFix(row.text_fr, row.text)) continue
    const tr = String(row.text || '').trim()
    let fr = aMap.get(tr) || ANSWER_PATCH.get(tr) || scoreFr(row.std_score) || patternFr(tr)
    if (!fr && row.std_score != null) fr = scoreFr(row.std_score)
    if (!fr) continue
    const table = liveQA.some((x) => x.id === row.id) ? 'question_answers' : 'answers'
    const { error } = await supabase.from(table).update({ text_fr: fr }).eq('id', row.id)
    if (!error) n++
  }
  console.log(`  answers live: ${n}`)

  const snapQ = await fetchAll(
    'evaluation_period_questions_snapshot',
    'id,text,text_fr,is_active',
    (q) => q.eq('period_id', PERIOD)
  )
  const snapA = await fetchAll(
    'evaluation_period_answers_snapshot',
    'id,text,text_fr,std_score,is_active',
    (q) => q.eq('period_id', PERIOD)
  )

  const snapQUpdates = []
  for (const s of snapQ) {
    if (s.is_active === false) continue
    if (!needsFrFix(s.text_fr, s.text)) continue
    const fr = qMap.get(String(s.text).trim()) || String(s.text).trim()
    if (fr) snapQUpdates.push({ id: s.id, text_fr: fr })
  }
  console.log(`  snapshot questions: ${await batchUpdateSnapQuestions(snapQUpdates)}`)

  const snapAUpdates = []
  for (const s of snapA) {
    if (s.is_active === false) continue
    if (!needsFrFix(s.text_fr, s.text)) continue
    const tr = String(s.text || '').trim()
    let fr = aMap.get(tr) || ANSWER_PATCH.get(tr) || scoreFr(s.std_score) || patternFr(tr)
    if (!fr) continue
    snapAUpdates.push({ id: s.id, text_fr: fr })
  }
  console.log(`  snapshot answers: ${await batchUpdateSnapAnswers(snapAUpdates)}`)

  const cats = await fetchAll('question_categories', 'id,name,name_fr')
  const catMap = bestFrMap(cats, 'name', 'name_fr')
  let cn = 0
  for (const c of cats) {
    if (!needsFrFix(c.name_fr, c.name)) continue
    const fr = catMap.get(String(c.name).trim())
    if (!fr) continue
    const { error } = await supabase.from('question_categories').update({ name_fr: fr }).eq('id', c.id)
    if (!error) cn++
  }
  console.log(`  categories live: ${cn}`)

  const snapCats = await fetchAll(
    'evaluation_period_categories_snapshot',
    'id,name,name_fr',
    (q) => q.eq('period_id', PERIOD)
  )
  let scn = 0
  for (const s of snapCats) {
    if (!needsFrFix(s.name_fr, s.name)) continue
    const fr = catMap.get(String(s.name).trim())
    if (!fr) continue
    const { error } = await supabase
      .from('evaluation_period_categories_snapshot')
      .update({ name_fr: fr })
      .eq('period_id', PERIOD)
      .eq('id', s.id)
    if (!error) scn++
  }
  console.log(`  categories snapshot: ${scn}`)
}

async function applyPaulAccount() {
  const { data: u } = await supabase.from('users').select('name').eq('id', PAUL_ID).maybeSingle()
  if (u?.name !== 'Paul GEORGES') {
    throw new Error(`Güvenlik: ${PAUL_ID} Paul GEORGES değil (${u?.name})`)
  }
  const { error } = await supabase
    .from('users')
    .update({ preferred_language: 'fr', role: 'org_admin' })
    .eq('id', PAUL_ID)
  if (error) throw error
  console.log('\n--- Paul GEORGES: preferred_language=fr, role=org_admin ---')
}

async function syncMissingAssignments() {
  const { data: enderRows, error: e1 } = await supabase
    .from('evaluation_assignments')
    .select('target_id,matrix_context,status')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', ENDER_ID)
  if (e1) throw e1

  const { data: paulRows, error: e2 } = await supabase
    .from('evaluation_assignments')
    .select('target_id,matrix_context')
    .eq('period_id', PERIOD)
    .eq('evaluator_id', PAUL_ID)
  if (e2) throw e2

  const paulKeys = new Set(
    (paulRows || []).map((r) => `${r.target_id}::${r.matrix_context || 'genel'}`)
  )
  const missing = (enderRows || []).filter((r) => {
    const k = `${r.target_id}::${r.matrix_context || 'genel'}`
    return !paulKeys.has(k)
  })

  if (!missing.length) {
    console.log('\n--- Atamalar: Paul Ender ile uyumlu (eksik yok) ---')
    return
  }

  console.log(`\n--- Eksik ${missing.length} atama eklenecek (pending) ---`)
  if (!APPLY) return

  const inserts = missing.map((r) => ({
    period_id: PERIOD,
    evaluator_id: PAUL_ID,
    target_id: r.target_id,
    matrix_context: r.matrix_context || 'genel',
    status: 'pending',
  }))

  const chunk = 50
  let added = 0
  for (let i = 0; i < inserts.length; i += chunk) {
    const { error } = await supabase.from('evaluation_assignments').insert(inserts.slice(i, i + chunk))
    if (error) {
      console.warn('  insert chunk:', error.message)
    } else {
      added += Math.min(chunk, inserts.length - i)
    }
  }
  console.log(`  eklendi: ~${added}`)
}

async function main() {
  console.log(APPLY ? 'MODE: --apply (yazma)' : 'MODE: teşhis (dry-run, uygulamak için --apply)')
  await diagnose()
  if (!APPLY) {
    console.log('\nUygulamak için: node scripts/fix-paul-georges-fr-urgent.mjs --apply')
    return
  }
  await applyFrFixes()
  await applyPaulAccount()
  await syncMissingAssignments()
  console.log('\n=== Son durum ===')
  await diagnose()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
