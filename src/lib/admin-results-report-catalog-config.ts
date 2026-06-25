import {
  ADMIN_RESULTS_STATIC_SECTIONS,
  type AdminResultsReportSection,
} from '@/lib/admin-results-report-catalog'
import type { AssessmentReportScope } from '@/lib/admin-results-report-scope'

export type ReportCatalogGroup = 'management' | 'hr'

export type LocalizedText = { tr: string; en: string; fr: string }

export type ReportCatalogSectionOverride = {
  group?: ReportCatalogGroup
  label?: Partial<LocalizedText>
  description?: Partial<LocalizedText>
  sortOrder?: number
}

export type ReportCatalogConfig = {
  sections: Record<string, ReportCatalogSectionOverride>
}

export type ResolvedReportCatalogEntry = {
  id: string
  group: ReportCatalogGroup | 'summary'
  label: LocalizedText
  description: LocalizedText
  sortOrder: number
  assessmentKindScope?: AssessmentReportScope
  schoolOnly?: boolean
}

const DEFAULT_GROUPS: Record<string, ReportCatalogGroup> = {
  matrix_structure_period_summary: 'management',
  matrix_structure_question_scores: 'management',
  leaderboards_core: 'hr',
  leaderboards_full_ranking: 'hr',
  leaderboards_full_ranking_genel_okul_yasam: 'management',
  leaderboards_departments: 'management',
  leaderboards_departments_people: 'management',
  period_change: 'management',
  category_spotlight: 'hr',
  gaps: 'hr',
  heatmap: 'hr',
  charts: 'management',
  duty_matrices_matrix: 'management',
  people_table: 'hr',
  people_table_matrix: 'hr',
  analytics_weights: 'hr',
  analytics_dept: 'management',
  analytics_health_risk: 'management',
  analytics_early_warning: 'management',
  analytics_distribution: 'management',
  analytics_managers: 'management',
  analytics_evaluators: 'hr',
  participation: 'hr',
  coverage: 'hr',
  no_opinion: 'hr',
  evaluator_answer_detail: 'hr',
  person_question_peer_averages: 'hr',
}

