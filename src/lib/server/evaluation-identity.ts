/** users.id / target_id / evaluator_id için map anahtarı (UUID tireli/tiresiz aynı kabul) */
export function canonicalUserId(id: unknown): string {
  const s = String(id ?? '').trim()
  if (!s || s === 'null' || s === 'undefined') return ''
  const noDash = s.replace(/-/g, '').toLowerCase()
  if (/^[0-9a-f]{32}$/i.test(noDash)) return noDash
  return s.toLowerCase()
}

/** assignment_id eşlemesi için (yanıtlar / standart skorları ile aynı atamayı bulmak) */
export function canonicalAssignmentId(id: unknown): string {
  const s = String(id ?? '').trim()
  if (!s || s === 'null' || s === 'undefined') return ''
  return s.replace(/-/g, '').toLowerCase()
}

/**
 * Değerlendirme atamasında öz mü (evaluator === target) güvenilir tespit.
 * Bazı ortamlarda UUID tireli/tiresiz veya büyük/küçük harf farkı isSelf'i false yapıp öz skorunu düşürebiliyor.
 */
export function userIdsEqualForSelfEval(a: unknown, b: unknown): boolean {
  const sa = String(a ?? '').trim()
  const sb = String(b ?? '').trim()
  if (!sa || !sb) return false
  if (sa === sb) return true
  if (sa.toLowerCase() === sb.toLowerCase()) return true
  const na = sa.replace(/-/g, '').toLowerCase()
  const nb = sb.replace(/-/g, '').toLowerCase()
  if (na.length >= 32 && nb.length >= 32 && na === nb) return true
  return false
}
