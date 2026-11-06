/**
 * /api/dashboard/results — dönem nesnesinin istemciye giden biçimi.
 * Route dosyası yardımcı export edemediği için burada; test: scripts/check-dashboard-results-payload.ts
 */
import { evaluateEmployeeResultVisibility } from '@/lib/employee-result-visibility'

type PeriodResult = any // keep payload flexible; UI already validates with rendering safeguards

/** Ekip değerlendirmesi bitti mi — sayı göndermeden tek mantıksal alan. */
export function peerCompleteFrom(p: PeriodResult): boolean {
  const expected = Number(p?.peerExpectedCount ?? 0)
  const completed = Number(p?.peerCompletedCount ?? 0)
  return expected > 0 && completed >= expected
}

// SİLME LİSTESİ: sayı benzeri (değerlendirici sayısı vb.) yeni bir alan eklenirse buraya da eklenmeli — n açığı tam bu yüzden oluştu.
export function omitTrimFromPeriodResult(p: PeriodResult): PeriodResult {
  if (!p || typeof p !== 'object') return p
  const cleaned = { ...p }
  delete cleaned.peerAvgTrimmed
  delete cleaned.overallAvgTrimmed
  delete cleaned.score100Trimmed
  delete cleaned.peerAvgTrimmedDuty
  delete cleaned.overallAvgTrimmedDuty
  delete cleaned.score100TrimmedDuty
  delete cleaned.peerContributorsInAverage
  delete cleaned.peerExpectedCount
  delete cleaned.peerCompletedCount
  if (Array.isArray(cleaned.categoryCompare)) {
    cleaned.categoryCompare = cleaned.categoryCompare.map((c: any) => {
      const { peerTrimmed: _peerTrimmed, ...rest } = c || {}
      return rest
    })
  }
  // Ekip özet satırının adı sunucuda "(anonim, N kişi)" içerir; ekran kendi etiketini kullanır.
  if (Array.isArray(cleaned.evaluations)) {
    cleaned.evaluations = cleaned.evaluations.map((e: any) => {
      if (!e || e.isSelf) return e
      const { evaluatorName: _evaluatorName, ...rest } = e
      return rest
    })
  }
  if (Array.isArray(cleaned.categoryCompareDuty)) {
    cleaned.categoryCompareDuty = cleaned.categoryCompareDuty.map((c: any) => {
      const { peerTrimmed: _peerTrimmed, ...rest } = c || {}
      return rest
    })
  }
  return cleaned
}

/** Yönetim dalı: sayılar dahil olduğu gibi (+ ekranın kullandığı peerComplete). */
export function buildAdminPeriodResult(p: PeriodResult): PeriodResult {
  return { ...p, resultsReleased: p.resultsReleased ?? true, peerComplete: peerCompleteFrom(p) }
}

/** Çalışan dalı: kurum ayarı + yayın + ≥3 değerlendirici kapısı; değerlendirici sayıları gönderilmez. */
export function buildEmployeePeriodResult(p: PeriodResult, orgVisible: boolean): PeriodResult {
  const gate = evaluateEmployeeResultVisibility({
    orgVisible,
    released: Boolean(p.resultsReleased),
    hasResult: true,
    evaluatorCount: Number(p.peerContributorsInAverage || 0),
  })
  const peerComplete = peerCompleteFrom(p)
  if (!gate.visible) {
    // Puan YOK: yalnız dönem ve durum. resultsReleased=false → ekran içerik çizmez;
    // blockedReason hangi sebeple gösterilmediğini söyler.
    return {
      periodId: p.periodId,
      periodName: p.periodName,
      resultsReleased: false,
      blockedReason: gate.reason,
      peerComplete,
    }
  }
  return omitTrimFromPeriodResult({ ...p, resultsReleased: true, peerComplete })
}
