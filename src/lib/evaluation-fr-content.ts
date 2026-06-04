import type { Lang } from '@/lib/i18n'
import { pickEvaluationContentText } from '@/lib/i18n'

/** Kategori başlığı yanlışlıkla soru metni olarak kaydedildiğinde formda tekrar eden FR'yi engelle */
export function normalizeFrKey(v: string | null | undefined): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const KNOWN_CATEGORY_FR_LABELS = new Set(
  [
    'responsabilite professionnelle',
    'aptitude pedagogique',
    'notation et evaluation',
    'communication avec les parents d eleves',
    'relations avec les eleves et empathie',
    'contribution aux projets aux activites et a l institution',
    'communication et cooperation au sein de l etablissement',
    'developpement professionnel',
    'suivi du developpement des eleves',
    'programme d orientation et planification',
    'ponctualite presence sur le poste de travail et surveillance active',
    'plan des activites du club et documents administratifs',
    'entente au sein du zumre et gestion d equipe',
    'identification des besoins en formation',
    'organisation de la semaines des sciences et du concours scientifique',
  ].map(normalizeFrKey)
)

export function isCategoryLikeQuestionFr(
  fr: string | null | undefined,
  categoryFr?: string | null | undefined
): boolean {
  const f = normalizeFrKey(fr)
  if (!f) return true
  const cat = normalizeFrKey(categoryFr || '')
  if (cat && f === cat) return true
  if (KNOWN_CATEGORY_FR_LABELS.has(f)) return true
  return false
}

export function pickLocalizedQuestionText(
  lang: Lang,
  tr: string | null | undefined,
  en: string | null | undefined,
  fr: string | null | undefined,
  categoryFr?: string | null | undefined
): string {
  const trText = String(tr || '').trim()
  const frText = String(fr || '').trim()
  if (lang === 'fr' && frText && !isCategoryLikeQuestionFr(frText, categoryFr)) {
    return pickEvaluationContentText(lang, trText, en, frText)
  }
  if (lang === 'fr') {
    return pickEvaluationContentText(lang, trText, en, '')
  }
  return pickEvaluationContentText(lang, trText, en, frText)
}
