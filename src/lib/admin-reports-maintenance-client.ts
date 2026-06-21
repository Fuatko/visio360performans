'use client'

import { useEffect, useState } from 'react'

/** Admin rapor ekranları: süper admin hariç bakım modunda kurum admini engellenir. */
export function useAdminReportsMaintenanceGate(isSuperAdmin: boolean) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resp = await fetch('/api/admin/platform-settings', { credentials: 'include', cache: 'no-store' })
        const payload = (await resp.json().catch(() => ({}))) as {
          success?: boolean
          admin_reports_maintenance?: boolean
        }
        if (!cancelled && resp.ok && payload.success) {
          setEnabled(Boolean(payload.admin_reports_maintenance))
        }
      } catch {
        if (!cancelled) setEnabled(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return {
    loading,
    enabled,
    blocked: enabled && !isSuperAdmin,
  }
}
