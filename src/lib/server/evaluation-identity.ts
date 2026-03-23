/** assignment_id eşlemesi için (yanıtlar / standart skorları ile aynı atamayı bulmak) */
export function canonicalAssignmentId(id: unknown): string {
  return String(id ?? '')
    .trim()
    .replace(/-/g, '')
    .toLowerCase()
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
