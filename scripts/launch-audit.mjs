#!/usr/bin/env node
/**
 * Pre-launch audit: matrix contexts, duties, French snapshot coverage.
 * Usage: node scripts/launch-audit.mjs [period_id]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
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
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)
const DEFAULT_PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

const DUTY_CONTEXT_MAP = {
  zumre: 'zumre',
  sinif_ogretmeni: 'sinif_ogretmeni',
  rehberlik_ogretmeni: 'rehberlik_ogretmeni',
  nobetci_ogretmeni: 'nobetci_ogretmeni',
  kulup_ogretmeni: 'kulup_ogretmeni',
  formator: 'formator',
  yasam_koordinatoru: 'yasam_koordinatoru',
  bilimsel_etkinlik_koordinatoru: 'bilimsel_etkinlik_koordinatoru',
}

const DUTY_FRAGMENTS = {
  zumre: ['zumre', 'zümre'],
  sinif_ogretmeni: ['sinif ogretmen', 'sınıf öğretmen', 'class teacher'],
  rehberlik_ogretmeni: ['rehberlik', 'rehber ogretmen'],
  nobetci_ogretmeni: ['nobetci', 'nöbetçi'],
  kulup_ogretmeni: ['kulup', 'kulüp', 'club teacher'],
  formator: ['formator', 'formateur'],
  yasam_koordinatoru: ['yasam koordinator', 'yaşam koordinat'],
  bilimsel_etkinlik_koordinatoru: ['bilimsel etkinlik', 'bilimsel faaliyet'],
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .trim()
}

function dutyMatchesPreset(dutyName, preset) {
  const n = norm(dutyName)
  return DUTY_FRAGMENTS[preset]?.some((f) => n.includes(norm(f)))
}

function inferDutyPresetFromName(name) {
  for (const p of Object.keys(DUTY_FRAGMENTS)) {
    if (dutyMatchesPreset(name, p)) return p
  }
  return null
}

async function fetchAll(table, select, filter) {
  const rows = []
  let from = 0
  const page = 1000
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + page - 1)
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < page) break
    from += page
  }
  return rows
}

async function main() {
  const periodId = process.argv[2] || DEFAULT_PERIOD

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, name, status, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) {
    console.error('Period not found:', periodId, pErr?.message)
    process.exit(1)
  }

  console.log('\n=== VISIO360 LAUNCH AUDIT ===')
  console.log(`Period: ${period.name} (${period.id}) status=${period.status}`)

  const [assignments, duties, userDuties, users, frUsers] = await Promise.all([
    fetchAll('evaluation_assignments', 'id, evaluator_id, target_id, matrix_context, status', { period_id: periodId }),
    fetchAll('evaluation_period_duties', 'id, name, code, name_fr, is_active', { period_id: periodId }).catch(() =>
      fetchAll('evaluation_duties', 'id, name, code, name_fr, is_active', { period_id: periodId })
    ),
    fetchAll('evaluation_period_user_duties', 'user_id, duty_id', { period_id: periodId }).catch(() => []),
    fetchAll('users', 'id, name, email, preferred_language, department, status', { organization_id: period.organization_id }),
    supabase
      .from('users')
      .select('id, name, preferred_language')
      .eq('organization_id', period.organization_id)
      .eq('preferred_language', 'fr')
      .then((r) => r.data || []),
  ])

  const userById = new Map(users.map((u) => [u.id, u]))
  const dutyById = new Map(duties.map((d) => [d.id, d]))
  const dutiesByUser = new Map()
  for (const ud of userDuties) {
    const uid = ud.user_id
    if (!dutiesByUser.has(uid)) dutiesByUser.set(uid, [])
    const d = dutyById.get(ud.duty_id)
    if (d) dutiesByUser.get(uid).push(d)
  }

  // 1) matrix_context distribution
  const ctxCounts = {}
  for (const a of assignments) {
    const c = a.matrix_context || 'genel'
    ctxCounts[c] = (ctxCounts[c] || 0) + 1
  }
  console.log('\n--- Atamalar (matrix_context) ---')
  Object.entries(ctxCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`))
  console.log(`  TOPLAM: ${assignments.length}`)

  // 2) Duplicate evaluator-target with same context
  const pairCtx = new Map()
  const dupCtx = []
  for (const a of assignments) {
    const key = `${a.evaluator_id}::${a.target_id}::${a.matrix_context || 'genel'}`
    if (pairCtx.has(key)) dupCtx.push(key)
    else pairCtx.set(key, a.id)
  }
  console.log('\n--- Yinelenen (evaluator+target+context) ---')
  console.log(dupCtx.length ? `  HATA: ${dupCtx.length} çift` : '  OK: yok')

  // 3) Same pair multiple contexts (expected for multi-matrix)
  const pairContexts = new Map()
  for (const a of assignments) {
    const pk = `${a.evaluator_id}::${a.target_id}`
    if (!pairContexts.has(pk)) pairContexts.set(pk, new Set())
    pairContexts.get(pk).add(a.matrix_context || 'genel')
  }
  const multiCtx = [...pairContexts.entries()].filter(([, s]) => s.size > 1)
  console.log(`\n--- Çoklu matris bağlamı (aynı çift, farklı context): ${multiCtx.length} çift ---`)

  // 4) genel context but target has yan görev — scope risk
  const DUTY_CTXS = new Set([
    'nobetci_ogretmeni',
    'kulup_ogretmeni',
    'formator',
    'yasam_koordinatoru',
    'bilimsel_etkinlik_koordinatoru',
  ])
  const genelWithYanDuty = []
  const genelShouldBeDutyCtx = []
  for (const a of assignments) {
    const ctx = a.matrix_context || 'genel'
    if (ctx !== 'genel') continue
    const targetDuties = dutiesByUser.get(a.target_id) || []
    const yanPresets = []
    for (const d of targetDuties) {
      const p = inferDutyPresetFromName(d.name)
      if (p && p !== 'sinif_ogretmeni') yanPresets.push(p)
    }
    if (yanPresets.length) {
      const ev = userById.get(a.evaluator_id)
      const tg = userById.get(a.target_id)
      genelWithYanDuty.push({
        assignment_id: a.id,
        evaluator: ev?.name,
        target: tg?.name,
        yanPresets: [...new Set(yanPresets)],
      })
      // If target has exactly one yan preset and no other assignment with duty context for this pair
      const contexts = pairContexts.get(`${a.evaluator_id}::${a.target_id}`) || new Set()
      const hasDutyCtx = [...contexts].some((c) => DUTY_CTXS.has(c) || ['zumre', 'sinif_ogretmeni', 'rehberlik_ogretmeni'].includes(c))
      if (yanPresets.length === 1 && !hasDutyCtx) {
        const expected = DUTY_CONTEXT_MAP[yanPresets[0]]
        if (expected && expected !== 'genel') {
          genelShouldBeDutyCtx.push({
            assignment_id: a.id,
            evaluator: ev?.name,
            target: tg?.name,
            yan: yanPresets[0],
            expected_ctx: expected,
          })
        }
      }
    }
  }
  console.log(`\n--- matrix_context=genel ama hedefte yan görev: ${genelWithYanDuty.length} atama ---`)
  console.log(`--- Muhtemel yanlış context (tek yan görev, duty ctx yok): ${genelShouldBeDutyCtx.length} ---`)
  genelShouldBeDutyCtx.slice(0, 15).forEach((r) => {
    console.log(`  • ${r.evaluator} → ${r.target}: ${r.yan} → beklenen ctx=${r.expected_ctx} (id=${r.assignment_id})`)
  })
  if (genelShouldBeDutyCtx.length > 15) console.log(`  ... +${genelShouldBeDutyCtx.length - 15} daha`)

  // 5) Duty matrix context but target missing duty
  const dutyCtxMissing = []
  for (const a of assignments) {
    const ctx = a.matrix_context || 'genel'
    const preset = Object.entries(DUTY_CONTEXT_MAP).find(([, c]) => c === ctx)?.[0]
    if (!preset || ctx === 'genel' || ctx === 'okul_yasam') continue
    const targetDuties = dutiesByUser.get(a.target_id) || []
    const has = targetDuties.some((d) => dutyMatchesPreset(d.name, preset))
    if (!has) {
      dutyCtxMissing.push({
        ctx,
        evaluator: userById.get(a.evaluator_id)?.name,
        target: userById.get(a.target_id)?.name,
        id: a.id,
      })
    }
  }
  console.log(`\n--- Duty matrisi ama hedefte görev yok: ${dutyCtxMissing.length} ---`)
  dutyCtxMissing.slice(0, 10).forEach((r) => console.log(`  • [${r.ctx}] ${r.evaluator} → ${r.target}`))

  // 6) Evaluators in French
  console.log(`\n--- Fransızca kullanıcı (preferred_language=fr): ${frUsers.length} ---`)
  const frEvaluators = new Set(
    assignments.filter((a) => userById.get(a.evaluator_id)?.preferred_language === 'fr').map((a) => a.evaluator_id)
  )
  console.log(`--- FR değerlendiren (en az 1 atama): ${frEvaluators.size} ---`)

  // 7) Snapshot French coverage
  const [qSnap, aSnap, cSnap, mSnap] = await Promise.all([
    supabase.from('evaluation_period_questions_snapshot').select('id, text, text_fr, is_active').eq('period_id', periodId),
    supabase.from('evaluation_period_answers_snapshot').select('id, text, text_fr, is_active').eq('period_id', periodId),
    supabase.from('evaluation_period_categories_snapshot').select('id, name, name_fr, is_active').eq('period_id', periodId),
    supabase.from('evaluation_period_main_categories_snapshot').select('id, name, name_fr, is_active').eq('period_id', periodId),
  ])

  function missingFr(rows, textKey = 'text', frKey = 'text_fr') {
    const active = (rows.data || []).filter((r) => r.is_active !== false)
    const noFr = active.filter((r) => !String(r[frKey] || '').trim())
    return { total: active.length, noFr: noFr.length, samples: noFr.slice(0, 5) }
  }

  const qFr = missingFr(qSnap, 'text', 'text_fr')
  const aFr = missingFr(aSnap, 'text', 'text_fr')
  const cFr = missingFr(cSnap, 'name', 'name_fr')
  const mFr = missingFr(mSnap, 'name', 'name_fr')

  console.log('\n--- Snapshot FR çevirisi (aktif kayıtlar) ---')
  console.log(`  Sorular: ${qFr.noFr}/${qFr.total} FR eksik`)
  console.log(`  Cevaplar: ${aFr.noFr}/${aFr.total} FR eksik`)
  console.log(`  Alt kategoriler: ${cFr.noFr}/${cFr.total} FR eksik`)
  console.log(`  Ana kategoriler: ${mFr.noFr}/${mFr.total} FR eksik`)
  if (qFr.samples.length) {
    console.log('  Örnek FR eksik soru:')
    qFr.samples.forEach((s) => console.log(`    - ${String(s.text || '').slice(0, 80)}`))
  }

  // 8) Paul / Binnaz bilimsel check
  const paul = users.find((u) => norm(u.name).includes('paul'))
  const binnaz = users.find((u) => norm(u.name).includes('binnaz'))
  if (paul && binnaz) {
    const pb = assignments.filter((a) => a.evaluator_id === paul.id && a.target_id === binnaz.id)
    console.log('\n--- Paul → Binnaz atamaları ---')
    pb.forEach((a) => console.log(`  ctx=${a.matrix_context} status=${a.status} id=${a.id}`))
  }

  // Summary JSON for fixes
  const report = {
    period_id: periodId,
    period_name: period.name,
    assignment_total: assignments.length,
    context_counts: ctxCounts,
    genel_wrong_context_candidates: genelShouldBeDutyCtx,
    duty_ctx_missing_target_duty: dutyCtxMissing,
    fr_users: frUsers.length,
    fr_evaluators_with_assignments: frEvaluators.size,
    snapshot_fr_missing: {
      questions: qFr,
      answers: aFr,
      categories: cFr,
      main_categories: mFr,
    },
  }

  const outPath = resolve(root, 'docs/launch-audit-report.json')
  try {
    const { writeFileSync } = await import('fs')
    writeFileSync(outPath, JSON.stringify(report, null, 2))
    console.log(`\nRapor yazıldı: docs/launch-audit-report.json`)
  } catch (e) {
    console.log('\n(JSON rapor yazılamadı)', e.message)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
