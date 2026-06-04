#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.visio360.tmp']) {
  const p = resolve(root, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^[\"']|[\"']$/g, '')
  }
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const aid = process.argv[2] || 'e7edba44-380d-46e6-9ff0-a21540ea3f96'

const {
  fetchEvaluatorScopeConfig,
  prepareEvaluatorScopeForAssignment,
  filterQuestionsForEvaluatorScope,
  enrichEvaluatorScopePeriodCategories,
} = await import(pathToFileURL(resolve(root, 'src/lib/server/evaluation-evaluator-scope.ts')).href)
const { resolvePeriodQuestionIdsForTarget } = await import(
  pathToFileURL(resolve(root, 'src/lib/server/evaluation-duty-questions.ts')).href
)
const { applyEvaluationQuestionScope } = await import(
  pathToFileURL(resolve(root, 'src/lib/server/evaluation-form-question-scope.ts')).href
)

const { data: asg } = await sb.from('evaluation_assignments').select('*').eq('id', aid).single()

let cfg = await fetchEvaluatorScopeConfig(sb, asg.period_id, asg.evaluator_id, asg.target_id, asg.matrix_context)
console.log('1 fetchScope', {
  configured: cfg?.isConfigured,
  periodCats: cfg?.periodCategoryIds?.size,
  restrict: cfg?.restrictPeriod,
  level: cfg?.scopeLevel,
})

cfg = await prepareEvaluatorScopeForAssignment(sb, cfg, {
  periodId: asg.period_id,
  evaluatorId: asg.evaluator_id,
  targetId: asg.target_id,
  matrixContext: asg.matrix_context,
  duties: [],
})
console.log('2 after prepare', {
  configured: cfg?.isConfigured,
  periodCats: cfg?.periodCategoryIds?.size,
  dutyMode: cfg?.dutyMode,
})

cfg = await enrichEvaluatorScopePeriodCategories(sb, asg.period_id, cfg, asg.matrix_context)
const catIds = [...(cfg?.periodCategoryIds || [])]
console.log('3 enrich periodCat ids', catIds)
const { data: catNames } = await sb.from('question_categories').select('id,name').in('id', catIds.length ? catIds : ['00000000-0000-0000-0000-000000000000'])
console.log('   allowed names', catNames?.map((c) => c.name))

const pq = await resolvePeriodQuestionIdsForTarget(sb, asg.period_id, asg.target_id, null)
console.log('4 pool question count', pq?.length)

const { data: qs } = await sb
  .from('questions')
  .select('id,category_id, question_categories:category_id(name)')
  .in('id', pq || [])
const filtered = filterQuestionsForEvaluatorScope(qs, cfg)
console.log('5 filter direct', filtered.length, filtered.map((q) => q.question_categories?.name))

const scoped = await applyEvaluationQuestionScope({
  supabase: sb,
  periodId: asg.period_id,
  evaluatorId: asg.evaluator_id,
  targetId: asg.target_id,
  matrixContext: asg.matrix_context,
  questions: qs || [],
  answersByQuestion: {},
  dutyScopeMeta: null,
})
console.log('6 applyScope final', scoped.questions.length, scoped.questions.map((q) => q.question_categories?.name))
