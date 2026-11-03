/**
 * Çalışanın KENDİ sonucunu görme kuralları — tek yer. Hem yeni "Sonucum"
 * (/api/my-result) hem mevcut "Sonuçlarım" (/api/dashboard/results) ve
 * gelişim planı (/api/dashboard/development) bu kuralları kullanır.
 *
 * Dört koşul BİRDEN sağlanmadan çalışan puan görmez:
 *  1) Kurum ayarı organizations.settings.employee_results_visible === true
 *     (ayar yoksa KAPALI sayılır)
 *  2) Dönem yayınlanmış (evaluation_periods.results_released)
 *  3) Kişinin o dönemde hesaplanmış sonucu var
 *  4) Kişiyi değerlendiren (öz hariç) en az MIN_EVALUATORS_FOR_EMPLOYEE_RESULT kişi
 *     — 1-2 değerlendiricide ortalama, değerlendiricinin puanını ifşa eder.
 */

export const MIN_EVALUATORS_FOR_EMPLOYEE_RESULT = 3

export const EMPLOYEE_RESULTS_SETTING_KEY = 'employee_results_visible'

export type EmployeeResultBlockReason = 'org_disabled' | 'not_released' | 'no_result' | 'too_few_evaluators'

/** Yalnız açıkça `true` ise açık; eksik/bozuk ayar KAPALI sayılır. */
export function isEmployeeResultsVisibleSetting(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false
  return (settings as Record<string, unknown>)[EMPLOYEE_RESULTS_SETTING_KEY] === true
}

export function evaluateEmployeeResultVisibility(input: {
  orgVisible: boolean
  released: boolean
  hasResult: boolean
  evaluatorCount: number
}): { visible: boolean; reason: EmployeeResultBlockReason | null } {
  if (!input.orgVisible) return { visible: false, reason: 'org_disabled' }
  if (!input.released) return { visible: false, reason: 'not_released' }
  if (!input.hasResult) return { visible: false, reason: 'no_result' }
  if (!(input.evaluatorCount >= MIN_EVALUATORS_FOR_EMPLOYEE_RESULT)) return { visible: false, reason: 'too_few_evaluators' }
  return { visible: true, reason: null }
}
