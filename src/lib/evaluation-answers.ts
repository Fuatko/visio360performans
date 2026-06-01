import {
  isJobEvaluationScaleAnswers,
  isNoInfoAnswer,
  JOB_EVALUATION_PERFORMANCE_SCORES,
  type AnswerLike,
} from '@/lib/evaluation-scale'

const LIVE_FETCH_CHUNK = 150

function answerOrder(a: AnswerLike) {
  return Number(a.order_num ?? a.sort_order ?? 0)
}

function isActiveAnswer(a: AnswerLike) {
  return a.is_active !== false
}

/** Yalnızca cevap id ile tekilleştir (veri silmez). */
export function dedupeAnswersById(answers: AnswerLike[]): AnswerLike[] {
  const byId = new Map<string, AnswerLike>()
  for (const a of answers || []) {
    if (!isActiveAnswer(a)) continue
    const id = String(a.id || '').trim()
    if (id) {
      if (!byId.has(id)) byId.set(id, a)
      continue
    }
    byId.set(`anon-${byId.size}`, a)
  }
  return Array.from(byId.values()).sort((a, b) => answerOrder(a) - answerOrder(b))
}

function mergeAnswersById(...lists: AnswerLike[][]): AnswerLike[] {
  const byId = new Map<string, AnswerLike>()
  for (const list of lists) {
    for (const a of list || []) {
      if (!isActiveAnswer(a)) continue
      const id = String(a.id || '').trim()
      if (id) byId.set(id, a)
    }
  }
  return Array.from(byId.values()).sort((a, b) => answerOrder(a) - answerOrder(b))
}

/**
 * Yinelenen performans puanı (5-3-1-0) varsa tekilleştir.
 * Eksik setleri (2-3 şık) asla budamaz — canlı tablo tamamlanana kadar olduğu gibi bırakır.
 */
export function normalizeQuestionAnswersForDisplay(answers: AnswerLike[]): AnswerLike[] {
  const unique = dedupeAnswersById(answers)
  if (!unique.length) return unique

  const noInfo = unique.filter(isNoInfoAnswer)
  const scored = unique.filter((a) => !isNoInfoAnswer(a))

  const shouldCollapseScores =
    isJobEvaluationScaleAnswers(unique) ||
    (scored.length > 4 &&
      scored.filter((a) =>
        (JOB_EVALUATION_PERFORMANCE_SCORES as readonly number[]).includes(Math.round(Number(a.std_score ?? 0)))
      ).length > 4)

  if (!shouldCollapseScores) return unique

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
  const collapsed = [...performance, ...extras, ...noInfoOne]

  // Güvenlik: budama sonrası anlamlı şekilde azaldıysa ham listeyi koru
  if (collapsed.length < unique.length && collapsed.length < 4) return unique
  return collapsed.length >= unique.length ? unique : collapsed.length >= 4 ? collapsed : unique
}

/** Snapshot eksikse canlı kayıt authoritative; aksi halde birleşik küme. */
export function resolveCanonicalAnswersForQuestion(
  snapshotAnswers: AnswerLike[],
  liveAnswers: AnswerLike[]
): AnswerLike[] {
  const snap = dedupeAnswersById(snapshotAnswers)
  const live = dedupeAnswersById(liveAnswers)

  if (!live.length) return normalizeQuestionAnswersForDisplay(snap)
  if (!snap.length) return normalizeQuestionAnswersForDisplay(live)

  // Canlı tablo genelde güncel ve tam — snapshot’ta 2-3 şık kalsa bile canlıyı tercih et
  if (live.length > snap.length) return normalizeQuestionAnswersForDisplay(live)
  if (live.length === snap.length && isJobEvaluationScaleAnswers(live) && !isJobEvaluationScaleAnswers(snap)) {
    return normalizeQuestionAnswersForDisplay(live)
  }

  const merged = mergeAnswersById(snap, live)
  if (merged.length > snap.length) return normalizeQuestionAnswersForDisplay(merged)

  return normalizeQuestionAnswersForDisplay(snap.length >= live.length ? snap : live)
}

