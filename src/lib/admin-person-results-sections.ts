import {
  isCoreGeneralReportMatrixContext,
  isDutyMatrixContext,
  matrixEvaluationContextLabel,
} from '@/lib/matrix-evaluation-context'

export type PersonEvaluationRow = {
  matrixContext?: string
  isSelf?: boolean
  [key: string]: unknown
}

export type MatrixSliceRow = {
  matrixContext: string
  matrixLabel: string
  isDutyMatrix?: boolean
  categoryCompare?: Array<{
    name: string
    self?: number
    peer: number
    diff?: number
    peerTrimmed?: number
  }>
}

export function groupPersonEvaluationsForDisplay<T extends PersonEvaluationRow>(evals: T[]) {
  const coreGeneral: T[] = []
  const dutyByContext = new Map<string, T[]>()
  for (const ev of evals || []) {
    const ctx = String(ev.matrixContext || 'genel')
    if (isCoreGeneralReportMatrixContext(ctx)) {
      coreGeneral.push(ev)
    } else if (isDutyMatrixContext(ctx)) {
      const cur = dutyByContext.get(ctx) || []
      cur.push(ev)
      dutyByContext.set(ctx, cur)
    }
  }
  const dutyGroups = [...dutyByContext.entries()]
    .sort((a, b) => matrixEvaluationContextLabel(a[0]).localeCompare(matrixEvaluationContextLabel(b[0]), 'tr'))
    .map(([context, evaluations]) => ({
      context,
      label: matrixEvaluationContextLabel(context),
      evaluations,
    }))
  return { coreGeneral, dutyGroups }
}

export function splitMatrixSlicesForPersonDisplay(slices: MatrixSliceRow[]) {
  const coreSlices = (slices || []).filter((s) => !s.isDutyMatrix)
  const dutySlices = (slices || []).filter((s) => s.isDutyMatrix)
  return { coreSlices, dutySlices }
}

export function coreGeneralReportSectionLabel(lang: 'tr' | 'en' | 'fr'): string {
  if (lang === 'en') return 'General evaluation & School Life'
  if (lang === 'fr') return 'Évaluation générale & Vie scolaire'
  return 'Genel değerlendirme & Okul Yaşam'
}

export function coreGeneralCategoryScopeNote(lang: 'tr' | 'en' | 'fr'): string {
  if (lang === 'en') {
    return 'This section merges General evaluation and School Life data. Extra-duty forms (club, duty, etc.) are shown separately.'
  }
  if (lang === 'fr') {
    return 'Cette section fusionne l’évaluation générale et la vie scolaire. Les formulaires de tâches annexes sont affichés séparément.'
  }
  return 'Bu bölüm Genel değerlendirme ve Okul Yaşam verilerini birleştirir. Yan görev formları (kulüp, nöbet vb.) ayrı gösterilir.'
}
