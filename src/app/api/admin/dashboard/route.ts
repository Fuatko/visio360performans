import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { isPgEnabled } from '@/lib/db'
import { pgRead, pgReadOne } from '@/lib/server/pg-read'
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

const ASSIGNMENT_PAGE = 1000

async function fetchAllDashboardAssignments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  periodIds: string[]
): Promise<AdminAssignmentRow[]> {
  if (!periodIds.length) return []
  const rows: AdminAssignmentRow[] = []
  let from = 0
  for (;;) {
    // OKUMA fallback: embed(evaluator/target→users, evaluation_periods→evaluation_periods JOIN+jsonb),
    // .in('period_id',arr)→= any($1::uuid[]), .range→limit/offset. org-scope: periodIds org'a ait (üstte doğrulandı).
    const { data, error } = isPgEnabled()
      ? await pgRead<AdminAssignmentRow>(
          `select a.id, a.status, a.period_id, a.evaluator_id, a.target_id, a.matrix_context, a.completed_at, a.created_at,
             case when ev.id is not null then jsonb_build_object('name', ev.name, 'department', ev.department) else null end as evaluator,
             case when tg.id is not null then jsonb_build_object('name', tg.name, 'department', tg.department) else null end as target,
             case when ep.id is not null then jsonb_build_object('name', ep.name, 'name_en', ep.name_en, 'name_fr', ep.name_fr, 'status', ep.status) else null end as evaluation_periods
           from evaluation_assignments a
           left join users ev on ev.id = a.evaluator_id
           left join users tg on tg.id = a.target_id
           left join evaluation_periods ep on ep.id = a.period_id
           where a.period_id = any($1::uuid[])
           order by a.created_at desc
           limit $2 offset $3`,
          [periodIds, ASSIGNMENT_PAGE, from]
        )
      : await supabase
          .from('evaluation_assignments')
          .select(ASSIGNMENT_SELECT)
          .in('period_id', periodIds)
          .order('created_at', { ascending: false })
          .range(from, from + ASSIGNMENT_PAGE - 1)
    if (error) throw error
    const page = (data || []) as AdminAssignmentRow[]
    rows.push(...page)
    if (page.length < ASSIGNMENT_PAGE) break
    from += ASSIGNMENT_PAGE
  }
  return rows
}

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

  // OKUMA fallback: org-scope organization_id=$1 birebir. count: 'exact' → aynı where satır sayısı = periodRows.length.
  const periodsRes = isPgEnabled()
    ? await pgRead<{ id: string; name: string; name_en?: string; name_fr?: string; status?: string }>(
        'select id, name, name_en, name_fr, status from evaluation_periods where organization_id = $1 order by created_at desc',
        [orgId]
      )
    : await supabase
        .from('evaluation_periods')
        .select('id, name, name_en, name_fr, status', { count: 'exact' })
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
  const periodRows = periodsRes.data
  const pErr = periodsRes.error
  if (pErr) return NextResponse.json({ success: false, error: (pErr as any).message }, { status: 400 })
  const periodsCount = isPgEnabled() ? (periodRows || []).length : (periodsRes as any).count

  let periodIds = (periodRows || []).map((p: { id: string }) => p.id)
  if (periodIdParam) {
    periodIds = periodIds.filter((id) => id === periodIdParam)
  }

  // OKUMA fallback: count sorguları → count(*). org-scope: id=$1 / organization_id=$1 birebir.
  const [orgsRes, usersRes] = await Promise.all([
    isPgEnabled()
      ? await pgReadOne<{ count: number }>('select count(*)::int as count from organizations where id = $1', [orgId])
      : await supabase.from('organizations').select('id', { count: 'exact' }).eq('id', orgId),
    isPgEnabled()
      ? await pgReadOne<{ count: number }>("select count(*)::int as count from users where status = 'active' and organization_id = $1", [orgId])
      : await supabase.from('users').select('id', { count: 'exact' }).eq('status', 'active').eq('organization_id', orgId),
  ])

  let allAssignments: AdminAssignmentRow[] = []
  try {
    allAssignments = await fetchAllDashboardAssignments(supabase, periodIds)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Atamalar alınamadı'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }

  const orgsCount = isPgEnabled() ? ((orgsRes as any).data?.count || 0) : ((orgsRes as any).count || 0)
  const usersCount = isPgEnabled() ? ((usersRes as any).data?.count || 0) : ((usersRes as any).count || 0)
  const stats = buildAdminDashboardStats(allAssignments, {
    organizations: orgsCount as number,
    users: usersCount as number,
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
