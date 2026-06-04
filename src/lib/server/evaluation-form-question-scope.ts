/**
 * Form (GET) ve gönderim (POST) için aynı soru kapsamı — yan görev matrislerinde genel soruların karışmaması.
 */
import { matchPeriodCategoriesToPreset } from '@/lib/evaluator-scope-presets'
import type { DutyScopeMeta } from '@/lib/server/evaluation-duty-questions'
import {
  collectQuestionIdsForDutyIds,
  fetchDutyLinkedCategoryIdsForPeriod,
} from '@/lib/server/evaluation-duty-questions'
import {
  enrichEvaluatorScopePeriodCategories,
  fetchEvaluatorScopeConfig,
  filterQuestionsForEvaluatorScope,
  loadPeriodCategoryOptions,
  mergeEvaluatorScopedDutyQuestions,
  prepareEvaluatorScopeForAssignment,
  pruneAnswersByQuestion,
  questionCategoryId,
  type EvaluatorScopeConfig,
} from '@/lib/server/evaluation-evaluator-scope'
import {
  findDutyIdForMatrixContext,
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

async function buildDefaultGenelScope(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  periodId: string,
  evaluatorId: string,
  targetId: string,
  dutyCategoryIds: Set<string>
): Promise<EvaluatorScopeConfig | null> {
  const allCats = await loadPeriodCategoryOptions(supabase, periodId)
  const genelCats = allCats.filter((c) => !dutyCategoryIds.has(c.id))
  const { ids } = matchPeriodCategoriesToPreset(genelCats, 'genel_tum_kilitli')
  if (!ids.length) return null
  return {
    periodId,
    evaluatorId,
    targetId,
    restrictPeriod: true,
    dutyMode: 'none',
    periodCategoryIds: new Set(ids),
    dutyCategoryIds: new Set(),
    dutyPackageIds: new Set(),
    isConfigured: true,
    scopeLevel: 'evaluator',
    usesAutoTargetDuties: false,
  }
}

/** Genel matris: yalnızca dönem (G) soruları; görev paketi kategorileri ve duty scope hariç. */
async function finalizeGenelEvaluationQuestions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  periodId: string,
  evaluatorId: string,
  targetId: string,
  questions: any[],
  answersByQuestion: Record<string, any[]>,
  dutyScopeMeta: DutyScopeMeta | null,
  evaluatorScope: EvaluatorScopeConfig | null
): Promise<{ questions: any[]; answersByQuestion: Record<string, any[]> }> {
  const dutyCategoryIds = await fetchDutyLinkedCategoryIdsForPeriod(supabase, periodId)

  let nextQuestions = (questions || []).filter((q) => {
    if (String(q?.question_scope || 'period') === 'duty') return false
    const qid = String(q?.id || '').trim()
    if (dutyScopeMeta?.dutyOnlyQuestionIds.has(qid)) return false
    const cid = questionCategoryId(q)
    if (cid && dutyCategoryIds.has(cid)) return false
    return true
  })

  let config = evaluatorScope
  if (!config?.isConfigured || !config.restrictPeriod || !config.periodCategoryIds.size) {
    config = await buildDefaultGenelScope(supabase, periodId, evaluatorId, targetId, dutyCategoryIds)
  } else if (config.dutyMode !== 'none') {
    config = {
      ...config,
      dutyMode: 'none',
      dutyPackageIds: new Set(),
      dutyCategoryIds: new Set(),
      usesAutoTargetDuties: false,
    }
  }

  if (config?.isConfigured) {
    const enriched = await enrichEvaluatorScopePeriodCategories(supabase, periodId, config, 'genel')
    nextQuestions = filterQuestionsForEvaluatorScope(nextQuestions, enriched)
    const qIds = new Set(nextQuestions.map((q) => String((q as any).id)))
    const pruned = pruneAnswersByQuestion(answersByQuestion, qIds)
    return { questions: nextQuestions, answersByQuestion: pruned }
  }

  const qIds = new Set(nextQuestions.map((q) => String((q as any).id)))
  const pruned = pruneAnswersByQuestion(answersByQuestion, qIds)
  return { questions: nextQuestions, answersByQuestion: pruned }
}

