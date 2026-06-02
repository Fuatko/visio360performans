/**
 * Form (GET) ve gönderim (POST) için aynı soru kapsamı — yan görev matrislerinde genel soruların karışmaması.
 */
import type { DutyScopeMeta } from '@/lib/server/evaluation-duty-questions'
import {
  enrichEvaluatorScopePeriodCategories,
  fetchEvaluatorScopeConfig,
  filterQuestionsForEvaluatorScope,
  mergeEvaluatorScopedDutyQuestions,
  prepareEvaluatorScopeForAssignment,
  pruneAnswersByQuestion,
} from '@/lib/server/evaluation-evaluator-scope'
import {
  isCategoryMatrixContext,
  isDutyMatrixContext,
  normalizeMatrixContext,
} from '@/lib/matrix-evaluation-context'
import type { DutyLike } from '@/lib/duty-title-match'

export type ApplyEvaluationQuestionScopeInput = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  periodId: string
  evaluatorId: string
  targetId: string
  matrixContext: string | null | undefined
  questions: any[]
  answersByQuestion: Record<string, any[]>
  dutyScopeMeta: DutyScopeMeta | null
}

/** GET ve POST aynı filtre: tüm tanımlı yan görev + okul_yasam + özel duty code */
export async function applyEvaluationQuestionScope(
  input: ApplyEvaluationQuestionScopeInput
): Promise<{ questions: any[]; answersByQuestion: Record<string, any[]> }> {
  const { supabase, periodId, evaluatorId, targetId, dutyScopeMeta } = input
  let questions = input.questions
  const answersByQuestion = { ...input.answersByQuestion }
  const matrixContext = normalizeMatrixContext(input.matrixContext)

  let evaluatorScope =
    periodId && evaluatorId
      ? await fetchEvaluatorScopeConfig(supabase, periodId, evaluatorId, targetId || null, matrixContext)
      : null

  if (
    (isDutyMatrixContext(matrixContext) || isCategoryMatrixContext(matrixContext)) &&
    periodId &&
    evaluatorId &&
    targetId
  ) {
    const periodCategoryIdsFromQuestions = new Set<string>()
    questions.forEach((q) => {
      const cid = String((q as any).category_id || '')
      if (cid) periodCategoryIdsFromQuestions.add(cid)
    })
    const dutyRows = isDutyMatrixContext(matrixContext)
      ? (
          await supabase
            .from('evaluation_duties')
            .select('id, name, code, name_en, name_fr')
            .eq('period_id', periodId)
        ).data
      : []
    evaluatorScope = await prepareEvaluatorScopeForAssignment(supabase, evaluatorScope, {
      periodId,
      evaluatorId,
      targetId,
      matrixContext,
      duties: (dutyRows || []) as DutyLike[],
      periodCategoryIdsFromQuestions,
    })
  }

  evaluatorScope = await enrichEvaluatorScopePeriodCategories(
    supabase,
    periodId,
    evaluatorScope,
    matrixContext
  )

  if (evaluatorScope?.isConfigured && evaluatorScope.dutyMode !== 'none') {
    questions = await mergeEvaluatorScopedDutyQuestions(
      supabase,
      periodId,
      questions,
      answersByQuestion,
      evaluatorScope,
      dutyScopeMeta
    )
  }
  if (evaluatorScope?.isConfigured) {
    questions = filterQuestionsForEvaluatorScope(questions, evaluatorScope)
    const qIds = new Set(questions.map((q) => String((q as any).id)))
    const pruned = pruneAnswersByQuestion(answersByQuestion, qIds)
    Object.keys(answersByQuestion).forEach((k) => delete answersByQuestion[k])
    Object.assign(answersByQuestion, pruned)
  }

  return { questions, answersByQuestion }
}
