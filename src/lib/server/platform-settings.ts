import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeRole } from '@/lib/server/session'

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

export const ADMIN_REPORTS_ORG_VISIBILITY_KEY = 'admin_reports_org_visibility'

export type AdminReportsOrgVisibilityState = {
  enabledIds: string[] | null
  updatedAt: string | null
  updatedBy: string | null
}

function parseOrgVisibilityValue(value: unknown): string[] | null {
  if (!value || typeof value !== 'object') return null
  const raw = (value as { enabledIds?: unknown }).enabledIds
  if (!Array.isArray(raw)) return null
  return raw.filter((id): id is string => typeof id === 'string')
}

export async function getAdminReportsOrgVisibility(
  supabase: SupabaseClient
): Promise<AdminReportsOrgVisibilityState> {
  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('value, updated_at, updated_by')
      .eq('key', ADMIN_REPORTS_ORG_VISIBILITY_KEY)
      .maybeSingle()

    if (error) {
      const code = String((error as { code?: string }).code || '')
      if (code === '42P01' || /platform_settings/i.test(error.message || '')) {
        return { enabledIds: null, updatedAt: null, updatedBy: null }
      }
      throw new Error(error.message || 'Platform ayarı okunamadı')
    }

    return {
      enabledIds: parseOrgVisibilityValue(data?.value),
      updatedAt: data?.updated_at ? String(data.updated_at) : null,
      updatedBy: data?.updated_by ? String(data.updated_by) : null,
    }
  } catch {
    return { enabledIds: null, updatedAt: null, updatedBy: null }
  }
}

export async function setAdminReportsOrgVisibility(
  supabase: SupabaseClient,
  enabledIds: string[],
  updatedBy: string
): Promise<AdminReportsOrgVisibilityState> {
  const now = new Date().toISOString()
  const { error } = await supabase.from('platform_settings').upsert(
    {
      key: ADMIN_REPORTS_ORG_VISIBILITY_KEY,
      value: { enabledIds },
      updated_at: now,
      updated_by: updatedBy,
    },
    { onConflict: 'key' }
  )
  if (error) throw new Error(error.message || 'Platform ayarı kaydedilemedi')
  return { enabledIds, updatedAt: now, updatedBy }
}

/**
 * Admin rapor bakım modu: yalnızca kurum adminini engeller.
 * Son kullanıcı kendi raporu dönem «Sonuçları yayınla» bayrağı ile yönetilir; bakım modundan etkilenmez.
 */
export function isReportsMaintenanceBlocked(
  maintenance: AdminReportsMaintenanceState,
  role: string | null | undefined
): boolean {
  if (!maintenance.enabled) return false
  return normalizeRole(role) === 'org_admin'
}