export function mergeQuestionAnswerLists(...lists: AnswerLike[][]): AnswerLike[] {
  return normalizeQuestionAnswersForDisplay(mergeAnswersById(...lists))
}

export function finalizeAnswersMapForQuestions(
  answersByQuestion: Record<string, AnswerLike[]>,
  questionIds: string[],
  liveByQuestion?: Map<string, AnswerLike[]>
): Record<string, AnswerLike[]> {
  const next: Record<string, AnswerLike[]> = {}
  for (const qid of questionIds) {
    const key = String(qid || '').trim()
    if (!key) continue
    const snap = answersByQuestion[key] || []
    const live = liveByQuestion?.get(key) || []
    next[key] = liveByQuestion ? resolveCanonicalAnswersForQuestion(snap, live) : normalizeQuestionAnswersForDisplay(snap)
  }
  return next
}

type SupabaseLike = { from: (table: string) => any }

function chunkIds(ids: string[], size: number) {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

async function fetchLiveAnswersChunked(
  supabase: SupabaseLike,
  questionIds: string[]
): Promise<Map<string, AnswerLike[]>> {
  const byQuestion = new Map<string, AnswerLike[]>()
  if (!questionIds.length) return byQuestion

  const appendRows = (rows: AnswerLike[]) => {
    for (const a of rows) {
      if (!isActiveAnswer(a)) continue
      const qid = String(a.question_id || '').trim()
      if (!qid) continue
      const cur = byQuestion.get(qid) || []
      cur.push(a)
      byQuestion.set(qid, cur)
    }
  }

  const loadTable = async (table: 'question_answers' | 'answers') => {
    for (const batch of chunkIds(questionIds, LIVE_FETCH_CHUNK)) {
      const res = await supabase.from(table).select('*').in('question_id', batch)
      if (res.error) continue
      appendRows((res.data || []) as AnswerLike[])
    }
  }

  // Her iki tabloyu birleştir (yalnızca biri dolu olsa bile diğerini de dene)
  await loadTable('question_answers')
  await loadTable('answers')

  return byQuestion
}

/**
 * Form için cevap listesi: snapshot + canlı birleşimi, veri yazmaz.
 */
export async function enrichAnswersByQuestionFromLive(
  supabase: SupabaseLike,
  answersByQuestion: Record<string, AnswerLike[]>,
  questionIds: string[]
): Promise<Record<string, AnswerLike[]>> {
  const ids = Array.from(new Set(questionIds.map((id) => String(id || '').trim()).filter(Boolean)))
  if (!ids.length) return answersByQuestion

  const liveByQuestion = await fetchLiveAnswersChunked(supabase, ids)
  return finalizeAnswersMapForQuestions(answersByQuestion, ids, liveByQuestion)
}

/** Admin teşhis: soru başına snapshot vs canlı şık sayısı */
export type AnswerCountDiagnosticRow = {
  question_id: string
  snapshot_count: number
  live_count: number
  merged_canonical_count: number
  has_job_scale_live: boolean
  has_job_scale_snap: boolean
}

export function diagnoseAnswerCounts(
  answersByQuestion: Record<string, AnswerLike[]>,
  liveByQuestion: Map<string, AnswerLike[]>,
  questionIds: string[]
): AnswerCountDiagnosticRow[] {
  return questionIds.map((qid) => {
    const key = String(qid || '').trim()
    const snap = answersByQuestion[key] || []
    const live = liveByQuestion.get(key) || []
    const canonical = resolveCanonicalAnswersForQuestion(snap, live)
    return {
      question_id: key,
      snapshot_count: dedupeAnswersById(snap).length,
      live_count: dedupeAnswersById(live).length,
      merged_canonical_count: canonical.length,
      has_job_scale_live: isJobEvaluationScaleAnswers(dedupeAnswersById(live)),
      has_job_scale_snap: isJobEvaluationScaleAnswers(dedupeAnswersById(snap)),
    }
  })
}
