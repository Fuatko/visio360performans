export const MULTI_CHOICE_MAX_SELECTION = 2

/** Formda görünen üç performans: İyi–Orta–Zayıf */
export const JOB_EVALUATION_CORE_SCORES = [5, 3, 1] as const

/** Tüm iş değ. puanları (0 = en düşük performans; Bilgim yok değildir) */
export const JOB_EVALUATION_PERFORMANCE_SCORES = [5, 3, 1, 0] as const

export type AnswerLike = {
  id?: string | null
  question_id?: string | null
  level?: number | string | null
  std_score?: number | string | null
  reel_score?: number | string | null
  is_active?: boolean | null
  text?: string | null
  text_en?: string | null
  text_fr?: string | null
  order_num?: number | null
  sort_order?: number | null
}

export type QuestionSelectionMode = 'single' | 'multi'

function scoreValue(value: number | string | null | undefined) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function levelValue(value: number | string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
}

function hasJobEvaluationMarker(answer: AnswerLike) {
  const level = levelValue(answer?.level)
  return ['job_evaluation', 'job-evaluation', 'is_degerlendirme', 'iş_değerlendirme', 'tek_secim'].includes(level)
}

/** «Fikrim yok» / «Bilgim yok» — puanlamaya dahil edilmez (std=0, reel=0) */
export function isNoInfoAnswerText(text: string, textFr?: string) {
  const t = `${text} ${textFr || ''}`.toLocaleLowerCase('tr-TR')
  return (
    /fikrim\s*yok|fikrim\s*bulunmuyor|bilgim\s*yok|bilgi(m)?\s*yok/.test(t) ||
    /je\s+ne\s+sais(\s+pas)?|je\s+n.?ai\s+pas\s+d.?avis|sans\s+avis|pas\s+d.?avis|avis\s+indiff|aucune\s+idee|aucune\s+idée/.test(t) ||
    /no\s+opinion|don.?t\s+know|not\s+sure/.test(t)
  )
}

export function isNoInfoAnswer(answer: AnswerLike) {
  if (isNoInfoAnswerText(String(answer.text || ''), String(answer.text_fr || ''))) return true
  const level = levelValue(answer?.level)
  return ['no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok'].includes(level)
}

function scoredPerformanceAnswers(answers: AnswerLike[]) {
  return answers.filter((answer) => answer.is_active !== false && !isNoInfoAnswer(answer))
}

/** 4 performans şıkkı (5, 3, 1, 0) — level işaretli veya işaretsiz */
export function isFourPointPerformanceScale(answers: AnswerLike[]) {
  const activeAnswers = answers.filter((answer) => answer.is_active !== false)
  const scoredAnswers = scoredPerformanceAnswers(activeAnswers)
  if (scoredAnswers.length !== 4) return false
  if (activeAnswers.length > 5) return false

  const performanceSet = new Set<number>()
  for (const answer of scoredAnswers) {
    const stdScore = scoreValue(answer.std_score)
    const reelScore = scoreValue(answer.reel_score)
    if (stdScore !== reelScore) return false
    if (!(JOB_EVALUATION_PERFORMANCE_SCORES as readonly number[]).includes(stdScore)) return false
    performanceSet.add(stdScore)
  }
  return performanceSet.size === 4
}

function performanceScoreSet(scoredAnswers: AnswerLike[]) {
  const performanceSet = new Set<number>()
  for (const answer of scoredAnswers) {
    const stdScore = scoreValue(answer.std_score)
    const reelScore = scoreValue(answer.reel_score)
    if (stdScore !== reelScore) return null
    if (!(JOB_EVALUATION_PERFORMANCE_SCORES as readonly number[]).includes(stdScore)) return null
    performanceSet.add(stdScore)
  }
  return performanceSet
}

/**
 * İş değerlendirmesi ölçeği:
 * - **Standart (4 şık):** 5, 3, 1 (İyi–Orta–Zayıf) + 1 Bilgim yok
 * - **Genişletilmiş:** 5, 3, 1, 0 performans + isteğe bağlı Bilgim yok (5. satır)
 */
export function isJobEvaluationScaleAnswers(answers: AnswerLike[]) {
  const activeAnswers = answers.filter((answer) => answer.is_active !== false)
  if (!activeAnswers.length) return false

  const noInfoAnswers = activeAnswers.filter(isNoInfoAnswer)
  const scoredAnswers = scoredPerformanceAnswers(activeAnswers)
  if (noInfoAnswers.length > 1) return false

  const performanceSet = performanceScoreSet(scoredAnswers)
  if (!performanceSet) return false

  const hasMarker = activeAnswers.some(hasJobEvaluationMarker)

  // 4 şık: 5 + 3 + 1 + Bilgim yok
  if (
    scoredAnswers.length === 3 &&
    noInfoAnswers.length === 1 &&
    (JOB_EVALUATION_CORE_SCORES as readonly number[]).every((s) => performanceSet.has(s)) &&
    activeAnswers.length === 4
  ) {
    return true
  }

  // 4 performans (5,3,1,0) — Bilgim yok olmadan veya 5. şıkla
  if (scoredAnswers.length === 4 && performanceSet.size === 4) {
    return hasMarker || isFourPointPerformanceScale(activeAnswers)
  }

  return false
}

export function getQuestionSelectionMode(answers: AnswerLike[]): QuestionSelectionMode {
  return isJobEvaluationScaleAnswers(answers) ? 'single' : 'multi'
}

export function getMaxSelectionsForAnswers(answers: AnswerLike[]) {
  return getQuestionSelectionMode(answers) === 'single' ? 1 : MULTI_CHOICE_MAX_SELECTION
}

/** Excel import: question_answers.level NOT NULL — her cevap için seviye üretir */
export function resolveImportAnswerLevel(row: {
  level?: string | null
  a_tr: string
  a_fr?: string | null
  std_score: number
}): string {
  const explicit = String(row.level || '').trim()
  if (explicit) return explicit
  if (isNoInfoAnswerText(row.a_tr, row.a_fr || '')) return 'no_opinion'
  const s = Math.round(Number(row.std_score))
  if (Number.isFinite(s) && (JOB_EVALUATION_PERFORMANCE_SCORES as readonly number[]).includes(s)) {
    return 'job_evaluation'
  }
  if (Number.isFinite(s)) return String(s)
  return 'job_evaluation'
}
