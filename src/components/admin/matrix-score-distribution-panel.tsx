'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { MatrixChartsReport } from '@/lib/admin-department-ranking'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import {
  ReportCatalogSubtitle,
  resolveCatalogTitle,
  type ReportCatalogDisplayProps,
} from '@/components/admin/report-catalog-display'
import { openPrintableReportDocument } from '@/lib/admin-report-export'
import { BarChart3 } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

type Props = ReportCatalogDisplayProps & {
  report: MatrixChartsReport
  onExcel: () => void
  onPdf: () => void
}

export function MatrixScoreDistributionPanel({
  report,
  catalogTitle,
  catalogDescription,
  onExcel,
  onPdf,
}: Props) {
  const lang = useLang()
  const hasData =
    report.overallDistribution.some((b) => b.count > 0) ||
    report.categorySummary.top.length > 0 ||
    report.categorySummary.bottom.length > 0

  if (!hasData) return null

  const sectionTitle = resolveCatalogTitle(
    catalogTitle,
    report.usesMatrixScoring ? t('matrixChartsTitle', lang) : t('pdChartsTitle', lang)
  )

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-5 h-5 text-sky-600 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">{sectionTitle}</h3>
            <ReportCatalogSubtitle catalogDescription={catalogDescription} />
          </div>
        </div>
        <ReportExportButtons onExcel={onExcel} onPdf={onPdf} />
      </div>

      {report.usesMatrixScoring ? (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 space-y-2">
          <p className="text-sm text-sky-900/90 dark:text-sky-100/90">{t('matrixStructureScopeNote', lang)}</p>
          <p className="text-xs text-[var(--muted)]">{t('matrixStructureScoringRulesNote', lang)}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden border-sky-500/20 shadow-sm">
          <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                {t(report.usesMatrixScoring ? 'matrixChartsDistributionTitle' : 'pdChartsDistributionTitle', lang)}
              </CardTitle>
              <Badge variant="info">{t('orgSummary', lang)}</Badge>
            </div>
          </CardHeader>
          <CardBody>
            <div className="w-full h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.overallDistribution} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="rgba(107,124,147,0.25)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--brand)" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">
              {report.usesMatrixScoring ? t('matrixChartsDistributionFootnote', lang) : t('resultsNoteSummary', lang)}
            </p>
          </CardBody>
        </Card>

        <Card className="overflow-hidden border-sky-500/20 shadow-sm">
          <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
            <CardTitle>
              {t(report.usesMatrixScoring ? 'matrixChartsCategoryTitle' : 'pdChartsCategoryTitle', lang)}
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-4 py-3 bg-[var(--surface-2)] font-semibold text-sm text-[var(--foreground)]">
                  {t('top5', lang)}
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {report.categorySummary.top.length ? (
                    report.categorySummary.top.map((c) => (
                      <div key={c.name} className="px-4 py-3 flex items-center justify-between gap-2">
                        <div className="text-sm text-[var(--foreground)] min-w-0 truncate" title={c.name}>
                          {c.name}
                        </div>
                        <Badge variant="success" className="tabular-nums shrink-0">
                          {c.avg.toFixed(2)}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-[var(--muted)]">—</div>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-4 py-3 bg-[var(--surface-2)] font-semibold text-sm text-[var(--foreground)]">
                  {t('improvementPriority5', lang)}
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {report.categorySummary.bottom.length ? (
                    report.categorySummary.bottom.map((c) => (
                      <div key={c.name} className="px-4 py-3 flex items-center justify-between gap-2">
                        <div className="text-sm text-[var(--foreground)] min-w-0 truncate" title={c.name}>
                          {c.name}
                        </div>
                        <Badge variant="warning" className="tabular-nums shrink-0">
                          {c.avg.toFixed(2)}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-[var(--muted)]">—</div>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-[var(--muted)] mt-3">
              {t(report.usesMatrixScoring ? 'matrixChartsCategoryFootnote' : 'pdChartsCategoryFootnote', lang)}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

export function matrixChartsExportRows(report: MatrixChartsReport, lang: 'tr' | 'en' | 'fr') {
  const rows: string[][] = []
  const distLabel = lang === 'en' ? 'Score distribution' : lang === 'fr' ? 'Distribution' : 'Puan dağılımı'
  const topLabel = lang === 'en' ? 'Top categories' : lang === 'fr' ? 'Meilleures catégories' : 'En güçlü kategoriler'
  const bottomLabel =
    lang === 'en' ? 'Improvement categories' : lang === 'fr' ? 'Catégories à développer' : 'Gelişim önceliği'
  report.overallDistribution.forEach((d) => rows.push([distLabel, d.label, String(d.count)]))
  report.categorySummary.top.forEach((c) => rows.push([topLabel, c.name, c.avg.toFixed(2)]))
  report.categorySummary.bottom.forEach((c) => rows.push([bottomLabel, c.name, c.avg.toFixed(2)]))
  return rows
}

export function openMatrixChartsPdf(
  report: MatrixChartsReport,
  opts: { lang: 'tr' | 'en' | 'fr'; periodLabel: string; catalogTitle?: string; onBlocked?: () => void }
) {
  const { lang, periodLabel, catalogTitle, onBlocked } = opts
  const sectionLabel = lang === 'en' ? 'Section' : lang === 'fr' ? 'Section' : 'Bölüm'
  const labelCol = lang === 'en' ? 'Label' : lang === 'fr' ? 'Libellé' : 'Etiket'
  const valueCol = lang === 'en' ? 'Value' : lang === 'fr' ? 'Valeur' : 'Değer'
  return openPrintableReportDocument({
    lang,
    title: `${resolveCatalogTitle(
      catalogTitle,
      report.usesMatrixScoring ? t('matrixChartsTitle', lang) : t('pdChartsTitle', lang)
    )} — ${periodLabel}`,
    subtitle: report.usesMatrixScoring ? t('matrixChartsDistributionFootnote', lang) : undefined,
    sections: [
      {
        headers: [sectionLabel, labelCol, valueCol],
        rows: matrixChartsExportRows(report, lang),
      },
    ],
    onBlocked,
  })
}
