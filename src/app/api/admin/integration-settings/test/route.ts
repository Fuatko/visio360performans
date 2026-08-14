import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { clearInspiraConfigCache, getInspiraConfig } from '@/lib/server/inspirasuite'
import { isPgEnabled } from '@/lib/db'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'

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

// POST — InspiraSuite bağlantısını test et (courses/list çağrısı)
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || s.role !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:integration-settings:test', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  // Effective config: DB satırı + env fallback (API Key panelde boşsa env'deki anahtar kullanılır).
  const cfg = await getInspiraConfig(true)
  const baseUrl = cfg.baseUrl
  const apiKey = cfg.apiKey

  if (!apiKey) return NextResponse.json({ success: false, error: 'API key tanımlı değil' }, { status: 400 })
  if (!baseUrl) return NextResponse.json({ success: false, error: 'Platform URL tanımlı değil' }, { status: 400 })

  const recordResult = async (status: 'success' | 'failed') => {
    try {
      // YAZMA (hibrit): pg açıksa withActor → RLS org-context içinde parametreli UPDATE.
      // integration_settings GLOBAL (org yok) → RLS org_isolation yok; buildActor(s) super_admin
      // verir (route yalnız super_admin). WHERE platform=$3 BİREBİR. Kolonlar KODDAN sabit → enjeksiyon yok.
      if (isPgEnabled()) {
        await withActor(buildActor(s), async (c) => {
          await c.query(
            'update integration_settings set last_tested_at = $1, last_test_status = $2 where platform = $3',
            [new Date().toISOString(), status, PLATFORM]
          )
        })
      } else {
        await supabase
          .from('integration_settings')
          .update({ last_tested_at: new Date().toISOString(), last_test_status: status })
          .eq('platform', PLATFORM)
      }
    } catch {
      // yut
    }
    clearInspiraConfigCache()
  }

  try {
    const res = await fetch(`${baseUrl}/api/integrations/courses/list`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      await recordResult('failed')
      return NextResponse.json({
        success: false,
        status: res.status,
        message:
          res.status === 401
            ? 'Bağlantı başarısız — API key hatalı (InspiraSuite 401 döndü)'
            : res.status === 404
              ? 'Bağlantı başarısız — uç bulunamadı (URL yanlış veya InspiraSuite deploy edilmemiş)'
              : `Bağlantı başarısız — HTTP ${res.status}`,
      })
    }

    const data = await res.json().catch(() => null)
    const count = Array.isArray(data) ? data.length : Array.isArray((data as any)?.courses) ? (data as any).courses.length : 0
    await recordResult('success')
    return NextResponse.json({
      success: true,
      course_count: count,
      message: `Bağlantı başarılı — ${count} kurs bulundu`,
    })
  } catch (err) {
    await recordResult('failed')
    const msg = err instanceof Error ? err.message : 'Bilinmeyen hata'
    return NextResponse.json({
      success: false,
      error: msg,
      message: /timeout|abort/i.test(msg) ? 'Bağlantı zaman aşımına uğradı' : `Bağlantı hatası: ${msg}`,
    })
  }
}
