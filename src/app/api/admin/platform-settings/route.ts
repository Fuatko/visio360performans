import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { normalizeOrgVisibleReportIds } from '@/lib/admin-results-report-visibility'
import {
  getAdminReportsMaintenance,
  getAdminReportsOrgVisibility,
  getAdminReportsCatalogConfig,
  setAdminReportsMaintenance,
  setAdminReportsOrgVisibility,
  setAdminReportsCatalogConfig,
} from '@/lib/server/platform-settings'
import { normalizeReportCatalogConfig } from '@/lib/admin-results-report-catalog-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })
  }

  try {
    const [maintenance, visibility, catalog] = await Promise.all([
      getAdminReportsMaintenance(supabase),
      getAdminReportsOrgVisibility(supabase),
      getAdminReportsCatalogConfig(supabase),
    ])
    return NextResponse.json({
      success: true,
      admin_reports_maintenance: maintenance.enabled,
      org_visible_report_ids: visibility.enabledIds,
      admin_reports_catalog_config: catalog.config,
      updated_at: maintenance.updatedAt,
      can_manage: s.role === 'super_admin',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ayar okunamadı'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }
}

type PatchBody = {
  admin_reports_maintenance?: boolean
  org_visible_report_ids?: string[]
  admin_reports_catalog_config?: unknown
}

export async function PATCH(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || s.role !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Yalnızca süper admin' }, { status: 403 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })
  }

  const body = (await req.json().catch(() => ({}))) as PatchBody
  const hasMaintenance = typeof body.admin_reports_maintenance === 'boolean'
  const hasVisibility = Array.isArray(body.org_visible_report_ids)
  const hasCatalog = body.admin_reports_catalog_config !== undefined

  if (!hasMaintenance && !hasVisibility && !hasCatalog) {
    return NextResponse.json(
      { success: false, error: 'admin_reports_maintenance, org_visible_report_ids veya admin_reports_catalog_config gerekli' },
      { status: 400 }
    )
  }

  try {
    let maintenance = await getAdminReportsMaintenance(supabase)
    let visibility = await getAdminReportsOrgVisibility(supabase)
    let catalog = await getAdminReportsCatalogConfig(supabase)

    if (hasMaintenance) {
      maintenance = await setAdminReportsMaintenance(supabase, body.admin_reports_maintenance!, String(s.uid))
    }
    if (hasVisibility) {
      const normalized = normalizeOrgVisibleReportIds(body.org_visible_report_ids)
      if (!normalized?.length) {
        return NextResponse.json(
          { success: false, error: 'En az bir rapor seçilmelidir' },
          { status: 400 }
        )
      }
      visibility = await setAdminReportsOrgVisibility(supabase, normalized, String(s.uid))
    }
    if (hasCatalog) {
      catalog = await setAdminReportsCatalogConfig(
        supabase,
        normalizeReportCatalogConfig(body.admin_reports_catalog_config),
        String(s.uid)
      )
    }

    return NextResponse.json({
      success: true,
      admin_reports_maintenance: maintenance.enabled,
      org_visible_report_ids: visibility.enabledIds,
      admin_reports_catalog_config: catalog.config,
      updated_at: maintenance.updatedAt,
      can_manage: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ayar kaydedilemedi'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }
}
