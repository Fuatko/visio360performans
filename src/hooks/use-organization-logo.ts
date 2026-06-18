'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import {
  normalizeLogoSrc,
  organizationLogoFromUser,
  readCachedOrganizationLogo,
  writeCachedOrganizationLogo,
} from '@/lib/organization-logo'

export function useOrganizationLogo() {
  const { user } = useAuthStore()
  const [fetchedLogo, setFetchedLogo] = useState('')

  const fromUser = useMemo(() => organizationLogoFromUser(user as any), [user])

  useEffect(() => {
    if (fromUser) {
      writeCachedOrganizationLogo(fromUser)
      setFetchedLogo(fromUser)
    }
  }, [fromUser])

  useEffect(() => {
    if (fromUser) return
    const cached = readCachedOrganizationLogo()
    if (cached) setFetchedLogo(cached)
  }, [fromUser])

  useEffect(() => {
    if (fromUser || fetchedLogo) return
    let cancelled = false
    ;(async () => {
      try {
        const resp = await fetch('/api/session/brand', { method: 'GET', credentials: 'include', cache: 'no-store' })
        const payload = (await resp.json().catch(() => ({}))) as { success?: boolean; logo_src?: string | null }
        if (cancelled || !resp.ok || !payload?.success || !payload.logo_src) return
        const normalized = normalizeLogoSrc(payload.logo_src)
        if (!normalized) return
        writeCachedOrganizationLogo(normalized)
        setFetchedLogo(normalized)
      } catch {
        // sessiz: fallback V harfi
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fromUser, fetchedLogo])

  return fromUser || fetchedLogo || readCachedOrganizationLogo() || normalizeLogoSrc(process.env.NEXT_PUBLIC_BRAND_LOGO_URL || '')
}
