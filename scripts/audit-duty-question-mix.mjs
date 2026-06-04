#!/usr/bin/env node
/**
 * Çoklu görevli hedeflerde yanlış soru paketi riski (READ-ONLY simülasyon)
 * Usage: node scripts/audit-duty-question-mix.mjs [--pending-only] [--json out.json]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

const MATRIX_LABELS = {
  sinif_ogretmeni: 'Sınıf Öğretmeni',
  zumre: 'Zümre Başkanı',
  kulup_ogretmeni: 'Kulüp Öğretmeni',
  nobetci_ogretmeni: 'Nöbetçi',
  rehberlik_ogretmeni: 'Rehberlik',
  bilimsel_etkinlik_koordinatoru: 'Bilimsel Etkinlik',
  formator: 'Formatör',
  yasam_koordinatoru: 'Yaşam Koordinatörü',
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

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.local']) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim().replace(/^[\"']|[\"']$/g, '')
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
    .trim()
}

function findDutyId(duties, ctx) {
  const frags = DUTY_FRAGMENTS[ctx]
  if (!frags) return null
  for (const d of duties) {
    const n = norm(d.name + ' ' + (d.code || ''))
    if (frags.some((f) => n.includes(norm(f)))) return d.id
  }
  return null
}

async function fetchAll(sb, table, select, filter) {
  const rows = []
  let from = 0
  while (true) {
    let q = sb.from(table).select(select).range(from, from + 999)
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

async function main() {
  loadEnv()
  const pendingOnly = process.argv.includes('--pending-only')
  const jsonOut = process.argv.includes('--json')
    ? resolve(root, process.argv[process.argv.indexOf('--json') + 1])
    : resolve(root, 'docs/duty-question-mix-audit.json')

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const [assignments, duties, userDuties, users] = await Promise.all([
    fetchAll(sb, 'evaluation_assignments', 'id, evaluator_id, target_id, matrix_context, status', {
      period_id: PERIOD,
    }),
    fetchAll(sb, 'evaluation_duties', 'id, name, code', { period_id: PERIOD }),
    fetchAll(sb, 'evaluation_period_user_duties', 'user_id, duty_id', { period_id: PERIOD }),
    fetchAll(sb, 'users', 'id, name', {}),
  ])

  const userById = new Map(users.map((u) => [u.id, u.name]))
  const dutyById = new Map(duties.map((d) => [d.id, d]))
  const dutiesByUser = new Map()
  for (const ud of userDuties) {
    if (!dutiesByUser.has(ud.user_id)) dutiesByUser.set(ud.user_id, [])
    const d = dutyById.get(ud.duty_id)
    if (d) dutiesByUser.get(ud.user_id).push(d)
  }

  const dutyCats = new Map()
  const dutyQ = new Map()
  for (const d of duties) {
    const { data: dc } = await sb
      .from('evaluation_period_duty_categories')
      .select('category_id')
      .eq('period_id', PERIOD)
      .eq('duty_id', d.id)
    const cids = (dc || []).map((r) => r.category_id)
    dutyCats.set(d.id, new Set(cids))
    if (!cids.length) {
      dutyQ.set(d.id, new Set())
      continue
    }
    const { data: qs } = await sb.from('questions').select('id, category_id').in('category_id', cids)
    dutyQ.set(d.id, new Set((qs || []).map((q) => q.id)))
  }

  const catName = new Map()
  const allCatIds = [...new Set([...dutyCats.values()].flatMap((s) => [...s]))]
  if (allCatIds.length) {
    const { data: cn } = await sb.from('question_categories').select('id, name').in('id', allCatIds)
    ;(cn || []).forEach((c) => catName.set(c.id, c.name))
  }

  function expectedForCtx(ctx) {
    const did = findDutyId(duties, ctx)
    if (!did) return { qids: new Set(), dutyName: null }
    return { qids: dutyQ.get(did) || new Set(), dutyName: dutyById.get(did)?.name }
  }

  function allTargetQ(targetId) {
    const set = new Set()
    for (const d of dutiesByUser.get(targetId) || []) {
      for (const q of dutyQ.get(d.id) || []) set.add(q)
    }
    return set
  }

  let rows = assignments.filter((a) => MATRIX_LABELS[a.matrix_context])
  if (pendingOnly) rows = rows.filter((a) => a.status === 'pending')

  const issues = []
  for (const a of rows) {
    const ctx = a.matrix_context
    const targetDuties = dutiesByUser.get(a.target_id) || []
    if (targetDuties.length < 2) continue

    const exp = expectedForCtx(ctx)
    const allQ = allTargetQ(a.target_id)
    const wrong = [...allQ].filter((q) => !exp.qids.has(q))
    if (!wrong.length) continue

    const wrongCats = new Set()
    for (const qid of wrong) {
      for (const [did, qset] of dutyQ) {
        if (qset.has(qid)) {
          const cat = [...(dutyCats.get(did) || [])].find((cid) => {
            // find category via question - expensive, skip
            return true
          })
          const dname = dutyById.get(did)?.name
          if (dname) wrongCats.add(dname)
        }
      }
    }
    for (const [did, qset] of dutyQ) {
      for (const qid of wrong) {
        if (qset.has(qid)) wrongCats.add(dutyById.get(did)?.name)
      }
    }

    issues.push({
      severity: 'error',
      assignment_id: a.id,
      status: a.status,
      evaluator: userById.get(a.evaluator_id),
      target: userById.get(a.target_id),
      matrix_context: ctx,
      matrix_label: MATRIX_LABELS[ctx],
      target_duties: targetDuties.map((d) => d.name),
      expected_duty: exp.dutyName,
      expected_question_count: exp.qids.size,
      wrong_question_count: wrong.length,
      wrong_from_duties: [...wrongCats],
      detail: `${MATRIX_LABELS[ctx]} kartında fail-open/merge hatası ile başka görev soruları görünebilir`,
    })
  }

  issues.sort((a, b) => b.wrong_question_count - a.wrong_question_count)

  console.log('\n=== GÖREV SORU KARIŞIMI DENETİMİ ===')
  console.log(`Çoklu görevli hedef + yan görev ataması: ${issues.length} riskli`)
  console.log('\nÖrnekler (ilk 15):')
  issues.slice(0, 15).forEach((i) => {
    console.log(`  • ${i.evaluator} → ${i.target} [${i.matrix_label}] (${i.status})`)
    console.log(`    hedef görevleri: ${i.target_duties.join(' + ')}`)
    console.log(`    beklenen: ${i.expected_question_count} soru (${i.expected_duty}) | yanlış ek: ${i.wrong_question_count} (${i.wrong_from_duties.join(', ')})`)
  })

  const byPerson = new Map()
  for (const i of issues) {
    const k = `${i.evaluator} → ${i.target}`
    if (!byPerson.has(k)) byPerson.set(k, [])
    byPerson.get(k).push(i.matrix_label)
  }
  console.log('\nÇift bazında (benzersiz):', byPerson.size)

  mkdirSync(dirname(jsonOut), { recursive: true })
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        period_id: PERIOD,
        multi_duty_risk_count: issues.length,
        issues,
      },
      null,
      2
    )
  )
  console.log('\nRapor:', jsonOut)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
