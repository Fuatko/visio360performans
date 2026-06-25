'use client'

import { useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { MatrixPersonResultsReportPayload, MatrixPersonResultsRow } from '@/lib/server/matrix-person-results-report-build'
import { buildOrgPeerBenchmark } from '@/lib/matrix-person-results-peer-compare'
import { Card, CardHeader, CardBody, CardTitle, Badge, toast } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import {
  ReportCatalogSubtitle,
  resolveCatalogTitle,
  type ReportCatalogDisplayProps,
} from '@/components/admin/report-catalog-display'
import { MatrixPersonSliceKarneDetail } from '@/components/admin/matrix-person-slice-karne-detail'
import { scoreBadgeVariant } from '@/components/admin/matrix-person-score-card'
import { openPrintableReportDocument, downloadCsv, buildCsv } from '@/lib/admin-report-export'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

type Props = ReportCatalogDisplayProps & {
  data: MatrixPersonResultsReportPayload | null
  loading: boolean
  periodLabel: string
  showPeerDetail?: boolean
}

function categoryColumnsForScore(
  score: MatrixPersonResultsRow['core'] | MatrixPersonResultsRow['dutySlices'][number]['score']
) {
  if (!score) return []
  return score.categories.map((c) => ({ key: c.categoryKey, label: c.categoryLabel }))
}

function buildSummaryExportRows(
  people: MatrixPersonResultsRow[],
  categoryLabels: Array<{ key: string; label: string }>
) {
  return people.map((person) => {
    const catByKey = new Map((person.core?.categories || []).map((c) => [c.categoryKey, c.peerAvg]))
    const dutySummary = person.dutySlices
      .map((d) => `${d.matrixContextLabel}: ${d.score.overallPeerAvg.toFixed(2)}`)
      .join(' | ')
    return [
      String(person.rank),
      person.targetName,
      person.targetDept,
      person.core ? person.core.overallPeerAvg.toFixed(2) : '—',
      person.core ? String(person.core.answeredQuestionCount) : '0',
      ...categoryLabels.map((c) => {
        const v = catByKey.get(c.key)
        return v != null && v > 0 ? v.toFixed(2) : '—'
      }),
      dutySummary || '—',
    ]
  })
}

function buildDetailExportRows(people: MatrixPersonResultsRow[], lang: 'tr' | 'en' | 'fr') {
  const rows: string[][] = []
  for (const person of people) {
    const sections: Array<{ label: string; score: NonNullable<MatrixPersonResultsRow['core']> }> = []
    if (person.core) sections.push({ label: t('matrixPersonResultsCoreSection', lang), score: person.core })
    for (const d of person.dutySlices) {
      sections.push({ label: d.matrixContextLabel, score: d.score })
    }
    for (const section of sections) {
      for (const q of section.score.questions) {
        if (q.scorers?.length) {
          for (const scorer of q.scorers) {
            rows.push([
              person.targetName,
              person.targetDept,
              section.label,
              q.categoryLabel,
              q.questionText,
              q.peerAvg.toFixed(2),
              scorer.evaluatorName,
              scorer.score.toFixed(2),
            ])
          }
        } else {
          rows.push([
            person.targetName,
            person.targetDept,
            section.label,
            q.categoryLabel,
            q.questionText,
            q.peerAvg.toFixed(2),
            '',
            '',
          ])
        }
      }
    }
  }
  return rows
}

export function MatrixPersonResultsPanel({
  data,
  loading,
  periodLabel,
  catalogTitle,
  catalogDescription,
  showPeerDetail = false,
}: Props) {
  const lang = useLang()
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null)
  const [expandedSliceKey, setExpandedSliceKey] = useState<string | null>(null)

  const people = data?.people || []
  const categoryLabels = data?.categoryLabels || []

  const exportPopupBlockedToast = () =>
    lang === 'en'
      ? 'Allow pop-ups to print'
      : lang === 'fr'
        ? 'Autorisez les fenêtres'
        : 'Yazdırmak için açılır pencereye izin verin'

  const exportSummaryCsv = () => {
    if (!people.length) return
    const headers = [
      '#',
      lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
      lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
      t('matrixPersonResultsCoreScoreColumn', lang),
      lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru',
      ...categoryLabels.map((c) => c.label),
      lang === 'en' ? 'Duty scores' : lang === 'fr' ? 'Scores tâches' : 'Yan görev puanları',
    ]
    downloadCsv(
      `matrix-person-results-summary-${periodLabel.replace(/\s+/g, '-')}.csv`,
      buildCsv(headers, buildSummaryExportRows(people, categoryLabels))
    )
  }

  const exportDetailCsv = () => {
    if (!people.length) return
    if (!showPeerDetail) {
      toast(t('evaluatorAnswerDetailEnablePeerDetail', lang), 'error')
      return
    }
    const headers = [
      lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
      lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
      lang === 'en' ? 'Section' : lang === 'fr' ? 'Section' : 'Bölüm',
      lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori',
      lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru',
      lang === 'en' ? 'Avg' : lang === 'fr' ? 'Moy.' : 'Ort.',
      lang === 'en' ? 'Scorer' : lang === 'fr' ? 'Évaluateur' : 'Değerlendiren',
      lang === 'en' ? 'Score' : lang === 'fr' ? 'Score' : 'Puan',
    ]
    downloadCsv(
      `matrix-person-results-detail-${periodLabel.replace(/\s+/g, '-')}.csv`,
      buildCsv(headers, buildDetailExportRows(people, lang))
    )
  }

  const printSummaryPdf = () => {
    if (!people.length) return
    const headers = [
      '#',
      lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
      lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
      t('matrixPersonResultsCoreScoreColumn', lang),
      lang === 'en' ? 'Duty scores' : lang === 'fr' ? 'Scores tâches' : 'Yan görev puanları',
    ]
    const rows = people.map((p) => [
      String(p.rank),
      p.targetName,
      p.targetDept,
      p.core ? p.core.overallPeerAvg.toFixed(2) : '—',
      p.dutySlices.map((d) => `${d.matrixContextLabel}: ${d.score.overallPeerAvg.toFixed(2)}`).join('; ') || '—',
    ])
    const ok = openPrintableReportDocument({
      lang,
      title: t('matrixPersonResultsTitle', lang),
      subtitle: periodLabel,
      sections: [{ heading: t('matrixPersonResultsSummaryExportTitle', lang), headers, rows }],
      onBlocked: () => toast(exportPopupBlockedToast(), 'error'),
    })
    if (!ok) toast(exportPopupBlockedToast(), 'error')
  }

  const printDetailPdf = () => {
    if (!people.length) return
    if (!showPeerDetail) {
      toast(t('evaluatorAnswerDetailEnablePeerDetail', lang), 'error')
      return
    }
    const headers = [
      lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
      lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
      lang === 'en' ? 'Section' : lang === 'fr' ? 'Section' : 'Bölüm',
      lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori',
      lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru',
      lang === 'en' ? 'Avg' : lang === 'fr' ? 'Moy.' : 'Ort.',
      lang === 'en' ? 'Scorer' : lang === 'fr' ? 'Évaluateur' : 'Değerlendiren',
      lang === 'en' ? 'Score' : lang === 'fr' ? 'Score' : 'Puan',
    ]
    const ok = openPrintableReportDocument({
      lang,
      title: t('matrixPersonResultsTitle', lang),
      subtitle: periodLabel,
      sections: [{ headers, rows: buildDetailExportRows(people, lang) }],
      onBlocked: () => toast(exportPopupBlockedToast(), 'error'),
    })
    if (!ok) toast(exportPopupBlockedToast(), 'error')
  }

  const toggleSlice = (key: string) => {
    setExpandedSliceKey(expandedSliceKey === key ? null : key)
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3 w-full">
          <div className="min-w-0">
            <CardTitle>{resolveCatalogTitle(catalogTitle, t('matrixPersonResultsTitle', lang))}</CardTitle>
            <ReportCatalogSubtitle catalogDescription={catalogDescription} />
            <ReportPurposeNote purposeKey="reportPurpose_matrixPersonResults" />
            <p className="text-xs text-[var(--muted)] mt-1 font-normal max-w-3xl">{t('matrixPersonResultsScopeNote', lang)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReportExportButtons onExcel={exportSummaryCsv} onPdf={printSummaryPdf} />
            {people.length > 0 && showPeerDetail ? (
              <>
                <button
                  type="button"
                  className="text-xs rounded-lg border border-[var(--border)] px-2.5 py-1.5 hover:bg-[var(--surface-2)]"
                  onClick={exportDetailCsv}
                >
                  {t('matrixPersonResultsExportDetailExcel', lang)}
                </button>
                <button
                  type="button"
                  className="text-xs rounded-lg border border-[var(--border)] px-2.5 py-1.5 hover:bg-[var(--surface-2)]"
                  onClick={printDetailPdf}
                >
                  {t('matrixPersonResultsExportDetailPdf', lang)}
                </button>
              </>
            ) : null}
            <Badge variant="info">
              {people.length} {t('peopleCount', lang)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('matrixPersonResultsLoading', lang)}
          </div>
        ) : people.length === 0 ? (
          <div className="py-10 px-4 text-sm text-[var(--muted)] text-center">{t('matrixPersonResultsEmpty', lang)}</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {people.map((person) => {
              const personExpanded = expandedPersonId === person.targetId
              const coreScore = person.core?.overallPeerAvg ?? 0
              return (
                <div key={person.targetId} id={`matrix-person-row-${person.targetId}`}>
                  <div
                    className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4 hover:bg-[var(--surface-2)]/50 cursor-pointer"
                    onClick={() => setExpandedPersonId(personExpanded ? null : person.targetId)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-8 h-8 shrink-0 bg-sky-500/10 border border-sky-500/20 rounded-lg flex items-center justify-center text-sky-800 dark:text-sky-200 font-semibold text-sm">
                        {person.rank}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--foreground)]">{person.targetName}</p>
                        <p className="text-sm text-[var(--muted)]">{person.targetDept}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 sm:gap-6 shrink-0">
                      <div className="text-center min-w-[72px]">
                        <p className="text-xs text-sky-700 dark:text-sky-400">{t('matrixPersonResultsCoreShort', lang)}</p>
                        <Badge variant={scoreBadgeVariant(coreScore)}>
                          {person.core ? coreScore.toFixed(2) : '—'}
                        </Badge>
                      </div>
                      {person.dutySlices.map((d) => (
                        <div key={d.matrixContext} className="text-center min-w-[72px]">
                          <p className="text-xs text-amber-700 dark:text-amber-400 line-clamp-2 max-w-[5.5rem]" title={d.matrixContextLabel}>
                            {d.matrixContextLabel}
                          </p>
                          <Badge variant={scoreBadgeVariant(d.score.overallPeerAvg)} className="mt-0.5">
                            {d.score.overallPeerAvg.toFixed(2)}
                          </Badge>
                        </div>
                      ))}
                      <div className="text-[var(--muted)]">
                        {personExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>

                  {personExpanded ? (
                    <div className="px-4 sm:px-6 pb-6 space-y-8 bg-[var(--surface-2)]/20 border-t border-[var(--border)]/60">
                      <p className="text-xs text-[var(--muted)] pt-4">{t('matrixPersonKarneExpandHint', lang)}</p>
                      {person.core ? (
                        <MatrixPersonSliceKarneDetail
                          sectionLabel={t('matrixPersonResultsCoreSection', lang)}
                          score={person.core}
                          selfCategoryByKey={person.selfCategoryByKey}
                          categoryColumns={categoryColumnsForScore(person.core)}
                          benchmark={buildOrgPeerBenchmark(people, person.targetId, { type: 'core' })}
                          personName={person.targetName}
                          personDept={person.targetDept}
                          questionsExpanded={expandedSliceKey === `${person.targetId}::core`}
                          onToggleQuestions={() => toggleSlice(`${person.targetId}::core`)}
                          lang={lang === 'fr' ? 'fr' : lang === 'en' ? 'en' : 'tr'}
                          showPeerDetail={showPeerDetail}
                        />
                      ) : (
                        <div className="text-sm text-[var(--muted)] py-2">{t('matrixPersonResultsNoCore', lang)}</div>
                      )}
                      {person.dutySlices.map((d) => (
                        <MatrixPersonSliceKarneDetail
                          key={d.matrixContext}
                          sectionLabel={d.matrixContextLabel}
                          score={d.score}
                          selfCategoryByKey={person.selfCategoryByKey}
                          categoryColumns={categoryColumnsForScore(d.score)}
                          benchmark={buildOrgPeerBenchmark(people, person.targetId, {
                            type: 'duty',
                            matrixContext: d.matrixContext,
                          })}
                          personName={person.targetName}
                          personDept={person.targetDept}
                          questionsExpanded={expandedSliceKey === `${person.targetId}::${d.matrixContext}`}
                          onToggleQuestions={() => toggleSlice(`${person.targetId}::${d.matrixContext}`)}
                          lang={lang === 'fr' ? 'fr' : lang === 'en' ? 'en' : 'tr'}
                          showPeerDetail={showPeerDetail}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
