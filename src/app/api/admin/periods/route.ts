import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'

export const runtime = 'nodejs'

type SaveBody = {
  id?: string
  name?: string
  organization_id?: string
  start_date?: string
  end_date?: string
  status?: 'active' | 'inactive' | 'completed' | string
}

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
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as SaveBody
  const id = body.id ? String(body.id) : null

  const name = String(body.name || '').trim()
  const organization_id = String(body.organization_id || '').trim()
  const start_date = String(body.start_date || '').trim()
  const end_date = String(body.end_date || '').trim()
  const status = (body.status || 'active') as any

  if (!name || !organization_id || !start_date || !end_date) {
    return NextResponse.json({ success: false, error: 'Eksik alan' }, { status: 400 })
  }

  if (s.role === 'org_admin' && s.org_id && String(s.org_id) !== organization_id) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  if (id) {
    // Ensure period belongs to org
    const { data: existing, error: eErr } = await supabase
      .from('evaluation_periods')
      .select('id, organization_id')
      .eq('id', id)
      .single()
    if (eErr || !existing) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
    if (String((existing as any).organization_id) !== organization_id) {
      return NextResponse.json({ success: false, error: 'Dönem/kurum uyuşmuyor' }, { status: 400 })
    }

    const { error } = await supabase
      .from('evaluation_periods')
      .update({ name, organization_id, start_date, end_date, status })
      .eq('id', id)
    if (error) return NextResponse.json({ success: false, error: error.message || 'Güncelleme hatası' }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  const { error } = await supabase.from('evaluation_periods').insert({ name, organization_id, start_date, end_date, status })
  if (error) return NextResponse.json({ success: false, error: error.message || 'Ekleme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as DeleteBody
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  const { data: existing, error: eErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', id)
    .single()
  if (eErr || !existing) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String((existing as any).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  const { error } = await supabase.from('evaluation_periods').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message || 'Silme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

