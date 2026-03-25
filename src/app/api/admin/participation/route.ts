import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

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

  const rl = await rateLimitByUser(req, 'admin:participation:post', String(s.uid || ''), 30, 60 * 1000)
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

  type DeptRow = {
    department: string
    total: number
    completed: number
    pending: number
  }

  const byDept = new Map<string, DeptRow>()
  let totals = { total: 0, completed: 0, pending: 0 }

  let from = 0
  while (true) {
    const { data: rows, error } = await supabase
      .from('evaluation_assignments')
      .select(
        `
        id, status,
        target:target_id(department, organization_id)
      `
      )
      .eq('period_id', periodId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) return NextResponse.json({ success: false, error: error.message || 'Atamalar alınamadı' }, { status: 400 })
    const part = (rows || []) as any[]
    for (const a of part) {
      const tOrg = String(a?.target?.organization_id || '')
      if (tOrg && tOrg !== orgId) continue
      const dept = String(a?.target?.department || '').trim() || '(Birim yok)'
      const cur = byDept.get(dept) || { department: dept, total: 0, completed: 0, pending: 0 }
      cur.total += 1
      totals.total += 1
      if (String(a?.status) === 'completed') {
        cur.completed += 1
        totals.completed += 1
      } else {
        cur.pending += 1
        totals.pending += 1
      }
      byDept.set(dept, cur)
    }
    if (part.length < PAGE) break
    from += PAGE
  }

  const departments = Array.from(byDept.values()).sort((a, b) => (b.pending - a.pending) || a.department.localeCompare(b.department))

  return NextResponse.json({
    success: true,
    totals,
    departments,
  })
}

