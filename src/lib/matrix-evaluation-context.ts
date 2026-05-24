import type { MatrixDutyPreset } from '@/lib/matrix-target-duty-assign'

export const MATRIX_EVALUATION_CONTEXTS = ['genel', 'okul_yasam', 'nobetci_ogretmeni'] as const
export type MatrixEvaluationContext = (typeof MATRIX_EVALUATION_CONTEXTS)[number]

export const DEFAULT_MATRIX_EVALUATION_CONTEXT: MatrixEvaluationContext = 'genel'

export function matrixEvaluationContextLabel(ctx: string | null | undefined): string {
  switch (String(ctx || DEFAULT_MATRIX_EVALUATION_CONTEXT)) {
    case 'okul_yasam':
      return 'Okul Yaşam'
    case 'nobetci_ogretmeni':
      return 'Nöbetçi Öğretmen'
    default:
      return 'Genel değerlendirme'
  }
}

export function assignmentPairKey(evaluatorId: string, targetId: string, matrixContext: string = DEFAULT_MATRIX_EVALUATION_CONTEXT) {
  return `${evaluatorId}::${targetId}::${matrixContext}`
}

/** Matris yükleme kutularından görev bağlamı */
export function resolveMatrixContextFromImport(opts: {
  applyCategoryScope: boolean
  dutyPreset: MatrixDutyPreset | null
}): MatrixEvaluationContext {
  if (opts.applyCategoryScope) return 'okul_yasam'
  if (opts.dutyPreset === 'nobetci_ogretmeni') return 'nobetci_ogretmeni'
  return 'genel'
}

export function normalizeMatrixContext(value: string | null | undefined): MatrixEvaluationContext {
  const v = String(value || DEFAULT_MATRIX_EVALUATION_CONTEXT).trim()
  if (v === 'okul_yasam' || v === 'nobetci_ogretmeni') return v
  return 'genel'
}