/** GET ve POST aynı filtre: tüm tanımlı yan görev + okul_yasam + özel duty code */
export async function applyEvaluationQuestionScope(
  input: ApplyEvaluationQuestionScopeInput
): Promise<{ questions: any[]; answersByQuestion: Record<string, any[]> }> {
  const { supabase, periodId, evaluatorId, targetId, dutyScopeMeta } = input
  let questions = input.questions
  const answersByQuestion = { ...input.answersByQuestion }
  const matrixContext = normalizeMatrixContext(input.matrixContext)
  const isGenel = matrixContext === 'genel'
  const isDutyMatrix = isDutyMatrixContext(matrixContext)

  let dutyRowsForMatrix: DutyLike[] = []
  if (isDutyMatrix && periodId) {
    const { data } = await supabase
      .from('evaluation_duties')
      .select('id, name, code, name_en, name_fr')
      .eq('period_id', periodId)
    dutyRowsForMatrix = (data || []) as DutyLike[]
  }

  let evaluatorScope =
    periodId && evaluatorId
      ? await fetchEvaluatorScopeConfig(supabase, periodId, evaluatorId, targetId || null, matrixContext)
      : null

  if ((isDutyMatrix || isCategoryMatrixContext(matrixContext)) && periodId && evaluatorId && targetId) {
    const periodCategoryIdsFromQuestions = new Set<string>()
    questions.forEach((q) => {
      const cid = String((q as any).category_id || '')
      if (cid) periodCategoryIdsFromQuestions.add(cid)
    })
    evaluatorScope = await prepareEvaluatorScopeForAssignment(supabase, evaluatorScope, {
      periodId,
      evaluatorId,
      targetId,
      matrixContext,
      duties: isDutyMatrix ? dutyRowsForMatrix : [],
      periodCategoryIdsFromQuestions,
    })
  }

  evaluatorScope = await enrichEvaluatorScopePeriodCategories(
    supabase,
    periodId,
    evaluatorScope,
    matrixContext
  )

  if (!isGenel && evaluatorScope?.isConfigured && evaluatorScope.dutyMode !== 'none') {
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

  if (isGenel && periodId) {
    return finalizeGenelEvaluationQuestions(
      supabase,
      periodId,
      evaluatorId,
      targetId,
      questions,
      answersByQuestion,
      dutyScopeMeta,
      evaluatorScope
    )
  }

  // Son güvenlik: görev matrisinde yalnızca bu kartın paket soruları (ör. yaşam koordinatörü ≠ sınıf öğretmeni)
  if (isDutyMatrix && periodId) {
    const dutyId = findDutyIdForMatrixContext(dutyRowsForMatrix, matrixContext)
    if (dutyId) {
      const allowedQuestionIds = await collectQuestionIdsForDutyIds(supabase, periodId, [dutyId])
      questions = questions.filter((q) => allowedQuestionIds.has(String((q as any).id || '')))
      const qIds = new Set(questions.map((q) => String((q as any).id)))
      const pruned = pruneAnswersByQuestion(answersByQuestion, qIds)
      Object.keys(answersByQuestion).forEach((k) => delete answersByQuestion[k])
      Object.assign(answersByQuestion, pruned)
    }
  }

  // okul_yasam: yalnızca matriste seçili genel kategoriler (ör. Utku — 2 kategori)
  if (
    isCategoryMatrixContext(matrixContext) &&
    evaluatorScope?.isConfigured &&
    evaluatorScope.periodCategoryIds.size
  ) {
    const allowed = evaluatorScope.periodCategoryIds
    questions = questions.filter((q) => {
      const cid = questionCategoryId(q)
      return cid ? allowed.has(cid) : false
    })
    const qIds = new Set(questions.map((q) => String((q as any).id)))
    const pruned = pruneAnswersByQuestion(answersByQuestion, qIds)
    Object.keys(answersByQuestion).forEach((k) => delete answersByQuestion[k])
    Object.assign(answersByQuestion, pruned)
  }

  return { questions, answersByQuestion }
}
