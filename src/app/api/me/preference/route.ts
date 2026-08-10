import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'

export const runtime = 'nodejs'

// Giriş yapmış kullanıcının YALNIZCA kendi preferred_language'ini güncellemesi.
// user rolü dahil herkes kullanabilir. Best-effort: hata olsa bile çağıranı bloklamaz.

const ALLOWED_LANGS = new Set(['tr', 'en', 'fr'])

function getSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  // Session yoksa 401 (çağıran taraf bunu yutmalı — sayfa/login kırılmaz).
  if (!s || !s.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { preferred_language?: unknown }
  const lang = String(body?.preferred_language || '').trim().toLowerCase()
  if (!ALLOWED_LANGS.has(lang)) {
    return NextResponse.json({ success: false, error: 'Geçersiz dil' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  // Best-effort: yapılandırma eksikse bile çağıranı bloklama (200 döndür).
  if (!supabase) return NextResponse.json({ success: false, error: 'yapılandırma eksik' }, { status: 200 })

  try {
    // GÜVENLİK: hedef satır DAİMA oturumdaki uid'dir. Body'deki id/user_id yok sayılır
    // → kullanıcı başkasının preferred_language'ini DEĞİŞTİREMEZ.
    const { error } = await supabase.from('users').update({ preferred_language: lang }).eq('id', String(s.uid))
    if (error) {
      // Best-effort: DB hatası çağıranı bloklamasın.
      return NextResponse.json({ success: false, error: error.message }, { status: 200 })
    }
    return NextResponse.json({ success: true, preferred_language: lang })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'hata' }, { status: 200 })
  }
}
