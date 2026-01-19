import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'

export const runtime = 'nodejs'

type SaveBody = {
  id?: string
  name?: string
  email?: string
  phone?: string | null
  organization_id?: string | null
  title?: string | null
  department?: string | null
  position_level?: string
  role?: string
  status?: string
  preferred_language?: string
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
  const email = String(body.email || '').trim().toLowerCase()
  if (!name || !email) return NextResponse.json({ success: false, error: 'Ad ve email zorunlu' }, { status: 400 })

  const requestedOrg = body.organization_id ? String(body.organization_id) : null
  const orgId = s.role === 'org_admin' ? (s.org_id ? String(s.org_id) : null) : requestedOrg
  if (s.role === 'org_admin' && !orgId) return NextResponse.json({ success: false, error: 'Kurum bulunamadı' }, { status: 400 })

  const role = String(body.role || 'user')
  if (s.role === 'org_admin' && role === 'super_admin') {
    return NextResponse.json({ success: false, error: 'KVKK: super_admin atanamaz' }, { status: 403 })
  }

  const payload: any = {
    name,
    email,
    phone: body.phone || null,
    organization_id: orgId || null,
    title: body.title || null,
    department: body.department || null,
    position_level: body.position_level || 'peer',
    role,
    status: body.status || 'active',
    preferred_language: body.preferred_language || 'tr',
  }

  if (id) {
    // org_admin can only edit users in its org
    if (s.role === 'org_admin') {
      const { data: existing, error: eErr } = await supabase.from('users').select('id, organization_id, role').eq('id', id).single()
      if (eErr || !existing) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })
      if (String((existing as any).organization_id || '') !== String(orgId || '')) {
        return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
      }
      if (String((existing as any).role) === 'super_admin') {
        return NextResponse.json({ success: false, error: 'KVKK: super_admin düzenlenemez' }, { status: 403 })
      }
    }

    const { error } = await supabase.from('users').update(payload).eq('id', id)
    if (error) return NextResponse.json({ success: false, error: error.message || 'Güncelleme hatası' }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  // Create
  if (s.role === 'org_admin' && role !== 'user') {
    // keep org_admin creation simple/least privilege
    payload.role = 'user'
  }

  const { error } = await supabase.from('users').insert(payload)
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

  if (s.role === 'org_admin') {
    const { data: existing, error: eErr } = await supabase.from('users').select('id, organization_id, role').eq('id', id).single()
    if (eErr || !existing) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })
    if (String((existing as any).organization_id || '') !== String(s.org_id || '')) {
      return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
    }
    if (String((existing as any).role) !== 'user') {
      return NextResponse.json({ success: false, error: 'KVKK: sadece user silinebilir' }, { status: 403 })
    }
  }

  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message || 'Silme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

