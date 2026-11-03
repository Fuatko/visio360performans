'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { useState } from 'react'
import type {
  CadreCategoryHeatmap,
  CadreCompetencySummary,
  DepartmentCategoryHeatmap,
} from '@/lib/admin-department-ranking'
import { Card, CardHeader, CardBody, CardTitle } from '@/components/ui'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import {
  ReportCatalogSubtitle,
  resolveCatalogTitle,
  type ReportCatalogDisplayProps,
} from '@/components/admin/report-catalog-display'
import { openPrintableReport, openPrintableReportDocument, type PrintableReportSection } from '@/lib/admin-report-export'
import { Grid3x3 } from 'lucide-react'

/** Ekranda seçili görünüm: birim bazında (varsayılan) ya da kadro bazında. */
export type HeatmapView = 'dept' | 'cadre'

type Lang = 'tr' | 'en' | 'fr'

type Props = ReportCatalogDisplayProps & {
  heatmap: DepartmentCategoryHeatmap
  /** Kurumun kadro tanımı varsa kadro × yetkinlik ısı haritası; yoksa null (geçiş görünmez). */
  cadreHeatmap?: CadreCategoryHeatmap | null
  onExcel: (view: HeatmapView) => void
  onPdf: (view: HeatmapView) => void
}

function thinDataText(n: number, lang: Lang) {
  return t('cadreCompetencyThinData', lang).replace('{n}', String(n))
}

/** Kadro başına en zayıf / en güçlü üç yetkinlik. Eşiği geçen yoksa kadro listelenmez. */
function CadreCompetencyList({ items, lang }: { items: CadreCompetencySummary[]; lang: Lang }) {
  const shown = items.filter((c) => c.weakest.length > 0 || c.thinCount > 0)
  if (!shown.length) return null
  const list = (title: string, rows: CadreCompetencySummary['weakest'], tone: string) =>
    rows.length ? (
      <div>
        <div className={`text-xs font-semibold mb-1 ${tone}`}>{title}</div>
        <ol className="space-y-0.5 text-xs text-[var(--foreground)]">
          {rows.map((r) => (
            <li key={r.category} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0">{r.category}</span>
              <span className="tabular-nums font-semibold shrink-0">{r.value.toFixed(2)}</span>
            </li>
          ))}
        </ol>
      </div>
    ) : null
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((c) => (
        <div key={c.cadre} className="rounded-xl border border-[var(--border)] p-3 space-y-2">
          <div className="font-semibold text-sm text-[var(--foreground)]">{c.cadre}</div>
          {list(t('cadreWeakest', lang), c.weakest, 'text-rose-700 dark:text-rose-300')}
          {list(t('cadreStrongest', lang), c.strongest, 'text-emerald-700 dark:text-emerald-300')}
          {c.thinCount > 0 ? <p className="text-[11px] text-[var(--muted)]">{thinDataText(c.thinCount, lang)}</p> : null}
        </div>
      ))}
    </div>
  )
}

