#!/usr/bin/env node
/** Tam GET route simülasyonu (local kod) */
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
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^[\"']|[\"']$/g, '')
    }
  }
}

async function simulateGet(sb, assignmentId) {
  const {
    fetchDutyScopeMetaForTarget,
    questionScopeForId,
    shouldMergeAllTargetDutyQuestions,
    resolvePeriodQuestionIdsForTarget,
  } = await import(pathToFileURL(resolve(root, 'src/lib/server/evaluation-duty-questions.ts')).href)
  const { applyEvaluationQuestionScope } = await import(
    pathToFileURL(resolve(root, 'src/lib/server/evaluation-form-question-scope.ts')).href
  )
  const { isCategoryMatrixContext, isDutyMatrixContext, normalizeMatrixContext } = await import(
    pathToFileURL(resolve(root, 'src/lib/matrix-evaluation-context.ts')).href
  )
  const { evaluatorDisplayLang } = await import(pathToFileURL(resolve(root, 'src/lib/i18n.ts')).href)
  const { dutyLabelFallback } = await import(pathToFileURL(resolve(root, 'src/lib/duty-title-match.ts')).href)

  const { data: assignData } = await sb
    .from('evaluation_assignments')
    .select('*, evaluator:evaluator_id(name, preferred_language), target:target_id(name)')
    .eq('id', assignmentId)
    .single()

  const periodId = assignData.period_id
  const targetId = assignData.target_id
  const matrixCtx = normalizeMatrixContext(assignData.matrix_context)
  const evalLang = evaluatorDisplayLang(assignData.evaluator?.preferred_language)
  const dutyFallback = dutyLabelFallback(evalLang)

  let periodQuestionIds = null
  const { data: pq } = await sb
    .from('evaluation_period_questions')
    .select('question_id')
    .eq('period_id', periodId)
    .eq('is_active', true)
  if (pq?.length) periodQuestionIds = pq.map((r) => r.question_id)

  if (matrixCtx !== 'genel') {
    if (shouldMergeAllTargetDutyQuestions(matrixCtx)) {
      periodQuestionIds = await resolvePeriodQuestionIdsForTarget(sb, periodId, targetId, periodQuestionIds)
    } else if (isDutyMatrixContext(matrixCtx)) {
      periodQuestionIds = []
    }
  }

  let questions = []
  const answersByQuestion = {}
  const dutyScopeMeta = await fetchDutyScopeMetaForTarget(sb, periodId, targetId, evalLang)

  if (!isDutyMatrixContext(matrixCtx)) {
    const { data: qd } = await sb
      .from('questions')
      .select('id, text, category_id, question_categories:category_id(name)')
      .in('id', periodQuestionIds?.length ? periodQuestionIds : ['00000000-0000-0000-0000-000000000000'])
    questions = qd || []
  }

  if (dutyScopeMeta) {
    questions = questions.map((q) => {
      const scoped = questionScopeForId(String(q.id), dutyScopeMeta)
      const duty = dutyScopeMeta.questionDutyMap.get(String(q.id))
      return {
        ...q,
        question_scope: scoped.scope,
        duty_name: scoped.scope === 'duty' ? duty?.dutyName || dutyFallback : null,
      }
    })
  }

  const questionsBeforeScope = [...questions]
  const scoped = await applyEvaluationQuestionScope({
    supabase: sb,
    periodId,
    evaluatorId: assignData.evaluator_id,
    targetId,
    matrixContext: assignData.matrix_context,
    questions,
    answersByQuestion,
    dutyScopeMeta,
  })
  questions = scoped.questions

  if (
    questions.length === 0 &&
    questionsBeforeScope.length > 0 &&
    matrixCtx !== 'genel' &&
    !isDutyMatrixContext(matrixCtx) &&
    !isCategoryMatrixContext(matrixCtx)
  ) {
    questions = questionsBeforeScope
  }

  return { assignData, pool: questionsBeforeScope.length, final: questions.length, questions }
}

async function main() {
  loadEnv()
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const ids = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ['0ec31fab-aa1f-4f74-b287-ef6e5cd47545', 'bfefa963-6045-4666-b3d6-579761f7eba4']

  for (const id of ids) {
    const r = await simulateGet(sb, id)
    console.log(`\n${r.assignData.evaluator?.name} → ${r.assignData.target?.name} [${r.assignData.matrix_context}]`)
    console.log(`pool=${r.pool} final=${r.final}`)
    for (const q of r.questions) {
      console.log(`  • ${q.duty_name || '-'} | ${q.question_categories?.name}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
