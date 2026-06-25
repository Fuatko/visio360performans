'use client'

export type ReportCatalogDisplayProps = {
  /** Menü kataloğundan gelen özelleştirilmiş başlık */
  catalogTitle?: string
  /** Menü kataloğundan gelen kısa açıklama */
  catalogDescription?: string
}

export function resolveCatalogTitle(catalogTitle: string | undefined, fallback: string): string {
  const trimmed = catalogTitle?.trim()
  return trimmed || fallback
}

export function ReportCatalogSubtitle({
  catalogDescription,
  className = 'text-xs text-[var(--muted)] mt-1 leading-relaxed',
}: {
  catalogDescription?: string
  className?: string
}) {
  const text = catalogDescription?.trim()
  if (!text) return null
  return <p className={className}>{text}</p>
}
