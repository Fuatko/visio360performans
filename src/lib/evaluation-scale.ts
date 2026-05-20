export const MULTI_CHOICE_MAX_SELECTION = 2

/** İş değerlendirmesi performans şıkları (ortalamaya girer) */
export const JOB_EVALUATION_PERFORMANCE_SCORES = [5, 3, 1, 0] as const

type AnswerLike = {
  level?: number | string | null
  std_score?: number | string | null
  reel_score?: number | string | null
  is_active?: boolean | null
  text?: string | null
  text_fr?: string | null
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

/**
 * İş değerlendirmesi: 4 performans şıkkı (5, 3, 1, 0; std=reel) + isteğe bağlı «Fikrim yok» (0/0, ortalamaya girmez).
 */
export function isJobEvaluationScaleAnswers(answers: AnswerLike[]) {
  const activeAnswers = answers.filter((answer) => answer.is_active !== false)
  if (!activeAnswers.some(hasJobEvaluationMarker)) return false

  const noInfoAnswers = activeAnswers.filter(isNoInfoAnswer)
  const scoredAnswers = activeAnswers.filter((answer) => !isNoInfoAnswer(answer))

  if (scoredAnswers.length !== 4) return false
  if (noInfoAnswers.length > 1) return false

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

export function getQuestionSelectionMode(answers: AnswerLike[]): QuestionSelectionMode {
  return isJobEvaluationScaleAnswers(answers) ? 'single' : 'multi'
}

export function getMaxSelectionsForAnswers(answers: AnswerLike[]) {
  return getQuestionSelectionMode(answers) === 'single' ? 1 : MULTI_CHOICE_MAX_SELECTION
}
