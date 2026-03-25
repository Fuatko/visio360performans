import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

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
}

const PAGE = 1000

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:coverage:post', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const periodId = String(body.period_id || '').trim()
  const orgIdParam = String(body.org_id || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : orgIdParam

  if (!periodId || !orgId) {
    return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })
  }

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (String((period as any).organization_id || '') !== orgId) {
    return NextResponse.json({ success: false, error: 'Dönem/kurum uyuşmuyor' }, { status: 403 })
  }

  type Row = {
    targetId: string
    targetName: string
    targetDept: string
    completedTotal: number
    pendingTotal: number
    selfCompleted: number
    managerCompleted: number
    peerCompleted: number
    subordinateCompleted: number
    executiveCompleted: number
  }

  const byTarget = new Map<string, Row>()

  let from = 0
  while (true) {
    const { data: rows, error } = await supabase
      .from('evaluation_assignments')
      .select(
        `
        id, status,
        evaluator:evaluator_id(id, position_level),
        target:target_id(id, name, department, organization_id)
      `
      )
      .eq('period_id', periodId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) return NextResponse.json({ success: false, error: error.message || 'Atamalar alınamadı' }, { status: 400 })
    const part = (rows || []) as any[]
    for (const a of part) {
      const t = a?.target
      const tOrg = String(t?.organization_id || '')
      if (tOrg && tOrg !== orgId) continue
      const tid = String(t?.id || '').trim()
      if (!tid) continue
      const cur =
        byTarget.get(tid) || {
          targetId: tid,
          targetName: String(t?.name || '-'),
          targetDept: String(t?.department || '-'),
          completedTotal: 0,
          pendingTotal: 0,
          selfCompleted: 0,
          managerCompleted: 0,
          peerCompleted: 0,
          subordinateCompleted: 0,
          executiveCompleted: 0,
        }
      const status = String(a?.status || '')
      if (status === 'completed') cur.completedTotal += 1
      else cur.pendingTotal += 1

      if (status === 'completed') {
        const evalId = String(a?.evaluator?.id || a?.evaluator_id || '')
        const isSelf = userIdsEqualForSelfEval(evalId, tid)
        const lvl = isSelf ? 'self' : String(a?.evaluator?.position_level || 'peer')
        if (lvl === 'self') cur.selfCompleted += 1
        else if (lvl === 'manager') cur.managerCompleted += 1
        else if (lvl === 'subordinate') cur.subordinateCompleted += 1
        else if (lvl === 'executive') cur.executiveCompleted += 1
        else cur.peerCompleted += 1
      }
      byTarget.set(tid, cur)
    }
    if (part.length < PAGE) break
    from += PAGE
  }

  const rows = Array.from(byTarget.values()).sort((a, b) => (b.pendingTotal - a.pendingTotal) || a.targetName.localeCompare(b.targetName))

  return NextResponse.json({ success: true, rows })
}

