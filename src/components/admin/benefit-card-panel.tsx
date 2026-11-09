'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button, toast } from '@/components/ui'
import {
  ReportCatalogSubtitle,
  resolveCatalogTitle,
  type ReportCatalogDisplayProps,
} from '@/components/admin/report-catalog-display'
import { openPrintableReportDocument } from '@/lib/admin-report-export'
import { benefitCardHasData, benefitCardSections, type BenefitCard } from '@/lib/benefit-card'
import { Loader2, Printer, Sprout } from 'lucide-react'

type Props = ReportCatalogDisplayProps & {
  card: BenefitCard | null
  loading: boolean
  error: string | null
  periodLabel: string
}

/** 90 günlük fayda kartı — yalnız hesaplanmış sayılar; yorum üretmez (src/lib/benefit-card.ts). */
export function BenefitCardPanel({ card, loading, error, periodLabel, catalogTitle, catalogDescription }: Props) {
  const lang = useLang()
  const title = resolveCatalogTitle(catalogTitle, t('benefitCardTitle', lang))
  const sections = card ? benefitCardSections(card, lang) : []
  const hasData = !!card && benefitCardHasData(card)

  const print = () => {
    if (!card || !hasData) return void toast(t('exportNoData', lang), 'error')
    openPrintableReportDocument({
      lang,
      title: `${title} — ${periodLabel}`,
      sections: sections
        .filter((s) => s.rows.length > 0)
        .map((s) => ({ heading: t(s.titleKey, lang), headers: ['', ''], rows: s.rows })),
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
  }

  return (
    <Card className="mb-6 overflow-hidden border-emerald-500/20 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-emerald-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sprout className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              <ReportCatalogSubtitle catalogDescription={catalogDescription || t('benefitCardDesc', lang)} />
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={print} disabled={!hasData}>
            <Printer className="w-4 h-4" />
            {t('printPdf', lang)}
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="py-6 flex justify-center text-[var(--muted)]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-[var(--muted)]">{error}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sections.map((s) => (
              <div key={s.key} className="rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">{t(s.titleKey, lang)}</span>
                  {s.rows.length === 0 ? <Badge variant="gray">{t('closingPackWillSkip', lang)}</Badge> : null}
                </div>
                {s.rows.length ? (
                  <dl className="space-y-1 text-sm">
                    {s.rows.map((r, i) => (
                      <div key={i} className="flex flex-wrap justify-between gap-x-3">
                        <dt className="text-[var(--muted)]">{r[0]}</dt>
                        {r[1] ? <dd className="font-medium tabular-nums text-[var(--foreground)]">{r[1]}</dd> : null}
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
