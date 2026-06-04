#!/usr/bin/env node
/** Simüle: applyEvaluationQuestionScope (canlı kod) — READ ONLY */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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

async function main() {
  loadEnv()
  const assignmentId = process.argv[2] || 'bfefa963-6045-4666-b3d6-579761f7eba4'

  const { applyEvaluationQuestionScope } = await import(
    pathToFileURL(resolve(root, 'src/lib/server/evaluation-form-question-scope.ts')).href
  )
  const { fetchDutyScopeMetaForTarget } = await import(
    pathToFileURL(resolve(root, 'src/lib/server/evaluation-duty-questions.ts')).href
  )
  const { evaluatorDisplayLang } = await import(pathToFileURL(resolve(root, 'src/lib/i18n.ts')).href)

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: asg } = await sb
    .from('evaluation_assignments')
    .select('*, evaluator:evaluator_id(name, preferred_language), target:target_id(name)')
    .eq('id', assignmentId)
    .single()
  if (!asg) throw new Error('assignment not found')

  const evalLang = evaluatorDisplayLang(asg.evaluator?.preferred_language)
  const dutyScopeMeta = await fetchDutyScopeMetaForTarget(sb, asg.period_id, asg.target_id, evalLang)

  const scoped = await applyEvaluationQuestionScope({
    supabase: sb,
    periodId: asg.period_id,
    evaluatorId: asg.evaluator_id,
    targetId: asg.target_id,
    matrixContext: asg.matrix_context,
    questions: [],
    answersByQuestion: {},
    dutyScopeMeta,
  })

  console.log(`\n${asg.evaluator?.name} → ${asg.target?.name} [${asg.matrix_context}]`)
  console.log(`Soru sayısı: ${scoped.questions.length}\n`)
  for (const q of scoped.questions) {
    const cat = q.question_categories?.name || q.categories?.name || '?'
    const duty = q.duty_name || '-'
    console.log(`  • [${cat}] ${duty} — ${String(q.text || '').slice(0, 70)}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
