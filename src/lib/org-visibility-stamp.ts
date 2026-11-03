/**
 * Kurum sonuç görünürlüğü anahtarına "kim, ne zaman değiştirdi" damgası.
 * Saf fonksiyon (DB yok) — /api/admin/organizations birleştirmeden ÖNCE
 * settings yamasını buradan geçirir.
 */

export const VISIBILITY_STAMP_KEYS = [
  'employee_results_visible_changed_at',
  'employee_results_visible_changed_by',
  'employee_results_visible_changed_by_name',
] as const

const VISIBILITY_KEY = 'employee_results_visible'

/**
 * İstemciden gelen settings yamasını temizler ve gerekiyorsa damga ekler.
 * - Damga anahtarları istemciden geldiyse HER ZAMAN atılır.
 * - Damga YALNIZ yamada `employee_results_visible` varsa eklenir (açma da kapama da).
 * - Girdi nesnesi değiştirilmez.
 */
export function applyVisibilityStamp(
  patch: Record<string, unknown>,
  actor: { uid: string; name?: string | null },
  now: Date
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch }
  for (const k of VISIBILITY_STAMP_KEYS) delete out[k]
  if (!Object.prototype.hasOwnProperty.call(patch, VISIBILITY_KEY)) return out
  out.employee_results_visible_changed_at = now.toISOString()
  out.employee_results_visible_changed_by = actor.uid
  const name = typeof actor.name === 'string' ? actor.name.trim() : ''
  if (name) out.employee_results_visible_changed_by_name = name
  return out
}
