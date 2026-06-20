import { normalizeMatrixContext } from '@/lib/matrix-evaluation-context'

/** Onur ERMAN — kendi ekibine tam genel (21 soru) değerlendirme; okul_yasam'a çevrilmez */
export const ONUR_EKIP_GENEL_TARGET_NAMES = new Set([
  'Oğuzhan ÇETİN',
  'Gülen ERMAN',
  'Ayşegül KAZMAZ',
  'Baran YILDIZ',
])

export function isOkulYasamCoordinatorTitle(title: string | null | undefined): boolean {
  const t = String(title || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  return t.includes('okul') && t.includes('yasam') && t.includes('koordinat')
}

/**
 * Genel + okul yaşam birleşik raporda kullanılacak dilim.
 * Okul yaşam koordinatörlerinin genel atamaları okul_yasam sayılır (Onur→ekip istisnası hariç).
 */
export function effectiveCoreGeneralMatrixContext(
  matrixContext: string | null | undefined,
  opts: {
    evaluatorTitle?: string | null
    evaluatorName?: string | null
    targetName?: string | null
  }
): string {
  const ctx = normalizeMatrixContext(matrixContext)
  if (ctx !== 'genel') return ctx
  if (!isOkulYasamCoordinatorTitle(opts.evaluatorTitle)) return ctx

  const evName = String(opts.evaluatorName || '').trim()
  const tgName = String(opts.targetName || '').trim()
  if (evName.includes('Onur') && ONUR_EKIP_GENEL_TARGET_NAMES.has(tgName)) {
    return ctx
  }

  return 'okul_yasam'
}
