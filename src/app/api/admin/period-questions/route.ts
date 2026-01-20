import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByIp } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

type Body = { period_id?: string; question_ids?: string[] }

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl.replace(/\/$/, ''), service)
}

export async function GET(req: NextRequest) {
  const rl = rateLimitByIp(req, 'admin:period-questions:get', 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const period_id = (url.searchParams.get('period_id') || '').trim()
  if (!period_id) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', period_id)
    .single()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String((period as any).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  // Table may not exist in some installs; keep UX resilient.
  try {
    const { data, error } = await supabase
      .from('evaluation_period_questions')
      .select('question_id, sort_order, is_active')
      .eq('period_id', period_id)
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at')
    if (error) return NextResponse.json({ success: false, error: error.message || 'Veri alınamadı' }, { status: 400 })
    return NextResponse.json({ success: true, period_id, questions: data || [] })
  } catch {
    return NextResponse.json({ success: true, period_id, questions: [] })
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimitByIp(req, 'admin:period-questions:post', 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const period_id = String(body.period_id || '')
  const question_ids = Array.isArray(body.question_ids) ? body.question_ids.map(String) : []
  if (!period_id) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', period_id)
    .single()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String((period as any).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  // Replace-all strategy (matches existing UI behavior)
  const { error: delErr } = await supabase.from('evaluation_period_questions').delete().eq('period_id', period_id)
  if (delErr) return NextResponse.json({ success: false, error: delErr.message || 'Silme hatası' }, { status: 400 })

  if (question_ids.length > 0) {
    const payload = question_ids.map((qid, idx) => ({
      period_id,
      question_id: qid,
      sort_order: idx + 1,
      is_active: true,
    }))
    const { error: insErr } = await supabase.from('evaluation_period_questions').insert(payload)
    if (insErr) return NextResponse.json({ success: false, error: insErr.message || 'Kaydetme hatası' }, { status: 400 })
  }

  return NextResponse.json({ success: true, count: question_ids.length })
}

