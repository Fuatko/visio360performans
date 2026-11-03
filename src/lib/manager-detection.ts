/**
 * Yönetici tespiti — kadrodan bağımsız bir nitelik. Kişi kendi kadrosunda
 * kalır; üstüne "yönetici" işareti alır.
 *
 * Kural (ikisinden biri yeterli):
 * - position_level 'manager' veya 'executive' ise, VEYA
 * - en az bir AKTİF kullanıcının manager_id alanı bu kişiyi gösteriyorsa.
 * Kişi kendi kendinin yöneticisi sayılmaz (manager_id === id yoksayılır).
 */

export type ManagerDetectionUser = {
  id: string
  position_level?: string | null
  manager_id?: string | null
  /** Verilirse yalnız 'active' olanlar sayılır; verilmezse aktif kabul edilir. */
  status?: string | null
}

const MANAGER_LEVELS = new Set(['manager', 'executive'])

function isActive(u: ManagerDetectionUser): boolean {
  return u.status == null || String(u.status).trim().toLowerCase() === 'active'
}

export function detectManagerIds(users: ManagerDetectionUser[]): Set<string> {
  const active = users.filter((u) => u && u.id && isActive(u))
  const activeIds = new Set(active.map((u) => String(u.id)))
  const out = new Set<string>()
  for (const u of active) {
    const level = String(u.position_level || '').trim().toLowerCase()
    if (MANAGER_LEVELS.has(level)) out.add(String(u.id))
  }
  for (const u of active) {
    const mid = String(u.manager_id || '').trim()
    if (!mid || mid === String(u.id)) continue
    // Yalnız aktif bir kişiye işaret eden bağ sayılır (pasif yönetici listede yok).
    if (activeIds.has(mid)) out.add(mid)
  }
  return out
}
