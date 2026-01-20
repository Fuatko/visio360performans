import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { Card, CardBody, CardHeader, CardTitle, Badge } from '@/components/ui'
import { Lang } from '@/lib/i18n'
import { t } from '@/lib/i18n'

type Row = { key: string; label: string }

export function SecurityStandardsSummary({ lang }: { lang: Lang }) {
  const rows: Row[] = [
    { key: 'iso_10667', label: t('methodStdIso10667', lang) },
    { key: 'shrm', label: t('methodStdShrm', lang) },
    { key: 'feedback_360', label: t('methodStdFeedback360', lang) },
    { key: 'likert', label: t('methodStdLikert', lang) },
    { key: 'reliability', label: t('methodStdReliability', lang) },
  ]

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          {t('methodStandardsSummaryTitle', lang)}
        </CardTitle>
        <Badge variant="info">{rows.length} {lang === 'fr' ? 'critères' : lang === 'en' ? 'criteria' : 'kriter'}</Badge>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="text-sm text-[var(--muted)]">{t('methodStandardsSummaryBody', lang)}</div>
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
      </CardBody>
    </Card>
  )
}