const DEFAULT_DESCRIPTIONS: Record<string, LocalizedText> = {
  summary: {
    tr: 'Seçilen dönemin katılım, ortalama skor ve özet göstergeleri.',
    en: 'Participation, average scores and headline indicators for the selected period.',
    fr: 'Participation, scores moyens et indicateurs clés pour la période sélectionnée.',
  },
  matrix_structure_period_summary: {
    tr: 'İş değerlendirmesi döneminin MATRIX yapı özeti: tamamlanan atamalar, puanlı kişi sayısı ve genel ortalamalar.',
    en: 'Job evaluation period Matrix summary: completed assignments, scored people and overall averages.',
    fr: 'Synthèse MATRIX de la période d’évaluation professionnelle.',
  },
  matrix_structure_question_scores: {
    tr: 'Soru bazında ekip ortalamaları; üst yönetim ve kalibrasyon için detaylı MATRIX görünümü.',
    en: 'Question-level team averages for executive calibration in Matrix structure.',
    fr: 'Moyennes équipe par question pour calibration MATRIX.',
  },
  leaderboards_core: {
    tr: 'Kişisel gelişimde en yüksek ve en düşük skorlu kişiler (öz, ekip ve trim sütunları).',
    en: 'Top and bottom people in personal development (self, team and trim columns).',
    fr: 'Personnes les plus hautes/basses en développement personnel (auto, équipe, trim).',
  },
  leaderboards_full_ranking: {
    tr: 'Tüm kişilerin kişisel gelişim sıralaması; öz, ekip ve trim puanlarıyla.',
    en: 'Full personal development ranking with self, team and trim scores.',
    fr: 'Classement complet développement personnel (auto, équipe, trim).',
  },
  leaderboards_full_ranking_genel_okul_yasam: {
    tr: 'İş değerlendirmesinde tüm kurumun MATRIX yapı tam sıralaması.',
    en: 'Full organization Matrix ranking for job evaluation.',
    fr: 'Classement MATRIX complet pour l’évaluation professionnelle.',
  },
  leaderboards_departments: {
    tr: 'Birimlerin iş değerlendirmesi MATRIX performansına göre sıralaması.',
    en: 'Department ranking by Matrix job evaluation performance.',
    fr: 'Classement des départements (évaluation pro. MATRIX).',
  },
  leaderboards_departments_people: {
    tr: 'Her birim içindeki kişilerin MATRIX puanına göre tam sıralaması.',
    en: 'In-department person ranking by Matrix score.',
    fr: 'Classement des personnes par département (score MATRIX).',
  },
  period_change: {
    tr: 'Aynı değerlendirme türünde önceki döneme göre kişi ve birim değişimleri.',
    en: 'Person and department changes vs the previous period of the same evaluation type.',
    fr: 'Évolution personnes et départements vs période précédente (même type).',
  },
  category_spotlight: {
    tr: 'Her yetkinlik alanında en güçlü ve gelişime açık kişiler.',
    en: 'Strongest and weakest people per competency area.',
    fr: 'Personnes les plus fortes/faibles par compétence.',
  },
  gaps: {
    tr: 'Kişinin öz değerlendirmesi ile ekip puanı arasındaki en büyük farklar.',
    en: 'Largest gaps between self-evaluation and team scores.',
    fr: 'Plus grands écarts entre auto-évaluation et score équipe.',
  },
  heatmap: {
    tr: 'Birim × kategori tablosu; hangi birim hangi alanda güçlü/zayıf tek bakışta.',
    en: 'Department × category heatmap for strengths and gaps at a glance.',
    fr: 'Heatmap département × catégorie : forces et faiblesses.',
  },
  charts: {
    tr: 'Kurum genelinde puan dağılımı ve kategori özeti grafikleri.',
    en: 'Organization-wide score distribution and category summary charts.',
    fr: 'Distribution des scores et résumé catégories à l’échelle de l’organisation.',
  },
  duty_matrices_matrix: {
    tr: 'Yan görev formlarına göre MATRIX performans tabloları (iş değerlendirmesi).',
    en: 'Matrix performance tables by extra-duty form (job evaluation).',
    fr: 'Tableaux MATRIX par formulaire de tâche annexe (éval. pro.).',
  },
  people_table: {
    tr: 'Tüm kişilerin kişisel gelişim özet skorları ve detay drill-down.',
    en: 'All people with personal development summary scores and drill-down.',
    fr: 'Toutes les personnes — scores résumé développement personnel.',
  },
  people_table_matrix: {
    tr: 'Tüm kişilerin iş değerlendirmesi MATRIX özet skorları ve detay.',
    en: 'All people with job evaluation Matrix summary scores and detail.',
    fr: 'Toutes les personnes — scores MATRIX évaluation professionnelle.',
  },
  analytics_weights: {
    tr: 'Risk, kurum sağlığı ve erken uyarı skorlarında ağırlık ve eşik ayarları.',
    en: 'Weights and thresholds for risk, health and early-warning scores.',
    fr: 'Poids et seuils pour risque, santé et alertes.',
  },
  analytics_dept: {
    tr: 'En yüksek riskli ve en yüksek performanslı birimlerin karşılaştırmalı özeti.',
    en: 'Comparative summary of highest-risk and highest-performing departments.',
    fr: 'Synthèse comparative des départements à risque / performants.',
  },
  analytics_health_risk: {
    tr: 'Kurum sağlık indeksi ve öncelikli takip gerektiren kişilerin risk kartı.',
    en: 'Organization health index and priority risk scorecard.',
    fr: 'Indice santé organisation et scorecard risque prioritaire.',
  },
  analytics_early_warning: {
    tr: 'Düşük skor, düşüş trendi, kapsama ve öz–ekip farkı uyarıları.',
    en: 'Alerts for low scores, downward trends, coverage and self–team gaps.',
    fr: 'Alertes scores bas, tendance, couverture et écarts auto–équipe.',
  },
  analytics_distribution: {
    tr: 'Skorların kurum genelinde dağılımı ve birim kalibrasyon analizi.',
    en: 'Organization-wide score distribution and department calibration.',
    fr: 'Distribution des scores et calibration par département.',
  },
  analytics_managers: {
    tr: 'Yöneticilerin verdiği ortalama ile ekip tutarlılığı ve kapsam ölçümü.',
    en: 'Manager scoring consistency, coverage and deviation from team averages.',
    fr: 'Cohérence et couverture des managers vs moyennes équipe.',
  },
  analytics_evaluators: {
    tr: 'Değerlendiricilerin bonkör/sert puanlama eğilimi ve yayılım profili.',
    en: 'Evaluator generous/harsh scoring tendency and spread profile.',
    fr: 'Profil de notation généreuse/stricte des évaluateurs.',
  },
  participation: {
    tr: 'Birim bazında tamamlanan ve bekleyen değerlendirme atamaları.',
    en: 'Completed vs pending evaluation assignments by department.',
    fr: 'Affectations terminées / en attente par département.',
  },
  coverage: {
    tr: 'Her kişi için öz, yönetici, ekip ve diğer değerlendirici kapsamı.',
    en: 'Self, manager, peer and other evaluator coverage per person.',
    fr: 'Couverture auto, manager, pairs et autres par personne.',
  },
  no_opinion: {
    tr: '«Fikrim yok» seçeneğinin kullanım sıklığı ve soru bazında dağılımı.',
    en: 'Frequency and question-level distribution of “no opinion” responses.',
    fr: 'Fréquence et répartition des réponses « sans avis ».',
  },
  evaluator_answer_detail: {
    tr: 'Değerlendirici bazında kategori ve soru puanları (kalibrasyon detayı).',
    en: 'Category and question scores per evaluator (calibration detail).',
    fr: 'Scores catégorie/question par évaluateur (détail calibration).',
  },
  person_question_peer_averages: {
    tr: 'Kişi başına her soruda değerlendiricilerin verdiği ortalama puanlar.',
    en: 'Per-person average evaluator scores for each question.',
    fr: 'Moyennes évaluateurs par question et par personne.',
  },
}

