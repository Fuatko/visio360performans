/** Sonuçlar sayfası «ekip değerlendiricilerini isim isim göster» tercihi (toplantı/KVKK). */
export const ADMIN_RESULTS_PEER_DETAIL_STORAGE_KEY = 'adminResultsIncludePeerDetail'

export function readAdminResultsPeerDetailPreference(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(ADMIN_RESULTS_PEER_DETAIL_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
