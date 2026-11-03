'use client'

import { useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import {
  ReportCatalogSubtitle,
  resolveCatalogTitle,
  type ReportCatalogDisplayProps,
} from '@/components/admin/report-catalog-display'
import { openPrintableReportDocument, type PrintableReportSection } from '@/lib/admin-report-export'
import {
  MOMENTUM_PERFS,
  MOMENTUM_TRENDS,
  momentumExportCellOrder,
  type MomentumCell,
  type MomentumMatrix,
  type MomentumPerf,
  type MomentumTrend,
} from '@/lib/momentum-matrix'
import { LayoutGrid } from 'lucide-react'

type Lang = 'tr' | 'en' | 'fr'

export function momentumPerfLabel(p: MomentumPerf, lang: Lang) {
  return t(p === 'high' ? 'momentumHigh' : p === 'mid' ? 'momentumMid' : 'momentumLow', lang)
}

export function momentumTrendLabel(tr: MomentumTrend, lang: Lang) {
  return t(tr === 'up' ? 'momentumUp' : tr === 'flat' ? 'momentumFlat' : 'momentumDown', lang)
}

const cellKey = (c: { perf: MomentumPerf; trend: MomentumTrend }) => `${c.perf}:${c.trend}`

const fmtDelta = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(2)}`

function noPrevText(n: number, lang: Lang) {
  return t('momentumNoPrev', lang).replace('{n}', String(n))
}

type Props = ReportCatalogDisplayProps & {
  /** null → aynı türde iki dönem yok (ön koşul sağlanmadı). */
  matrix: MomentumMatrix | null
  onExcel: () => void
  onPdf: () => void
}

export function MomentumMatrixPanel({ matrix, catalogTitle, catalogDescription, onExcel, onPdf }: Props) {
  const lang = useLang()
  // Varsayılan: yalnız dikkat gerektiren iki hücre açık.
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (c: MomentumCell) => open[cellKey(c)] ?? c.attention
  const cellOf = (perf: MomentumPerf, trend: MomentumTrend) =>
    matrix?.cells.find((c) => c.perf === perf && c.trend === trend)

  return (
    <Card className="mb-6 overflow-hidden border-sky-500/20 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <LayoutGrid className="w-5 h-5 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <CardTitle>{resolveCatalogTitle(catalogTitle, t('momentumMatrixTitle', lang))}</CardTitle>
              <ReportCatalogSubtitle catalogDescription={catalogDescription} />
              <ReportPurposeNote purposeKey="reportPurpose_momentumMatrix" />
            </div>
          </div>
          <ReportExportButtons
            onExcel={onExcel}
            onPdf={onPdf}
            excelDisabled={!matrix || matrix.placedCount === 0}
            pdfDisabled={!matrix || matrix.placedCount === 0}
          />
        </div>
      </CardHeader>
      <CardBody>
        {!matrix ? (
          <p className="text-sm text-[var(--muted)]">{t('momentumNeedsTwoPeriods', lang)}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-2 text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-[var(--muted)] font-semibold align-bottom w-32">
                      {t('momentumAxisDelta', lang)} ↓ / {t('momentumAxisPerf', lang)} →
                    </th>
                    {MOMENTUM_PERFS.map((p) => (
                      <th key={p} className="text-center font-semibold text-[var(--muted)]">
                        {momentumPerfLabel(p, lang)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOMENTUM_TRENDS.map((tr) => (
                    <tr key={tr}>
                      <th className="text-left font-semibold text-[var(--muted)] align-top pt-3">{momentumTrendLabel(tr, lang)}</th>
                      {MOMENTUM_PERFS.map((p) => {
                        const c = cellOf(p, tr)!
                        const expanded = isOpen(c)
                        return (
                          <td
                            key={p}
                            className={`align-top rounded-xl border p-2 ${
                              c.attention
                                ? 'border-2 border-rose-500/60 bg-rose-500/5'
                                : 'border-[var(--border)] bg-[var(--surface)]'
                            }`}
                          >
                            <button
                              type="button"
                              className="w-full flex items-center justify-between gap-2 text-left"
                              aria-expanded={expanded}
                              onClick={() => setOpen((prev) => ({ ...prev, [cellKey(c)]: !expanded }))}
                            >
                              <span className="text-[var(--muted)]">
                                {momentumPerfLabel(p, lang)} · {momentumTrendLabel(tr, lang)}
                              </span>
                              <Badge variant={c.attention && c.people.length ? 'danger' : 'info'}>{c.people.length}</Badge>
                            </button>
                            {expanded && c.people.length ? (
                              <ul className="mt-2 space-y-1">
                                {c.people.map((r, i) => (
                                  <li key={`${r.name}-${r.dept}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="font-medium text-[var(--foreground)]">{r.name}</span>
                                    <span className="text-[var(--muted)]">{r.dept}</span>
                                    <span className="ml-auto tabular-nums">
                                      {r.cur.toFixed(2)}{' '}
                                      <span className={r.delta < 0 ? 'text-rose-600' : r.delta > 0 ? 'text-emerald-600' : 'text-[var(--muted)]'}>
                                        ({fmtDelta(r.delta)})
                                      </span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {matrix.noPrevCount > 0 ? (
              <p className="mt-3 text-xs text-[var(--muted)]">{noPrevText(matrix.noPrevCount, lang)}</p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  )
}

