'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { Card, CardHeader, CardBody, CardTitle, Button, Select, Badge, toast } from '@/components/ui'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { t } from '@/lib/i18n'
import { isCoreGeneralReportMatrixContext, isDutyMatrixContext } from '@/lib/matrix-evaluation-context'
import {
  coreGeneralReportSectionLabel,
  groupPersonEvaluationsForDisplay,
  groupPersonEvaluationsByPositionLevel,
  personalDevelopmentReportSectionLabel,
  splitMatrixSlicesForPersonDisplay,
} from '@/lib/admin-person-results-sections'
import {
  assessmentKindLabel,
  countPeriodsByAssessmentKind,
  findPreviousPeriodSameKind,
  normalizeAssessmentKind,
} from '@/lib/evaluation-period-kind'
import {
  buildAdminResultsReportSections,
  tabForReportSection,
} from '@/lib/admin-results-report-catalog'
import {
  defaultReportCatalogConfig,
  buildReportDisplayLookup,
  type ReportCatalogConfig,
} from '@/lib/admin-results-report-catalog-config'
import { ReportCatalogSubtitle } from '@/components/admin/report-catalog-display'
import {
  buildDepartmentRankingFromMatrixStructure,
  buildDepartmentRankingGroups,
  buildLegacyCategoryPeerHighlightsFromResults,
  buildLegacyChartsReport,
  buildLegacyDepartmentCategoryHeatmap,
  buildLegacySelfTeamGapReports,
  buildMatrixCategoryPeerHighlights,
  buildMatrixChartsReport,
  buildMatrixDepartmentCategoryHeatmap,
  buildMatrixDepartmentPeopleRankingGroups,
  buildMatrixFullRanking,
  buildMatrixPeriodComparisonTrend,
  buildMatrixSelfTeamGapReports,
  buildMatrixRiskScorecard,
  buildMatrixOrganizationHealth,
  buildDepartmentAnalyticsReport,
  buildEarlyWarningsReport,
  buildMatrixPerformanceDistributionReport,
  buildLegacyPerformanceDistributionReport,
  buildMatrixManagerEffectivenessReport,
  buildLegacyManagerEffectivenessReport,
  buildEvaluatorLevelMap,
  buildMatrixEvaluatorCalibrationLines,
  buildLegacyEvaluatorCalibrationLines,
  buildEvaluatorPeerCalibrationReport,
  buildPeriodComparisonTrendFromResults,
  normalizeResultDepartment,
} from '@/lib/admin-department-ranking'
import {
  departmentSizeTierLabel,
} from '@/lib/department-size-tier'
import { 
  Search, Download, FileText, User, Users, Target, BarChart3, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, Loader2, Printer, Award, Building2, History,
  ArrowUpRight, ArrowDownRight, AlertTriangle, ShieldAlert, HeartPulse, SlidersHorizontal,
} from 'lucide-react'
import { SecurityStandardsSummary } from '@/components/security/security-standards-summary'
import { RadarCompare } from '@/components/charts/radar-compare'
import { BarCompare } from '@/components/charts/bar-compare'
import { MatrixSliceCategoryAccordions } from '@/components/admin/matrix-slice-category-accordions'
import { EvaluatorCoveragePanel } from '@/components/admin/evaluator-coverage-panel'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { EvaluatorAnswerDetailPanel, EvaluatorAnswerDetailLoadingCard } from '@/components/admin/evaluator-answer-detail-panel'
import {
  PersonQuestionPeerAveragesPanel,
  PersonQuestionPeerAveragesLoadingCard,
} from '@/components/admin/person-question-peer-averages-panel'
import { ReportsMaintenanceScreen, ReportsMaintenanceToggle } from '@/components/admin/reports-maintenance'
import { AdminReportsVisibilityPanel } from '@/components/admin/admin-reports-visibility-panel'
import { AdminReportsCatalogConfigPanel } from '@/components/admin/admin-reports-catalog-config-panel'
import { GroupedReportSelector } from '@/components/admin/grouped-report-selector'
import { defaultOrgAdminVisibleReportIds } from '@/lib/admin-results-report-visibility'
import { isJobEvaluationReportScope } from '@/lib/admin-results-report-scope'
import { MatrixStructureReportPanel } from '@/components/admin/matrix-structure-report-panel'
import { MatrixPersonResultsPanel } from '@/components/admin/matrix-person-results-panel'
import { MatrixDutyLeaderboardsPanel } from '@/components/admin/matrix-duty-leaderboards-panel'
import { buildMatrixDutyLeaderboardsReport } from '@/lib/matrix-duty-leaderboards-report-build'
import {
  ADMIN_RESULTS_PEER_DETAIL_STORAGE_KEY,
  readAdminResultsPeerDetailPreference,
} from '@/lib/admin-results-peer-detail'
import {
  MatrixDepartmentRankingPanel,
  matrixDepartmentRankingExportHeaders,
  matrixDepartmentRankingExportRows,
} from '@/components/admin/matrix-department-ranking-panel'
import {
  MatrixDepartmentPeopleRankingPanel,
  matrixDepartmentPeopleExportHeaders,
  matrixDepartmentPeopleExportRows,
  openMatrixDepartmentPeoplePdf,
} from '@/components/admin/matrix-department-people-ranking-panel'
import {
  MatrixFullRankingPanel,
  matrixFullRankingExportHeaders,
  matrixFullRankingExportRows,
  openMatrixFullRankingPdf,
} from '@/components/admin/matrix-full-ranking-panel'
import {
  MatrixCategorySpotlightPanel,
  matrixCategorySpotlightExportHeaders,
  matrixCategorySpotlightExportRows,
  openMatrixCategorySpotlightPdf,
} from '@/components/admin/matrix-category-spotlight-panel'
import {
  MatrixSelfTeamGapsPanel,
  matrixSelfTeamGapCategoryExportRows,
  matrixSelfTeamGapExportHeaders,
  matrixSelfTeamGapQuestionExportRows,
  openMatrixSelfTeamGapPdf,
} from '@/components/admin/matrix-self-team-gaps-panel'
import {
  MatrixDepartmentHeatmapPanel,
  matrixDepartmentHeatmapExportHeaders,
  matrixDepartmentHeatmapExportRows,
  openMatrixDepartmentHeatmapPdf,
} from '@/components/admin/matrix-department-heatmap-panel'
import {
  MatrixScoreDistributionPanel,
  matrixChartsExportRows,
  openMatrixChartsPdf,
} from '@/components/admin/matrix-score-distribution-panel'
import type { MatrixStructureReportPayload } from '@/lib/server/matrix-structure-report-build'
import type { MatrixPersonResultsReportPayload } from '@/lib/server/matrix-person-results-report-build'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import type { EvaluatorCoverageRow, EvaluatorCoverageSlice } from '@/lib/server/evaluation-evaluator-coverage'
import { matrixEvaluationContextLabel } from '@/lib/matrix-evaluation-context'
import { positionLevelLabel } from '@/lib/server/evaluator-answer-detail'
import type { EvaluatorAnswerDetailRow } from '@/lib/server/evaluator-answer-detail'
import type { PersonQuestionPeerAverageRow } from '@/lib/server/person-question-peer-averages'
import { buildCsv, downloadCsv, openPrintableReport } from '@/lib/admin-report-export'
import { resolveQuestionLabel, questionIdsMatch } from '@/lib/server/question-text-resolve'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

function escapeHtmlForPrint(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function trainingForCategory(categoryName: string): string[] {
  const n = (categoryName || '').toLowerCase()
  const out: string[] = []

  const push = (s: string) => {
    if (!out.includes(s)) out.push(s)
  }

  if (/(iletişim|iletisim|dinleme|empati)/.test(n)) push('Etkili İletişim ve Aktif Dinleme')
  if (/(geri bildirim|geribildirim|feedback)/.test(n)) push('Geri Bildirim Verme ve Alma (Koçluk Yaklaşımı)')
  if (/(takım|takim|işbirliği|isbirligi|ekip)/.test(n)) push('Takım Çalışması ve İşbirliği')
  if (/(çatış|catis|müzakere|muzakere)/.test(n)) push('Çatışma Yönetimi ve Müzakere')
  if (/(zaman|öncelik|oncelik|planlama|organizasyon)/.test(n)) push('Zaman Yönetimi ve Önceliklendirme')
  if (/(lider|koç|koc|yönet|yonet)/.test(n)) push('Liderlik ve Koçluk Becerileri')
  if (/(problem|analitik|veri|karar)/.test(n)) push('Problem Çözme ve Analitik Düşünme')
  if (/(strateji|vizyon)/.test(n)) push('Stratejik Düşünme ve Hedef Yönetimi')
  if (/(değişim|degisim|esneklik|uyum)/.test(n)) push('Değişim Yönetimi ve Adaptasyon')

  if (out.length === 0 && categoryName) {
    push(`Yetkinlik Gelişimi: ${categoryName}`)
  }
  return out
}

function buildAiInsights(result: ResultData) {
  const strong = result.swot.peer.strengths.slice(0, 2).map((s) => s.name).filter(Boolean)
  const weak = result.swot.peer.weaknesses.slice(0, 3).map((w) => w.name).filter(Boolean)

  const trainings = weak
    .flatMap((c) => trainingForCategory(c))
    .slice(0, 6)

  const summaryParts: string[] = []
  if (strong.length) summaryParts.push(`Ekip güçlü gördüğü alanlar: ${strong.join(', ')}`)
  if (weak.length) summaryParts.push(`Gelişim alanları: ${weak.join(', ')}`)
  const summary = summaryParts.length ? `${summaryParts.join('. ')}.` : 'Yeterli veri yok.'

  return { summary, trainings }
}

interface ResultData {
  targetId: string
  targetName: string
  targetDept: string
  hasCorePeriodEvaluation?: boolean
  hasSelfEvaluationAssignment?: boolean
  /** Öz ataması var ve evaluation_responses ile skor üretilebiliyorsa true */
  selfHasScorableResponses?: boolean
  evaluations: {
    evaluatorId: string
    evaluatorName: string
    isSelf: boolean
    evaluatorLevel?: 'executive' | 'manager' | 'peer' | 'subordinate' | 'self' | string
    avgScore: number
    hasScorableResponses?: boolean
    assignmentId?: string
    responseCount?: number
    distinctQuestionCount?: number
    distinctCategoryCount?: number
    zeroScoreCount?: number
    missingCategoryCount?: number
    categories: { name: string; score: number }[]
    questionScores?: { questionId: string; category: string; score: number }[]
    questionScoresDuty?: { questionId: string; category: string; score: number }[]
    matrixContext?: string
    evaluatorWeight?: number
  }[]
  /** Tüm matris dilimleri — yalnızca ekip detayı açıkken */
  evaluationsAll?: ResultData['evaluations']
  /** Genel + Okul Yaşam — detay kapalıyken de birleşik bölümde gösterilir */
  evaluationsCoreGeneral?: ResultData['evaluations']
  overallAvg: number
  overallAvgDuty?: number | null
  /** Genel + Okul Yaşam birleşik dönem özeti skoru */
  genelOkulYasamCombinedAvg?: number
  genelOkulYasamCombinedTrimmed?: number
  genelOkulYasamCombinedTrimEligible?: boolean
  okulYasamPeerAvg?: number
  hasOkulYasamEvaluation?: boolean
  /** Uç değer kırpılmış ekip ortalaması (yeterli değerlendirici + soru cevabı yoksa 0) */
  peerAvgTrimmed?: number
  /** Şimdilik peerAvgTrimmed ile aynı (öz/standart dahil edilmeden) */
  overallAvgTrimmed?: number
  /** Esnek trim: soru başına ≥3 puanlanabilir cevapta min/max kırpılır */
  peerAvgTrimmedGeneral?: number
  overallAvgTrimmedGeneral?: number
  peerTrimEligible?: boolean
  peerTrimGeneralEligible?: boolean
  peerEvaluatorCountForTrim?: number
  /** Tüm matris dilimlerinde tamamlanmış + puanlanabilir benzersiz değerlendiren */
  peerEvaluatorCompletedScorable?: number
  /** Formu tamamlamış; yalnızca fikrim yok / puanlanabilir cevap yok */
  peerEvaluatorCompletedNoOpinion?: number
  /** Atanmış benzersiz değerlendiren (tamamlanan + bekleyen) */
  peerEvaluatorAssigned?: number
  /** Henüz tamamlamamış benzersiz değerlendiren */
  peerEvaluatorPending?: number
  /** Yalnızca genel 360 diliminde tamamlanmış + puanlanabilir değerlendiren */
  peerEvaluatorCountGenel?: number
  peerEvaluatorCoverage?: {
    bySlice: EvaluatorCoverageSlice[]
    rows: EvaluatorCoverageRow[]
  }
  peerTrimEligibleDuty?: boolean
  score100?: number | null
  score100Trimmed?: number | null
  score100TrimmedGeneral?: number | null
  peerAvgTrimmedDuty?: number
  overallAvgTrimmedDuty?: number
  score100Duty?: number | null
  score100TrimmedDuty?: number | null
  maxScaleDuty?: number
  selfScore: number
  selfScoreDuty?: number | null
  peerAvg: number
  peerAvgDuty?: number | null
  hasDutyScope?: boolean
  dutyPackageScores?: Array<{
    dutyId: string
    dutyName: string
    selfScore: number
    peerAvg: number
    peerCount: number
    overallAvg: number
  }>
  standardAvg: number
  standardCount: number
  standardByTitle: { title: string; avg: number; count: number }[]
  categoryCompare: { name: string; self: number; peer: number; diff: number; peerTrimmed?: number; peerTrimmedGeneral?: number }[]
  categoryCompareDuty?: { name: string; self: number; peer: number; diff: number; peerTrimmed?: number; peerTrimmedGeneral?: number }[]
  categoryQuestions?: Record<
    string,
    Array<{
      questionId: string
      questionText: string
      self: number
      peer: number
      peerTrimmed?: number
      peerTrimApplied?: boolean
      peerTrimN?: number
      diff: number
      selfCount?: number
      peerCount?: number
      categoryKey?: string
      categoryLabel?: string
    }>
  >
  categoryQuestionsDuty?: Record<
    string,
    Array<{
      questionId: string
      questionText: string
      self: number
      peer: number
      peerTrimmed?: number
      peerTrimApplied?: boolean
      peerTrimN?: number
      diff: number
      selfCount?: number
      peerCount?: number
      categoryKey?: string
      categoryLabel?: string
    }>
  >
  responseStats?: {
    totalQuestionsWithAnyResponse: number
    selfAnsweredQuestions: number
    peerAnsweredQuestions: number
    bothAnsweredQuestions: number
    totalCategoriesWithAnyResponse: number
    selfAnsweredCategories: number
    peerAnsweredCategories: number
    questionTextLookup?: {
      requested: number
      resolved: number
      usedSnapshot: boolean
      snapshotErrors: Array<{ code: string; message: string }>
      questionsErrors: Array<{ code: string; message: string }>
    }
  }
  swot: {
    self: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
    peer: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
  }
  matrixSlices?: Array<{
    matrixContext: string
    matrixLabel: string
    isDutyMatrix?: boolean
    overallAvg?: number
    overallAvgSelfPeer?: number
    peerAvg?: number
    peerAvgTrimmed?: number
    overallAvgTrimmed?: number
    peerEvaluatorCount?: number
    peerTrimEligible?: boolean
    evaluatorCount?: number
    categoryCompare?: { name: string; self?: number; peer: number; diff?: number; peerTrimmed?: number }[]
  }>
}

interface PersonReportSlice {
  periodId: string
  periodName: string
  assessmentKind: string
  assessmentLabel: string
  matrixContext: string
  matrixLabel: string
  isDutyMatrix?: boolean
  overallAvg: number
  peerAvg: number
  peerAvgTrimmed?: number
  overallAvgTrimmed?: number
  peerTrimEligible?: boolean
  score100?: number | null
  score100Trimmed?: number | null
  evaluatorCount: number
  peerEvaluatorCount?: number
  standardAvg: number
  swot: { peer: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[] } }
  aiSummary: string
  categoryCompare?: { name: string; self?: number; peer: number; diff?: number; peerTrimmed?: number }[]
}

interface PersonReportPeriodGroup {
  periodId: string
  periodName: string
  startDate?: string | null
  endDate?: string | null
  assessmentKind: string
  assessmentLabel: string
  slices: PersonReportSlice[]
  peerEvaluatorCoverage?: {
    peerEvaluatorAssigned: number
    peerEvaluatorCompletedScorable: number
    peerEvaluatorCompletedNoOpinion: number
    peerEvaluatorPending: number
    peerEvaluatorCountGenel: number
    bySlice: EvaluatorCoverageSlice[]
    rows: EvaluatorCoverageRow[]
  }
}

type AnalyticsWeights = {
  riskOverall: number
  riskTrend: number
  riskGap: number
  riskCoverage: number
  healthPerformance: number
  healthParticipation: number
  healthCoverage: number
  healthTrend: number
  warningDropThreshold: number
  warningLowScoreThreshold: number
}

const DEFAULT_ANALYTICS_WEIGHTS: AnalyticsWeights = {
  riskOverall: 0.35,
  riskTrend: 0.25,
  riskGap: 0.2,
  riskCoverage: 0.2,
  healthPerformance: 0.35,
  healthParticipation: 0.2,
  healthCoverage: 0.2,
  healthTrend: 0.25,
  warningDropThreshold: -0.4,
  warningLowScoreThreshold: 2.9,
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const round2 = (v: number) => Math.round(v * 100) / 100
function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const w = idx - lo
  return sorted[lo] * (1 - w) + sorted[hi] * w
}
const normalizeWeights = (w: AnalyticsWeights): AnalyticsWeights => {
  const riskSum = w.riskOverall + w.riskTrend + w.riskGap + w.riskCoverage || 1
  const healthSum = w.healthPerformance + w.healthParticipation + w.healthCoverage + w.healthTrend || 1
  return {
    ...w,
    riskOverall: w.riskOverall / riskSum,
    riskTrend: w.riskTrend / riskSum,
    riskGap: w.riskGap / riskSum,
    riskCoverage: w.riskCoverage / riskSum,
    healthPerformance: w.healthPerformance / healthSum,
    healthParticipation: w.healthParticipation / healthSum,
    healthCoverage: w.healthCoverage / healthSum,
    healthTrend: w.healthTrend / healthSum,
  }
}

function questionTextFromResult(
  result: ResultData,
  questionId: string,
  questionTexts: Record<string, string> | undefined,
  lang: 'tr' | 'en' | 'fr'
): string {
  const qid = String(questionId || '').trim()
  if (!qid) return ''

  const evals = [...(result.evaluationsAll || []), ...(result.evaluations || [])]
  for (const ev of evals) {
    for (const qs of [...(ev.questionScores || []), ...((ev as any).questionScoresDuty || [])]) {
      if (!questionIdsMatch(String(qs.questionId), qid)) continue
      const inline = String((qs as any).questionText || '').trim()
      if (inline) return resolveQuestionLabel(qid, questionTexts, inline, lang)
    }
  }

  const maps = [result.categoryQuestions, result.categoryQuestionsDuty]
  for (const m of maps) {
    if (!m) continue
    for (const rows of Object.values(m)) {
      const hit = rows.find((q) => questionIdsMatch(String(q.questionId), qid))
      if (hit) return resolveQuestionLabel(qid, questionTexts, hit.questionText, lang)
    }
  }
  return resolveQuestionLabel(qid, questionTexts, undefined, lang)
}

function GenVsTeamScoreExplainer({ className = '' }: { className?: string }) {
  const lang = useLang()
  return (
    <div
      className={`rounded-xl border border-amber-200/80 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-500/25 px-4 py-3 text-sm leading-relaxed ${className}`}
    >
      <p className="font-semibold text-amber-950 dark:text-amber-100 mb-1">
        {t('reportNote_genVsTeamScoreTitle', lang)}
      </p>
      <p className="text-[var(--muted)]">{t('reportNote_genVsTeamScoreColumns', lang)}</p>
    </div>
  )
}

export default function ResultsPage() {

  const lang = useLang()
  const { user } = useAuthStore()
  const { organizationId } = useAdminContextStore()
  const periodName = useCallback((p: any) => {
    if (!p) return ''
    if (lang === 'fr') return String(p.name_fr || p.name || '')
    if (lang === 'en') return String(p.name_en || p.name || '')
    return String(p.name || '')
  }, [lang])
  const userRole = user?.role
  const isSuperAdmin = userRole === 'super_admin'
  const userOrgId = (user as any)?.organization_id ? String((user as any).organization_id) : ''
  const [reportsMaintenance, setReportsMaintenance] = useState(false)
  const [orgVisibleReportIds, setOrgVisibleReportIds] = useState<string[] | null>(null)
  const [reportCatalogConfig, setReportCatalogConfig] = useState<ReportCatalogConfig>(defaultReportCatalogConfig())
  const [maintenanceLoading, setMaintenanceLoading] = useState(true)
  const [maintenanceSaving, setMaintenanceSaving] = useState(false)
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const [catalogSaving, setCatalogSaving] = useState(false)
  const reportsBlocked = reportsMaintenance && !isSuperAdmin
  const [periods, setPeriods] = useState<Array<{ id: string; name: string; assessmentKind?: string }>>([])
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string; department?: string | null }>>([])
  const [departments, setDepartments] = useState<string[]>([])
  
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedOrg, setSelectedOrg] = useState('')
  const [selectedDept, setSelectedDept] = useState('')
  const [selectedPerson, setSelectedPerson] = useState('')

  const selectedPeriodAssessment = useMemo(() => {
    const p = periods.find((x) => String(x.id) === String(selectedPeriod))
    if (!p) return null
    const kind = normalizeAssessmentKind(p.assessmentKind)
    return { kind, label: assessmentKindLabel(kind, lang) }
  }, [periods, selectedPeriod, lang])

  const isJobEvaluationPeriod = isJobEvaluationReportScope(selectedPeriodAssessment?.kind)
  const analyticsPurposeKey = (jobKey: string, pdKey: string) =>
    (isJobEvaluationPeriod ? jobKey : pdKey) as Parameters<typeof t>[0]
  
  const [results, setResults] = useState<ResultData[]>([])
  const [questionTexts, setQuestionTexts] = useState<Record<string, string>>({})
  /** Önceki dönem (liste sırasına göre) sonuçları — trend için */
  const [prevResults, setPrevResults] = useState<ResultData[]>([])
  const [analyticsWeights, setAnalyticsWeights] = useState<AnalyticsWeights>(DEFAULT_ANALYTICS_WEIGHTS)
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics'>('overview')
  const [expandedRiskTargetId, setExpandedRiskTargetId] = useState<string | null>(null)
  const [aiExplainLoadingTargetId, setAiExplainLoadingTargetId] = useState<string | null>(null)
  const [aiExplainByTargetId, setAiExplainByTargetId] = useState<Record<string, any>>({})
  const [aiExplainMetaByTargetId, setAiExplainMetaByTargetId] = useState<Record<string, { model?: string; warning?: string }>>({})
  const [loading, setLoading] = useState(false)
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)
  /** Değerlendirici kalibrasyon tablosu: en az kaç kişi değerlendirildi (1 veya 2+) */
  const [evaluatorCalMinTargets, setEvaluatorCalMinTargets] = useState<1 | 2>(1)
  /** Sadece bu position_level satırları (öz hariç zaten yok) */
  const [evaluatorCalLevel, setEvaluatorCalLevel] = useState<
    'all' | 'peer' | 'manager' | 'executive' | 'subordinate'
  >('all')
  const [expandedCategoryByTarget, setExpandedCategoryByTarget] = useState<Record<string, string | null>>({})
  const [reopeningAssignmentId, setReopeningAssignmentId] = useState<string | null>(null)
  const [participation, setParticipation] = useState<{
    totals: { total: number; completed: number; pending: number }
    departments: Array<{ department: string; total: number; completed: number; pending: number }>
  } | null>(null)
  const [coverage, setCoverage] = useState<Array<{
    targetId: string
    targetName: string
    targetDept: string
    completedTotal: number
    pendingTotal: number
    selfCompleted: number
    managerCompleted: number
    peerCompleted: number
    subordinateCompleted: number
    executiveCompleted: number
  }> | null>(null)
  const [noOpinionReport, setNoOpinionReport] = useState<{
    totals: {
      completedAssignments: number
      allNoOpinionCount: number
      uniqueEvaluators: number
      uniqueTargets: number
    }
    rows: Array<{
      assignmentId: string
      evaluatorId: string
      evaluatorName: string
      evaluatorDept: string
      evaluatorLevel: string
      targetId: string
      targetName: string
      targetDept: string
      matrixContext: string
      matrixContextLabel: string
      isSelf: boolean
      responseCount: number
      completedAt: string | null
    }>
  } | null>(null)
  const [loadingNoOpinionReport, setLoadingNoOpinionReport] = useState(false)
  const [evaluatorAnswerDetail, setEvaluatorAnswerDetail] = useState<{
    totals: {
      assignmentCount: number
      rowCount: number
      uniqueTargets: number
      uniqueEvaluators: number
    }
    rows: EvaluatorAnswerDetailRow[]
  } | null>(null)
  const [loadingEvaluatorAnswerDetail, setLoadingEvaluatorAnswerDetail] = useState(false)
  const [personQuestionPeerAverages, setPersonQuestionPeerAverages] = useState<{
    target: { id: string; name: string; department: string }
    totals: { assignmentCount: number; questionCount: number; uniqueEvaluators: number }
    rows: PersonQuestionPeerAverageRow[]
  } | null>(null)
  const [loadingPersonQuestionPeerAverages, setLoadingPersonQuestionPeerAverages] = useState(false)
  const [matrixStructureReport, setMatrixStructureReport] = useState<MatrixStructureReportPayload | null>(null)
  const [matrixPersonResultsReport, setMatrixPersonResultsReport] = useState<MatrixPersonResultsReportPayload | null>(null)
  /** Önceki dönem MATRIX yapı raporu — dönem karşılaştırması için */
  const [prevMatrixStructureReport, setPrevMatrixStructureReport] = useState<MatrixStructureReportPayload | null>(null)
  const [expandedEvalCategoryKey, setExpandedEvalCategoryKey] = useState<string | null>(null)
  /** API yanıtı: şu anki sonuçta ekip değerlendiricileri isim isim mi */
  const [peerEvaluatorsVisible, setPeerEvaluatorsVisible] = useState(false)
  /** Filtre: sonraki istekte include_peer_detail — toplantıda varsayılan kapalı */
  const [showPeerDetail, setShowPeerDetail] = useState(false)
  const [matrixProfileId, setMatrixProfileId] = useState<'school_full' | 'standard_360'>('school_full')
  const [selectedReportSection, setSelectedReportSection] = useState('summary')

  useEffect(() => {
    try {
      if (localStorage.getItem(ADMIN_RESULTS_PEER_DETAIL_STORAGE_KEY) === '1') setShowPeerDetail(true)
    } catch {
      /* ignore */
    }
  }, [])


  useEffect(() => {
    try {
      const raw = localStorage.getItem('adminResultsAnalyticsWeights')
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<AnalyticsWeights>
      setAnalyticsWeights((prev) => normalizeWeights({ ...prev, ...parsed }))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('adminResultsAnalyticsWeights', JSON.stringify(analyticsWeights))
    } catch {
      /* ignore */
    }
  }, [analyticsWeights])

  const filteredUsers = useMemo(() => {
    if (!selectedDept) return users
    return users.filter((u) => String(u.department || '') === String(selectedDept))
  }, [users, selectedDept])

  const openPersonFromRisk = useCallback((targetId: string) => {
    setActiveTab('overview')
    setExpandedPerson(String(targetId))
    setTimeout(() => {
      const el = document.getElementById(`person-row-${targetId}`) || document.getElementById(`admin-report-${targetId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [])

  const matrixChartsReport = useMemo(() => {
    if (isJobEvaluationPeriod && matrixStructureReport?.rankings?.length) {
      return buildMatrixChartsReport(matrixStructureReport.rankings)
    }
    return buildLegacyChartsReport(results)
  }, [isJobEvaluationPeriod, matrixStructureReport?.rankings, results])

  const overallDistribution = matrixChartsReport.overallDistribution
  const categorySummary = matrixChartsReport.categorySummary

  const gapReports = useMemo(() => {
    const resolveQ = (qid: string, fb: string) => resolveQuestionLabel(qid, questionTexts, fb, lang)
    if (isJobEvaluationPeriod && matrixStructureReport?.rankings?.length) {
      const matrix = buildMatrixSelfTeamGapReports(matrixStructureReport.rankings, results, resolveQ)
      if (matrix.topCategoryGaps.length || matrix.topQuestionGaps.length) return matrix
    }
    return buildLegacySelfTeamGapReports(results, resolveQ)
  }, [isJobEvaluationPeriod, matrixStructureReport?.rankings, results, questionTexts, lang])

  const deptHeatmap = useMemo(() => {
    if (isJobEvaluationPeriod && matrixStructureReport?.rankings?.length) {
      const matrix = buildMatrixDepartmentCategoryHeatmap(
        matrixStructureReport.rankings,
        matrixStructureReport.categoryLabels
      )
      if (matrix.departments.length && matrix.categories.length) return matrix
    }
    return buildLegacyDepartmentCategoryHeatmap(results)
  }, [isJobEvaluationPeriod, matrixStructureReport?.rankings, matrixStructureReport?.categoryLabels, results])

  const LEADERBOARD_N = 10

  type LeaderboardRow = { name: string; dept: string; score: number; scoreTrim: number }

  type FormLeaderboard = {
    context: string
    label: string
    top: LeaderboardRow[]
    bottom: LeaderboardRow[]
    topTrim: LeaderboardRow[]
    bottomTrim: LeaderboardRow[]
  }

  const buildFormLeaderboardRows = useCallback(
    (
      matrixContext: string,
      scoreMode: 'selfPeer' | 'peer'
    ): LeaderboardRow[] => {
      const rows: LeaderboardRow[] = []
      results.forEach((r) => {
        const slice = (r.matrixSlices || []).find((s) => s.matrixContext === matrixContext)
        if (!slice) return
        let score = 0
        if (scoreMode === 'peer') {
          const peerCount = Number(slice?.peerEvaluatorCount ?? 0)
          score = Number(slice?.peerAvg ?? slice?.overallAvg ?? 0)
          if (peerCount <= 0 || !Number.isFinite(score) || score <= 0) return
        } else {
          score = Number(slice?.overallAvgSelfPeer ?? slice?.overallAvg ?? 0)
          if (!Number.isFinite(score) || score <= 0) return
        }
        const trimOk =
          slice?.peerTrimEligible === true &&
          Number(slice?.overallAvgTrimmed ?? slice?.peerAvgTrimmed ?? 0) > 0
        const scoreTrim = trimOk
          ? Math.round(Number(slice?.overallAvgTrimmed ?? slice?.peerAvgTrimmed ?? 0) * 100) / 100
          : 0
        rows.push({
          name: r.targetName,
          dept: r.targetDept,
          score,
          scoreTrim,
        })
      })
      return rows
    },
    [results]
  )

  const buildFormLeaderboard = useCallback(
    (matrixContext: string, scoreMode: 'selfPeer' | 'peer'): Omit<FormLeaderboard, 'context' | 'label'> => {
      const rows = buildFormLeaderboardRows(matrixContext, scoreMode)
      const sortedDesc = [...rows].sort((a, b) => b.score - a.score)
      const sortedAsc = [...rows].sort((a, b) => a.score - b.score)
      const sortedTrimDesc = [...rows].sort((a, b) => b.scoreTrim - a.scoreTrim)
      const sortedTrimAsc = [...rows].sort((a, b) => a.scoreTrim - b.scoreTrim)
      return {
        top: sortedDesc.slice(0, LEADERBOARD_N),
        bottom: sortedAsc.slice(0, LEADERBOARD_N),
        topTrim: sortedTrimDesc.slice(0, LEADERBOARD_N),
        bottomTrim: sortedTrimAsc.slice(0, LEADERBOARD_N),
      }
    },
    [buildFormLeaderboardRows]
  )

  const isSchoolOrg = matrixProfileId === 'school_full'
  const showSchoolMatrixUi = isSchoolOrg && isJobEvaluationPeriod

  const summaryHeaderStats = useMemo(() => {
    const round2 = (n: number | null) => (n != null && Number.isFinite(n) ? Math.round(n * 100) / 100 : null)
    const avg = (arr: number[]) => (arr.length ? round2(arr.reduce((a, b) => a + b, 0) / arr.length) : null)
    const max = (arr: number[]) => (arr.length ? round2(Math.max(...arr)) : null)
    const min = (arr: number[]) => (arr.length ? round2(Math.min(...arr)) : null)

    if (isJobEvaluationPeriod && (matrixStructureReport?.rankings?.length ?? 0) > 0) {
      const matrixScores = (matrixStructureReport?.rankings || [])
        .map((r) => Number(r.overallPeerAvg || 0))
        .filter((v) => v > 0)

      const peopleCount =
        matrixStructureReport?.periodSummary?.targetsWithScores != null &&
        matrixStructureReport.periodSummary.targetsWithScores > 0
          ? matrixStructureReport.periodSummary.targetsWithScores
          : matrixScores.length || results.length

      const totalEvaluations =
        matrixStructureReport?.periodSummary?.completedAssignmentCount ??
        results.reduce((sum, r) => sum + (r.evaluations?.length || 0), 0)

      return {
        mode: 'job_evaluation' as const,
        peopleCount,
        matrixAvg: avg(matrixScores),
        matrixHighest: max(matrixScores),
        matrixLowest: min(matrixScores),
        totalEvaluations,
      }
    }

    if (!results.length) return null

    const selfScores = results.map((r) => Number(r.selfScore || 0)).filter((v) => v > 0)
    const peerScores = results.map((r) => Number(r.peerAvg || 0)).filter((v) => v > 0)
    const trimScores = results
      .filter((r) => r.peerTrimEligible === true)
      .map((r) => Number(r.overallAvgTrimmed || r.peerAvgTrimmed || 0))
      .filter((v) => v > 0)
    const trimGeneralScores = results
      .filter((r) => r.peerTrimGeneralEligible === true)
      .map((r) => Number(r.overallAvgTrimmedGeneral || r.peerAvgTrimmedGeneral || 0))
      .filter((v) => v > 0)

    return {
      mode: 'development_360' as const,
      peopleCount: results.length,
      avgSelf: avg(selfScores),
      avgPeer: avg(peerScores),
      avgTrim: avg(trimScores),
      avgTrimGeneral: avg(trimGeneralScores),
      highestTrim: max(trimScores.length ? trimScores : results.map((r) => Number(r.overallAvg || 0)).filter((v) => v > 0)),
      lowestTrim: min(trimScores.length ? trimScores : results.map((r) => Number(r.overallAvg || 0)).filter((v) => v > 0)),
      totalEvaluations: results.reduce((sum, r) => sum + (r.evaluations?.length || 0), 0),
    }
  }, [isJobEvaluationPeriod, matrixStructureReport, results])

  const matrixDutyLeaderboardsReport = useMemo(
    () => buildMatrixDutyLeaderboardsReport(matrixPersonResultsReport),
    [matrixPersonResultsReport]
  )

  const orgVisibleReportIdsResolved = useMemo(
    () => orgVisibleReportIds ?? defaultOrgAdminVisibleReportIds(),
    [orgVisibleReportIds]
  )

  const reportSectionOptions = useMemo(
    () =>
      buildAdminResultsReportSections({
        lang,
        isSchoolOrg,
        isSuperAdmin,
        selectedAssessmentKind: selectedPeriodAssessment?.kind ?? null,
        orgVisibleReportIds: isSuperAdmin ? undefined : orgVisibleReportIds,
        catalogConfig: reportCatalogConfig,
        dutyMatrices: [],
        includeParticipation: !!participation,
        includeCoverage: !!coverage,
        includeNoOpinion: !!noOpinionReport,
        includeEvaluatorAnswerDetail: !!evaluatorAnswerDetail,
        includePersonQuestionPeerAverages: !!personQuestionPeerAverages,
      }),
    [
      lang,
      isSchoolOrg,
      isSuperAdmin,
      selectedPeriodAssessment?.kind,
      orgVisibleReportIds,
      reportCatalogConfig,
      participation,
      coverage,
      noOpinionReport,
      evaluatorAnswerDetail,
      personQuestionPeerAverages,
    ]
  )

  const reportDisplay = useMemo(
    () => buildReportDisplayLookup(reportSectionOptions),
    [reportSectionOptions]
  )

  const showReport = useCallback(
    (sectionId: string) => selectedReportSection === sectionId,
    [selectedReportSection]
  )

  useEffect(() => {
    if (!reportSectionOptions.some((o) => o.id === selectedReportSection)) {
      setSelectedReportSection(reportSectionOptions[0]?.id || 'summary')
    }
  }, [reportSectionOptions, selectedReportSection])

  const peopleLeaderboard = useMemo(() => {
    if (!results.length) {
      return {
        top: [] as Array<{ name: string; dept: string; score: number; scoreTrim: number }>,
        bottom: [] as Array<{ name: string; dept: string; score: number; scoreTrim: number }>,
        topTrim: [] as Array<{ name: string; dept: string; score: number; scoreTrim: number }>,
        bottomTrim: [] as Array<{ name: string; dept: string; score: number; scoreTrim: number }>,
      }
    }
    const coreResults = results.filter(
      (r) => r.hasCorePeriodEvaluation === true && Number(r.overallAvg || 0) > 0
    )
    const coreTrimResults = coreResults.filter(
      (r) => r.peerTrimEligible === true && Number(r.overallAvgTrimmed || r.peerAvgTrimmed || 0) > 0
    )
    const sortedDesc = [...coreResults].sort((a, b) => Number(b.overallAvg || 0) - Number(a.overallAvg || 0))
    const sortedAsc = [...coreResults].sort((a, b) => Number(a.overallAvg || 0) - Number(b.overallAvg || 0))
    const sortedTrimDesc = [...coreTrimResults].sort((a, b) => Number(b.overallAvgTrimmed || 0) - Number(a.overallAvgTrimmed || 0))
    const sortedTrimAsc = [...coreTrimResults].sort((a, b) => Number(a.overallAvgTrimmed || 0) - Number(b.overallAvgTrimmed || 0))
    const mapRow = (r: ResultData) => ({
      name: r.targetName,
      dept: r.targetDept,
      score: Math.round(Number(r.overallAvg || 0) * 100) / 100,
      scoreTrim:
        r.peerTrimEligible === true
          ? Math.round(Number(r.overallAvgTrimmed || r.peerAvgTrimmed || 0) * 100) / 100
          : 0,
    })
    return {
      top: sortedDesc.slice(0, LEADERBOARD_N).map(mapRow),
      bottom: sortedAsc.slice(0, LEADERBOARD_N).map(mapRow),
      topTrim: sortedTrimDesc.slice(0, LEADERBOARD_N).map(mapRow),
      bottomTrim: sortedTrimAsc.slice(0, LEADERBOARD_N).map(mapRow),
    }
  }, [results])

  const genelOkulYasamLeaderboard = useMemo(() => {
    if (!results.length) {
      return {
        top: [] as LeaderboardRow[],
        bottom: [] as LeaderboardRow[],
        topTrim: [] as LeaderboardRow[],
        bottomTrim: [] as LeaderboardRow[],
      }
    }
    const eligible = results.filter(
      (r) => Number(r.genelOkulYasamCombinedAvg || 0) > 0
    )
    const trimEligible = eligible.filter((r) => r.genelOkulYasamCombinedTrimEligible === true)
    const mapRow = (r: ResultData) => ({
      name: r.targetName,
      dept: r.targetDept,
      score: Math.round(Number(r.genelOkulYasamCombinedAvg || 0) * 100) / 100,
      scoreTrim:
        r.genelOkulYasamCombinedTrimEligible === true
          ? Math.round(Number(r.genelOkulYasamCombinedTrimmed || 0) * 100) / 100
          : 0,
    })
    const sortedDesc = [...eligible].sort(
      (a, b) => Number(b.genelOkulYasamCombinedAvg || 0) - Number(a.genelOkulYasamCombinedAvg || 0)
    )
    const sortedAsc = [...eligible].sort(
      (a, b) => Number(a.genelOkulYasamCombinedAvg || 0) - Number(b.genelOkulYasamCombinedAvg || 0)
    )
    const sortedTrimDesc = [...trimEligible].sort(
      (a, b) =>
        Number(b.genelOkulYasamCombinedTrimmed || 0) - Number(a.genelOkulYasamCombinedTrimmed || 0)
    )
    const sortedTrimAsc = [...trimEligible].sort(
      (a, b) =>
        Number(a.genelOkulYasamCombinedTrimmed || 0) - Number(b.genelOkulYasamCombinedTrimmed || 0)
    )
    return {
      top: sortedDesc.slice(0, LEADERBOARD_N).map(mapRow),
      bottom: sortedAsc.slice(0, LEADERBOARD_N).map(mapRow),
      topTrim: sortedTrimDesc.slice(0, LEADERBOARD_N).map(mapRow),
      bottomTrim: sortedTrimAsc.slice(0, LEADERBOARD_N).map(mapRow),
    }
  }, [results])

  const generalRankingFull = useMemo(() => {
    const ranked = results
      .filter((r) => Number(r.overallAvg || 0) > 0 || Number(r.peerAvg || 0) > 0)
      .sort((a, b) => {
        const scoreA =
          a.peerTrimEligible === true && Number(a.overallAvgTrimmed || 0) > 0
            ? Number(a.overallAvgTrimmed)
            : Number(a.overallAvg || 0)
        const scoreB =
          b.peerTrimEligible === true && Number(b.overallAvgTrimmed || 0) > 0
            ? Number(b.overallAvgTrimmed)
            : Number(b.overallAvg || 0)
        return scoreB - scoreA
      })
    return ranked.map((r, idx) => ({
      rank: idx + 1,
      targetId: r.targetId,
      name: r.targetName,
      dept: r.targetDept,
      overallAvg: Math.round(Number(r.overallAvg || 0) * 100) / 100,
      peerAvg: Math.round(Number(r.peerAvg || 0) * 100) / 100,
      selfScore: Math.round(Number(r.selfScore || 0) * 100) / 100,
      score100: r.score100 != null ? Math.round(Number(r.score100) * 100) / 100 : null,
      scoreTrim:
        r.peerTrimEligible === true && Number(r.overallAvgTrimmed || r.peerAvgTrimmed || 0) > 0
          ? Math.round(Number(r.overallAvgTrimmed || r.peerAvgTrimmed || 0) * 100) / 100
          : null,
      scoreTrimGeneral:
        r.peerTrimGeneralEligible === true &&
        Number(r.overallAvgTrimmedGeneral || r.peerAvgTrimmedGeneral || 0) > 0
          ? Math.round(Number(r.overallAvgTrimmedGeneral || r.peerAvgTrimmedGeneral || 0) * 100) / 100
          : null,
      trimEligible: r.peerTrimEligible === true,
      trimGeneralEligible: r.peerTrimGeneralEligible === true,
      peerEvaluatorCount: r.peerEvaluatorCountForTrim ?? 0,
    }))
  }, [results])

  const matrixFullRanking = useMemo(() => {
    if (!matrixStructureReport?.rankings?.length) return []
    return buildMatrixFullRanking(matrixStructureReport.rankings)
  }, [matrixStructureReport?.rankings])

  const departmentRankingGroups = useMemo(() => {
    if (matrixStructureReport?.rankings?.length) {
      return buildDepartmentRankingFromMatrixStructure(matrixStructureReport.rankings)
    }
    return { tiers: [], allRows: [] as import('@/lib/admin-department-ranking').DepartmentRankingRow[] }
  }, [matrixStructureReport?.rankings])

  const departmentGenelOkulYasamRankingGroups = useMemo(
    () =>
      buildDepartmentRankingGroups(results, {
        include: (r) => Number(r.genelOkulYasamCombinedAvg || 0) > 0,
        departmentOf: (r) => normalizeResultDepartment(r.targetDept),
        personNameOf: (r) => r.targetName,
        scoreOf: (r) => Number(r.genelOkulYasamCombinedAvg || 0),
      }),
    [results]
  )

  const matrixDepartmentPeopleRanking = useMemo(() => {
    if (!matrixStructureReport?.rankings?.length) return []
    return buildMatrixDepartmentPeopleRankingGroups(matrixStructureReport.rankings)
  }, [matrixStructureReport?.rankings])

  const performanceDistributionUsesMatrix =
    selectedPeriodAssessment?.kind === 'job_evaluation' &&
    (matrixStructureReport?.rankings?.length ?? 0) > 0

  const performanceDistributionReport = useMemo(() => {
    if (performanceDistributionUsesMatrix) {
      return buildMatrixPerformanceDistributionReport(matrixStructureReport!.rankings)
    }
    return buildLegacyPerformanceDistributionReport(results)
  }, [performanceDistributionUsesMatrix, matrixStructureReport?.rankings, results])

  const performanceDistribution = performanceDistributionReport.stats
  const calibrationByDepartment = performanceDistributionReport.calibrationByDepartment
  const performanceOverallDistribution = performanceDistributionReport.overallDistribution

  const evaluatorLevelById = useMemo(() => buildEvaluatorLevelMap(results), [results])

  const managerEffectivenessUsesMatrix =
    selectedPeriodAssessment?.kind === 'job_evaluation' &&
    (matrixStructureReport?.rankings?.length ?? 0) > 0

  const managerEffectiveness = useMemo(() => {
    if (managerEffectivenessUsesMatrix) {
      return buildMatrixManagerEffectivenessReport(
        matrixStructureReport!.rankings,
        evaluatorLevelById
      )
    }
    return buildLegacyManagerEffectivenessReport(results)
  }, [
    managerEffectivenessUsesMatrix,
    matrixStructureReport?.rankings,
    evaluatorLevelById,
    results,
  ])

  const evaluatorPeerCalibrationUsesMatrix =
    selectedPeriodAssessment?.kind === 'job_evaluation' &&
    (matrixStructureReport?.rankings?.length ?? 0) > 0

  const evaluatorCalibrationLines = useMemo(() => {
    if (evaluatorPeerCalibrationUsesMatrix) {
      return buildMatrixEvaluatorCalibrationLines(
        matrixStructureReport!.rankings,
        evaluatorLevelById
      )
    }
    return buildLegacyEvaluatorCalibrationLines(results)
  }, [evaluatorPeerCalibrationUsesMatrix, matrixStructureReport?.rankings, evaluatorLevelById, results])

  const evaluatorPeerCalibrationReport = useMemo(
    () =>
      buildEvaluatorPeerCalibrationReport(evaluatorCalibrationLines, {
        levelFilter: evaluatorCalLevel,
        minTargets: evaluatorCalMinTargets,
      }),
    [evaluatorCalibrationLines, evaluatorCalLevel, evaluatorCalMinTargets]
  )

  const evaluatorPeerCalibration = evaluatorPeerCalibrationReport.rows
  const peerCalibrationContext = {
    lineCount: evaluatorPeerCalibrationReport.lineCount,
    cohortPeerAvg: evaluatorPeerCalibrationReport.cohortPeerAvg,
  }

  /** Aynı değerlendirme türünde (iş / kişisel gelişim) önceki dönem — türler karıştırılmaz */
  const periodComparisonMeta = useMemo(() => {
    if (!selectedPeriod || !selectedPeriodAssessment) return null
    const kind = selectedPeriodAssessment.kind
    const sameKindPeriodCount = countPeriodsByAssessmentKind(periods, kind)
    const previousPeriod = findPreviousPeriodSameKind(periods, selectedPeriod)
    return {
      assessmentKind: kind,
      assessmentLabel: selectedPeriodAssessment.label,
      sameKindPeriodCount,
      canCompare: sameKindPeriodCount >= 2 && !!previousPeriod,
      previousPeriod,
    }
  }, [periods, selectedPeriod, selectedPeriodAssessment])

  const periodComparisonTrend = useMemo(() => {
    if (selectedPeriodAssessment?.kind === 'job_evaluation') {
      return buildMatrixPeriodComparisonTrend(
        matrixStructureReport?.rankings || [],
        prevMatrixStructureReport?.rankings || []
      )
    }
    return buildPeriodComparisonTrendFromResults(results, prevResults)
  }, [
    selectedPeriodAssessment?.kind,
    matrixStructureReport?.rankings,
    prevMatrixStructureReport?.rankings,
    results,
    prevResults,
  ])

  /** Kategori bazında en iyi / en düşük kişiler — iş döneminde MATRIX, kişisel gelişimde legacy */
  const categorySpotlight = useMemo(() => {
    if (isJobEvaluationPeriod && matrixStructureReport?.rankings?.length) {
      const blocks = buildMatrixCategoryPeerHighlights(
        matrixStructureReport.rankings,
        matrixStructureReport.categoryLabels
      )
      if (blocks.length) {
        return { blocks, usesMatrixScoring: true }
      }
    }
    return {
      blocks: buildLegacyCategoryPeerHighlightsFromResults(results),
      usesMatrixScoring: false,
    }
  }, [isJobEvaluationPeriod, matrixStructureReport?.rankings, matrixStructureReport?.categoryLabels, results])

  const categoryPeerHighlights = categorySpotlight.blocks
  const categorySpotlightUsesMatrix = categorySpotlight.usesMatrixScoring
  

  const riskScorecardUsesMatrix =
    selectedPeriodAssessment?.kind === 'job_evaluation' &&
    (matrixStructureReport?.rankings?.length ?? 0) > 0

  const riskScorecard = useMemo(() => {
    if (riskScorecardUsesMatrix) {
      return buildMatrixRiskScorecard(
        matrixStructureReport!.rankings,
        prevMatrixStructureReport?.rankings || [],
        results,
        {
          riskOverall: analyticsWeights.riskOverall,
          riskTrend: analyticsWeights.riskTrend,
          riskGap: analyticsWeights.riskGap,
          riskCoverage: analyticsWeights.riskCoverage,
          warningLowScoreThreshold: analyticsWeights.warningLowScoreThreshold,
        }
      )
    }

    const prevByTarget = new Map<string, number>()
    prevResults.forEach((r) => prevByTarget.set(String(r.targetId), Number(r.overallAvg || 0)))
    const prevByTargetTrim = new Map<string, number>()
    prevResults.forEach((r) => prevByTargetTrim.set(String(r.targetId), Number(r.overallAvgTrimmed || r.peerAvgTrimmed || 0)))
    const prevCombinedByTarget = new Map<string, number>()
    prevResults.forEach((r) =>
      prevCombinedByTarget.set(String(r.targetId), Number(r.genelOkulYasamCombinedAvg || 0))
    )
    const prevCombinedTrimByTarget = new Map<string, number>()
    prevResults.forEach((r) =>
      prevCombinedTrimByTarget.set(String(r.targetId), Number(r.genelOkulYasamCombinedTrimmed || 0))
    )

    const buildRiskParts = (overall: number, overallTrim: number, prev?: number, prevTrim?: number) => {
      const lowScoreRisk = clamp01((3.5 - overall) / 2.5)
      const lowScoreRiskTrim = clamp01((3.5 - overallTrim) / 2.5)
      const delta = prev === undefined ? 0 : Number((overall - prev).toFixed(2))
      const trendRisk = prev === undefined ? 0.5 : clamp01((0 - delta) / 1.2)
      const deltaTrim = prevTrim === undefined ? 0 : Number((overallTrim - prevTrim).toFixed(2))
      const trendRiskTrim = prevTrim === undefined ? 0.5 : clamp01((0 - deltaTrim) / 1.2)
      return { lowScoreRisk, lowScoreRiskTrim, delta, trendRisk, deltaTrim, trendRiskTrim }
    }

    const rows = results.map((r) => {
      const overall = Number(r.overallAvg || 0)
      const overallTrim = Number(r.overallAvgTrimmed || r.peerAvgTrimmed || 0)
      const combinedOverall = Number(r.genelOkulYasamCombinedAvg || 0)
      const combinedOverallTrim = Number(r.genelOkulYasamCombinedTrimmed || 0)
      const hasCombined = combinedOverall > 0

      const genelParts = buildRiskParts(
        overall,
        overallTrim,
        prevByTarget.get(String(r.targetId)),
        prevByTargetTrim.get(String(r.targetId))
      )
      const combinedParts = hasCombined
        ? buildRiskParts(
            combinedOverall,
            combinedOverallTrim,
            prevCombinedByTarget.get(String(r.targetId)),
            prevCombinedTrimByTarget.get(String(r.targetId))
          )
        : null

      const peerGaps = (r.categoryCompare || [])
        .map((c) => Math.abs(Number(c?.diff || 0)))
        .filter((n) => Number.isFinite(n))
      const avgGap = peerGaps.length ? peerGaps.reduce((a, b) => a + b, 0) / peerGaps.length : 0
      const gapRisk = clamp01(avgGap / 1.5)

      const peerEvalCount = (r.evaluations || []).filter((e) => !e.isSelf && Number(e.avgScore || 0) > 0).length
      const coverageRisk = clamp01((4 - Math.min(4, peerEvalCount)) / 4)

      const weighted = normalizeWeights(analyticsWeights)
      const scoreFromParts = (parts: ReturnType<typeof buildRiskParts>, lowKey: 'lowScoreRisk' | 'lowScoreRiskTrim', trendKey: 'trendRisk' | 'trendRiskTrim') =>
        Math.round(
          100 *
            (weighted.riskOverall * parts[lowKey] +
              weighted.riskTrend * parts[trendKey] +
              weighted.riskGap * gapRisk +
              weighted.riskCoverage * coverageRisk)
        )

      const riskScore = scoreFromParts(genelParts, 'lowScoreRisk', 'trendRisk')
      const riskScoreTrim = scoreFromParts(genelParts, 'lowScoreRiskTrim', 'trendRiskTrim')
      const riskScoreCombined = combinedParts ? scoreFromParts(combinedParts, 'lowScoreRisk', 'trendRisk') : null
      const riskScoreCombinedTrim = combinedParts
        ? scoreFromParts(combinedParts, 'lowScoreRiskTrim', 'trendRiskTrim')
        : null

      return {
        targetId: r.targetId,
        name: r.targetName,
        dept: r.targetDept,
        overall: Math.round(overall * 100) / 100,
        overallTrim: Math.round(overallTrim * 100) / 100,
        combinedOverall: hasCombined ? Math.round(combinedOverall * 100) / 100 : null,
        combinedOverallTrim:
          hasCombined && combinedOverallTrim > 0 ? Math.round(combinedOverallTrim * 100) / 100 : null,
        hasCombined,
        delta: genelParts.delta,
        deltaTrim: genelParts.deltaTrim,
        deltaCombined: combinedParts?.delta ?? null,
        deltaCombinedTrim: combinedParts?.deltaTrim ?? null,
        avgGap: Math.round(avgGap * 100) / 100,
        peerEvalCount,
        riskScore,
        riskScoreTrim,
        riskScoreCombined,
        riskScoreCombinedTrim,
        explain: {
          lowScore: Math.round(genelParts.lowScoreRisk * 100),
          trend: Math.round(genelParts.trendRisk * 100),
          gap: Math.round(gapRisk * 100),
          coverage: Math.round(coverageRisk * 100),
        },
        explainTrim: {
          lowScore: Math.round(genelParts.lowScoreRiskTrim * 100),
          trend: Math.round(genelParts.trendRiskTrim * 100),
          gap: Math.round(gapRisk * 100),
          coverage: Math.round(coverageRisk * 100),
        },
        explainCombined: combinedParts
          ? {
              lowScore: Math.round(combinedParts.lowScoreRisk * 100),
              trend: Math.round(combinedParts.trendRisk * 100),
              gap: Math.round(gapRisk * 100),
              coverage: Math.round(coverageRisk * 100),
            }
          : null,
        explainCombinedTrim: combinedParts
          ? {
              lowScore: Math.round(combinedParts.lowScoreRiskTrim * 100),
              trend: Math.round(combinedParts.trendRiskTrim * 100),
              gap: Math.round(gapRisk * 100),
              coverage: Math.round(coverageRisk * 100),
            }
          : null,
      }
    })

    rows.sort((a, b) => b.riskScore - a.riskScore)
    return rows
  }, [
    riskScorecardUsesMatrix,
    matrixStructureReport?.rankings,
    prevMatrixStructureReport?.rankings,
    results,
    prevResults,
    analyticsWeights,
  ])

  const organizationHealth = useMemo(() => {
    if (riskScorecardUsesMatrix && matrixStructureReport?.rankings?.length) {
      return buildMatrixOrganizationHealth(
        matrixStructureReport.rankings,
        participation,
        coverage,
        periodComparisonTrend.deptMoves,
        {
          healthPerformance: analyticsWeights.healthPerformance,
          healthParticipation: analyticsWeights.healthParticipation,
          healthCoverage: analyticsWeights.healthCoverage,
          healthTrend: analyticsWeights.healthTrend,
        }
      )
    }

    if (!results.length) {
      return { score: 0, parts: { performance: 0, participation: 0, coverage: 0, trend: 0 }, usesMatrixScoring: false }
    }

    const avgOverall = results.reduce((s, r) => s + Number(r.overallAvg || 0), 0) / results.length
    const perfScore = clamp01(avgOverall / 5)

    const participationRate = participation?.totals?.total
      ? Number(participation.totals.completed || 0) / Number(participation.totals.total || 1)
      : 0.75

    const coverageRows = coverage || []
    const coverageScore = coverageRows.length
      ? coverageRows.reduce((acc, r) => {
          const nonSelf = Number(r.managerCompleted || 0) + Number(r.peerCompleted || 0) + Number(r.subordinateCompleted || 0) + Number(r.executiveCompleted || 0)
          return acc + clamp01(nonSelf / 5)
        }, 0) / coverageRows.length
      : 0.7

    const trendRows = periodComparisonTrend.deptMoves
    const trendScore = trendRows.length
      ? trendRows.reduce((acc, r) => acc + clamp01((r.delta + 1) / 2), 0) / trendRows.length
      : 0.6

    const w = normalizeWeights(analyticsWeights)
    const overall = Math.round(100 * (
      w.healthPerformance * perfScore +
      w.healthParticipation * participationRate +
      w.healthCoverage * coverageScore +
      w.healthTrend * trendScore
    ))

    return {
      score: overall,
      parts: {
        performance: Math.round(perfScore * 100),
        participation: Math.round(participationRate * 100),
        coverage: Math.round(coverageScore * 100),
        trend: Math.round(trendScore * 100),
      },
      usesMatrixScoring: false,
    }
  }, [
    riskScorecardUsesMatrix,
    matrixStructureReport?.rankings,
    results,
    participation,
    coverage,
    periodComparisonTrend.deptMoves,
    analyticsWeights,
  ])

  const earlyWarningsReport = useMemo(
    () =>
      buildEarlyWarningsReport(
        riskScorecard,
        periodComparisonTrend,
        organizationHealth,
        {
          warningDropThreshold: analyticsWeights.warningDropThreshold,
          warningLowScoreThreshold: analyticsWeights.warningLowScoreThreshold,
        },
        lang,
        riskScorecardUsesMatrix
      ),
    [
      riskScorecard,
      periodComparisonTrend,
      organizationHealth,
      analyticsWeights.warningDropThreshold,
      analyticsWeights.warningLowScoreThreshold,
      lang,
      riskScorecardUsesMatrix,
    ]
  )

  const earlyWarnings = earlyWarningsReport.warnings
  const warningRules = earlyWarningsReport.rules
  const earlyWarningsUsesMatrix = earlyWarningsReport.usesMatrixScoring

  const departmentAnalytics = useMemo(() => {
    const usesMatrix =
      selectedPeriodAssessment?.kind === 'job_evaluation' &&
      (matrixStructureReport?.rankings?.length ?? 0) > 0

    const scorecard = usesMatrix
      ? buildMatrixRiskScorecard(
          matrixStructureReport!.rankings,
          prevMatrixStructureReport?.rankings || [],
          results,
          {
            riskOverall: analyticsWeights.riskOverall,
            riskTrend: analyticsWeights.riskTrend,
            riskGap: analyticsWeights.riskGap,
            riskCoverage: analyticsWeights.riskCoverage,
            warningLowScoreThreshold: analyticsWeights.warningLowScoreThreshold,
          }
        ).map((r) => ({
          dept: r.dept,
          overall: r.overall,
          riskScore: r.riskScore,
        }))
      : riskScorecard.map((r) => ({
          dept: String(r.dept || '-').trim() || '-',
          overall: Number(r.overall || 0),
          riskScore: Number(r.riskScore || 0),
        }))

    return buildDepartmentAnalyticsReport(
      scorecard,
      periodComparisonTrend.deptMoves,
      analyticsWeights.warningLowScoreThreshold,
      usesMatrix
    )
  }, [
    selectedPeriodAssessment?.kind,
    matrixStructureReport?.rankings,
    prevMatrixStructureReport?.rankings,
    results,
    riskScorecard,
    periodComparisonTrend.deptMoves,
    analyticsWeights,
  ])

  const printPerson = (targetId: string) => {
    const el = document.getElementById(`admin-report-${targetId}`)
    if (!el) return
    const row = results.find((r) => String(r.targetId) === String(targetId))
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    const namePlain = row?.targetName?.trim() || ''
    const titleText = namePlain ? `VISIO 360° — ${namePlain.slice(0, 120)}` : 'VISIO 360° Rapor'
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>${escapeHtmlForPrint(titleText)}</title>`)
    w.document.write('<style>')
    w.document.write('body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:24px;color:#111;line-height:1.4}')
    w.document.write('h1{margin:0 0 8px 0;font-size:20px}')
    w.document.write('.print-identity{margin:0 0 16px 0;padding:12px 16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;line-height:1.6}')
    w.document.write('.print-identity div{margin:2px 0}')
    w.document.write('.print-identity strong{display:inline-block;min-width:150px;color:#374151;font-weight:600}')
    w.document.write('p.meta{margin:0 0 24px 0;color:#666;font-size:12px}')
    w.document.write('table{width:100%;border-collapse:collapse;margin:16px 0 24px 0}')
    w.document.write('th,td{border:1px solid #e5e7eb;padding:10px;text-align:left;font-size:12px}')
    w.document.write('th{background:#f9fafb}')
    w.document.write('.badge{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid #e5e7eb;font-size:11px;color:#111}')
    w.document.write('.print-report-body>*{margin-bottom:28px;page-break-inside:avoid}')
    w.document.write('.print-report-body table{margin:16px 0 24px 0}')
    w.document.write('@media print{body{padding:16px}.print-report-body>*{margin-bottom:24px}button{display:none!important}}')
    w.document.write('</style></head><body>')
    w.document.write(`<h1>VISIO 360° Performans Değerlendirme Raporu</h1>`)
    w.document.write('<div class="print-identity">')
    w.document.write(`<div><strong>Değerlendirilen</strong> ${escapeHtmlForPrint(row?.targetName || '—')}</div>`)
    w.document.write(`<div><strong>Birim / Departman</strong> ${escapeHtmlForPrint(row?.targetDept || '—')}</div>`)
    w.document.write(`<div><strong>Dönem</strong> ${escapeHtmlForPrint(periodLabel || '—')}</div>`)
    w.document.write('</div>')
    w.document.write(`<p class="meta">Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}</p>`)
    w.document.write('<div class="print-report-body">')
    w.document.write(el.innerHTML)
    w.document.write('</div>')
    w.document.write('</body></html>')
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  const loadReportsMaintenance = useCallback(async () => {
    setMaintenanceLoading(true)
    try {
      const resp = await fetch('/api/admin/platform-settings', { credentials: 'include', cache: 'no-store' })
      const payload = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        admin_reports_maintenance?: boolean
        org_visible_report_ids?: string[] | null
        admin_reports_catalog_config?: ReportCatalogConfig
      }
      if (resp.ok && payload.success) {
        setReportsMaintenance(Boolean(payload.admin_reports_maintenance))
        setOrgVisibleReportIds(
          Array.isArray(payload.org_visible_report_ids) ? payload.org_visible_report_ids : null
        )
        if (payload.admin_reports_catalog_config) {
          setReportCatalogConfig(payload.admin_reports_catalog_config)
        }
      }
    } catch {
      setReportsMaintenance(false)
    } finally {
      setMaintenanceLoading(false)
    }
  }, [])

  const toggleReportsMaintenance = useCallback(
    async (next: boolean) => {
      const confirmMsg = next
        ? lang === 'en'
          ? 'Enable maintenance mode? Org admins will not see admin reports until you turn this off. Employee self-results are not affected (use Periods → Release results).'
          : lang === 'fr'
            ? 'Activer la maintenance ? Les admins org. ne verront plus les rapports admin. Les résultats employés ne sont pas affectés (Périodes → Publier).'
            : 'Bakım modu açılsın mı? Kurum adminleri admin raporlarını göremeyecek. Çalışanların kendi sonuçları etkilenmez (Dönemler → Sonuçları yayınla).'
        : lang === 'en'
          ? 'Disable maintenance mode and restore admin report access for org admins?'
          : lang === 'fr'
            ? 'Désactiver la maintenance et rétablir l’accès aux rapports admin pour les admins org. ?'
            : 'Bakım modu kapatılsın mı? Kurum adminleri admin raporlarını tekrar görebilecek.'
      if (!window.confirm(confirmMsg)) return

      setMaintenanceSaving(true)
      try {
        const resp = await fetch('/api/admin/platform-settings', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_reports_maintenance: next }),
        })
        const payload = (await resp.json().catch(() => ({}))) as {
          success?: boolean
          admin_reports_maintenance?: boolean
          error?: string
        }
        if (!resp.ok || !payload.success) {
          throw new Error(payload.error || 'Kaydedilemedi')
        }
        setReportsMaintenance(Boolean(payload.admin_reports_maintenance))
        toast(
          next
            ? lang === 'en'
              ? 'Maintenance mode enabled'
              : lang === 'fr'
                ? 'Mode maintenance activé'
                : 'Bakım modu açıldı'
            : lang === 'en'
              ? 'Maintenance mode disabled'
              : lang === 'fr'
                ? 'Mode maintenance désactivé'
                : 'Bakım modu kapatıldı',
          'success'
        )
      } catch (e: unknown) {
        toast(e instanceof Error ? e.message : 'Hata', 'error')
      } finally {
        setMaintenanceSaving(false)
      }
    },
    [lang]
  )

  const saveOrgReportsVisibility = useCallback(
    async (enabledIds: string[]) => {
      setVisibilitySaving(true)
      try {
        const resp = await fetch('/api/admin/platform-settings', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_visible_report_ids: enabledIds }),
        })
        const payload = (await resp.json().catch(() => ({}))) as {
          success?: boolean
          org_visible_report_ids?: string[] | null
          error?: string
        }
        if (!resp.ok || !payload.success) {
          throw new Error(payload.error || 'Kaydedilemedi')
        }
        setOrgVisibleReportIds(
          Array.isArray(payload.org_visible_report_ids) ? payload.org_visible_report_ids : enabledIds
        )
        toast(t('adminReportsVisibilitySaved', lang), 'success')
      } catch (e: unknown) {
        toast(e instanceof Error ? e.message : 'Hata', 'error')
      } finally {
        setVisibilitySaving(false)
      }
    },
    [lang]
  )

  const saveReportCatalogConfig = useCallback(
    async (config: ReportCatalogConfig) => {
      setCatalogSaving(true)
      try {
        const resp = await fetch('/api/admin/platform-settings', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_reports_catalog_config: config }),
        })
        const payload = (await resp.json().catch(() => ({}))) as {
          success?: boolean
          admin_reports_catalog_config?: ReportCatalogConfig
          error?: string
        }
        if (!resp.ok || !payload.success) {
          throw new Error(payload.error || 'Kaydedilemedi')
        }
        if (payload.admin_reports_catalog_config) {
          setReportCatalogConfig(payload.admin_reports_catalog_config)
        } else {
          setReportCatalogConfig(config)
        }
        toast(t('adminReportsCatalogSaved', lang), 'success')
      } catch (e: unknown) {
        toast(e instanceof Error ? e.message : 'Hata', 'error')
      } finally {
        setCatalogSaving(false)
      }
    },
    [lang]
  )

  useEffect(() => {
    if (!user?.id) return
    void loadReportsMaintenance()
  }, [user?.id, loadReportsMaintenance])

  const loadOrgScopedData = useCallback(async (orgId: string) => {
    try {
      const qs = new URLSearchParams({ org_id: String(orgId || '') })
      const resp = await fetch(`/api/admin/matrix-data?${qs.toString()}`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Kurum verisi alınamadı')

      const profile = String(payload.matrix_profile || 'school_full')
      setMatrixProfileId(profile === 'standard_360' ? 'standard_360' : 'school_full')
      setPeriods(
        ((payload.periods || []) as any[]).map((p) => ({
          id: String(p.id),
          name: periodName(p),
          assessmentKind: String(p.assessment_kind || 'development_360'),
        }))
      )
      setUsers(((payload.users || []) as any[]).map((u) => ({ id: String(u.id), name: String(u.name || ''), department: (u as any)?.department ?? null })))
      setDepartments(Array.isArray(payload.departments) ? payload.departments.map((d: any) => String(d)) : [])
    } catch (e: any) {
      // Navigation away / tab change can abort fetch; don't show noisy errors.
      const msg = String(e?.message || '')
      if (e?.name === 'AbortError' || msg.toLowerCase().includes('aborted')) return
      toast(msg || 'Kurum verisi alınamadı', 'error')
    }
  }, [periodName])

  const loadInitialData = useCallback(async () => {
    try {
      // KVKK: Do not expose cross-org organization list on the client for org_admin users.
      // Always fetch org list server-side (session-aware).
      const orgResp = await fetch('/api/admin/orgs', { method: 'GET' })
      const orgPayload = (await orgResp.json().catch(() => ({}))) as any
      if (!orgResp.ok || !orgPayload?.success) throw new Error(orgPayload?.error || 'Kurumlar alınamadı')
      const orgs = (orgPayload.organizations || []) as Array<{ id: string; name: string }>
      setOrganizations(orgs)

      // Keep selection consistent with user's fixed org context (org_admin) or layout selection (super_admin).
      const fixedOrg = String(userOrgId || '').trim()
      if (userRole === 'org_admin' && fixedOrg) {
        setSelectedOrg(fixedOrg)
      } else if (organizationId && !selectedOrg) {
        setSelectedOrg(organizationId)
      }

      const orgToUse = (userRole === 'org_admin' ? fixedOrg : (selectedOrg || organizationId)) || ''
      if (orgToUse) await loadOrgScopedData(orgToUse)
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (e?.name === 'AbortError' || msg.toLowerCase().includes('aborted')) return
      toast(msg || 'Veri alınamadı', 'error')
    }
  }, [loadOrgScopedData, organizationId, selectedOrg, userOrgId, userRole])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  useEffect(() => {
    // Org scoped data (periods + users) should follow selected org.
    const orgToUse = selectedOrg || organizationId
    if (!orgToUse) {
      setPeriods([])
      setUsers([])
      return
    }
    loadOrgScopedData(orgToUse)
  }, [selectedOrg, organizationId, loadOrgScopedData])

  const loadResults = async (opts?: { includePeerDetail?: boolean }) => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }

    const includePeer = opts?.includePeerDetail !== undefined ? opts.includePeerDetail : showPeerDetail

    const bodyBase = {
      org_id: orgToUse,
      person_id: selectedPerson || null,
      department: selectedDept || null,
      include_peer_detail: includePeer,
    }

    setLoading(true)
    try {
      const prevPeriodId = findPreviousPeriodSameKind(periods, selectedPeriod)?.id || null
      const loadMatrixReports =
        isJobEvaluationReportScope(
          periods.find((p) => String(p.id) === String(selectedPeriod))?.assessmentKind
        ) && matrixProfileId === 'school_full'

      const fetchResults = (period_id: string) =>
        fetch(`/api/admin/results?lang=${encodeURIComponent(lang)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...bodyBase, period_id }),
        }).then(async (resp) => {
          const payload = (await resp.json().catch(() => ({}))) as any
          return { resp, payload }
        })

      const fetchMatrixStructureReport = (period_id: string) =>
        fetch(`/api/admin/matrix-structure-report?lang=${encodeURIComponent(lang)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period_id,
            org_id: orgToUse,
            department: selectedDept || null,
          }),
        }).then(async (resp) => {
          const payload = (await resp.json().catch(() => ({}))) as MatrixStructureReportPayload & {
            success?: boolean
            error?: string
          }
          return { resp, payload }
        })

      const fetchMatrixPersonResultsReport = (period_id: string) =>
        fetch(`/api/admin/matrix-person-results-report?lang=${encodeURIComponent(lang)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            period_id,
            org_id: orgToUse,
            department: selectedDept || null,
          }),
        }).then(async (resp) => {
          const payload = (await resp.json().catch(() => ({}))) as MatrixPersonResultsReportPayload & {
            success?: boolean
            error?: string
          }
          return { resp, payload }
        })

      // KVKK: results are now fetched server-side (service role) so we can apply strict RLS on evaluation tables.
      const [main, prev, matrixMain, matrixPrev, matrixPersonMain] = await Promise.all([
        fetchResults(selectedPeriod),
        prevPeriodId ? fetchResults(prevPeriodId) : Promise.resolve({ resp: null as any, payload: null as any }),
        loadMatrixReports
          ? fetchMatrixStructureReport(selectedPeriod)
          : Promise.resolve({ resp: null as any, payload: null as any }),
        loadMatrixReports && prevPeriodId
          ? fetchMatrixStructureReport(prevPeriodId)
          : Promise.resolve({ resp: null as any, payload: null as any }),
        loadMatrixReports
          ? fetchMatrixPersonResultsReport(selectedPeriod)
          : Promise.resolve({ resp: null as any, payload: null as any }),
      ])

      if (!main.resp.ok || !main.payload?.success) {
        throw new Error(main.payload?.error || 'Rapor alınamadı')
      }
      const rows = (main.payload.results || []) as ResultData[]
      setResults(rows)
      setQuestionTexts((main.payload.questionTexts || {}) as Record<string, string>)
      setPeerEvaluatorsVisible(main.payload.peerEvaluatorsVisible === true)
      setExpandedPerson(rows[0]?.targetId || null)
      setParticipation(null)
      setNoOpinionReport(null)
      setMatrixStructureReport(null)
      setMatrixPersonResultsReport(null)
      setPrevMatrixStructureReport(null)
      if (matrixMain?.resp?.ok && matrixMain.payload?.success !== false && matrixMain.payload?.periodSummary) {
        setMatrixStructureReport({
          periodSummary: matrixMain.payload.periodSummary,
          unscoredTargets: matrixMain.payload.unscoredTargets || [],
          categoryLabels: matrixMain.payload.categoryLabels || [],
          rankings: matrixMain.payload.rankings || [],
        })
      }
      if (matrixPrev?.resp?.ok && matrixPrev.payload?.success !== false && matrixPrev.payload?.periodSummary) {
        setPrevMatrixStructureReport({
          periodSummary: matrixPrev.payload.periodSummary,
          unscoredTargets: matrixPrev.payload.unscoredTargets || [],
          categoryLabels: matrixPrev.payload.categoryLabels || [],
          rankings: matrixPrev.payload.rankings || [],
        })
      }
      if (matrixPersonMain?.resp?.ok && matrixPersonMain.payload?.success !== false && Array.isArray(matrixPersonMain.payload?.people)) {
        setMatrixPersonResultsReport({
          categoryLabels: matrixPersonMain.payload.categoryLabels || [],
          dutyContextOrder: matrixPersonMain.payload.dutyContextOrder || [],
          people: matrixPersonMain.payload.people || [],
        })
      }
      setSelectedReportSection('summary')

      if (prevPeriodId && prev?.payload) {
        if (prev.resp.ok && prev.payload?.success) {
          setPrevResults((prev.payload.results || []) as ResultData[])
        } else {
          setPrevResults([])
        }
      } else {
        setPrevResults([])
      }
      return

      /*
      Legacy client-side results computation (disabled for KVKK/RLS hardening).
      Kept temporarily for reference.
      
      // Tamamlanmış atamaları getir
      const assignQuery = supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(id, name, department, organization_id, position_level),
          target:target_id(id, name, department, organization_id)
        `)
        .eq('period_id', selectedPeriod)
        .eq('status', 'completed')

      const { data: assignments } = await assignQuery

      if (!assignments || assignments.length === 0) {
        setResults([])
        toast('Tamamlanmış değerlendirme bulunamadı', 'info')
        setLoading(false)
        return
      }

      // Tüm yanıtları getir
      const assignmentIds = assignments.map(a => a.id)
      const { data: responses } = await supabase
        .from('evaluation_responses')
        .select('*')
        .in('assignment_id', assignmentIds)

      // Uluslararası standart skorları (opsiyonel)
      type StdScoreRow = {
        assignment_id: string
        score: number
        standard?: { title?: string | null; code?: string | null } | null
      }
      const { data: stdScores } = await supabase
        .from('international_standard_scores')
        .select('assignment_id, score, standard:standard_id(title,code)')
        .in('assignment_id', assignmentIds)

      // Katsayılar (org override varsa onu kullan, yoksa default org=null)
      const evaluatorWeightByLevel: Record<string, number> = {}
      const categoryWeightByName: Record<string, number> = {}

      const pickLatestBy = (rows: any[] | null | undefined, key: string) => {
        const out = new Map<string, any>()
        ;(rows || []).forEach((r) => {
          const k = String(r?.[key] ?? '')
          if (!k) return
          if (!out.has(k)) out.set(k, r)
        })
        return out
      }

      const [orgEval, defEval, orgCatW, defCatW] = await Promise.all([
        supabase.from('evaluator_weights').select('position_level,weight').eq('organization_id', orgToUse).order('created_at', { ascending: false }),
        supabase.from('evaluator_weights').select('position_level,weight').is('organization_id', null).order('created_at', { ascending: false }),
        supabase.from('category_weights').select('category_name,weight').eq('organization_id', orgToUse),
        supabase.from('category_weights').select('category_name,weight').is('organization_id', null),
      ])

      // Güven + Sapma ayarları (defaultlar Word'e göre)
      let confidenceMinHigh = 5
      let deviation = {
        lenient_diff_threshold: 0.75,
        harsh_diff_threshold: 0.75,
        lenient_multiplier: 0.85,
        harsh_multiplier: 1.15,
      }

      const [conf, dev] = await Promise.all([
        supabase.from('confidence_settings').select('min_high_confidence_evaluator_count').eq('organization_id', orgToUse).maybeSingle(),
        supabase.from('deviation_settings').select('lenient_diff_threshold,harsh_diff_threshold,lenient_multiplier,harsh_multiplier').eq('organization_id', orgToUse).maybeSingle(),
      ])

      if (!conf.error && conf.data) {
        confidenceMinHigh = Number((conf.data as any).min_high_confidence_evaluator_count ?? 5) || 5
      }
      if (!dev.error && dev.data) {
        deviation = {
          lenient_diff_threshold: Number((dev.data as any).lenient_diff_threshold ?? 0.75),
          harsh_diff_threshold: Number((dev.data as any).harsh_diff_threshold ?? 0.75),
          lenient_multiplier: Number((dev.data as any).lenient_multiplier ?? 0.85),
          harsh_multiplier: Number((dev.data as any).harsh_multiplier ?? 1.15),
        }
      }

      const orgEvalMap = pickLatestBy(orgEval.data as any[], 'position_level')
      const defEvalMap = pickLatestBy(defEval.data as any[], 'position_level')
      new Set<string>([...defEvalMap.keys(), ...orgEvalMap.keys()]).forEach((lvl) => {
        const row = orgEvalMap.get(lvl) || defEvalMap.get(lvl)
        evaluatorWeightByLevel[lvl] = Number(row?.weight ?? 1)
      })
      if (!evaluatorWeightByLevel.self) evaluatorWeightByLevel.self = 1

      const orgCatMap = new Map<string, any>(((orgCatW.data || []) as any[]).map((r) => [String(r.category_name), r]))
      const defCatMap = new Map<string, any>(((defCatW.data || []) as any[]).map((r) => [String(r.category_name), r]))
      new Set<string>([...defCatMap.keys(), ...orgCatMap.keys()]).forEach((name) => {
        const row = orgCatMap.get(name) || defCatMap.get(name)
        categoryWeightByName[name] = Number(row?.weight ?? 1)
      })

      const weightForEval = (e: { isSelf: boolean; evaluatorLevel?: string }) => {
        const k = e.isSelf ? 'self' : (e.evaluatorLevel || 'peer')
        return Number(evaluatorWeightByLevel[k] ?? 1)
      }

      const weightedAvg = (rows: Array<{ w: number; v: number }>) => {
        const sumW = rows.reduce((s, r) => s + (r.w || 0), 0)
        if (!sumW) return 0
        return rows.reduce((s, r) => s + (r.v || 0) * (r.w || 0), 0) / sumW
      }

      // Kişi bazlı grupla
      const resultMap: Record<string, ResultData> = {}

      type AssignmentRow = {
        id: string
        evaluator_id: string
        target_id: string
        evaluator?: { id: string; name: string; department?: string | null; organization_id?: string | null; position_level?: 'executive' | 'manager' | 'peer' | 'subordinate' | null } | null
        target?: { id: string; name: string; department?: string | null; organization_id?: string | null } | null
      }
      type ResponseRow = {
        assignment_id: string
        category_name?: string | null
        reel_score?: number | null
        std_score?: number | null
      }
      const typedAssignments = (assignments || []) as unknown as AssignmentRow[]
      const typedResponses = (responses || []) as unknown as ResponseRow[]
      const typedStdScores = (stdScores || []) as unknown as StdScoreRow[]

      const assignmentToTarget = new Map<string, string>()
      typedAssignments.forEach((a) => assignmentToTarget.set(a.id, a.target_id))

      const stdAggByTarget = new Map<string, { sum: number; count: number }>()
      const stdByTitleByTarget = new Map<string, Map<string, { title: string; code: string | null; sum: number; count: number }>>()

      typedStdScores.forEach((r) => {
        const tid = assignmentToTarget.get(r.assignment_id)
        if (!tid) return
        const s = Number(r.score || 0)
        if (!s) return
        const agg = stdAggByTarget.get(tid) || { sum: 0, count: 0 }
        agg.sum += s
        agg.count += 1
        stdAggByTarget.set(tid, agg)

        const title = String(r.standard?.title || 'Standart').trim()
        const code = (r.standard?.code || null) as string | null
        const key = `${code || ''}||${title}`
        const map = stdByTitleByTarget.get(tid) || new Map()
        const a2 = map.get(key) || { title, code, sum: 0, count: 0 }
        a2.sum += s
        a2.count += 1
        map.set(key, a2)
        stdByTitleByTarget.set(tid, map)
      })

      typedAssignments.forEach((assignment) => {
        const targetId = assignment.target_id
        const targetName = assignment.target?.name || '-'
        const targetDept = assignment.target?.department || '-'
        const evaluatorId = assignment.evaluator_id
        const evaluatorName = assignment.evaluator?.name || '-'
        const isSelf = evaluatorId === targetId

        // Filtre kontrolü
        if (selectedPerson && targetId !== selectedPerson) return
        if (assignment.target?.organization_id !== orgToUse) return

        if (!resultMap[targetId]) {
          resultMap[targetId] = {
            targetId,
            targetName,
            targetDept,
            evaluations: [],
            overallAvg: 0,
            selfScore: 0,
            peerAvg: 0,
            standardAvg: 0,
            standardCount: 0,
            standardByTitle: [],
            categoryCompare: [],
            swot: {
              self: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
              peer: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
            }
          }
        }

        // Bu atamaya ait yanıtları bul
        const assignmentResponses = typedResponses.filter(r => r.assignment_id === assignment.id)
        
        // Kategori bazlı skorları hesapla
        const categoryScores: Record<string, { total: number; count: number }> = {}
        let totalScore = 0
        let totalCount = 0

        assignmentResponses.forEach((resp) => {
          const catName = resp.category_name || 'Genel'
          if (!categoryScores[catName]) {
            categoryScores[catName] = { total: 0, count: 0 }
          }
          categoryScores[catName].total += resp.reel_score || resp.std_score || 0
          categoryScores[catName].count++
          totalScore += resp.reel_score || resp.std_score || 0
          totalCount++
        })

        const categories = Object.entries(categoryScores).map(([name, data]) => ({
          name,
          score: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0
        }))

        // Kategori katsayılarıyla ağırlıklı ortalama (varsayılan weight=1)
        const weighted = categories.reduce(
          (acc, c) => {
            const w = Number(categoryWeightByName[c.name] ?? 1)
            if (!c.score) return acc
            acc.sum += c.score * w
            acc.w += w
            return acc
          },
          { sum: 0, w: 0 }
        )
        const avgScore =
          weighted.w > 0
            ? Math.round((weighted.sum / weighted.w) * 100) / 100
            : totalCount > 0
              ? Math.round((totalScore / totalCount) * 100) / 100
              : 0

        const evaluatorLevel = isSelf ? 'self' : (assignment.evaluator?.position_level || 'peer')

        resultMap[targetId].evaluations.push({
          evaluatorId,
          evaluatorName,
          isSelf,
          evaluatorLevel,
          avgScore,
          categories
        })
      })

      // Standart özetlerini kişi bazına yaz
      stdAggByTarget.forEach((agg, tid) => {
        const r = resultMap[tid]
        if (!r) return
        r.standardCount = agg.count
        r.standardAvg = agg.count ? Math.round((agg.sum / agg.count) * 100) / 100 : 0
      })
      stdByTitleByTarget.forEach((m, tid) => {
        const r = resultMap[tid]
        if (!r) return
        r.standardByTitle = Array.from(m.values())
          .map((x) => ({
            title: x.code ? `${x.code} — ${x.title}` : x.title,
            avg: x.count ? Math.round((x.sum / x.count) * 100) / 100 : 0,
            count: x.count,
          }))
          .sort((a, b) => b.avg - a.avg)
      })

      // Genel ortalamaları hesapla
      Object.values(resultMap).forEach(result => {
        const selfEval = result.evaluations.find(e => e.isSelf)
        const peerEvals = result.evaluations.filter(e => !e.isSelf)
        
        result.selfScore = selfEval?.avgScore || 0
        result.peerAvg = peerEvals.length > 0
          ? Math.round(
              weightedAvg(peerEvals.map((e) => ({ w: weightForEval(e), v: e.avgScore }))) * 10
            ) / 10
          : 0

        // Confidence coefficient (peer count)
        const minHigh = Math.max(1, Math.floor(confidenceMinHigh || 5))
        const peerCount = peerEvals.length
        const confidenceCoeff = Math.min(1, peerCount / minHigh)

        // Deviation correction based on peer mean
        const peerMean = peerEvals.length
          ? peerEvals.reduce((s, e) => s + (e.avgScore || 0), 0) / peerEvals.length
          : 0
        const deviationMult = (e: { isSelf: boolean; avgScore: number }) => {
          if (e.isSelf || !peerEvals.length) return 1
          const diff = (e.avgScore || 0) - peerMean
          if (diff > deviation.lenient_diff_threshold) return deviation.lenient_multiplier
          if (-diff > deviation.harsh_diff_threshold) return deviation.harsh_multiplier
          return 1
        }

        const perfOverall = result.evaluations.length > 0
          ? Math.round(
              weightedAvg(result.evaluations.map((e) => ({ w: weightForEval(e) * deviationMult(e as any), v: e.avgScore }))) * 10
            ) / 10
          : 0

        result.overallAvg = Math.round((perfOverall * confidenceCoeff) * 100) / 100 || result.peerAvg || result.selfScore

        // Kategori bazlı öz vs ekip karşılaştırması + SWOT
        const selfAgg: Record<string, { sum: number; w: number }> = {}
        const peerAgg: Record<string, { sum: number; w: number }> = {}

        result.evaluations.forEach(e => {
          const w = weightForEval(e)
          e.categories.forEach(cat => {
            if (e.isSelf) {
              if (!selfAgg[cat.name]) selfAgg[cat.name] = { sum: 0, w: 0 }
              selfAgg[cat.name].sum += cat.score
              selfAgg[cat.name].w += 1
            } else {
              if (!peerAgg[cat.name]) peerAgg[cat.name] = { sum: 0, w: 0 }
              peerAgg[cat.name].sum += cat.score * w
              peerAgg[cat.name].w += w
            }
          })
        })

        const catNames = new Set([...Object.keys(selfAgg), ...Object.keys(peerAgg)])
        result.categoryCompare = Array.from(catNames).map((name) => {
          const self = selfAgg[name] && selfAgg[name].w ? Math.round((selfAgg[name].sum / selfAgg[name].w) * 100) / 100 : 0
          const peer = peerAgg[name] && peerAgg[name].w ? Math.round((peerAgg[name].sum / peerAgg[name].w) * 100) / 100 : 0
          const diff = Math.round((self - peer) * 100) / 100
          return { name, self, peer, diff }
        }).sort((a, b) => b.peer - a.peer)

        const mkSwot = (items: { name: string; score: number }[]) => {
          const strengths = items.filter(i => i.score >= 3.5).sort((a, b) => b.score - a.score)
          const weaknesses = items.filter(i => i.score > 0 && i.score < 2.5).sort((a, b) => a.score - b.score)
          const opportunities = items.filter(i => i.score >= 2.5 && i.score < 3.5).sort((a, b) => b.score - a.score)
          const recommendations: string[] = []
          if (weaknesses[0]) recommendations.push(`"${weaknesses[0].name}" alanı için eğitim/mentorluk planlanmalı.`)
          if (weaknesses[1]) recommendations.push(`"${weaknesses[1].name}" alanında düzenli pratik/geri bildirim döngüsü oluşturulmalı.`)
          if (!weaknesses.length && opportunities[0]) recommendations.push(`"${opportunities[0].name}" alanı geliştirilebilir (hedef: 3.5+).`)
          return { strengths, weaknesses, opportunities, recommendations }
        }

        const selfItems = result.categoryCompare.map(c => ({ name: c.name, score: c.self }))
        const peerItems = result.categoryCompare.map(c => ({ name: c.name, score: c.peer }))
        result.swot = { self: mkSwot(selfItems), peer: mkSwot(peerItems) }
      })

      // Sonuçları sırala
      const sortedResults = Object.values(resultMap).sort((a, b) => b.overallAvg - a.overallAvg)
      setResults(sortedResults)

      */
    } catch (error) {
      console.error('Results error:', error)
      toast('Sonuçlar yüklenemedi', 'error')
      setPrevResults([])
    } finally {
      setLoading(false)
    }
  }

  const loadParticipation = async () => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }
    try {
      const resp = await fetch('/api/admin/participation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriod, org_id: orgToUse }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Katılım raporu alınamadı')
      setParticipation({
        totals: payload.totals || { total: 0, completed: 0, pending: 0 },
        departments: Array.isArray(payload.departments) ? payload.departments : [],
      })
      setSelectedReportSection('participation')
      setActiveTab('overview')
    } catch (e: any) {
      toast(String(e?.message || 'Katılım raporu alınamadı'), 'error')
    }
  }

  const loadCoverage = async () => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }
    try {
      const resp = await fetch('/api/admin/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriod, org_id: orgToUse }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Kapsama raporu alınamadı')
      setCoverage(Array.isArray(payload.rows) ? payload.rows : [])
      setSelectedReportSection('coverage')
      setActiveTab('overview')
    } catch (e: any) {
      toast(String(e?.message || 'Kapsama raporu alınamadı'), 'error')
    }
  }

  const loadNoOpinionReport = async () => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }
    setLoadingNoOpinionReport(true)
    try {
      const resp = await fetch('/api/admin/no-opinion-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriod, org_id: orgToUse }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        const detail = payload?.detail ? ` (${payload.detail})` : ''
        throw new Error(`${payload?.error || resp.statusText || 'Fikrim yok raporu alınamadı'}${detail}`)
      }
      setNoOpinionReport({
        totals: payload.totals || {
          completedAssignments: 0,
          allNoOpinionCount: 0,
          uniqueEvaluators: 0,
          uniqueTargets: 0,
        },
        rows: Array.isArray(payload.rows) ? payload.rows : [],
      })
      setSelectedReportSection('no_opinion')
      setActiveTab('overview')
      toast(
        lang === 'en'
          ? `No-opinion report loaded (${payload.totals?.allNoOpinionCount ?? 0} rows)`
          : lang === 'fr'
            ? `Rapport chargé (${payload.totals?.allNoOpinionCount ?? 0} lignes)`
            : `Fikrim yok raporu yüklendi (${payload.totals?.allNoOpinionCount ?? 0} kayıt)`,
        'success'
      )
    } catch (e: any) {
      toast(String(e?.message || 'Fikrim yok raporu alınamadı'), 'error')
    } finally {
      setLoadingNoOpinionReport(false)
    }
  }

  const loadPersonQuestionPeerAverages = async () => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }
    if (!selectedPerson) {
      toast(t('personQuestionPeerAveragesSelectPerson', lang), 'error')
      return
    }
    setLoadingPersonQuestionPeerAverages(true)
    try {
      const resp = await fetch(`/api/admin/person-question-peer-averages?lang=${lang}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: selectedPeriod,
          org_id: orgToUse,
          target_id: selectedPerson,
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        detail?: string
        target?: { id: string; name: string; department: string }
        totals?: { assignmentCount: number; questionCount: number; uniqueEvaluators: number }
        rows?: PersonQuestionPeerAverageRow[]
      }
      if (!resp.ok || !payload?.success) {
        const detail = payload?.detail ? ` (${payload.detail})` : ''
        throw new Error(`${payload?.error || resp.statusText || 'Soru ortalamaları alınamadı'}${detail}`)
      }
      setPersonQuestionPeerAverages({
        target: payload.target || { id: selectedPerson, name: '', department: '' },
        totals: payload.totals || { assignmentCount: 0, questionCount: 0, uniqueEvaluators: 0 },
        rows: Array.isArray(payload.rows) ? payload.rows : [],
      })
      setSelectedReportSection('person_question_peer_averages')
      setActiveTab('overview')
      toast(
        lang === 'en'
          ? `Question averages loaded (${payload.totals?.questionCount ?? 0} questions)`
          : lang === 'fr'
            ? `Moyennes chargées (${payload.totals?.questionCount ?? 0} questions)`
            : `Soru ortalamaları yüklendi (${payload.totals?.questionCount ?? 0} soru)`,
        'success'
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Soru ortalamaları alınamadı'
      toast(msg, 'error')
    } finally {
      setLoadingPersonQuestionPeerAverages(false)
    }
  }

  const loadEvaluatorAnswerDetail = async () => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }
    if (!showPeerDetail) {
      toast(t('evaluatorAnswerDetailEnablePeerDetail', lang), 'error')
      return
    }
    setLoadingEvaluatorAnswerDetail(true)
    try {
      const resp = await fetch(`/api/admin/evaluator-answer-detail?lang=${lang}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: selectedPeriod,
          org_id: orgToUse,
          target_id: selectedPerson || null,
          department: selectedDept || null,
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        detail?: string
        totals?: {
          assignmentCount: number
          rowCount: number
          uniqueTargets: number
          uniqueEvaluators: number
        }
        rows?: EvaluatorAnswerDetailRow[]
      }
      if (!resp.ok || !payload?.success) {
        const detail = payload?.detail ? ` (${payload.detail})` : ''
        throw new Error(`${payload?.error || resp.statusText || 'Cevap detayı alınamadı'}${detail}`)
      }
      setEvaluatorAnswerDetail({
        totals: payload.totals || {
          assignmentCount: 0,
          rowCount: 0,
          uniqueTargets: 0,
          uniqueEvaluators: 0,
        },
        rows: Array.isArray(payload.rows) ? payload.rows : [],
      })
      setSelectedReportSection('evaluator_answer_detail')
      setActiveTab('overview')
      toast(
        lang === 'en'
          ? `Answer detail loaded (${payload.totals?.rowCount ?? 0} rows)`
          : lang === 'fr'
            ? `Détail chargé (${payload.totals?.rowCount ?? 0} lignes)`
            : `Cevap detayı yüklendi (${payload.totals?.rowCount ?? 0} satır)`,
        'success'
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Cevap detayı alınamadı'
      toast(msg, 'error')
    } finally {
      setLoadingEvaluatorAnswerDetail(false)
    }
  }

  const reopenAssignment = async (assignmentId?: string) => {
    const id = String(assignmentId || '').trim()
    if (!id) {
      toast(lang === 'en' ? 'Assignment id missing' : lang === 'fr' ? "ID d'affectation manquant" : 'Atama ID eksik', 'error')
      return
    }
    const ok = window.confirm(
      lang === 'en'
        ? 'Reopen this evaluation? This will clear previously saved answers and set the assignment back to pending.'
        : lang === 'fr'
          ? "Rouvrir cette évaluation ? Cela effacera les réponses enregistrées et remettra l'affectation en attente."
          : 'Bu değerlendirme yeniden açılsın mı? Kaydedilmiş yanıtlar silinir ve atama tekrar beklemede durumuna alınır.'
    )
    if (!ok) return
    setReopeningAssignmentId(id)
    try {
      const resp = await fetch('/api/admin/assignments/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: id, clear_data: true }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        throw new Error(payload?.error || 'Reopen failed')
      }
      toast(lang === 'en' ? 'Reopened' : lang === 'fr' ? 'Réouvert' : 'Yeniden açıldı', 'success')
      // Refresh results to reflect pending status / removed rows
      await loadResults()
    } catch (e: any) {
      toast(String(e?.message || 'İşlem başarısız'), 'error')
    } finally {
      setReopeningAssignmentId(null)
    }
  }

  const periodExportLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''

  const printPopupBlocked = () => {
    toast(
      lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres contextuelles' : 'Yazdırmak için açılır pencereye izin verin',
      'error'
    )
  }

  const printTableReport = (title: string, headers: string[], rows: string[][]) => {
    if (!rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    openPrintableReport({
      lang,
      title,
      subtitle: periodExportLabel,
      headers,
      rows,
      onBlocked: printPopupBlocked,
    })
  }

  const exportToExcel = () => {
    if (results.length === 0) {
      toast(t('exportNoData', lang), 'error')
      return
    }

    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    // CSV formatında export
    let csv = `"Dönem","${String(periodLabel).replace(/"/g, '""')}"\n`
    if (isSchoolOrg) {
      csv +=
        'Kişi,Departman,Öz Değerlendirme,Peer Ortalama,Peer Ortalama (Trim),Genel Ortalama,Genel Ortalama (Trim),Genel & Okul Yaşam,Genel & Okul Yaşam (Trim),Değerlendiren Sayısı\n'
      results.forEach((r) => {
        csv += `"${r.targetName}","${r.targetDept}",${r.selfScore},${r.peerAvg},${Number(r.peerAvgTrimmed || 0)},${r.overallAvg},${Number(r.overallAvgTrimmed || 0)},${Number(r.genelOkulYasamCombinedAvg || 0)},${Number(r.genelOkulYasamCombinedTrimmed || 0)},${r.evaluations.length}\n`
      })
    } else {
      csv +=
        'Kişi,Departman,Öz Değerlendirme,Peer Ortalama,Peer Ortalama (Trim),Genel Ortalama,Genel Ortalama (Trim),Değerlendiren Sayısı\n'
      results.forEach((r) => {
        csv += `"${r.targetName}","${r.targetDept}",${r.selfScore},${r.peerAvg},${Number(r.peerAvgTrimmed || 0)},${r.overallAvg},${Number(r.overallAvgTrimmed || 0)},${r.evaluations.length}\n`
      })
    }

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sonuclar_${selectedPeriod}.csv`
    a.click()
    URL.revokeObjectURL(url)
    
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportCategoryCompareDutyToExcel = (result: ResultData) => {
    const rows = (result?.categoryCompareDuty || []) as Array<{
      name: string
      self: number
      peer: number
      diff: number
      peerTrimmed?: number
    }>
    if (!rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }

    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    const maxScale = Number(result.maxScaleDuty || 5) || 5
    const safe = (v: any) => String(v ?? '')
    const esc = (v: any) => `"${safe(v).replace(/"/g, '""')}"`
    const sep = ';'

    let csv = ''
    csv += `Kişi${sep}${esc(result.targetName)}\n`
    csv += `Birim${sep}${esc(result.targetDept)}\n`
    csv += `Dönem${sep}${esc(periodLabel)}\n`
    csv += `Kapsam${sep}Ek görev\n`
    csv += '\n'
    csv +=
      [
        'Period',
        'Person',
        'Department',
        'Scope',
        'Category',
        'Self (scale)',
        'Self (%)',
        'Team (scale)',
        'Team (%)',
        'Team (trim)',
        'Team (trim %)',
        'Diff',
        'Diff (trim)',
        'Status',
      ].join(sep) + '\n'

    rows.forEach((c) => {
      const status =
        c.self === 0 ? t('selfMissing', lang) :
        c.peer === 0 ? t('teamMissing', lang) :
        c.diff > 0.5 ? (lang === 'fr' ? 'Se surestime' : lang === 'en' ? 'Overestimates' : 'Yüksek görüyor') :
        c.diff < -0.5 ? (lang === 'fr' ? 'Se sous-estime' : lang === 'en' ? 'Underestimates' : 'Düşük görüyor') :
        (lang === 'fr' ? 'Cohérent' : lang === 'en' ? 'Consistent' : 'Tutarlı')

      const self5 = c.self ? Number(c.self) : 0
      const peer5 = c.peer ? Number(c.peer) : 0
      const peerTrim5 = Number(c.peerTrimmed || 0) || 0
      const selfPct = self5 ? Math.round((self5 / maxScale) * 100) : 0
      const peerPct = peer5 ? Math.round((peer5 / maxScale) * 100) : 0
      const peerTrimPct = peerTrim5 ? Math.round((peerTrim5 / maxScale) * 100) : 0
      const diff = self5 && peer5 ? Number(c.diff) : 0
      const diffTrim = self5 && peerTrim5 ? Math.round((self5 - peerTrim5) * 100) / 100 : 0

      csv +=
        [
          esc(periodLabel),
          esc(result.targetName),
          esc(result.targetDept),
          esc('Ek görev'),
          esc(c.name),
          self5 ? String(self5.toFixed(2)) : '',
          self5 ? String(selfPct) : '',
          peer5 ? String(peer5.toFixed(2)) : '',
          peer5 ? String(peerPct) : '',
          peerTrim5 ? String(peerTrim5.toFixed(2)) : '',
          peerTrim5 ? String(peerTrimPct) : '',
          self5 && peer5 ? String(diff.toFixed(2)) : '',
          self5 && peerTrim5 ? String(diffTrim.toFixed(2)) : '',
          esc(status),
        ].join(sep) + '\n'
    })

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = String(result.targetName || 'person')
      .trim()
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 40)
    a.download = `ek-gorev-kategori-${safeName}-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportCategoryCompareToExcel = (result: ResultData) => {
    const rows = (result?.categoryCompare || []) as Array<{ name: string; self: number; peer: number; diff: number }>
    if (!rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }

    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    const safe = (v: any) => String(v ?? '')
    const esc = (v: any) => `"${safe(v).replace(/"/g, '""')}"`
    const sep = ';'

    let csv = ''
    csv += `Kişi${sep}${esc(result.targetName)}\n`
    csv += `Birim${sep}${esc(result.targetDept)}\n`
    csv += `Dönem${sep}${esc(periodLabel)}\n`
    csv += '\n'
    csv +=
      [
        'Period',
        'Person',
        'Department',
        'Category',
        'Self (5)',
        'Self (%)',
        'Team (5)',
        'Team (%)',
        'Team (trim)',
        'Team (trim %)',
        'Diff',
        'Diff (trim)',
        'Status',
      ].join(sep) + '\n'

    rows.forEach((c) => {
      const status =
        c.self === 0 ? t('selfMissing', lang) :
        c.peer === 0 ? t('teamMissing', lang) :
        c.diff > 0.5 ? (lang === 'fr' ? 'Se surestime' : lang === 'en' ? 'Overestimates' : 'Yüksek görüyor') :
        c.diff < -0.5 ? (lang === 'fr' ? 'Se sous-estime' : lang === 'en' ? 'Underestimates' : 'Düşük görüyor') :
        (lang === 'fr' ? 'Cohérent' : lang === 'en' ? 'Consistent' : 'Tutarlı')

      const self5 = c.self ? Number(c.self) : 0
      const peer5 = c.peer ? Number(c.peer) : 0
      const peerTrim5 = Number((c as any)?.peerTrimmed || 0) || 0
      const selfPct = self5 ? Math.round((self5 / 5) * 100) : 0
      const peerPct = peer5 ? Math.round((peer5 / 5) * 100) : 0
      const peerTrimPct = peerTrim5 ? Math.round((peerTrim5 / 5) * 100) : 0
      const diff = self5 && peer5 ? Number(c.diff) : 0
      const diffTrim = self5 && peerTrim5 ? Math.round((self5 - peerTrim5) * 100) / 100 : 0

      csv +=
        [
          esc(periodLabel),
          esc(result.targetName),
          esc(result.targetDept),
          esc(c.name),
          self5 ? String(self5.toFixed(2)) : '',
          self5 ? String(selfPct) : '',
          peer5 ? String(peer5.toFixed(2)) : '',
          peer5 ? String(peerPct) : '',
          peerTrim5 ? String(peerTrim5.toFixed(2)) : '',
          peerTrim5 ? String(peerTrimPct) : '',
          self5 && peer5 ? String(diff.toFixed(2)) : '',
          self5 && peerTrim5 ? String(diffTrim.toFixed(2)) : '',
          esc(status),
        ].join(sep) + '\n'
    })

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = String(result.targetName || 'person')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 120) || 'person'
    a.download = `kategori_karsilastirma_${selectedPeriod || 'period'}_${safeName}.csv`
    a.click()
    URL.revokeObjectURL(url)

    toast(t('excelDownloaded', lang), 'success')
  }

  const exportAllCategoryCompareToExcel = () => {
    if (results.length === 0) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    const safe = (v: any) => String(v ?? '')
    const esc = (v: any) => `"${safe(v).replace(/"/g, '""')}"`
    const sep = ';'

    let csv = ''
    csv += `Dönem${sep}${esc(periodLabel)}\n`
    csv += '\n'
    csv +=
      [
        'Period',
        'Person',
        'Department',
        'Category',
        'Self (5)',
        'Self (%)',
        'Team (5)',
        'Team (%)',
        'Team (trim)',
        'Team (trim %)',
        'Diff',
        'Diff (trim)',
        'Status',
      ].join(sep) + '\n'

    results.forEach((r) => {
      const rows = (r?.categoryCompare || []) as Array<{ name: string; self: number; peer: number; diff: number; peerTrimmed?: number }>
      rows.forEach((c) => {
        const status =
          c.self === 0 ? t('selfMissing', lang) :
          c.peer === 0 ? t('teamMissing', lang) :
          c.diff > 0.5 ? (lang === 'fr' ? 'Se surestime' : lang === 'en' ? 'Overestimates' : 'Yüksek görüyor') :
          c.diff < -0.5 ? (lang === 'fr' ? 'Se sous-estime' : lang === 'en' ? 'Underestimates' : 'Düşük görüyor') :
          (lang === 'fr' ? 'Cohérent' : lang === 'en' ? 'Consistent' : 'Tutarlı')

        const self5 = c.self ? Number(c.self) : 0
        const peer5 = c.peer ? Number(c.peer) : 0
        const peerTrim5 = Number((c as any)?.peerTrimmed || 0) || 0
        const selfPct = self5 ? Math.round((self5 / 5) * 100) : 0
        const peerPct = peer5 ? Math.round((peer5 / 5) * 100) : 0
        const peerTrimPct = peerTrim5 ? Math.round((peerTrim5 / 5) * 100) : 0
        const diff = self5 && peer5 ? Number(c.diff) : 0
        const diffTrim = self5 && peerTrim5 ? Math.round((self5 - peerTrim5) * 100) / 100 : 0

        csv +=
          [
            esc(periodLabel),
            esc(r.targetName),
            esc(r.targetDept),
            esc(c.name),
            self5 ? String(self5.toFixed(2)) : '',
            self5 ? String(selfPct) : '',
            peer5 ? String(peer5.toFixed(2)) : '',
            peer5 ? String(peerPct) : '',
            peerTrim5 ? String(peerTrim5.toFixed(2)) : '',
            peerTrim5 ? String(peerTrimPct) : '',
            self5 && peer5 ? String(diff.toFixed(2)) : '',
            self5 && peerTrim5 ? String(diffTrim.toFixed(2)) : '',
            esc(status),
          ].join(sep) + '\n'
      })
    })

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kategori_karsilastirma_tumu_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)

    toast(t('excelDownloaded', lang), 'success')
  }

  const exportParticipationCsv = () => {
    if (!participation) {
      toast(lang === 'en' ? 'No participation data' : lang === 'fr' ? 'Aucune donnée' : 'Katılım verisi yok', 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += ['Total', participation.totals.total, 'Completed', participation.totals.completed, 'Pending', participation.totals.pending].join(sep) + '\n'
    csv += '\n'
    csv += ['Department', 'Total', 'Completed', 'Pending', 'Completion %'].join(sep) + '\n'
    participation.departments.forEach((d) => {
      const rate = d.total ? Math.round((d.completed / d.total) * 100) : 0
      csv += [esc(d.department), String(d.total), String(d.completed), String(d.pending), String(rate)].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `katilim_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportGapCsv = (kind: 'category' | 'question') => {
    const rows = kind === 'category' ? gapReports.topCategoryGaps : gapReports.topQuestionGaps
    if (!rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = matrixSelfTeamGapExportHeaders(lang, kind, gapReports.usesMatrixScoring)
    let csv = headers.map(esc).join(sep) + '\n'
    const exportRows =
      kind === 'category'
        ? matrixSelfTeamGapCategoryExportRows(gapReports.topCategoryGaps)
        : matrixSelfTeamGapQuestionExportRows(gapReports.topQuestionGaps)
    exportRows.forEach((row) => {
      csv += row.map(esc).join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matrix_oz_ekip_${kind === 'category' ? 'kategori' : 'soru'}_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportCoverageCsv = () => {
    if (!coverage) {
      toast(lang === 'en' ? 'No coverage data' : lang === 'fr' ? 'Aucune donnée' : 'Kapsama verisi yok', 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += ['Person', 'Department', 'Completed', 'Pending', 'Self', 'Manager', 'Peer', 'Subordinate', 'Executive'].join(sep) + '\n'
    coverage.forEach((r) => {
      csv += [
        esc(r.targetName),
        esc(r.targetDept),
        String(r.completedTotal),
        String(r.pendingTotal),
        String(r.selfCompleted),
        String(r.managerCompleted),
        String(r.peerCompleted),
        String(r.subordinateCompleted),
        String(r.executiveCompleted),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kapsama_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportNoOpinionCsv = () => {
    if (!noOpinionReport) {
      toast(lang === 'en' ? 'No report data' : lang === 'fr' ? 'Aucune donnée' : 'Rapor verisi yok', 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv +=
      [
        'Evaluator',
        'Evaluator dept',
        'Target',
        'Target dept',
        'Card type',
        'Self',
        'Response count',
        'Completed at',
      ].join(sep) + '\n'
    noOpinionReport.rows.forEach((r) => {
      csv += [
        esc(r.evaluatorName),
        esc(r.evaluatorDept),
        esc(r.targetName),
        esc(r.targetDept),
        esc(r.matrixContextLabel),
        r.isSelf ? 'yes' : 'no',
        String(r.responseCount),
        esc(r.completedAt ? r.completedAt.slice(0, 10) : ''),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fikrim_yok_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportHeatmapCsv = () => {
    if (!deptHeatmap.departments.length || !deptHeatmap.categories.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = matrixDepartmentHeatmapExportHeaders(deptHeatmap.categories, lang).map(esc).join(sep) + '\n'
    matrixDepartmentHeatmapExportRows(deptHeatmap).forEach((row) => {
      csv += row.map(esc).join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matrix_heatmap_birim_kategori_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportLeaderboardCsv = () => {
    if (!peopleLeaderboard.top.length && !peopleLeaderboard.bottom.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [esc(lang === 'en' ? 'Type' : lang === 'fr' ? 'Type' : 'Tip'), esc(lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'), esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'), esc(lang === 'en' ? 'Overall' : lang === 'fr' ? 'Global' : 'Genel')].join(sep) + '\n'
    peopleLeaderboard.top.forEach((r) => {
      csv += [esc(lang === 'en' ? 'Top' : lang === 'fr' ? 'Haut' : 'Üst'), esc(r.name), esc(r.dept), String(r.score)].join(sep) + '\n'
    })
    peopleLeaderboard.bottom.forEach((r) => {
      csv += [esc(lang === 'en' ? 'Bottom' : lang === 'fr' ? 'Bas' : 'Alt'), esc(r.name), esc(r.dept), String(r.score)].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `siralama_kisiler_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportGenelOkulYasamLeaderboardCsv = () => {
    exportFormLeaderboardCsv(
      {
        label:
          lang === 'en'
            ? 'General & School Life'
            : lang === 'fr'
              ? 'Général & Vie scolaire'
              : 'Genel & Okul Yaşam',
        ...genelOkulYasamLeaderboard,
      },
      'genel_okul_yasam_siralama'
    )
  }

  const printGenelOkulYasamLeaderboardPdf = () => {
    printFormLeaderboardPdf(
      {
        label:
          lang === 'en'
            ? 'General & School Life'
            : lang === 'fr'
              ? 'Général & Vie scolaire'
              : 'Genel & Okul Yaşam',
        ...genelOkulYasamLeaderboard,
      },
      lang === 'en'
        ? 'Period summary — General & School Life'
        : lang === 'fr'
          ? 'Synthèse — Général & Vie scolaire'
          : 'Dönem özeti — Genel & Okul Yaşam'
    )
  }

  const exportFormLeaderboardCsv = (
    lb: Pick<FormLeaderboard, 'label' | 'top' | 'bottom'> & Partial<Pick<FormLeaderboard, 'topTrim' | 'bottomTrim'>>,
    fileSlug: string
  ) => {
    const topTrim = lb.topTrim || []
    const bottomTrim = lb.bottomTrim || []
    if (!lb.top.length && !lb.bottom.length && !topTrim.length && !bottomTrim.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const headers = ['Section', 'Type', 'Person', 'Department', 'Score', 'Trim']
    const rows: unknown[][] = []
    const push = (section: string, type: string, r: LeaderboardRow) => {
      rows.push([section, type, r.name, r.dept, r.score, r.scoreTrim || ''])
    }
    lb.top.forEach((r) => push(lb.label, lang === 'en' ? 'Top' : 'Üst', r))
    lb.bottom.forEach((r) => push(lb.label, lang === 'en' ? 'Bottom' : 'Alt', r))
    topTrim.forEach((r) => push(`${lb.label} (trim)`, lang === 'en' ? 'Top' : 'Üst', r))
    bottomTrim.forEach((r) => push(`${lb.label} (trim)`, lang === 'en' ? 'Bottom' : 'Alt', r))
    downloadCsv(`${fileSlug}_${selectedPeriod || 'period'}.csv`, buildCsv(headers, rows))
    toast(t('excelDownloaded', lang), 'success')
  }

  const printFormLeaderboardPdf = (
    lb: Pick<FormLeaderboard, 'label' | 'top' | 'bottom'> & Partial<Pick<FormLeaderboard, 'topTrim' | 'bottomTrim'>>,
    title: string
  ) => {
    const topTrim = lb.topTrim || []
    const bottomTrim = lb.bottomTrim || []
    if (!lb.top.length && !lb.bottom.length && !topTrim.length && !bottomTrim.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const headers = ['Section', 'Type', 'Person', 'Department', 'Score', 'Trim']
    const rows: string[][] = []
    const push = (section: string, type: string, r: LeaderboardRow) => {
      rows.push([section, type, r.name, r.dept, String(r.score), r.scoreTrim ? String(r.scoreTrim) : '—'])
    }
    lb.top.forEach((r) => push(lb.label, lang === 'en' ? 'Top' : 'Üst', r))
    lb.bottom.forEach((r) => push(lb.label, lang === 'en' ? 'Bottom' : 'Alt', r))
    topTrim.forEach((r) => push(`${lb.label} (trim)`, lang === 'en' ? 'Top' : 'Üst', r))
    bottomTrim.forEach((r) => push(`${lb.label} (trim)`, lang === 'en' ? 'Bottom' : 'Alt', r))
    printTableReport(title, headers, rows)
  }

  const exportGeneralRankingCsv = () => {
    if (!generalRankingFull.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [
      esc(lang === 'en' ? 'Rank' : lang === 'fr' ? 'Rang' : 'Sıra'),
      esc(lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'),
      esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'),
      esc(lang === 'en' ? 'Overall' : lang === 'fr' ? 'Global' : 'Genel puan'),
      esc(lang === 'en' ? 'Team avg' : lang === 'fr' ? 'Moy. équipe' : 'Ekip ort.'),
      esc(lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz puan'),
      esc(lang === 'en' ? 'Score /100' : lang === 'fr' ? 'Score /100' : '100\'lük'),
      esc(t('reportTrimRulesColumn', lang)),
      esc(t('reportTrimGeneralColumn', lang)),
    ].join(sep) + '\n'
    generalRankingFull.forEach((r) => {
      csv += [
        String(r.rank),
        esc(r.name),
        esc(r.dept),
        String(r.overallAvg),
        String(r.peerAvg || ''),
        String(r.selfScore || ''),
        r.score100 != null ? String(r.score100) : '',
        r.scoreTrim != null ? String(r.scoreTrim) : '',
        r.scoreTrimGeneral != null ? String(r.scoreTrimGeneral) : '',
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `genel_degerlendirme_tam_siralama_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const printGeneralRankingPdf = () => {
    if (!generalRankingFull.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    const title = `${reportDisplay('leaderboards_full_ranking').title} — ${periodLabel}`
    const w = window.open('', '_blank')
    if (!w) {
      toast(lang === 'en' ? 'Allow pop-ups to print' : 'Yazdırmak için açılır pencereye izin verin', 'error')
      return
    }
    const esc = escapeHtmlForPrint
    const hRank = lang === 'en' ? 'Rank' : lang === 'fr' ? 'Rang' : 'Sıra'
    const hName = lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'
    const hDept = lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'
    const hOverall = lang === 'en' ? 'Overall' : lang === 'fr' ? 'Global' : 'Genel'
    const hPeer = lang === 'en' ? 'Team' : lang === 'fr' ? 'Équipe' : 'Ekip'
    const hSelf = lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz'
    const h100 = lang === 'en' ? '/100' : lang === 'fr' ? '/100' : "100'lük"
    const hTrimRules = t('reportTrimRulesColumn', lang)
    const hTrimGeneral = t('reportTrimGeneralColumn', lang)
    const printBtn =
      lang === 'en' ? 'Print / Save as PDF' : lang === 'fr' ? 'Imprimer / PDF' : 'Yazdır / PDF kaydet'
    const subtitle =
      lang === 'en'
        ? `${generalRankingFull.length} people · general 360 only · highest to lowest`
        : lang === 'fr'
          ? `${generalRankingFull.length} personnes · évaluation générale uniquement`
          : `${generalRankingFull.length} kişi · yalnızca genel 360 · en yüksekten en düşüğe`
    const scoreNoteTitle = t('reportNote_genVsTeamScoreTitle', lang)
    const scoreNoteBody = t('reportNote_genVsTeamScoreColumns', lang)
    const rows = generalRankingFull
      .map(
        (r) =>
          `<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${esc(r.dept)}</td><td><strong>${r.overallAvg.toFixed(2)}</strong></td><td>${r.peerAvg > 0 ? r.peerAvg.toFixed(2) : '—'}</td><td>${r.selfScore > 0 ? r.selfScore.toFixed(2) : '—'}</td><td>${r.score100 != null ? r.score100.toFixed(2) : '—'}</td><td>${r.scoreTrim != null ? r.scoreTrim.toFixed(2) : '—'}</td><td>${r.scoreTrimGeneral != null ? r.scoreTrimGeneral.toFixed(2) : '—'}</td></tr>`
      )
      .join('')
    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 20px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.meta { margin: 0 0 12px; color: #555; font-size: 12px; }
  p.score-note { margin: 0 0 16px; padding: 10px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 11px; line-height: 1.5; color: #422006; }
  p.score-note strong { display: block; margin-bottom: 4px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }
  .no-print { margin-bottom: 16px; }
  @media print { .no-print { display: none !important; } body { padding: 12px; } }
</style>
</head>
<body>
  <div class="no-print">
    <button type="button" onclick="window.print()" style="padding:8px 14px;font-size:13px;cursor:pointer;border:1px solid #d1d5db;border-radius:8px;background:#fff;">${esc(printBtn)}</button>
  </div>
  <h1>${esc(title)}</h1>
  <p class="meta">${esc(subtitle)}</p>
  <p class="score-note"><strong>${esc(scoreNoteTitle)}</strong>${esc(scoreNoteBody)}</p>
  <table>
    <thead><tr><th>${hRank}</th><th>${hName}</th><th>${hDept}</th><th>${hOverall}</th><th>${hPeer}</th><th>${hSelf}</th><th>${h100}</th><th>${hTrimRules}</th><th>${hTrimGeneral}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    const triggerPrint = () => {
      try {
        w.print()
      } catch {
        // Tarayıcı otomatik yazdırmayı engellediyse kullanıcı butona basar
      }
    }
    setTimeout(triggerPrint, 300)
  }

  const exportMatrixFullRankingCsv = () => {
    if (!matrixFullRanking.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = matrixFullRankingExportHeaders(lang).map(esc).join(sep) + '\n'
    matrixFullRankingExportRows(matrixFullRanking).forEach((row) => {
      csv += row.map(esc).join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matrix_tam_siralama_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const printMatrixFullRankingPdf = () => {
    if (!matrixFullRanking.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    openMatrixFullRankingPdf(matrixFullRanking, {
      lang,
      periodLabel,
      catalogTitle: reportDisplay('leaderboards_full_ranking_genel_okul_yasam').title,
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
  }

  const exportDeptRankingCsv = () => {
    if (!departmentRankingGroups.allRows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = matrixDepartmentRankingExportHeaders(lang)
    let csv = headers.map(esc).join(sep) + '\n'
    matrixDepartmentRankingExportRows(departmentRankingGroups, lang).forEach((row) => {
      csv += row.map(esc).join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matrix_birim_siralama_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportDeptGenelOkulYasamRankingCsv = () => {
    if (!departmentGenelOkulYasamRankingGroups.allRows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [
      esc(lang === 'en' ? 'Size group' : lang === 'fr' ? 'Groupe taille' : 'Kişi grubu'),
      esc(lang === 'en' ? 'Rank in group' : lang === 'fr' ? 'Rang dans le groupe' : 'Gruptaki sıra'),
      esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'),
      esc(lang === 'en' ? 'People' : lang === 'fr' ? 'Personnes' : 'Kişi sayısı'),
      esc(lang === 'en' ? 'Avg combined' : lang === 'fr' ? 'Moy. combinée' : 'Ort. birleşik'),
      esc(lang === 'en' ? 'Best person' : lang === 'fr' ? 'Meilleur' : 'Birimde en yüksek'),
      esc(lang === 'en' ? 'Best score' : lang === 'fr' ? 'Score' : 'Puan'),
      esc(lang === 'en' ? 'Lowest person' : lang === 'fr' ? 'Plus bas' : 'Birimde en düşük'),
      esc(lang === 'en' ? 'Lowest score' : lang === 'fr' ? 'Score' : 'Puan'),
    ].join(sep) + '\n'
    departmentGenelOkulYasamRankingGroups.tiers.forEach((g) => {
      g.rows.forEach((r) => {
        csv += [
          esc(departmentSizeTierLabel(g.tier, lang)),
          String(r.rankInTier),
          esc(r.department),
          String(r.peopleCount),
          String(r.avgOverall),
          esc(r.bestPerson),
          String(r.bestScore),
          esc(r.worstPerson),
          String(r.worstScore),
        ].join(sep) + '\n'
      })
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `siralama_birimler_genel_okul_yasam_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportMatrixDepartmentPeopleCsv = () => {
    if (!matrixDepartmentPeopleRanking.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = matrixDepartmentPeopleExportHeaders(lang).map(esc).join(sep) + '\n'
    matrixDepartmentPeopleExportRows(matrixDepartmentPeopleRanking).forEach((row) => {
      csv += row.map(esc).join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matrix_birim_ici_tam_siralama_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const printMatrixDepartmentPeoplePdf = () => {
    if (!matrixDepartmentPeopleRanking.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    openMatrixDepartmentPeoplePdf(matrixDepartmentPeopleRanking, {
      lang,
      periodLabel,
      catalogTitle: reportDisplay('leaderboards_departments_people').title,
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
  }


  const exportTrendCsv = () => {
    if (!periodComparisonMeta?.canCompare || !periodComparisonMeta.previousPeriod) {
      toast(
        lang === 'en'
          ? 'Period comparison requires at least two periods of the same evaluation type.'
          : lang === 'fr'
            ? 'La comparaison nécessite au moins deux périodes du même type.'
            : 'Karşılaştırma için aynı değerlendirme türünde en az iki dönem gerekir.',
        'error'
      )
      return
    }
    if (!periodComparisonTrend.peopleUp.length && !periodComparisonTrend.peopleDown.length && !periodComparisonTrend.deptMoves.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    const pLabel = esc(
      lang === 'en' ? 'Previous period' : lang === 'fr' ? 'Période précédente' : 'Önceki dönem',
    )
    const scoreLabel = periodComparisonTrend.usesMatrixScoring
      ? t('matrixPeriodComparisonScoreLabel', lang)
      : lang === 'en'
        ? 'Overall score'
        : lang === 'fr'
          ? 'Score global'
          : 'Genel puan'
    csv += `${pLabel};${esc(periodComparisonMeta.previousPeriod.name)}\n`
    csv += `${esc(lang === 'en' ? 'Score type' : lang === 'fr' ? 'Type de score' : 'Puan türü')};${esc(scoreLabel)}\n\n`
    csv += [
      esc(lang === 'en' ? 'People — biggest gains' : lang === 'fr' ? 'Personnes — plus fortes hausses' : 'Kişiler — en çok artan'),
      esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'),
      esc(lang === 'en' ? 'Current' : lang === 'fr' ? 'Actuel' : 'Şu an'),
      esc(lang === 'en' ? 'Previous' : lang === 'fr' ? 'Précédent' : 'Önceki'),
      esc(lang === 'en' ? 'Delta' : lang === 'fr' ? 'Delta' : 'Fark'),
    ].join(sep) + '\n'
    periodComparisonTrend.peopleUp.forEach((r) => {
      csv += [esc(r.name), esc(r.dept), String(r.cur), String(r.prev), String(r.delta)].join(sep) + '\n'
    })
    csv += '\n'
    csv += [
      esc(lang === 'en' ? 'People — biggest drops' : lang === 'fr' ? 'Personnes — plus fortes baisses' : 'Kişiler — en çok düşen'),
      esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'),
      esc(lang === 'en' ? 'Current' : lang === 'fr' ? 'Actuel' : 'Şu an'),
      esc(lang === 'en' ? 'Previous' : lang === 'fr' ? 'Précédent' : 'Önceki'),
      esc(lang === 'en' ? 'Delta' : lang === 'fr' ? 'Delta' : 'Fark'),
    ].join(sep) + '\n'
    periodComparisonTrend.peopleDown.forEach((r) => {
      csv += [esc(r.name), esc(r.dept), String(r.cur), String(r.prev), String(r.delta)].join(sep) + '\n'
    })
    csv += '\n'
    csv += [
      esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'),
      esc(lang === 'en' ? 'Current avg' : lang === 'fr' ? 'Moy. actuelle' : 'Ort. şu an'),
      esc(lang === 'en' ? 'Previous avg' : lang === 'fr' ? 'Moy. précédente' : 'Ort. önceki'),
      esc(lang === 'en' ? 'Delta' : lang === 'fr' ? 'Delta' : 'Fark'),
      esc(lang === 'en' ? 'N current' : lang === 'fr' ? 'N actuel' : 'N şu an'),
      esc(lang === 'en' ? 'N previous' : lang === 'fr' ? 'N précédent' : 'N önceki'),
    ].join(sep) + '\n'
    periodComparisonTrend.deptMoves.forEach((r) => {
      csv += [
        esc(r.department),
        String(r.cur),
        String(r.prev),
        String(r.delta),
        String(r.nCur),
        String(r.nPrev),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `donem_karsilastirma_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportCategoryHighlightsCsv = () => {
    if (!categoryPeerHighlights.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = matrixCategorySpotlightExportHeaders(lang, categorySpotlightUsesMatrix).map(esc).join(sep) + '\n'
    matrixCategorySpotlightExportRows(categoryPeerHighlights, lang).forEach((row) => {
      csv += row.map(esc).join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matrix_kategori_odak_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportRiskScorecardCsv = () => {
    if (!riskScorecard.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [
      esc('Kişi'),
      esc('Birim'),
      esc('Risk'),
      ...(riskScorecardUsesMatrix ? [] : [esc('Risk (trim)')]),
      esc(riskScorecardUsesMatrix ? t('matrixPersonResultsCoreScoreColumn', lang) : 'Genel Skor'),
      ...(riskScorecardUsesMatrix ? [] : [esc('Genel Skor (trim)')]),
      esc('Delta'),
      ...(riskScorecardUsesMatrix ? [] : [esc('Delta (trim)')]),
      esc('Gap Ort.'),
      esc('Kapsama'),
      esc('Risk-Performans'),
      esc('Risk-Trend'),
      esc('Risk-Gap'),
      esc('Risk-Kapsama'),
    ].join(sep) + '\n'
    riskScorecard.forEach((r) => {
      csv += [
        esc(r.name),
        esc(r.dept),
        String(r.riskScore),
        ...(riskScorecardUsesMatrix ? [] : [String(r.riskScoreTrim)]),
        String(r.overall),
        ...(riskScorecardUsesMatrix ? [] : [String(r.overallTrim)]),
        String(r.delta),
        ...(riskScorecardUsesMatrix ? [] : [String(r.deltaTrim)]),
        String(r.avgGap),
        String(r.peerEvalCount),
        String(r.explain.lowScore),
        String(r.explain.trend),
        String(r.explain.gap),
        String(r.explain.coverage),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `risk_scorecard_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportEarlyWarningsCsv = () => {
    if (!earlyWarnings.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [esc('Seviye'), esc('Başlık'), esc('Detay')].join(sep) + '\n'
    earlyWarnings.forEach((w) => {
      csv += [esc(w.level), esc(w.title), esc(w.detail)].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `erken_uyari_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportHealthCsv = () => {
    const sep = ';'
    const perfLabel = organizationHealth.usesMatrixScoring
      ? t('matrixOrgHealthPerformanceLabel', lang)
      : 'Performance'
    let csv = `Metric${sep}Score\n`
    csv += `Organization Health Index${sep}${organizationHealth.score}\n`
    csv += `${perfLabel}${sep}${organizationHealth.parts.performance}\n`
    csv += `Participation${sep}${organizationHealth.parts.participation}\n`
    csv += `Coverage${sep}${organizationHealth.parts.coverage}\n`
    csv += `Trend${sep}${organizationHealth.parts.trend}\n`
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `org_health_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportAnalyticsDeptRiskCsv = () => {
    if (!departmentAnalytics.riskRank.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [
      esc('Rank'),
      esc('Department'),
      esc('People'),
      esc('Avg risk'),
      esc('High risk (>=70)'),
      esc(`Low score (<=${analyticsWeights.warningLowScoreThreshold.toFixed(2)})`),
      esc(departmentAnalytics.usesMatrixScoring ? t('matrixDeptAnalyticsAvgMatrixColumn', lang) : 'Avg overall'),
      esc('Dept Δ'),
    ].join(sep) + '\n'
    departmentAnalytics.riskRank.forEach((r) => {
      csv += [
        String(r.rank),
        esc(r.department),
        String(r.people),
        String(r.avgRisk),
        String(r.highRisk),
        String(r.lowScore),
        String(r.avgOverall),
        r.delta === null ? '' : String(r.delta),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics_departman_risk_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportAnalyticsDeptHealthCsv = () => {
    if (!departmentAnalytics.healthRank.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [
      esc('Rank'),
      esc('Department'),
      esc('People'),
      esc(departmentAnalytics.usesMatrixScoring ? t('matrixDeptAnalyticsAvgMatrixColumn', lang) : 'Avg overall'),
      esc('Dept Δ'),
      esc('Avg risk'),
      esc('High risk (>=70)'),
    ].join(sep) + '\n'
    departmentAnalytics.healthRank.forEach((r) => {
      csv += [
        String(r.rank),
        esc(r.department),
        String(r.people),
        String(r.avgOverall),
        r.delta === null ? '' : String(r.delta),
        String(r.avgRisk),
        String(r.highRisk),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics_departman_health_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportAnalyticsWarningRulesCsv = () => {
    if (!warningRules.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [esc('Rule'), esc('Logic'), esc('Triggered')].join(sep) + '\n'
    warningRules.forEach((r) => {
      csv += [esc(r.title), esc(r.logic), String(r.count)].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics_warning_rules_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportPerformanceDistributionCsv = () => {
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const d = performanceDistribution
    let csv = ''
    csv += [esc('Metric'), esc('Value')].join(sep) + '\n'
    csv += [esc('N'), String(d.n)].join(sep) + '\n'
    csv += [esc(performanceDistributionUsesMatrix ? t('matrixPerformanceDistributionAvgLabel', lang) : 'Avg'), String(d.avg)].join(sep) + '\n'
    csv += [esc('Std'), String(d.std)].join(sep) + '\n'
    csv += [esc('P10'), String(d.p10)].join(sep) + '\n'
    csv += [esc('P25'), String(d.p25)].join(sep) + '\n'
    csv += [esc('P50'), String(d.p50)].join(sep) + '\n'
    csv += [esc('P75'), String(d.p75)].join(sep) + '\n'
    csv += [esc('P90'), String(d.p90)].join(sep) + '\n'
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `performance_distribution_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportCalibrationByDepartmentCsv = () => {
    if (!calibrationByDepartment.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [esc('Rank'), esc('Department'), esc('N'), esc(performanceDistributionUsesMatrix ? t('matrixPerformanceDistributionAvgLabel', lang) : 'Avg'), esc('Std'), esc('P25'), esc('P50'), esc('P75')].join(sep) + '\n'
    calibrationByDepartment.forEach((r) => {
      csv += [String(r.rank), esc(r.department), String(r.n), String(r.avg), String(r.std), String(r.p25), String(r.p50), String(r.p75)].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `calibration_department_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportManagerEffectivenessCsv = () => {
    if (!managerEffectiveness.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    const avgGivenLabel = managerEffectivenessUsesMatrix
      ? t('matrixManagerEffectivenessAvgGivenLabel', lang)
      : 'Avg given'
    const avgTeamLabel = managerEffectivenessUsesMatrix
      ? t('matrixManagerEffectivenessAvgTeamLabel', lang)
      : 'Avg team'
    csv += [
      esc('Rank'),
      esc('Level'),
      esc('Evaluator'),
      esc('Targets'),
      esc(avgGivenLabel),
      esc(avgTeamLabel),
      esc('Avg overall'),
      esc('Leniency vs team'),
      esc('Leniency vs overall'),
      esc('Effectiveness'),
    ].join(sep) + '\n'
    managerEffectiveness.forEach((r) => {
      csv += [
        String(r.rank),
        esc(positionLevelLabel(r.evaluatorLevel, lang)),
        esc(r.evaluatorName),
        String(r.targets),
        String(r.avgGiven),
        String(r.avgTeam),
        String(r.avgOverall),
        String(r.leniencyVsTeam),
        String(r.leniencyVsOverall),
        String(r.effectiveness),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `manager_effectiveness_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportEvaluatorPeerCalibrationCsv = () => {
    if (!evaluatorPeerCalibration.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const suffix = `${evaluatorCalLevel}_minN${evaluatorCalMinTargets}`
    const avgGivenLabel = evaluatorPeerCalibrationUsesMatrix
      ? t('matrixEvaluatorCalibrationAvgGivenLabel', lang)
      : 'Avg given'
    const cohortLabel = evaluatorPeerCalibrationUsesMatrix
      ? t('matrixEvaluatorCalibrationCohortLabel', lang)
      : 'Cohort peer avg'
    let csv = ''
    csv += [
      esc('Rank'),
      esc('Evaluator id'),
      esc('Evaluator'),
      esc('Level'),
      esc('Targets evaluated'),
      esc('Min avg given'),
      esc('Max avg given'),
      esc('Spread'),
      esc(avgGivenLabel),
      esc('Std'),
      esc(cohortLabel),
      esc('Delta vs cohort'),
      esc('Profile'),
    ].join(sep) + '\n'
    evaluatorPeerCalibration.forEach((r) => {
      csv += [
        String(r.rank),
        esc(r.evaluatorId),
        esc(r.evaluatorName),
        esc(positionLevelLabel(r.evaluatorLevel, lang)),
        String(r.nTargets),
        String(r.minGiven),
        String(r.maxGiven),
        String(r.spread),
        String(r.avgGiven),
        String(r.stdGiven),
        String(r.cohortPeerAvg),
        String(r.deltaVsCohort),
        esc(r.profile),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evaluator_peer_calibration_${selectedPeriod || 'period'}_${suffix}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const printSummaryPdf = () => {
    if (!results.length) return void toast(t('exportNoData', lang), 'error')
    const headers =
      lang === 'en'
        ? ['Person', 'Department', 'Self', 'Peer avg', 'Peer trim', 'Overall', 'Overall trim', 'Evaluators']
        : lang === 'fr'
          ? ['Personne', 'Département', 'Auto', 'Moy. équipe', 'Trim équipe', 'Global', 'Global trim', 'Évaluateurs']
          : ['Kişi', 'Birim', 'Öz', 'Ekip ort.', 'Ekip trim', 'Genel', 'Genel trim', 'Değerlendiren']
    const rows = results.map((r) => [
      r.targetName,
      r.targetDept,
      String(r.selfScore),
      String(r.peerAvg),
      String(r.peerAvgTrimmed || 0),
      String(r.overallAvg),
      String(r.overallAvgTrimmed || 0),
      String(r.evaluations.length),
    ])
    printTableReport(
      reportDisplay('summary', lang === 'en' ? 'Period summary' : lang === 'fr' ? 'Synthèse période' : 'Dönem özeti').title,
      headers,
      rows
    )
  }

  const printParticipationPdf = () => {
    if (!participation?.departments?.length) return void toast(t('exportNoData', lang), 'error')
    const headers =
      lang === 'en'
        ? ['Department', 'Total', 'Completed', 'Pending', 'Rate %']
        : lang === 'fr'
          ? ['Département', 'Total', 'Terminées', 'En attente', 'Taux %']
          : ['Birim', 'Toplam', 'Tamamlanan', 'Bekleyen', 'Oran %']
    const rows = participation.departments.map((d) => {
      const rate = d.total ? Math.round((d.completed / d.total) * 100) : 0
      return [d.department, String(d.total), String(d.completed), String(d.pending), `${rate}%`]
    })
    printTableReport(
      lang === 'en' ? 'Participation report' : lang === 'fr' ? 'Rapport participation' : 'Katılım raporu',
      headers,
      rows
    )
  }

  const printCoveragePdf = () => {
    if (!coverage?.length) return void toast(lang === 'en' ? 'No coverage data' : 'Kapsama verisi yok', 'error')
    const headers = ['Person', 'Department', 'Completed', 'Pending', 'Self', 'Manager', 'Peer', 'Sub.', 'Exec.']
    const rows = coverage.map((r) => [
      r.targetName,
      r.targetDept,
      String(r.completedTotal),
      String(r.pendingTotal),
      String(r.selfCompleted),
      String(r.managerCompleted),
      String(r.peerCompleted),
      String(r.subordinateCompleted),
      String(r.executiveCompleted),
    ])
    printTableReport(
      lang === 'en' ? 'Evaluator coverage' : lang === 'fr' ? 'Couverture évaluateurs' : 'Değerlendirici kapsaması',
      headers,
      rows
    )
  }

  const printNoOpinionPdf = () => {
    if (!noOpinionReport?.rows?.length) return void toast(t('exportNoData', lang), 'error')
    const headers = ['Evaluator', 'Target', 'Department', 'Matrix', 'Answers', 'Completed']
    const rows = noOpinionReport.rows.map((r) => [
      r.evaluatorName,
      r.targetName,
      r.targetDept,
      r.matrixContextLabel,
      String(r.responseCount),
      r.completedAt ? r.completedAt.slice(0, 10) : '—',
    ])
    printTableReport(
      lang === 'en' ? 'No-opinion report' : lang === 'fr' ? 'Rapport sans avis' : 'Fikrim yok raporu',
      headers,
      rows
    )
  }

  const printGapPdf = (kind: 'category' | 'question') => {
    const data = kind === 'category' ? gapReports.topCategoryGaps : gapReports.topQuestionGaps
    if (!data.length) return void toast(t('exportNoData', lang), 'error')
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    openMatrixSelfTeamGapPdf(kind, data, {
      lang,
      periodLabel,
      usesMatrixScoring: gapReports.usesMatrixScoring,
      catalogTitle: reportDisplay('gaps').title,
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
  }

  const printHeatmapPdf = () => {
    if (!deptHeatmap.departments.length) return void toast(t('exportNoData', lang), 'error')
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    openMatrixDepartmentHeatmapPdf(deptHeatmap, {
      lang,
      periodLabel,
      catalogTitle: reportDisplay('heatmap').title,
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
  }

  const printLeaderboardPdf = () => {
    if (!peopleLeaderboard.top.length && !peopleLeaderboard.bottom.length) return void toast(t('exportNoData', lang), 'error')
    const headers = ['Type', 'Person', 'Department', 'Overall']
    const rows = [
      ...peopleLeaderboard.top.map((r) => [lang === 'en' ? 'Top' : 'Üst', r.name, r.dept, String(r.score)]),
      ...peopleLeaderboard.bottom.map((r) => [lang === 'en' ? 'Bottom' : 'Alt', r.name, r.dept, String(r.score)]),
    ]
    printTableReport(
      reportDisplay('leaderboards_core', lang === 'en' ? 'Period ranking highlights' : 'Dönem özeti sıralama').title,
      headers,
      rows
    )
  }

  const printDeptRankingPdf = () => {
    if (!departmentRankingGroups.allRows.length) return void toast(t('exportNoData', lang), 'error')
    const headers = matrixDepartmentRankingExportHeaders(lang)
    const rows = matrixDepartmentRankingExportRows(departmentRankingGroups, lang).map((row) =>
      row.map((c) => String(c))
    )
    printTableReport(reportDisplay('leaderboards_departments').title, headers, rows)
  }

  const printDeptGenelOkulYasamRankingPdf = () => {
    if (!departmentGenelOkulYasamRankingGroups.allRows.length) return void toast(t('exportNoData', lang), 'error')
    const headers = ['Tier', 'Rank', 'Department', 'People', 'Avg combined']
    const rows = departmentGenelOkulYasamRankingGroups.allRows.map((r) => [
      departmentSizeTierLabel(r.sizeTier, lang),
      String(r.rankInTier),
      r.department,
      String(r.peopleCount),
      r.avgOverall.toFixed(2),
    ])
    printTableReport(
      lang === 'en'
        ? 'Department rankings — General & School Life'
        : 'Birim sıralaması — Genel & Okul Yaşam',
      headers,
      rows
    )
  }

  const printCategoryHighlightsPdf = () => {
    if (!categoryPeerHighlights.length) return void toast(t('exportNoData', lang), 'error')
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    openMatrixCategorySpotlightPdf(categoryPeerHighlights, {
      lang,
      periodLabel,
      usesMatrixScoring: categorySpotlightUsesMatrix,
      catalogTitle: reportDisplay('category_spotlight').title,
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
  }

  const exportChartsCsv = () => {
    const rows = matrixChartsExportRows(matrixChartsReport, lang)
    if (!rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const headers = [
      lang === 'en' ? 'Section' : lang === 'fr' ? 'Section' : 'Bölüm',
      lang === 'en' ? 'Label' : lang === 'fr' ? 'Libellé' : 'Etiket',
      lang === 'en' ? 'Value' : lang === 'fr' ? 'Valeur' : 'Değer',
    ]
    downloadCsv(`matrix_puan_dagilimi_kategori_${selectedPeriod || 'period'}.csv`, buildCsv(headers, rows))
    toast(t('excelDownloaded', lang), 'success')
  }

  const printChartsPdf = () => {
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    openMatrixChartsPdf(matrixChartsReport, {
      lang,
      periodLabel,
      catalogTitle: reportDisplay('charts').title,
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
  }

  const printTrendPdf = () => {
    if (!periodComparisonMeta?.canCompare) return void toast(t('exportNoData', lang), 'error')
    const headers = ['Section', 'Name', 'Department', 'Current', 'Previous', 'Delta']
    const rows: string[][] = []
    periodComparisonTrend.peopleUp.forEach((r) =>
      rows.push(['Person ↑', r.name, r.dept, String(r.cur), String(r.prev), String(r.delta)])
    )
    periodComparisonTrend.peopleDown.forEach((r) =>
      rows.push(['Person ↓', r.name, r.dept, String(r.cur), String(r.prev), String(r.delta)])
    )
    periodComparisonTrend.deptMoves.forEach((r) =>
      rows.push(['Department', r.department, '', String(r.cur), String(r.prev), String(r.delta)])
    )
    printTableReport(
      lang === 'en' ? 'Period-over-period change' : 'Önceki döneme göre değişim',
      headers,
      rows
    )
  }

  const printRiskScorecardPdf = () => {
    if (!riskScorecard.length) return void toast(t('exportNoData', lang), 'error')
    const scoreCol = riskScorecardUsesMatrix ? t('matrixPersonResultsCoreScoreColumn', lang) : 'Overall'
    const headers = ['Person', 'Department', 'Risk score', scoreCol, 'Delta', 'Peer evaluators']
    const rows = riskScorecard.map((r) => [
      r.name,
      r.dept,
      String(r.riskScore),
      String(r.overall),
      String(r.delta),
      String(r.peerEvalCount),
    ])
    printTableReport(
      lang === 'en' ? 'Risk scorecard' : 'Risk kartı',
      headers,
      rows
    )
  }

  const printEvaluatorPeerCalibrationPdf = () => {
    if (!evaluatorPeerCalibration.length) return void toast(t('exportNoData', lang), 'error')
    const avgGivenLabel = evaluatorPeerCalibrationUsesMatrix
      ? t('matrixEvaluatorCalibrationAvgGivenLabel', lang)
      : 'Avg given'
    const headers = ['Rank', 'Evaluator', 'Level', 'Targets', avgGivenLabel, 'Profile']
    const rows = evaluatorPeerCalibration.map((r) => [
      String(r.rank),
      r.evaluatorName,
      positionLevelLabel(r.evaluatorLevel, lang),
      String(r.nTargets),
      String(r.avgGiven),
      r.profile,
    ])
    printTableReport(
      lang === 'en' ? 'Evaluator calibration' : 'Değerlendirici kalibrasyonu',
      headers,
      rows
    )
  }

  const printHealthPdf = () => {
    const perfLabel = organizationHealth.usesMatrixScoring
      ? t('matrixOrgHealthPerformanceLabel', lang)
      : 'Performance'
    const headers = ['Metric', 'Score']
    const rows = [
      ['Organization Health Index', String(organizationHealth.score)],
      [perfLabel, String(organizationHealth.parts.performance)],
      ['Participation', String(organizationHealth.parts.participation)],
      ['Coverage', String(organizationHealth.parts.coverage)],
      ['Trend', String(organizationHealth.parts.trend)],
    ]
    printTableReport(
      lang === 'en' ? 'Organization health index' : lang === 'fr' ? 'Indice santé organisation' : 'Kurum sağlık endeksi',
      headers,
      rows
    )
  }

  const printEarlyWarningsPdf = () => {
    if (!earlyWarnings.length) return void toast(t('exportNoData', lang), 'error')
    const headers = ['Level', 'Title', 'Detail']
    const rows = earlyWarnings.map((w) => [w.level, w.title, w.detail])
    printTableReport(
      lang === 'en' ? 'Early warning panel' : lang === 'fr' ? 'Alerte précoce' : 'Erken uyarı paneli',
      headers,
      rows
    )
  }

  const printAnalyticsDeptRiskPdf = () => {
    if (!departmentAnalytics.riskRank.length) return void toast(t('exportNoData', lang), 'error')
    const headers = ['Rank', 'Department', 'People', 'Avg risk', 'High risk', 'Low score', 'Avg overall', 'Dept Δ']
    const rows = departmentAnalytics.riskRank.map((r) => [
      String(r.rank),
      r.department,
      String(r.people),
      String(r.avgRisk),
      String(r.highRisk),
      String(r.lowScore),
      String(r.avgOverall),
      r.delta === null ? '—' : String(r.delta),
    ])
    printTableReport(
      lang === 'en' ? 'Departments — highest risk' : 'Birimler — en yüksek risk',
      headers,
      rows
    )
  }

  const printAnalyticsDeptHealthPdf = () => {
    if (!departmentAnalytics.healthRank.length) return void toast(t('exportNoData', lang), 'error')
    const avgCol = departmentAnalytics.usesMatrixScoring
      ? t('matrixDeptAnalyticsAvgMatrixColumn', lang)
      : 'Avg overall'
    const headers = ['Rank', 'Department', 'People', avgCol, 'Dept Δ', 'Avg risk', 'High risk']
    const rows = departmentAnalytics.healthRank.map((r) => [
      String(r.rank),
      r.department,
      String(r.people),
      String(r.avgOverall),
      r.delta === null ? '—' : String(r.delta),
      String(r.avgRisk),
      String(r.highRisk),
    ])
    printTableReport(
      lang === 'en' ? 'Departments — best performance' : 'Birimler — en yüksek performans',
      headers,
      rows
    )
  }

  const printAnalyticsWarningRulesPdf = () => {
    if (!warningRules.length) return void toast(t('exportNoData', lang), 'error')
    const headers = ['Rule', 'Logic', 'Triggered']
    const rows = warningRules.map((r) => [r.title, r.logic, String(r.count)])
    printTableReport(
      lang === 'en' ? 'Early warning rules' : 'Erken uyarı kuralları',
      headers,
      rows
    )
  }

  const printPerformanceDistributionPdf = () => {
    const d = performanceDistribution
    const avgLabel = performanceDistributionUsesMatrix
      ? t('matrixPerformanceDistributionAvgLabel', lang)
      : 'Avg'
    const headers = ['Metric', 'Value']
    const rows = [
      ['N', String(d.n)],
      [avgLabel, String(d.avg)],
      ['Std', String(d.std)],
      ['P10', String(d.p10)],
      ['P25', String(d.p25)],
      ['P50', String(d.p50)],
      ['P75', String(d.p75)],
      ['P90', String(d.p90)],
    ]
    printTableReport(
      lang === 'en' ? 'Performance distribution' : 'Performans dağılımı',
      headers,
      rows
    )
  }

  const printCalibrationByDepartmentPdf = () => {
    if (!calibrationByDepartment.length) return void toast(t('exportNoData', lang), 'error')
    const avgLabel = performanceDistributionUsesMatrix
      ? t('matrixPerformanceDistributionAvgLabel', lang)
      : 'Avg'
    const headers = ['Rank', 'Department', 'N', avgLabel, 'Std', 'P25', 'P50', 'P75']
    const rows = calibrationByDepartment.map((r) => [
      String(r.rank),
      r.department,
      String(r.n),
      String(r.avg),
      String(r.std),
      String(r.p25),
      String(r.p50),
      String(r.p75),
    ])
    printTableReport(
      lang === 'en' ? 'Calibration by department' : 'Birim bazlı kalibrasyon',
      headers,
      rows
    )
  }

  const printManagerEffectivenessPdf = () => {
    if (!managerEffectiveness.length) return void toast(t('exportNoData', lang), 'error')
    const avgGivenLabel = managerEffectivenessUsesMatrix
      ? t('matrixManagerEffectivenessAvgGivenLabel', lang)
      : 'Avg given'
    const avgTeamLabel = managerEffectivenessUsesMatrix
      ? t('matrixManagerEffectivenessAvgTeamLabel', lang)
      : 'Avg team'
    const headers = ['Rank', 'Level', 'Evaluator', 'Targets', avgGivenLabel, avgTeamLabel, 'Avg overall', 'Leniency vs team', 'Leniency vs overall', 'Effectiveness']
    const rows = managerEffectiveness.map((r) => [
      String(r.rank),
      positionLevelLabel(r.evaluatorLevel, lang),
      r.evaluatorName,
      String(r.targets),
      String(r.avgGiven),
      String(r.avgTeam),
      String(r.avgOverall),
      String(r.leniencyVsTeam),
      String(r.leniencyVsOverall),
      String(r.effectiveness),
    ])
    printTableReport(
      lang === 'en' ? 'Manager effectiveness scorecard' : 'Yönetici etkinlik skor kartı',
      headers,
      rows
    )
  }

  const printAllCategoryComparePdf = () => {
    if (!results.length) return void toast(t('exportNoData', lang), 'error')
    const headers = ['Person', 'Department', 'Category', 'Self', 'Team', 'Team trim', 'Diff', 'Diff trim']
    const rows: string[][] = []
    results.forEach((r) => {
      ;(r.categoryCompare || []).forEach((c: any) => {
        const peerTrim = Number(c?.peerTrimmed || 0) || 0
        const diffTrim = c.self && peerTrim ? Math.round((Number(c.self) - peerTrim) * 100) / 100 : 0
        rows.push([
          r.targetName,
          r.targetDept,
          String(c?.name || ''),
          String(c?.self || 0),
          String(c?.peer || 0),
          peerTrim ? String(peerTrim) : '—',
          String(c?.diff || 0),
          c.self && peerTrim ? String(diffTrim) : '—',
        ])
      })
    })
    if (!rows.length) return void toast(t('exportNoData', lang), 'error')
    printTableReport(
      lang === 'en' ? 'Category comparison — all people' : 'Kategori karşılaştırma — tüm kişiler',
      headers,
      rows
    )
  }

  const printCategoryComparePdf = (result: ResultData) => {
    const rows = (result?.categoryCompare || []) as Array<{ name: string; self: number; peer: number; diff: number; peerTrimmed?: number }>
    if (!rows.length) return void toast(t('exportNoData', lang), 'error')
    const headers = ['Category', 'Self', 'Team', 'Team trim', 'Diff', 'Diff trim']
    const pdfRows = rows.map((c) => {
      const peerTrim = Number(c.peerTrimmed || 0) || 0
      const diffTrim = c.self && peerTrim ? Math.round((c.self - peerTrim) * 100) / 100 : 0
      return [
        c.name,
        String(c.self || 0),
        String(c.peer || 0),
        peerTrim ? String(peerTrim) : '—',
        String(c.diff || 0),
        c.self && peerTrim ? String(diffTrim) : '—',
      ]
    })
    printTableReport(
      `${result.targetName} — ${lang === 'en' ? 'Category comparison' : 'Kategori karşılaştırma'}`,
      headers,
      pdfRows
    )
  }

  const printCategoryCompareDutyPdf = (result: ResultData) => {
    const rows = (result?.categoryCompareDuty || []) as Array<{ name: string; self: number; peer: number; diff: number; peerTrimmed?: number }>
    if (!rows.length) return void toast(t('exportNoData', lang), 'error')
    const headers = ['Category', 'Self', 'Team', 'Team trim', 'Diff', 'Diff trim']
    const pdfRows = rows.map((c) => {
      const peerTrim = Number(c.peerTrimmed || 0) || 0
      const diffTrim = c.self && peerTrim ? Math.round((c.self - peerTrim) * 100) / 100 : 0
      return [
        c.name,
        String(c.self || 0),
        String(c.peer || 0),
        peerTrim ? String(peerTrim) : '—',
        String(c.diff || 0),
        c.self && peerTrim ? String(diffTrim) : '—',
      ]
    })
    printTableReport(
      `${result.targetName} — ${lang === 'en' ? 'Extra duty comparison' : 'Ek görev karşılaştırma'}`,
      headers,
      pdfRows
    )
  }

  const runAiExplainForPerson = useCallback(async (targetId: string) => {
    const row = results.find((r) => String(r.targetId) === String(targetId))
    if (!row) return

    const risk = riskScorecard.find((x) => String(x.targetId) === String(targetId))
    const avgGapRows = gapReports.topCategoryGaps.filter((g) => g.person === row.targetName).slice(0, 10)
    const avgGapVal = avgGapRows.length
      ? avgGapRows.reduce((s, g) => s + Math.abs(Number(g.diff || 0)), 0) / avgGapRows.length
      : null

    const prev = prevResults.find((r) => String(r.targetId) === String(targetId))
    const useCombined =
      isSchoolOrg && Number(row.genelOkulYasamCombinedAvg || 0) > 0
    const primaryOverall = useCombined
      ? Number(row.genelOkulYasamCombinedAvg || 0)
      : Number(row.overallAvg || 0)
    const delta = prev
      ? Math.round(
          (primaryOverall -
            Number(
              useCombined
                ? prev.genelOkulYasamCombinedAvg ?? prev.overallAvg ?? 0
                : prev.overallAvg ?? 0
            )) *
            100
        ) / 100
      : null
    const coverageRow = (coverage || []).find((c) => String(c.targetId) === String(targetId))
    const nonSelfCoverage = coverageRow
      ? Number(coverageRow.managerCompleted || 0) +
        Number(coverageRow.peerCompleted || 0) +
        Number(coverageRow.subordinateCompleted || 0) +
        Number(coverageRow.executiveCompleted || 0)
      : null
    const dataScope = useCombined
      ? t('aiExplainDataScopeNote', lang)
      : lang === 'en'
        ? 'Data scope: General evaluation only (no School Life merge).'
        : lang === 'fr'
          ? 'Périmètre : évaluation générale uniquement.'
          : 'Veri kapsamı: Yalnızca Genel değerlendirme.'

    setAiExplainLoadingTargetId(String(targetId))
    try {
      const resp = await fetch(`/api/admin/results/ai-explain?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataScope,
          person: {
            name: row.targetName,
            department: row.targetDept,
            selfScore: row.selfScore,
            teamScore: row.peerAvg,
            overallScore: primaryOverall,
            combinedScore: row.genelOkulYasamCombinedAvg ?? null,
            genelOnlyOverall: row.overallAvg,
            standardAvg: row.standardAvg,
            evaluatorCount:
              row.peerEvaluatorCompletedScorable ??
              row.peerEvaluatorCountForTrim ??
              (row.evaluations?.length || 0),
            periodDelta: delta,
            avgGap: avgGapVal === null ? null : Math.round(avgGapVal * 100) / 100,
            riskScore:
              isSchoolOrg && risk?.hasCombined && risk.riskScoreCombined != null
                ? risk.riskScoreCombined
                : risk?.riskScore ?? null,
            riskScoreGenelOnly: risk?.riskScore ?? null,
            swotPeerStrengths: (row.swot?.peer?.strengths || []).slice(0, 4).map((x: any) => x.name),
            swotPeerWeaknesses: (row.swot?.peer?.weaknesses || []).slice(0, 4).map((x: any) => x.name),
            riskBreakdown: risk?.explain
              ? {
                  lowPerformance: risk.explain.lowScore,
                  trend: risk.explain.trend,
                  gap: risk.explain.gap,
                  coverage: risk.explain.coverage,
                }
              : null,
          },
          tableHeaders: [
            {
              key: 'dataScope',
              label: lang === 'en' ? 'Data scope' : lang === 'fr' ? 'Périmètre' : 'Veri kapsamı',
              value: dataScope,
            },
            { key: 'self', label: t('selfShort', lang), value: String(Number(row.selfScore || 0).toFixed(2)) },
            { key: 'team', label: t('teamShort', lang), value: String(Number(row.peerAvg || 0).toFixed(2)) },
            { key: 'standard', label: t('standardShort', lang), value: String(Number(row.standardAvg || 0).toFixed(2)) },
            {
              key: 'overall',
              label: useCombined
                ? lang === 'en'
                  ? 'Gen. & SL (combined)'
                  : lang === 'fr'
                    ? 'Gén. & VS (combiné)'
                    : 'Gen. & OY (birleşik)'
                : t('overallShort', lang),
              value: String(primaryOverall.toFixed(2)),
            },
            {
              key: 'evaluators',
              label: t('evaluatorsShort', lang),
              value: String(
                row.peerEvaluatorCompletedScorable ??
                  row.peerEvaluatorCountForTrim ??
                  (row.evaluations?.length || 0)
              ),
            },
            {
              key: 'riskScore',
              label: lang === 'en' ? 'Risk score' : lang === 'fr' ? 'Score risque' : 'Risk puanı',
              value: risk
                ? String(
                    isSchoolOrg && risk.hasCombined && risk.riskScoreCombined != null
                      ? risk.riskScoreCombined
                      : risk.riskScore
                  )
                : '—',
            },
            { key: 'periodDelta', label: lang === 'en' ? 'Period delta' : lang === 'fr' ? 'Delta période' : 'Dönem farkı', value: delta === null ? '—' : delta.toFixed(2) },
            { key: 'avgGap', label: lang === 'en' ? 'Avg self-team gap' : lang === 'fr' ? 'Écart moyen auto-équipe' : 'Ort. öz-ekip farkı', value: avgGapVal === null ? '—' : (Math.round(avgGapVal * 100) / 100).toFixed(2) },
            { key: 'coverageNonSelf', label: lang === 'en' ? 'Coverage (non-self)' : lang === 'fr' ? 'Couverture (hors auto)' : 'Kapsama (öz hariç)', value: nonSelfCoverage === null ? '—' : String(nonSelfCoverage) },
            {
              key: 'riskLowPerformance',
              label: lang === 'en' ? 'Risk: low performance' : lang === 'fr' ? 'Risque: perf. faible' : 'Risk: düşük performans',
              value: risk?.explain ? `${risk.explain.lowScore}%` : '—',
            },
            {
              key: 'riskTrend',
              label: lang === 'en' ? 'Risk: trend' : lang === 'fr' ? 'Risque: tendance' : 'Risk: trend',
              value: risk?.explain ? `${risk.explain.trend}%` : '—',
            },
            {
              key: 'riskGap',
              label: lang === 'en' ? 'Risk: gap' : lang === 'fr' ? 'Risque: écart' : 'Risk: gap',
              value: risk?.explain ? `${risk.explain.gap}%` : '—',
            },
            {
              key: 'riskCoverage',
              label: lang === 'en' ? 'Risk: coverage' : lang === 'fr' ? 'Risque: couverture' : 'Risk: kapsama',
              value: risk?.explain ? `${risk.explain.coverage}%` : '—',
            },
          ],
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'AI açıklaması alınamadı')
      setAiExplainByTargetId((prev2) => ({ ...prev2, [String(targetId)]: payload.ai }))
      setAiExplainMetaByTargetId((prev2) => ({
        ...prev2,
        [String(targetId)]: { model: String(payload?.model || ''), warning: payload?.warning ? String(payload.warning) : '' },
      }))
    } catch (e: any) {
      toast(String(e?.message || 'AI açıklaması alınamadı'), 'error')
    } finally {
      setAiExplainLoadingTargetId(null)
    }
  }, [results, prevResults, riskScorecard, gapReports.topCategoryGaps, coverage, lang, isSchoolOrg])

  const updateAnalyticsWeight = (key: keyof AnalyticsWeights, value: number) => {
    setAnalyticsWeights((prev) => {
      const next: AnalyticsWeights = {
        ...prev,
        [key]: value,
      }
      return normalizeWeights(next)
    })
  }

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-emerald-600'
    if (score >= 3) return 'text-blue-600'
    if (score >= 2) return 'text-amber-600'
    return 'text-red-600'
  }

  const getScoreBadge = (score: number): 'success' | 'info' | 'warning' | 'danger' => {
    if (score >= 4) return 'success'
    if (score >= 3) return 'info'
    if (score >= 2) return 'warning'
    return 'danger'
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">📈 {t('resultsReports', lang)}</h1>
        <p className="text-[var(--muted)] mt-1">{t('resultsReportsSubtitle', lang)}</p>
      </div>

      {reportsBlocked ? (
        <ReportsMaintenanceScreen lang={lang} />
      ) : (
        <>
      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🔍 {t('filters', lang)}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
          {isSuperAdmin ? (
            <ReportsMaintenanceToggle
              lang={lang}
              enabled={reportsMaintenance}
              loading={maintenanceLoading}
              saving={maintenanceSaving}
              onToggle={toggleReportsMaintenance}
            />
          ) : null}
          {isSuperAdmin ? (
            <AdminReportsCatalogConfigPanel
              lang={lang}
              config={reportCatalogConfig}
              loading={maintenanceLoading}
              saving={catalogSaving}
              onSave={saveReportCatalogConfig}
            />
          ) : null}
          {isSuperAdmin ? (
            <AdminReportsVisibilityPanel
              lang={lang}
              enabledIds={orgVisibleReportIdsResolved}
              loading={maintenanceLoading}
              saving={visibilitySaving}
              onSave={saveOrgReportsVisibility}
            />
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
            <div className="w-full">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{t('period', lang)}</label>
              <Select
                options={periods.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${assessmentKindLabel(p.assessmentKind, lang)})`,
                }))}
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                placeholder={t('selectPeriodPlaceholder', lang)}
              />
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{t('organization', lang)}</label>
              <Select
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                placeholder={t('allOrganizations', lang)}
                disabled={user?.role === 'org_admin'}
              />
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{t('departmentLabel', lang)}</label>
              <Select
                options={[{ value: '', label: t('allDepartments', lang) }, ...departments.map((d) => ({ value: d, label: d }))]}
                value={selectedDept}
                onChange={(e) => {
                  const next = e.target.value
                  setSelectedDept(next)
                  // If current person doesn't belong to the selected dept, clear person filter
                  if (next && selectedPerson) {
                    const u = users.find((x) => x.id === selectedPerson)
                    if (!u || String(u.department || '') !== String(next)) setSelectedPerson('')
                  }
                }}
                placeholder={t('allDepartments', lang)}
              />
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{t('person', lang)}</label>
              <Select
                options={filteredUsers.map(u => ({ value: u.id, label: u.name }))}
                value={selectedPerson}
                onChange={(e) => setSelectedPerson(e.target.value)}
                placeholder={t('allPeople', lang)}
              />
            </div>
            <Button onClick={() => void loadResults()} className="w-full sm:w-auto">
              <Search className="w-4 h-4" />
              {t('applyFilters', lang)}
            </Button>
            <ReportExportButtons onExcel={exportToExcel} onPdf={printSummaryPdf} />
            <ReportExportButtons onExcel={exportAllCategoryCompareToExcel} onPdf={printAllCategoryComparePdf} />
            <Button variant="secondary" onClick={() => void loadParticipation()} className="w-full sm:w-auto">
              <BarChart3 className="w-4 h-4" />
              {lang === 'en' ? 'Participation' : lang === 'fr' ? 'Participation' : 'Katılım'}
            </Button>
            <Button variant="secondary" onClick={() => void loadCoverage()} className="w-full sm:w-auto">
              <User className="w-4 h-4" />
              {lang === 'en' ? 'Coverage' : lang === 'fr' ? 'Couverture' : 'Kapsama'}
            </Button>
            <Button variant="secondary" onClick={() => void loadNoOpinionReport()} disabled={loadingNoOpinionReport} className="w-full sm:w-auto">
              {loadingNoOpinionReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              {t('noOpinionReportButton', lang)}
            </Button>
            <Button variant="secondary" onClick={() => void loadEvaluatorAnswerDetail()} disabled={loadingEvaluatorAnswerDetail} className="w-full sm:w-auto">
              {loadingEvaluatorAnswerDetail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {t('evaluatorAnswerDetailButton', lang)}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void loadPersonQuestionPeerAverages()}
              disabled={!selectedPerson || loadingPersonQuestionPeerAverages}
              className="w-full sm:w-auto"
            >
              {loadingPersonQuestionPeerAverages ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
              {t('personQuestionPeerAveragesButton', lang)}
            </Button>
          </div>
          <div className="flex flex-wrap items-start gap-3 pt-1 border-t border-[var(--border)]">
            <label className="inline-flex items-start gap-2.5 cursor-pointer text-sm text-[var(--foreground)] max-w-xl">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[var(--border)] w-4 h-4 shrink-0 accent-[var(--brand)]"
                checked={showPeerDetail}
                onChange={(e) => {
                  const checked = e.target.checked
                  setShowPeerDetail(checked)
                  try {
                    localStorage.setItem(ADMIN_RESULTS_PEER_DETAIL_STORAGE_KEY, checked ? '1' : '0')
                  } catch {
                    /* ignore */
                  }
                  if (selectedPeriod && (selectedOrg || organizationId)) {
                    void loadResults({ includePeerDetail: checked })
                  }
                }}
              />
              <span>
                <span className="font-medium">{t('adminResultsPeerDetailToggleLabel', lang)}</span>
                <span className="block text-xs text-[var(--muted)] mt-1">{t('adminResultsPeerDetailToggleHint', lang)}</span>
              </span>
            </label>
          </div>
          </div>
        </CardBody>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      ) : results.length === 0 && !participation && !coverage && !noOpinionReport ? (
        <Card>
          <CardBody className="py-12 text-center text-[var(--muted)]">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-[var(--muted)]/40" />
            <p>{t('applyFiltersToSeeResults', lang)}</p>
          </CardBody>
        </Card>
      ) : (
        <>
          {(results.length > 0 || matrixStructureReport) ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <Button
                  variant={activeTab === 'overview' ? 'success' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    setActiveTab('overview')
                    setSelectedReportSection('summary')
                  }}
                >
                  {lang === 'en' ? 'Overview' : lang === 'fr' ? "Vue d'ensemble" : 'Genel görünüm'}
                </Button>
                <Button
                  variant={activeTab === 'analytics' ? 'success' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    setActiveTab('analytics')
                    const first = reportSectionOptions.find((o) => o.tab === 'analytics')
                    if (first) setSelectedReportSection(first.id)
                  }}
                >
                  {lang === 'en' ? 'Analytics' : lang === 'fr' ? 'Analytique' : 'Analitik'}
                </Button>
                <span className="text-xs text-[var(--muted)] ml-1">
                  {lang === 'en'
                    ? 'Modules are computed from existing results (no DB changes).'
                    : lang === 'fr'
                      ? "Modules calculés depuis les résultats existants (sans changer la base)."
                      : 'Modüller mevcut sonuçlardan hesaplanır (DB değişikliği yok).'}
                </span>
              </div>

              <Card className="mb-6 border-[var(--brand)]/20">
                <CardBody className="py-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                      {selectedPeriodAssessment ? (
                        <div className="text-sm text-[var(--muted)] lg:pb-2">
                          {lang === 'en' ? 'Evaluation type' : lang === 'fr' ? "Type d'évaluation" : 'Değerlendirme türü'}:{' '}
                          <Badge variant={selectedPeriodAssessment.kind === 'job_evaluation' ? 'warning' : 'info'}>
                            {selectedPeriodAssessment.label}
                          </Badge>
                          {!isSchoolOrg ? (
                            <span className="block text-xs mt-1">
                              {lang === 'en'
                                ? 'School-only reports are hidden for this organization.'
                                : lang === 'fr'
                                  ? 'Les rapports scolaires sont masqués pour cette organisation.'
                                  : 'Bu kurumda okula özel raporlar gösterilmez.'}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                        {t('adminReportsGroupedSelectorLabel', lang)}
                      </label>
                      <GroupedReportSelector
                        lang={lang}
                        options={reportSectionOptions}
                        selectedId={selectedReportSection}
                        onSelect={(next) => {
                          setSelectedReportSection(next)
                          const tab = tabForReportSection(next, reportSectionOptions)
                          setActiveTab(tab === 'aux' ? 'overview' : tab)
                        }}
                      />
                    </div>
                  </div>
                </CardBody>
              </Card>
            </>
          ) : null}

          {showReport('participation') && participation ? (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>{reportDisplay('participation', lang === 'en' ? 'Participation report' : lang === 'fr' ? 'Rapport de participation' : 'Katılım raporu').title}</CardTitle>
                    <ReportCatalogSubtitle catalogDescription={reportDisplay('participation').description} />
                    <ReportPurposeNote purposeKey="reportPurpose_participation" />
                  </div>
                  <ReportExportButtons onExcel={exportParticipationCsv} onPdf={printParticipationPdf} />
                </div>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="text-sm text-[var(--muted)]">{lang === 'en' ? 'Total assignments' : lang === 'fr' ? 'Total des affectations' : 'Toplam atama'}</div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{participation.totals.total}</div>
                  </div>
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="text-sm text-[var(--muted)]">{lang === 'en' ? 'Completed' : lang === 'fr' ? 'Terminées' : 'Tamamlanan'}</div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{participation.totals.completed}</div>
                  </div>
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="text-sm text-[var(--muted)]">{lang === 'en' ? 'Pending' : lang === 'fr' ? 'En attente' : 'Bekleyen'}</div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{participation.totals.pending}</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Total' : lang === 'fr' ? 'Total' : 'Toplam'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Completed' : lang === 'fr' ? 'Terminées' : 'Tamamlanan'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Pending' : lang === 'fr' ? 'En attente' : 'Bekleyen'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Completion' : lang === 'fr' ? 'Taux' : 'Oran'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {participation.departments.map((d) => {
                        const rate = d.total ? Math.round((d.completed / d.total) * 100) : 0
                        return (
                          <tr key={d.department}>
                            <td className="py-2 px-3 text-[var(--foreground)]">{d.department}</td>
                            <td className="py-2 px-3 text-right text-[var(--foreground)]">{d.total}</td>
                            <td className="py-2 px-3 text-right text-[var(--foreground)]">{d.completed}</td>
                            <td className="py-2 px-3 text-right text-[var(--foreground)]">{d.pending}</td>
                            <td className="py-2 px-3 text-right">
                              <Badge variant={rate >= 80 ? 'success' : rate >= 50 ? 'warning' : 'danger'}>{rate}%</Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {showReport('coverage') && coverage ? (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>{reportDisplay('coverage', lang === 'en' ? 'Evaluator coverage' : lang === 'fr' ? "Couverture des évaluateurs" : 'Değerlendirici kapsaması').title}</CardTitle>
                    <ReportCatalogSubtitle catalogDescription={reportDisplay('coverage').description} />
                    <ReportPurposeNote purposeKey="reportPurpose_coverage" />
                  </div>
                  <ReportExportButtons onExcel={exportCoverageCsv} onPdf={printCoveragePdf} />
                </div>
              </CardHeader>
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'}</th>
                        <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Completed' : lang === 'fr' ? 'Terminées' : 'Tamamlanan'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Pending' : lang === 'fr' ? 'En attente' : 'Bekleyen'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Manager' : lang === 'fr' ? 'Manager' : 'Yönetici'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Peer' : lang === 'fr' ? 'Pair' : 'Ekip'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Sub.' : lang === 'fr' ? 'Sub.' : 'Ast'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Exec.' : lang === 'fr' ? 'Dir.' : 'Üst'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Confidence' : lang === 'fr' ? 'Confiance' : 'Güven'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {coverage.map((r) => {
                        const nPeer = Number(r.managerCompleted || 0) + Number(r.peerCompleted || 0) + Number(r.subordinateCompleted || 0) + Number(r.executiveCompleted || 0)
                        const conf =
                          nPeer >= 5 ? { label: lang === 'en' ? 'High' : lang === 'fr' ? 'Élevée' : 'Yüksek', v: 'success' as const } :
                          nPeer >= 3 ? { label: lang === 'en' ? 'Medium' : lang === 'fr' ? 'Moyenne' : 'Orta', v: 'warning' as const } :
                          { label: lang === 'en' ? 'Low' : lang === 'fr' ? 'Faible' : 'Düşük', v: 'danger' as const }
                        return (
                          <tr key={r.targetId}>
                            <td className="py-2 px-3 text-[var(--foreground)]">{r.targetName}</td>
                            <td className="py-2 px-3 text-[var(--muted)]">{r.targetDept}</td>
                            <td className="py-2 px-3 text-right">{r.completedTotal}</td>
                            <td className="py-2 px-3 text-right">{r.pendingTotal}</td>
                            <td className="py-2 px-3 text-right">{r.selfCompleted}</td>
                            <td className="py-2 px-3 text-right">{r.managerCompleted}</td>
                            <td className="py-2 px-3 text-right">{r.peerCompleted}</td>
                            <td className="py-2 px-3 text-right">{r.subordinateCompleted}</td>
                            <td className="py-2 px-3 text-right">{r.executiveCompleted}</td>
                            <td className="py-2 px-3 text-right">
                              <Badge variant={conf.v}>{conf.label}</Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  {lang === 'en'
                    ? 'Confidence is based on non-self completed evaluator count.'
                    : lang === 'fr'
                      ? "La confiance est basée sur le nombre d'évaluateurs (hors auto) terminés."
                      : 'Güven, öz hariç tamamlanan değerlendirici sayısına göre hesaplanır.'}
                </div>
              </CardBody>
            </Card>
          ) : null}

          {showReport('no_opinion') && noOpinionReport ? (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{reportDisplay('no_opinion', t('noOpinionReportTitle', lang)).title}</CardTitle>
                    <ReportCatalogSubtitle catalogDescription={reportDisplay('no_opinion').description} />
                    <ReportPurposeNote>{t('noOpinionReportHint', lang)}</ReportPurposeNote>
                  </div>
                  <ReportExportButtons onExcel={exportNoOpinionCsv} onPdf={printNoOpinionPdf} />
                </div>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="text-sm text-[var(--muted)]">
                      {lang === 'en' ? 'All no opinion' : lang === 'fr' ? 'Tout sans avis' : 'Tamamı Fikrim yok'}
                    </div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{noOpinionReport.totals.allNoOpinionCount}</div>
                  </div>
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="text-sm text-[var(--muted)]">
                      {lang === 'en' ? 'Evaluators' : lang === 'fr' ? 'Évaluateurs' : 'Değerlendiren'}
                    </div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{noOpinionReport.totals.uniqueEvaluators}</div>
                  </div>
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="text-sm text-[var(--muted)]">
                      {lang === 'en' ? 'Targets affected' : lang === 'fr' ? 'Cibles concernées' : 'Etkilenen hedef'}
                    </div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{noOpinionReport.totals.uniqueTargets}</div>
                  </div>
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="text-sm text-[var(--muted)]">
                      {lang === 'en' ? 'Completed total' : lang === 'fr' ? 'Total terminé' : 'Tamamlanan (toplam)'}
                    </div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{noOpinionReport.totals.completedAssignments}</div>
                  </div>
                </div>

                {noOpinionReport.rows.length === 0 ? (
                  <p className="text-sm text-[var(--muted)] py-4 text-center">
                    {lang === 'en'
                      ? 'No completed evaluations with only “No opinion” answers in this period.'
                      : lang === 'fr'
                        ? 'Aucune évaluation terminée avec uniquement « Sans avis » sur cette période.'
                        : 'Bu dönemde yalnızca «Fikrim yok» ile tamamlanan değerlendirme yok.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--surface-2)] border-b border-[var(--border)] sticky top-0 z-10">
                        <tr>
                          <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                            {lang === 'en' ? 'Evaluator' : lang === 'fr' ? 'Évaluateur' : 'Değerlendiren'}
                          </th>
                          <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                            {lang === 'en' ? 'Target' : lang === 'fr' ? 'Cible' : 'Değerlendirilen'}
                          </th>
                          <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                            {lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}
                          </th>
                          <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                            {lang === 'en' ? 'Card' : lang === 'fr' ? 'Carte' : 'Kart'}
                          </th>
                          <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">
                            {lang === 'en' ? 'Answers' : lang === 'fr' ? 'Réponses' : 'Yanıt'}
                          </th>
                          <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                            {lang === 'en' ? 'Completed' : lang === 'fr' ? 'Terminé' : 'Tamamlanma'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {noOpinionReport.rows.map((r) => (
                          <tr key={r.assignmentId}>
                            <td className="py-2 px-3 text-[var(--foreground)]">
                              {r.evaluatorName}
                              {r.isSelf ? (
                                <Badge variant="info" className="ml-2 text-[10px]">
                                  {lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz'}
                                </Badge>
                              ) : null}
                            </td>
                            <td className="py-2 px-3 text-[var(--foreground)]">{r.targetName}</td>
                            <td className="py-2 px-3 text-[var(--muted)]">{r.targetDept}</td>
                            <td className="py-2 px-3 text-[var(--muted)]">{r.matrixContextLabel}</td>
                            <td className="py-2 px-3 text-right text-[var(--foreground)]">{r.responseCount}</td>
                            <td className="py-2 px-3 text-[var(--muted)] whitespace-nowrap">
                              {r.completedAt ? r.completedAt.slice(0, 10) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          ) : null}

          {loadingEvaluatorAnswerDetail ? <EvaluatorAnswerDetailLoadingCard /> : null}

          {showReport('evaluator_answer_detail') && evaluatorAnswerDetail ? (
            <EvaluatorAnswerDetailPanel
              data={evaluatorAnswerDetail}
              periodLabel={periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''}
              catalogTitle={reportDisplay('evaluator_answer_detail').title}
              catalogDescription={reportDisplay('evaluator_answer_detail').description}
            />
          ) : null}

          {loadingPersonQuestionPeerAverages ? <PersonQuestionPeerAveragesLoadingCard /> : null}

          {showReport('person_question_peer_averages') && personQuestionPeerAverages ? (
            <PersonQuestionPeerAveragesPanel
              data={personQuestionPeerAverages}
              periodLabel={periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''}
              catalogTitle={reportDisplay('person_question_peer_averages').title}
              catalogDescription={reportDisplay('person_question_peer_averages').description}
            />
          ) : null}

          {showReport('matrix_structure_period_summary') && isSchoolOrg && isJobEvaluationPeriod ? (
            <MatrixStructureReportPanel
              data={matrixStructureReport}
              loading={loading && !matrixStructureReport}
              periodLabel={periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''}
              mode="period_summary"
              catalogTitle={reportDisplay('matrix_structure_period_summary').title}
              catalogDescription={reportDisplay('matrix_structure_period_summary').description}
              selectedPersonId={selectedPerson}
              selectedPersonName={users.find((u) => u.id === selectedPerson)?.name || ''}
              showPeerDetail={showPeerDetail}
            />
          ) : null}

          {showReport('matrix_structure_question_scores') && isSchoolOrg && isJobEvaluationPeriod ? (
            <MatrixStructureReportPanel
              data={matrixStructureReport}
              loading={loading && !matrixStructureReport}
              periodLabel={periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''}
              mode="question_scores"
              catalogTitle={reportDisplay('matrix_structure_question_scores').title}
              catalogDescription={reportDisplay('matrix_structure_question_scores').description}
              selectedPersonId={selectedPerson}
              selectedPersonName={users.find((u) => u.id === selectedPerson)?.name || ''}
              showPeerDetail={showPeerDetail}
            />
          ) : null}

          {results.length > 0 ? (
          <>
          {showReport('summary') && summaryHeaderStats ? (
          <>
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              {reportDisplay('summary', 'Özet istatistikler').title}
            </h2>
            <ReportCatalogSubtitle catalogDescription={reportDisplay('summary').description} />
          </div>
          <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
              <User className="w-6 h-6 text-[var(--brand)] mb-2" />
              <div className="text-3xl font-bold text-[var(--foreground)]">{summaryHeaderStats.peopleCount}</div>
              <div className="text-sm text-[var(--muted)]">{t('peopleCount', lang)}</div>
            </div>
            {summaryHeaderStats.mode === 'job_evaluation' ? (
              <>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <TrendingUp className="w-6 h-6 text-[var(--success)] mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">
                    {summaryHeaderStats.matrixAvg != null ? summaryHeaderStats.matrixAvg.toFixed(2) : '—'}
                  </div>
                  <div className="text-sm text-[var(--muted)]">{t('averageScoreMatrixStructure', lang)}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <BarChart3 className="w-6 h-6 text-[var(--brand)] mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">{summaryHeaderStats.totalEvaluations}</div>
                  <div className="text-sm text-[var(--muted)]">{t('totalEvaluations', lang)}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <FileText className="w-6 h-6 text-[var(--warning)] mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">
                    {summaryHeaderStats.matrixHighest != null ? summaryHeaderStats.matrixHighest.toFixed(2) : '—'}
                  </div>
                  <div className="text-sm text-[var(--muted)]">{t('highestScoreMatrixStructure', lang)}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <TrendingDown className="w-6 h-6 text-rose-600 mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">
                    {summaryHeaderStats.matrixLowest != null ? summaryHeaderStats.matrixLowest.toFixed(2) : '—'}
                  </div>
                  <div className="text-sm text-[var(--muted)]">{t('lowestScoreMatrixStructure', lang)}</div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <Target className="w-6 h-6 text-[var(--brand)] mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">
                    {summaryHeaderStats.avgSelf != null ? summaryHeaderStats.avgSelf.toFixed(2) : '—'}
                  </div>
                  <div className="text-sm text-[var(--muted)]">{t('selfEvaluation', lang)}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <Users className="w-6 h-6 text-[var(--success)] mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">
                    {summaryHeaderStats.avgPeer != null ? summaryHeaderStats.avgPeer.toFixed(2) : '—'}
                  </div>
                  <div className="text-sm text-[var(--muted)]">{t('teamEvaluation', lang)}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <TrendingUp className="w-6 h-6 text-amber-600 mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">
                    {summaryHeaderStats.avgTrim != null ? summaryHeaderStats.avgTrim.toFixed(2) : '—'}
                  </div>
                  <div className="text-sm text-[var(--muted)]" title={t('reportTrimRulesHint', lang)}>
                    {t('reportTrimRulesColumn', lang)}
                  </div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <TrendingUp className="w-6 h-6 text-amber-500 mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">
                    {summaryHeaderStats.avgTrimGeneral != null ? summaryHeaderStats.avgTrimGeneral.toFixed(2) : '—'}
                  </div>
                  <div className="text-sm text-[var(--muted)]" title={t('reportTrimGeneralHint', lang)}>
                    {t('reportTrimGeneralColumn', lang)}
                  </div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <BarChart3 className="w-6 h-6 text-[var(--brand)] mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">{summaryHeaderStats.totalEvaluations}</div>
                  <div className="text-sm text-[var(--muted)]">{t('totalEvaluations', lang)}</div>
                </div>
              </>
            )}
          </div>
          </>
          ) : null}

              {showReport('analytics_weights') ? (
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-5 h-5 text-[var(--brand)]" />
                      <div className="min-w-0">
                        <CardTitle>{reportDisplay('analytics_weights', 'Analitik ağırlık yönetimi').title}</CardTitle>
                        <ReportCatalogSubtitle catalogDescription={reportDisplay('analytics_weights').description} />
                        <ReportPurposeNote purposeKey="reportPurpose_analyticsWeights" />
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setAnalyticsWeights(DEFAULT_ANALYTICS_WEIGHTS)}
                    >
                      {lang === 'en' ? 'Reset defaults' : lang === 'fr' ? 'Réinitialiser' : 'Varsayılanlar'}
                    </Button>
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    {([
                      ['riskOverall', 'Risk / Düşük performans'],
                      ['riskTrend', 'Risk / Trend düşüşü'],
                      ['riskGap', 'Risk / Gap'],
                      ['riskCoverage', 'Risk / Kapsama'],
                      ['healthPerformance', 'Health / Performans'],
                      ['healthParticipation', 'Health / Katılım'],
                      ['healthCoverage', 'Health / Kapsama'],
                      ['healthTrend', 'Health / Trend'],
                    ] as Array<[keyof AnalyticsWeights, string]>).map(([key, label]) => (
                      <label key={key} className="rounded-xl border border-[var(--border)] p-3 bg-[var(--surface-2)]/40">
                        <div className="text-xs text-[var(--muted)] mb-2">{label}</div>
                        <input
                          type="range"
                          min={0.05}
                          max={0.8}
                          step={0.01}
                          value={analyticsWeights[key]}
                          onChange={(e) => updateAnalyticsWeight(key, Number(e.target.value))}
                          className="w-full"
                        />
                        <div className="text-right text-xs text-[var(--foreground)] mt-1">{(analyticsWeights[key] * 100).toFixed(0)}%</div>
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <label className="rounded-xl border border-[var(--border)] p-3 bg-[var(--surface-2)]/40 text-sm">
                      <div className="text-xs text-[var(--muted)] mb-2">Erken uyarı / Birim düşüş eşiği (Δ)</div>
                      <input
                        type="number"
                        step={0.1}
                        value={analyticsWeights.warningDropThreshold}
                        onChange={(e) => setAnalyticsWeights((prev) => ({ ...prev, warningDropThreshold: Number(e.target.value) || 0 }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                      />
                    </label>
                    <label className="rounded-xl border border-[var(--border)] p-3 bg-[var(--surface-2)]/40 text-sm">
                      <div className="text-xs text-[var(--muted)] mb-2">Erken uyarı / Düşük skor eşiği</div>
                      <input
                        type="number"
                        step={0.1}
                        value={analyticsWeights.warningLowScoreThreshold}
                        onChange={(e) => setAnalyticsWeights((prev) => ({ ...prev, warningLowScoreThreshold: Number(e.target.value) || 0 }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                      />
                    </label>
                  </div>
                  <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <div className="font-semibold text-[var(--foreground)]">
                        {lang === 'en' ? 'Early warning rules (explainable)' : lang === 'fr' ? "Règles d'alerte (explicables)" : 'Erken uyarı kuralları (açıklanabilir)'}
                      </div>
                      <ReportExportButtons onExcel={exportAnalyticsWarningRulesCsv} onPdf={printAnalyticsWarningRulesPdf} />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-2 px-3">{lang === 'en' ? 'Rule' : lang === 'fr' ? 'Règle' : 'Kural'}</th>
                            <th className="text-left py-2 px-3">{lang === 'en' ? 'Logic' : lang === 'fr' ? 'Logique' : 'Mantık'}</th>
                            <th className="text-right py-2 px-3">{lang === 'en' ? 'Triggered' : lang === 'fr' ? 'Déclenché' : 'Tetiklenen'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {warningRules.map((r) => (
                            <tr key={r.key}>
                              <td className="py-2 px-3 font-medium text-[var(--foreground)]">{r.title}</td>
                              <td className="py-2 px-3 text-[var(--muted)]">{r.logic}</td>
                              <td className="py-2 px-3 text-right">
                                <Badge variant={r.count > 0 ? 'warning' : 'success'}>{r.count}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-2">
                      {lang === 'en'
                        ? 'These are the exact rules used to generate the Early Warning panel.'
                        : lang === 'fr'
                          ? "Ce sont les règles exactes utilisées pour générer le panneau d'alerte."
                          : 'Bu kurallar, Early Warning panelini üretmek için kullanılan birebir kurallardır.'}
                    </div>
                  </div>
                </CardBody>
              </Card>
              ) : null}

              {showReport('analytics_dept') ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {departmentAnalytics.usesMatrixScoring ? (
                  <p className="lg:col-span-2 text-xs text-[var(--muted)] -mt-2 mb-1">{t('matrixDeptAnalyticsFootnote', lang)}</p>
                ) : null}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle>{reportDisplay('analytics_dept', 'Birimler — en yüksek risk').title}</CardTitle>
                        <ReportCatalogSubtitle catalogDescription={reportDisplay('analytics_dept').description} />
                        <ReportPurposeNote purposeKey={analyticsPurposeKey('reportPurpose_deptRisk', 'reportPurpose_deptRisk_pd')} />
                      </div>
                      <ReportExportButtons onExcel={exportAnalyticsDeptRiskCsv} onPdf={printAnalyticsDeptRiskPdf} />
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-2 px-3">#</th>
                            <th className="text-left py-2 px-3">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                            <th className="text-right py-2 px-3">{lang === 'en' ? 'Avg risk' : lang === 'fr' ? 'Risque moy.' : 'Ort. risk'}</th>
                            <th className="text-right py-2 px-3">{lang === 'en' ? 'High risk' : lang === 'fr' ? 'Élevé' : 'Yüksek risk'}</th>
                            <th className="text-right py-2 px-3">{lang === 'en' ? 'Low score' : lang === 'fr' ? 'Score bas' : 'Düşük skor'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {departmentAnalytics.riskRank.slice(0, 10).map((r) => (
                            <tr key={`risk-${r.department}`} className="hover:bg-[var(--surface-2)]/40">
                              <td className="py-2 px-3 font-semibold">{r.rank}</td>
                              <td className="py-2 px-3 font-medium text-[var(--foreground)]">{r.department}</td>
                              <td className="py-2 px-3 text-right">
                                <Badge variant={r.avgRisk >= 70 ? 'danger' : r.avgRisk >= 40 ? 'warning' : 'success'}>{r.avgRisk.toFixed(2)}</Badge>
                              </td>
                              <td className="py-2 px-3 text-right">{r.highRisk}</td>
                              <td className="py-2 px-3 text-right">{r.lowScore}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle>{reportDisplay('analytics_dept', 'Birimler — en yüksek performans').title}</CardTitle>
                        <ReportCatalogSubtitle catalogDescription={reportDisplay('analytics_dept').description} />
                        <ReportPurposeNote purposeKey={analyticsPurposeKey('reportPurpose_deptPerformance', 'reportPurpose_deptPerformance_pd')} />
                      </div>
                      <ReportExportButtons onExcel={exportAnalyticsDeptHealthCsv} onPdf={printAnalyticsDeptHealthPdf} />
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-2 px-3">#</th>
                            <th className="text-left py-2 px-3">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                            <th className="text-right py-2 px-3">
                              {departmentAnalytics.usesMatrixScoring
                                ? t('matrixDeptAnalyticsAvgMatrixColumn', lang)
                                : lang === 'en'
                                  ? 'Avg overall'
                                  : lang === 'fr'
                                    ? 'Global moy.'
                                    : 'Ort. genel'}
                            </th>
                            <th className="text-right py-2 px-3">{lang === 'en' ? 'Δ' : lang === 'fr' ? 'Δ' : 'Δ'}</th>
                            <th className="text-right py-2 px-3">{lang === 'en' ? 'People' : lang === 'fr' ? 'Pers.' : 'Kişi'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {departmentAnalytics.healthRank.slice(0, 10).map((r) => (
                            <tr key={`health-${r.department}`} className="hover:bg-[var(--surface-2)]/40">
                              <td className="py-2 px-3 font-semibold">{r.rank}</td>
                              <td className="py-2 px-3 font-medium text-[var(--foreground)]">{r.department}</td>
                              <td className="py-2 px-3 text-right">
                                <Badge variant={getScoreBadge(r.avgOverall)}>{r.avgOverall.toFixed(2)}</Badge>
                              </td>
                              <td className="py-2 px-3 text-right">
                                {r.delta === null ? <span className="text-[var(--muted)]">—</span> : (r.delta > 0 ? <span className="text-emerald-600 font-medium">+{r.delta.toFixed(2)}</span> : r.delta < 0 ? <span className="text-rose-600 font-medium">{r.delta.toFixed(2)}</span> : <span className="text-[var(--muted)]">0</span>)}
                              </td>
                              <td className="py-2 px-3 text-right text-[var(--muted)]">{r.people}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardBody>
                </Card>
              </div>
              ) : null}

              {showReport('analytics_health_risk') ? (
              <div className="mb-6">
                {riskScorecardUsesMatrix ? (
                  <p className="text-xs text-[var(--muted)] mb-3">{t('matrixOrgHealthRiskFootnote', lang)}</p>
                ) : null}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <HeartPulse className="w-5 h-5 text-emerald-600" />
                        <div className="min-w-0">
                          <CardTitle>{reportDisplay('analytics_health_risk', 'Organization Health Index').title}</CardTitle>
                          <ReportCatalogSubtitle catalogDescription={reportDisplay('analytics_health_risk').description} />
                          <ReportPurposeNote purposeKey={analyticsPurposeKey('reportPurpose_orgHealth', 'reportPurpose_orgHealth_pd')} />
                        </div>
                      </div>
                      <ReportExportButtons onExcel={exportHealthCsv} onPdf={printHealthPdf} />
                    </div>
                  </CardHeader>
                  <CardBody>
                    <div className="text-4xl font-bold text-[var(--foreground)] mb-2">{organizationHealth.score}</div>
                    <div className="text-xs text-[var(--muted)] mb-4">/100</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>{organizationHealth.usesMatrixScoring ? t('matrixOrgHealthPerformanceLabel', lang) : 'Performance'}</span>
                        <span>{organizationHealth.parts.performance}</span>
                      </div>
                      <div className="flex justify-between"><span>Participation</span><span>{organizationHealth.parts.participation}</span></div>
                      <div className="flex justify-between"><span>Coverage</span><span>{organizationHealth.parts.coverage}</span></div>
                      <div className="flex justify-between"><span>Trend</span><span>{organizationHealth.parts.trend}</span></div>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-3">ISO 30414 uyumu için KPI yapısı: katılım, kapsama, performans, trend.</p>
                  </CardBody>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-rose-600" />
                        <div className="min-w-0">
                          <CardTitle>{reportDisplay('analytics_health_risk', 'Risk Scorecard (Top 15)').title}</CardTitle>
                          <ReportCatalogSubtitle catalogDescription={reportDisplay('analytics_health_risk').description} />
                          <ReportPurposeNote purposeKey={analyticsPurposeKey('reportPurpose_riskScorecard', 'reportPurpose_riskScorecard_pd')} />
                        </div>
                      </div>
                      <ReportExportButtons onExcel={exportRiskScorecardCsv} onPdf={printRiskScorecardPdf} />
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-2 px-3">Kişi</th>
                            <th className="text-left py-2 px-3">Birim</th>
                            <th className="text-right py-2 px-3">Risk</th>
                            <th className="text-right py-2 px-3">
                              {riskScorecardUsesMatrix ? t('matrixPersonResultsCoreShort', lang) : 'Skor'}
                            </th>
                            {!riskScorecardUsesMatrix ? (
                              <th className="text-right py-2 px-3">Skor (trim)</th>
                            ) : null}
                            <th className="text-right py-2 px-3">Δ</th>
                            {!riskScorecardUsesMatrix ? (
                              <th className="text-right py-2 px-3">Δ (trim)</th>
                            ) : null}
                            <th className="text-right py-2 px-3">Gap</th>
                            <th className="text-right py-2 px-3">Kaps.</th>
                            <th className="text-right py-2 px-3 w-20">{lang === 'en' ? 'Detail' : lang === 'fr' ? 'Détail' : 'Detay'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {riskScorecard.slice(0, 15).map((r) => (
                            <>
                              <tr key={r.targetId} className="hover:bg-[var(--surface-2)]/40">
                                <td className="py-2 px-3">
                                  <button
                                    type="button"
                                    className="font-medium text-[var(--foreground)] hover:underline"
                                    onClick={() => openPersonFromRisk(r.targetId)}
                                    title={lang === 'en' ? 'Open person report' : lang === 'fr' ? 'Ouvrir le rapport' : 'Kişi raporunu aç'}
                                  >
                                    {r.name}
                                  </button>
                                </td>
                                <td className="py-2 px-3 text-[var(--muted)]">{r.dept}</td>
                                <td className="py-2 px-3 text-right">
                                  <Badge variant={r.riskScore >= 70 ? 'danger' : r.riskScore >= 40 ? 'warning' : 'success'}>{r.riskScore}</Badge>
                                </td>
                                <td className="py-2 px-3 text-right">{r.overall.toFixed(2)}</td>
                                {!riskScorecardUsesMatrix ? (
                                  <td className="py-2 px-3 text-right text-[var(--muted)]">{r.overallTrim ? r.overallTrim.toFixed(2) : '—'}</td>
                                ) : null}
                                <td className="py-2 px-3 text-right">{r.delta.toFixed(2)}</td>
                                {!riskScorecardUsesMatrix ? (
                                  <td className="py-2 px-3 text-right text-[var(--muted)]">{r.deltaTrim.toFixed(2)}</td>
                                ) : null}
                                <td className="py-2 px-3 text-right">{r.avgGap.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right">{r.peerEvalCount}</td>
                                <td className="py-2 px-3 text-right">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setExpandedRiskTargetId(expandedRiskTargetId === r.targetId ? null : r.targetId)}
                                  >
                                    {expandedRiskTargetId === r.targetId ? (lang === 'en' ? 'Hide' : 'Kapat') : (lang === 'en' ? 'Show' : 'Aç')}
                                  </Button>
                                </td>
                              </tr>
                              {expandedRiskTargetId === r.targetId ? (
                                <tr key={`${r.targetId}-detail`}>
                                  <td className="py-3 px-3" colSpan={riskScorecardUsesMatrix ? 8 : 10}>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                                        <div className="text-xs text-[var(--muted)]">Düşük performans</div>
                                        <div className="text-lg font-bold text-[var(--foreground)]">{r.explain.lowScore}%</div>
                                      </div>
                                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                                        <div className="text-xs text-[var(--muted)]">Trend</div>
                                        <div className="text-lg font-bold text-[var(--foreground)]">{r.explain.trend}%</div>
                                      </div>
                                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                                        <div className="text-xs text-[var(--muted)]">Gap</div>
                                        <div className="text-lg font-bold text-[var(--foreground)]">{r.explain.gap}%</div>
                                      </div>
                                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                                        <div className="text-xs text-[var(--muted)]">Kapsama</div>
                                        <div className="text-lg font-bold text-[var(--foreground)]">{r.explain.coverage}%</div>
                                      </div>
                                    </div>
                                    {!riskScorecardUsesMatrix ? (
                                      <div className="mt-3 text-xs text-[var(--muted)]">
                                        {lang === 'en'
                                          ? `Trim risk: ${r.riskScoreTrim}/100 | Trim score: ${r.overallTrim.toFixed(2)} | Δtrim: ${r.deltaTrim.toFixed(2)}`
                                          : lang === 'fr'
                                            ? `Risque trim: ${r.riskScoreTrim}/100 | Score trim: ${r.overallTrim.toFixed(2)} | Δtrim: ${r.deltaTrim.toFixed(2)}`
                                            : `Trim risk: ${r.riskScoreTrim}/100 | Trim skor: ${r.overallTrim.toFixed(2)} | Δtrim: ${r.deltaTrim.toFixed(2)}`}
                                      </div>
                                    ) : null}
                                    <div className="text-xs text-[var(--muted)] mt-2">
                                      {lang === 'en'
                                        ? 'This breakdown explains why the risk score is high/low.'
                                        : lang === 'fr'
                                          ? 'Cette ventilation explique le score de risque.'
                                          : 'Bu kırılım risk puanının neden yüksek/düşük olduğunu açıklar.'}
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-[var(--muted)] px-3 py-2 border-t border-[var(--border)]">
                      {riskScorecardUsesMatrix
                        ? t('matrixRiskScorecardExplainFootnote', lang)
                        : 'Skor açıklanabilirlik: düşük performans + negatif trend + gap + kapsama bileşenlerinin ağırlıklı toplamı.'}
                    </p>
                    {!riskScorecardUsesMatrix ? (
                    <div className="px-3 py-3 border-t border-[var(--border)] bg-[var(--surface-2)]/30">
                      <div className="text-sm font-semibold text-[var(--foreground)] mb-2">
                        {lang === 'en' ? 'Most risky by trim score' : lang === 'fr' ? 'Risque le plus élevé (trim)' : "Trim'e göre en riskli"}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                            <tr>
                              <th className="text-left py-2 px-3 w-14">#</th>
                              <th className="text-left py-2 px-3">{lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'}</th>
                              <th className="text-left py-2 px-3">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                              <th className="text-right py-2 px-3">{lang === 'en' ? 'Risk (trim)' : lang === 'fr' ? 'Risque (trim)' : 'Risk (trim)'}</th>
                              <th className="text-right py-2 px-3">{lang === 'en' ? 'Score (trim)' : lang === 'fr' ? 'Score (trim)' : 'Skor (trim)'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {[...riskScorecard]
                              .sort((a, b) => Number(b.riskScoreTrim || 0) - Number(a.riskScoreTrim || 0))
                              .slice(0, 10)
                              .map((r, i) => (
                                <tr key={`rt-${r.targetId}`} className="hover:bg-[var(--surface-2)]/40">
                                  <td className="py-2 px-3 font-semibold">{i + 1}</td>
                                  <td className="py-2 px-3 font-medium text-[var(--foreground)]">{r.name}</td>
                                  <td className="py-2 px-3 text-[var(--muted)]">{r.dept}</td>
                                  <td className="py-2 px-3 text-right">
                                    <Badge variant={r.riskScoreTrim >= 70 ? 'danger' : r.riskScoreTrim >= 40 ? 'warning' : 'success'}>
                                      {r.riskScoreTrim}
                                    </Badge>
                                  </td>
                                  <td className="py-2 px-3 text-right text-[var(--muted)]">{Number(r.overallTrim || 0).toFixed(2)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    ) : null}
                  </CardBody>
                </Card>
              </div>
              </div>
              ) : null}

              {showReport('analytics_early_warning') ? (
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      <div className="min-w-0">
                        <CardTitle>{reportDisplay('analytics_early_warning', 'Trend & Early Warning Panel').title}</CardTitle>
                        <ReportCatalogSubtitle catalogDescription={reportDisplay('analytics_early_warning').description} />
                        <ReportPurposeNote purposeKey={analyticsPurposeKey('reportPurpose_trendEarlyWarning', 'reportPurpose_trendEarlyWarning_pd')} />
                      </div>
                    </div>
                    <ReportExportButtons onExcel={exportEarlyWarningsCsv} onPdf={printEarlyWarningsPdf} />
                  </div>
                </CardHeader>
                <CardBody>
                  {earlyWarningsUsesMatrix ? (
                    <p className="text-xs text-[var(--muted)] mb-3">{t('matrixEarlyWarningFootnote', lang)}</p>
                  ) : null}
                  <div className="space-y-2">
                    {earlyWarnings.map((w, idx) => (
                      <div key={`${w.title}-${idx}`} className={`rounded-xl border px-3 py-2 ${w.level === 'high' ? 'border-rose-300 bg-rose-500/5' : 'border-amber-300 bg-amber-500/5'}`}>
                        <div className="text-sm font-semibold text-[var(--foreground)]">{w.title}</div>
                        <div className="text-xs text-[var(--muted)] mt-0.5">{w.detail}</div>
                        <div className="text-xs mt-1">
                          <Badge variant={w.level === 'high' ? 'danger' : 'warning'}>{w.level === 'high' ? 'High' : 'Medium'}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-3">
                    {earlyWarningsUsesMatrix ? t('matrixEarlyWarningManagerNote', lang) : t('legacyEarlyWarningManagerNote', lang)}
                  </p>
                </CardBody>
              </Card>
              ) : null}

              {showReport('analytics_distribution') ? (
              <Card className="mb-6 overflow-hidden border-[var(--border)] shadow-sm">
                <CardHeader className="bg-[var(--surface-2)]/50 border-b border-[var(--border)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-[var(--brand)]" />
                      <div className="min-w-0">
                        <CardTitle>
                          {reportDisplay('analytics_distribution', 'Performans dağılımı ve kalibrasyon').title}
                        </CardTitle>
                        <ReportCatalogSubtitle catalogDescription={reportDisplay('analytics_distribution').description} />
                        <ReportPurposeNote purposeKey={analyticsPurposeKey('reportPurpose_performanceDistribution', 'reportPurpose_performanceDistribution_pd')} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ReportExportButtons onExcel={exportPerformanceDistributionCsv} onPdf={printPerformanceDistributionPdf} />
                      <ReportExportButtons onExcel={exportCalibrationByDepartmentCsv} onPdf={printCalibrationByDepartmentPdf} />
                    </div>
                  </div>
                </CardHeader>
                <CardBody>
                  {performanceDistributionUsesMatrix ? (
                    <p className="text-xs text-[var(--muted)] mb-4">{t('matrixPerformanceDistributionFootnote', lang)}</p>
                  ) : null}
                  <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="font-semibold text-[var(--foreground)] mb-2">
                      {lang === 'en' ? 'How to interpret' : lang === 'fr' ? 'Comment interpréter' : 'Nasıl yorumlanır?'}
                    </div>
                    <ul className="text-sm text-[var(--muted)] space-y-1">
                      <li>
                        <span className="font-medium text-[var(--foreground)]">Std (standart sapma)</span>{' '}
                        {lang === 'en'
                          ? 'low means scores are clustered (low differentiation); high means scores are spread.'
                          : lang === 'fr'
                            ? 'bas = scores regroupés (faible différenciation); élevé = scores répartis.'
                            : 'düşükse skorlar kümelenmiştir (ayırt edicilik düşer); yüksekse skorlar yaygındır.'}
                      </li>
                      <li>
                        <span className="font-medium text-[var(--foreground)]">P10/P50/P90</span>{' '}
                        {lang === 'en'
                          ? 'show the low/median/high bands; use them to define realistic development focus.'
                          : lang === 'fr'
                            ? 'montrent bas/médian/haut; utile pour définir des objectifs réalistes.'
                            : 'alt/medyan/üst bantları gösterir; gelişim hedeflerini gerçekçi koymak için.'}
                      </li>
                      <li>
                        <span className="font-medium text-[var(--foreground)]">Calibration (birim)</span>{' '}
                        {lang === 'en'
                          ? 'very high Avg with very low Std can indicate inflation or lack of differentiation.'
                          : lang === 'fr'
                            ? 'moyenne très élevée + écart-type très faible peut indiquer inflation.'
                            : 'çok yüksek ortalama + çok düşük Std; şişirme veya ayırt edememe göstergesi olabilir.'}
                      </li>
                    </ul>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={performanceOverallDistribution}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-xs text-[var(--muted)] mt-2">
                        {performanceDistributionUsesMatrix
                          ? t('matrixPerformanceDistributionChartHint', lang)
                          : lang === 'en'
                            ? 'Use this to see whether scores are clustered (calibration risk) or well-spread.'
                            : lang === 'fr'
                              ? 'Permet de voir si les scores sont trop regroupés (risque de calibration).'
                              : 'Skorlar çok kümelenmiş mi (kalibrasyon riski) yoksa yayılmış mı görmek için.'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-4">
                      <div className="font-semibold text-[var(--foreground)] mb-3">
                        {lang === 'en' ? 'Summary' : lang === 'fr' ? 'Résumé' : 'Özet'}
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-[var(--muted)]">N</span><span className="font-semibold">{performanceDistribution.n}</span></div>
                        <div className="flex justify-between">
                          <span className="text-[var(--muted)]">
                            {performanceDistributionUsesMatrix ? t('matrixPerformanceDistributionAvgLabel', lang) : 'Avg'}
                          </span>
                          <span className="font-semibold">{performanceDistribution.avg}</span>
                        </div>
                        <div className="flex justify-between"><span className="text-[var(--muted)]">Std</span><span className="font-semibold">{performanceDistribution.std}</span></div>
                        <div className="flex justify-between"><span className="text-[var(--muted)]">P10</span><span className="font-semibold">{performanceDistribution.p10}</span></div>
                        <div className="flex justify-between"><span className="text-[var(--muted)]">P50</span><span className="font-semibold">{performanceDistribution.p50}</span></div>
                        <div className="flex justify-between"><span className="text-[var(--muted)]">P90</span><span className="font-semibold">{performanceDistribution.p90}</span></div>
                      </div>
                    </div>
                  </div>

                  {calibrationByDepartment.length > 0 ? (
                    <div className="mt-6">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="font-semibold text-[var(--foreground)]">
                          {performanceDistributionUsesMatrix
                            ? lang === 'en'
                              ? 'Calibration by department (MATRIX)'
                              : lang === 'fr'
                                ? 'Calibration par département (MATRIX)'
                                : 'Birim bazlı kalibrasyon (MATRIX)'
                            : lang === 'en'
                              ? 'Calibration by department (overall)'
                              : lang === 'fr'
                                ? 'Calibration par département'
                                : 'Birim bazlı kalibrasyon (genel)'}
                        </div>
                        <span className="text-xs text-[var(--muted)]">
                          {lang === 'en' ? 'Sorted by avg (desc)' : lang === 'fr' ? 'Trié par moyenne' : 'Ortalamaya göre sıralı'}
                        </span>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
                        <table className="w-full text-sm">
                          <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                            <tr>
                              <th className="text-left py-2 px-3 w-14">#</th>
                              <th className="text-left py-2 px-3">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                              <th className="text-right py-2 px-3">N</th>
                              <th className="text-right py-2 px-3">
                                {performanceDistributionUsesMatrix
                                  ? t('matrixPerformanceDistributionAvgLabel', lang)
                                  : lang === 'en'
                                    ? 'Avg'
                                    : lang === 'fr'
                                      ? 'Moy.'
                                      : 'Ort.'}
                              </th>
                              <th className="text-right py-2 px-3">Std</th>
                              <th className="text-right py-2 px-3">P25</th>
                              <th className="text-right py-2 px-3">P50</th>
                              <th className="text-right py-2 px-3">P75</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {calibrationByDepartment.slice(0, 20).map((r) => (
                              <tr key={`cal-${r.department}`} className="hover:bg-[var(--surface-2)]/40">
                                <td className="py-2 px-3 font-semibold">{r.rank}</td>
                                <td className="py-2 px-3 font-medium text-[var(--foreground)]">{r.department}</td>
                                <td className="py-2 px-3 text-right text-[var(--muted)]">{r.n}</td>
                                <td className="py-2 px-3 text-right"><Badge variant={getScoreBadge(r.avg)}>{r.avg.toFixed(2)}</Badge></td>
                                <td className="py-2 px-3 text-right text-[var(--muted)]">{r.std.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-[var(--muted)]">{r.p25.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-[var(--muted)]">{r.p50.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-[var(--muted)]">{r.p75.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-[var(--muted)] mt-2">
                        {lang === 'en'
                          ? 'Calibration hint: very high avg with very low std may indicate inflation or lack of differentiation.'
                          : lang === 'fr'
                            ? 'Indice: moyenne très élevée + écart-type très faible peut indiquer inflation.'
                            : 'İpucu: çok yüksek ortalama + çok düşük std, şişirme ya da ayırt edememe göstergesi olabilir.'}
                      </p>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
              ) : null}

              {showReport('analytics_managers') ? (
              <Card className="mb-6 overflow-hidden border-[var(--border)] shadow-sm">
                <CardHeader className="bg-[var(--surface-2)]/50 border-b border-[var(--border)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-[var(--brand)]" />
                      <div className="min-w-0">
                        <CardTitle>{reportDisplay('analytics_managers', 'Yönetici etkinlik skor kartı').title}</CardTitle>
                        <ReportCatalogSubtitle catalogDescription={reportDisplay('analytics_managers').description} />
                        <ReportPurposeNote purposeKey={analyticsPurposeKey('reportPurpose_managerScorecard', 'reportPurpose_managerScorecard_pd')} />
                      </div>
                    </div>
                    <ReportExportButtons onExcel={exportManagerEffectivenessCsv} onPdf={printManagerEffectivenessPdf} />
                  </div>
                </CardHeader>
                <CardBody>
                  {managerEffectivenessUsesMatrix ? (
                    <p className="text-xs text-[var(--muted)] mb-4">{t('matrixManagerEffectivenessFootnote', lang)}</p>
                  ) : null}
                  <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="font-semibold text-[var(--foreground)] mb-2">
                      {lang === 'en' ? 'How to interpret' : lang === 'fr' ? 'Comment interpréter' : 'Nasıl yorumlanır?'}
                    </div>
                    <ul className="text-sm text-[var(--muted)] space-y-1">
                      <li>
                        <span className="font-medium text-[var(--foreground)]">
                          {lang === 'en' ? 'Targets' : lang === 'fr' ? 'Cibles' : 'Değerlendirdiği kişi'}
                        </span>{' '}
                        {lang === 'en'
                          ? 'is coverage: higher means more reliable comparison.'
                          : lang === 'fr'
                            ? 'mesure la couverture : plus élevé = comparaison plus fiable.'
                            : 'kapsamayı gösterir: yüksekse kıyas daha güvenilir.'}
                      </li>
                      <li>
                        <span className="font-medium text-[var(--foreground)]">
                          {lang === 'en' ? 'Leniency vs team' : lang === 'fr' ? "Écart vs équipe" : 'Ekipten sapma'}
                        </span>{' '}
                        {lang === 'en'
                          ? 'close to 0 means aligned scoring; large +/- means potential calibration issue.'
                          : lang === 'fr'
                            ? 'proche de 0 = aligné; grand +/- = possible problème de calibration.'
                            : "0'a yakınsa uyumlu puanlama; büyük +/- kalibrasyon problemi göstergesi olabilir."}
                      </li>
                      <li>
                        <span className="font-medium text-[var(--foreground)]">Effectiveness</span>{' '}
                        {lang === 'en'
                          ? 'is an explainable proxy: coverage + calibration (not “high scores”).'
                          : lang === 'fr'
                            ? "est un proxy explicable : couverture + calibration (pas “scores élevés”)."
                            : 'açıklanabilir bir vekil metriktir: kapsama + kalibrasyon (yüksek puan vermek değildir).'}
                      </li>
                    </ul>
                  </div>
                  {!managerEffectiveness.length ? (
                    <p className="text-sm text-[var(--muted)]">
                      {lang === 'en'
                        ? 'No evaluator-level scoring data found in this filter scope.'
                        : lang === 'fr'
                          ? "Aucune donnée de notation par évaluateur trouvée."
                          : 'Bu filtre kapsamında değerlendirici bazlı puanlama verisi bulunamadı.'}
                    </p>
                  ) : (
                    <>
                      <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto rounded-2xl border border-[var(--border)]">
                        <table className="w-full text-sm">
                          <thead className="bg-[var(--surface-2)] border-b border-[var(--border)] sticky top-0 z-10">
                            <tr>
                              <th className="text-left py-2 px-3 w-14">#</th>
                              <th className="text-left py-2 px-3">{lang === 'en' ? 'Level' : lang === 'fr' ? 'Niveau' : 'Seviye'}</th>
                              <th className="text-left py-2 px-3">{lang === 'en' ? 'Evaluator' : lang === 'fr' ? 'Évaluateur' : 'Değerlendirici'}</th>
                              <th className="text-right py-2 px-3">{lang === 'en' ? 'Targets' : lang === 'fr' ? 'Cibles' : 'Değerlendirdiği kişi'}</th>
                              <th className="text-right py-2 px-3">
                                {managerEffectivenessUsesMatrix
                                  ? t('matrixManagerEffectivenessAvgGivenLabel', lang)
                                  : lang === 'en'
                                    ? 'Avg given'
                                    : lang === 'fr'
                                      ? 'Moy. donnée'
                                      : 'Verdiği ort.'}
                              </th>
                              <th className="text-right py-2 px-3">
                                {managerEffectivenessUsesMatrix
                                  ? t('matrixManagerEffectivenessAvgTeamLabel', lang)
                                  : lang === 'en'
                                    ? 'Avg team'
                                    : lang === 'fr'
                                      ? 'Moy. équipe'
                                      : 'Ekip ort.'}
                              </th>
                              <th className="text-right py-2 px-3">{lang === 'en' ? 'Leniency vs team' : lang === 'fr' ? 'Écart vs équipe' : 'Ekipten sapma'}</th>
                              <th className="text-right py-2 px-3">{lang === 'en' ? 'Effectiveness' : lang === 'fr' ? 'Efficacité' : 'Etkinlik'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {managerEffectiveness.map((r) => (
                              <tr key={`mgr-${r.evaluatorId}`} className="hover:bg-[var(--surface-2)]/40">
                                <td className="py-2 px-3 font-semibold">{r.rank}</td>
                                <td className="py-2 px-3 text-[var(--muted)]">{positionLevelLabel(r.evaluatorLevel, lang)}</td>
                                <td className="py-2 px-3 font-medium text-[var(--foreground)]">{r.evaluatorName}</td>
                                <td className="py-2 px-3 text-right text-[var(--muted)]">{r.targets}</td>
                                <td className="py-2 px-3 text-right">{r.avgGiven.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-[var(--muted)]">{r.avgTeam.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right">
                                  {r.leniencyVsTeam > 0 ? (
                                    <span className="text-emerald-600 font-medium">+{r.leniencyVsTeam.toFixed(2)}</span>
                                  ) : r.leniencyVsTeam < 0 ? (
                                    <span className="text-rose-600 font-medium">{r.leniencyVsTeam.toFixed(2)}</span>
                                  ) : (
                                    <span className="text-[var(--muted)]">0</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <Badge variant={r.effectiveness >= 80 ? 'success' : r.effectiveness >= 60 ? 'info' : 'warning'}>
                                    {r.effectiveness}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-[var(--muted)] mt-2">
                        {managerEffectivenessUsesMatrix
                          ? t('matrixManagerEffectivenessExplainFootnote', lang)
                          : lang === 'en'
                            ? 'Explainability: effectiveness combines coverage (targets count) and calibration (leniency close to team average).'
                            : lang === 'fr'
                              ? "Explication : efficacité = couverture (nombre) + calibration (écart proche de l'équipe)."
                              : 'Açıklama: Etkinlik = kapsama (kaç kişiyi değerlendirdi) + kalibrasyon (ekip ortalamasına yakın sapma).'}
                        {' '}
                        {lang === 'en'
                          ? `Showing all ${managerEffectiveness.length} evaluators (executive → subordinate).`
                          : lang === 'fr'
                            ? `${managerEffectiveness.length} évaluateurs affichés (direction → subordonné).`
                            : `Tüm ${managerEffectiveness.length} değerlendirici gösteriliyor (üst yönetim → ast).`}
                      </p>
                    </>
                  )}
                </CardBody>
              </Card>
              ) : null}

              {showReport('analytics_evaluators') ? (
              <Card className="mb-6 overflow-hidden border-[var(--border)] shadow-sm">
                <CardHeader className="bg-[var(--surface-2)]/50 border-b border-[var(--border)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-[var(--brand)]" />
                      <div className="min-w-0">
                        <CardTitle>{reportDisplay('analytics_evaluators', 'Değerlendirici puanlama profili').title}</CardTitle>
                        <ReportCatalogSubtitle catalogDescription={reportDisplay('analytics_evaluators').description} />
                        <ReportPurposeNote purposeKey={analyticsPurposeKey('reportPurpose_evaluatorProfile', 'reportPurpose_evaluatorProfile_pd')} />
                      </div>
                    </div>
                    <ReportExportButtons onExcel={exportEvaluatorPeerCalibrationCsv} onPdf={printEvaluatorPeerCalibrationPdf} />
                  </div>
                </CardHeader>
                <CardBody>
                  {evaluatorPeerCalibrationUsesMatrix ? (
                    <p className="text-xs text-[var(--muted)] mb-4">{t('matrixEvaluatorCalibrationFootnote', lang)}</p>
                  ) : null}
                  <p className="text-xs text-[var(--muted)] mb-4 max-w-4xl leading-relaxed">
                    {evaluatorPeerCalibrationUsesMatrix
                      ? lang === 'en'
                        ? 'Per evaluator: among people they evaluated, each pair uses the MATRIX mean of per-question scores (1–5). Min/max show spread across targets; Δ compares their mean to the filtered cohort MATRIX average.'
                        : lang === 'fr'
                          ? "Par évaluateur : moyenne MATRIX par question pour chaque personne évaluée. Min/max = étendue ; Δ = écart vs moyenne cohorte MATRIX filtrée."
                          : 'Her değerlendirici için: değerlendirdiği her kişide soru bazlı MATRIX ortalaması kullanılır. Min/Max farklı kişilere verdiği en düşük/yüksek MATRIX ortalamayı gösterir; Δ filtrelenmiş kohort MATRIX ortalamasına göre sapmadır.'
                      : lang === 'en'
                        ? 'Per evaluator: among people they evaluated, we take each assignment’s average score (competency average). Min/max show how low/high they go across targets; “Δ vs cohort” compares their mean to the mean of all such team evaluations in this report scope.'
                        : lang === 'fr'
                          ? "Par évaluateur : parmi les personnes évaluées, moyenne par affectation. Min/max montrent l'étendue; « Δ vs cohorte » compare leur moyenne à la moyenne de toutes les évaluations d'équipe dans ce filtre."
                          : 'Her değerlendirici için: değerlendirdiği kişilerde, atama başına yetkinlik ortalaması kullanılır. Min/Max, farklı kişilere verdiği en düşük ve en yüksek ortalamayı gösterir. «Dönem ort.» ile fark, bu filtredeki tüm ekip değerlendirme satırlarının ortalamasına göre sapmadır (genel bonkör/sert eğilim).'}
                  </p>
                  <div className="flex flex-wrap gap-4 items-end mb-4">
                    <div className="w-56 min-w-[12rem]">
                      <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                        {lang === 'en' ? 'Evaluator level' : lang === 'fr' ? "Niveau d'évaluateur" : 'Değerlendirici seviyesi'}
                      </label>
                      <Select
                        options={[
                          {
                            value: 'all',
                            label:
                              lang === 'en' ? 'All levels' : lang === 'fr' ? 'Tous niveaux' : 'Tüm seviyeler',
                          },
                          { value: 'peer', label: lang === 'en' ? 'Peer' : lang === 'fr' ? 'Pair' : 'Akran (peer)' },
                          { value: 'manager', label: lang === 'en' ? 'Manager' : lang === 'fr' ? 'Manager' : 'Yönetici' },
                          { value: 'executive', label: lang === 'en' ? 'Executive' : lang === 'fr' ? 'Direction' : 'Üst yönetim' },
                          {
                            value: 'subordinate',
                            label: lang === 'en' ? 'Subordinate' : lang === 'fr' ? 'Subordonné' : 'Ast (subordinate)',
                          },
                        ]}
                        value={evaluatorCalLevel}
                        onChange={(e) =>
                          setEvaluatorCalLevel(
                            e.target.value as 'all' | 'peer' | 'manager' | 'executive' | 'subordinate'
                          )
                        }
                      />
                    </div>
                    <div className="w-44 min-w-[10rem]">
                      <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                        {lang === 'en' ? 'Coverage' : lang === 'fr' ? 'Couverture' : 'Kapsam'}
                      </label>
                      <Select
                        options={[
                          {
                            value: '1',
                            label: lang === 'en' ? 'N ≥ 1 (all)' : lang === 'fr' ? 'N ≥ 1 (tous)' : 'N ≥ 1 (hepsi)',
                          },
                          {
                            value: '2',
                            label:
                              lang === 'en'
                                ? 'N ≥ 2 (min 2 targets)'
                                : lang === 'fr'
                                  ? 'N ≥ 2 (min 2 cibles)'
                                  : 'N ≥ 2 (en az 2 kişi)',
                          },
                        ]}
                        value={String(evaluatorCalMinTargets)}
                        onChange={(e) => setEvaluatorCalMinTargets(Number(e.target.value) === 2 ? 2 : 1)}
                      />
                    </div>
                  </div>
                  {peerCalibrationContext.lineCount === 0 ? (
                    <p className="text-sm text-[var(--muted)]">
                      {lang === 'en'
                        ? 'No team evaluations with scorable scores for this level filter.'
                        : lang === 'fr'
                          ? 'Aucune ligne pour ce niveau.'
                          : 'Bu seviye filtresi için skorlanabilir ekip satırı yok.'}
                    </p>
                  ) : !evaluatorPeerCalibration.length ? (
                    <p className="text-sm text-[var(--muted)]">
                      {lang === 'en'
                        ? 'No rows match: try lowering min targets (N) or widening the level filter.'
                        : lang === 'fr'
                          ? 'Aucune ligne : réduisez N minimum ou élargissez le niveau.'
                          : 'Satır yok: N≥2 çok kısıtlayıcı olabilir veya seviye filtresini genişletin.'}
                    </p>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                        <span>
                          {evaluatorPeerCalibrationUsesMatrix
                            ? t('matrixEvaluatorCalibrationCohortLabel', lang)
                            : lang === 'en'
                              ? 'Cohort peer avg (filtered lines):'
                              : lang === 'fr'
                                ? 'Moyenne cohorte (filtrée) :'
                                : 'Filtrelenmiş ekip satırları ortalaması:'}
                        </span>
                        <Badge variant="info">{peerCalibrationContext.cohortPeerAvg.toFixed(2)}</Badge>
                        <span>
                          {lang === 'en'
                            ? 'Profile: lenient / harsh if Δ beyond ±0.2 vs this average.'
                            : lang === 'fr'
                              ? 'Profil : indulgent / sévère si Δ au-delà de ±0,2.'
                              : 'Profil: Δ ±0.2 üzeri bonkör / sert olarak işaretlenir.'}
                        </span>
                      </div>
                      <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto rounded-2xl border border-[var(--border)]">
                        <table className="w-full text-sm">
                          <thead className="bg-[var(--surface-2)] border-b border-[var(--border)] sticky top-0 z-10">
                            <tr>
                              <th className="text-left py-2 px-3 w-14">#</th>
                              <th className="text-left py-2 px-3">
                                {lang === 'en' ? 'Evaluator' : lang === 'fr' ? 'Évaluateur' : 'Değerlendiren'}
                              </th>
                              <th className="text-left py-2 px-3">
                                {lang === 'en' ? 'Level' : lang === 'fr' ? 'Niveau' : 'Seviye'}
                              </th>
                              <th className="text-right py-2 px-3">N</th>
                              <th className="text-right py-2 px-3">
                                {lang === 'en' ? 'Min' : lang === 'fr' ? 'Min' : 'Min'}
                              </th>
                              <th className="text-right py-2 px-3">
                                {lang === 'en' ? 'Max' : lang === 'fr' ? 'Max' : 'Max'}
                              </th>
                              <th className="text-right py-2 px-3">
                                {lang === 'en' ? 'Spread' : lang === 'fr' ? 'Écart' : 'Yayılım'}
                              </th>
                              <th className="text-right py-2 px-3">
                                {evaluatorPeerCalibrationUsesMatrix
                                  ? t('matrixEvaluatorCalibrationAvgGivenLabel', lang)
                                  : lang === 'en'
                                    ? 'Avg given'
                                    : lang === 'fr'
                                      ? 'Moy.'
                                      : 'Ort.'}
                              </th>
                              <th className="text-right py-2 px-3">Δ</th>
                              <th className="text-left py-2 px-3">
                                {lang === 'en' ? 'Profile' : lang === 'fr' ? 'Profil' : 'Profil'}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {evaluatorPeerCalibration.map((r) => (
                              <tr key={`evcal-${r.evaluatorId}`} className="hover:bg-[var(--surface-2)]/40">
                                <td className="py-2 px-3 font-semibold">{r.rank}</td>
                                <td className="py-2 px-3 font-medium text-[var(--foreground)]">{r.evaluatorName}</td>
                                <td className="py-2 px-3 text-[var(--muted)]">{positionLevelLabel(r.evaluatorLevel, lang)}</td>
                                <td className="py-2 px-3 text-right text-[var(--muted)]">{r.nTargets}</td>
                                <td className="py-2 px-3 text-right">{r.minGiven.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right">{r.maxGiven.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-[var(--muted)]">{r.spread.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right">{r.avgGiven.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right">
                                  {r.deltaVsCohort > 0 ? (
                                    <span className="text-emerald-600 font-medium">+{r.deltaVsCohort.toFixed(2)}</span>
                                  ) : r.deltaVsCohort < 0 ? (
                                    <span className="text-rose-600 font-medium">{r.deltaVsCohort.toFixed(2)}</span>
                                  ) : (
                                    <span className="text-[var(--muted)]">0</span>
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  {r.profile === 'lenient' ? (
                                    <Badge variant="warning">
                                      {lang === 'en' ? 'Lenient' : lang === 'fr' ? 'Indulgent' : 'Bonkör eğilim'}
                                    </Badge>
                                  ) : r.profile === 'harsh' ? (
                                    <Badge variant="danger">
                                      {lang === 'en' ? 'Harsh' : lang === 'fr' ? 'Sévère' : 'Sert eğilim'}
                                    </Badge>
                                  ) : (
                                    <Badge variant="success">
                                      {lang === 'en' ? 'Balanced' : lang === 'fr' ? 'Neutre' : 'Dengeli'}
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-[var(--muted)] mt-2">
                        {lang === 'en'
                          ? 'Does not change stored scores. Level filter rebuilds the cohort average from matching rows only. N≥2 hides single-target evaluators.'
                          : lang === 'fr'
                            ? 'Ne modifie pas les scores. Le filtre niveau recalcule la cohorte. N≥2 masque les évaluateurs à une seule cible.'
                            : 'Kayıtlı puanları değiştirmez. Seviye filtresi kohort ortalamasını yalnızca o satırlardan yeniden hesaplar. N≥2 tek kişilik değerlendirenleri gizler.'}
                        {' '}
                        {lang === 'en'
                          ? `Showing all ${evaluatorPeerCalibration.length} evaluators.`
                          : lang === 'fr'
                            ? `${evaluatorPeerCalibration.length} évaluateurs affichés.`
                            : `Tüm ${evaluatorPeerCalibration.length} değerlendirici gösteriliyor.`}
                      </p>
                    </>
                  )}
                </CardBody>
              </Card>
              ) : null}

          {showReport('leaderboards_core') &&
          (peopleLeaderboard.top.length > 0 ||
            peopleLeaderboard.bottom.length > 0 ||
            peopleLeaderboard.topTrim.length > 0 ||
            peopleLeaderboard.bottomTrim.length > 0) ? (
            <div className="mb-6 space-y-6">
              <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[var(--brand)]/5 p-1 shadow-sm">
                <div className="rounded-[14px] bg-[var(--surface)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Award className="w-6 h-6 text-amber-500" />
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-[var(--foreground)]">
                          {reportDisplay('leaderboards_core', 'Kişi ve birim öne çıkanlar').title}
                        </h3>
                        <ReportCatalogSubtitle catalogDescription={reportDisplay('leaderboards_core').description} />
                        <ReportPurposeNote purposeKey="reportPurpose_peopleHighlights" />
                      </div>
                    </div>
                    <ReportExportButtons onExcel={exportLeaderboardCsv} onPdf={printLeaderboardPdf} />
                  </div>

                  <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/60 p-4">
                    <div className="text-sm font-semibold text-[var(--foreground)]">
                      {lang === 'en' ? 'Period summary — general evaluation only' : lang === 'fr' ? 'Synthèse période — évaluation générale uniquement' : 'Dönem özeti — yalnızca genel değerlendirme'}
                    </div>
                    <ReportPurposeNote purposeKey="reportPurpose_peopleHighlightsPeriodScope" className="mt-1" />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                        <TrendingUp className="w-5 h-5" />
                        <span className="font-semibold">{lang === 'en' ? 'Highest overall scores' : lang === 'fr' ? 'Scores globaux les plus élevés' : 'En yüksek genel puanlar'}</span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mb-2 leading-snug">
                        {lang === 'en'
                          ? 'Bold: self+team weighted average. Parentheses: trimmed team score.'
                          : lang === 'fr'
                            ? 'Gras : moyenne auto+équipe. Parenthèses : score trim équipe.'
                            : 'Kalın: öz+ekip ağırlıklı genel skor. Parantez: ekip trim skoru.'}
                      </p>
                      <ul className="space-y-2 text-sm">
                        {peopleLeaderboard.top.map((row, i) => (
                          <li key={`top-${row.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700">{i + 1}</span>
                              <span className="truncate font-medium text-[var(--foreground)]" title={row.name}>{row.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.dept}>{row.dept}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="success" title={lang === 'en' ? 'Self + team overall' : lang === 'fr' ? 'Global auto+équipe' : 'Öz+ekip genel skor'}>{row.score.toFixed(2)}</Badge>
                              <span className="text-[10px] text-[var(--muted)]" title={lang === 'en' ? 'Trimmed team score' : lang === 'fr' ? 'Score trim' : 'Trim skor'}>
                                {row.scoreTrim ? `(${row.scoreTrim.toFixed(2)})` : ''}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3 text-rose-700 dark:text-rose-400">
                        <TrendingDown className="w-5 h-5" />
                        <span className="font-semibold">{lang === 'en' ? 'Lowest overall scores' : lang === 'fr' ? 'Scores globaux les plus bas' : 'En düşük genel puanlar'}</span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mb-2 leading-snug">
                        {lang === 'en'
                          ? 'Bold: self+team weighted average. Parentheses: trimmed team score.'
                          : lang === 'fr'
                            ? 'Gras : moyenne auto+équipe. Parenthèses : score trim équipe.'
                            : 'Kalın: öz+ekip ağırlıklı genel skor. Parantez: ekip trim skoru.'}
                      </p>
                      <ul className="space-y-2 text-sm">
                        {peopleLeaderboard.bottom.map((row, i) => (
                          <li key={`bot-${row.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-xs font-bold text-rose-700">{i + 1}</span>
                              <span className="truncate font-medium text-[var(--foreground)]" title={row.name}>{row.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.dept}>{row.dept}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="danger" title={lang === 'en' ? 'Self + team overall' : lang === 'fr' ? 'Global auto+équipe' : 'Öz+ekip genel skor'}>{row.score.toFixed(2)}</Badge>
                              <span className="text-[10px] text-[var(--muted)]" title={lang === 'en' ? 'Trimmed team score' : lang === 'fr' ? 'Score trim' : 'Trim skor'}>
                                {row.scoreTrim ? `(${row.scoreTrim.toFixed(2)})` : ''}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 mb-2">
                    <ReportPurposeNote purposeKey="reportPurpose_trimEligibility" />
                  </div>
                  {(peopleLeaderboard.topTrim.length || peopleLeaderboard.bottomTrim.length) ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                          <TrendingUp className="w-5 h-5" />
                          <span className="font-semibold">{lang === 'en' ? 'Highest (trim)' : lang === 'fr' ? 'Plus haut (trim)' : 'En yüksek (trim)'}</span>
                        </div>
                        <p className="text-[11px] text-[var(--muted)] mb-2 leading-snug">
                          {lang === 'en'
                            ? 'Team-only trimmed score for general evaluation (school life and extra duties excluded).'
                            : lang === 'fr'
                              ? 'Score trim équipe, évaluation générale uniquement (vie scolaire et tâches annexes exclues).'
                              : 'Yalnızca genel değerlendirme formunda ekip trim skoru (Okul Yaşam ve yan görevler hariç).'}
                        </p>
                        <ul className="space-y-2 text-sm">
                          {peopleLeaderboard.topTrim.map((row, i) => (
                            <li key={`tt-${row.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700">{i + 1}</span>
                                <span className="truncate font-medium text-[var(--foreground)]" title={row.name}>{row.name}</span>
                              </span>
                              <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.dept}>{row.dept}</span>
                              <Badge variant="success">{(row.scoreTrim || 0).toFixed(2)}</Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                        <div className="flex items-center gap-2 mb-3 text-rose-700 dark:text-rose-400">
                          <TrendingDown className="w-5 h-5" />
                          <span className="font-semibold">{lang === 'en' ? 'Lowest (trim)' : lang === 'fr' ? 'Plus bas (trim)' : 'En düşük (trim)'}</span>
                        </div>
                        <p className="text-[11px] text-[var(--muted)] mb-2 leading-snug">
                          {lang === 'en'
                            ? 'Team-only trimmed score for general evaluation (school life and extra duties excluded).'
                            : lang === 'fr'
                              ? 'Score trim équipe, évaluation générale uniquement (vie scolaire et tâches annexes exclues).'
                              : 'Yalnızca genel değerlendirme formunda ekip trim skoru (Okul Yaşam ve yan görevler hariç).'}
                        </p>
                        <ul className="space-y-2 text-sm">
                          {peopleLeaderboard.bottomTrim.map((row, i) => (
                            <li key={`bt-${row.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-xs font-bold text-rose-700">{i + 1}</span>
                                <span className="truncate font-medium text-[var(--foreground)]" title={row.name}>{row.name}</span>
                              </span>
                              <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.dept}>{row.dept}</span>
                              <Badge variant="danger">{(row.scoreTrim || 0).toFixed(2)}</Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--muted)] mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/60 px-4 py-3">
                      {lang === 'en'
                        ? 'No trim leaderboard for this period: per question fewer than 7 answers (incl. no-opinion) and/or fewer than 3 completed team evaluators for general evaluation only.'
                        : lang === 'fr'
                          ? 'Pas de classement trim : moins de 7 réponses par question et/ou moins de 3 évaluateurs (évaluation générale uniquement).'
                          : 'Bu dönemde trim sıralaması oluşmadı: genel değerlendirmede soru başına 7 cevap ve/veya en az 3 değerlendirici şartı sağlanmıyor (yan görevler dahil değil).'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {false && showReport('leaderboards_genel_okul_yasam') &&
          isSuperAdmin &&
          isSchoolOrg &&
          (genelOkulYasamLeaderboard.top.length > 0 ||
            genelOkulYasamLeaderboard.bottom.length > 0 ||
            genelOkulYasamLeaderboard.topTrim.length > 0 ||
            genelOkulYasamLeaderboard.bottomTrim.length > 0) ? (
            <div className="mb-6 space-y-6">
              <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-sky-500/5 p-1 shadow-sm">
                <div className="rounded-[14px] bg-[var(--surface)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Award className="w-6 h-6 text-sky-600" />
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-[var(--foreground)]">
                          {lang === 'en'
                            ? 'Period summary — General & School Life'
                            : lang === 'fr'
                              ? 'Synthèse période — Général & Vie scolaire'
                              : 'Dönem özeti — Genel & Okul Yaşam'}
                        </h3>
                        <ReportPurposeNote purposeKey="reportPurpose_peopleHighlightsGenelOkulYasamScope" />
                      </div>
                    </div>
                    <ReportExportButtons
                      onExcel={exportGenelOkulYasamLeaderboardCsv}
                      onPdf={printGenelOkulYasamLeaderboardPdf}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                        <TrendingUp className="w-5 h-5" />
                        <span className="font-semibold">
                          {lang === 'en' ? 'Highest combined scores' : lang === 'fr' ? 'Scores combinés les plus élevés' : 'En yüksek birleşik puanlar'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mb-2 leading-snug">
                        {lang === 'en'
                          ? 'Bold: average of general (self+team) and School Life (team). Parentheses: average trim when eligible.'
                          : lang === 'fr'
                            ? 'Gras : moyenne général (auto+équipe) et Vie scolaire (équipe). Parenthèses : moyenne trim.'
                            : 'Kalın: genel (öz+ekip) ile Okul Yaşam (ekip) ortalaması. Parantez: trim ortalaması.'}
                      </p>
                      <ul className="space-y-2 text-sm">
                        {genelOkulYasamLeaderboard.top.map((row, i) => (
                          <li key={`goy-top-${row.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700">{i + 1}</span>
                              <span className="truncate font-medium text-[var(--foreground)]" title={row.name}>{row.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.dept}>{row.dept}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="success">{row.score.toFixed(2)}</Badge>
                              <span className="text-[10px] text-[var(--muted)]">
                                {row.scoreTrim ? `(${row.scoreTrim.toFixed(2)})` : ''}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3 text-rose-700 dark:text-rose-400">
                        <TrendingDown className="w-5 h-5" />
                        <span className="font-semibold">
                          {lang === 'en' ? 'Lowest combined scores' : lang === 'fr' ? 'Scores combinés les plus bas' : 'En düşük birleşik puanlar'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] mb-2 leading-snug">
                        {lang === 'en'
                          ? 'Bold: average of general (self+team) and School Life (team). Parentheses: average trim when eligible.'
                          : lang === 'fr'
                            ? 'Gras : moyenne général (auto+équipe) et Vie scolaire (équipe). Parenthèses : moyenne trim.'
                            : 'Kalın: genel (öz+ekip) ile Okul Yaşam (ekip) ortalaması. Parantez: trim ortalaması.'}
                      </p>
                      <ul className="space-y-2 text-sm">
                        {genelOkulYasamLeaderboard.bottom.map((row, i) => (
                          <li key={`goy-bot-${row.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-xs font-bold text-rose-700">{i + 1}</span>
                              <span className="truncate font-medium text-[var(--foreground)]" title={row.name}>{row.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.dept}>{row.dept}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="danger">{row.score.toFixed(2)}</Badge>
                              <span className="text-[10px] text-[var(--muted)]">
                                {row.scoreTrim ? `(${row.scoreTrim.toFixed(2)})` : ''}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {(genelOkulYasamLeaderboard.topTrim.length > 0 || genelOkulYasamLeaderboard.bottomTrim.length > 0) ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                          <TrendingUp className="w-5 h-5" />
                          <span className="font-semibold">{lang === 'en' ? 'Highest (trim)' : lang === 'fr' ? 'Plus haut (trim)' : 'En yüksek (trim)'}</span>
                        </div>
                        <ul className="space-y-2 text-sm">
                          {genelOkulYasamLeaderboard.topTrim.map((row, i) => (
                            <li key={`goy-tt-${row.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700">{i + 1}</span>
                                <span className="truncate font-medium text-[var(--foreground)]" title={row.name}>{row.name}</span>
                              </span>
                              <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.dept}>{row.dept}</span>
                              <Badge variant="success">{(row.scoreTrim || 0).toFixed(2)}</Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                        <div className="flex items-center gap-2 mb-3 text-rose-700 dark:text-rose-400">
                          <TrendingDown className="w-5 h-5" />
                          <span className="font-semibold">{lang === 'en' ? 'Lowest (trim)' : lang === 'fr' ? 'Plus bas (trim)' : 'En düşük (trim)'}</span>
                        </div>
                        <ul className="space-y-2 text-sm">
                          {genelOkulYasamLeaderboard.bottomTrim.map((row, i) => (
                            <li key={`goy-bt-${row.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-xs font-bold text-rose-700">{i + 1}</span>
                                <span className="truncate font-medium text-[var(--foreground)]" title={row.name}>{row.name}</span>
                              </span>
                              <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.dept}>{row.dept}</span>
                              <Badge variant="danger">{(row.scoreTrim || 0).toFixed(2)}</Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {showReport('leaderboards_full_ranking') && generalRankingFull.length > 0 ? (
            <Card className="mb-6 overflow-hidden border-[var(--border)] shadow-sm">
              <CardHeader className="bg-gradient-to-r from-amber-500/10 to-transparent border-b border-[var(--border)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Award className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <CardTitle>{reportDisplay('leaderboards_full_ranking').title}</CardTitle>
                      <ReportCatalogSubtitle catalogDescription={reportDisplay('leaderboards_full_ranking').description} />
                      <ReportPurposeNote purposeKey="reportPurpose_fullGeneralRanking" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info">
                      {generalRankingFull.length}{' '}
                      {lang === 'en' ? 'people' : lang === 'fr' ? 'personnes' : 'kişi'}
                    </Badge>
                    <ReportExportButtons onExcel={exportGeneralRankingCsv} onPdf={printGeneralRankingPdf} />
                  </div>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <GenVsTeamScoreExplainer className="mx-4 mt-4" />
                <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto mt-4">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)] sticky top-0 z-10">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--muted)] w-14">#</th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">
                          {lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'}
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">
                          {lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-[var(--muted)]">
                          {lang === 'en' ? 'Overall' : lang === 'fr' ? 'Global' : 'Genel'}
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-[var(--muted)]">
                          {lang === 'en' ? 'Team' : lang === 'fr' ? 'Équipe' : 'Ekip'}
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-[var(--muted)]">
                          {lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz'}
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-[var(--muted)]">
                          {lang === 'en' ? '/100' : lang === 'fr' ? '/100' : "100'lük"}
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-[var(--muted)]" title={t('reportTrimRulesHint', lang)}>
                          {t('reportTrimRulesColumn', lang)}
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-[var(--muted)]" title={t('reportTrimGeneralHint', lang)}>
                          {t('reportTrimGeneralColumn', lang)}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {generalRankingFull.map((row) => {
                        const isTop = row.rank === 1
                        const isLast = row.rank === generalRankingFull.length && generalRankingFull.length > 1
                        return (
                          <tr
                            key={row.targetId}
                            className={
                              isTop
                                ? 'bg-emerald-500/5'
                                : isLast
                                  ? 'bg-rose-500/5'
                                  : 'hover:bg-[var(--surface-2)]/40'
                            }
                          >
                            <td className="py-3 px-4 font-bold text-[var(--foreground)]">{row.rank}</td>
                            <td className="py-3 px-4 font-medium text-[var(--foreground)]">{row.name}</td>
                            <td className="py-3 px-4 text-[var(--muted)]">{row.dept}</td>
                            <td className="py-3 px-4 text-right">
                              <Badge variant={getScoreBadge(row.overallAvg)}>{row.overallAvg.toFixed(2)}</Badge>
                            </td>
                            <td className="py-3 px-4 text-right text-[var(--foreground)]">
                              {row.peerAvg > 0 ? row.peerAvg.toFixed(2) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-[var(--foreground)]">
                              {row.selfScore > 0 ? row.selfScore.toFixed(2) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-[var(--foreground)]">
                              {row.score100 != null ? row.score100.toFixed(2) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-[var(--foreground)]">
                              {row.scoreTrim != null ? row.scoreTrim.toFixed(2) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-[var(--foreground)]">
                              {row.scoreTrimGeneral != null ? row.scoreTrimGeneral.toFixed(2) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-[var(--muted)] px-4 py-3 border-t border-[var(--border)]">
                  {t('reportPurpose_trimEligibility', lang)}
                </p>
              </CardBody>
            </Card>
          ) : null}

          {showReport('leaderboards_full_ranking_genel_okul_yasam') && matrixFullRanking.length > 0 ? (
            <MatrixFullRankingPanel
              rows={matrixFullRanking}
              catalogTitle={reportDisplay('leaderboards_full_ranking_genel_okul_yasam').title}
              catalogDescription={reportDisplay('leaderboards_full_ranking_genel_okul_yasam').description}
              onExcel={exportMatrixFullRankingCsv}
              onPdf={printMatrixFullRankingPdf}
            />
          ) : showReport('leaderboards_full_ranking_genel_okul_yasam') &&
            !loading &&
            matrixStructureReport &&
            matrixFullRanking.length === 0 ? (
            <Card className="mb-6">
              <CardBody className="py-8 text-sm text-[var(--muted)] text-center">
                {t('matrixFullRankingEmpty', lang)}
              </CardBody>
            </Card>
          ) : null}

          {showReport('duty_matrices_matrix') && matrixDutyLeaderboardsReport.sections.length > 0 ? (
            <MatrixDutyLeaderboardsPanel
              report={matrixDutyLeaderboardsReport}
              periodLabel={periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''}
              catalogTitle={reportDisplay('duty_matrices_matrix').title}
              catalogDescription={reportDisplay('duty_matrices_matrix').description}
            />
          ) : showReport('duty_matrices_matrix') && !loading && matrixPersonResultsReport ? (
            <Card className="mb-6">
              <CardBody className="py-8 text-sm text-[var(--muted)] text-center">
                {t('matrixDutyLeaderboardsEmpty', lang)}
              </CardBody>
            </Card>
          ) : null}

          {showReport('leaderboards_departments') && departmentRankingGroups.allRows.length > 0 ? (
            <MatrixDepartmentRankingPanel
              groups={departmentRankingGroups}
              catalogTitle={reportDisplay('leaderboards_departments').title}
              catalogDescription={reportDisplay('leaderboards_departments').description}
              onExcel={exportDeptRankingCsv}
              onPdf={printDeptRankingPdf}
            />
          ) : showReport('leaderboards_departments') && !loading && matrixStructureReport && departmentRankingGroups.allRows.length === 0 ? (
            <Card className="mb-6">
              <CardBody className="py-8 text-sm text-[var(--muted)] text-center">
                {t('matrixDepartmentRankingEmpty', lang)}
              </CardBody>
            </Card>
          ) : null}

          {false && showReport('leaderboards_departments_genel_okul_yasam') &&
          isSchoolOrg &&
          departmentGenelOkulYasamRankingGroups.allRows.length > 0 ? (
                <Card className="overflow-hidden border border-sky-500/20 shadow-sm">
                  <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-sky-600" />
                        <div className="min-w-0">
                          <CardTitle>
                            {lang === 'en'
                              ? 'Department ranking — General & School Life'
                              : lang === 'fr'
                                ? 'Classement des départements — Général & Vie scolaire'
                                : 'Birim sıralaması — Genel & Okul Yaşam'}
                          </CardTitle>
                          <ReportPurposeNote purposeKey="reportPurpose_deptRankingGenelOkulYasam" />
                        </div>
                      </div>
                      <ReportExportButtons
                        onExcel={exportDeptGenelOkulYasamRankingCsv}
                        onPdf={printDeptGenelOkulYasamRankingPdf}
                      />
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)] w-14">#</th>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">
                              {lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}
                            </th>
                            <th className="text-right py-3 px-4 font-semibold text-[var(--muted)]">
                              {lang === 'en' ? 'People' : lang === 'fr' ? 'Personnes' : 'Kişi'}
                            </th>
                            <th className="text-right py-3 px-4 font-semibold text-[var(--muted)]">
                              {lang === 'en' ? 'Avg combined' : lang === 'fr' ? 'Moy. combinée' : 'Ort. birleşik'}
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">
                              {lang === 'en' ? 'Best in dept.' : lang === 'fr' ? 'Meilleur' : 'Birimde en yüksek'}
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">
                              {lang === 'en' ? 'Lowest in dept.' : lang === 'fr' ? 'Plus bas' : 'Birimde en düşük'}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {departmentGenelOkulYasamRankingGroups.tiers.map((group) => (
                            <Fragment key={group.tier}>
                              <tr className="bg-[var(--surface-2)]/80">
                                <td colSpan={6} className="py-2.5 px-4">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-[var(--foreground)]">
                                      {departmentSizeTierLabel(group.tier, lang)}
                                    </span>
                                    <Badge variant="info">
                                      {group.rows.length}{' '}
                                      {lang === 'en' ? 'dept.' : lang === 'fr' ? 'dép.' : 'birim'}
                                    </Badge>
                                  </div>
                                </td>
                              </tr>
                              {group.rows.map((r) => {
                                const isTop = r.rankInTier === 1
                                const isLast = r.rankInTier === group.rows.length && group.rows.length > 1
                                return (
                                  <tr
                                    key={`${group.tier}-${r.department}`}
                                    className={
                                      isTop
                                        ? 'bg-emerald-500/5'
                                        : isLast
                                          ? 'bg-rose-500/5'
                                          : 'hover:bg-[var(--surface-2)]/40'
                                    }
                                  >
                                    <td className="py-3 px-4 font-bold text-[var(--foreground)]">{r.rankInTier}</td>
                                    <td className="py-3 px-4 font-medium text-[var(--foreground)]">{r.department}</td>
                                    <td className="py-3 px-4 text-right text-[var(--muted)]">{r.peopleCount}</td>
                                    <td className="py-3 px-4 text-right">
                                      <Badge variant={getScoreBadge(r.avgOverall)}>{r.avgOverall.toFixed(2)}</Badge>
                                    </td>
                                    <td className="py-3 px-4 text-[var(--foreground)]">
                                      <span className="font-medium">{r.bestPerson}</span>
                                      <span className="text-[var(--muted)]"> ({r.bestScore.toFixed(2)})</span>
                                    </td>
                                    <td className="py-3 px-4 text-[var(--foreground)]">
                                      <span className="font-medium">{r.worstPerson}</span>
                                      <span className="text-[var(--muted)]"> ({r.worstScore.toFixed(2)})</span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-[var(--muted)] px-4 py-3 border-t border-[var(--border)]">
                      {lang === 'en'
                        ? 'Departments grouped by headcount (1–3, 4–8, 9+), ranked within each group by average combined General & School Life score. Single-person departments may show the same person as best and lowest.'
                        : lang === 'fr'
                          ? 'Départements regroupés par effectif (1–3, 4–8, 9+), classés par moyenne combinée Général & Vie scolaire.'
                          : 'Birimler kişi sayısına göre gruplanır (1–3, 4–8, 9+); sıralama her grup içinde Genel & Okul Yaşam birleşik ortalamaya göre yapılır. Tek kişilik birimlerde en yüksek ve en düşük aynı kişi olabilir.'}
                    </p>
                  </CardBody>
                </Card>
          ) : null}

          {showReport('leaderboards_departments_people') && matrixDepartmentPeopleRanking.length > 0 ? (
            <MatrixDepartmentPeopleRankingPanel
              groups={matrixDepartmentPeopleRanking}
              catalogTitle={reportDisplay('leaderboards_departments_people').title}
              catalogDescription={reportDisplay('leaderboards_departments_people').description}
              onExcel={exportMatrixDepartmentPeopleCsv}
              onPdf={printMatrixDepartmentPeoplePdf}
            />
          ) : showReport('leaderboards_departments_people') && !loading && matrixStructureReport && matrixDepartmentPeopleRanking.length === 0 ? (
            <Card className="mb-6">
              <CardBody className="py-8 text-sm text-[var(--muted)] text-center">
                {t('matrixDepartmentPeopleRankingEmpty', lang)}
              </CardBody>
            </Card>
          ) : null}

          {showReport('period_change') && periodComparisonMeta ? (
            <Card className="mb-6 overflow-hidden border-[var(--border)] shadow-sm">
              <CardHeader className="bg-gradient-to-r from-violet-500/10 to-transparent border-b border-[var(--border)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600">
                      <History className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle>{reportDisplay('period_change').title}</CardTitle>
                      <ReportCatalogSubtitle catalogDescription={reportDisplay('period_change').description} />
                      <ReportPurposeNote purposeKey="reportPurpose_periodComparison" />
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant={periodComparisonMeta.assessmentKind === 'job_evaluation' ? 'warning' : 'info'}>
                          {periodComparisonMeta.assessmentLabel}
                        </Badge>
                        {periodComparisonMeta.canCompare && periodComparisonMeta.previousPeriod ? (
                          <span className="text-sm text-[var(--muted)] font-normal">
                            {lang === 'en'
                              ? `Compared to: ${periodComparisonMeta.previousPeriod.name} (same evaluation type & filters).`
                              : lang === 'fr'
                                ? `Par rapport à : ${periodComparisonMeta.previousPeriod.name} (même type & filtres).`
                                : `Karşılaştırma: ${periodComparisonMeta.previousPeriod.name} (aynı değerlendirme türü ve filtreler).`}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <ReportExportButtons
                    onExcel={exportTrendCsv}
                    onPdf={printTrendPdf}
                    excelDisabled={!periodComparisonMeta.canCompare}
                    pdfDisabled={!periodComparisonMeta.canCompare}
                  />
                </div>
              </CardHeader>
              <CardBody>
                {periodComparisonTrend.usesMatrixScoring && periodComparisonMeta.canCompare ? (
                  <>
                    <p className="text-sm text-sky-900/90 dark:text-sky-100/90 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 mb-4">
                      {t('matrixStructureScopeNote', lang)}
                    </p>
                    <p className="text-xs text-[var(--muted)] mb-4">{t('matrixStructureScoringRulesNote', lang)}</p>
                  </>
                ) : null}
                {!periodComparisonMeta.canCompare ? (
                  <p className="text-sm text-[var(--muted)]">
                    {periodComparisonMeta.sameKindPeriodCount < 2
                      ? lang === 'en'
                        ? `Only one "${periodComparisonMeta.assessmentLabel}" period exists. Personal development and job evaluations use different questions and cannot be compared across types.`
                        : lang === 'fr'
                          ? `Une seule période « ${periodComparisonMeta.assessmentLabel} ». Les types d'évaluation ne sont pas comparables entre eux.`
                          : `«${periodComparisonMeta.assessmentLabel}» türünde yalnızca bir dönem var. Kişisel gelişim ile iş performansı değerlendirmeleri farklı soru setleri kullandığından birbirleriyle kıyaslanamaz; aynı türde en az iki dönem gerekir.`
                      : lang === 'en'
                        ? 'No earlier period of the same evaluation type was found for comparison.'
                        : lang === 'fr'
                          ? "Aucune période antérieure du même type d'évaluation pour comparer."
                          : 'Aynı değerlendirme türünde karşılaştırılacak önceki dönem bulunamadı.'}
                  </p>
                ) : periodComparisonTrend.usesMatrixScoring && !prevMatrixStructureReport?.rankings?.length ? (
                  <p className="text-sm text-[var(--muted)]">{t('matrixPeriodComparisonEmptyPrev', lang)}</p>
                ) : !periodComparisonTrend.usesMatrixScoring && !prevResults.length ? (
                  <p className="text-sm text-[var(--muted)]">
                    {lang === 'en'
                      ? 'No results for the previous period with the current filters — trend needs data in both periods.'
                      : lang === 'fr'
                        ? "Aucun résultat pour la période précédente avec ces filtres — la tendance nécessite des données sur les deux périodes."
                        : 'Önceki dönemde bu filtrelerle sonuç yok; trend için her iki dönemde de veri gerekir.'}
                  </p>
                ) : !periodComparisonTrend.peopleUp.length &&
                  !periodComparisonTrend.peopleDown.length &&
                  !periodComparisonTrend.deptMoves.length ? (
                  <p className="text-sm text-[var(--muted)]">
                    {periodComparisonTrend.usesMatrixScoring
                      ? t('matrixPeriodComparisonEmptyOverlap', lang)
                      : lang === 'en'
                        ? 'No overlapping people or departments to compare between periods.'
                        : lang === 'fr'
                          ? 'Pas de personnes ou départements comparables entre les périodes.'
                          : 'Dönemler arasında karşılaştırılabilir kişi veya birim yok.'}
                  </p>
                ) : (
                  <div className="space-y-8">
                    {(periodComparisonTrend.peopleUp.length > 0 || periodComparisonTrend.peopleDown.length > 0) ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {periodComparisonTrend.peopleUp.length > 0 ? (
                          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                            <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                              <ArrowUpRight className="w-5 h-5" />
                              <span className="font-semibold text-sm">
                                {periodComparisonTrend.usesMatrixScoring
                                  ? lang === 'en'
                                    ? 'Largest gains (MATRIX score)'
                                    : lang === 'fr'
                                      ? 'Plus fortes hausses (score MATRIX)'
                                      : 'En çok artanlar (MATRIX puanı)'
                                  : lang === 'en'
                                    ? 'Largest gains (overall score)'
                                    : lang === 'fr'
                                      ? 'Plus fortes hausses (score global)'
                                      : 'En çok artanlar (genel puan)'}
                              </span>
                            </div>
                            <ul className="space-y-2 text-sm">
                              {periodComparisonTrend.peopleUp.map((r, i) => (
                                <li
                                  key={`up-${r.name}-${i}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)]/60 bg-[var(--surface-2)]/60 px-3 py-2"
                                >
                                  <span className="font-medium text-[var(--foreground)] truncate min-w-0">{r.name}</span>
                                  <span className="text-xs text-[var(--muted)] truncate">{r.dept}</span>
                                  <span className="text-xs text-[var(--muted)]">
                                    {r.prev.toFixed(2)} → {r.cur.toFixed(2)}
                                  </span>
                                  <Badge variant="success">+{r.delta.toFixed(2)}</Badge>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {periodComparisonTrend.peopleDown.length > 0 ? (
                          <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4">
                            <div className="flex items-center gap-2 mb-3 text-rose-700 dark:text-rose-400">
                              <ArrowDownRight className="w-5 h-5" />
                              <span className="font-semibold text-sm">
                                {periodComparisonTrend.usesMatrixScoring
                                  ? lang === 'en'
                                    ? 'Largest drops (MATRIX score)'
                                    : lang === 'fr'
                                      ? 'Plus fortes baisses (score MATRIX)'
                                      : 'En çok düşenler (MATRIX puanı)'
                                  : lang === 'en'
                                    ? 'Largest drops (overall score)'
                                    : lang === 'fr'
                                      ? 'Plus fortes baisses (score global)'
                                      : 'En çok düşenler (genel puan)'}
                              </span>
                            </div>
                            <ul className="space-y-2 text-sm">
                              {periodComparisonTrend.peopleDown.map((r, i) => (
                                <li
                                  key={`dn-${r.name}-${i}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)]/60 bg-[var(--surface-2)]/60 px-3 py-2"
                                >
                                  <span className="font-medium text-[var(--foreground)] truncate min-w-0">{r.name}</span>
                                  <span className="text-xs text-[var(--muted)] truncate">{r.dept}</span>
                                  <span className="text-xs text-[var(--muted)]">
                                    {r.prev.toFixed(2)} → {r.cur.toFixed(2)}
                                  </span>
                                  <Badge variant="danger">{r.delta.toFixed(2)}</Badge>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {periodComparisonTrend.deptMoves.length > 0 ? (
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[var(--brand)]" />
                          {periodComparisonTrend.usesMatrixScoring
                            ? lang === 'en'
                              ? 'Department average change (MATRIX score, both periods had people in dept.)'
                              : lang === 'fr'
                                ? 'Évolution moyenne par département (score MATRIX)'
                                : 'Birim ortalaması değişimi (MATRIX puanı, her iki dönemde birimde kişi varsa)'
                            : lang === 'en'
                              ? 'Department average change (both periods had people in dept.)'
                              : lang === 'fr'
                                ? 'Évolution de la moyenne par département'
                                : 'Birim ortalaması değişimi (her iki dönemde de birimde kişi varsa)'}
                        </h4>
                        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                          <table className="w-full text-sm">
                            <thead className="bg-[var(--surface-2)]">
                              <tr>
                                <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                                  {lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}
                                </th>
                                <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">
                                  {lang === 'en' ? 'Prev' : lang === 'fr' ? 'Préc.' : 'Önceki'}
                                </th>
                                <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">
                                  {lang === 'en' ? 'Now' : lang === 'fr' ? 'Actuel' : 'Şimdi'}
                                </th>
                                <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">
                                  {lang === 'en' ? 'Δ' : lang === 'fr' ? 'Δ' : 'Fark'}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {periodComparisonTrend.deptMoves.map((r) => (
                                <tr key={r.department} className="hover:bg-[var(--surface-2)]/40">
                                  <td className="py-2 px-3 font-medium text-[var(--foreground)]">{r.department}</td>
                                  <td className="py-2 px-3 text-right text-[var(--muted)]">{r.prev.toFixed(2)}</td>
                                  <td className="py-2 px-3 text-right">{r.cur.toFixed(2)}</td>
                                  <td className="py-2 px-3 text-right">
                                    {r.delta > 0 ? (
                                      <span className="text-emerald-600 font-medium">+{r.delta.toFixed(2)}</span>
                                    ) : r.delta < 0 ? (
                                      <span className="text-rose-600 font-medium">{r.delta.toFixed(2)}</span>
                                    ) : (
                                      <span className="text-[var(--muted)]">0</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-[var(--muted)] mt-2">
                          {periodComparisonTrend.usesMatrixScoring
                            ? lang === 'en'
                              ? 'Rows sorted by absolute change. MATRIX score = mean of per-question team averages (1–5). Only departments with at least one scored person in both periods.'
                              : lang === 'fr'
                                ? 'Tri par amplitude. Score MATRIX = moyenne des moyennes par question (équipe, 1–5). Départements présents sur les deux périodes seulement.'
                                : 'Satırlar mutlak değişime göre sıralı. MATRIX puanı = soru ortalamalarının ortalaması (ekip, 1–5). Yalnızca her iki dönemde de puanlı kişisi olan birimler.'
                            : lang === 'en'
                              ? 'Rows sorted by absolute change. Only departments with at least one person in both periods are shown.'
                              : lang === 'fr'
                                ? 'Tri par amplitude du changement. Départements présents sur les deux périodes seulement.'
                                : 'Satırlar mutlak değişime göre sıralı; yalnızca her iki dönemde de en az bir kişisi olan birimler.'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </CardBody>
            </Card>
          ) : null}

          {showReport('category_spotlight') && categoryPeerHighlights.length > 0 ? (
            <MatrixCategorySpotlightPanel
              blocks={categoryPeerHighlights}
              usesMatrixScoring={categorySpotlightUsesMatrix}
              catalogTitle={reportDisplay('category_spotlight').title}
              catalogDescription={reportDisplay('category_spotlight').description}
              onExcel={exportCategoryHighlightsCsv}
              onPdf={printCategoryHighlightsPdf}
            />
          ) : showReport('category_spotlight') && !loading && results.length > 0 && categoryPeerHighlights.length === 0 ? (
            <Card className="mb-6">
              <CardBody className="py-8 text-sm text-[var(--muted)] text-center">
                {t(isJobEvaluationPeriod ? 'matrixCategorySpotlightEmpty' : 'pdCategorySpotlightEmpty', lang)}
              </CardBody>
            </Card>
          ) : null}

          {showReport('gaps') && (gapReports.topCategoryGaps.length > 0 || gapReports.topQuestionGaps.length > 0) ? (
            <MatrixSelfTeamGapsPanel
              topCategoryGaps={gapReports.topCategoryGaps}
              topQuestionGaps={gapReports.topQuestionGaps}
              usesMatrixScoring={gapReports.usesMatrixScoring}
              catalogTitle={reportDisplay('gaps').title}
              catalogDescription={reportDisplay('gaps').description}
              onExcelCategory={() => exportGapCsv('category')}
              onPdfCategory={() => printGapPdf('category')}
              onExcelQuestion={() => exportGapCsv('question')}
              onPdfQuestion={() => printGapPdf('question')}
            />
          ) : showReport('gaps') && !loading && results.length > 0 && gapReports.topCategoryGaps.length === 0 && gapReports.topQuestionGaps.length === 0 ? (
            <Card className="mb-6">
              <CardBody className="py-8 text-sm text-[var(--muted)] text-center">
                {t(isJobEvaluationPeriod ? 'matrixSelfTeamGapEmpty' : 'pdSelfTeamGapEmpty', lang)}
              </CardBody>
            </Card>
          ) : null}

          {showReport('heatmap') && deptHeatmap.departments.length > 0 && deptHeatmap.categories.length > 0 ? (
            <MatrixDepartmentHeatmapPanel
              heatmap={deptHeatmap}
              catalogTitle={reportDisplay('heatmap').title}
              catalogDescription={reportDisplay('heatmap').description}
              onExcel={exportHeatmapCsv}
              onPdf={printHeatmapPdf}
            />
          ) : showReport('heatmap') && !loading && results.length > 0 && (deptHeatmap.departments.length === 0 || deptHeatmap.categories.length === 0) ? (
            <Card className="mb-6">
              <CardBody className="py-8 text-sm text-[var(--muted)] text-center">
                {t(isJobEvaluationPeriod ? 'matrixDepartmentHeatmapEmpty' : 'pdDepartmentHeatmapEmpty', lang)}
              </CardBody>
            </Card>
          ) : null}

          {showReport('charts') &&
          (matrixChartsReport.overallDistribution.some((b) => b.count > 0) ||
            matrixChartsReport.categorySummary.top.length > 0 ||
            matrixChartsReport.categorySummary.bottom.length > 0) ? (
            <MatrixScoreDistributionPanel
              report={matrixChartsReport}
              catalogTitle={reportDisplay('charts').title}
              catalogDescription={reportDisplay('charts').description}
              onExcel={exportChartsCsv}
              onPdf={printChartsPdf}
            />
          ) : showReport('charts') && !loading && results.length > 0 ? (
            <Card className="mb-6">
              <CardBody className="py-8 text-sm text-[var(--muted)] text-center">
                {t(isJobEvaluationPeriod ? 'matrixChartsEmpty' : 'pdChartsEmpty', lang)}
              </CardBody>
            </Card>
          ) : null}

          {results.length > 0 && !peerEvaluatorsVisible && showReport('people_table') && (
            <Card className="mb-6 border-amber-200 bg-amber-50/80">
              <CardBody className="py-3 text-sm text-amber-950">
                {t('peerEvaluatorsSuperAdminOnlyHint', lang)}
              </CardBody>
            </Card>
          )}

          {showReport('people_table') ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3 w-full">
                <div className="min-w-0">
                  <CardTitle>📊 {reportDisplay('people_table', t('personBasedResultsTitle', lang)).title}</CardTitle>
                  <ReportCatalogSubtitle catalogDescription={reportDisplay('people_table').description} />
                  <ReportPurposeNote purposeKey="reportPurpose_personResults" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ReportExportButtons onExcel={exportToExcel} onPdf={printSummaryPdf} />
                  <Badge variant="info">
                    {results.length} {t('peopleCount', lang)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-[var(--border)]">
                {results.map((result, index) => (
                  <div key={result.targetId}>
                    {/* Main Row */}
                    <div 
                      className="flex items-center justify-between px-6 py-4 hover:bg-[var(--surface-2)] cursor-pointer"
                      onClick={() => setExpandedPerson(expandedPerson === result.targetId ? null : result.targetId)}
                      id={`person-row-${result.targetId}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-[var(--brand-soft)] border border-[var(--brand)]/25 rounded-lg flex items-center justify-center text-[var(--brand)] font-semibold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-[var(--foreground)]">{result.targetName}</p>
                          <p className="text-sm text-[var(--muted)]">{result.targetDept}</p>
                          {result.hasSelfEvaluationAssignment === false && (
                            <Badge variant="warning" className="mt-1 text-[10px] font-normal" title={t('missingSelfAssignmentHint', lang)}>
                              {t('missingSelfAssignmentBadge', lang)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-xs text-[var(--muted)]">{t('selfShort', lang)}</p>
                          <p className={`font-semibold ${getScoreColor(result.selfScore)}`}>
                            {result.hasSelfEvaluationAssignment === false
                              ? '—'
                              : Number(result.selfScore ?? 0).toFixed(2)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-[var(--muted)]">{t('teamShort', lang)}</p>
                          <p className={`font-semibold ${getScoreColor(result.peerAvg)}`}>
                            {Number.isFinite(Number(result.peerAvg)) ? Number(result.peerAvg).toFixed(2) : '—'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-[var(--muted)]" title={t('reportTrimRulesHint', lang)}>
                            {t('reportTrimRulesColumn', lang)}
                          </p>
                          <p className={`font-semibold ${getScoreColor(Number(result.peerAvgTrimmed || 0))}`}>
                            {result.peerTrimEligible === true && Number(result.peerAvgTrimmed || 0) > 0
                              ? Number(result.peerAvgTrimmed).toFixed(2)
                              : '—'}
                          </p>
                        </div>
                        {!isJobEvaluationPeriod ? (
                          <div className="text-center">
                            <p className="text-xs text-[var(--muted)]" title={t('reportTrimGeneralHint', lang)}>
                              {t('reportTrimGeneralColumn', lang)}
                            </p>
                            <p
                              className={`font-semibold ${getScoreColor(Number(result.peerAvgTrimmedGeneral || 0))}`}
                            >
                              {result.peerTrimGeneralEligible === true &&
                              Number(result.peerAvgTrimmedGeneral || 0) > 0
                                ? Number(result.peerAvgTrimmedGeneral).toFixed(2)
                                : '—'}
                            </p>
                          </div>
                        ) : null}
                        <div className="text-center min-w-[70px]">
                          <p className="text-xs text-[var(--muted)]">{t('standardShort', lang)}</p>
                          <p className={`font-semibold ${getScoreColor(result.standardAvg)}`}>
                            {result.standardCount ? result.standardAvg : '-'}
                          </p>
                        </div>
                        <div className="text-center min-w-[60px]">
                          <p className="text-xs text-[var(--muted)]">{t('overallShort', lang)}</p>
                          <Badge variant={getScoreBadge(result.overallAvg)}>
                            {result.overallAvg}
                          </Badge>
                        </div>
                        <div className="text-center min-w-[70px]">
                          <p className="text-xs text-[var(--muted)]" title={t('reportTrimRulesHint', lang)}>
                            {lang === 'en' ? 'Overall (trim rules)' : lang === 'fr' ? 'Global (trim règles)' : 'Genel (trim kurallı)'}
                          </p>
                          <Badge variant={getScoreBadge(Number(result.overallAvgTrimmed || 0))}>
                            {result.peerTrimEligible === true && Number(result.overallAvgTrimmed || 0) > 0
                              ? Number(result.overallAvgTrimmed).toFixed(2)
                              : '—'}
                          </Badge>
                        </div>
                        {!isJobEvaluationPeriod ? (
                          <div className="text-center min-w-[70px]">
                            <p className="text-xs text-[var(--muted)]" title={t('reportTrimGeneralHint', lang)}>
                              {lang === 'en' ? 'Overall (trim gen.)' : lang === 'fr' ? 'Global (trim gén.)' : 'Genel (trim genel)'}
                            </p>
                            <Badge variant={getScoreBadge(Number(result.overallAvgTrimmedGeneral || 0))}>
                              {result.peerTrimGeneralEligible === true &&
                              Number(result.overallAvgTrimmedGeneral || 0) > 0
                                ? Number(result.overallAvgTrimmedGeneral).toFixed(2)
                                : '—'}
                            </Badge>
                          </div>
                        ) : null}
                        {showSchoolMatrixUi ? (
                          <>
                            <div className="text-center min-w-[72px]">
                              <p className="text-xs text-sky-700 dark:text-sky-400">
                                {lang === 'en' ? 'Gen. & SL' : lang === 'fr' ? 'Gén. & VS' : 'Gen. & OY'}
                              </p>
                              <Badge variant={getScoreBadge(Number(result.genelOkulYasamCombinedAvg || 0))}>
                                {Number(result.genelOkulYasamCombinedAvg || 0) > 0
                                  ? Number(result.genelOkulYasamCombinedAvg).toFixed(2)
                                  : '—'}
                              </Badge>
                            </div>
                            <div className="text-center min-w-[72px]">
                              <p className="text-xs text-sky-700 dark:text-sky-400">
                                {lang === 'en' ? 'Gen. & SL (trim)' : lang === 'fr' ? 'Gén. & VS (trim)' : 'Gen. & OY (trim)'}
                              </p>
                              <Badge variant={getScoreBadge(Number(result.genelOkulYasamCombinedTrimmed || 0))}>
                                {result.genelOkulYasamCombinedTrimEligible === true &&
                                Number(result.genelOkulYasamCombinedTrimmed || 0) > 0
                                  ? Number(result.genelOkulYasamCombinedTrimmed).toFixed(2)
                                  : '—'}
                              </Badge>
                            </div>
                          </>
                        ) : null}
                        {result.peerTrimEligible === true && result.score100Trimmed != null ? (
                          <div className="text-center min-w-[64px]" title={t('reportTrimRulesHint', lang)}>
                            <p className="text-xs text-[var(--muted)]">/100 {lang === 'en' ? 'rules' : lang === 'fr' ? 'règles' : 'kurallı'}</p>
                            <Badge variant={getScoreBadge((Number(result.score100Trimmed) || 0) / 20)}>
                              {Number(result.score100Trimmed).toFixed(0)}
                            </Badge>
                          </div>
                        ) : null}
                        {!isJobEvaluationPeriod &&
                        result.peerTrimGeneralEligible === true &&
                        result.score100TrimmedGeneral != null ? (
                          <div className="text-center min-w-[64px]" title={t('reportTrimGeneralHint', lang)}>
                            <p className="text-xs text-[var(--muted)]">/100 {lang === 'en' ? 'gen.' : lang === 'fr' ? 'gén.' : 'genel'}</p>
                            <Badge variant={getScoreBadge((Number(result.score100TrimmedGeneral) || 0) / 20)}>
                              {Number(result.score100TrimmedGeneral).toFixed(0)}
                            </Badge>
                          </div>
                        ) : null}
                        {result.hasDutyScope && showSchoolMatrixUi ? (
                          <div className="text-center min-w-[72px]" title={lang === 'en' ? 'Extra duties (scale avg + trim/100)' : 'Ek görev soruları'}>
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              {lang === 'en' ? 'Extra duty' : lang === 'fr' ? 'Tâche +' : 'Ek görev'}
                            </p>
                            <Badge variant="warning">
                              {result.overallAvgDuty != null ? Number(result.overallAvgDuty).toFixed(2) : '—'}
                              {result.score100TrimmedDuty != null ? (
                                <span className="ml-1 opacity-80">({Number(result.score100TrimmedDuty).toFixed(0)})</span>
                              ) : null}
                            </Badge>
                          </div>
                        ) : null}
                        <div className="text-center min-w-[80px]" title={t('evaluatorCountHint', lang)}>
                          <p className="text-xs text-[var(--muted)]">{t('evaluatorsShort', lang)}</p>
                          <p className="font-medium text-[var(--foreground)]">
                            {result.peerEvaluatorCompletedScorable ?? result.peerEvaluatorCountForTrim ?? 0}
                            {(result.peerEvaluatorAssigned ?? 0) > 0 ? (
                              <span className="text-[var(--muted)] font-normal">
                                /{result.peerEvaluatorAssigned}
                              </span>
                            ) : null}
                          </p>
                          {(result.peerEvaluatorPending ?? 0) > 0 ? (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400">
                              {t('evaluatorPendingShort', lang).replace('{n}', String(result.peerEvaluatorPending))}
                            </p>
                          ) : null}
                        </div>
                        {expandedPerson === result.targetId ? (
                          <ChevronUp className="w-5 h-5 text-[var(--muted)]/70" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-[var(--muted)]/70" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedPerson === result.targetId && (
                      <div className="bg-[var(--surface-2)] px-6 py-4 border-t border-[var(--border)]" id={`admin-report-${result.targetId}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                          <h4 className="font-medium text-[var(--foreground)]">{t('evaluationDetailsTitle', lang)}</h4>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void runAiExplainForPerson(result.targetId)}
                              disabled={aiExplainLoadingTargetId === String(result.targetId)}
                            >
                            {aiExplainLoadingTargetId === String(result.targetId) ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {lang === 'en' ? 'Generating…' : lang === 'fr' ? 'Génération…' : 'Üretiliyor…'}
                              </>
                            ) : (
                              <>
                                <FileText className="w-4 h-4" />
                                {lang === 'en' ? 'AI short explanation' : lang === 'fr' ? 'Explication IA' : 'AI kısa anlat'}
                              </>
                            )}
                          </Button>
                          </div>
                        </div>

                        {result.peerEvaluatorCoverage && showSchoolMatrixUi ? (
                          <EvaluatorCoveragePanel
                            lang={lang === 'fr' ? 'fr' : lang === 'en' ? 'en' : 'tr'}
                            assigned={result.peerEvaluatorAssigned ?? 0}
                            completedScorable={result.peerEvaluatorCompletedScorable ?? 0}
                            completedNoOpinion={result.peerEvaluatorCompletedNoOpinion ?? 0}
                            pending={result.peerEvaluatorPending ?? 0}
                            genelCompleted={result.peerEvaluatorCountGenel ?? 0}
                            bySlice={result.peerEvaluatorCoverage.bySlice}
                            rows={result.peerEvaluatorCoverage.rows}
                          />
                        ) : null}

                        {showSchoolMatrixUi && (result.matrixSlices || []).length > 0 ? (
                          (() => {
                            const { coreSlices, dutySlices } = splitMatrixSlicesForPersonDisplay(
                              result.matrixSlices || []
                            )
                            return (
                              <div className="mb-6 space-y-4">
                                {coreSlices.length > 0 && isSchoolOrg ? (
                                  <div className="rounded-2xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
                                    <p className="text-xs text-sky-900/90 dark:text-sky-100/90">
                                      {t('coreGeneralCategoryScopeNote', lang)}{' '}
                                      {lang === 'en'
                                        ? 'See the category table and SWOT below.'
                                        : lang === 'fr'
                                          ? 'Voir le tableau et le SWOT ci-dessous.'
                                          : 'Detaylı tablo ve SWOT aşağıdadır.'}
                                    </p>
                                  </div>
                                ) : null}
                                {dutySlices.length > 0 ? (
                                  <div className="rounded-2xl border-2 border-amber-500/30 bg-[var(--surface)] p-4">
                                    <div className="font-semibold text-[var(--foreground)]">
                                      {lang === 'en'
                                        ? 'Extra duties — category review'
                                        : lang === 'fr'
                                          ? 'Tâches annexes — revue par catégorie'
                                          : 'Yan görevler — kategori bazlı inceleme'}
                                    </div>
                                    <p className="text-xs text-[var(--muted)] mt-1 mb-2">
                                      {lang === 'en'
                                        ? 'Club, duty teacher, grade chair, etc. — separate from general & school life.'
                                        : lang === 'fr'
                                          ? 'Club, surveillant, zümre, etc. — séparé du général et vie scolaire.'
                                          : 'Kulüp, nöbet, zümre vb. — genel & okul yaşamdan ayrı.'}
                                    </p>
                                    <MatrixSliceCategoryAccordions slices={dutySlices} showSelf={false} />
                                  </div>
                                ) : null}
                              </div>
                            )
                          })()
                        ) : null}

                        {aiExplainByTargetId[String(result.targetId)] ? (
                          <div className="mb-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                            <div className="font-semibold text-[var(--foreground)] mb-1">
                              {lang === 'en' ? 'AI interpretation' : lang === 'fr' ? "Interprétation IA" : 'AI yorumu'}
                            </div>
                            {isSchoolOrg ? (
                              <p className="text-xs text-[var(--muted)] mb-2">{t('aiExplainDataScopeNote', lang)}</p>
                            ) : null}
                            <div className="text-sm text-[var(--foreground)] mb-3">
                              {String(aiExplainByTargetId[String(result.targetId)]?.oneLiner || '')}
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div>
                                <div className="text-xs font-semibold text-[var(--muted)] mb-2">
                                  {lang === 'en' ? 'What the columns mean (with your values)' : lang === 'fr' ? 'Signification des colonnes' : 'Başlıklar ne demek? (senin değerlerin)'}
                                </div>
                                <div className="space-y-2">
                                  {((aiExplainByTargetId[String(result.targetId)]?.headerGlossary || []) as any[]).slice(0, 8).map((g, i) => (
                                    <div key={`gl-${i}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="font-medium text-[var(--foreground)]">{String(g.header || '')}</div>
                                        <Badge variant="info">{String(g.value || '—')}</Badge>
                                      </div>
                                      <div className="text-xs text-[var(--muted)] mt-1">{String(g.meaning || '')}</div>
                                      <div className="text-xs text-[var(--foreground)] mt-1">{String(g.whatToDo || '')}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-[var(--muted)] mb-2">
                                  {lang === 'en' ? 'What to do next' : lang === 'fr' ? 'Prochaines actions' : 'Ne yapılmalı?'}
                                </div>
                                <div className="text-sm text-[var(--muted)] mb-2">
                                  {String(aiExplainByTargetId[String(result.targetId)]?.summary || '')}
                                </div>
                                <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--foreground)]">
                                  {((aiExplainByTargetId[String(result.targetId)]?.nextSteps || []) as any[]).slice(0, 6).map((s, i) => (
                                    <li key={`ns-${i}`}>{String(s || '')}</li>
                                  ))}
                                </ul>
                                {((aiExplainByTargetId[String(result.targetId)]?.caveats || []) as any[]).length ? (
                                  <div className="mt-3 text-xs text-[var(--muted)]">
                                    <div className="font-semibold text-[var(--muted)] mb-1">
                                      {lang === 'en' ? 'Notes' : lang === 'fr' ? 'Notes' : 'Notlar'}
                                    </div>
                                    <ul className="list-disc pl-5 space-y-1">
                                      {((aiExplainByTargetId[String(result.targetId)]?.caveats || []) as any[]).slice(0, 3).map((c, i) => (
                                        <li key={`cv-${i}`}>{String(c || '')}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            {aiExplainMetaByTargetId[String(result.targetId)]?.warning ? (
                              <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                {lang === 'en'
                                  ? 'AI service was temporarily unavailable; this is an automatic fallback explanation.'
                                  : lang === 'fr'
                                    ? "Le service IA était temporairement indisponible ; ceci est une explication de secours."
                                    : 'AI servisi geçici olarak kullanılamadı; şu an otomatik yedek açıklama gösteriliyor.'}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {(() => {
                          const risk = riskScorecard.find((x) => String(x.targetId) === String(result.targetId))
                          if (!risk) return null
                          const showCombinedRisk = isSchoolOrg && risk.hasCombined && risk.riskScoreCombined != null
                          const primaryScore = showCombinedRisk ? risk.riskScoreCombined! : risk.riskScore
                          const primaryExplain = showCombinedRisk ? risk.explainCombined! : risk.explain
                          return (
                            <div className="mb-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                                  <div>
                                    <div className="font-semibold text-[var(--foreground)]">
                                      {lang === 'en' ? 'Risk score (explainable)' : lang === 'fr' ? 'Score de risque (explicable)' : 'Risk puanı (açıklanabilir)'}
                                    </div>
                                    {showCombinedRisk ? (
                                      <p className="text-xs text-[var(--muted)] mt-0.5">
                                        {lang === 'en'
                                          ? 'Based on combined General & School Life score'
                                          : lang === 'fr'
                                            ? 'Basé sur le score combiné Général & Vie scolaire'
                                            : 'Genel & Okul Yaşam birleşik skoruna göre'}
                                        {' · '}
                                        {lang === 'en' ? 'Genel only' : 'Yalnızca genel'}: {risk.riskScore}/100
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <Badge variant={primaryScore >= 70 ? 'danger' : primaryScore >= 40 ? 'warning' : 'success'}>
                                  {primaryScore}/100
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
                                  <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Low performance' : lang === 'fr' ? 'Performance faible' : 'Düşük performans'}</div>
                                  <div className="text-lg font-bold text-[var(--foreground)]">{primaryExplain.lowScore}%</div>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
                                  <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Trend' : lang === 'fr' ? 'Tendance' : 'Trend'}</div>
                                  <div className="text-lg font-bold text-[var(--foreground)]">{primaryExplain.trend}%</div>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
                                  <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Gap' : lang === 'fr' ? 'Écart' : 'Gap'}</div>
                                  <div className="text-lg font-bold text-[var(--foreground)]">{primaryExplain.gap}%</div>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
                                  <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Coverage' : lang === 'fr' ? 'Couverture' : 'Kapsama'}</div>
                                  <div className="text-lg font-bold text-[var(--foreground)]">{primaryExplain.coverage}%</div>
                                </div>
                              </div>
                              {showCombinedRisk && risk.combinedOverall != null ? (
                                <p className="text-xs text-sky-800 dark:text-sky-300 mt-2">
                                  {lang === 'en' ? 'Combined score' : lang === 'fr' ? 'Score combiné' : 'Birleşik puan'}:{' '}
                                  <strong>{risk.combinedOverall.toFixed(2)}</strong>
                                  {' · '}
                                  {lang === 'en' ? 'General only' : 'Yalnızca genel'}: <strong>{risk.overall.toFixed(2)}</strong>
                                </p>
                              ) : null}
                              <div className="text-xs text-[var(--muted)] mt-2">
                                {lang === 'en'
                                  ? 'Action tip: increase evaluator coverage first, then address lowest peer categories.'
                                  : lang === 'fr'
                                    ? "Conseil : augmenter d'abord la couverture, puis travailler les catégories les plus faibles."
                                    : 'Aksiyon: önce kapsama (değerlendirici sayısı), sonra ekipte en düşük kategoriler üzerine çalışma.'}
                              </div>
                            </div>
                          )
                        })()}

                        {result.responseStats ? (
                          <div className="mb-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                            <div className="font-semibold text-[var(--foreground)] mb-2">
                              {lang === 'en' ? 'Response summary' : lang === 'fr' ? 'Résumé des réponses' : 'Yanıt özeti'}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[var(--muted)]">
                                  {lang === 'en' ? 'Questions (any response)' : lang === 'fr' ? 'Questions (toute réponse)' : 'Soru (en az 1 yanıt)'}
                                </span>
                                <span className="font-semibold text-[var(--foreground)]">{result.responseStats.totalQuestionsWithAnyResponse}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[var(--muted)]">
                                  {lang === 'en' ? 'Categories (any response)' : lang === 'fr' ? 'Catégories (toute réponse)' : 'Kategori (en az 1 yanıt)'}
                                </span>
                                <span className="font-semibold text-[var(--foreground)]">{result.responseStats.totalCategoriesWithAnyResponse}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[var(--muted)]">
                                  {lang === 'en' ? 'Self answered (questions)' : lang === 'fr' ? 'Auto répondu (questions)' : 'Öz cevaplanan (soru)'}
                                </span>
                                <span className="font-semibold text-[var(--foreground)]">{result.responseStats.selfAnsweredQuestions}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[var(--muted)]">
                                  {lang === 'en' ? 'Team answered (questions)' : lang === 'fr' ? 'Équipe répondu (questions)' : 'Ekip cevaplanan (soru)'}
                                </span>
                                <span className="font-semibold text-[var(--foreground)]">{result.responseStats.peerAnsweredQuestions}</span>
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-[var(--muted)]">
                              {lang === 'en'
                                ? 'Note: score 0 is the lowest performance option; “No knowledge” is a separate 5th choice and is excluded from averages.'
                                : lang === 'fr'
                                  ? 'Note : 0 = performance minimale ; « Je ne sais pas » est une 5ᵉ option exclue des moyennes.'
                                  : 'Not: 0 puan = en düşük performans şıkkıdır; «Bilgim yok» ayrı 5. şıktır ve ortalamaya girmez.'}
                            </div>
                            {result.responseStats?.questionTextLookup ? (
                              <div className="mt-3 text-xs text-[var(--muted)]">
                                <span className="font-semibold text-[var(--foreground)]">
                                  {lang === 'en' ? 'Question text lookup' : lang === 'fr' ? 'Résolution des questions' : 'Soru metni çözümleme'}
                                </span>
                                <div className="mt-1">
                                  {lang === 'en' ? 'Requested' : lang === 'fr' ? 'Demandé' : 'İstenen'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{result.responseStats.questionTextLookup.requested}</span>
                                  {' · '}
                                  {lang === 'en' ? 'Resolved' : lang === 'fr' ? 'Trouvé' : 'Bulunan'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{result.responseStats.questionTextLookup.resolved}</span>
                                  {' · '}
                                  {lang === 'en' ? 'Snapshot' : lang === 'fr' ? 'Snapshot' : 'Snapshot'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">
                                    {result.responseStats.questionTextLookup.usedSnapshot ? (lang === 'en' ? 'yes' : lang === 'fr' ? 'oui' : 'evet') : (lang === 'en' ? 'no' : lang === 'fr' ? 'non' : 'hayır')}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Security/KVKK standards summary (static, explanatory) */}
                        <SecurityStandardsSummary lang={lang} />

                        {(() => {
                          const evalsForDetail =
                            showPeerDetail && (result.evaluationsAll?.length || 0) > 0
                              ? result.evaluationsAll!
                              : result.evaluations
                          const questionText = (qid: string) => questionTextFromResult(result, qid, questionTexts, lang)
                          const renderEvalCard = (
                            eval_: ResultData['evaluations'][number],
                            idx: number,
                            kind: 'self' | 'team',
                            opts?: { allowMeetingCategoryList?: boolean }
                          ) => {
                            const isCoreCtx = isCoreGeneralReportMatrixContext(String(eval_.matrixContext || 'genel'))
                            const showCategoryList =
                              eval_.categories.length > 0 &&
                              (showPeerDetail ||
                                (isJobEvaluationPeriod &&
                                  (opts?.allowMeetingCategoryList === true || isCoreCtx)))
                            return (
                            <div
                              key={`${result.targetId}-${kind}-${String(eval_.evaluatorId)}-${idx}`}
                              className={`bg-[var(--surface)] p-3 rounded-xl border ${
                                eval_.isSelf ? 'border-[var(--brand)]/40 bg-[var(--brand-soft)]' : 'border-[var(--border)]'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2 gap-2">
                                <span className="text-sm font-medium text-[var(--foreground)] min-w-0">
                                  {eval_.isSelf ? t('selfEvaluationLabel', lang) : eval_.evaluatorName}
                                </span>
                                {eval_.hasScorableResponses === false ? (
                                  <Badge variant="gray" className="max-w-[min(100%,11rem)] whitespace-normal text-center leading-tight">
                                    {t('noCompetencyScoreBadge', lang)}
                                  </Badge>
                                ) : (
                                  <Badge variant={getScoreBadge(eval_.avgScore)}>
                                    {typeof eval_.avgScore === 'number' ? eval_.avgScore.toFixed(2) : eval_.avgScore}
                                  </Badge>
                                )}
                              </div>
                              {isJobEvaluationPeriod && eval_.matrixContext ? (
                                <div className="text-[11px] text-[var(--muted)] mb-1">
                                  {matrixEvaluationContextLabel(eval_.matrixContext)}
                                  {eval_.evaluatorWeight != null ? (
                                    <span>
                                      {' '}
                                      · {lang === 'en' ? 'Weight' : lang === 'fr' ? 'Poids' : 'Katsayı'}:{' '}
                                      <strong className="text-[var(--foreground)]">{eval_.evaluatorWeight}</strong>
                                    </span>
                                  ) : null}
                                  {eval_.evaluatorLevel ? (
                                    <span>
                                      {' '}
                                      · {positionLevelLabel(String(eval_.evaluatorLevel), lang)}
                                    </span>
                                  ) : null}
                                </div>
                              ) : !eval_.isSelf && eval_.evaluatorLevel ? (
                                <div className="text-[11px] text-[var(--muted)] mb-1">
                                  <strong className="text-[var(--foreground)]">
                                    {positionLevelLabel(String(eval_.evaluatorLevel), lang)}
                                  </strong>
                                  {eval_.evaluatorWeight != null ? (
                                    <span>
                                      {' '}
                                      · {lang === 'en' ? 'Weight' : lang === 'fr' ? 'Poids' : 'Katsayı'}:{' '}
                                      <strong className="text-[var(--foreground)]">{eval_.evaluatorWeight}</strong>
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="text-[11px] text-[var(--muted)] flex flex-wrap gap-x-3 gap-y-1">
                                <span>
                                  {lang === 'en' ? 'Responses' : lang === 'fr' ? 'Réponses' : 'Yanıt'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{Number(eval_.responseCount || 0)}</span>
                                </span>
                                <span>
                                  {lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{Number(eval_.distinctQuestionCount || 0)}</span>
                                </span>
                                <span>
                                  {lang === 'en' ? 'Categories' : lang === 'fr' ? 'Catégories' : 'Kategori'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{Number(eval_.distinctCategoryCount || 0)}</span>
                                </span>
                              </div>
                              {!showPeerDetail && !eval_.isSelf && isDutyMatrixContext(String(eval_.matrixContext || '')) ? (
                                <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                                  {t('evaluatorAnswerDetailEnablePeerDetail', lang)}
                                </p>
                              ) : null}
                              {eval_?.assignmentId ? (
                                <div className="mt-2 flex items-center justify-end">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={reopeningAssignmentId === eval_.assignmentId}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      reopenAssignment(eval_.assignmentId)
                                    }}
                                  >
                                    {reopeningAssignmentId === eval_.assignmentId
                                      ? (lang === 'en' ? 'Reopening...' : lang === 'fr' ? 'Réouverture...' : 'Açılıyor...')
                                      : (lang === 'en' ? 'Reopen evaluation' : lang === 'fr' ? "Rouvrir l'évaluation" : 'Değerlendirmeyi yeniden aç')}
                                  </Button>
                                </div>
                              ) : null}
                              {showPeerDetail && showCategoryList ? (
                                <div className="mt-2 space-y-1">
                                  <div className="text-[10px] text-[var(--muted)]">{t('evaluatorAnswerDetailClickCategory', lang)}</div>
                                  <div className="max-h-72 overflow-y-auto overscroll-contain pr-0.5 space-y-1">
                                    {eval_.categories.map((cat, catIdx) => {
                                      const expandKey = `${result.targetId}|${eval_.assignmentId || eval_.evaluatorId}|${cat.name}|${catIdx}`
                                      const isOpen = expandedEvalCategoryKey === expandKey
                                      const qScores = (eval_.questionScores || []).filter(
                                        (q) => String(q.category || '').trim() === String(cat.name || '').trim()
                                      )
                                      return (
                                        <div key={expandKey} className="rounded-lg border border-[var(--border)] overflow-hidden">
                                          <button
                                            type="button"
                                            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-[var(--surface-2)]/60 text-left"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setExpandedEvalCategoryKey(isOpen ? null : expandKey)
                                            }}
                                          >
                                            <span className="text-[var(--muted)] min-w-0 truncate" title={cat.name}>
                                              {cat.name}
                                            </span>
                                            <span className={`font-semibold shrink-0 ${getScoreColor(cat.score)}`}>{cat.score}</span>
                                          </button>
                                          {isOpen && qScores.length > 0 ? (
                                            <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/30 px-2 py-1.5 space-y-1">
                                              {qScores.map((q) => (
                                                <div key={q.questionId} className="flex items-start justify-between gap-2 text-[11px]">
                                                  <span className="text-[var(--foreground)] min-w-0" title={questionText(q.questionId)}>
                                                    {questionText(q.questionId)}
                                                  </span>
                                                  <span className="font-semibold shrink-0 text-[var(--foreground)]">
                                                    {q.score > 0 ? q.score.toFixed(2) : lang === 'en' ? '—' : '—'}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : isOpen ? (
                                            <div className="border-t border-[var(--border)] px-2 py-1.5 text-[11px] text-[var(--muted)]">
                                              {lang === 'en' ? 'No question scores' : lang === 'fr' ? 'Aucune note' : 'Soru puanı yok'}
                                            </div>
                                          ) : null}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : showCategoryList ? (
                                <div className="mt-2 max-h-64 overflow-y-auto overscroll-contain pr-0.5 space-y-1">
                                  {eval_.categories.map((cat, catIdx) => (
                                    <div key={`${cat.name}-${catIdx}`} className="flex items-center justify-between gap-2 text-xs">
                                      <span className="text-[var(--muted)] min-w-0 truncate" title={cat.name}>
                                        {cat.name}
                                      </span>
                                      <span className={getScoreColor(cat.score)}>{cat.score}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )
                          }

                          const byMatrix = groupPersonEvaluationsForDisplay(evalsForDetail)
                          const coreLabel = coreGeneralReportSectionLabel(
                            lang === 'fr' ? 'fr' : lang === 'en' ? 'en' : 'tr'
                          )

                          const renderMatrixSection = (
                            title: string,
                            evals: ResultData['evaluations'],
                            opts?: {
                              showSubContext?: boolean
                              accent?: 'core' | 'duty'
                              categoryRows?: Array<{ name: string; self?: number; peer?: number }>
                            }
                          ) => {
                            const selfEvals = evals.filter((e) => e.isSelf)
                            const teamEvals = evals.filter((e) => !e.isSelf)
                            if (!selfEvals.length && !teamEvals.length) return null
                            const categoryRows = opts?.categoryRows || []
                            return (
                              <div
                                className={`space-y-4 rounded-2xl border p-4 ${
                                  opts?.accent === 'core'
                                    ? 'border-sky-500/30 bg-sky-500/5'
                                    : opts?.accent === 'duty'
                                      ? 'border-amber-500/25 bg-amber-500/5'
                                      : 'border-[var(--border)] bg-[var(--surface)]'
                                }`}
                              >
                                <h5 className="text-sm font-semibold text-[var(--foreground)] border-b border-[var(--border)] pb-2">
                                  {title}
                                </h5>
                                {selfEvals.length > 0 && (
                                  <div>
                                    <h6 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                                      <span className="text-[var(--brand)]">🔵</span>
                                      {t('evaluationSectionSelf', lang)}
                                    </h6>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {selfEvals.map((ev, idx) => renderEvalCard(ev, idx, 'self', { allowMeetingCategoryList: opts?.accent === 'core' }))}
                                    </div>
                                  </div>
                                )}
                                {teamEvals.length > 0 && (
                                  <div>
                                    <h6 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                                      <span className="text-[var(--success)]">🟢</span>
                                      {t('evaluationSectionTeam', lang)}
                                    </h6>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {teamEvals.map((ev, idx) => renderEvalCard(ev, idx, 'team', { allowMeetingCategoryList: opts?.accent === 'core' }))}
                                    </div>
                                  </div>
                                )}
                                {opts?.accent === 'core' && categoryRows.length > 0 ? (
                                  <div className="rounded-xl border border-sky-500/20 bg-[var(--surface)] overflow-hidden">
                                    <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]/60">
                                      <div className="font-semibold text-sm text-[var(--foreground)]">
                                        {lang === 'en'
                                          ? 'Category scores (General & School Life)'
                                          : lang === 'fr'
                                            ? 'Scores par catégorie (Général & Vie scolaire)'
                                            : 'Kategori puanları (Genel & Okul Yaşam)'}
                                      </div>
                                      <p className="text-[11px] text-[var(--muted)] mt-0.5">
                                        {lang === 'en'
                                          ? 'Self vs team averages across merged general and school life forms.'
                                          : lang === 'fr'
                                            ? 'Moyennes auto vs équipe (général + vie scolaire fusionnés).'
                                            : 'Genel ve Okul Yaşam formları birleşik öz / ekip ortalamaları.'}
                                      </p>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                                          <tr>
                                            <th className="text-left py-2.5 px-4 font-semibold text-[var(--muted)]">
                                              {lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori'}
                                            </th>
                                            <th className="text-center py-2.5 px-4 font-semibold text-[var(--muted)]">🔵 {t('selfShort', lang)}</th>
                                            <th className="text-center py-2.5 px-4 font-semibold text-[var(--muted)]">🟢 {t('teamShort', lang)}</th>
                                            <th className="text-center py-2.5 px-4 font-semibold text-[var(--muted)]">
                                              {lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark'}
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                          {categoryRows.map((c) => {
                                            const self = Number(c.self || 0)
                                            const peer = Number(c.peer || 0)
                                            const diff = self && peer ? Math.round((self - peer) * 100) / 100 : 0
                                            return (
                                              <tr key={String(c.name)} className="hover:bg-[var(--surface-2)]/40">
                                                <td className="py-2.5 px-4 font-medium text-[var(--foreground)]">{c.name}</td>
                                                <td className="py-2.5 px-4 text-center">{self ? self.toFixed(2) : '—'}</td>
                                                <td className="py-2.5 px-4 text-center">{peer ? peer.toFixed(2) : '—'}</td>
                                                <td className="py-2.5 px-4 text-center font-semibold">
                                                  {self && peer ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}` : '—'}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            )
                          }

                          if (!isJobEvaluationPeriod) {
                            const pdLang = lang === 'fr' ? 'fr' : lang === 'en' ? 'en' : 'tr'
                            const byLevel = groupPersonEvaluationsByPositionLevel(evalsForDetail)
                            return (
                              <div className="space-y-6">
                                <div className="rounded-2xl border border-[var(--brand)]/25 bg-[var(--brand-soft)]/30 px-4 py-3">
                                  <p className="text-sm font-semibold text-[var(--foreground)]">
                                    {personalDevelopmentReportSectionLabel(pdLang)}
                                  </p>
                                  <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                                    {lang === 'en'
                                      ? 'Weighted team score from executives, peers and subordinates. Two trim columns: rules-based (≥7 answers/question, ≥3 evaluators) and general (min/max drop when ≥3 scorable answers per question).'
                                      : lang === 'fr'
                                        ? 'Score équipe pondéré. Deux colonnes trim : règles (≥7 réponses/question, ≥3 évaluateurs) et général (min/max dès ≥3 réponses notables).'
                                        : 'Üst, eşdeğer ve ast değerlendiricilerin katsayılı ekip puanı. İki trim sütunu: kurallı (≥7 cevap/soru, ≥3 değerlendirici) ve genel (soru başına ≥3 puanlanabilir cevapta min/max kırpma).'}
                                  </p>
                                </div>
                                {byLevel.selfEvals.length > 0 ? (
                                  <div>
                                    <h6 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                                      <span className="text-[var(--brand)]">🔵</span>
                                      {t('evaluationSectionSelf', lang)}
                                    </h6>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {byLevel.selfEvals.map((ev, idx) => renderEvalCard(ev, idx, 'self'))}
                                    </div>
                                  </div>
                                ) : null}
                                {byLevel.teamGroups.map((group) => (
                                  <div key={group.level}>
                                    <h6 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                                      <span className="text-[var(--success)]">🟢</span>
                                      {positionLevelLabel(group.level, lang)}
                                    </h6>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {group.evaluations.map((ev, idx) => renderEvalCard(ev, idx, 'team'))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          }

                          return (
                            <div className="space-y-6">
                              {renderMatrixSection(coreLabel, byMatrix.coreGeneral, {
                                accent: 'core',
                                showSubContext: true,
                                categoryRows: (result.categoryCompare || []).map((c) => ({
                                  name: c.name,
                                  self: c.self,
                                  peer: c.peer,
                                })),
                              })}
                              {byMatrix.dutyGroups.map((group) =>
                                renderMatrixSection(
                                  lang === 'en'
                                    ? `Extra duty — ${group.label}`
                                    : lang === 'fr'
                                      ? `Tâche annexe — ${group.label}`
                                      : `Yan görev — ${group.label}`,
                                  group.evaluations,
                                  { accent: 'duty' }
                                )
                              )}
                            </div>
                          )
                        })()}

                        {result.standardByTitle && result.standardByTitle.length > 0 && (
                          <div className="mt-6 bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
                            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]">
                              <div className="font-semibold text-[var(--foreground)]">{t('intlStandardsTitle', lang)}</div>
                              <Badge variant="info">
                                {result.standardAvg ? result.standardAvg.toFixed(2) : '-'} / {result.standardCount} kayıt
                              </Badge>
                            </div>
                            <div className="p-4 overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                                  <tr>
                                    <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{t('standardShort', lang)}</th>
                                    <th className="text-right py-2 px-3 font-semibold text-[var(--muted)] w-[120px]">{t('averageLabel', lang)}</th>
                                    <th className="text-right py-2 px-3 font-semibold text-[var(--muted)] w-[90px]">{t('countLabel', lang)}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {result.standardByTitle.slice(0, 12).map((s) => (
                                    <tr key={s.title}>
                                      <td className="py-2 px-3 text-[var(--foreground)]">{s.title}</td>
                                      <td className="py-2 px-3 text-right">
                                        <Badge variant={getScoreBadge(s.avg)}>{s.avg.toFixed(2)}</Badge>
                                      </td>
                                      <td className="py-2 px-3 text-right text-[var(--muted)]">{s.count}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {result.standardByTitle.length > 12 && (
                                <div className="mt-2 text-xs text-[var(--muted)]">{t('first12StandardsShown', lang)}</div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 flex items-center justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); printPerson(result.targetId) }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                          >
                            <Printer className="w-4 h-4" />
                            Yazdır / PDF
                          </button>
                        </div>

                        {/* SWOT + Detaylı Karşılaştırma */}
                        {result.categoryCompare.length > 0 && (
                          <div className="mt-6 space-y-6">
                            <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
                              <div className="font-semibold text-sm text-[var(--foreground)]">
                                {showSchoolMatrixUi
                                  ? coreGeneralReportSectionLabel(lang === 'fr' ? 'fr' : lang === 'en' ? 'en' : 'tr')
                                  : personalDevelopmentReportSectionLabel(
                                      lang === 'fr' ? 'fr' : lang === 'en' ? 'en' : 'tr'
                                    )}
                                {' — '}
                                {t('swotAndComparison', lang)}
                              </div>
                              <p className="text-xs text-[var(--muted)] mt-1">
                                {showSchoolMatrixUi
                                  ? t('coreGeneralCategoryScopeNote', lang)
                                  : lang === 'en'
                                    ? 'Personal development 360° — self, weighted team and trim by category.'
                                    : lang === 'fr'
                                      ? 'Développement personnel 360° — auto, équipe pondérée et trim par catégorie.'
                                      : 'Kişisel gelişim 360° — öz, katsayılı ekip ve kategori bazında trim.'}
                              </p>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                                <div className="font-semibold text-[var(--foreground)] mb-3">{t('radarCompare', lang)}</div>
                                <RadarCompare
                                  rows={result.categoryCompare.map((c) => ({ name: c.name, self: c.self || 0, peer: c.peer || 0 }))}
                                  selfLabel="Öz"
                                  peerLabel="Ekip"
                                />
                              </div>
                              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                                <div className="font-semibold text-[var(--foreground)] mb-3">{t('barCompare', lang)}</div>
                                <BarCompare
                                  rows={result.categoryCompare.map((c) => ({ name: c.name, self: c.self || 0, peer: c.peer || 0 }))}
                                  selfLabel="Öz"
                                  peerLabel="Ekip"
                                />
                              </div>
                            </div>

                            <details className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden group" open>
                              <summary className="px-5 py-4 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2 bg-[var(--surface-2)] cursor-pointer list-none">
                                <div className="font-semibold text-[var(--foreground)]">
                                  {t('categoryDetailedCompare', lang)}
                                  <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                                    ({result.categoryCompare.length} {lang === 'en' ? 'categories' : lang === 'fr' ? 'catégories' : 'kategori'} — {lang === 'en' ? 'click to expand/collapse' : lang === 'fr' ? 'cliquer pour ouvrir/fermer' : 'tıklayarak aç/kapat'})
                                  </span>
                                </div>
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <ReportExportButtons
                                    onExcel={() => exportCategoryCompareToExcel(result)}
                                    onPdf={() => printCategoryComparePdf(result)}
                                  />
                                  <Badge variant="info">{result.categoryCompare.length} kategori</Badge>
                                  <span className="text-xs text-[var(--muted)] group-open:rotate-180 transition-transform">▼</span>
                                </div>
                              </summary>
                              <div className="p-4 overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                                    <tr>
                                      <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">Kategori</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🔵 Öz (5)</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🔵 Öz (%)</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🟢 Ekip (5)</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🟢 Ekip (%)</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]" title={t('reportTrimRulesHint', lang)}>
                                        {t('reportTrimRulesColumn', lang)}
                                      </th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">Trim kurallı (%)</th>
                                      {!isJobEvaluationPeriod ? (
                                        <>
                                          <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]" title={t('reportTrimGeneralHint', lang)}>
                                            {t('reportTrimGeneralColumn', lang)}
                                          </th>
                                          <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">Trim genel (%)</th>
                                        </>
                                      ) : null}
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">Fark</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">Fark (trim kurallı)</th>
                                      {!isJobEvaluationPeriod ? (
                                        <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">Fark (trim genel)</th>
                                      ) : null}
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">Durum</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--border)]">
                                    {result.categoryCompare.map((c) => {
                                      const catKey = (c as any)?.key ? String((c as any).key) : String(c.name || '')
                                      const expandedKey = expandedCategoryByTarget[result.targetId] || null
                                      const isExpanded = expandedKey === catKey
                                      const qRows = result.categoryQuestions?.[catKey] || []
                                      const selfAnswered = qRows.some((q) => Number(q?.selfCount || 0) > 0) || c.self > 0
                                      const peerAnswered = qRows.some((q) => Number(q?.peerCount || 0) > 0) || c.peer > 0
                                      const status =
                                        !selfAnswered ? { label: 'Öz yok', variant: 'gray' as const } :
                                        !peerAnswered ? { label: 'Ekip yok', variant: 'gray' as const } :
                                        c.diff > 0.5 ? { label: 'Yüksek görüyor', variant: 'warning' as const } :
                                        c.diff < -0.5 ? { label: 'Düşük görüyor', variant: 'danger' as const } :
                                        { label: 'Tutarlı', variant: 'success' as const }
                                      const peerTrim = Number((c as any)?.peerTrimmed || 0) || 0
                                      const peerTrimGeneral = Number((c as any)?.peerTrimmedGeneral || 0) || 0
                                      const diffTrim = (c.self && peerTrim) ? Math.round((Number(c.self) - peerTrim) * 100) / 100 : 0
                                      const diffTrimGeneral =
                                        c.self && peerTrimGeneral
                                          ? Math.round((Number(c.self) - peerTrimGeneral) * 100) / 100
                                          : 0
                                      const trimPct = peerTrim ? `${Math.round((peerTrim / 5) * 100)}%` : '-'
                                      const trimGeneralPct = peerTrimGeneral
                                        ? `${Math.round((peerTrimGeneral / 5) * 100)}%`
                                        : '-'
                                      const detailColSpan = isJobEvaluationPeriod ? 9 : 12
                                      return (
                                        <>
                                          <tr
                                            key={catKey}
                                            className="hover:bg-[var(--surface-2)]/60 cursor-pointer"
                                            onClick={() => {
                                              setExpandedCategoryByTarget((prev) => ({
                                                ...prev,
                                                [result.targetId]: prev[result.targetId] === catKey ? null : catKey,
                                              }))
                                            }}
                                            title={
                                              qRows.length
                                                ? (lang === 'en'
                                                  ? 'Click to show questions'
                                                  : lang === 'fr'
                                                    ? 'Cliquer pour afficher les questions'
                                                    : 'Soruları görmek için tıklayın')
                                                : ''
                                            }
                                          >
                                            <td className="py-3 px-4 font-medium text-[var(--foreground)]">
                                              <div className="flex items-center gap-2">
                                                <span className="min-w-0 truncate" title={c.name}>{c.name}</span>
                                                {qRows.length ? (
                                                  <Badge variant="gray" className="shrink-0">
                                                    {qRows.length} {lang === 'en' ? 'Q' : lang === 'fr' ? 'Q' : 'Soru'}
                                                  </Badge>
                                                ) : null}
                                              </div>
                                            </td>
                                            <td className="py-3 px-4 text-center">{c.self ? c.self.toFixed(2) : '-'}</td>
                                            <td className="py-3 px-4 text-center text-[var(--brand)] font-semibold">{c.self ? `${Math.round((c.self / 5) * 100)}%` : '-'}</td>
                                            <td className="py-3 px-4 text-center">{c.peer ? c.peer.toFixed(2) : '-'}</td>
                                            <td className="py-3 px-4 text-center text-[var(--success)] font-semibold">{c.peer ? `${Math.round((c.peer / 5) * 100)}%` : '-'}</td>
                                            <td className="py-3 px-4 text-center">{peerTrim ? peerTrim.toFixed(2) : '—'}</td>
                                            <td className="py-3 px-4 text-center text-emerald-700 font-semibold">{peerTrim ? trimPct : '—'}</td>
                                            {!isJobEvaluationPeriod ? (
                                              <>
                                                <td className="py-3 px-4 text-center">
                                                  {peerTrimGeneral ? peerTrimGeneral.toFixed(2) : '—'}
                                                </td>
                                                <td className="py-3 px-4 text-center text-emerald-600 font-semibold">
                                                  {peerTrimGeneral ? trimGeneralPct : '—'}
                                                </td>
                                              </>
                                            ) : null}
                                            <td className="py-3 px-4 text-center font-semibold">{(c.self && c.peer) ? `${c.diff > 0 ? '+' : ''}${c.diff.toFixed(2)}` : '-'}</td>
                                            <td className="py-3 px-4 text-center font-semibold">{(c.self && peerTrim) ? `${diffTrim > 0 ? '+' : ''}${diffTrim.toFixed(2)}` : '—'}</td>
                                            {!isJobEvaluationPeriod ? (
                                              <td className="py-3 px-4 text-center font-semibold">
                                                {c.self && peerTrimGeneral
                                                  ? `${diffTrimGeneral > 0 ? '+' : ''}${diffTrimGeneral.toFixed(2)}`
                                                  : '—'}
                                              </td>
                                            ) : null}
                                            <td className="py-3 px-4 text-center">
                                              <Badge variant={status.variant}>{status.label}</Badge>
                                            </td>
                                          </tr>
                                          {isExpanded && (
                                            <tr key={`${catKey}-details`} className="bg-[var(--surface-2)]/50">
                                              <td colSpan={detailColSpan} className="py-3 px-4">
                                                {qRows.length ? (
                                                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                                                    <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                                                      <div className="font-semibold text-[var(--foreground)]">
                                                        {lang === 'en' ? 'Question breakdown' : lang === 'fr' ? 'Détail par question' : 'Soru bazlı kırılım'}
                                                      </div>
                                                      <div className="flex items-center gap-3">
                                                        <div className="text-xs text-[var(--muted)]">
                                                          {lang === 'en' ? 'Self vs Team averages' : lang === 'fr' ? 'Moyennes: auto vs équipe' : 'Öz vs Ekip ortalamaları'}
                                                        </div>
                                                        <Button
                                                          variant="secondary"
                                                          size="sm"
                                                          onClick={(e) => {
                                                            e.stopPropagation()
                                                            setExpandedCategoryByTarget((prev) => ({ ...prev, [result.targetId]: null }))
                                                          }}
                                                        >
                                                          {lang === 'en' ? 'Close' : lang === 'fr' ? 'Fermer' : 'Kapat'}
                                                        </Button>
                                                      </div>
                                                    </div>
                                                    <div className="p-3 overflow-x-auto">
                                                      <table className="w-full text-xs">
                                                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                                                          <tr>
                                                            <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                                                              {lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru'}
                                                            </th>
                                                            <th className="text-center py-2 px-3 font-semibold text-[var(--muted)] w-[80px]">🔵</th>
                                                            <th className="text-center py-2 px-3 font-semibold text-[var(--muted)] w-[80px]">🟢</th>
                                                            <th className="text-center py-2 px-3 font-semibold text-[var(--muted)] w-[95px]">🟢 trim</th>
                                                            <th className="text-center py-2 px-3 font-semibold text-[var(--muted)] w-[70px]">
                                                              {lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark'}
                                                            </th>
                                                            <th className="text-center py-2 px-3 font-semibold text-[var(--muted)] w-[90px]">
                                                              {lang === 'en' ? 'Trim' : lang === 'fr' ? 'Trim' : 'Trim'}
                                                            </th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[var(--border)]">
                                                          {qRows.map((q) => {
                                                            const selfCount = Number(q.selfCount || 0)
                                                            const peerCount = Number(q.peerCount || 0)
                                                            const self = Number.isFinite(Number(q.self)) ? Number(q.self) : 0
                                                            const peer = Number.isFinite(Number(q.peer)) ? Number(q.peer) : 0
                                                            const peerTrim = Number.isFinite(Number((q as any).peerTrimmed)) ? Number((q as any).peerTrimmed) : 0
                                                            const trimApplied = Boolean((q as any).peerTrimApplied)
                                                            const trimN = Number((q as any).peerTrimN || 0)
                                                            const diffQ = (selfCount > 0 && peerCount > 0) ? Number(q.diff) : 0
                                                            return (
                                                              <tr key={q.questionId} className="hover:bg-[var(--surface-2)]/60">
                                                                <td className="py-2 px-3 text-[var(--foreground)]">
                                                                  <div className="truncate" title={questionTextFromResult(result, q.questionId, questionTexts, lang)}>{questionTextFromResult(result, q.questionId, questionTexts, lang)}</div>
                                                                </td>
                                                                <td className="py-2 px-3 text-center">{selfCount > 0 ? self.toFixed(2) : '-'}</td>
                                                                <td className="py-2 px-3 text-center">{peerCount > 0 ? peer.toFixed(2) : '-'}</td>
                                                                <td className="py-2 px-3 text-center">{peerTrim > 0 ? peerTrim.toFixed(2) : '-'}</td>
                                                                <td className={`py-2 px-3 text-center font-semibold ${diffQ > 0 ? 'text-[var(--brand)]' : diffQ < 0 ? 'text-[var(--danger)]' : 'text-[var(--muted)]'}`}>
                                                                  {(selfCount > 0 && peerCount > 0) ? `${diffQ > 0 ? '+' : ''}${diffQ.toFixed(2)}` : '-'}
                                                                </td>
                                                                <td className="py-2 px-3 text-center">
                                                                  {trimApplied ? (
                                                                    <Badge variant="success">ok</Badge>
                                                                  ) : trimN >= 1 ? (
                                                                    <Badge variant="warning">{lang === 'en' ? `n<3 (${trimN})` : lang === 'fr' ? `n<3 (${trimN})` : `n<3 (${trimN})`}</Badge>
                                                                  ) : (
                                                                    <Badge variant="gray">—</Badge>
                                                                  )}
                                                                </td>
                                                              </tr>
                                                            )
                                                          })}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <div className="text-sm text-[var(--muted)]">
                                                    {lang === 'en'
                                                      ? 'No question details found for this category.'
                                                      : lang === 'fr'
                                                        ? 'Aucun détail de question trouvé pour cette catégorie.'
                                                        : 'Bu kategori için soru detayı bulunamadı.'}
                                                  </div>
                                                )}
                                                <div className="text-xs text-[var(--muted)] mt-2">
                                                  {lang === 'en'
                                                    ? 'Trim status: "ok" means highest+lowest were excluded; n<3 means not enough peer scores to trim.'
                                                    : lang === 'fr'
                                                      ? 'Statut trim: "ok" = min+max exclus; n<3 = scores pairs insuffisants.'
                                                      : 'Trim durumu: "ok" ise en yüksek+en düşük hariç tutuldu; n<3 ise trim için peer skoru yetersiz.'}
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </>
                                      )
                                    })}
                                  </tbody>
                                </table>
                                <div className="mt-2 text-xs text-[var(--muted)]">
                                  {lang === 'en'
                                    ? 'Tip: click a category row to see question-level scores.'
                                    : lang === 'fr'
                                      ? 'Astuce : cliquez sur une catégorie pour voir les scores par question.'
                                      : 'İpucu: Soru bazlı puanları görmek için kategori satırına tıklayın.'}
                                </div>
                              </div>
                            </details>

                            {(result.dutyPackageScores || []).length > 0 ? (
                              <div className="mb-6 rounded-2xl border border-indigo-200/70 bg-indigo-50/40 dark:bg-indigo-950/20 overflow-hidden">
                                <div className="px-5 py-4 border-b border-indigo-200/60 bg-indigo-100/50 dark:bg-indigo-900/30">
                                  <div className="font-semibold text-indigo-950 dark:text-indigo-100">
                                    Görev paketi özeti — ayrı başarı göstergeleri
                                  </div>
                                  <p className="text-xs text-indigo-900/80 dark:text-indigo-200/80 mt-1">
                                    Her satır bir görev paketinin (Öğretmen / Sınıf öğretmeni vb.) öz ve ekip ortalamasıdır.
                                  </p>
                                </div>
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {(result.dutyPackageScores || []).map((pkg) => (
                                    <div
                                      key={pkg.dutyId}
                                      className="rounded-xl border border-indigo-200/60 bg-white/80 dark:bg-[var(--surface)] p-4"
                                    >
                                      <div className="font-semibold text-[var(--foreground)]">{pkg.dutyName}</div>
                                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                                        <div>
                                          <div className="text-xs text-[var(--muted)]">Öz</div>
                                          <div className="font-bold text-[var(--brand)]">
                                            {pkg.selfScore > 0 ? pkg.selfScore.toFixed(2) : '—'}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-xs text-[var(--muted)]">Ekip</div>
                                          <div className="font-bold text-[var(--success)]">
                                            {pkg.peerAvg > 0 ? pkg.peerAvg.toFixed(2) : '—'}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-xs text-[var(--muted)]">Ekip (ağ.)</div>
                                          <div className="font-bold text-indigo-700 dark:text-indigo-300">
                                            {pkg.overallAvg > 0 ? pkg.overallAvg.toFixed(2) : '—'}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-xs text-[var(--muted)] mt-2 text-center">
                                        {pkg.peerCount} değerlendiren
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {result.hasDutyScope && (result.categoryCompareDuty?.length || 0) > 0 ? (
                              <details className="bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-amber-300/50 overflow-hidden group" open>
                                <summary className="px-5 py-4 border-b border-amber-200/60 bg-amber-100/40 dark:bg-amber-900/20 flex flex-wrap items-start justify-between gap-3 cursor-pointer list-none">
                                  <div>
                                    <div className="font-semibold text-amber-900 dark:text-amber-100">
                                      Ek görev değerlendirmesi — Öz vs Ekip
                                      <span className="ml-2 text-xs font-normal text-amber-800/80">
                                        ({(result.categoryCompareDuty || []).length} kategori)
                                      </span>
                                    </div>
                                    <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-1">
                                      Aynı ölçek (5-3-1-0 + Fikrim yok). Yalnızca hedef kişiye atanmış ek görev soruları; temel görev
                                      kıyaslaması yukarıdaki tabloda.
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <ReportExportButtons
                                      onExcel={() => exportCategoryCompareDutyToExcel(result)}
                                      onPdf={() => printCategoryCompareDutyPdf(result)}
                                    />
                                    <span className="text-xs text-amber-800/70 group-open:rotate-180 transition-transform">▼</span>
                                  </div>
                                </summary>
                                <div className="p-4 overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-amber-100/50 dark:bg-amber-900/30 border-b border-amber-200/60">
                                      <tr>
                                        <th className="text-left py-3 px-4 font-semibold text-amber-900/80 dark:text-amber-100">Kategori</th>
                                        <th className="text-center py-3 px-4 font-semibold text-amber-900/80 dark:text-amber-100">🔵 Öz (5)</th>
                                        <th className="text-center py-3 px-4 font-semibold text-amber-900/80 dark:text-amber-100">🔵 Öz (%)</th>
                                        <th className="text-center py-3 px-4 font-semibold text-amber-900/80 dark:text-amber-100">🟢 Ekip (5)</th>
                                        <th className="text-center py-3 px-4 font-semibold text-amber-900/80 dark:text-amber-100">🟢 Ekip (%)</th>
                                        <th className="text-center py-3 px-4 font-semibold text-amber-900/80 dark:text-amber-100">🟢 Ekip (trim)</th>
                                        <th className="text-center py-3 px-4 font-semibold text-amber-900/80 dark:text-amber-100">🟢 Trim (%)</th>
                                        <th className="text-center py-3 px-4 font-semibold text-amber-900/80 dark:text-amber-100">Fark</th>
                                        <th className="text-center py-3 px-4 font-semibold text-amber-900/80 dark:text-amber-100">Fark (trim)</th>
                                        <th className="text-center py-3 px-4 font-semibold text-amber-900/80 dark:text-amber-100">Durum</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber-200/40">
                                      {(result.categoryCompareDuty || []).map((c) => {
                                        const catKey = (c as any)?.key ? String((c as any).key) : String(c.name || '')
                                        const dutyExpandKey = `duty:${catKey}`
                                        const expandedKey = expandedCategoryByTarget[result.targetId] || null
                                        const isExpanded = expandedKey === dutyExpandKey
                                        const qRows = result.categoryQuestionsDuty?.[catKey] || []
                                        const dutyMax = Number(result.maxScaleDuty || 5) || 5
                                        const peerTrim = Number((c as any)?.peerTrimmed || 0) || 0
                                        const diffTrim =
                                          c.self && peerTrim ? Math.round((Number(c.self) - peerTrim) * 100) / 100 : 0
                                        const trimPct = peerTrim ? `${Math.round((peerTrim / dutyMax) * 100)}%` : '—'
                                        const selfAnswered = (c.self || 0) > 0 || qRows.some((q) => Number(q?.selfCount || 0) > 0)
                                        const peerAnswered = (c.peer || 0) > 0 || qRows.some((q) => Number(q?.peerCount || 0) > 0)
                                        const status =
                                          !selfAnswered
                                            ? { label: 'Öz yok', variant: 'gray' as const }
                                            : !peerAnswered
                                              ? { label: 'Ekip yok', variant: 'gray' as const }
                                              : c.diff > 0.5
                                                ? { label: 'Yüksek görüyor', variant: 'warning' as const }
                                                : c.diff < -0.5
                                                  ? { label: 'Düşük görüyor', variant: 'danger' as const }
                                                  : { label: 'Tutarlı', variant: 'success' as const }
                                        return (
                                          <>
                                            <tr
                                              key={`duty-${catKey}`}
                                              className="hover:bg-amber-100/30 dark:hover:bg-amber-900/20 cursor-pointer"
                                              onClick={() => {
                                                setExpandedCategoryByTarget((prev) => ({
                                                  ...prev,
                                                  [result.targetId]: prev[result.targetId] === dutyExpandKey ? null : dutyExpandKey,
                                                }))
                                              }}
                                              title={
                                                qRows.length
                                                  ? lang === 'en'
                                                    ? 'Click to show questions'
                                                    : lang === 'fr'
                                                      ? 'Cliquer pour afficher les questions'
                                                      : 'Soruları görmek için tıklayın'
                                                  : ''
                                              }
                                            >
                                              <td className="py-3 px-4 font-medium text-amber-950 dark:text-amber-50">
                                                <div className="flex items-center gap-2">
                                                  <span className="min-w-0 truncate" title={c.name}>
                                                    {c.name}
                                                  </span>
                                                  {qRows.length ? (
                                                    <Badge variant="warning" className="shrink-0">
                                                      {qRows.length} {lang === 'en' ? 'Q' : lang === 'fr' ? 'Q' : 'Soru'}
                                                    </Badge>
                                                  ) : null}
                                                </div>
                                              </td>
                                              <td className="py-3 px-4 text-center">{c.self ? c.self.toFixed(2) : '—'}</td>
                                              <td className="py-3 px-4 text-center text-amber-800 dark:text-amber-200 font-semibold">
                                                {c.self ? `${Math.round((c.self / dutyMax) * 100)}%` : '—'}
                                              </td>
                                              <td className="py-3 px-4 text-center">{c.peer ? c.peer.toFixed(2) : '—'}</td>
                                              <td className="py-3 px-4 text-center text-emerald-800 dark:text-emerald-300 font-semibold">
                                                {c.peer ? `${Math.round((c.peer / dutyMax) * 100)}%` : '—'}
                                              </td>
                                              <td className="py-3 px-4 text-center">{peerTrim ? peerTrim.toFixed(2) : '—'}</td>
                                              <td className="py-3 px-4 text-center text-emerald-800 dark:text-emerald-300 font-semibold">
                                                {peerTrim ? trimPct : '—'}
                                              </td>
                                              <td className="py-3 px-4 text-center font-semibold">
                                                {c.self && c.peer ? `${c.diff > 0 ? '+' : ''}${c.diff.toFixed(2)}` : '—'}
                                              </td>
                                              <td className="py-3 px-4 text-center font-semibold">
                                                {c.self && peerTrim ? `${diffTrim > 0 ? '+' : ''}${diffTrim.toFixed(2)}` : '—'}
                                              </td>
                                              <td className="py-3 px-4 text-center">
                                                <Badge variant={status.variant}>{status.label}</Badge>
                                              </td>
                                            </tr>
                                            {isExpanded && (
                                              <tr key={`${dutyExpandKey}-details`} className="bg-amber-100/20 dark:bg-amber-900/10">
                                                <td colSpan={10} className="py-3 px-4">
                                                  {qRows.length ? (
                                                    <div className="bg-[var(--surface)] border border-amber-300/40 rounded-xl overflow-hidden">
                                                      <div className="px-4 py-3 border-b border-amber-200/50 flex items-center justify-between">
                                                        <div className="font-semibold text-amber-950 dark:text-amber-50">
                                                          {lang === 'en'
                                                            ? 'Extra duty — question breakdown'
                                                            : lang === 'fr'
                                                              ? 'Tâche + — détail par question'
                                                              : 'Ek görev — soru bazlı kırılım'}
                                                        </div>
                                                        <Button
                                                          variant="secondary"
                                                          size="sm"
                                                          onClick={(e) => {
                                                            e.stopPropagation()
                                                            setExpandedCategoryByTarget((prev) => ({ ...prev, [result.targetId]: null }))
                                                          }}
                                                        >
                                                          {lang === 'en' ? 'Close' : lang === 'fr' ? 'Fermer' : 'Kapat'}
                                                        </Button>
                                                      </div>
                                                      <div className="p-3 overflow-x-auto">
                                                        <table className="w-full text-xs">
                                                          <thead className="bg-amber-50/80 dark:bg-amber-900/30 border-b border-amber-200/50">
                                                            <tr>
                                                              <th className="text-left py-2 px-3 font-semibold text-amber-900/80">
                                                                {lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru'}
                                                              </th>
                                                              <th className="text-center py-2 px-3 font-semibold w-[80px]">🔵</th>
                                                              <th className="text-center py-2 px-3 font-semibold w-[80px]">🟢</th>
                                                              <th className="text-center py-2 px-3 font-semibold w-[95px]">🟢 trim</th>
                                                              <th className="text-center py-2 px-3 font-semibold w-[70px]">
                                                                {lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark'}
                                                              </th>
                                                              <th className="text-center py-2 px-3 font-semibold w-[90px]">Trim</th>
                                                            </tr>
                                                          </thead>
                                                          <tbody className="divide-y divide-amber-200/30">
                                                            {qRows.map((q) => {
                                                              const selfCount = Number(q.selfCount || 0)
                                                              const peerCount = Number(q.peerCount || 0)
                                                              const self = Number.isFinite(Number(q.self)) ? Number(q.self) : 0
                                                              const peer = Number.isFinite(Number(q.peer)) ? Number(q.peer) : 0
                                                              const peerTrimQ = Number.isFinite(Number(q.peerTrimmed))
                                                                ? Number(q.peerTrimmed)
                                                                : 0
                                                              const trimApplied = Boolean(q.peerTrimApplied)
                                                              const trimN = Number(q.peerTrimN || 0)
                                                              const diffQ =
                                                                selfCount > 0 && peerCount > 0 ? Number(q.diff) : 0
                                                              return (
                                                                <tr key={q.questionId} className="hover:bg-amber-50/50">
                                                                  <td className="py-2 px-3 text-[var(--foreground)]">
                                                                    <div className="truncate" title={questionTextFromResult(result, q.questionId, questionTexts, lang)}>
                                                                      {questionTextFromResult(result, q.questionId, questionTexts, lang)}
                                                                    </div>
                                                                  </td>
                                                                  <td className="py-2 px-3 text-center">
                                                                    {selfCount > 0 ? self.toFixed(2) : '—'}
                                                                  </td>
                                                                  <td className="py-2 px-3 text-center">
                                                                    {peerCount > 0 ? peer.toFixed(2) : '—'}
                                                                  </td>
                                                                  <td className="py-2 px-3 text-center">
                                                                    {peerTrimQ > 0 ? peerTrimQ.toFixed(2) : '—'}
                                                                  </td>
                                                                  <td
                                                                    className={`py-2 px-3 text-center font-semibold ${diffQ > 0 ? 'text-[var(--brand)]' : diffQ < 0 ? 'text-[var(--danger)]' : 'text-[var(--muted)]'}`}
                                                                  >
                                                                    {selfCount > 0 && peerCount > 0
                                                                      ? `${diffQ > 0 ? '+' : ''}${diffQ.toFixed(2)}`
                                                                      : '—'}
                                                                  </td>
                                                                  <td className="py-2 px-3 text-center">
                                                                    {trimApplied ? (
                                                                      <Badge variant="success">ok</Badge>
                                                                    ) : trimN >= 1 ? (
                                                                      <Badge variant="warning">n&lt;3 ({trimN})</Badge>
                                                                    ) : (
                                                                      <Badge variant="gray">—</Badge>
                                                                    )}
                                                                  </td>
                                                                </tr>
                                                              )
                                                            })}
                                                          </tbody>
                                                        </table>
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <div className="text-sm text-amber-900/80 dark:text-amber-200/90">
                                                      {lang === 'en'
                                                        ? 'No question details for this extra-duty category.'
                                                        : lang === 'fr'
                                                          ? 'Aucun détail de question pour cette catégorie (tâche +).'
                                                          : 'Bu ek görev kategorisi için soru detayı bulunamadı.'}
                                                    </div>
                                                  )}
                                                </td>
                                              </tr>
                                            )}
                                          </>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                  <div className="mt-2 text-xs text-amber-800/90 dark:text-amber-200/80">
                                    {lang === 'en'
                                      ? 'Tip: click a category row to see extra-duty question scores.'
                                      : lang === 'fr'
                                        ? 'Astuce : cliquez sur une catégorie pour voir les scores par question (tâche +).'
                                        : 'İpucu: Ek görev soru puanları için kategori satırına tıklayın.'}
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                                    <span>
                                      <span className="text-[var(--muted)]">Genel (ek görev): </span>
                                      <strong>{result.overallAvgDuty != null ? Number(result.overallAvgDuty).toFixed(2) : '—'}</strong>
                                    </span>
                                    <span>
                                      <span className="text-[var(--muted)]">Genel (trim): </span>
                                      <strong>
                                        {Number(result.overallAvgTrimmedDuty || result.peerAvgTrimmedDuty || 0) > 0
                                          ? Number(result.overallAvgTrimmedDuty || result.peerAvgTrimmedDuty).toFixed(2)
                                          : '—'}
                                      </strong>
                                    </span>
                                    {result.score100TrimmedDuty != null ? (
                                      <span>
                                        <span className="text-[var(--muted)]">/100 (trim): </span>
                                        <strong>{Number(result.score100TrimmedDuty).toFixed(0)}</strong>
                                      </span>
                                    ) : null}
                                    <span>
                                      <span className="text-[var(--muted)]">Öz / Ekip: </span>
                                      <strong>
                                        {result.selfScoreDuty != null ? Number(result.selfScoreDuty).toFixed(2) : '—'} /{' '}
                                        {result.peerAvgDuty != null ? Number(result.peerAvgDuty).toFixed(2) : '—'}
                                      </strong>
                                    </span>
                                    <span>
                                      <span className="text-[var(--muted)]">Ekip (trim): </span>
                                      <strong>
                                        {Number(result.peerAvgTrimmedDuty || 0) > 0
                                          ? Number(result.peerAvgTrimmedDuty).toFixed(2)
                                          : '—'}
                                      </strong>
                                    </span>
                                  </div>
                                </div>
                              </details>
                            ) : null}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <p className="lg:col-span-2 text-xs text-[var(--muted)] -mt-2">
                                {isSchoolOrg
                                  ? t('coreGeneralSwotScopeNote', lang)
                                  : lang === 'en'
                                    ? 'SWOT is derived from the category table above.'
                                    : lang === 'fr'
                                      ? 'Le SWOT est calculé à partir du tableau ci-dessus.'
                                      : 'SWOT, yukarıdaki kategori tablosuna göre üretilir.'}
                              </p>
                              <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4">
                                <h4 className="font-semibold text-[var(--brand)] mb-4 text-center">{t('swotSelfTitle', lang)}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="bg-[var(--success-soft)] border border-[var(--success)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--success-text)] mb-2">💪 Güçlü Yönler</div>
                                    {result.swot.self.strengths.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.strengths.slice(0, 6).map(s => (
                                          <div key={s.name}>✓ {s.name} <span className="font-semibold">({s.score.toFixed(2)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Belirgin güçlü yön tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--danger-text)] mb-2">⚠️ Gelişim Alanları</div>
                                    {result.swot.self.weaknesses.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.weaknesses.slice(0, 6).map(w => (
                                          <div key={w.name}>• {w.name} <span className="font-semibold">({w.score.toFixed(2)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Belirgin gelişim alanı tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-[var(--info-soft)] border border-[var(--info)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--info-text)] mb-2">🚀 Fırsatlar</div>
                                    {result.swot.self.opportunities.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.opportunities.slice(0, 6).map(o => (
                                          <div key={o.name}>→ {o.name} <span className="font-semibold">({o.score.toFixed(2)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Orta seviye alan bulunmuyor</div>}
                                  </div>
                                  <div className="bg-[var(--warning-soft)] border border-[var(--warning)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--warning-text)] mb-2">📝 Öneriler</div>
                                    {result.swot.self.recommendations.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.recommendations.slice(0, 4).map((r, idx) => (
                                          <div key={idx}>• {r}</div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Öneri yok</div>}
                                  </div>
                                </div>
                              </div>

                              <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4">
                                <h4 className="font-semibold text-[var(--success)] mb-4 text-center">{t('swotTeamTitle', lang)}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="bg-[var(--success-soft)] border border-[var(--success)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--success-text)] mb-2">💪 Güçlü Yönler</div>
                                    {result.swot.peer.strengths.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.strengths.slice(0, 6).map(s => (
                                          <div key={s.name}>✓ {s.name} <span className="font-semibold">({s.score.toFixed(2)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Belirgin güçlü yön tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--danger-text)] mb-2">⚠️ Gelişim Alanları</div>
                                    {result.swot.peer.weaknesses.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.weaknesses.slice(0, 6).map(w => (
                                          <div key={w.name}>• {w.name} <span className="font-semibold">({w.score.toFixed(2)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Belirgin gelişim alanı tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-[var(--info-soft)] border border-[var(--info)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--info-text)] mb-2">🚀 Fırsatlar</div>
                                    {result.swot.peer.opportunities.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.opportunities.slice(0, 6).map(o => (
                                          <div key={o.name}>→ {o.name} <span className="font-semibold">({o.score.toFixed(2)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Orta seviye alan bulunmuyor</div>}
                                  </div>
                                  <div className="bg-[var(--warning-soft)] border border-[var(--warning)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--warning-text)] mb-2">📝 Öneriler</div>
                                    {result.swot.peer.recommendations.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.recommendations.slice(0, 4).map((r, idx) => (
                                          <div key={idx}>• {r}</div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Öneri yok</div>}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {(() => {
                              const ai = buildAiInsights(result)
                              return (
                                <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
                                  <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between">
                                    <div className="font-semibold text-[var(--foreground)]">🤖 AI Destekli Gelişim Önerileri</div>
                                    <Badge variant="info">Özet</Badge>
                                  </div>
                                  <div className="p-5 space-y-4">
                                    <div>
                                      <div className="text-xs font-semibold text-[var(--muted)] mb-1">Kısa SWOT Özeti</div>
                                      <div className="text-sm text-[var(--foreground)]">{ai.summary}</div>
                                    </div>

                                    <div>
                                      <div className="text-xs font-semibold text-[var(--muted)] mb-2">Önerilen Eğitimler</div>
                                      {ai.trainings.length ? (
                                        <div className="flex flex-wrap gap-2">
                                          {ai.trainings.map((t) => (
                                            <Badge key={t} variant="info">
                                              {t}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-sm text-[var(--muted)]">Yeterli veri yok.</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
          ) : null}

          {showReport('people_table_matrix') && isSchoolOrg && isJobEvaluationPeriod ? (
            <MatrixPersonResultsPanel
              data={matrixPersonResultsReport}
              loading={loading && !matrixPersonResultsReport}
              periodLabel={periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''}
              catalogTitle={reportDisplay('people_table_matrix').title}
              catalogDescription={reportDisplay('people_table_matrix').description}
              showPeerDetail={showPeerDetail}
            />
          ) : null}
          </>
          ) : null}
        </>
      )}
        </>
      )}
    </div>
  )
}
