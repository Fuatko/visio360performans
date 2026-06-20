'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { SelfTeamGapCategoryRow, SelfTeamGapQuestionRow } from '@/lib/admin-department-ranking'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import { openPrintableReportDocument } from '@/lib/admin-report-export'
import { GitCompareArrows } from 'lucide-react'

type Props = {
  topCategoryGaps: SelfTeamGapCategoryRow[]
  topQuestionGaps: SelfTeamGapQuestionRow[]
  usesMatrixScoring: boolean
  onExcelCategory: () => void
  onPdfCategory: () => void
  onExcelQuestion: () => void
  onPdfQuestion: () => void
}

export function MatrixSelfTeamGapsPanel({
  topCategoryGaps,
  topQuestionGaps,
  usesMatrixScoring,
  onExcelCategory,
  onPdfCategory,
  onExcelQuestion,
  onPdfQuestion,
}: Props) {
  const lang = useLang()

  if (!topCategoryGaps.length && !topQuestionGaps.length) return null

  const selfLabel = lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz'
  const teamLabel = usesMatrixScoring
    ? t('matrixSelfTeamGapTeamLabel', lang)
    : lang === 'en'
      ? 'Team'
      : lang === 'fr'
        ? 'Équipe'
        : 'Ekip'
  const diffLabel = lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark'

  return (
    <div className="mb-6 space-y-4">
      {usesMatrixScoring ? (
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 space-y-2">
          <p className="text-sm text-sky-900/90 dark:text-sky-100/90">{t('matrixStructureScopeNote', lang)}</p>
          <p className="text-xs text-[var(--muted)]">{t('matrixStructureScoringRulesNote', lang)}</p>
          <p className="text-xs text-[var(--muted)]">{t('matrixSelfTeamGapNote', lang)}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden border-sky-500/20 shadow-sm">
          <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <GitCompareArrows className="w-5 h-5 text-sky-600 shrink-0" />
                <CardTitle>{t('matrixSelfTeamGapCategoryTitle', lang)}</CardTitle>
              </div>
              <ReportExportButtons onExcel={onExcelCategory} onPdf={onPdfCategory} excelDisabled={!topCategoryGaps.length} pdfDisabled={!topCategoryGaps.length} />
            </div>
          </CardHeader>
          <CardBody>
            {topCategoryGaps.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'}</th>
                      <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                      <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori'}</th>
                      <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]" title={selfLabel}>{selfLabel}</th>
                      <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]" title={teamLabel}>{teamLabel}</th>
                      <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{diffLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {topCategoryGaps.map((row, idx) => (
                      <tr key={`${row.person}-${row.category}-${idx}`}>
                        <td className="py-2 px-3 text-[var(--foreground)]">{row.person}</td>
                        <td className="py-2 px-3 text-[var(--muted)]">{row.dept}</td>
                        <td className="py-2 px-3 text-[var(--foreground)]">{row.category}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{row.self.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{row.peer.toFixed(2)}</td>
                        <td className={`py-2 px-3 text-right font-semibold tabular-nums ${row.diff > 0 ? 'text-[var(--brand)]' : 'text-[var(--danger)]'}`}>
                          {row.diff > 0 ? `+${row.diff.toFixed(2)}` : row.diff.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-[var(--muted)]">{t('matrixSelfTeamGapCategoryEmpty', lang)}</div>
            )}
          </CardBody>
        </Card>

        <Card className="overflow-hidden border-sky-500/20 shadow-sm">
          <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <GitCompareArrows className="w-5 h-5 text-sky-600 shrink-0" />
                <CardTitle>{t('matrixSelfTeamGapQuestionTitle', lang)}</CardTitle>
              </div>
              <ReportExportButtons onExcel={onExcelQuestion} onPdf={onPdfQuestion} excelDisabled={!topQuestionGaps.length} pdfDisabled={!topQuestionGaps.length} />
            </div>
          </CardHeader>
          <CardBody>
            {topQuestionGaps.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'}</th>
                      <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori'}</th>
                      <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru'}</th>
                      <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{selfLabel}</th>
                      <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{teamLabel}</th>
                      <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{diffLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {topQuestionGaps.map((row, idx) => (
                      <tr key={`${row.person}-${row.category}-${idx}`}>
                        <td className="py-2 px-3 text-[var(--foreground)]">{row.person}</td>
                        <td className="py-2 px-3 text-[var(--muted)]">{row.category}</td>
                        <td className="py-2 px-3 text-[var(--foreground)]">
                          <div className="max-w-[520px] truncate" title={row.question}>
                            {row.question}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{row.self.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{row.peer.toFixed(2)}</td>
                        <td className={`py-2 px-3 text-right font-semibold tabular-nums ${row.diff > 0 ? 'text-[var(--brand)]' : 'text-[var(--danger)]'}`}>
                          {row.diff > 0 ? `+${row.diff.toFixed(2)}` : row.diff.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-[var(--muted)]">{t('matrixSelfTeamGapQuestionEmpty', lang)}</div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

export function matrixSelfTeamGapExportHeaders(lang: 'tr' | 'en' | 'fr', kind: 'category' | 'question', usesMatrixScoring: boolean) {
  const teamCol = usesMatrixScoring
    ? lang === 'en'
      ? 'MATRIX team score'
      : lang === 'fr'
        ? 'Score équipe MATRIX'
        : 'MATRIX ekip puanı'
    : lang === 'en'
      ? 'Team'
      : lang === 'fr'
        ? 'Équipe'
        : 'Ekip'
  if (kind === 'category') {
    return [
      lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
      lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
      lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori',
      lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz',
      teamCol,
      lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark',
    ]
  }
  return [
    lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
    lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
    lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori',
    lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru',
    lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz',
    teamCol,
    lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark',
  ]
}

export function matrixSelfTeamGapCategoryExportRows(rows: SelfTeamGapCategoryRow[]) {
  return rows.map((r) => [r.person, r.dept, r.category, r.self.toFixed(2), r.peer.toFixed(2), r.diff.toFixed(2)])
}

export function matrixSelfTeamGapQuestionExportRows(rows: SelfTeamGapQuestionRow[]) {
  return rows.map((r) => [r.person, r.dept, r.category, r.question, r.self.toFixed(2), r.peer.toFixed(2), r.diff.toFixed(2)])
}

export function openMatrixSelfTeamGapPdf(
  kind: 'category' | 'question',
  rows: SelfTeamGapCategoryRow[] | SelfTeamGapQuestionRow[],
  opts: { lang: 'tr' | 'en' | 'fr'; periodLabel: string; usesMatrixScoring: boolean; onBlocked?: () => void }
) {
  const { lang, periodLabel, usesMatrixScoring, onBlocked } = opts
  const title =
    kind === 'category' ? t('matrixSelfTeamGapCategoryTitle', lang) : t('matrixSelfTeamGapQuestionTitle', lang)
  return openPrintableReportDocument({
    lang,
    title: `${title} — ${periodLabel}`,
    subtitle: usesMatrixScoring ? t('matrixSelfTeamGapNote', lang) : undefined,
    sections: [
      {
        headers: matrixSelfTeamGapExportHeaders(lang, kind, usesMatrixScoring),
        rows:
          kind === 'category'
            ? matrixSelfTeamGapCategoryExportRows(rows as SelfTeamGapCategoryRow[])
            : matrixSelfTeamGapQuestionExportRows(rows as SelfTeamGapQuestionRow[]),
      },
    ],
    onBlocked,
  })
}
