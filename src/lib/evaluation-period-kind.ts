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
