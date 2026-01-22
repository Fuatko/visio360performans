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

  const q = supabase
    .from('evaluation_assignments')
    .select(
      `
      *,
      target:target_id(name, department),
      evaluation_periods(name, name_en, name_fr, status)
    `
    )
    .eq('evaluator_id', s.uid)
    .order('created_at', { ascending: false })

  if (filter === 'pending') q.eq('status', 'pending')
  if (filter === 'completed') q.eq('status', 'completed')

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message || 'Veri alınamadı' }, { status: 400 })

  return NextResponse.json({ success: true, assignments: data || [] })
}

