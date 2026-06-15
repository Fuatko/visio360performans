/** Birim sıralaması kohortları — kişi sayısına göre adil karşılaştırma */
export type DepartmentSizeTier = 'small' | 'medium' | 'large'

export const DEPT_SIZE_SMALL_MAX = 3
export const DEPT_SIZE_MEDIUM_MAX = 8
export const DEPT_SIZE_LARGE_MIN = DEPT_SIZE_MEDIUM_MAX + 1

/** Büyükten küçüğe gösterim sırası (daha güvenilir kohortlar önce) */
export const DEPT_SIZE_TIER_DISPLAY_ORDER: DepartmentSizeTier[] = ['large', 'medium', 'small']

export function departmentSizeTier(peopleCount: number): DepartmentSizeTier {
  const n = Math.max(0, Math.floor(Number(peopleCount) || 0))
  if (n <= DEPT_SIZE_SMALL_MAX) return 'small'
  if (n <= DEPT_SIZE_MEDIUM_MAX) return 'medium'
  return 'large'
}

export function departmentSizeTierLabel(tier: DepartmentSizeTier, lang: 'tr' | 'en' | 'fr'): string {
  if (lang === 'en') {
    if (tier === 'small') return 'Small departments (1–3 people)'
    if (tier === 'medium') return 'Medium departments (4–8 people)'
    return 'Large departments (9+ people)'
  }
  if (lang === 'fr') {
    if (tier === 'small') return 'Petits départements (1–3 personnes)'
    if (tier === 'medium') return 'Départements moyens (4–8 personnes)'
    return 'Grands départements (9+ personnes)'
  }
  if (tier === 'small') return 'Küçük birimler (1–3 kişi)'
  if (tier === 'medium') return 'Orta birimler (4–8 kişi)'
  return 'Geniş birimler (9+ kişi)'
}

export function departmentSizeTierRangeLabel(tier: DepartmentSizeTier, lang: 'tr' | 'en' | 'fr'): string {
  if (lang === 'en') {
    if (tier === 'small') return '1–3'
    if (tier === 'medium') return '4–8'
    return '9+'
  }
  if (lang === 'fr') {
    if (tier === 'small') return '1–3'
    if (tier === 'medium') return '4–8'
    return '9+'
  }
  if (tier === 'small') return '1–3'
  if (tier === 'medium') return '4–8'
  return '9+'
}
