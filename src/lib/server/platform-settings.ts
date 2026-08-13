import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeRole } from '@/lib/server/session'
import { isPgEnabled, query as pgQuery } from '@/lib/db'
import {
  defaultReportCatalogConfig,
  normalizeReportCatalogConfig,
  type ReportCatalogConfig,
} from '@/lib/admin-results-report-catalog-config'

// Faz 1 (pg göçü): platform_settings global (key/value, org yok — kapsam 'key').
// Her fonksiyon isPgEnabled() ile fallback: env yok → verilen supabase (MEVCUT davranış).
// value kolonu jsonb (pg: select → obje; upsert → $n::jsonb).

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

type SettingsRow = { value?: unknown; updated_at?: unknown; updated_by?: unknown }

export async function getAdminReportsMaintenance(
  supabase: SupabaseClient
): Promise<AdminReportsMaintenanceState> {
  if (isPgEnabled()) {
    try {
      const r = await pgQuery<SettingsRow>(
        'select value, updated_at, updated_by from platform_settings where key = $1 limit 1',
        [ADMIN_REPORTS_MAINTENANCE_KEY]
      )
      const row = r.rows[0]
      return {
        enabled: parseMaintenanceValue(row?.value),
        updatedAt: row?.updated_at ? String(row.updated_at) : null,
        updatedBy: row?.updated_by ? String(row.updated_by) : null,
      }
    } catch {
      return { enabled: false, updatedAt: null, updatedBy: null }
    }
  }

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

  if (isPgEnabled()) {
    await pgQuery(
      `insert into platform_settings (key, value, updated_at, updated_by)
       values ($1, $2::jsonb, $3, $4)
       on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [ADMIN_REPORTS_MAINTENANCE_KEY, JSON.stringify({ enabled }), now, updatedBy]
    )
    return { enabled, updatedAt: now, updatedBy }
  }

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
  if (isPgEnabled()) {
    try {
      const r = await pgQuery<SettingsRow>(
        'select value, updated_at, updated_by from platform_settings where key = $1 limit 1',
        [ADMIN_REPORTS_ORG_VISIBILITY_KEY]
      )
      const row = r.rows[0]
      return {
        enabledIds: parseOrgVisibilityValue(row?.value),
        updatedAt: row?.updated_at ? String(row.updated_at) : null,
        updatedBy: row?.updated_by ? String(row.updated_by) : null,
      }
    } catch {
      return { enabledIds: null, updatedAt: null, updatedBy: null }
    }
  }

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

  if (isPgEnabled()) {
    await pgQuery(
      `insert into platform_settings (key, value, updated_at, updated_by)
       values ($1, $2::jsonb, $3, $4)
       on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [ADMIN_REPORTS_ORG_VISIBILITY_KEY, JSON.stringify({ enabledIds }), now, updatedBy]
    )
    return { enabledIds, updatedAt: now, updatedBy }
  }

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

export const ADMIN_REPORTS_CATALOG_CONFIG_KEY = 'admin_reports_catalog_config'

export type AdminReportsCatalogConfigState = {
  config: ReportCatalogConfig
  updatedAt: string | null
  updatedBy: string | null
}

export async function getAdminReportsCatalogConfig(
  supabase: SupabaseClient
): Promise<AdminReportsCatalogConfigState> {
  if (isPgEnabled()) {
    try {
      const r = await pgQuery<SettingsRow>(
        'select value, updated_at, updated_by from platform_settings where key = $1 limit 1',
        [ADMIN_REPORTS_CATALOG_CONFIG_KEY]
      )
      const row = r.rows[0]
      return {
        config: normalizeReportCatalogConfig(row?.value),
        updatedAt: row?.updated_at ? String(row.updated_at) : null,
        updatedBy: row?.updated_by ? String(row.updated_by) : null,
      }
    } catch {
      return { config: defaultReportCatalogConfig(), updatedAt: null, updatedBy: null }
    }
  }

  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('value, updated_at, updated_by')
      .eq('key', ADMIN_REPORTS_CATALOG_CONFIG_KEY)
      .maybeSingle()

    if (error) {
      const code = String((error as { code?: string }).code || '')
      if (code === '42P01' || /platform_settings/i.test(error.message || '')) {
        return { config: defaultReportCatalogConfig(), updatedAt: null, updatedBy: null }
      }
      throw new Error(error.message || 'Platform ayarı okunamadı')
    }

    return {
      config: normalizeReportCatalogConfig(data?.value),
      updatedAt: data?.updated_at ? String(data.updated_at) : null,
      updatedBy: data?.updated_by ? String(data.updated_by) : null,
    }
  } catch {
    return { config: defaultReportCatalogConfig(), updatedAt: null, updatedBy: null }
  }
}

export async function setAdminReportsCatalogConfig(
  supabase: SupabaseClient,
  config: ReportCatalogConfig,
  updatedBy: string
): Promise<AdminReportsCatalogConfigState> {
  const now = new Date().toISOString()
  const normalized = normalizeReportCatalogConfig(config)

  if (isPgEnabled()) {
    await pgQuery(
      `insert into platform_settings (key, value, updated_at, updated_by)
       values ($1, $2::jsonb, $3, $4)
       on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [ADMIN_REPORTS_CATALOG_CONFIG_KEY, JSON.stringify(normalized), now, updatedBy]
    )
    return { config: normalized, updatedAt: now, updatedBy }
  }

  const { error } = await supabase.from('platform_settings').upsert(
    {
      key: ADMIN_REPORTS_CATALOG_CONFIG_KEY,
      value: normalized,
      updated_at: now,
      updated_by: updatedBy,
    },
    { onConflict: 'key' }
  )
  if (error) throw new Error(error.message || 'Platform ayarı kaydedilemedi')
  return { config: normalized, updatedAt: now, updatedBy }
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