const DEFAULT_SORT_ORDER: Record<string, number> = {
  matrix_structure_period_summary: 10,
  analytics_health_risk: 20,
  analytics_early_warning: 30,
  analytics_dept: 40,
  analytics_distribution: 50,
  analytics_managers: 60,
  period_change: 70,
  leaderboards_departments: 80,
  leaderboards_full_ranking_genel_okul_yasam: 90,
  leaderboards_departments_people: 100,
  duty_matrices_matrix: 110,
  matrix_structure_question_scores: 120,
  charts: 130,
  leaderboards_core: 10,
  leaderboards_full_ranking: 20,
  category_spotlight: 30,
  gaps: 40,
  heatmap: 50,
  people_table: 60,
  people_table_matrix: 60,
  analytics_evaluators: 70,
  analytics_weights: 80,
  participation: 90,
  coverage: 100,
  no_opinion: 110,
  evaluator_answer_detail: 120,
  person_question_peer_averages: 130,
}

function fillLocalized(
  base: LocalizedText,
  override?: Partial<LocalizedText>
): LocalizedText {
  return {
    tr: override?.tr?.trim() || base.tr,
    en: override?.en?.trim() || base.en,
    fr: override?.fr?.trim() || base.fr,
  }
}

export function defaultReportCatalogConfig(): ReportCatalogConfig {
  return { sections: {} }
}

export function normalizeReportCatalogConfig(raw: unknown): ReportCatalogConfig {
  if (!raw || typeof raw !== 'object') return defaultReportCatalogConfig()
  const sectionsRaw = (raw as { sections?: unknown }).sections
  if (!sectionsRaw || typeof sectionsRaw !== 'object') return defaultReportCatalogConfig()

  const sections: Record<string, ReportCatalogSectionOverride> = {}
  for (const [id, value] of Object.entries(sectionsRaw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const entry: ReportCatalogSectionOverride = {}
    if (v.group === 'management' || v.group === 'hr') entry.group = v.group
    if (typeof v.sortOrder === 'number' && Number.isFinite(v.sortOrder)) entry.sortOrder = v.sortOrder
    const label = v.label
    if (label && typeof label === 'object') {
      entry.label = {}
      const l = label as Record<string, unknown>
      if (typeof l.tr === 'string') entry.label.tr = l.tr
      if (typeof l.en === 'string') entry.label.en = l.en
      if (typeof l.fr === 'string') entry.label.fr = l.fr
    }
    const description = v.description
    if (description && typeof description === 'object') {
      entry.description = {}
      const d = description as Record<string, unknown>
      if (typeof d.tr === 'string') entry.description.tr = d.tr
      if (typeof d.en === 'string') entry.description.en = d.en
      if (typeof d.fr === 'string') entry.description.fr = d.fr
    }
    if (Object.keys(entry).length) sections[id] = entry
  }
  return { sections }
}

export function resolveReportCatalogEntry(
  section: AdminResultsReportSection,
  config: ReportCatalogConfig
): ResolvedReportCatalogEntry {
  const override = config.sections[section.id]
  const baseLabel = section.label
  const baseDescription =
    DEFAULT_DESCRIPTIONS[section.id] ||
    ({
      tr: baseLabel.tr,
      en: baseLabel.en,
      fr: baseLabel.fr,
    } satisfies LocalizedText)

  if (section.id === 'summary') {
    return {
      id: section.id,
      group: 'summary',
      label: fillLocalized(baseLabel, override?.label),
      description: fillLocalized(DEFAULT_DESCRIPTIONS.summary, override?.description),
      sortOrder: 0,
      assessmentKindScope: section.assessmentKindScope,
      schoolOnly: section.schoolOnly,
    }
  }

  const group = override?.group || DEFAULT_GROUPS[section.id] || 'hr'
  const sortOrder = override?.sortOrder ?? DEFAULT_SORT_ORDER[section.id] ?? 999

  return {
    id: section.id,
    group,
    label: fillLocalized(baseLabel, override?.label),
    description: fillLocalized(baseDescription, override?.description),
    sortOrder,
    assessmentKindScope: section.assessmentKindScope,
    schoolOnly: section.schoolOnly,
  }
}

export function groupLabel(group: ReportCatalogGroup | 'summary', lang: 'tr' | 'en' | 'fr'): string {
  if (group === 'summary') {
    return lang === 'en' ? 'Summary' : lang === 'fr' ? 'Résumé' : 'Özet'
  }
  if (group === 'management') {
    return lang === 'en' ? 'Management reports' : lang === 'fr' ? 'Rapports direction' : 'Yönetim Raporları'
  }
  return lang === 'en' ? 'HR reports' : lang === 'fr' ? 'Rapports RH' : 'İK Raporları'
}
