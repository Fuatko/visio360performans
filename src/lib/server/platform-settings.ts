import type { SupabaseClient } from '@supabase/supabase-js'

export const ADMIN_REPORTS_MAINTENANCE_KEY = 'admin_reports_maintenance'

export type AdminReportsMaintenanceState = {
  enabled: boolean
  updatedAt: string | null
  updatedBy: string | null
}

function parseMaintenanceValue(value: unknown): boolean {
  if (value && typeof value === 'object' && 'enabled' in (value as Record<string, unknown>)) {
    return Boolean((value as { enabled?: unknown }).enabled)
  }
  return false
}

export async function getAdminReportsMaintenance(
  supabase: SupabaseClient
): Promise<AdminReportsMaintenanceState> {
  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('value, updated_at, updated_by')
      .eq('key', ADMIN_REPORTS_MAINTENANCE_KEY)
      .maybeSingle()

    if (error) {
      const code = String((error as { code?: string }).code || '')
      if (code === '42P01' || /platform_settings/i.test(error.message || '')) {
        return { enabled: false, updatedAt: null, updatedBy: null }
      }
      throw new Error(error.message || 'Platform ayarı okunamadı')
    }

    return {
      enabled: parseMaintenanceValue(data?.value),
      updatedAt: data?.updated_at ? String(data.updated_at) : null,
      updatedBy: data?.updated_by ? String(data.updated_by) : null,
    }
  } catch {
    return { enabled: false, updatedAt: null, updatedBy: null }
  }
}

export async function setAdminReportsMaintenance(
  supabase: SupabaseClient,
  enabled: boolean,
  updatedBy: string
): Promise<AdminReportsMaintenanceState> {
  const now = new Date().toISOString()
  const { error } = await supabase.from('platform_settings').upsert(
    {
      key: ADMIN_REPORTS_MAINTENANCE_KEY,
      value: { enabled },
      updated_at: now,
      updated_by: updatedBy,
    },
    { onConflict: 'key' }
  )
  if (error) throw new Error(error.message || 'Platform ayarı kaydedilemedi')
  return { enabled, updatedAt: now, updatedBy }
}

/** Süper admin hariç bakım modunda rapor API'lerini engelle */
export function isReportsMaintenanceBlocked(
  maintenance: AdminReportsMaintenanceState,
  role: string | null | undefined
): boolean {
  if (!maintenance.enabled) return false
  return String(role || '').trim() !== 'super_admin'
}
