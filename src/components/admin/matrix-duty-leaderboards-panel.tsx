'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { MatrixDutyLeaderboardsReport } from '@/lib/matrix-duty-leaderboards-report-build'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import {
  ReportCatalogSubtitle,
  resolveCatalogTitle,
  type ReportCatalogDisplayProps,
} from '@/components/admin/report-catalog-display'
import { scoreBadgeVariant } from '@/components/admin/matrix-person-score-card'
import { buildCsv, downloadCsv, openPrintableReportDocument } from '@/lib/admin-report-export'
import { Briefcase, TrendingDown, TrendingUp } from 'lucide-react'

type Props = ReportCatalogDisplayProps & {
  report: MatrixDutyLeaderboardsReport
  periodLabel: string
}

export function MatrixDutyLeaderboardsPanel({ report, periodLabel, catalogTitle, catalogDescription }: Props) {
  const lang = useLang()

  if (!report.sections.length) return null

  const exportExcel = () => {
    const headers =
      lang === 'en'
        ? ['Duty', 'List', 'Rank', 'Person', 'Department', 'MATRIX score', 'Questions']
        : lang === 'fr'
          ? ['Tâche', 'Liste', 'Rang', 'Personne', 'Département', 'Score MATRIX', 'Questions']
          : ['Yan görev', 'Liste', 'Sıra', 'Kişi', 'Birim', 'MATRIX puan', 'Soru']
    const rows: string[][] = []
    for (const section of report.sections) {
      section.top.forEach((row, i) => {
        rows.push([
          section.label,
          lang === 'en' ? 'Highest' : lang === 'fr' ? 'Plus haut' : 'En yüksek',
          String(i + 1),
          row.targetName,
          row.targetDept,
          row.score.toFixed(2),
          String(row.answeredQuestionCount),
        ])
      })
      section.bottom.forEach((row, i) => {
        rows.push([
          section.label,
          lang === 'en' ? 'Lowest' : lang === 'fr' ? 'Plus bas' : 'En düşük',
          String(i + 1),
          row.targetName,
          row.targetDept,
          row.score.toFixed(2),
          String(row.answeredQuestionCount),
        ])
      })
    }
    downloadCsv(`yan_gorevler_matrix_${periodLabel || 'period'}.csv`, buildCsv(headers, rows))
  }

  const exportPdf = () => {
    const headers =
      lang === 'en'
        ? ['#', 'Person', 'Department', 'MATRIX', 'Q']
        : lang === 'fr'
          ? ['#', 'Personne', 'Département', 'MATRIX', 'Q']
          : ['#', 'Kişi', 'Birim', 'MATRIX', 'S']
    const sections: Array<{ heading?: string; headers: string[]; rows: string[][] }> = []
    for (const section of report.sections) {
      const topHeading =
        lang === 'en'
          ? `${section.label} — Highest`
          : lang === 'fr'
            ? `${section.label} — Plus haut`
            : `${section.label} — En yüksek`
      sections.push({
        heading: topHeading,
        headers,
        rows: section.top.map((row, i) => [
          String(i + 1),
          row.targetName,
          row.targetDept,
          row.score.toFixed(2),
          String(row.answeredQuestionCount),
        ]),
      })
      const bottomHeading =
        lang === 'en'
          ? `${section.label} — Lowest`
          : lang === 'fr'
            ? `${section.label} — Plus bas`
            : `${section.label} — En düşük`
      sections.push({
        heading: bottomHeading,
        headers,
        rows: section.bottom.map((row, i) => [
          String(i + 1),
          row.targetName,
          row.targetDept,
          row.score.toFixed(2),
          String(row.answeredQuestionCount),
        ]),
      })
    }
    openPrintableReportDocument({
      lang,
      title: resolveCatalogTitle(catalogTitle, t('matrixDutyLeaderboardsTitle', lang)),
      subtitle: periodLabel,
      sections: sections.filter((s) => s.rows.length > 0),
    })
  }

  return (
    <Card className="mb-6 overflow-hidden border-amber-500/20 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-amber-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Briefcase className="w-5 h-5 text-amber-700 shrink-0" />
            <div className="min-w-0">
              <CardTitle>{resolveCatalogTitle(catalogTitle, t('matrixDutyLeaderboardsTitle', lang))}</CardTitle>
              <ReportCatalogSubtitle catalogDescription={catalogDescription} />
              <ReportPurposeNote purposeKey="reportPurpose_dutyMatricesMatrix" className="mt-1" />
            </div>
          </div>
          <ReportExportButtons onExcel={exportExcel} onPdf={exportPdf} />
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        <p className="text-xs text-[var(--muted)]">{t('matrixDutyLeaderboardsFootnote', lang)}</p>
        {report.sections.map((section) => (
          <div
            key={section.matrixContext}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">{section.label}</Badge>
              <span className="text-xs text-[var(--muted)]">
                {section.participantCount}{' '}
                {lang === 'en' ? 'people with MATRIX score' : lang === 'fr' ? 'personnes avec score MATRIX' : 'kişi (MATRIX puanı)'}
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                  <TrendingUp className="w-5 h-5" />
                  <span className="font-semibold">
                    {lang === 'en' ? 'Highest scores' : lang === 'fr' ? 'Scores les plus élevés' : 'En yüksek puanlar'}
                  </span>
                </div>
                <ul className="space-y-2 text-sm">
                  {section.top.map((row, i) => (
                    <li
                      key={`${section.matrixContext}-top-${row.targetId}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700">
                          {i + 1}
                        </span>
                        <span className="truncate font-medium text-[var(--foreground)]" title={row.targetName}>
                          {row.targetName}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[35%]" title={row.targetDept}>
                        {row.targetDept}
                      </span>
                      <Badge variant={scoreBadgeVariant(row.score)} className="shrink-0 tabular-nums">
                        {row.score.toFixed(2)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <div className="flex items-center gap-2 mb-3 text-rose-700 dark:text-rose-400">
                  <TrendingDown className="w-5 h-5" />
                  <span className="font-semibold">
                    {lang === 'en' ? 'Lowest scores' : lang === 'fr' ? 'Scores les plus bas' : 'En düşük puanlar'}
                  </span>
                </div>
                <ul className="space-y-2 text-sm">
                  {section.bottom.map((row, i) => (
                    <li
                      key={`${section.matrixContext}-bot-${row.targetId}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-xs font-bold text-rose-700">
                          {i + 1}
                        </span>
                        <span className="truncate font-medium text-[var(--foreground)]" title={row.targetName}>
                          {row.targetName}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[35%]" title={row.targetDept}>
                        {row.targetDept}
                      </span>
                      <Badge variant={scoreBadgeVariant(row.score)} className="shrink-0 tabular-nums">
                        {row.score.toFixed(2)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}
