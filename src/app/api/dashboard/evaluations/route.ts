import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { filterEvaluatorAssignmentsForDashboard } from '@/lib/dashboard-evaluations-filter'
import { isPgEnabled } from '@/lib/db'
import { pgRead } from '@/lib/server/pg-read'

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
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  // Frequent list refresh: rate limit by user to avoid corporate NAT false-positives
  const rl = await rateLimitByUser(req, 'dashboard:evaluations:get', s.uid, 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const filter = (url.searchParams.get('filter') || 'all').toLowerCase()

  let data: any[] | null
  let error: any

  if (isPgEnabled()) {
    const params: unknown[] = [s.uid]
    let statusClause = ''
    if (filter === 'pending') {
      params.push('pending')
      statusClause = ` and a.status = $${params.length}`
    }
    if (filter === 'completed') {
      params.push('completed')
      statusClause = ` and a.status = $${params.length}`
    }
    const res = await pgRead<any>(
      `select a.*,
              case when tg.id is not null then jsonb_build_object('name', tg.name, 'department', tg.department) else null end as target,
              case when ep.id is not null then jsonb_build_object('name', ep.name, 'name_en', ep.name_en, 'name_fr', ep.name_fr, 'status', ep.status) else null end as evaluation_periods
       from evaluation_assignments a
       left join users tg on tg.id = a.target_id
       left join evaluation_periods ep on ep.id = a.period_id
       where a.evaluator_id = $1${statusClause}
       order by a.created_at desc`,
      params
    )
    data = res.data
    error = res.error
  } else {
    const q = supabase
      .from('evaluation_assignments')
      .select(
        `
      *,
      target:target_id(name, department),
      evaluation_periods(name, name_en, name_fr, status),
      matrix_context
    `
      )
      .eq('evaluator_id', s.uid)
      .order('created_at', { ascending: false })

    if (filter === 'pending') q.eq('status', 'pending')
    if (filter === 'completed') q.eq('status', 'completed')

    const res = await q
    data = res.data
    error = res.error
  }

  if (error) return NextResponse.json({ success: false, error: error.message || 'Veri alınamadı' }, { status: 400 })

  const assignments = filterEvaluatorAssignmentsForDashboard((data || []) as any[])

  return NextResponse.json({ success: true, assignments })
}

