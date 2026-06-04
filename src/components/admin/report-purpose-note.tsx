'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'

export function ReportPurposeNote({
  purposeKey,
  children,
  className = '',
}: {
  /** i18n anahtarı — reportPurpose_* */
  purposeKey?: string
  children?: React.ReactNode
  className?: string
}) {
  const lang = useLang()
  const body = children ?? (purposeKey ? t(purposeKey as any, lang) : '')
  if (!body) return null
  return (
    <p className={`text-sm text-[var(--muted)] mt-1.5 max-w-3xl leading-relaxed font-normal ${className}`}>
      <span className="font-semibold text-[var(--brand)]">{t('reportPurposePrefix', lang)}</span>{' '}
      {body}
    </p>
  )
}
