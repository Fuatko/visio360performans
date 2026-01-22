import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

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
  org_id?: string
  period_id?: string
  department?: string
  user_id?: string
  status?: string
  limit?: number
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:action-plans:post', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const orgToUse = s.role === 'org_admin' ? String(s.org_id || '') : String(body.org_id || '')
  const periodId = String(body.period_id || '').trim()
  const department = String(body.department || '').trim()
  const userId = String(body.user_id || '').trim()
  const status = String(body.status || '').trim()
  const limit = Math.min(1000, Math.max(1, Number(body.limit || 300)))

  if (!orgToUse) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  // Best-effort: if table missing, return actionable error
  const q = supabase
    .from('action_plans')
    .select(
      `
      id, organization_id, period_id, user_id, department, source, title, status,
      created_at, updated_at, started_at, due_at, completed_at,
      reminder_first_sent_at, reminder_last_sent_at,
      user:users(id,name,email,department),
      period:evaluation_periods(id,name,name_en,name_fr),
      tasks:action_plan_tasks(id,sort_order,area,status,planned_at,learning_started_at,baseline_score,target_score)
    `
    )
    .eq('organization_id', orgToUse)
    .eq('source', 'development')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (periodId) q.eq('period_id', periodId)
  if (userId) q.eq('user_id', userId)
  if (status) q.eq('status', status)
  if (department) q.eq('department', department)

  const { data, error } = await q
  if (error) {
    const msg = String((error as any)?.message || '')
    if (msg.includes('action_plans') && msg.toLowerCase().includes('relation')) {
      return NextResponse.json(
        { success: false, error: 'action_plans tablosu yok. Supabase’te sql/action-plans.sql çalıştırın.' },
        { status: 400 }
      )
    }
    return NextResponse.json({ success: false, error: (error as any)?.message || 'Veri alınamadı' }, { status: 400 })
  }

  return NextResponse.json({ success: true, plans: data || [] })
}

export async function PATCH(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as any
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  // Load plan to enforce KVKK org scoping
  const { data: plan, error: pErr } = await supabase.from('action_plans').select('id,organization_id').eq('id', id).maybeSingle()
  if (pErr || !plan) return NextResponse.json({ success: false, error: 'Plan bulunamadı' }, { status: 404 })

  if (s.role === 'org_admin' && String((plan as any).organization_id) !== String(s.org_id || '')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const patch: any = { updated_at: new Date().toISOString() }
  if (typeof body.status === 'string' && body.status.trim()) patch.status = body.status.trim()
  if (typeof body.due_at === 'string' && body.due_at.trim()) patch.due_at = body.due_at.trim()

  const { error: uErr } = await supabase.from('action_plans').update(patch).eq('id', id)
  if (uErr) return NextResponse.json({ success: false, error: (uErr as any)?.message || 'Güncelleme hatası' }, { status: 400 })

  return NextResponse.json({ success: true })
}

