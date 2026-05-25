import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  ADMIN_DASHBOARD_PENDING_LIST_LIMIT,
  ADMIN_DASHBOARD_RECENT_COMPLETED_LIMIT,
} from '@/lib/admin-dashboard-limits'
import {
  buildAdminDashboardStats,
  buildEvaluatorSummaries,
  buildPeriodSummaries,
  type AdminAssignmentRow,
} from '@/lib/admin-dashboard-stats'

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

const ASSIGNMENT_SELECT = `
  id, status, period_id, evaluator_id, target_id, matrix_context, completed_at, created_at,
  evaluator:evaluator_id(name, department),
  target:target_id(name, department),
  evaluation_periods(name, name_en, name_fr, status)
`

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:dashboard:get', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const orgIdParam = (url.searchParams.get('org_id') || '').trim()
  const periodIdParam = (url.searchParams.get('period_id') || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : orgIdParam
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  const { data: periodRows, count: periodsCount, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, name, name_en, name_fr, status', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
  if (pErr) return NextResponse.json({ success: false, error: pErr.message }, { status: 400 })

  let periodIds = (periodRows || []).map((p: { id: string }) => p.id)
  if (periodIdParam) {
    periodIds = periodIds.filter((id) => id === periodIdParam)
  }

  const [orgsRes, usersRes] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact' }).eq('id', orgId),
    supabase.from('users').select('id', { count: 'exact' }).eq('status', 'active').eq('organization_id', orgId),
  ])

  const assignmentsRes =
    periodIds.length > 0
      ? await supabase
          .from('evaluation_assignments')
          .select(ASSIGNMENT_SELECT)
          .in('period_id', periodIds)
          .order('created_at', { ascending: false })
      : ({ data: [] as AdminAssignmentRow[], error: null } as const)

  if ((assignmentsRes as { error?: { message?: string } }).error) {
    return NextResponse.json(
      { success: false, error: String((assignmentsRes as { error?: { message?: string } }).error?.message || 'Atamalar alınamadı') },
      { status: 400 }
    )
  }

  const allAssignments = ((assignmentsRes as { data?: AdminAssignmentRow[] }).data || []) as AdminAssignmentRow[]

  const stats = buildAdminDashboardStats(allAssignments, {
    organizations: (orgsRes.count || 0) as number,
    users: (usersRes.count || 0) as number,
    periods: (periodsCount || 0) as number,
  })

  const by_period = buildPeriodSummaries(allAssignments)
  const evaluator_summaries = buildEvaluatorSummaries(allAssignments)

  const pendingAssignments = allAssignments.filter(
    (a) => a.status === 'pending' && a.evaluation_periods?.status === 'active'
  )

  const recentAssignments = allAssignments
    .filter((a) => a.status === 'completed')
    .sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')))
    .slice(0, ADMIN_DASHBOARD_RECENT_COMPLETED_LIMIT)

  const pendingList = pendingAssignments.slice(0, ADMIN_DASHBOARD_PENDING_LIST_LIMIT)

  return NextResponse.json({
    success: true,
    limits: {
      recent_completed: ADMIN_DASHBOARD_RECENT_COMPLETED_LIMIT,
      pending_list: ADMIN_DASHBOARD_PENDING_LIST_LIMIT,
    },
    period_id: periodIdParam || null,
    periods: (periodRows || []).map((p: { id: string; name: string; name_en?: string; name_fr?: string; status?: string }) => ({
      id: p.id,
      name: p.name,
      name_en: p.name_en ?? null,
      name_fr: p.name_fr ?? null,
      status: p.status ?? null,
    })),
    stats,
    by_period,
    by_matrix: stats.by_matrix,
    evaluator_summaries: evaluator_summaries.slice(0, 80),
    recent_assignments: recentAssignments,
    lists: {
      pending: pendingList,
    },
  })
}
