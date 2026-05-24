import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  fetchSelfEvaluationAssignments,
  removeSelfEvaluationAssignments,
} from '@/lib/server/remove-self-eval-assignments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

type Body = {
  period_id?: string
  organization_id?: string
  user_id?: string
  dry_run?: boolean
  confirm?: string
}

async function resolveOrgCheck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  s: { role: string; org_id?: string | null },
  periodId: string | undefined,
  organizationId: string | undefined
): Promise<{ ok: true; organizationId?: string } | { ok: false; status: number; error: string }> {
  if (periodId) {
    const { data: period, error: pErr } = await supabase
      .from('evaluation_periods')
      .select('id, organization_id')
      .eq('id', periodId)
      .single()
    if (pErr || !period) return { ok: false, status: 404, error: 'Dönem bulunamadı' }
    const orgId = String((period as { organization_id?: string }).organization_id || '')
    if (s.role === 'org_admin' && s.org_id && String(s.org_id) !== orgId) {
      return { ok: false, status: 403, error: 'KVKK: kurum yetkisi yok' }
    }
    if (organizationId && organizationId !== orgId) {
      return { ok: false, status: 400, error: 'period_id / organization_id uyuşmuyor' }
    }
    return { ok: true, organizationId: orgId }
  }

  const orgToUse = organizationId || (s.role === 'org_admin' ? String(s.org_id || '') : '')
  if (!orgToUse) {
    return { ok: false, status: 400, error: 'period_id veya organization_id gerekli' }
  }
  if (s.role === 'org_admin' && s.org_id && String(s.org_id) !== orgToUse) {
    return { ok: false, status: 403, error: 'KVKK: kurum yetkisi yok' }
  }
  return { ok: true, organizationId: orgToUse }
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const periodId = req.nextUrl.searchParams.get('period_id')?.trim() || undefined
  const organizationId = req.nextUrl.searchParams.get('organization_id')?.trim() || undefined
  const userId = req.nextUrl.searchParams.get('user_id')?.trim() || undefined
  if (!userId) {
    return NextResponse.json({ success: false, error: 'user_id gerekli (yalnızca belirtilen kişinin öz ataması)' }, { status: 400 })
  }
  if (!periodId) {
    return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })
  }

  const access = await resolveOrgCheck(supabase, s, periodId, organizationId)
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status })

  try {
    const items = await fetchSelfEvaluationAssignments(supabase, {
      periodId,
      organizationId: access.organizationId,
      userId,
    })
    return NextResponse.json({
      success: true,
      dry_run: true,
      count: items.length,
      items: items.map((r) => ({
        id: r.id,
        period_id: r.period_id,
        period_name: (r.period as { name?: string } | null)?.name ?? null,
        evaluator_id: r.evaluator_id,
        evaluator_name: (r.evaluator as { name?: string } | null)?.name ?? null,
        status: r.status,
        matrix_context: r.matrix_context ?? null,
      })),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Liste alınamadı'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:remove-self-assignments', String(s.uid || ''), 10, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek', detail: `Lütfen ${rl.retryAfterSec} sn sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const periodId = String(body.period_id || '').trim() || undefined
  const organizationId = String(body.organization_id || '').trim() || undefined
  const userId = String(body.user_id || '').trim() || undefined
  const dryRun = Boolean(body.dry_run)
  const confirm = String(body.confirm || '').trim()
  const confirmNorm = confirm.replace(/\u0130/g, 'I').replace(/\u0131/g, 'i').toLocaleUpperCase('en-US')

  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'user_id gerekli — toplu öz atama silme kapalı; yalnızca seçilen kişi' },
      { status: 400 }
    )
  }
  if (!periodId) {
    return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })
  }

  const access = await resolveOrgCheck(supabase, s, periodId, organizationId)
  if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status })

  if (!dryRun && confirmNorm !== 'SIL') {
    return NextResponse.json(
      {
        success: false,
        error: 'Onay gerekli: confirm alanına SIL veya SİL yazın (dry_run: true ile önizleme yapabilirsiniz)',
      },
      { status: 400 }
    )
  }

  try {
    if (dryRun) {
      const items = await fetchSelfEvaluationAssignments(supabase, {
        periodId,
        organizationId: access.organizationId,
        userId,
      })
      return NextResponse.json({
        success: true,
        dry_run: true,
        user_id: userId,
        count: items.length,
        items: items.map((r) => ({
          id: r.id,
          period_id: r.period_id,
          period_name: (r.period as { name?: string } | null)?.name ?? null,
          evaluator_name: (r.evaluator as { name?: string } | null)?.name ?? null,
          status: r.status,
          matrix_context: r.matrix_context ?? null,
        })),
      })
    }

    const result = await removeSelfEvaluationAssignments(supabase, {
      periodId,
      organizationId: access.organizationId,
      userId,
    })
    return NextResponse.json({ success: true, dry_run: false, ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Silme başarısız'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }
}
