'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { DepartmentCategoryHeatmap } from '@/lib/admin-department-ranking'
import { Card, CardHeader, CardBody, CardTitle } from '@/components/ui'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import {
  ReportCatalogSubtitle,
  resolveCatalogTitle,
  type ReportCatalogDisplayProps,
} from '@/components/admin/report-catalog-display'
import { openPrintableReport } from '@/lib/admin-report-export'
import { Grid3x3 } from 'lucide-react'

type Props = ReportCatalogDisplayProps & {
  heatmap: DepartmentCategoryHeatmap
  onExcel: () => void
  onPdf: () => void
}

export function MatrixDepartmentHeatmapPanel({
  heatmap,
  catalogTitle,
  catalogDescription,
  onExcel,
  onPdf,
}: Props) {
  const lang = useLang()

  if (!heatmap.departments.length || !heatmap.categories.length) return null

  return (
    <Card className="mb-6 overflow-hidden border-sky-500/20 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Grid3x3 className="w-5 h-5 text-sky-600 shrink-0" />
            <CardTitle>
              {resolveCatalogTitle(
                catalogTitle,
                heatmap.usesMatrixScoring
                  ? t('matrixDepartmentHeatmapTitle', lang)
                  : t('pdDepartmentHeatmapTitle', lang)
              )}
            </CardTitle>
            <ReportCatalogSubtitle catalogDescription={catalogDescription} />
          </div>
          <ReportExportButtons onExcel={onExcel} onPdf={onPdf} />
        </div>
      </CardHeader>
      <CardBody>
        {heatmap.usesMatrixScoring ? (
          <>
            <p className="text-sm text-sky-900/90 dark:text-sky-100/90 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 mb-3">
              {t('matrixStructureScopeNote', lang)}
            </p>
            <p className="text-xs text-[var(--muted)] mb-3">{t('matrixStructureScoringRulesNote', lang)}</p>
          </>
        ) : null}
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-xs min-w-max">
            <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left py-2 px-3 font-semibold text-[var(--muted)] sticky left-0 bg-[var(--surface-2)] z-10">
                  {lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}
                </th>
                {heatmap.categories.map((c) => (
                  <th key={c} className="text-center py-2 px-3 font-semibold text-[var(--muted)] whitespace-nowrap max-w-[10rem]">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {heatmap.departments.map((d) => (
                <tr key={d}>
                  <td className="py-2 px-3 text-[var(--foreground)] sticky left-0 bg-[var(--surface)] z-10 whitespace-nowrap font-medium">
                    {d}
                  </td>
                  {heatmap.categories.map((c) => {
                    const v = heatmap.value(d, c)
                    return (
                      <td
                        key={`${d}-${c}`}
                        className={`py-2 px-3 text-center font-semibold tabular-nums ${heatmap.color(v)}`}
                        title={v === null ? '' : `${d} · ${c}: ${v.toFixed(2)}`}
                      >
                        {v === null ? '—' : v.toFixed(2)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {heatmap.usesMatrixScoring ? t('matrixDepartmentHeatmapFootnote', lang) : t('matrixDepartmentHeatmapLegacyFootnote', lang)}
        </p>
      </CardBody>
    </Card>
  )
}

export function matrixDepartmentHeatmapExportHeaders(categories: string[], lang: 'tr' | 'en' | 'fr') {
  return [
    lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
    ...categories,
  ]
}

export function matrixDepartmentHeatmapExportRows(heatmap: DepartmentCategoryHeatmap) {
  return heatmap.departments.map((dept) => [
    dept,
    ...heatmap.categories.map((cat) => {
      const v = heatmap.value(dept, cat)
      return v === null ? '' : v.toFixed(2)
    }),
  ])
}

export function openMatrixDepartmentHeatmapPdf(
  heatmap: DepartmentCategoryHeatmap,
  opts: { lang: 'tr' | 'en' | 'fr'; periodLabel: string; catalogTitle?: string; onBlocked?: () => void }
) {
  const { lang, periodLabel, catalogTitle, onBlocked } = opts
  return openPrintableReport({
    lang,
    title: `${resolveCatalogTitle(
      catalogTitle,
      heatmap.usesMatrixScoring ? t('matrixDepartmentHeatmapTitle', lang) : t('pdDepartmentHeatmapTitle', lang)
    )} — ${periodLabel}`,
    subtitle: heatmap.usesMatrixScoring ? t('matrixDepartmentHeatmapFootnote', lang) : undefined,
    headers: matrixDepartmentHeatmapExportHeaders(heatmap.categories, lang),
    rows: matrixDepartmentHeatmapExportRows(heatmap).map((row) => row.map(String)),
    onBlocked,
  })
}
