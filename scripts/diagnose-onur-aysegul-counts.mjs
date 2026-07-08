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

async function distinctPeriodQ(sb, assignmentId, dutyOnly) {
  const { data: resp } = await sb.from('evaluation_responses').select('question_id, question_scope').eq('assignment_id', assignmentId)
  const s = new Set()
  for (const r of resp || []) {
    const q = String(r.question_id)
    if (r.question_scope === 'duty' || dutyOnly.has(q)) continue
    s.add(q)
  }
  return { count: s.size, total: (resp || []).length }
}

async function main() {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  for (const name of ['Onur ERMAN', 'Ayşegül KAZMAZ']) {
    const { data: u } = await sb.from('users').select('id').eq('name', name).single()

    // Combined genel as TARGET
    const { data: genelTgt } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id')
      .eq('period_id', PERIOD)
      .eq('target_id', u.id)
      .eq('matrix_context', 'genel')
      .eq('status', 'completed')

    const allQ = new Set()
    for (const a of genelTgt || []) {
      const { data: resp } = await sb.from('evaluation_responses').select('question_id').eq('assignment_id', a.id)
      ;(resp || []).forEach((r) => allQ.add(String(r.question_id)))
    }
    console.log(`\n${name} — genel HEDEF birleşik soru: ${allQ.size} (21 eşiği)`)

    // Category scope as evaluator - count distinct categories across targets
    const { data: scopeRows } = await sb
      .from('evaluation_period_evaluator_target_categories')
      .select('target_id, category_id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', u.id)
      .eq('matrix_context', 'genel')
      .eq('is_active', true)

    const catByTarget = new Map()
    for (const r of scopeRows || []) {
      const t = String(r.target_id)
      if (!catByTarget.has(t)) catByTarget.set(t, new Set())
      catByTarget.get(t).add(String(r.category_id))
    }
    const catCounts = [...catByTarget.values()].map((s) => s.size)
    const uniqCounts = [...new Set(catCounts)].sort((a, b) => a - b)
    console.log(`${name} — değerlendiren genel kapsam: ${catByTarget.size} hedef, kategori/hedef: ${uniqCounts.join(', ') || 'kısıt yok'}`)

    // Sample OUT assignment question counts distribution
    const { data: outDone } = await sb
      .from('evaluation_assignments')
      .select('id')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', u.id)
      .eq('matrix_context', 'genel')
      .eq('status', 'completed')
      .limit(200)

    const dist = new Map()
    for (const a of outDone || []) {
      const { count, total } = await distinctPeriodQ(sb, a.id, new Set())
      dist.set(count, (dist.get(count) || 0) + 1)
    }
    console.log(`${name} — değerlendirdiği genel formlarda period soru dağılımı:`)
    for (const [k, v] of [...dist.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  ${k} soru: ${v} atama`)
    }

    // Get category names for 8-category model if exists
    if (scopeRows?.length) {
      const catIds = [...new Set(scopeRows.map((r) => r.category_id))]
      const { data: snap } = await sb
        .from('evaluation_period_categories_snapshot')
        .select('id, name')
        .eq('period_id', PERIOD)
        .in('id', catIds)
      console.log(`  Kategori isimleri (${snap?.length}): ${(snap || []).map((c) => c.name).join(' | ')}`)
    }
  }

  // Simulate API eligibility
  console.log('\n--- Beklenen rapor davranışı ---')
  console.log('Onur ve Ayşegül genel HEDEF birleşik ≥21 ise ikisi de genel sıralamada olmalı')
  console.log('Değerlendirdikleri öğretmen skorları → o öğretmenin satırında (genel dilim)')
  console.log('Koordinatör görev formu (yasam_koordinatoru) → yan görev dilimi, genel sıralama değil')
}

main()
