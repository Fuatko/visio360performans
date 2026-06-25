import type { AssessmentReportScope } from '@/lib/admin-results-report-scope'
import { reportSectionMatchesAssessmentKind } from '@/lib/admin-results-report-scope'
import {
  defaultReportCatalogConfig,
  resolveReportCatalogEntry,
  type ReportCatalogConfig,
  type ReportCatalogGroup,
} from '@/lib/admin-results-report-catalog-config'

export type AdminResultsReportTab = 'overview' | 'analytics' | 'aux'

export type AdminResultsReportGroup = 'summary' | ReportCatalogGroup

export type AdminResultsReportSection = {
  id: string
  tab: AdminResultsReportTab
  schoolOnly?: boolean
  superAdminOnly?: boolean
  /** Tanımlıysa yalnızca bu dönem türünde menüde görünür */
  assessmentKindScope?: AssessmentReportScope
  label: { tr: string; en: string; fr: string }
}

export const ADMIN_RESULTS_STATIC_SECTIONS: AdminResultsReportSection[] = [
  {
    id: 'matrix_structure_period_summary',
    tab: 'overview',
    schoolOnly: true,
    assessmentKindScope: 'job_evaluation',
    label: {
      tr: 'Dönem özeti — MATRIX yapı (İş Değerlendirmesi)',
      en: 'Period summary — Matrix structure (Job evaluation)',
      fr: 'Synthèse période — Structure matricielle (Éval. professionnelle)',
    },
  },
  {
    id: 'matrix_structure_question_scores',
    tab: 'overview',
    schoolOnly: true,
    assessmentKindScope: 'job_evaluation',
    label: {
      tr: 'MATRIX yapı — soru bazlı ekip puanı (İş Değerlendirmesi)',
      en: 'Matrix structure — question team score (Job evaluation)',
      fr: 'Structure matricielle — score équipe par question (Éval. pro.)',
    },
  },
  {
    id: 'summary',
    tab: 'overview',
    label: { tr: 'Özet istatistikler', en: 'Summary stats', fr: 'Statistiques résumé' },
  },
  {
    id: 'leaderboards_core',
    tab: 'overview',
    assessmentKindScope: 'development_360',
    label: {
      tr: 'Kişi öne çıkanlar — Kişisel Gelişim (öz / ekip / trim)',
      en: 'People highlights — Personal development (self / team / trim)',
      fr: 'Temps forts — Développement personnel (auto / équipe / trim)',
    },
  },
  {
    id: 'leaderboards_full_ranking',
    tab: 'overview',
    assessmentKindScope: 'development_360',
    label: {
      tr: 'Tam sıralama — Kişisel Gelişim (öz / ekip / trim)',
      en: 'Full ranking — Personal development (self / team / trim)',
      fr: 'Classement complet — Développement personnel (auto / équipe / trim)',
    },
  },
  {
    id: 'leaderboards_full_ranking_genel_okul_yasam',
    tab: 'overview',
    schoolOnly: true,
    assessmentKindScope: 'job_evaluation',
    label: {
      tr: 'Tam sıralama — MATRIX yapı (İş Değerlendirmesi)',
      en: 'Full ranking — Matrix structure (Job evaluation)',
      fr: 'Classement complet — Structure MATRIX (Éval. professionnelle)',
    },
  },
  {
    id: 'leaderboards_departments',
    tab: 'overview',
    schoolOnly: true,
    assessmentKindScope: 'job_evaluation',
    label: {
      tr: 'Birim sıralaması — MATRIX yapı (İş Değerlendirmesi)',
      en: 'Department rankings — Matrix structure (Job evaluation)',
      fr: 'Classement départements — Structure MATRIX (Éval. pro.)',
    },
  },
  {
    id: 'leaderboards_departments_people',
    tab: 'overview',
    schoolOnly: true,
    assessmentKindScope: 'job_evaluation',
    label: {
      tr: 'Birim içi tam sıralama — MATRIX yapı (İş Değerlendirmesi)',
      en: 'In-department ranking — Matrix structure (Job evaluation)',
      fr: 'Classement interne département — Structure MATRIX (Éval. pro.)',
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
      tr: 'Kategori odak',
      en: 'Category spotlight',
      fr: 'Focus catégorie',
    },
  },
  {
    id: 'gaps',
    tab: 'overview',
    label: {
      tr: 'Öz vs ekip farkları',
      en: 'Self vs team gaps',
      fr: 'Écarts auto vs équipe',
    },
  },
  {
    id: 'heatmap',
    tab: 'overview',
    label: {
      tr: 'Departman × kategori ısı haritası',
      en: 'Department × category heatmap',
      fr: 'Heatmap département × catégorie',
    },
  },
  {
    id: 'charts',
    tab: 'overview',
    label: {
      tr: 'Puan dağılımı ve kategori özeti',
      en: 'Score distribution & categories',
      fr: 'Distribution & catégories',
    },
  },
  {
    id: 'duty_matrices_matrix',
    tab: 'overview',
    schoolOnly: true,
    assessmentKindScope: 'job_evaluation',
    label: {
      tr: 'Yan görevler — MATRIX yapı (İş Değerlendirmesi)',
      en: 'Extra duties — Matrix structure (Job evaluation)',
      fr: 'Tâches annexes — Structure MATRIX (Éval. professionnelle)',
    },
  },
  {
    id: 'people_table',
    tab: 'overview',
    assessmentKindScope: 'development_360',
    label: {
      tr: 'Kişi bazlı sonuç tablosu — Kişisel Gelişim (öz / ekip / trim)',
      en: 'Person results — Personal development (self / team / trim)',
      fr: 'Résultats par personne — Développement personnel (auto / équipe / trim)',
    },
  },
  {
    id: 'people_table_matrix',
    tab: 'overview',
    schoolOnly: true,
    assessmentKindScope: 'job_evaluation',
    label: {
      tr: 'Kişi bazlı sonuç tablosu — MATRIX yapı (İş Değerlendirmesi)',
      en: 'Person results — Matrix structure (Job evaluation)',
      fr: 'Résultats par personne — Structure MATRIX (Éval. professionnelle)',
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
      tr: 'Birim risk ve performans',
      en: 'Department risk & performance',
      fr: 'Risque & performance départements',
    },
  },
  {
    id: 'analytics_health_risk',
    tab: 'analytics',
    label: {
      tr: 'Kurum sağlığı ve risk kartı',
      en: 'Org health & risk scorecard',
      fr: 'Santé org. & scorecard risque',
    },
  },
  {
    id: 'analytics_early_warning',
    tab: 'analytics',
    label: {
      tr: 'Trend ve erken uyarı',
      en: 'Trend & early warning',
      fr: 'Tendance & alerte précoce',
    },
  },
  {
    id: 'analytics_distribution',
    tab: 'analytics',
    label: {
      tr: 'Performans dağılımı',
      en: 'Performance distribution',
      fr: 'Distribution performance',
    },
  },
  {
    id: 'analytics_managers',
    tab: 'analytics',
    label: {
      tr: 'Yönetici etkinliği',
      en: 'Manager effectiveness',
      fr: 'Efficacité managers',
    },
  },
  {
    id: 'analytics_evaluators',
    tab: 'analytics',
    label: {
      tr: 'Değerlendirici kalibrasyonu',
      en: 'Evaluator calibration',
      fr: 'Calibration évaluateurs',
    },
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
  isSuperAdmin?: boolean
  selectedAssessmentKind?: string | null
  orgVisibleReportIds?: string[] | null
  catalogConfig?: ReportCatalogConfig | null
  dutyMatrices: Array<{ context: string; label: string }>
  includeParticipation: boolean
  includeCoverage: boolean
  includeNoOpinion: boolean
  includeEvaluatorAnswerDetail?: boolean
  includePersonQuestionPeerAverages?: boolean
}): Array<{
  id: string
  tab: AdminResultsReportTab
  label: string
  description: string
  group: AdminResultsReportGroup
  sortOrder: number
}> {
  const {
    lang,
    isSchoolOrg,
    isSuperAdmin = false,
    selectedAssessmentKind = null,
    orgVisibleReportIds,
    catalogConfig,
    dutyMatrices: _dutyMatrices,
    includeParticipation,
    includeCoverage,
    includeNoOpinion,
    includeEvaluatorAnswerDetail,
    includePersonQuestionPeerAverages,
  } = opts
  const config = catalogConfig ?? defaultReportCatalogConfig()

  const orgVisibleSet = !isSuperAdmin
    ? new Set(
        orgVisibleReportIds?.length
          ? orgVisibleReportIds
          : ADMIN_RESULTS_STATIC_SECTIONS.filter((s) => !s.superAdminOnly).map((s) => s.id)
      )
    : null

  const out: Array<{
    id: string
    tab: AdminResultsReportTab
    label: string
    description: string
    group: AdminResultsReportGroup
    sortOrder: number
  }> = []

  for (const s of ADMIN_RESULTS_STATIC_SECTIONS) {
    if (s.schoolOnly && !isSchoolOrg) continue
    if (s.superAdminOnly && !isSuperAdmin) continue
    if (!reportSectionMatchesAssessmentKind(s.assessmentKindScope, selectedAssessmentKind)) continue
    if (orgVisibleSet && !orgVisibleSet.has(s.id)) continue
    if (s.id === 'participation' && !includeParticipation) continue
    if (s.id === 'coverage' && !includeCoverage) continue
    if (s.id === 'no_opinion' && !includeNoOpinion) continue
    if (s.id === 'evaluator_answer_detail' && !includeEvaluatorAnswerDetail) continue
    if (s.id === 'person_question_peer_averages' && !includePersonQuestionPeerAverages) continue

    const resolved = resolveReportCatalogEntry(s, config)
    out.push({
      id: s.id,
      tab: s.tab,
      label: resolved.label[lang] || resolved.label.tr,
      description: resolved.description[lang] || resolved.description.tr,
      group: resolved.group,
      sortOrder: resolved.sortOrder,
    })
  }

  const groupRank = (g: AdminResultsReportGroup) => (g === 'summary' ? 0 : g === 'management' ? 1 : 2)
  out.sort((a, b) => {
    const gr = groupRank(a.group) - groupRank(b.group)
    if (gr !== 0) return gr
    return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, lang)
  })

  return out
}

export function tabForReportSection(id: string, sections: Array<{ id: string; tab: AdminResultsReportTab }>): AdminResultsReportTab {
  if (isDutyLeaderboardSectionId(id)) return 'overview'
  return sections.find((s) => s.id === id)?.tab || 'overview'
}
