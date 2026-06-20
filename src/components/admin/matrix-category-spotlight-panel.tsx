'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { CategoryPeerHighlightBlock } from '@/lib/admin-department-ranking'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import { openPrintableReport } from '@/lib/admin-report-export'
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react'

type Props = {
  blocks: CategoryPeerHighlightBlock[]
  usesMatrixScoring: boolean
  onExcel: () => void
  onPdf: () => void
}

export function MatrixCategorySpotlightPanel({ blocks, usesMatrixScoring, onExcel, onPdf }: Props) {
  const lang = useLang()

  if (!blocks.length) return null

  const scoreHeader =
    usesMatrixScoring
      ? t('matrixCategorySpotlightScoreLabel', lang)
      : lang === 'en'
        ? 'Team avg'
        : lang === 'fr'
          ? 'Moy. équipe'
          : 'Ekip ort.'

  return (
    <Card className="mb-6 overflow-hidden border-sky-500/20 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 className="w-5 h-5 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <CardTitle>{t('matrixCategorySpotlightTitle', lang)}</CardTitle>
              <p className="text-xs text-[var(--muted)] mt-1">
                {lang === 'en'
                  ? 'All categories are listed; click a heading to expand or collapse.'
                  : lang === 'fr'
                    ? 'Toutes les catégories; cliquez pour ouvrir/fermer.'
                    : 'Tüm kategoriler listelenir; başlığa tıklayarak açıp kapatabilirsiniz.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">
              {blocks.length} {lang === 'en' ? 'categories' : lang === 'fr' ? 'catégories' : 'kategori'}
            </Badge>
            <ReportExportButtons onExcel={onExcel} onPdf={onPdf} />
          </div>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {usesMatrixScoring ? (
          <>
            <p className="text-sm text-sky-900/90 dark:text-sky-100/90 mx-4 mt-4 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
              {t('matrixStructureScopeNote', lang)}
            </p>
            <p className="text-xs text-[var(--muted)] px-4 pt-2 pb-1">{t('matrixStructureScoringRulesNote', lang)}</p>
            <p className="text-xs text-[var(--muted)] px-4 pb-2">{t('matrixCategorySpotlightCategoryNote', lang)}</p>
          </>
        ) : null}
        <div className="space-y-2 px-3 pb-3 sm:px-4 sm:pb-4 mt-3">
          {blocks.map((block, idx) => (
            <details
              key={block.categoryKey}
              className="group rounded-xl border border-[var(--border)]/70 bg-[var(--surface)] overflow-hidden"
              open={idx < 3}
            >
              <summary className="cursor-pointer list-none px-4 py-3 bg-[var(--surface-2)]/80 hover:bg-[var(--surface-2)] flex items-center justify-between gap-3">
                <span className="font-semibold text-sm text-[var(--foreground)]">{block.cat}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-[var(--muted)]">
                    {block.count} {lang === 'en' ? 'people' : lang === 'fr' ? 'personnes' : 'kişi'}
                  </span>
                  <span className="text-xs text-[var(--muted)] group-open:rotate-180 transition-transform">▼</span>
                </span>
              </summary>
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-emerald-600 font-medium mb-2 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {lang === 'en' ? 'Highest' : lang === 'fr' ? 'Plus haut' : 'En yüksek'}
                      <span className="text-[var(--muted)] font-normal">({scoreHeader})</span>
                    </div>
                    <ul className="space-y-1.5 text-[var(--foreground)]">
                      {block.top.map((r, i) => (
                        <li key={`t-${i}`} className="flex justify-between gap-2 rounded-lg border border-[var(--border)]/50 px-2 py-1.5">
                          <span className="truncate min-w-0" title={r.name}>
                            {r.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-[var(--muted)]">{r.peer.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-rose-600 font-medium mb-2 flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      {lang === 'en' ? 'Lowest' : lang === 'fr' ? 'Plus bas' : 'En düşük'}
                      <span className="text-[var(--muted)] font-normal">({scoreHeader})</span>
                    </div>
                    <ul className="space-y-1.5 text-[var(--foreground)]">
                      {block.bottom.map((r, i) => (
                        <li key={`b-${i}`} className="flex justify-between gap-2 rounded-lg border border-[var(--border)]/50 px-2 py-1.5">
                          <span className="truncate min-w-0" title={r.name}>
                            {r.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-[var(--muted)]">{r.peer.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

export function matrixCategorySpotlightExportHeaders(lang: 'tr' | 'en' | 'fr', usesMatrixScoring: boolean) {
  const scoreCol = usesMatrixScoring
    ? lang === 'en'
      ? 'MATRIX category score'
      : lang === 'fr'
        ? 'Score catégorie MATRIX'
        : 'MATRIX kategori puanı'
    : lang === 'en'
      ? 'Team avg'
      : lang === 'fr'
        ? 'Moy. équipe'
        : 'Ekip ort.'
  return [
    lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori',
    lang === 'en' ? 'Type' : lang === 'fr' ? 'Type' : 'Tip',
    lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
    lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
    scoreCol,
  ]
}

export function matrixCategorySpotlightExportRows(
  blocks: CategoryPeerHighlightBlock[],
  lang: 'tr' | 'en' | 'fr'
) {
  const topLabel = lang === 'en' ? 'Top' : lang === 'fr' ? 'Haut' : 'Üst'
  const bottomLabel = lang === 'en' ? 'Bottom' : lang === 'fr' ? 'Bas' : 'Alt'
  const rows: string[][] = []
  blocks.forEach((block) => {
    block.top.forEach((r) => rows.push([block.cat, topLabel, r.name, r.dept, r.peer.toFixed(2)]))
    block.bottom.forEach((r) => rows.push([block.cat, bottomLabel, r.name, r.dept, r.peer.toFixed(2)]))
  })
  return rows
}

export function openMatrixCategorySpotlightPdf(
  blocks: CategoryPeerHighlightBlock[],
  opts: { lang: 'tr' | 'en' | 'fr'; periodLabel: string; usesMatrixScoring: boolean; onBlocked?: () => void }
) {
  const { lang, periodLabel, usesMatrixScoring, onBlocked } = opts
  return openPrintableReport({
    lang,
    title: `${t('matrixCategorySpotlightTitle', lang)} — ${periodLabel}`,
    subtitle: usesMatrixScoring ? t('matrixCategorySpotlightCategoryNote', lang) : undefined,
    headers: matrixCategorySpotlightExportHeaders(lang, usesMatrixScoring),
    rows: matrixCategorySpotlightExportRows(blocks, lang),
    onBlocked,
  })
}
