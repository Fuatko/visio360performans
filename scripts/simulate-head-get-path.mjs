#!/usr/bin/env node
/** HEAD (canlı) GET yolu: tüm hedef görev sorularını yükle → scope → fail-open */
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

  const { resolvePeriodQuestionIdsForTarget, fetchDutyScopeMetaForTarget, questionScopeForId } =
    await import(pathToFileURL(resolve(root, 'src/lib/server/evaluation-duty-questions.ts')).href)
  const { applyEvaluationQuestionScope } = await import(
    pathToFileURL(resolve(root, 'src/lib/server/evaluation-form-question-scope.ts')).href
  )
  const {
    prepareEvaluatorScopeForAssignment,
    filterQuestionsForEvaluatorScope,
    fetchEvaluatorScopeConfig,
    enrichEvaluatorScopePeriodCategories,
    mergeEvaluatorScopedDutyQuestions,
  } = await import(pathToFileURL(resolve(root, 'src/lib/server/evaluation-evaluator-scope.ts')).href)

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: asg } = await sb
    .from('evaluation_assignments')
    .select('*, evaluator:evaluator_id(name, preferred_language), target:target_id(name)')
    .eq('id', assignmentId)
    .single()

  const periodId = asg.period_id
  const targetId = asg.target_id
  let periodQuestionIds = null
  const { data: pq } = await sb
    .from('evaluation_period_questions')
    .select('question_id')
    .eq('period_id', periodId)
    .eq('is_active', true)
  if (pq?.length) periodQuestionIds = pq.map((r) => r.question_id)

  // HEAD path: merge ALL target duties for any non-genel
  if (asg.matrix_context !== 'genel') {
    periodQuestionIds = await resolvePeriodQuestionIdsForTarget(sb, periodId, targetId, periodQuestionIds)
  }

  const { data: questionsData } = await sb
    .from('questions')
    .select('id, text, category_id, question_categories:category_id(name)')
    .in('id', periodQuestionIds || [])

  let questions = questionsData || []
  const dutyScopeMeta = await fetchDutyScopeMetaForTarget(sb, periodId, targetId)
  questions = questions.map((q) => {
    const scoped = questionScopeForId(String(q.id), dutyScopeMeta)
    const duty = dutyScopeMeta.questionDutyMap.get(String(q.id))
    return {
      ...q,
      question_scope: scoped.scope,
      duty_name: scoped.scope === 'duty' ? duty?.dutyName : null,
    }
  })

  const scopes = {}
  for (const q of questions) scopes[q.question_scope] = (scopes[q.question_scope] || 0) + 1
  console.log('dutyOnlyQuestionIds:', dutyScopeMeta.dutyOnlyQuestionIds.size, 'scopes:', scopes)

  let evaluatorScope = await fetchEvaluatorScopeConfig(sb, periodId, asg.evaluator_id, targetId, asg.matrix_context)
  const { data: dutyRows } = await sb.from('evaluation_duties').select('id,name,code').eq('period_id', periodId)
  evaluatorScope = await prepareEvaluatorScopeForAssignment(sb, evaluatorScope, {
    periodId,
    evaluatorId: asg.evaluator_id,
    targetId,
    matrixContext: asg.matrix_context,
    duties: dutyRows || [],
  })
  evaluatorScope = await enrichEvaluatorScopePeriodCategories(sb, periodId, evaluatorScope, asg.matrix_context)
  console.log('scope:', evaluatorScope?.dutyMode, 'pkgs', [...(evaluatorScope?.dutyPackageIds || [])], 'dutyCats', evaluatorScope?.dutyCategoryIds?.size)
  const merged = await mergeEvaluatorScopedDutyQuestions(sb, periodId, questions, {}, evaluatorScope, dutyScopeMeta)
  const filtered = filterQuestionsForEvaluatorScope(merged, evaluatorScope)
  console.log('merge/filter debug:', questions.length, '→', merged.length, '→', filtered.length)

  const questionsBeforeScope = [...questions]
  const scoped = await applyEvaluationQuestionScope({
    supabase: sb,
    periodId,
    evaluatorId: asg.evaluator_id,
    targetId,
    matrixContext: asg.matrix_context,
    questions,
    answersByQuestion: {},
    dutyScopeMeta,
  })

  let final = scoped.questions
  // HEAD fail-open
  if (final.length === 0 && questionsBeforeScope.length > 0 && asg.matrix_context !== 'genel') {
    final = questionsBeforeScope
    console.log('⚠️  FAIL-OPEN triggered — restored ALL target duty questions')
  }

  console.log(`\nHEAD sim: ${asg.evaluator?.name} → ${asg.target?.name} [${asg.matrix_context}]`)
  console.log(`Pool: ${questionsBeforeScope.length} → Scoped: ${scoped.questions.length} → Final: ${final.length}\n`)
  for (const q of final) {
    console.log(`  • ${q.duty_name || '?'} | ${q.question_categories?.name}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
