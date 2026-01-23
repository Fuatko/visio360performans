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

type SaveBody = {
  id?: string
  scope?: 'global' | 'org'
  org_id?: string
  area?: string
  title?: string
  provider?: string | null
  url?: string | null
  language?: string | null
  duration_weeks?: number | null
  hours?: number | null
  level?: string | null
  tags?: string[] | null
  is_active?: boolean
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:training-catalog:get', String(s.uid || ''), 60, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const scope = (url.searchParams.get('scope') || 'org').toLowerCase()
  const qText = (url.searchParams.get('q') || '').trim().toLowerCase()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : String(url.searchParams.get('org_id') || '').trim()

  const q = supabase
    .from('training_catalog')
    .select('id, organization_id, area, title, provider, url, language, duration_weeks, hours, level, tags, is_active, created_at, updated_at')
    .order('area', { ascending: true })
    .order('title', { ascending: true })
    .limit(500)

  if (scope === 'global') {
    if (s.role !== 'super_admin') return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
    q.is('organization_id', null)
  } else {
    if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })
    q.eq('organization_id', orgId)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: (error as any)?.message || 'Veri alınamadı' }, { status: 400 })

  const items = (data || []).filter((r: any) => {
    if (!qText) return true
    const hay = `${r.area || ''} ${r.title || ''} ${r.provider || ''} ${(r.tags || []).join(' ')}`.toLowerCase()
    return hay.includes(qText)
  })

  return NextResponse.json({ success: true, items })
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:training-catalog:post', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as SaveBody
  const id = String(body.id || '').trim()
  const scope = (body.scope || 'org').toLowerCase()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : String(body.org_id || '').trim()

  const organization_id = scope === 'global' ? null : orgId
  if (scope === 'global' && s.role !== 'super_admin') return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
  if (scope !== 'global' && !orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  const area = String(body.area || '').trim()
  const title = String(body.title || '').trim()
  if (!area || !title) return NextResponse.json({ success: false, error: 'area ve title gerekli' }, { status: 400 })

  const payload: any = {
    organization_id,
    area,
    title,
    provider: body.provider ? String(body.provider) : null,
    url: body.url ? String(body.url) : null,
    language: body.language ? String(body.language) : null,
    duration_weeks: typeof body.duration_weeks === 'number' ? body.duration_weeks : body.duration_weeks ? Number(body.duration_weeks) : null,
    hours: typeof body.hours === 'number' ? body.hours : body.hours ? Number(body.hours) : null,
    level: body.level ? String(body.level) : null,
    tags: Array.isArray(body.tags) ? body.tags.map((x) => String(x).trim()).filter(Boolean) : null,
    is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    // Enforce scope rules on update
    const { data: existing, error: eErr } = await supabase.from('training_catalog').select('id, organization_id').eq('id', id).maybeSingle()
    if (eErr || !existing) return NextResponse.json({ success: false, error: 'Kayıt bulunamadı' }, { status: 404 })
    if (s.role === 'org_admin' && String((existing as any).organization_id || '') !== String(orgId)) {
      return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
    }
    if (s.role !== 'super_admin' && (existing as any).organization_id == null) {
      return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
    }
    const { error } = await supabase.from('training_catalog').update(payload).eq('id', id)
    if (error) return NextResponse.json({ success: false, error: (error as any)?.message || 'Güncelleme hatası' }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  payload.created_at = new Date().toISOString()
  const { error } = await supabase.from('training_catalog').insert(payload)
  if (error) return NextResponse.json({ success: false, error: (error as any)?.message || 'Ekleme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as any
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  // Enforce scope rules
  const { data: existing, error: eErr } = await supabase.from('training_catalog').select('id, organization_id').eq('id', id).maybeSingle()
  if (eErr || !existing) return NextResponse.json({ success: false, error: 'Kayıt bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin') {
    if (String((existing as any).organization_id || '') !== String(s.org_id || '')) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
  } else {
    // super_admin can delete both global and org items
  }

  const { error } = await supabase.from('training_catalog').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: (error as any)?.message || 'Silme hatası' }, { status: 400 })

  return NextResponse.json({ success: true })
}

