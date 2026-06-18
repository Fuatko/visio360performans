export type OrganizationLogoSource = {
  logo_base64?: string | null
  logo_url?: string | null
} | null | undefined

const B64_RE = /^[A-Za-z0-9+/=_-]+$/

function detectBase64Mime(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg'
  if (b64.startsWith('R0lGOD')) return 'image/gif'
  if (b64.startsWith('UklGR')) return 'image/webp'
  if (b64.startsWith('PHN2Zy') || b64.startsWith('PD94bW')) return 'image/svg+xml'
  return 'image/png'
}

/** Kurum logosu: data URL, ham base64, http(s) ve göreli yollar — tüm tarayıcılarda güvenli src. */
export function normalizeLogoSrc(input?: string | null, origin?: string): string {
  let s = String(input || '').trim()
  if (!s) return ''

  // Bazı kayıtlarda satır sonu / boşluk karışıyor (özellikle Safari’de kırılır).
  s = s.replace(/\s+/g, '')

  const dataIdx = s.indexOf('data:image/')
  if (dataIdx > 0) s = s.slice(dataIdx)
  if (s.startsWith('data:image/')) return s

  if (s.startsWith('http://') || s.startsWith('https://')) return s

  const baseOrigin = (origin || '').trim().replace(/\/$/, '')
  if (baseOrigin && s.startsWith('/')) return `${baseOrigin}${s}`

  let raw = s
  if (raw.startsWith('base64,')) raw = raw.slice(7)

  if (raw.length > 50 && B64_RE.test(raw)) {
    return `data:${detectBase64Mime(raw)};base64,${raw}`
  }

  if (baseOrigin && !raw.includes(' ') && (raw.includes('.') || raw.includes('/'))) {
    return `${baseOrigin}/${raw.replace(/^\/+/, '')}`
  }

  return s
}

export function resolveOrganizationLogoSrc(
  org?: OrganizationLogoSource,
  fallback?: string | null,
  origin?: string
): string {
  const fromOrg = normalizeLogoSrc(org?.logo_base64 || org?.logo_url || '', origin)
  if (fromOrg) return fromOrg
  return normalizeLogoSrc(fallback || process.env.NEXT_PUBLIC_BRAND_LOGO_URL || '', origin)
}

export function organizationLogoFromUser(
  user?: { organizations?: OrganizationLogoSource | OrganizationLogoSource[] | null } | null,
  origin?: string
): string {
  const org = user?.organizations
  const row = Array.isArray(org) ? org[0] : org
  return resolveOrganizationLogoSrc(row, process.env.NEXT_PUBLIC_BRAND_LOGO_URL, origin)
}

export const ORG_LOGO_CACHE_KEY = 'visio360_org_logo_src'

export function readCachedOrganizationLogo(): string {
  if (typeof window === 'undefined') return ''
  try {
    return normalizeLogoSrc(window.localStorage.getItem(ORG_LOGO_CACHE_KEY) || '')
  } catch {
    return ''
  }
}

export function writeCachedOrganizationLogo(src: string) {
  if (typeof window === 'undefined') return
  const normalized = normalizeLogoSrc(src)
  if (!normalized) return
  try {
    window.localStorage.setItem(ORG_LOGO_CACHE_KEY, normalized)
  } catch {
    // ignore quota / private mode
  }
}
