import { CheckCircle2, ChevronDown, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui'
import { Lang, t } from '@/lib/i18n'

type Row = { key: string; label: string }

export function SecurityStandardsSummary({
  lang,
  defaultOpen = false,
  className = '',
}: {
  lang: Lang
  defaultOpen?: boolean
  className?: string
}) {
  const rows: Row[] = [
    { key: 'iso_10667', label: t('methodStdIso10667', lang) },
    { key: 'shrm', label: t('methodStdShrm', lang) },
    { key: 'feedback_360', label: t('methodStdFeedback360', lang) },
    { key: 'likert', label: t('methodStdLikert', lang) },
    { key: 'reliability', label: t('methodStdReliability', lang) },
  ]

  const criteriaLabel = lang === 'fr' ? 'critères' : lang === 'en' ? 'criteria' : 'kriter'
  const expandHint =
    lang === 'fr'
      ? 'Cliquer pour afficher le détail'
      : lang === 'en'
        ? 'Click to show details'
        : 'Detay için tıklayın'

  return (
    <details
      className={`mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] group ${className}`.trim()}
      open={defaultOpen || undefined}
    >
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold text-[var(--foreground)]">{t('methodStandardsSummaryTitle', lang)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="info">
            {rows.length} {criteriaLabel}
          </Badge>
          <span className="text-xs text-[var(--muted)] hidden sm:inline">{expandHint}</span>
          <ChevronDown className="w-4 h-4 text-[var(--muted)] transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="px-5 pb-5 pt-0 space-y-3 border-t border-[var(--border)]">
        <div className="text-sm text-[var(--muted)] pt-4">{t('methodStandardsSummaryBody', lang)}</div>
        <div className="overflow-x-auto border border-[var(--border)] rounded-2xl">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">
                  {lang === 'fr' ? 'Critère' : lang === 'en' ? 'Criteria' : 'Kriter'}
                </th>
                <th className="text-left py-3 px-4 font-semibold text-[var(--muted)] w-[220px]">
                  {t('status', lang)}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-3 px-4 text-[var(--foreground)] font-medium">{r.label}</td>
                  <td className="py-3 px-4">
                    <div className="inline-flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <Badge variant="success">{t('fullyCompliant', lang)}</Badge>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-[var(--muted)]">{t('methodStandardsNotCertification', lang)}</div>
      </div>
    </details>
  )
}
