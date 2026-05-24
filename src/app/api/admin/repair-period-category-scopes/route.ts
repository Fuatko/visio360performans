import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { repairPeriodEvaluatorCategoryScopes } from '@/lib/server/evaluation-evaluator-scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

/** POST { period_id, dry_run? } — ana kategori altındaki eksik alt kategori kapsamlarını tamamlar */
export async function POST(req: NextRequest) {
  const session = sessionFromReq(req)
  if (!session || (session.role !== 'super_admin' && session.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  const limited = await rateLimitByUser(req, 'admin:repair-category-scopes', String(session.uid || ''), 20, 60_000)
  if (limited.blocked) {
    return NextResponse.json({ success: false, error: 'Çok fazla istek' }, { status: 429 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 500 })
  }

  let body: { period_id?: string; dry_run?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Geçersiz JSON' }, { status: 400 })
  }

  const periodId = String(body.period_id || '').trim()
  if (!periodId) {
    return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })
  }

  const dryRun = Boolean(body.dry_run)
  const result = await repairPeriodEvaluatorCategoryScopes(supabase, periodId, { dryRun })

  return NextResponse.json({
    success: true,
    dry_run: dryRun,
    ...result,
    message: dryRun
      ? 'Önizleme: değişiklik uygulanmadı'
      : 'Kapsam kayıtları güncellendi; değerlendirme formları yenilendiğinde yansır',
  })
}
