export type Lang = 'tr' | 'en' | 'fr'

type Dict = Record<string, Record<Lang, string>>

export const dict: Dict = {
  dashboard: { tr: 'Dashboard', en: 'Dashboard', fr: 'Tableau de bord' },
  myEvaluations: { tr: 'Değerlendirmelerim', en: 'My Evaluations', fr: 'Mes évaluations' },
  myResults: { tr: 'Sonuçlarım', en: 'My Results', fr: 'Mes résultats' },
  myDevelopment: { tr: 'Gelişim Planım', en: 'Development Plan', fr: 'Plan de développement' },
  performanceSystem: { tr: 'Performans Değerlendirme', en: 'Performance Evaluation', fr: 'Évaluation de la performance' },
  language: { tr: 'Dil', en: 'Language', fr: 'Langue' },
  tr: { tr: 'Türkçe', en: 'Turkish', fr: 'Turc' },
  en: { tr: 'İngilizce', en: 'English', fr: 'Anglais' },
  fr: { tr: 'Fransızca', en: 'French', fr: 'Français' },
}

export function t(key: keyof typeof dict, lang: Lang): string {
  return dict[key]?.[lang] || dict[key]?.tr || String(key)
}

export function pickLangText(
  lang: Lang,
  baseTr: string | null | undefined,
  en?: string | null,
  fr?: string | null
): string {
  if (lang === 'en') return (en || baseTr || '').toString()
  if (lang === 'fr') return (fr || baseTr || '').toString()
  return (baseTr || '').toString()
}

