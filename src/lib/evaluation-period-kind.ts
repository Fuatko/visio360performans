/** Kişisel gelişim / 360 dönemi (iş değerlendirmesi veya "other" değil). */
export function isPersonalDevelopmentPeriod(assessmentKind: unknown): boolean {
  const k = String(assessmentKind ?? 'development_360')
    .trim()
    .toLowerCase()
  if (!k || k === 'development_360' || k === 'development' || k === '360') return true
  if (k === 'job_evaluation' || k === 'job' || k === 'other') return false
  // Bilinmeyen / eski değerler: gelişim planına dahil et (kullanıcıyı boş bırakma)
  return true
}

export function normalizeAssessmentKind(assessmentKind: unknown): string {
  const k = String(assessmentKind ?? 'development_360').trim().toLowerCase()
  if (k === 'job_evaluation' || k === 'job') return 'job_evaluation'
  if (k === 'other') return 'other'
  if (k === 'development_360' || k === 'development' || k === '360') return 'development_360'
  return k || 'development_360'
}

export function assessmentKindLabel(assessmentKind: unknown, lang: 'tr' | 'en' | 'fr' = 'tr'): string {
  const k = normalizeAssessmentKind(assessmentKind)
  if (k === 'job_evaluation') {
    return lang === 'en' ? 'Job evaluation' : lang === 'fr' ? 'Évaluation professionnelle' : 'İş Değerlendirmesi'
  }
  if (k === 'other') {
    return lang === 'en' ? 'Other evaluation' : lang === 'fr' ? 'Autre évaluation' : 'Diğer Değerlendirme'
  }
  return lang === 'en'
    ? 'Personal development'
    : lang === 'fr'
      ? 'Développement personnel'
      : 'Kişisel Gelişim'
}

export type PeriodListItem = {
  id: string
  name: string
  assessmentKind?: string
}

/** matrix-data sırası: created_at desc (yeni → eski) */
export function findPreviousPeriodSameKind(
  periods: PeriodListItem[],
  selectedPeriodId: string
): { id: string; name: string; assessmentKind: string } | null {
  const idx = periods.findIndex((p) => String(p.id) === String(selectedPeriodId))
  if (idx < 0) return null
  const kind = normalizeAssessmentKind(periods[idx].assessmentKind)
  for (let i = idx + 1; i < periods.length; i++) {
    if (normalizeAssessmentKind(periods[i].assessmentKind) === kind) {
      return {
        id: String(periods[i].id),
        name: String(periods[i].name),
        assessmentKind: kind,
      }
    }
  }
  return null
}

export function countPeriodsByAssessmentKind(periods: PeriodListItem[], assessmentKind: string): number {
  const kind = normalizeAssessmentKind(assessmentKind)
  return periods.filter((p) => normalizeAssessmentKind(p.assessmentKind) === kind).length
}
