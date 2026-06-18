export type EvaluatorAnswerDetailRow = {
  assignmentId: string
  targetId: string
  targetName: string
  targetDept: string
  evaluatorId: string
  evaluatorName: string
  evaluatorTitle: string
  evaluatorDept: string
  evaluatorLevel: string
  evaluatorLevelLabel: string
  evaluatorWeight: number
  matrixContext: string
  matrixLabel: string
  isSelf: boolean
  categoryKey: string
  categoryLabel: string
  questionId: string
  questionText: string
  questionOrder: number
  score: number
  isScorable: boolean
  questionScope: 'period' | 'duty'
  dutyId?: string | null
  dutyName?: string | null
  assignmentHints: string[]
}

export type EvaluatorAnswerDetailLang = 'tr' | 'en' | 'fr'

export function positionLevelLabel(level: string, lang: EvaluatorAnswerDetailLang): string {
  const k = String(level || 'peer').toLowerCase()
  const map: Record<string, { tr: string; en: string; fr: string }> = {
    self: { tr: 'Öz', en: 'Self', fr: 'Auto' },
    executive: { tr: 'Üst yönetim', en: 'Executive', fr: 'Direction' },
    manager: { tr: 'Yönetici', en: 'Manager', fr: 'Manager' },
    peer: { tr: 'Ekip', en: 'Peer', fr: 'Pair' },
    subordinate: { tr: 'Ast', en: 'Subordinate', fr: 'Subordonné' },
  }
  const row = map[k] || map.peer
  return row[lang]
}

export function hintFlagLabel(flag: string, lang: EvaluatorAnswerDetailLang): string {
  const map: Record<string, { tr: string; en: string; fr: string }> = {
    uniform_high: {
      tr: 'Tüm sorularda yüksek puan',
      en: 'All high scores',
      fr: 'Notes élevées partout',
    },
    uniform_low: {
      tr: 'Tüm sorularda düşük puan',
      en: 'All low scores',
      fr: 'Notes basses partout',
    },
    low_variance: {
      tr: 'Çok benzer puanlar (düşük varyans)',
      en: 'Very similar scores (low variance)',
      fr: 'Scores très similaires (faible variance)',
    },
    mostly_no_opinion: {
      tr: 'Çoğunlukla fikrim yok',
      en: 'Mostly no-opinion',
      fr: 'Surtout sans avis',
    },
  }
  const row = map[flag]
  if (!row) return flag
  return row[lang]
}

/** Atama düzeyinde kalibrasyon ipuçları — kesin hüküm değil. */
export function computeAssignmentScoringHints(scores: number[]): string[] {
  const all = scores.filter((s) => Number.isFinite(s))
  if (!all.length) return []
  const scorable = all.filter((s) => s > 0)
  const flags: string[] = []
  if (scorable.length === 0 && all.length >= 3) flags.push('mostly_no_opinion')
  if (scorable.length >= 3) {
    const max = Math.max(...scorable)
    const min = Math.min(...scorable)
    if (scorable.every((s) => s === max) && max >= 4) flags.push('uniform_high')
    if (scorable.every((s) => s === min) && min <= 1) flags.push('uniform_low')
    const mean = scorable.reduce((a, b) => a + b, 0) / scorable.length
    const variance = scorable.reduce((a, b) => a + (b - mean) ** 2, 0) / scorable.length
    if (variance < 0.15) flags.push('low_variance')
  }
  return flags
}

export function responseNumericScore(r: {
  reel_score?: unknown
  std_score?: unknown
  score?: unknown
}): number {
  const n = Number(r?.reel_score ?? r?.std_score ?? r?.score ?? 0)
  return Number.isFinite(n) ? n : 0
}
