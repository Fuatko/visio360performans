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

async function main() {
  loadEnv()
  const sb = createClient(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )

  for (const name of ['Onur ERMAN', 'Ayşegül KAZMAZ']) {
    const { data: u } = await sb.from('users').select('id').eq('name', name).single()
    console.log(`\n=== ${name} ===`)

    // All completed assignments as TARGET with response counts
    const { data: allTgt } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, matrix_context, status')
      .eq('period_id', PERIOD)
      .eq('target_id', u.id)
      .eq('status', 'completed')

    const byCtx = new Map()
    for (const a of allTgt || []) {
      const ctx = a.matrix_context || 'genel'
      const { count } = await sb.from('evaluation_responses').select('id', { count: 'exact', head: true }).eq('assignment_id', a.id)
      if (!byCtx.has(ctx)) byCtx.set(ctx, { assignments: 0, responses: 0 })
      const cur = byCtx.get(ctx)
      cur.assignments++
      cur.responses += count || 0
    }
    console.log('Hedef — tamamlanan atamalar (matrix_context → atama/yanıt):')
    for (const [ctx, v] of [...byCtx.entries()].sort()) {
      console.log(`  ${ctx}: ${v.assignments} atama, ${v.responses} yanıt`)
    }

    // Genel target assignments detail - raw response count
    const { data: genelTgt } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, status')
      .eq('period_id', PERIOD)
      .eq('target_id', u.id)
      .eq('matrix_context', 'genel')
    for (const a of genelTgt || []) {
      const { data: ev } = await sb.from('users').select('name').eq('id', a.evaluator_id).single()
      const { count } = await sb.from('evaluation_responses').select('id', { count: 'exact', head: true }).eq('assignment_id', a.id)
      console.log(`  genel ← ${ev?.name}: status=${a.status}, responses=${count}`)
    }

    // Ayşegül as evaluator - category names for 8 vs 5
    if (name === 'Ayşegül KAZMAZ') {
      const { data: cats } = await sb
        .from('evaluation_period_evaluator_target_categories')
        .select('category_id, evaluation_period_categories_snapshot(name)')
        .eq('period_id', PERIOD)
        .eq('evaluator_id', u.id)
        .eq('matrix_context', 'genel')
        .eq('is_active', true)
        .limit(20)
      const names = [...new Set((cats || []).map((c) => c.evaluation_period_categories_snapshot?.name).filter(Boolean))]
      console.log(`\nAyşegül genel kapsam kategorileri (örnek): ${names.join(', ')}`)
      console.log(`Toplam kategori satırı (ilk 20 sorgu): ${cats?.length}`)

      // Count questions in those categories
      const catIds = [...new Set((cats || []).map((c) => c.category_id))]
      const { data: qs } = await sb.from('questions').select('id').in('category_id', catIds)
      console.log(`Bu kategorilerdeki soru sayısı (örnek hedef): ${qs?.length}`)
    }

    if (name === 'Onur ERMAN') {
      const { data: cats } = await sb
        .from('evaluation_period_evaluator_target_categories')
        .select('category_id, evaluation_period_categories_snapshot(name)')
        .eq('period_id', PERIOD)
        .eq('evaluator_id', u.id)
        .eq('matrix_context', 'genel')
        .eq('is_active', true)
        .limit(20)
      const names = [...new Set((cats || []).map((c) => c.evaluation_period_categories_snapshot?.name).filter(Boolean))]
      console.log(`\nOnur genel kapsam kategorileri: ${names.join(', ') || '(kısıt yok — tam genel)'}`)
    }
  }

  // Who evaluates Onur/Ayşegül in yasam_koordinatoru
  for (const name of ['Onur ERMAN', 'Ayşegül KAZMAZ']) {
    const { data: u } = await sb.from('users').select('id').eq('name', name).single()
    const { data: rows } = await sb
      .from('evaluation_assignments')
      .select('evaluator_id, status')
      .eq('period_id', PERIOD)
      .eq('target_id', u.id)
      .eq('matrix_context', 'yasam_koordinatoru')
      .eq('status', 'completed')
    const eids = [...new Set((rows || []).map((r) => r.evaluator_id))]
    const { data: evs } = await sb.from('users').select('name').in('id', eids)
    console.log(`\n${name} yasam_koordinatoru değerlendirenler: ${(evs || []).map((e) => e.name).join(', ')}`)
  }
}

main()
