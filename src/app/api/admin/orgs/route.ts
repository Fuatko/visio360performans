import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

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
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:orgs:get', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  // basic=1 → yalnızca id,name (yüksek frekanslı dropdown/switcher; ağır logo taşınmaz).
  // default → düzenleme için gereken kolonlar + org-başına kullanıcı sayısı.
  const basic = new URL(req.url).searchParams.get('basic') === '1'
  const selectCols = basic ? 'id,name' : 'id,name,logo_base64,settings,created_at'

  // Org listesi (org_admin → yalnızca kendi kurumu; super_admin → tümü)
  let orgs: any[] = []
  if (s.role === 'org_admin') {
    const orgId = String(s.org_id || '').trim()
    if (!orgId) return NextResponse.json({ success: false, error: 'KVKK: org_id eksik' }, { status: 403 })
    const { data, error } = await supabase.from('organizations').select(selectCols).eq('id', orgId).limit(1)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    orgs = data || []
  } else {
    const { data, error } = await supabase.from('organizations').select(selectCols).order('name')
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    orgs = data || []
  }

  // Org-başına kullanıcı sayısı (basic modda atlanır). Tek sorgu + bellekte grupla (N+1 yok).
  if (!basic && orgs.length > 0) {
    const orgIds = orgs.map((o) => String(o.id))
    const { data: urows } = await supabase.from('users').select('organization_id').in('organization_id', orgIds)
    const counts = new Map<string, number>()
    for (const u of (urows || []) as any[]) {
      const oid = String(u.organization_id || '')
      if (oid) counts.set(oid, (counts.get(oid) || 0) + 1)
    }
    orgs = orgs.map((o) => ({ ...o, user_count: counts.get(String(o.id)) || 0 }))
  }

  return NextResponse.json({ success: true, organizations: orgs })
}

