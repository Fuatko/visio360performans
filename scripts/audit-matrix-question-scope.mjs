#!/usr/bin/env node
/**
 * READ-ONLY: Değerlendirme atamalarında matrix_context ↔ soru/kategori uyumu denetimi.
 * Canlı veriye yazmaz. Düzeltme önerileri raporlanır.
 *
 * Usage:
 *   node scripts/audit-matrix-question-scope.mjs [period_id]
 *   node scripts/audit-matrix-question-scope.mjs --pending-only
 *   node scripts/audit-matrix-question-scope.mjs --evaluator "Berna"
 *   node scripts/audit-matrix-question-scope.mjs --json docs/matrix-scope-audit.json
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
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
  yasam_koordinatoru: ['yasam koordinator', 'yaşam koordinat', 'okul ici yasam'],
  bilimsel_etkinlik_koordinatoru: ['bilimsel etkinlik', 'bilimsel faaliyet'],
}

const MATRIX_LABELS = {
  genel: 'Genel',
  okul_yasam: 'Okul Yaşam',
  zumre: 'Zümre Başkanı',
  sinif_ogretmeni: 'Sınıf Öğretmeni',
  rehberlik_ogretmeni: 'Rehberlik',
  nobetci_ogretmeni: 'Nöbetçi',
  kulup_ogretmeni: 'Kulüp',
  formator: 'Formatör',
  yasam_koordinatoru: 'Yaşam Koordinatörü',
  bilimsel_etkinlik_koordinatoru: 'Bilimsel Etkinlik',
}

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

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

function dutyMatchesPreset(dutyName, preset) {
  const n = norm(dutyName)
  return (DUTY_FRAGMENTS[preset] || []).some((f) => n.includes(norm(f)))
}

function inferPresetFromDutyName(name) {
  for (const p of Object.keys(DUTY_FRAGMENTS)) {
    if (dutyMatchesPreset(name, p)) return p
  }
  return null
}

function isDutyMatrixContext(ctx) {
  const v = String(ctx || 'genel').trim()
  return v !== 'genel' && v !== 'okul_yasam' && Boolean(DUTY_CONTEXT_MAP[v] || /^[a-z][a-z0-9_]{1,48}$/i.test(v))
}

function findDutyIdForContext(duties, ctx) {
  const preset = DUTY_CONTEXT_MAP[ctx]
  if (preset) {
    for (const d of duties) {
      if (dutyMatchesPreset(d.name, preset)) return d
      if (norm(d.code) === preset) return d
    }
  }
  const key = norm(ctx)
  for (const d of duties) {
    if (norm(d.code) === key) return d
  }
  return null
}

async function fetchAll(sb, table, select, filter) {
  const rows = []
  let from = 0
  const page = 1000
  while (true) {
    let q = sb.from(table).select(select).range(from, from + page - 1)
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

async function collectQuestionIdsForDuty(sb, periodId, dutyId) {
  const ids = new Set()
  const { data: catRows } = await sb
    .from('evaluation_period_duty_categories')
    .select('category_id')
    .eq('period_id', periodId)
    .eq('duty_id', dutyId)
    .eq('is_active', true)
  const cids = (catRows || []).map((r) => r.category_id).filter(Boolean)

  const { data: qLinks } = await sb
    .from('evaluation_period_duty_questions')
    .select('question_id')
    .eq('period_id', periodId)
    .eq('duty_id', dutyId)
    .eq('is_active', true)
  ;(qLinks || []).forEach((r) => r.question_id && ids.add(String(r.question_id)))

  if (cids.length) {
    const { data: qs } = await sb.from('questions').select('id').in('category_id', cids)
    ;(qs || []).forEach((q) => q.id && ids.add(String(q.id)))
  }
  return { questionIds: ids, categoryIds: new Set(cids) }
}

function filterSimulated(questions, config, opts = {}) {
  if (!config?.isConfigured) return questions
  const legacy = opts.legacy === true
  return questions.filter((q) => {
    const scope = String(q.question_scope || 'period')
    const catId = String(q.category_id || '')

    if (
      !legacy &&
      scope !== 'duty' &&
      config.dutyMode === 'categories' &&
      catId &&
      config.dutyCategoryIds.size &&
      config.dutyCategoryIds.has(catId)
    ) {
      return true
    }

    if (scope === 'duty') {
      if (config.dutyMode === 'none') return false
      if (config.dutyMode === 'full') return true
      if (config.dutyCategoryIds.has(catId)) return true
      const dutyId = String(q.duty_id || '')
      if (dutyId && config.dutyPackageIds.has(dutyId)) return true
      return false
    }

    if (!config.restrictPeriod) return true
    if (!config.periodCategoryIds.size) return false
    return config.periodCategoryIds.has(catId)
  })
}

function buildDutyOnlyConfig(periodId, evaluatorId, targetId, dutyId, categoryIds) {
  return {
    isConfigured: true,
    restrictPeriod: true,
    periodCategoryIds: new Set(),
    dutyMode: 'categories',
    dutyPackageIds: new Set([dutyId]),
    dutyCategoryIds: categoryIds,
    periodId,
    evaluatorId,
    targetId,
  }
}

async function main() {
  loadEnv()
  const args = process.argv.slice(2)
  const pendingOnly = args.includes('--pending-only')
  const evaluatorFilter = (() => {
    const i = args.indexOf('--evaluator')
    return i >= 0 ? args[i + 1] : null
  })()
  const jsonOut = (() => {
    const i = args.indexOf('--json')
    return i >= 0 ? resolve(root, args[i + 1]) : resolve(root, 'docs/matrix-scope-audit-report.json')
  })()
  const periodId = args.find((a) => /^[0-9a-f-]{36}$/i.test(a)) || DEFAULT_PERIOD

  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli (.env.visio360.tmp)')
    process.exit(1)
  }

  const sb = createClient(url, key)

  console.log('\n=== MATRIX SORU KAPSAMI DENETİMİ (READ-ONLY) ===')
  console.log(`Dönem: ${periodId}`)
  console.log('Veritabanına yazılmaz.\n')

  const { data: period } = await sb.from('evaluation_periods').select('id, name, duty_scope_mode, organization_id').eq('id', periodId).maybeSingle()
  if (!period) {
    console.error('Dönem bulunamadı')
    process.exit(1)
  }
  const dutyScopeMode = period.duty_scope_mode || 'additive'
  console.log(`Dönem adı: ${period.name}`)
  console.log(`duty_scope_mode: ${dutyScopeMode}`)

  const [assignments, duties, userDuties, users, periodQuestions, genelCategoryIds] = await Promise.all([
    fetchAll(sb, 'evaluation_assignments', 'id, evaluator_id, target_id, matrix_context, status', { period_id: periodId }),
    fetchAll(sb, 'evaluation_duties', 'id, name, code, name_fr', { period_id: periodId }),
    fetchAll(sb, 'evaluation_period_user_duties', 'user_id, duty_id', { period_id: periodId }).catch(() => []),
    fetchAll(sb, 'users', 'id, name, email, preferred_language', { organization_id: period.organization_id }),
    fetchAll(sb, 'evaluation_period_questions', 'question_id', { period_id: periodId }).catch(() => []),
    (async () => {
      const { data: edc } = await sb.from('evaluation_period_duty_categories').select('category_id').eq('period_id', periodId)
      return new Set((edc || []).map((r) => String(r.category_id)))
    })(),
  ])

  const basePeriodQ = new Set((periodQuestions || []).map((r) => String(r.question_id)))

  const userById = new Map(users.map((u) => [u.id, u]))
  const dutyById = new Map(duties.map((d) => [d.id, d]))
  const dutiesByUser = new Map()
  for (const ud of userDuties) {
    if (!dutiesByUser.has(ud.user_id)) dutiesByUser.set(ud.user_id, [])
    const d = dutyById.get(ud.duty_id)
    if (d) dutiesByUser.get(ud.user_id).push(d)
  }

  const dutyPackCache = new Map()
  for (const d of duties) {
    dutyPackCache.set(d.id, await collectQuestionIdsForDuty(sb, periodId, d.id))
  }

  function expectedForContext(ctx) {
    const duty = findDutyIdForContext(duties, ctx)
    if (!duty) return null
    const pack = dutyPackCache.get(duty.id)
    return { duty, ...pack }
  }

  function allTargetDutyQuestions(targetId) {
    const set = new Set()
    const byDuty = {}
    for (const d of dutiesByUser.get(targetId) || []) {
      const pack = dutyPackCache.get(d.id)
      byDuty[d.id] = pack?.questionIds || new Set()
      pack?.questionIds.forEach((qid) => set.add(qid))
    }
    return { all: set, byDuty }
  }

  let rows = assignments
  if (pendingOnly) rows = rows.filter((a) => a.status === 'pending')
  if (evaluatorFilter) {
    const needle = norm(evaluatorFilter)
    rows = rows.filter((a) => norm(userById.get(a.evaluator_id)?.name).includes(needle))
  }

  // Soru → görev eşlemesi (hedef bazlı)
  const questionToDutyByTarget = new Map()
  for (const [uid, dlist] of dutiesByUser) {
    const qmap = new Map()
    for (const d of dlist) {
      const pack = dutyPackCache.get(d.id)
      if (!pack) continue
      for (const qid of pack.questionIds) {
        if (!qmap.has(qid)) qmap.set(qid, d.id)
      }
    }
    questionToDutyByTarget.set(uid, qmap)
  }

  const allDutyQids = new Set()
  for (const pack of dutyPackCache.values()) pack.questionIds.forEach((id) => allDutyQids.add(id))
  const { data: dutyQuestionRows } = allDutyQids.size
    ? await sb.from('questions').select('id, category_id, text, text_fr').in('id', [...allDutyQids])
    : { data: [] }
  const questionRowById = new Map((dutyQuestionRows || []).map((q) => [String(q.id), q]))

  const issues = []
  const stats = {
    total_checked: 0,
    duty_matrix: 0,
    genel: 0,
    okul_yasam: 0,
    fail_open_risk: 0,
    wrong_duty_questions: 0,
    empty_after_filter: 0,
    target_missing_duty: 0,
    duty_package_missing: 0,
    fr_duplicate_question: 0,
  }

  for (const a of rows) {
    const ctx = a.matrix_context || 'genel'
    const ev = userById.get(a.evaluator_id)
    const tg = userById.get(a.target_id)
    if (!ev || !tg) continue

    stats.total_checked++

    if (ctx === 'genel') {
      stats.genel++
      continue
    }
    if (ctx === 'okul_yasam') {
      stats.okul_yasam++
      continue
    }
    if (!isDutyMatrixContext(ctx)) continue

    stats.duty_matrix++
    const exp = expectedForContext(ctx)
    if (!exp?.duty) {
      stats.duty_package_missing++
      issues.push({
        severity: 'error',
        code: 'DUTY_PACKAGE_MISSING',
        assignment_id: a.id,
        status: a.status,
        evaluator: ev.name,
        target: tg.name,
        matrix_context: ctx,
        detail: `Dönemde «${MATRIX_LABELS[ctx] || ctx}» görev paketi bulunamadı`,
      })
      continue
    }

    const targetDuties = dutiesByUser.get(a.target_id) || []
    const hasTargetDuty = targetDuties.some((d) => d.id === exp.duty.id)
    if (!hasTargetDuty) {
      stats.target_missing_duty++
      issues.push({
        severity: 'warn',
        code: 'TARGET_MISSING_DUTY',
        assignment_id: a.id,
        status: a.status,
        evaluator: ev.name,
        target: tg.name,
        matrix_context: ctx,
        expected_duty: exp.duty.name,
        target_duties: targetDuties.map((d) => d.name),
        detail: 'Matris satırı var ama hedefin görev tablosunda bu görev yok',
      })
    }

    const { all: allDutyQ } = allTargetDutyQuestions(a.target_id)
    const qDutyMap = questionToDutyByTarget.get(a.target_id) || new Map()

    const beforeScope = [...allDutyQ].map((qid) => {
      const row = questionRowById.get(qid) || {}
      const isDutyOnly = !basePeriodQ.has(qid)
      return {
        id: qid,
        category_id: row.category_id,
        text: row.text,
        text_fr: row.text_fr,
        duty_id: qDutyMap.get(qid),
        question_scope: dutyScopeMode === 'duty_only' && isDutyOnly ? 'period' : isDutyOnly ? 'duty' : 'period',
      }
    })

    const config = buildDutyOnlyConfig(periodId, a.evaluator_id, a.target_id, exp.duty.id, exp.categoryIds)
    const afterFilterBroken = filterSimulated(beforeScope, config, { legacy: true })
    const afterFilterFixed = filterSimulated(
      beforeScope.map((q) => ({
        ...q,
        question_scope: qDutyMap.has(q.id) ? 'duty' : q.question_scope,
      })),
      config
    )
    const afterFilter = afterFilterFixed

    const expectedIds = exp.questionIds
    const wrongIds = afterFilter.filter((q) => !expectedIds.has(q.id)).map((q) => q.id)
    const missingCount = [...expectedIds].filter((id) => !afterFilter.some((q) => q.id === id)).length

    if (
      dutyScopeMode === 'duty_only' &&
      afterFilterBroken.length === 0 &&
      beforeScope.length > 0 &&
      afterFilterFixed.length > 0
    ) {
      stats.empty_after_filter++
      stats.fail_open_risk++
      const wrongIfFailOpen = [...allDutyQ].filter((id) => !expectedIds.has(id))
      issues.push({
        severity: 'critical',
        code: 'FAIL_OPEN_WRONG_SET',
        assignment_id: a.id,
        status: a.status,
        evaluator: ev.name,
        target: tg.name,
        matrix_context: ctx,
        matrix_label: MATRIX_LABELS[ctx] || ctx,
        expected_duty: exp.duty.name,
        expected_question_count: expectedIds.size,
        before_scope_count: beforeScope.length,
        fail_open_would_show: allDutyQ.size,
        wrong_questions_if_fail_open: wrongIfFailOpen.length,
        target_duties: targetDuties.map((d) => d.name),
        detail:
          'duty_only + scope=period: filtre 0 soru — fail-open tüm hedef görevleri yükler (ör. zümre’de kulüp). Kod düzeltmesi deploy sonrası düzelir.',
        fixed_after_deploy_count: afterFilterFixed.length,
      })
    } else if (wrongIds.length > 0) {
      stats.wrong_duty_questions++
      issues.push({
        severity: 'error',
        code: 'WRONG_DUTY_IN_FORM',
        assignment_id: a.id,
        status: a.status,
        evaluator: ev.name,
        target: tg.name,
        matrix_context: ctx,
        expected_duty: exp.duty.name,
        wrong_count: wrongIds.length,
        filtered_count: afterFilter.length,
        detail: 'Filtre sonrası formda beklenen görev dışı soru var',
      })
    } else if (missingCount > 0) {
      issues.push({
        severity: 'warn',
        code: 'MISSING_EXPECTED_QUESTIONS',
        assignment_id: a.id,
        status: a.status,
        evaluator: ev.name,
        target: tg.name,
        matrix_context: ctx,
        missing_count: missingCount,
        expected_question_count: expectedIds.size,
        filtered_count: afterFilter.length,
        detail: 'Beklenen sorulardan bazıları filtre sonrası yok',
      })
    }
  }

  // FR: genel havuz + duty sorularında tekrarlayan text_fr
  const { data: allQ } = await sb
    .from('questions')
    .select('id, text_fr, category_id')
    .in(
      'category_id',
      [...genelCategoryIds].length ? [...genelCategoryIds] : ['00000000-0000-0000-0000-000000000000']
    )
  const frDup = new Map()
  for (const q of allQ || []) {
    const fr = norm(q.text_fr)
    if (!fr) continue
    frDup.set(fr, (frDup.get(fr) || 0) + 1)
  }
  const dupFrCount = [...frDup.values()].filter((n) => n > 1).length
  stats.fr_duplicate_question = dupFrCount

  const critical = issues.filter((i) => i.severity === 'critical')
  const errors = issues.filter((i) => i.severity === 'error')
  const warns = issues.filter((i) => i.severity === 'warn')

  console.log('\n--- Özet ---')
  console.log(`Kontrol edilen atama: ${stats.total_checked}`)
  console.log(`  Görev matrisi: ${stats.duty_matrix} | Genel: ${stats.genel}`)
  console.log(`Kritik (fail-open riski): ${critical.length}`)
  console.log(`Hata (yanlış görev soruları / paket yok): ${errors.length}`)
  console.log(`Uyarı (hedefte görev yok / eksik soru): ${warns.length}`)
  console.log(`FR tekrarlayan metin (duty+genel kategoriler): ${dupFrCount} grup`)

  if (critical.length) {
    console.log('\n--- KRİTİK (öncelikli) — ilk 20 ---')
    critical.slice(0, 20).forEach((i) => {
      console.log(
        `  • ${i.evaluator} → ${i.target} [${i.matrix_label}] (${i.status}) id=${i.assignment_id}`
      )
      console.log(`    ${i.detail}`)
      console.log(
        `    beklenen ${i.expected_question_count} soru | fail-open ${i.fail_open_would_show} (${i.wrong_questions_if_fail_open} yanlış)`
      )
    })
  }

  if (errors.length) {
    console.log('\n--- HATA — ilk 15 ---')
    errors.slice(0, 15).forEach((i) => {
      console.log(`  • [${i.code}] ${i.evaluator} → ${i.target} ctx=${i.matrix_context} id=${i.assignment_id}`)
    })
  }

  const report = {
    generated_at: new Date().toISOString(),
    read_only: true,
    period_id: periodId,
    period_name: period.name,
    duty_scope_mode: dutyScopeMode,
    stats,
    issues,
    issue_counts: {
      critical: critical.length,
      error: errors.length,
      warn: warns.length,
      total: issues.length,
    },
  }

  mkdirSync(dirname(jsonOut), { recursive: true })
  writeFileSync(jsonOut, JSON.stringify(report, null, 2))
  console.log(`\nTam rapor: ${jsonOut}`)
  console.log('\nDüzeltme: önce kod deploy (duty_only scope), sonra yalnızca atama/scope SQL — canlı yanıtlara dokunmayın.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
