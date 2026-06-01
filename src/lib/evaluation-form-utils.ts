/** Değerlendirme formu: yanıtları yalnızca geçerli soru kimlikleriyle hizalar. */

export function questionIdSet(questions: Array<{ id: string }>): Set<string> {
  return new Set(questions.map((q) => String(q.id)).filter(Boolean))
}

/** Eski taslak / yanlış matris bağlamından kalan yanıt anahtarlarını atar. */
export function alignResponsesToQuestions(
  responses: Record<string, string[]>,
  questions: Array<{ id: string }>
): Record<string, string[]> {
  const ids = questionIdSet(questions)
  const next: Record<string, string[]> = {}
  for (const id of ids) {
    const picked = responses[id]
    if (picked?.length) next[id] = picked
  }
  return next
}

export function countAnsweredQuestions(
  questions: Array<{ id: string }>,
  responses: Record<string, string[]>
): number {
  return questions.filter((q) => (responses[q.id] || []).length > 0).length
}

export function computeEvaluationProgress(
  questions: Array<{ id: string }>,
  responses: Record<string, string[]>
): number {
  if (!questions.length) return 0
  return Math.round((countAnsweredQuestions(questions, responses) / questions.length) * 100)
}

export function orphanResponseKeyCount(
  responses: Record<string, string[]>,
  questions: Array<{ id: string }>
): number {
  const ids = questionIdSet(questions)
  return Object.keys(responses).filter((k) => responses[k]?.length && !ids.has(k)).length
}
