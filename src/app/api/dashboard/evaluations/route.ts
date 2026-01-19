import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'

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
      evaluation_periods(name, status)
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

