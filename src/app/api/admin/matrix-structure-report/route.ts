import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { buildMatrixStructureReport } from '@/lib/server/matrix-structure-report-build'
import { reportsMaintenanceBlockedResponse } from '@/lib/server/reports-maintenance-guard'
import type { EvaluatorAnswerDetailLang } from '@/lib/server/evaluator-answer-detail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

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

type Body = {
  period_id?: string
  org_id?: string
  department?: string | null
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase() as EvaluatorAnswerDetailLang
  const safeLang: EvaluatorAnswerDetailLang = lang === 'en' || lang === 'fr' ? lang : 'tr'

  const rl = await rateLimitByUser(req, 'admin:matrix-structure-report:post', String(s.uid || ''), 10, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const maintenanceBlock = await reportsMaintenanceBlockedResponse(supabase, s.role)
  if (maintenanceBlock) return maintenanceBlock

  const body = (await req.json().catch(() => ({}))) as Body
  const periodId = String(body.period_id || '').trim()
  const orgIdParam = String(body.org_id || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : orgIdParam
  const department = body.department ? String(body.department).trim() : ''

  if (!periodId || !orgId) {
    return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })
  }

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (String((period as { organization_id?: string }).organization_id || '') !== orgId) {
    return NextResponse.json({ success: false, error: 'Dönem/kurum uyuşmuyor' }, { status: 403 })
  }

  try {
    const report = await buildMatrixStructureReport(supabase, {
      periodId,
      orgId,
      lang: safeLang,
      department,
    })
    return NextResponse.json({ success: true, ...report })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Matris yapı raporu alınamadı'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }
}
