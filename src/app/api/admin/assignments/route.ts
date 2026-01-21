import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

type CreateBody = { period_id?: string; evaluator_id?: string; target_id?: string }
type DeleteBody = { id?: string }

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl.replace(/\/$/, ''), service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:assignments:post', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as CreateBody
  const period_id = String(body.period_id || '')
  const evaluator_id = String(body.evaluator_id || '')
  const target_id = String(body.target_id || '')
  if (!period_id || !evaluator_id || !target_id) {
    return NextResponse.json({ success: false, error: 'Eksik alan' }, { status: 400 })
  }

  // Period org check (org_admin must match)
  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', period_id)
    .single()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String(period.organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  // Ensure users are within same org as period (basic KVKK guard)
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, organization_id')
    .in('id', [evaluator_id, target_id])
  if (uErr || !users || users.length < 2) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })
  const ok = users.every((u: any) => String(u.organization_id || '') === String(period.organization_id || ''))
  if (!ok) return NextResponse.json({ success: false, error: 'KVKK: kullanıcı/kurum uyuşmuyor' }, { status: 403 })

  // Insert (idempotency check left to DB unique constraint if present)
  const { error } = await supabase.from('evaluation_assignments').insert({
    period_id,
    evaluator_id,
    target_id,
    status: 'pending',
  })
  if (error) return NextResponse.json({ success: false, error: error.message || 'Ekleme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:assignments:delete', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as DeleteBody
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  // Load assignment -> period org check for org_admin
  const { data: a, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select('id, period_id, evaluation_periods:period_id(organization_id)')
    .eq('id', id)
    .single()
  if (aErr || !a) return NextResponse.json({ success: false, error: 'Atama bulunamadı' }, { status: 404 })
  const orgId = (a as any).evaluation_periods?.organization_id
  if (s.role === 'org_admin' && s.org_id && String(orgId) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  const { error } = await supabase.from('evaluation_assignments').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message || 'Silme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

