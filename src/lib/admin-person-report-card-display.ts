import { coreGeneralReportSectionLabel } from '@/lib/admin-person-results-sections'

export const MERGED_GENEL_SLICE_CONTEXT = 'genel_merged'
export const GENEL_ONLY_SLICE_CONTEXT = 'genel_only'

export type PersonReportSliceLike = {
  matrixContext: string
  matrixLabel?: string
  isDutyMatrix?: boolean
  peerAvg?: number
  peerAvgTrimmed?: number
  overallAvgTrimmed?: number
  peerTrimEligible?: boolean
}

export function personReportSliceKind(
  slice: PersonReportSliceLike
): 'duty' | 'merged' | 'genel_only' | 'other' {
  if (slice.isDutyMatrix) return 'duty'
  const ctx = String(slice.matrixContext || '')
  if (ctx === MERGED_GENEL_SLICE_CONTEXT) return 'merged'
  if (ctx === GENEL_ONLY_SLICE_CONTEXT) return 'genel_only'
  if (ctx === 'genel') return 'merged'
  return 'other'
}

export function personReportSliceSubtitle(slice: PersonReportSliceLike, lang: 'tr' | 'en' | 'fr' = 'tr'): string {
  const kind = personReportSliceKind(slice)
  if (kind === 'duty') {
    return lang === 'en' ? 'Extra duty' : lang === 'fr' ? 'Tâche annexe' : 'Yan görev'
  }
  if (kind === 'merged') {
    return coreGeneralReportSectionLabel(lang)
  }
  if (kind === 'genel_only') {
    return lang === 'en' ? 'General evaluation only' : lang === 'fr' ? 'Évaluation générale seule' : 'Yalnızca genel değerlendirme'
  }
  return lang === 'en' ? 'Evaluation slice' : lang === 'fr' ? 'Tranche' : 'Değerlendirme dilimi'
}

/** Üst büyük skor: trim varsa trim ort., yoksa ekip ort. — kutu içindeki Ekip ile tutarlı etiket. */
export function personReportSliceHeadline(slice: PersonReportSliceLike): {
  value: number | null
  label: string
} {
  const trimEligible = slice.peerTrimEligible === true
  const trimmed = Number(slice.overallAvgTrimmed || 0)
  const peer = Number(slice.peerAvg || 0)

  if (trimEligible && trimmed > 0) {
    return { value: trimmed, label: 'trim ort.' }
  }
  if (peer > 0) {
    return { value: peer, label: 'ekip ort.' }
  }
  return { value: null, label: 'ekip ort.' }
}

export function personReportSliceHeadlineLabel(label: string, lang: 'tr' | 'en' | 'fr' = 'tr'): string {
  if (label === 'trim ort.') {
    return lang === 'en' ? 'trim avg.' : lang === 'fr' ? 'moy. trim.' : 'trim ort.'
  }
  return lang === 'en' ? 'team avg.' : lang === 'fr' ? 'moy. équipe' : 'ekip ort.'
}

export function personReportSliceTrimDisplay(
  slice: PersonReportSliceLike & { overallAvgTrimmed?: number; peerAvgTrimmed?: number }
): { eligible: boolean; value: number } {
  const trimmed = Number(slice.overallAvgTrimmed ?? slice.peerAvgTrimmed ?? 0)
  const eligible = slice.peerTrimEligible === true && trimmed > 0
  return { eligible, value: trimmed }
}
