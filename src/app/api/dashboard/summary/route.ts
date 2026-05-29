import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  buildDashboardPeriodSummaries,
  filterEvaluatorAssignmentsForDashboard,
  mergeTargetCountsIntoPeriodSummaries,
} from '@/lib/dashboard-evaluations-filter'

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

  const rl = await rateLimitByUser(req, 'dashboard:summary:get', s.uid, 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const { data: willEval, error: wErr } = await supabase
    .from('evaluation_assignments')
    .select(
      `
      id, period_id, evaluator_id, target_id, status, slug, completed_at, created_at, matrix_context,
      target:target_id(name, department),
      evaluation_periods(name, name_en, name_fr, status)
    `
    )
    .eq('evaluator_id', s.uid)
    .order('created_at', { ascending: false })

  if (wErr) return NextResponse.json({ success: false, error: wErr.message || 'Veri alınamadı' }, { status: 400 })

  const all = filterEvaluatorAssignmentsForDashboard((willEval || []) as any[])
  const pendingActive = all.filter((a) => a.status === 'pending' && a?.evaluation_periods?.status === 'active')
  const completed = all.filter((a) => a.status === 'completed')

  const { data: aboutMe, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select(
      `
      id, period_id, evaluator_id, target_id, status, slug, completed_at, created_at,
      evaluator:evaluator_id(name),
      evaluation_periods(name, name_en, name_fr, status)
    `
    )
    .eq('target_id', s.uid)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })

  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Veri alınamadı' }, { status: 400 })

  const aboutMeList = (aboutMe || []) as any[]

  const { data: asTarget, error: tErr } = await supabase
    .from('evaluation_assignments')
    .select(
      `
      period_id, status,
      evaluation_periods(name, name_en, name_fr, status)
    `
    )
    .eq('target_id', s.uid)

  if (tErr) return NextResponse.json({ success: false, error: tErr.message || 'Veri alınamadı' }, { status: 400 })

  const byPeriod = mergeTargetCountsIntoPeriodSummaries(
    buildDashboardPeriodSummaries(all, aboutMeList),
    (asTarget || []) as any[]
  )

  return NextResponse.json({
    success: true,
    counts: {
      pending: pendingActive.length,
      completed: completed.length,
      about_me: aboutMeList.length,
    },
    by_period: byPeriod,
    lists: {
      pending: pendingActive,
      completed,
      about_me: aboutMeList,
    },
  })
}
