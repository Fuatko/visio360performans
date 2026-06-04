export function isCompensationEnabled() {
  // Client pages need NEXT_PUBLIC_*. Server routes can use ENABLE_* as well.
  const raw =
    (process.env.NEXT_PUBLIC_ENABLE_COMPENSATION || process.env.ENABLE_COMPENSATION || '').trim()
  return raw === '1' || raw.toLowerCase() === 'true'
}

/** Kullanıcı paneli eylem planı sayfası ve menüsü (varsayılan: kapalı). */
export function isDashboardActionPlansEnabled() {
  const raw = (
    process.env.NEXT_PUBLIC_ENABLE_DASHBOARD_ACTION_PLANS ||
    process.env.ENABLE_DASHBOARD_ACTION_PLANS ||
    ''
  ).trim()
  return raw === '1' || raw.toLowerCase() === 'true'
}

