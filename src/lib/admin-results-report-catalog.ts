export type AdminResultsReportTab = 'overview' | 'analytics' | 'aux'

export type AdminResultsReportSection = {
  id: string
  tab: AdminResultsReportTab
  schoolOnly?: boolean
  label: { tr: string; en: string; fr: string }
}

const STATIC_SECTIONS: AdminResultsReportSection[] = [
  {
    id: 'matrix_structure_period_summary',
    tab: 'overview',
    schoolOnly: true,
    label: {
      tr: 'Dönem özeti — MATRIX yapı',
      en: 'Period summary — Matrix structure',
      fr: 'Synthèse période — Structure matricielle',
    },
  },
  {
    id: 'matrix_structure_question_scores',
    tab: 'overview',
    schoolOnly: true,
    label: {
      tr: 'MATRIX yapı — soru bazlı ekip puanı',
      en: 'Matrix structure — question-based team score',
      fr: 'Structure matricielle — score équipe par question',
    },
  },
  {
    id: 'summary',
    tab: 'overview',
    label: { tr: 'Özet istatistikler', en: 'Summary stats', fr: 'Statistiques résumé' },
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
    id: 'leaderboards_full_ranking_genel_okul_yasam',
    tab: 'overview',
    schoolOnly: true,
    label: {
      tr: 'Matrix Değerlendirme - Tam Sıralama',
      en: 'Matrix evaluation — full ranking',
      fr: 'Évaluation MATRIX — classement complet',
    },
  },
  {
    id: 'leaderboards_departments',
    tab: 'overview',
    schoolOnly: true,
    label: {
      tr: 'Birim sıralaması — MATRIX yapı',
      en: 'Department rankings — Matrix structure',
      fr: 'Classement départements — Structure matricielle',
    },
  },
  {
    id: 'leaderboards_departments_people',
    tab: 'overview',
    schoolOnly: true,
    label: {
      tr: 'Birim İçi Tam Sıralama-Matrix Yapı',
      en: 'In-department full ranking — Matrix structure',
      fr: 'Classement complet par département — Structure matricielle',
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
    label: {
      tr: 'Kategori odak — MATRIX yapı',
      en: 'Category spotlight — Matrix structure',
      fr: 'Focus catégorie — Structure MATRIX',
    },
  },
  {
    id: 'gaps',
    tab: 'overview',
    label: {
      tr: 'Öz vs ekip farkları — MATRIX yapı',
      en: 'Self vs team gaps — Matrix structure',
      fr: 'Écarts auto vs équipe — MATRIX',
    },
  },
  {
    id: 'heatmap',
    tab: 'overview',
    label: {
      tr: 'Departman × kategori ısı haritası — MATRIX yapı',
      en: 'Department × category heatmap — Matrix structure',
      fr: 'Heatmap département × catégorie — MATRIX',
    },
  },
  {
    id: 'charts',
    tab: 'overview',
    label: {
      tr: 'Puan dağılımı ve kategori özeti — MATRIX yapı',
      en: 'Score distribution & categories — Matrix structure',
      fr: 'Distribution & catégories — MATRIX',
    },
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
    id: 'people_table_matrix',
    tab: 'overview',
    schoolOnly: true,
    label: {
      tr: 'Kişi bazlı sonuç tablosu — MATRIX yapı',
      en: 'Person results table — Matrix structure',
      fr: 'Tableau par personne — Structure matricielle',
    },
  },
  {
    id: 'analytics_weights',
    tab: 'analytics',
    label: { tr: 'Analitik ağırlık yönetimi', en: 'Analytics weights', fr: 'Poids analytiques' },
  },
  {
    id: 'analytics_dept',
    tab: 'analytics',
    label: {
      tr: 'Birim risk ve performans — MATRIX yapı',
      en: 'Department risk & performance — Matrix structure',
      fr: 'Risque & performance départements — Structure matricielle',
    },
  },
  {
    id: 'analytics_health_risk',
    tab: 'analytics',
    label: {
      tr: 'Kurum sağlığı ve risk kartı — MATRIX yapı',
      en: 'Org health & risk scorecard — Matrix structure',
      fr: 'Santé org. & scorecard risque — Structure matricielle',
    },
  },
  {
    id: 'analytics_early_warning',
    tab: 'analytics',
    label: {
      tr: 'Trend ve erken uyarı — MATRIX yapı',
      en: 'Trend & early warning — Matrix structure',
      fr: 'Tendance & alerte précoce — Structure matricielle',
    },
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
