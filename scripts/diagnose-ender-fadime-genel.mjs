#!/usr/bin/env node
/** Ender ÜSTÜNGEL + Fadime ALPARSLAN genel matris teşhisi */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PERIOD = process.argv[2] || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const NAMES = ['Ender ÜSTÜNGEL', 'Fadime ALPARSLAN']

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
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const sb = createClient(url, key)

  const { data: users } = await sb.from('users').select('id, name, department').in('name', NAMES)
  const byName = new Map((users || []).map((u) => [u.name, u]))

  for (const name of NAMES) {
    const u = byName.get(name)
    if (!u) {
      console.log(`\n=== ${name}: KULLANICI BULUNAMADI ===`)
      continue
    }
    console.log(`\n${'='.repeat(60)}\n${name} (${u.department}) — ${u.id}\n${'='.repeat(60)}`)

    const { data: asEvaluator } = await sb
      .from('evaluation_assignments')
      .select('id, target_id, status, matrix_context, completed_at')
      .eq('period_id', PERIOD)
      .eq('evaluator_id', u.id)
    const { data: asTarget } = await sb
      .from('evaluation_assignments')
      .select('id, evaluator_id, status, matrix_context, completed_at')
      .eq('period_id', PERIOD)
      .eq('target_id', u.id)

    const genelEval = (asEvaluator || []).filter((a) => (a.matrix_context || 'genel') === 'genel')
    const genelTgt = (asTarget || []).filter((a) => (a.matrix_context || 'genel') === 'genel')
    const dutyEval = (asEvaluator || []).filter((a) => (a.matrix_context || 'genel') !== 'genel')
    const dutyTgt = (asTarget || []).filter((a) => (a.matrix_context || 'genel') !== 'genel')

    console.log(`\nDeğerlendiren (evaluator):`)
    console.log(`  genel: ${genelEval.length} (${genelEval.filter((a) => a.status === 'completed').length} tamamlandı)`)
    console.log(`  yan görev: ${dutyEval.length} — ${[...new Set(dutyEval.map((a) => a.matrix_context))].join(', ')}`)

    console.log(`\nDeğerlendirilen (target):`)
    console.log(`  genel: ${genelTgt.length} (${genelTgt.filter((a) => a.status === 'completed').length} tamamlandı)`)
    console.log(`  yan görev: ${dutyTgt.length} — ${[...new Set(dutyTgt.map((a) => a.matrix_context))].join(', ')}`)

    // Completed genel as target — response counts per assignment
    const completedGenelTgt = genelTgt.filter((a) => a.status === 'completed')
    if (completedGenelTgt.length) {
      const evalIds = [...new Set(completedGenelTgt.map((a) => a.evaluator_id))]
      const { data: evalUsers } = await sb.from('users').select('id, name').in('id', evalIds)
      const evalBy = new Map((evalUsers || []).map((x) => [x.id, x.name]))

      const allPeriodQ = new Set()
      console.log(`\nTamamlanan genel atamalar (hedef olarak):`)
      for (const a of completedGenelTgt) {
        const { data: resp } = await sb.from('evaluation_responses').select('question_id, question_scope, reel_score, std_score, score').eq('assignment_id', a.id)
        const periodQ = new Set()
        const dutyQ = new Set()
        for (const r of resp || []) {
          const scope = r.question_scope || 'period'
          const qid = String(r.question_id)
          if (scope === 'duty') dutyQ.add(qid)
          else periodQ.add(qid)
          allPeriodQ.add(qid)
        }
        console.log(`  ← ${evalBy.get(a.evaluator_id) || a.evaluator_id}: period=${periodQ.size}, duty=${dutyQ.size}, toplam=${(resp || []).length}`)
      }
      console.log(`  BİRLEŞİK benzersiz period soru: ${allPeriodQ.size}`)
    }

    // Self evaluation?
    const selfGenel = genelEval.find((a) => a.target_id === u.id)
    if (selfGenel) {
      console.log(`\nÖz değerlendirme (genel): status=${selfGenel.status}`)
    } else {
      console.log(`\nÖz değerlendirme (genel): YOK`)
    }

    // Fadime: any genel as evaluator?
    if (name === 'Fadime ALPARSLAN' && genelEval.length) {
      console.log(`\n⚠ Fadime genel değerlendiren olarak ${genelEval.length} atama var:`)
      const tids = genelEval.map((a) => a.target_id)
      const { data: tgts } = await sb.from('users').select('id, name').in('id', tids)
      for (const a of genelEval.slice(0, 20)) {
        const tn = (tgts || []).find((t) => t.id === a.target_id)?.name
        console.log(`    → ${tn} (${a.status})`)
      }
      if (genelEval.length > 20) console.log(`    ... +${genelEval.length - 20} daha`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
