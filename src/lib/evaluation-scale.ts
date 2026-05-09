export const MULTI_CHOICE_MAX_SELECTION = 2

const JOB_EVALUATION_SCORES = new Set([3, 4, 5])

type AnswerLike = {
  level?: number | string | null
  std_score?: number | string | null
  reel_score?: number | string | null
  is_active?: boolean | null
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

export function isNoInfoAnswer(answer: AnswerLike) {
  return scoreValue(answer?.std_score) === 0 && scoreValue(answer?.reel_score) === 0
}

export function isJobEvaluationScaleAnswers(answers: AnswerLike[]) {
  const activeAnswers = answers.filter((answer) => answer.is_active !== false)
  if (activeAnswers.length !== 4) return false
  if (!activeAnswers.some(hasJobEvaluationMarker)) return false

  const noInfoAnswers = activeAnswers.filter(isNoInfoAnswer)
  const scoredAnswers = activeAnswers.filter((answer) => !isNoInfoAnswer(answer))
  if (noInfoAnswers.length !== 1 || scoredAnswers.length !== 3) return false

  const uniqueScores = new Set<number>()
  for (const answer of scoredAnswers) {
    const stdScore = scoreValue(answer.std_score)
    const reelScore = scoreValue(answer.reel_score)
    if (stdScore !== reelScore || !JOB_EVALUATION_SCORES.has(stdScore)) return false
    uniqueScores.add(stdScore)
  }

  return uniqueScores.size === JOB_EVALUATION_SCORES.size
}

export function getQuestionSelectionMode(answers: AnswerLike[]): QuestionSelectionMode {
  return isJobEvaluationScaleAnswers(answers) ? 'single' : 'multi'
}

export function getMaxSelectionsForAnswers(answers: AnswerLike[]) {
  return getQuestionSelectionMode(answers) === 'single' ? 1 : MULTI_CHOICE_MAX_SELECTION
}
