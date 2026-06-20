#!/usr/bin/env node
import { getSupabaseClient } from './_load-env.mjs'

const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const NAMES = ['Ayşegül KAZMAZ', 'Onur ERMAN', 'Utku AYTAÇ', 'Simgenur GÜDEBERK KORKMAZ', 'Müge SARUHAN ALTINKAYA']

async function main() {
  const sb = await getSupabaseClient()
  const { data: users } = await sb.from('users').select('id, name, title, department').in('name', NAMES)
  const byName = new Map((users || []).map((u) => [u.name, u]))

  for (const name of ['Ayşegül KAZMAZ', 'Onur ERMAN']) {
    const u = byName.get(name)
    if (!u) continue
    console.log('\n===', name, '===')
    console.log('title:', u.title, '| dept:', u.department)
    const { data: asg } = await sb
      .from('evaluation_assignments')
      .select('matrix_context, status, target:target_id(name)')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', u.id)
    const byCtx = {}
    for (const a of asg || []) {
      const c = a.matrix_context || 'null'
      if (!byCtx[c]) byCtx[c] = { total: 0, completed: 0, pending: 0 }
      byCtx[c].total++
      if (a.status === 'completed') byCtx[c].completed++
      else byCtx[c].pending++
    }
    console.log('Atamalar:', JSON.stringify(byCtx, null, 2))

    const utku = byName.get('Utku AYTAÇ')
    if (utku) {
      const toUtku = (asg || []).filter((a) => a.target?.name?.includes('Utku'))
      console.log('Utku hedefli:', toUtku.map((a) => `${a.matrix_context}/${a.status}`).join(', ') || 'yok')
    }
  }

  // Okul yaşam koordinatör listesi — kimler sadece oy vs genel+oy
  console.log('\n=== Okul yaşam koordinatör adayları (oy vs genel) ===')
  const { data: oyPeople } = await sb
    .from('evaluation_assignments')
    .select('evaluator:evaluator_id(name), matrix_context')
    .eq('period_id', PERIOD)
    .eq('matrix_context', 'okul_yasam')
  const evaluatorsWithOy = new Map()
  for (const r of oyPeople || []) {
    const n = r.evaluator?.name
    if (!n) continue
    evaluatorsWithOy.set(n, (evaluatorsWithOy.get(n) || 0) + 1)
  }
  for (const [name, oyCount] of [...evaluatorsWithOy.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'))) {
    const uid = (users || []).find((u) => u.name === name)?.id
    if (!uid) continue
    const { count: genelCount } = await sb
      .from('evaluation_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('period_id', PERIOD)
      .eq('evaluator_id', uid)
      .eq('matrix_context', 'genel')
    console.log(`${name.padEnd(32)} oy=${String(oyCount).padStart(3)} genel=${genelCount ?? 0}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
