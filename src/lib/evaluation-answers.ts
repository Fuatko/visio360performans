import {
  isJobEvaluationScaleAnswers,
  isNoInfoAnswer,
  JOB_EVALUATION_PERFORMANCE_SCORES,
  type AnswerLike,
} from '@/lib/evaluation-scale'

function answerOrder(a: AnswerLike) {
  return Number(a.order_num ?? a.sort_order ?? 0)
}

/** Aynı cevap id veya iş değerlendirmesinde aynı performans puanı tekrarlarını temizler. */
export function normalizeQuestionAnswersForDisplay(answers: AnswerLike[]): AnswerLike[] {
  const active = (answers || []).filter((a) => a.is_active !== false)
  const byId = new Map<string, AnswerLike>()
  for (const a of active) {
    const id = String(a.id || '').trim()
    if (id) {
      if (!byId.has(id)) byId.set(id, a)
      continue
    }
    byId.set(`anon-${byId.size}`, a)
  }
  const unique = Array.from(byId.values()).sort((a, b) => answerOrder(a) - answerOrder(b))

  const noInfo = unique.filter(isNoInfoAnswer)
  const scored = unique.filter((a) => !isNoInfoAnswer(a))

  const looksLikeJobScale =
    isJobEvaluationScaleAnswers(unique) ||
    (scored.length >= 4 &&
      scored.every((a) => {
        const s = Math.round(Number(a.std_score ?? 0))
        return (JOB_EVALUATION_PERFORMANCE_SCORES as readonly number[]).includes(s)
      }))

  if (!looksLikeJobScale) return unique

  const byScore = new Map<number, AnswerLike>()
  const extras: AnswerLike[] = []
  for (const a of scored) {
    const s = Math.round(Number(a.std_score ?? 0))
    if ((JOB_EVALUATION_PERFORMANCE_SCORES as readonly number[]).includes(s)) {
      if (!byScore.has(s)) byScore.set(s, a)
      continue
    }
    extras.push(a)
  }

  const performance = (JOB_EVALUATION_PERFORMANCE_SCORES as readonly number[])
    .map((s) => byScore.get(s))
    .filter(Boolean) as AnswerLike[]

  const noInfoOne = noInfo.length ? [noInfo[0]] : []
  return [...performance, ...extras, ...noInfoOne]
}

export function mergeQuestionAnswerLists(...lists: AnswerLike[][]): AnswerLike[] {
  return normalizeQuestionAnswersForDisplay(lists.flat())
}

export function finalizeAnswersMapForQuestions(
  answersByQuestion: Record<string, AnswerLike[]>,
  questionIds: string[]
): Record<string, AnswerLike[]> {
  const next: Record<string, AnswerLike[]> = {}
  for (const qid of questionIds) {
    const key = String(qid || '').trim()
    if (!key) continue
    next[key] = normalizeQuestionAnswersForDisplay(answersByQuestion[key] || [])
  }
  return next
}

type SupabaseLike = { from: (table: string) => any }

/** Snapshot’ta eksik «Bilgim yok» veya yinelenen şıklar için canlı cevap tablosunu tamamlar. */
export async function enrichAnswersByQuestionFromLive(
  supabase: SupabaseLike,
  answersByQuestion: Record<string, AnswerLike[]>,
  questionIds: string[]
): Promise<Record<string, AnswerLike[]>> {
  const ids = Array.from(new Set(questionIds.map((id) => String(id || '').trim()).filter(Boolean)))
  if (!ids.length) return answersByQuestion

  const liveByQuestion = new Map<string, AnswerLike[]>()

  const loadTable = async (table: 'question_answers' | 'answers') => {
    const res = await supabase.from(table).select('*').in('question_id', ids)
    if (res.error) return
    ;((res.data || []) as AnswerLike[]).forEach((a) => {
      const qid = String(a.question_id || '').trim()
      if (!qid) return
      const cur = liveByQuestion.get(qid) || []
      cur.push(a)
      liveByQuestion.set(qid, cur)
    })
  }

  await loadTable('question_answers')
  if (liveByQuestion.size === 0) await loadTable('answers')

  const out = { ...answersByQuestion }
  for (const qid of ids) {
    const merged = mergeQuestionAnswerLists(out[qid] || [], liveByQuestion.get(qid) || [])
    out[qid] = merged
  }
  return out
}
