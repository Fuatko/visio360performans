import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

type SaveBody = { id?: string; name?: string; logo_base64?: string | null }
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

  const rl = await rateLimitByUser(req, 'admin:organizations:post', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as SaveBody
  const id = body.id ? String(body.id) : null
  const name = (body.name || '').toString().trim()
  const logo_base64 = typeof body.logo_base64 === 'string' ? body.logo_base64 : null

  if (id) {
    if (s.role === 'org_admin') {
      if (!s.org_id || String(s.org_id) !== id) return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
    }
    const update: any = {}
    if (name) update.name = name
    if (body.logo_base64 !== undefined) update.logo_base64 = logo_base64
    if (Object.keys(update).length === 0) return NextResponse.json({ success: false, error: 'Değişiklik yok' }, { status: 400 })
    const { error } = await supabase.from('organizations').update(update).eq('id', id)
    if (error) return NextResponse.json({ success: false, error: error.message || 'Güncelleme hatası' }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  // Create org only for super_admin (UI already disables, but keep API safe)
  if (s.role !== 'super_admin') return NextResponse.json({ success: false, error: 'KVKK: kurum oluşturulamaz' }, { status: 403 })
  if (!name) return NextResponse.json({ success: false, error: 'Kurum adı zorunlu' }, { status: 400 })
  const { data: created, error } = await supabase
    .from('organizations')
    .insert({ name, logo_base64 })
    .select('id,name')
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message || 'Ekleme hatası' }, { status: 400 })
  return NextResponse.json({ success: true, org: created })
}

export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || s.role !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:organizations:delete', String(s.uid || ''), 10, 60 * 1000)
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

  const { error } = await supabase.from('organizations').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message || 'Silme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

