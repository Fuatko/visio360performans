import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { emailBelongsToOrg, getInspiraConfig, getProgress, resolveUserEmail } from '@/lib/server/inspirasuite'

export const runtime = 'nodejs'

function getSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

// GET — Bir kullanıcının InspiraSuite'teki atanmış eğitim ilerlemesini getir
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'integrations:inspirasuite:progress', String(s.uid || ''), 60, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  if (!(await getInspiraConfig()).enabled) {
    return NextResponse.json({ success: false, error: 'InspiraSuite entegrasyonu aktif değil' }, { status: 503 })
  }

  const url = new URL(req.url)
  const userId = (url.searchParams.get('user_id') || url.searchParams.get('person_id') || '').trim()
  let email = (url.searchParams.get('email') || '').trim()

  if (userId) {
    const supabase = getSupabaseAdmin()
    if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })
    const orgId = s.role === 'org_admin' ? String(s.org_id || '') : null
    const resolved = await resolveUserEmail(supabase, userId, orgId)
    if (!resolved) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı veya yetki yok' }, { status: 404 })
    email = resolved.email
  } else if (email && s.role === 'org_admin') {
    // B-4: org_admin ham e-posta ile BAŞKA kurumun ilerlemesini çekemesin — e-posta kendi kurumunda olmalı.
    const supabase = getSupabaseAdmin()
    if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })
    const orgId = String(s.org_id || '')
    if (!orgId || !(await emailBelongsToOrg(supabase, email, orgId))) {
      return NextResponse.json({ success: false, error: 'Bu e-posta kurumunuza ait değil' }, { status: 403 })
    }
  }

  if (!email) return NextResponse.json({ success: false, error: 'user_id veya email gerekli' }, { status: 400 })

  try {
    const courses = await getProgress(email)
    return NextResponse.json({ success: true, courses })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'İlerleme alınamadı' },
      { status: 502 }
    )
  }
}
