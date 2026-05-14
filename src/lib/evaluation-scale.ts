export const MULTI_CHOICE_MAX_SELECTION = 2

/**
 * İş değerlendirmesi (4 şık: 3 anlamlı + bilgim yok 0/0) için kabul edilen std=reel üçlüleri.
 * Sıralama önemli değil; set eşleşmesi yeterli. Yeni ölçek eklerken burayı güncelleyin.
 * (Uluslararası standartlar sabit rakam zorunlu kılmaz; tutarlılık ve dokümantasyon önemlidir.)
 */
const JOB_EVALUATION_SCORE_TRIPLES: ReadonlyArray<Readonly<[number, number, number]>> = [
  [3, 4, 5],
  [2, 4, 5],
  [2, 3, 5],
  [1, 3, 5],
]

const TRIPLE_KEYS = new Set(
  JOB_EVALUATION_SCORE_TRIPLES.map((t) => [...t].sort((a, b) => a - b).join(','))
)

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
    if (stdScore !== reelScore || stdScore <= 0) return false
    uniqueScores.add(stdScore)
  }

  if (uniqueScores.size !== 3) return false
  const key = [...uniqueScores].sort((a, b) => a - b).join(',')
  return TRIPLE_KEYS.has(key)
}

export function getQuestionSelectionMode(answers: AnswerLike[]): QuestionSelectionMode {
  return isJobEvaluationScaleAnswers(answers) ? 'single' : 'multi'
}

export function getMaxSelectionsForAnswers(answers: AnswerLike[]) {
  return getQuestionSelectionMode(answers) === 'single' ? 1 : MULTI_CHOICE_MAX_SELECTION
}
