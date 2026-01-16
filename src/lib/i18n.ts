export type Lang = 'tr' | 'en' | 'fr'

type Dict = Record<string, Record<Lang, string>>

export const dict: Dict = {
  evaluationsTitle: { tr: 'Değerlendirmelerim', en: 'My Evaluations', fr: 'Mes évaluations' },
  evaluationsSubtitle: { tr: 'Yapmanız gereken değerlendirmeler', en: 'Evaluations you need to complete', fr: 'Évaluations à réaliser' },
  total: { tr: 'Toplam', en: 'Total', fr: 'Total' },
  pending: { tr: 'Bekleyen', en: 'Pending', fr: 'En attente' },
  completed: { tr: 'Tamamlanan', en: 'Completed', fr: 'Terminées' },
  allEvaluations: { tr: 'Tüm Değerlendirmeler', en: 'All Evaluations', fr: 'Toutes les évaluations' },
  pendingEvaluations: { tr: 'Bekleyen Değerlendirmeler', en: 'Pending Evaluations', fr: 'Évaluations en attente' },
  completedEvaluations: { tr: 'Tamamlanan Değerlendirmeler', en: 'Completed Evaluations', fr: 'Évaluations terminées' },
  evaluationsCount: { tr: 'değerlendirme', en: 'evaluations', fr: 'évaluations' },
  noEvaluationsYet: { tr: 'Henüz değerlendirme yok', en: 'No evaluations yet', fr: 'Aucune évaluation pour le moment' },
  congratsAllDone: { tr: 'Tebrikler! Tüm değerlendirmeleriniz tamamlandı', en: 'Congrats! All your evaluations are completed', fr: 'Félicitations ! Toutes vos évaluations sont terminées' },
  evaluate: { tr: 'Değerlendir', en: 'Evaluate', fr: 'Évaluer' },
  periodClosed: { tr: 'Dönem Kapalı', en: 'Period Closed', fr: 'Période fermée' },
  waiting: { tr: 'Bekliyor', en: 'Waiting', fr: 'En attente' },
  done: { tr: 'Tamamlandı', en: 'Completed', fr: 'Terminé' },
  selfEvaluation: { tr: 'Öz Değerlendirme', en: 'Self-Evaluation', fr: 'Auto-évaluation' },
  peerEvaluation: { tr: 'Peer Değerlendirme', en: 'Peer Evaluation', fr: 'Évaluation par les pairs' },
  evaluatedPerson: { tr: 'Değerlendirilen Kişi', en: 'Evaluated Person', fr: 'Personne évaluée' },
  goBack: { tr: 'Geri Dön', en: 'Go Back', fr: 'Retour' },
  notFoundOrNoQuestions: { tr: 'Değerlendirme bulunamadı veya soru yok', en: 'Evaluation not found or no questions', fr: 'Évaluation introuvable ou aucune question' },
  progress: { tr: 'İlerleme', en: 'Progress', fr: 'Progression' },
  completedLower: { tr: 'tamamlandı', en: 'completed', fr: 'terminé' },
  previous: { tr: 'Önceki', en: 'Previous', fr: 'Précédent' },
  next: { tr: 'Sonraki', en: 'Next', fr: 'Suivant' },
  submit: { tr: 'Gönder', en: 'Submit', fr: 'Soumettre' },
  continue: { tr: 'Devam Et', en: 'Continue', fr: 'Continuer' },
  question: { tr: 'Soru', en: 'Question', fr: 'Question' },
  selected: { tr: 'Seçildi', en: 'Selected', fr: 'Sélectionné' },
  quickNav: { tr: 'Hızlı Geçiş', en: 'Quick Navigation', fr: 'Navigation rapide' },
  mandatoryStep: { tr: 'Zorunlu Adım', en: 'Mandatory Step', fr: 'Étape obligatoire' },
  internationalStandards: { tr: 'Uluslararası Standartlar', en: 'International Standards', fr: 'Normes internationales' },
  standardsHelp: { tr: 'Lütfen her standart için 1–5 puan verin ve gerekiyorsa gerekçe ekleyin.', en: 'Please rate each standard 1–5 and add justification if needed.', fr: 'Veuillez noter chaque norme de 1 à 5 et ajouter une justification si nécessaire.' },
  optionalRationale: { tr: 'Gerekçe (opsiyonel)', en: 'Justification (optional)', fr: 'Justification (optionnel)' },
  languageLabelShort: { tr: 'Dil', en: 'Language', fr: 'Langue' },
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

