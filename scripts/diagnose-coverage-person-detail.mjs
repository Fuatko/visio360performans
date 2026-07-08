#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const ORG = 'e03a6045-5a9c-4015-9763-2b869657eb42'

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.paul-fr.tmp', '.env.local']) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  }
}
loadEnv()

const sb = createClient(
  (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

const CTX_LABEL = {
  genel: 'Genel',
  okul_yasam: 'Okul Yaşam',
  kulup_ogretmeni: 'Kulüp',
  sinif_ogretmeni: 'Sınıf',
  rehberlik_ogretmeni: 'Rehberlik',
  nobetci_ogretmeni: 'Nöbet',
  zumre: 'Zümre',
}

function normCtx(v) {
  const x = String(v || 'genel').trim() || 'genel'
  return x === 'genel' ? 'genel' : x
}

async function scorable(ids) {
  const m = new Map()
  for (let i = 0; i < ids.length; i += 80) {
    const { data } = await sb.from('evaluation_responses').select('assignment_id,reel_score,std_score').in('assignment_id', ids.slice(i, i + 80))
    for (const r of data || []) {
      const n = Number(r.reel_score ?? r.std_score ?? 0)
      if (!m.has(r.assignment_id)) m.set(r.assignment_id, false)
      if (n > 0) m.set(r.assignment_id, true)
    }
  }
  return m
}

function analyze(targetId, targetName, rows, sc) {
  const peers = rows.filter((a) => a.evaluator_id !== targetId)
  const byCtx = new Map()
  const evalMap = new Map()

  for (const a of peers) {
    const eid = a.evaluator_id
    const ename = a.evaluator?.name || '?'
    const ctx = normCtx(a.matrix_context)
    const done = a.status === 'completed'
    const scored = done && sc.get(a.id) === true
    const st = !done ? 'bekliyor' : scored ? 'değerlendi' : 'fikrim yok'

    if (!byCtx.has(ctx)) byCtx.set(ctx, { a: new Set(), d: new Set(), f: new Set(), b: new Set() })
    const s = byCtx.get(ctx)
    s.a.add(eid)
    if (st === 'değerlendi') s.d.add(eid)
    else if (st === 'fikrim yok') s.f.add(eid)
    else s.b.add(eid)

    if (!evalMap.has(eid)) evalMap.set(eid, { name: ename, parts: [] })
    evalMap.get(eid).parts.push({ ctx, st })
  }

  const unique = {
    assigned: evalMap.size,
    scored: [...evalMap.values()].filter((e) => e.parts.some((p) => p.st === 'değerlendi')).length,
    noOpOnly: [...evalMap.values()].filter((e) => e.parts.every((p) => p.st !== 'bekliyor') && !e.parts.some((p) => p.st === 'değerlendi')).length,
    pending: [...evalMap.values()].filter((e) => e.parts.some((p) => p.st === 'bekliyor')).length,
    genelScored: [...evalMap.entries()].filter(([, e]) => e.parts.some((p) => p.ctx === 'genel' && p.st === 'değerlendi')).length,
  }

  const slice = {}
  for (const [ctx, s] of byCtx) {
    slice[ctx] = { assigned: s.a.size, scored: s.d.size, noOp: s.f.size, pending: s.b.size }
  }

  const sum = (k) => Object.values(slice).reduce((n, x) => n + x[k], 0)
  return { targetName, unique, slice, sum: { assigned: sum('assigned'), scored: sum('scored'), noOp: sum('noOp') }, evalMap }
}

async function loadTargetAssignments(targetId) {
  const out = []
  let from = 0
  while (true) {
    const { data } = await sb
      .from('evaluation_assignments')
      .select('id,evaluator_id,target_id,status,matrix_context,evaluator:evaluator_id(name)')
      .eq('period_id', PERIOD)
      .eq('target_id', targetId)
      .range(from, from + 999)
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

async function main() {
  const { data: users } = await sb.from('users').select('id,name').eq('organization_id', ORG)
  const want = {
    u: { assigned: 10, scored: 7, noOp: 3, pending: 0, genel: 4 },
    slice: {
      genel: { assigned: 4, scored: 4, noOp: 0 },
      okul_yasam: { assigned: 5, scored: 3, noOp: 2 },
      kulup_ogretmeni: { assigned: 5, scored: 2, noOp: 3 },
      sinif_ogretmeni: { assigned: 2, scored: 1, noOp: 1 },
    },
    sumNoOp: 6,
  }

  let best = null
  let bestScore = 0

  for (const u of users || []) {
    const rows = await loadTargetAssignments(u.id)
    if (rows.length < 8) continue
    const sc = await scorable(rows.map((r) => r.id))
    const r = analyze(u.id, u.name, rows, sc)

    let score = 0
    if (r.unique.assigned === want.u.assigned) score += 3
    if (r.unique.scored === want.u.scored) score += 3
    if (r.unique.noOpOnly === want.u.noOp) score += 3
    if (r.unique.genelScored === want.u.genel) score += 2
    if (r.sum.noOp === want.sumNoOp) score += 2
    for (const [ctx, exp] of Object.entries(want.slice)) {
      const got = r.slice[ctx]
      if (!got) continue
      if (got.assigned === exp.assigned) score += 1
      if (got.scored === exp.scored) score += 1
      if (got.noOp === exp.noOp) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      best = { ...r, targetId: u.id, score }
    }
    if (score >= 18) break
  }

  if (!best) {
    console.log('Eşleşme bulunamadı')
    return
  }

  console.log(`\n=== ${best.targetName} (eşleşme skoru ${best.score}/21) ===\n`)
  console.log('ÜST ÖZET (benzersiz kişi):')
  console.log(`  Atanan: ${best.unique.assigned} | Değerlendi: ${best.unique.scored} | Fikrim yok (hiç puan yok): ${best.unique.noOpOnly} | Bekleyen: ${best.unique.pending} | Genel dilim puanlı: ${best.unique.genelScored}`)
  console.log('\nDİLİM TABLOSU:')
  for (const ctx of ['genel', 'okul_yasam', 'kulup_ogretmeni', 'sinif_ogretmeni']) {
    const s = best.slice[ctx]
    if (!s) continue
    console.log(`  ${CTX_LABEL[ctx] || ctx}: atanan=${s.assigned} değerlendi=${s.scored} fikrimYok=${s.noOp} bekleyen=${s.pending}`)
  }
  console.log(`  (Tablo fikrim yok toplamı: ${best.sum.noOp} — üst kutu: ${best.unique.noOpOnly} kişi)`)

  console.log('\nKİŞİ BAZLI DETAY:')
  const sorted = [...best.evalMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  for (const e of sorted) {
    const overall = e.parts.some((p) => p.st === 'değerlendi')
      ? 'DEĞERLENDİ'
      : e.parts.some((p) => p.st === 'bekliyor')
        ? 'BEKLİYOR'
        : 'FİKRİM YOK (hiç puan yok)'
    const detail = e.parts.map((p) => `${CTX_LABEL[p.ctx] || p.ctx}:${p.st}`).join(', ')
    console.log(`  • ${e.name} → ${overall}`)
    console.log(`      ${detail}`)
  }
}

main().catch(console.error)
