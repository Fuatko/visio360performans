export type AdminResultsReportTab = 'overview' | 'analytics' | 'aux'

export type AdminResultsReportSection = {
  id: string
  tab: AdminResultsReportTab
  schoolOnly?: boolean
  label: { tr: string; en: string; fr: string }
}

const STATIC_SECTIONS: AdminResultsReportSection[] = [
  {
    id: 'summary',
    tab: 'overview',
    label: { tr: 'Özet istatistikler', en: 'Summary stats', fr: 'Statistiques résumé' },
  },
  {
    id: 'leaderboards_core',
    tab: 'overview',
    label: { tr: 'Dönem özeti — genel sıralama', en: 'Period summary — general rankings', fr: 'Synthèse — classement général' },
  },
  {
    id: 'leaderboards_genel_okul_yasam',
    tab: 'overview',
    schoolOnly: true,
    label: {
      tr: 'Dönem özeti — Genel & Okul Yaşam',
      en: 'Period summary — General & School Life',
      fr: 'Synthèse — Général & Vie scolaire',
    },
  },
  {
    id: 'leaderboards_full_ranking',
    tab: 'overview',
    label: { tr: 'Genel değerlendirme — tam sıralama', en: 'General evaluation — full ranking', fr: 'Évaluation générale — classement complet' },
  },
  {
    id: 'leaderboards_full_ranking_genel_okul_yasam',
    tab: 'overview',
    schoolOnly: true,
    label: {
      tr: 'Genel & Okul Yaşam değerlendirme — tam sıralama',
      en: 'General & School Life — full ranking',
      fr: 'Général & Vie scolaire — classement complet',
    },
  },
  {
    id: 'leaderboards_departments',
    tab: 'overview',
    label: { tr: 'Birim sıralaması', en: 'Department rankings', fr: 'Classement départements' },
  },
  {
    id: 'leaderboards_departments_people',
    tab: 'overview',
    label: { tr: 'Birim içi tam sıralama', en: 'In-department full ranking', fr: 'Classement complet par département' },
  },
  {
    id: 'leaderboards_departments_genel_okul_yasam',
    tab: 'overview',
    schoolOnly: true,
    label: {
      tr: 'Birim sıralaması — Genel & Okul Yaşam',
      en: 'Department rankings — General & School Life',
      fr: 'Classement départements — Général & Vie scolaire',
    },
  },
  {
    id: 'leaderboards_departments_people_genel_okul_yasam',
    tab: 'overview',
    schoolOnly: true,
    label: {
      tr: 'Birim içi tam sıralama — Genel & Okul Yaşam',
      en: 'In-department full ranking — General & School Life',
      fr: 'Classement par département — Général & Vie scolaire',
    },
  },
  {
    id: 'period_change',
    tab: 'overview',
    label: { tr: 'Önceki döneme göre değişim', en: 'Period-over-period change', fr: 'Évolution vs période précédente' },
  },
  {
    id: 'category_spotlight',
    tab: 'overview',
    label: { tr: 'Kategori odak', en: 'Category spotlight', fr: 'Focus catégorie' },
  },
  {
    id: 'gaps',
    tab: 'overview',
    label: { tr: 'Öz vs ekip farkları', en: 'Self vs team gaps', fr: 'Écarts auto vs équipe' },
  },
  {
    id: 'heatmap',
    tab: 'overview',
    label: { tr: 'Departman × kategori ısı haritası', en: 'Department × category heatmap', fr: 'Heatmap département × catégorie' },
  },
  {
    id: 'charts',
    tab: 'overview',
    label: { tr: 'Puan dağılımı ve kategori özeti', en: 'Score distribution & categories', fr: 'Distribution & catégories' },
  },
  {
    id: 'duty_cohorts',
    tab: 'overview',
    schoolOnly: true,
    label: { tr: 'Görev paketi kurum sıralaması', en: 'Duty cohort rankings', fr: 'Classement par tâche' },
  },
  {
    id: 'people_table',
    tab: 'overview',
    label: { tr: 'Kişi bazlı sonuç tablosu', en: 'Person results table', fr: 'Tableau par personne' },
  },
  {
    id: 'analytics_weights',
    tab: 'analytics',
    label: { tr: 'Analitik ağırlık yönetimi', en: 'Analytics weights', fr: 'Poids analytiques' },
  },
  {
    id: 'analytics_dept',
    tab: 'analytics',
    label: { tr: 'Birim risk ve performans', en: 'Department risk & performance', fr: 'Risque & performance départements' },
  },
  {
    id: 'analytics_health_risk',
    tab: 'analytics',
    label: { tr: 'Kurum sağlığı ve risk kartı', en: 'Org health & risk scorecard', fr: 'Santé org. & scorecard risque' },
  },
  {
    id: 'analytics_early_warning',
    tab: 'analytics',
    label: { tr: 'Trend ve erken uyarı', en: 'Trend & early warning', fr: 'Tendance & alerte précoce' },
  },
  {
    id: 'analytics_distribution',
    tab: 'analytics',
    label: { tr: 'Performans dağılımı', en: 'Performance distribution', fr: 'Distribution performance' },
  },
  {
    id: 'analytics_managers',
    tab: 'analytics',
    label: { tr: 'Yönetici etkinliği', en: 'Manager effectiveness', fr: 'Efficacité managers' },
  },
  {
    id: 'analytics_evaluators',
    tab: 'analytics',
    label: { tr: 'Değerlendirici kalibrasyonu', en: 'Evaluator calibration', fr: 'Calibration évaluateurs' },
  },
  {
    id: 'participation',
    tab: 'aux',
    label: { tr: 'Katılım raporu', en: 'Participation report', fr: 'Rapport participation' },
  },
  {
    id: 'coverage',
    tab: 'aux',
    label: { tr: 'Kapsama raporu', en: 'Coverage report', fr: 'Rapport couverture' },
  },
  {
    id: 'no_opinion',
    tab: 'aux',
    label: { tr: 'Fikrim yok raporu', en: 'No-opinion report', fr: 'Rapport sans avis' },
  },
  {
    id: 'evaluator_answer_detail',
    tab: 'aux',
    label: {
      tr: 'Değerlendirici cevap detayı',
      en: 'Evaluator answer detail',
      fr: 'Détail des réponses évaluateur',
    },
  },
  {
    id: 'person_question_peer_averages',
    tab: 'aux',
    label: {
      tr: 'Soru bazında değerlendirici ortalaması',
      en: 'Per-question evaluator average',
      fr: 'Moyenne par question (évaluateurs)',
    },
  },
]