export function momentumMatrixExportHeaders(lang: Lang) {
  const L = (tr: string, en: string, fr: string) => (lang === 'en' ? en : lang === 'fr' ? fr : tr)
  return [
    t('momentumAxisPerf', lang),
    t('momentumAxisDelta', lang),
    L('Kişi', 'Person', 'Personne'),
    L('Birim', 'Department', 'Département'),
    L('Puan', 'Score', 'Score'),
    L('Önceki', 'Previous', 'Précédent'),
    L('Değişim', 'Change', 'Évolution'),
  ]
}

/** Satır bazlı: her kişi bir satır, hücre sırası çıktı sırasıyla (dikkat gerektirenler önce). */
export function momentumMatrixExportRows(matrix: MomentumMatrix, lang: Lang): unknown[][] {
  const rows: unknown[][] = []
  for (const c of momentumExportCellOrder(matrix)) {
    for (const r of c.people) {
      rows.push([momentumPerfLabel(c.perf, lang), momentumTrendLabel(c.trend, lang), r.name, r.dept, r.cur.toFixed(2), r.prev.toFixed(2), fmtDelta(r.delta)])
    }
  }
  return rows
}

/** PDF: her hücre bir bölüm; boş hücreleri paylaşılan yardımcı zaten atar. */
export function buildMomentumMatrixPdfSections(matrix: MomentumMatrix, lang: Lang): PrintableReportSection[] {
  const L = (tr: string, en: string, fr: string) => (lang === 'en' ? en : lang === 'fr' ? fr : tr)
  const sections: PrintableReportSection[] = momentumExportCellOrder(matrix).map((c) => ({
    heading: `${t('momentumAxisPerf', lang)}: ${momentumPerfLabel(c.perf, lang)} · ${t('momentumAxisDelta', lang)}: ${momentumTrendLabel(c.trend, lang)} (${c.people.length} ${L('kişi', 'people', 'personnes')})`,
    headers: [
      L('Kişi', 'Person', 'Personne'),
      L('Birim', 'Department', 'Département'),
      L('Puan', 'Score', 'Score'),
      L('Önceki', 'Previous', 'Précédent'),
      L('Değişim', 'Change', 'Évolution'),
    ],
    rows: c.people.map((r) => [r.name, r.dept, r.cur.toFixed(2), r.prev.toFixed(2), fmtDelta(r.delta)]),
  }))
  if (matrix.noPrevCount > 0) {
    sections.push({ headers: [L('Not', 'Note', 'Note')], rows: [[noPrevText(matrix.noPrevCount, lang)]] })
  }
  return sections
}

export function openMomentumMatrixPdf(
  matrix: MomentumMatrix,
  opts: { lang: Lang; periodLabel: string; catalogTitle?: string; onBlocked?: () => void }
) {
  const { lang, periodLabel, catalogTitle, onBlocked } = opts
  return openPrintableReportDocument({
    lang,
    title: `${resolveCatalogTitle(catalogTitle, t('momentumMatrixTitle', lang))} — ${periodLabel}`,
    subtitle: t('reportPurpose_momentumMatrix', lang),
    sections: buildMomentumMatrixPdfSections(matrix, lang),
    onBlocked,
  })
}
