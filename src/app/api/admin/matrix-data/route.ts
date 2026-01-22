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

  // Frequent admin screen refresh: rate limit by user to avoid corporate NAT false-positives
  const rl = await rateLimitByUser(req, 'admin:matrix-data:get', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const periodId = (url.searchParams.get('period_id') || '').trim()
  const orgIdParam = (url.searchParams.get('org_id') || '').trim()

  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : orgIdParam
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  // Periods + org
  const [periodsRes, orgRes] = await Promise.all([
    supabase.from('evaluation_periods').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
    supabase.from('organizations').select('*').eq('id', orgId).order('name'),
  ])
  if (periodsRes.error) return NextResponse.json({ success: false, error: periodsRes.error.message }, { status: 400 })
  if (orgRes.error) return NextResponse.json({ success: false, error: orgRes.error.message }, { status: 400 })

  // Users
  const usersRes = await supabase.from('users').select('*').eq('status', 'active').eq('organization_id', orgId).order('department').order('name')
  if (usersRes.error) return NextResponse.json({ success: false, error: usersRes.error.message }, { status: 400 })
  const users = (usersRes.data || []) as any[]
  const departments = [...new Set(users.map((u) => u.department).filter(Boolean))].sort()

  // Assignments (optional by period)
  let assignments: any[] = []
  let stats = { total: 0, completed: 0, pending: 0, rate: 0 }
  if (periodId) {
    // KVKK guard: ensure period belongs to org (prevents cross-org reads)
    const { data: p, error: pErr } = await supabase.from('evaluation_periods').select('id,organization_id').eq('id', periodId).maybeSingle()
    if (pErr) return NextResponse.json({ success: false, error: pErr.message }, { status: 400 })
    if (!p || String((p as any).organization_id || '') !== String(orgId)) {
      return NextResponse.json({ success: false, error: 'KVKK: dönem/kurum uyuşmuyor' }, { status: 403 })
    }

    const aRes = await supabase
      .from('evaluation_assignments')
      .select(
        `
        *,
        evaluator:evaluator_id(id, name, department, position_level),
        target:target_id(id, name, department, position_level),
        evaluation_periods(name, name_en, name_fr)
      `
      )
      .eq('period_id', periodId)
    if (aRes.error) return NextResponse.json({ success: false, error: aRes.error.message }, { status: 400 })
    assignments = (aRes.data || []) as any[]
    const total = assignments.length
    const completed = assignments.filter((a: any) => a.status === 'completed').length
    const pending = total - completed
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0
    stats = { total, completed, pending, rate }
  }

  return NextResponse.json({
    success: true,
    periods: periodsRes.data || [],
    organizations: orgRes.data || [],
    users,
    departments,
    assignments,
    stats,
  })
}

