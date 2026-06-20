import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import {
  getAdminReportsMaintenance,
  setAdminReportsMaintenance,
} from '@/lib/server/platform-settings'

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
    const maintenance = await getAdminReportsMaintenance(supabase)
    return NextResponse.json({
      success: true,
      admin_reports_maintenance: maintenance.enabled,
      updated_at: maintenance.updatedAt,
      can_manage: s.role === 'super_admin',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ayar okunamadı'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }
}

type PatchBody = { admin_reports_maintenance?: boolean }

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
  if (typeof body.admin_reports_maintenance !== 'boolean') {
    return NextResponse.json(
      { success: false, error: 'admin_reports_maintenance (boolean) gerekli' },
      { status: 400 }
    )
  }

  try {
    const maintenance = await setAdminReportsMaintenance(
      supabase,
      body.admin_reports_maintenance,
      String(s.uid)
    )
    return NextResponse.json({
      success: true,
      admin_reports_maintenance: maintenance.enabled,
      updated_at: maintenance.updatedAt,
      can_manage: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ayar kaydedilemedi'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }
}