export function dutyLeaderboardSectionId(matrixContext: string): string {
  return `leaderboards_duty:${matrixContext}`
}

export function isDutyLeaderboardSectionId(id: string): boolean {
  return id.startsWith('leaderboards_duty:')
}

export function buildAdminResultsReportSections(opts: {
  lang: 'tr' | 'en' | 'fr'
  isSchoolOrg: boolean
  dutyMatrices: Array<{ context: string; label: string }>
  includeParticipation: boolean
  includeCoverage: boolean
  includeNoOpinion: boolean
  includeEvaluatorAnswerDetail?: boolean
  includePersonQuestionPeerAverages?: boolean
}): Array<{ id: string; tab: AdminResultsReportTab; label: string }> {
  const {
    lang,
    isSchoolOrg,
    dutyMatrices,
    includeParticipation,
    includeCoverage,
    includeNoOpinion,
    includeEvaluatorAnswerDetail,
    includePersonQuestionPeerAverages,
  } = opts
  const label = (s: AdminResultsReportSection) => s.label[lang] || s.label.tr

  const out: Array<{ id: string; tab: AdminResultsReportTab; label: string }> = []

  for (const s of STATIC_SECTIONS) {
    if (s.schoolOnly && !isSchoolOrg) continue
    if (s.id === 'participation' && !includeParticipation) continue
    if (s.id === 'coverage' && !includeCoverage) continue
    if (s.id === 'no_opinion' && !includeNoOpinion) continue
    if (s.id === 'evaluator_answer_detail' && !includeEvaluatorAnswerDetail) continue
    if (s.id === 'person_question_peer_averages' && !includePersonQuestionPeerAverages) continue
    out.push({ id: s.id, tab: s.tab, label: label(s) })
  }

  if (isSchoolOrg) {
    for (const d of dutyMatrices) {
      out.push({
        id: dutyLeaderboardSectionId(d.context),
        tab: 'overview',
        label:
          lang === 'en'
            ? `Extra duty — ${d.label}`
            : lang === 'fr'
              ? `Tâche annexe — ${d.label}`
              : `Yan görev — ${d.label}`,
      })
    }
  }

  return out
}

export function tabForReportSection(id: string, sections: Array<{ id: string; tab: AdminResultsReportTab }>): AdminResultsReportTab {
  if (isDutyLeaderboardSectionId(id)) return 'overview'
  return sections.find((s) => s.id === id)?.tab || 'overview'
}
