import type { MatrixDutyPreset } from '@/lib/matrix-target-duty-assign'

export const MATRIX_EVALUATION_CONTEXTS = [
  'genel',
  'okul_yasam',
  'zumre',
  'sinif_ogretmeni',
  'rehberlik_ogretmeni',
  'nobetci_ogretmeni',
  'kulup_ogretmeni',
  'formator',
  'yasam_koordinatoru',
  'bilimsel_etkinlik_koordinatoru',
] as const
export type MatrixEvaluationContext = (typeof MATRIX_EVALUATION_CONTEXTS)[number]

export const DEFAULT_MATRIX_EVALUATION_CONTEXT: MatrixEvaluationContext = 'genel'

export function matrixEvaluationContextLabel(ctx: string | null | undefined): string {
  switch (String(ctx || DEFAULT_MATRIX_EVALUATION_CONTEXT)) {
    case 'okul_yasam':
      return 'Okul Yaşam'
    case 'zumre':
      return 'Zümre Başkanı'
    case 'sinif_ogretmeni':
      return 'Sınıf Öğretmeni'
    case 'rehberlik_ogretmeni':
      return 'Rehberlik Öğretmeni'
    case 'nobetci_ogretmeni':
      return 'Nöbetçi Öğretmen'
    case 'kulup_ogretmeni':
      return 'Kulüp Öğretmeni'
    case 'formator':
      return 'Formatör'
    case 'yasam_koordinatoru':
      return 'Okul İçi Yaşam Koordinatörü'
    case 'bilimsel_etkinlik_koordinatoru':
      return 'Bilimsel Etkinlik Koordinatörü'
    default: {
      const v = String(ctx || '').trim()
      if (!v || v === 'genel') return 'Genel değerlendirme'
      return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    }
  }
}

export function assignmentPairKey(evaluatorId: string, targetId: string, matrixContext: string = DEFAULT_MATRIX_EVALUATION_CONTEXT) {
  return `${evaluatorId}::${targetId}::${matrixContext}`
}

/** Matris yükleme kutularından görev bağlamı */
export function resolveMatrixContextFromImport(opts: {
  applyCategoryScope: boolean
  dutyPreset: MatrixDutyPreset | null
  /** evaluation_duties.code — kurumsal profil */
  dutyCode?: string | null
}): string {
  if (opts.applyCategoryScope) return 'okul_yasam'
  if (opts.dutyCode) return normalizeMatrixContext(opts.dutyCode)
  if (opts.dutyPreset === 'zumre') return 'zumre'
  if (opts.dutyPreset === 'sinif_ogretmeni') return 'sinif_ogretmeni'
  if (opts.dutyPreset === 'rehberlik_ogretmeni') return 'rehberlik_ogretmeni'
  if (opts.dutyPreset === 'nobetci_ogretmeni') return 'nobetci_ogretmeni'
  if (opts.dutyPreset === 'kulup_ogretmeni') return 'kulup_ogretmeni'
  if (opts.dutyPreset === 'formator') return 'formator'
  if (opts.dutyPreset === 'yasam_koordinatoru') return 'yasam_koordinatoru'
  if (opts.dutyPreset === 'bilimsel_etkinlik_koordinatoru') return 'bilimsel_etkinlik_koordinatoru'
  return 'genel'
}

/** Yan görev matrisi bağlamı → görev paketi preset (okul_yasam hariç — kategori kapsamı) */
export const MATRIX_CONTEXT_DUTY_PRESET: Partial<Record<MatrixEvaluationContext, MatrixDutyPreset>> = {
  zumre: 'zumre',
  sinif_ogretmeni: 'sinif_ogretmeni',
  rehberlik_ogretmeni: 'rehberlik_ogretmeni',
  nobetci_ogretmeni: 'nobetci_ogretmeni',
  kulup_ogretmeni: 'kulup_ogretmeni',
  formator: 'formator',
  yasam_koordinatoru: 'yasam_koordinatoru',
  bilimsel_etkinlik_koordinatoru: 'bilimsel_etkinlik_koordinatoru',
}

/** Görev/rol matrisi bağlamı (okul preset veya dönemde tanımlı özel code). */
export function isDutyMatrixContext(ctx: string | null | undefined): boolean {
  const v = String(ctx || DEFAULT_MATRIX_EVALUATION_CONTEXT).trim()
  if (!v || v === 'genel' || v === 'okul_yasam') return false
  if (MATRIX_CONTEXT_DUTY_PRESET[v as MatrixEvaluationContext]) return true
  // Kurumsal profilde evaluation_duties.code (ör. satış_temsilcisi)
  return /^[a-z][a-z0-9_]{1,48}$/i.test(v)
}

export function isKnownSchoolMatrixContext(ctx: string | null | undefined): boolean {
  const v = String(ctx || '').trim()
  return v !== '' && v !== 'genel' && Boolean(MATRIX_CONTEXT_DUTY_PRESET[v as MatrixEvaluationContext])
}

/** Sağ sütunda kategori listesi olan matris (Okul Yaşam) — genel 21 soru değil, yalnızca seçili kategoriler */
export function isCategoryMatrixContext(ctx: string | null | undefined): boolean {
  return normalizeMatrixContext(ctx) === 'okul_yasam'
}

export function normalizeMatrixContext(value: string | null | undefined): string {
  const v = String(value || DEFAULT_MATRIX_EVALUATION_CONTEXT).trim()
  if (
    v === 'okul_yasam' ||
    v === 'zumre' ||
    v === 'sinif_ogretmeni' ||
    v === 'rehberlik_ogretmeni' ||
    v === 'nobetci_ogretmeni' ||
    v === 'kulup_ogretmeni' ||
    v === 'formator' ||
    v === 'yasam_koordinatoru' ||
    v === 'bilimsel_etkinlik_koordinatoru'
  )
    return v
  if (v && v !== 'genel') return v
  return DEFAULT_MATRIX_EVALUATION_CONTEXT
}
