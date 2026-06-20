'use client'

import { AlertTriangle, Loader2, Wrench } from 'lucide-react'
import { Card, CardBody } from '@/components/ui'
import { t, type Lang } from '@/lib/i18n'

export function ReportsMaintenanceScreen({ lang }: { lang: Lang }) {
  return (
    <Card className="mb-6 border-amber-500/35 bg-amber-500/5 overflow-hidden">
      <CardBody className="py-16 px-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/15 mb-5">
          <Wrench className="w-8 h-8 text-amber-700 dark:text-amber-400" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] tracking-tight">
          {t('adminReportsMaintenanceTitle', lang)}
        </h2>
        <p className="text-base text-[var(--muted)] mt-3 max-w-xl mx-auto leading-relaxed">
          {t('adminReportsMaintenanceMessage', lang)}
        </p>
      </CardBody>
    </Card>
  )
}

export function ReportsMaintenanceToggle({
  lang,
  enabled,
  loading,
  saving,
  onToggle,
}: {
  lang: Lang
  enabled: boolean
  loading: boolean
  saving: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 w-full">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 rounded border-[var(--border)] w-4 h-4 accent-amber-600"
          checked={enabled}
          disabled={loading || saving}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            {t('adminReportsMaintenanceToggle', lang)}
          </span>
          <span className="block text-xs text-[var(--muted)] mt-1 leading-snug">
            {t('adminReportsMaintenanceToggleHint', lang)}
          </span>
          {enabled ? (
            <span className="inline-block mt-2 text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-500/15 px-2 py-0.5 rounded-md">
              {lang === 'en' ? 'Active — others cannot see reports' : lang === 'fr' ? 'Actif — rapports masqués' : 'Açık — diğer kullanıcılar raporları göremez'}
            </span>
          ) : null}
        </span>
      </label>
    </div>
  )
}
