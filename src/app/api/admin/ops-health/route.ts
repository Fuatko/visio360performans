import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { runOpsHealth } from '@/lib/server/ops-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || s.role !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Yalnızca süper admin erişebilir' }, { status: 403 })
  }

  const rl = await rateLimitByUser(req, 'admin:ops-health:get', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek', detail: `Lütfen ${rl.retryAfterSec} sn sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  const report = await runOpsHealth(supabase as any)

  return NextResponse.json(
    { success: true, ...report },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    }
  )
}
