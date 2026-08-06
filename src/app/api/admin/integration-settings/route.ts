import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { clearInspiraConfigCache } from '@/lib/server/inspirasuite'

export const runtime = 'nodejs'

const PLATFORM = 'inspirasuite'

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

/** Gizli değerleri maskele: baş 6 + *** + son 4. Kısa değerlerde tümü yıldız. */
function mask(value: string | null | undefined): string | null {
  const v = String(value || '')
  if (!v) return null
  if (v.length <= 12) return '•'.repeat(Math.max(4, v.length))
  return `${v.slice(0, 6)}${'•'.repeat(6)}${v.slice(-4)}`
}

function isMaskedValue(v: string) {
  return v.includes('•')
}

// GET — Ayarları getir (api_key / webhook_secret maskeli)
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || s.role !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const { data, error } = await supabase.from('integration_settings').select('*').eq('platform', PLATFORM).maybeSingle()
  if (error) return NextResponse.json({ success: false, error: error.message || 'Ayarlar alınamadı' }, { status: 400 })

  const settings = ((data as any)?.settings as Record<string, unknown>) || {}
  const item = {
    platform: PLATFORM,
    base_url: (data as any)?.base_url || '',
    api_key: mask((data as any)?.api_key),
    webhook_secret: mask((data as any)?.webhook_secret),
    has_api_key: Boolean((data as any)?.api_key),
    has_webhook_secret: Boolean((data as any)?.webhook_secret),
    is_active: Boolean((data as any)?.is_active),
    last_tested_at: (data as any)?.last_tested_at || null,
    last_test_status: (data as any)?.last_test_status || null,
    auto_assign: Boolean(settings.auto_assign),
    auto_notify: Boolean(settings.auto_notify),
    require_approval: Boolean(settings.require_approval),
  }

  // Son entegrasyon logları
  let logs: any[] = []
  try {
    const { data: logRows } = await supabase
      .from('integration_logs')
      .select('event_type, direction, status, user_email, error, created_at')
      .eq('platform', PLATFORM)
      .order('created_at', { ascending: false })
      .limit(10)
    logs = logRows || []
  } catch {
    // integration_logs yoksa boş bırak
  }

  const webhookBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://visio360pds.vercel.app')
    .trim()
    .replace(/\/$/, '')

  return NextResponse.json({ success: true, item, logs, webhook_url: `${webhookBase}/api/integrations/training` })
}

type SaveBody = {
  base_url?: string
  api_key?: string
  webhook_secret?: string
  is_active?: boolean
  auto_assign?: boolean
  auto_notify?: boolean
  require_approval?: boolean
}

// POST — Ayarları kaydet (maskeli gelen gizli değerler korunur)
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || s.role !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:integration-settings:post', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as SaveBody

  // Mevcut kaydı çek (maskeli gelen gizli değerleri korumak için)
  const { data: existing } = await supabase
    .from('integration_settings')
    .select('api_key, webhook_secret, settings')
    .eq('platform', PLATFORM)
    .maybeSingle()

  const payload: Record<string, unknown> = {
    platform: PLATFORM,
    base_url: body.base_url ? String(body.base_url).trim().replace(/\/$/, '') : '',
    is_active: Boolean(body.is_active),
    settings: {
      auto_assign: Boolean(body.auto_assign),
      auto_notify: Boolean(body.auto_notify),
      require_approval: Boolean(body.require_approval),
    },
    updated_at: new Date().toISOString(),
  }

  // api_key: boş veya maskeli ise mevcut değeri koru; aksi halde güncelle
  if (typeof body.api_key === 'string' && body.api_key.trim() && !isMaskedValue(body.api_key)) {
    payload.api_key = body.api_key.trim()
  } else if ((existing as any)?.api_key) {
    payload.api_key = (existing as any).api_key
  }

  if (typeof body.webhook_secret === 'string' && body.webhook_secret.trim() && !isMaskedValue(body.webhook_secret)) {
    payload.webhook_secret = body.webhook_secret.trim()
  } else if ((existing as any)?.webhook_secret) {
    payload.webhook_secret = (existing as any).webhook_secret
  }

  const { error } = await supabase.from('integration_settings').upsert(payload, { onConflict: 'platform' })
  if (error) return NextResponse.json({ success: false, error: error.message || 'Kaydedilemedi' }, { status: 500 })

  clearInspiraConfigCache()
  return NextResponse.json({ success: true })
}
