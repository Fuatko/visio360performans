import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { resolveOrganizationLogoSrc } from '@/lib/organization-logo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s?.uid) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('organization_id, organizations(name, logo_base64, logo_url)')
    .eq('id', s.uid)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: 'Kurum bilgisi alınamadı' }, { status: 500 })
  }

  const org = (user as any)?.organizations
  const orgRow = Array.isArray(org) ? org[0] : org
  const origin = req.nextUrl.origin
  const logo_src = resolveOrganizationLogoSrc(orgRow, process.env.NEXT_PUBLIC_BRAND_LOGO_URL, origin) || null

  return NextResponse.json(
    {
      success: true,
      logo_src,
      organization_name: orgRow?.name ? String(orgRow.name) : null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
