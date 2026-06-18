'use client'

import { useMemo } from 'react'
import { normalizeLogoSrc } from '@/lib/organization-logo'
import { cn } from '@/lib/utils'

type OrgLogoProps = {
  src?: string | null
  alt?: string
  className?: string
  size?: number
  fallbackInitial?: string
}

/** Kurum logosu — data URL için native img (Safari/Firefox uyumu; next/image değil). */
export function OrgLogo({
  src,
  alt = 'VISIO 360°',
  className,
  size = 40,
  fallbackInitial = 'V',
}: OrgLogoProps) {
  const normalized = useMemo(() => normalizeLogoSrc(src), [src])

  if (!normalized) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] font-bold text-white shadow-lg shadow-black/5',
          className
        )}
        style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.38)) }}
        aria-hidden={alt ? undefined : true}
      >
        {fallbackInitial}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg shadow-black/5',
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* Native img: data URLs work consistently in Chrome, Firefox and Safari. */}
      <img
        src={normalized}
        alt={alt}
        width={size}
        height={size}
        className="h-full w-full object-contain"
        loading="eager"
        decoding="async"
      />
    </div>
  )
}
