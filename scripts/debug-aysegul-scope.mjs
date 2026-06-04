#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.visio360.tmp', '.env.local']) {
  const p = resolve(root, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^[\"']|[\"']$/g, '')
  }
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { fetchEvaluatorScopeConfig, filterQuestionsForEvaluatorScope } = await import(
  pathToFileURL(resolve(root, 'src/lib/server/evaluation-evaluator-scope.ts')).href
)
const { applyEvaluationQuestionScope } = await import(
  pathToFileURL(resolve(root, 'src/lib/server/evaluation-form-question-scope.ts')).href
)

const P = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const AY = '9db639d7-e80b-415b-90d1-b7f9e65fa6c2'
const asgId = 'ff8c9f36-3367-4975-9ce3-6fc6d8da270c'

const { data: asg } = await sb.from('evaluation_assignments').select('*').eq('id', asgId).single()
const { data: pq } = await sb
  .from('evaluation_period_questions')
  .select('question_id')
  .eq('period_id', P)
  .eq('is_active', true)
const { data: qd } = await sb
  .from('questions')
  .select('id, category_id, question_categories:category_id(name)')
  .in('id', pq.map((r) => r.question_id))

const cfg = await fetchEvaluatorScopeConfig(sb, P, AY, asg.target_id, 'genel')
console.log('fetchEvaluatorScopeConfig', {
  restrictPeriod: cfg?.restrictPeriod,
  catCount: cfg?.periodCategoryIds?.size,
  isConfigured: cfg?.isConfigured,
  dutyMode: cfg?.dutyMode,
})
const { enrichEvaluatorScopePeriodCategories, loadPeriodCategoryOptions, expandPeriodCategoryIds } = await import(
  pathToFileURL(resolve(root, 'src/lib/server/evaluation-evaluator-scope.ts')).href
)
const enriched = await enrichEvaluatorScopePeriodCategories(sb, P, cfg, 'genel')
console.log('enriched catCount', enriched?.periodCategoryIds?.size)
console.log(
  'buildDefault condition',
  !enriched?.isConfigured || !enriched?.restrictPeriod || !enriched?.periodCategoryIds?.size
)
const filtered = filterQuestionsForEvaluatorScope(qd, cfg)
console.log('filterQuestionsForEvaluatorScope (cfg)', filtered.length)
const filtered2 = filterQuestionsForEvaluatorScope(qd, enriched)
console.log('filterQuestionsForEvaluatorScope (enriched)', filtered2.length)

const scoped = await applyEvaluationQuestionScope({
  supabase: sb,
  periodId: P,
  evaluatorId: AY,
  targetId: asg.target_id,
  matrixContext: 'genel',
  questions: qd,
  answersByQuestion: {},
  dutyScopeMeta: null,
})
console.log('applyEvaluationQuestionScope final', scoped.questions.length)
