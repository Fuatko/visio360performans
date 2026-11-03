'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button, toast } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import {
  ReportCatalogSubtitle,
  resolveCatalogTitle,
  type ReportCatalogDisplayProps,
} from '@/components/admin/report-catalog-display'
import { openPrintableReportDocument } from '@/lib/admin-report-export'
import { buildClosingPackPdfSections, closingPackHasData, type ClosingPackSection } from '@/lib/closing-pack'
import { FileStack, Printer } from 'lucide-react'

type Lang = 'tr' | 'en' | 'fr'

/**
 * PDF'i açar. Bütün veri bölümleri boşsa açmaz ve false döner (çağıran
 * kullanıcıyı bilgilendirir).
 */
export function openClosingPackPdf(
  sections: ClosingPackSection[],
  opts: { lang: Lang; title: string; subtitle?: string; onBlocked?: () => void }
): boolean {
  const pdfSections = buildClosingPackPdfSections(sections, opts.lang)
  if (!pdfSections.length) return false
  openPrintableReportDocument({
    lang: opts.lang,
    title: opts.title,
    subtitle: opts.subtitle,
    sections: pdfSections,
    onBlocked: opts.onBlocked,
  })
  return true
}

type Props = ReportCatalogDisplayProps & {
  sections: ClosingPackSection[]
  periodLabel: string
}

export function ClosingPackPanel({ sections, periodLabel, catalogTitle, catalogDescription }: Props) {
  const lang = useLang()
  const title = resolveCatalogTitle(catalogTitle, t('closingPackTitle', lang))
  const hasData = closingPackHasData(sections)
  const L = (tr: string, en: string, fr: string) => (lang === 'en' ? en : lang === 'fr' ? fr : tr)

  const print = () => {
    const ok = openClosingPackPdf(sections, {
      lang,
      title: `${title} — ${periodLabel}`,
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
    if (!ok) toast(t('exportNoData', lang), 'error')
  }

  return (
    <Card className="mb-6 overflow-hidden border-sky-500/20 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileStack className="w-5 h-5 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              <ReportCatalogSubtitle catalogDescription={catalogDescription} />
              <ReportPurposeNote purposeKey="reportPurpose_closingPack" />
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={print} disabled={!hasData}>
            <Printer className="w-4 h-4" />
            {t('printPdf', lang)}
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        <ol className="space-y-1.5">
          {sections.map((s, i) => (
            <li
              key={s.key}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span className="w-5 text-right tabular-nums text-[var(--muted)]">{i + 1}.</span>
              <span className="font-medium text-[var(--foreground)] min-w-0 flex-1">{s.title}</span>
              {s.hasData ? (
                <Badge variant="success">
                  {L('Pakete girecek', 'Included', 'Inclus')} · {s.section.rows.length} {L('satır', 'rows', 'lignes')}
                </Badge>
              ) : (
                <Badge variant="gray">{L('Veri yok — atlanacak', 'No data — skipped', 'Pas de données — ignoré')}</Badge>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-[var(--muted)]">{t('closingPackCommentaryNote', lang)}</p>
      </CardBody>
    </Card>
  )
}