export function MatrixDepartmentHeatmapPanel({
  heatmap,
  cadreHeatmap,
  catalogTitle,
  catalogDescription,
  onExcel,
  onPdf,
}: Props) {
  const lang = useLang()
  const [view, setView] = useState<HeatmapView>('dept')
  const hasCadres = !!cadreHeatmap && cadreHeatmap.cadres.length > 0 && cadreHeatmap.categories.length > 0
  const activeView: HeatmapView = hasCadres ? view : 'dept'
  const byCadre = activeView === 'cadre' && hasCadres

  if (!heatmap.departments.length || !heatmap.categories.length) return null

  // Satır kaynağı: birim ya da kadro. Tablo biçimi ve renk ölçeği aynı.
  const rowLabels = byCadre ? cadreHeatmap!.cadres : heatmap.departments
  const categories = byCadre ? cadreHeatmap!.categories : heatmap.categories
  const cellValue = byCadre ? cadreHeatmap!.value : heatmap.value
  const cellColor = byCadre ? cadreHeatmap!.color : heatmap.color
  const crossCut = byCadre ? cadreHeatmap!.crossCut || null : null
  const toggleClass = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-medium ${
      active ? 'bg-sky-500/15 text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'
    }`

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
          <ReportExportButtons onExcel={() => onExcel(activeView)} onPdf={() => onPdf(activeView)} />
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
        {hasCadres ? (
          <div className="mb-3 inline-flex rounded-lg border border-[var(--border)] p-0.5">
            <button type="button" className={toggleClass(!byCadre)} aria-pressed={!byCadre} onClick={() => setView('dept')}>
              {t('heatmapByDept', lang)}
            </button>
            <button type="button" className={toggleClass(byCadre)} aria-pressed={byCadre} onClick={() => setView('cadre')}>
              {t('heatmapByCadre', lang)}
            </button>
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-xs min-w-max">
            <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left py-2 px-3 font-semibold text-[var(--muted)] sticky left-0 bg-[var(--surface-2)] z-10">
                  {byCadre
                    ? lang === 'en'
                      ? 'Staff group'
                      : lang === 'fr'
                        ? 'Groupe'
                        : 'Kadro'
                    : lang === 'en'
                      ? 'Department'
                      : lang === 'fr'
                        ? 'Département'
                        : 'Birim'}
                </th>
                {categories.map((c) => (
                  <th key={c} className="text-center py-2 px-3 font-semibold text-[var(--muted)] whitespace-nowrap max-w-[10rem]">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rowLabels.map((d) => (
                <tr key={d}>
                  <td className="py-2 px-3 text-[var(--foreground)] sticky left-0 bg-[var(--surface)] z-10 whitespace-nowrap font-medium">
                    {d}
                  </td>
                  {categories.map((c) => {
                    const v = cellValue(d, c)
                    return (
                      <td
                        key={`${d}-${c}`}
                        className={`py-2 px-3 text-center font-semibold tabular-nums ${cellColor(v)}`}
                        title={v === null ? '' : `${d} · ${c}: ${v.toFixed(2)}`}
                      >
                        {v === null ? '—' : v.toFixed(2)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {crossCut ? (
                // Çapraz kesit: kadroların altında, ayırıcı çizgiyle; kadrolarla toplanmaz.
                <tr className="border-t-2 border-violet-500/50">
                  <td className="py-2 px-3 text-[var(--foreground)] sticky left-0 bg-[var(--surface)] z-10 whitespace-nowrap font-medium italic">
                    {crossCut.label}
                  </td>
                  {categories.map((c) => {
                    const v = crossCut.value(c)
                    return (
                      <td
                        key={`__cross-${c}`}
                        className={`py-2 px-3 text-center font-semibold tabular-nums ${cellColor(v)}`}
                        title={v === null ? '' : `${crossCut.label} · ${c}: ${v.toFixed(2)}`}
                      >
                        {v === null ? '—' : v.toFixed(2)}
                      </td>
                    )
                  })}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {crossCut ? <p className="mt-2 text-xs text-violet-800 dark:text-violet-200">{t('mgrCrossCutNote', lang)}</p> : null}
        {byCadre ? (
          <CadreCompetencyList
            items={crossCut ? [...cadreHeatmap!.competency, crossCut.competency] : cadreHeatmap!.competency}
            lang={lang}
          />
        ) : null}
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

// ---------------------------------------------------------------------------
// Kadro bazında dışa aktarma. Birim bazındaki yardımcılar (yukarıda) değişmedi.
// ---------------------------------------------------------------------------

const hmL = (lang: Lang, tr: string, en: string, fr: string) => (lang === 'en' ? en : lang === 'fr' ? fr : tr)

export function matrixCadreHeatmapExportHeaders(categories: string[], lang: Lang) {
  return [hmL(lang, 'Kadro', 'Staff group', 'Groupe'), ...categories]
}

export function matrixCadreHeatmapExportRows(heatmap: CadreCategoryHeatmap) {
  const fmt = (v: number | null) => (v === null ? '' : v.toFixed(2))
  const rows = heatmap.cadres.map((cadre) => [cadre, ...heatmap.categories.map((cat) => fmt(heatmap.value(cadre, cat)))])
  // Çapraz kesit ekrandaki gibi en altta; kadrolarla toplanmaz.
  if (heatmap.crossCut) {
    const cc = heatmap.crossCut
    rows.push([cc.label, ...heatmap.categories.map((cat) => fmt(cc.value(cat)))])
  }
  return rows
}

/** Çapraz kesit satırı varsa çift sayım notu (tek hücreli satır), yoksa null. */
export function matrixCadreHeatmapCrossCutNote(heatmap: CadreCategoryHeatmap, lang: Lang): string | null {
  return heatmap.crossCut ? t('mgrCrossCutNote', lang) : null
}

export function matrixCadreCompetencyExportHeaders(lang: Lang) {
  return [
    hmL(lang, 'Kadro', 'Staff group', 'Groupe'),
    hmL(lang, 'Yön', 'Direction', 'Sens'),
    hmL(lang, 'Sıra', 'Rank', 'Rang'),
    hmL(lang, 'Yetkinlik', 'Competency', 'Compétence'),
    hmL(lang, 'Puan', 'Score', 'Score'),
  ]
}

/** Ekrandaki zayıf/güçlü listesinin satırları; yetersiz veri notu ayrı satır. */
export function matrixCadreCompetencyExportRows(heatmap: CadreCategoryHeatmap, lang: Lang): string[][] {
  const rows: string[][] = []
  for (const c of heatmap.crossCut ? [...heatmap.competency, heatmap.crossCut.competency] : heatmap.competency) {
    c.weakest.forEach((r, i) => rows.push([c.cadre, t('cadreWeakest', lang), String(i + 1), r.category, r.value.toFixed(2)]))
    c.strongest.forEach((r, i) => rows.push([c.cadre, t('cadreStrongest', lang), String(i + 1), r.category, r.value.toFixed(2)]))
    if (c.thinCount > 0) rows.push([c.cadre, thinDataText(c.thinCount, lang), '', '', ''])
  }
  return rows
}

/** CSV: ana tablo, boş satır, zayıf/güçlü bloğu (veri varsa). */
export function buildMatrixCadreHeatmapCsvRows(heatmap: CadreCategoryHeatmap, lang: Lang): string[][] {
  const out: string[][] = [matrixCadreHeatmapExportHeaders(heatmap.categories, lang), ...matrixCadreHeatmapExportRows(heatmap)]
  const note = matrixCadreHeatmapCrossCutNote(heatmap, lang)
  if (note) out.push([note])
  const comp = matrixCadreCompetencyExportRows(heatmap, lang)
  if (comp.length) out.push([], matrixCadreCompetencyExportHeaders(lang), ...comp)
  return out
}

export function buildMatrixCadreHeatmapPdfSections(heatmap: CadreCategoryHeatmap, lang: Lang): PrintableReportSection[] {
  // Satırı olmayan bölümü openPrintableReportDocument zaten atar; yine de yalnız veri varsa ekle.
  const sections: PrintableReportSection[] = [
    {
      heading: t('heatmapByCadre', lang),
      headers: matrixCadreHeatmapExportHeaders(heatmap.categories, lang),
      rows: [
        ...matrixCadreHeatmapExportRows(heatmap),
        // Çift sayım notu tablonun son satırı olarak (bölüm = başlık + tablo).
        ...(heatmap.crossCut ? [[t('mgrCrossCutNote', lang), ...heatmap.categories.map(() => '')]] : []),
      ],
    },
  ]
  const comp = matrixCadreCompetencyExportRows(heatmap, lang)
  if (comp.length) {
    sections.push({
      heading: `${t('cadreWeakest', lang)} / ${t('cadreStrongest', lang)}`,
      headers: matrixCadreCompetencyExportHeaders(lang),
      rows: comp,
    })
  }
  return sections
}

export function openMatrixCadreHeatmapPdf(
  heatmap: CadreCategoryHeatmap,
  opts: { lang: Lang; periodLabel: string; catalogTitle?: string; onBlocked?: () => void }
) {
  const { lang, periodLabel, catalogTitle, onBlocked } = opts
  return openPrintableReportDocument({
    lang,
    title: `${resolveCatalogTitle(
      catalogTitle,
      heatmap.usesMatrixScoring ? t('matrixDepartmentHeatmapTitle', lang) : t('pdDepartmentHeatmapTitle', lang)
    )} — ${t('heatmapByCadre', lang)} — ${periodLabel}`,
    subtitle: heatmap.usesMatrixScoring ? t('matrixDepartmentHeatmapFootnote', lang) : undefined,
    sections: buildMatrixCadreHeatmapPdfSections(heatmap, lang),
    onBlocked,
  })
}
