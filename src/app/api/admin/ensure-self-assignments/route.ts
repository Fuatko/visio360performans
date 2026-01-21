import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

type Body = { period_id?: string; organization_id?: string }

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl.replace(/\/$/, ''), service)
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = rateLimitByUser(req, 'admin:ensure-self-assignments:post', String(s.uid || ''), 10, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const period_id = String(body.period_id || '')
  const requestedOrg = body.organization_id ? String(body.organization_id) : null
  if (!period_id) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', period_id)
    .single()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })

  const orgId = String((period as any).organization_id || '')
  if (s.role === 'org_admin') {
    if (!s.org_id || String(s.org_id) !== orgId) return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  } else if (requestedOrg && requestedOrg !== orgId) {
    return NextResponse.json({ success: false, error: 'Kurum/dönem uyuşmuyor' }, { status: 400 })
  }

  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
  if (uErr) return NextResponse.json({ success: false, error: uErr.message || 'Kullanıcılar yüklenemedi' }, { status: 400 })
  const userIds = (users || []).map((u: any) => u.id).filter(Boolean) as string[]
  if (!userIds.length) return NextResponse.json({ success: true, created: 0 })

  const { data: existing, error: eErr } = await supabase
    .from('evaluation_assignments')
    .select('evaluator_id,target_id')
    .eq('period_id', period_id)
    .in('evaluator_id', userIds)
    .in('target_id', userIds)
  if (eErr) return NextResponse.json({ success: false, error: eErr.message || 'Atamalar okunamadı' }, { status: 400 })

  const existingSelf = new Set<string>()
  ;(existing || []).forEach((r: any) => {
    if (r.evaluator_id && r.target_id && r.evaluator_id === r.target_id) existingSelf.add(String(r.evaluator_id))
  })

  const toInsert = userIds
    .filter((id) => !existingSelf.has(id))
    .map((id) => ({ period_id, evaluator_id: id, target_id: id, status: 'pending' as const }))

  if (!toInsert.length) return NextResponse.json({ success: true, created: 0 })

  const { error: insErr } = await supabase.from('evaluation_assignments').insert(toInsert)
  if (insErr) return NextResponse.json({ success: false, error: insErr.message || 'Ekleme hatası' }, { status: 400 })
  return NextResponse.json({ success: true, created: toInsert.length })
}

