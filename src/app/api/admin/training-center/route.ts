import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { syncTrainingProgress } from '@/lib/server/inspirasuite'

export const runtime = 'nodejs'

function getSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

function resolveOrg(req: NextRequest, s: { role: string; org_id?: string | null }) {
  if (s.role === 'org_admin') return String(s.org_id || '')
  return String(new URL(req.url).searchParams.get('org_id') || '').trim()
}

// GET — Eğitim Merkezi: kurumun kullanıcıları + atama özeti (yerel training_assignments'tan, N+1'siz)
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  const rl = await rateLimitByUser(req, 'admin:training-center:get', String(s.uid || ''), 60, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const orgId = resolveOrg(req, s)
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  const [{ data: users, error: uErr }, { data: assigns }] = await Promise.all([
    supabase.from('users').select('id,name,email,department,title').eq('organization_id', orgId).order('name'),
    supabase
      .from('training_assignments')
      .select('user_email,user_name,course_title,progress_cache,status_cache,synced_at,due_date,gap_competency')
      .eq('organization_id', orgId),
  ])
  if (uErr) return NextResponse.json({ success: false, error: uErr.message || 'Kullanıcılar alınamadı' }, { status: 400 })

  // e-posta bazında atama özeti
  const byEmail = new Map<string, { count: number; sum: number; completed: number; inProgress: number; notStarted: number; lastSync: string | null }>()
  for (const a of (assigns || []) as any[]) {
    const em = String(a.user_email || '').toLowerCase()
    if (!em) continue
    const cur = byEmail.get(em) || { count: 0, sum: 0, completed: 0, inProgress: 0, notStarted: 0, lastSync: null }
    cur.count += 1
    cur.sum += Number(a.progress_cache) || 0
    const st = String(a.status_cache || 'assigned')
    if (st === 'completed') cur.completed += 1
    else if (st === 'in_progress') cur.inProgress += 1
    else cur.notStarted += 1
    if (a.synced_at && (!cur.lastSync || a.synced_at > cur.lastSync)) cur.lastSync = a.synced_at
    byEmail.set(em, cur)
  }

  const rows = (users || []).map((u: any) => {
    const em = String(u.email || '').toLowerCase()
    const g = byEmail.get(em)
    const count = g?.count || 0
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      department: u.department || null,
      title: u.title || null,
      assigned: count,
      avgProgress: count ? Math.round(g!.sum / count) : 0,
      completed: g?.completed || 0,
      inProgress: g?.inProgress || 0,
      notStarted: g?.notStarted || 0,
      lastSync: g?.lastSync || null,
    }
  })

  const totals = {
    people: rows.length,
    peopleWithTraining: rows.filter((r) => r.assigned > 0).length,
    totalAssigned: (assigns || []).length,
    completed: rows.reduce((a, r) => a + r.completed, 0),
  }

  // --- Genel Bakış toplulaştırmaları (ekstra DB sorgusu yok) ---
  const deptByEmail = new Map<string, string>()
  for (const u of (users || []) as any[]) deptByEmail.set(String(u.email || '').toLowerCase(), u.department || 'Belirtilmemiş')

  const deptAgg = new Map<string, { assigned: number; completed: number; sum: number }>()
  const gapAgg = new Map<string, number>()
  const overdueList: Array<{ name: string; course_title: string; due_date: string }> = []
  const todayStr = new Date().toISOString().slice(0, 10)

  for (const a of (assigns || []) as any[]) {
    const em = String(a.user_email || '').toLowerCase()
    const dep = deptByEmail.get(em) || 'Belirtilmemiş'
    const st = String(a.status_cache || 'assigned')
    const d = deptAgg.get(dep) || { assigned: 0, completed: 0, sum: 0 }
    d.assigned += 1
    d.sum += Number(a.progress_cache) || 0
    if (st === 'completed') d.completed += 1
    deptAgg.set(dep, d)

    if (a.gap_competency) gapAgg.set(a.gap_competency, (gapAgg.get(a.gap_competency) || 0) + 1)

    if (a.due_date && st !== 'completed' && String(a.due_date) < todayStr) {
      overdueList.push({ name: a.user_name || em, course_title: a.course_title || 'Eğitim', due_date: String(a.due_date) })
    }
  }

  const byDepartment = Array.from(deptAgg.entries())
    .map(([department, v]) => ({
      department,
      assigned: v.assigned,
      completed: v.completed,
      completionRate: v.assigned ? Math.round((v.completed / v.assigned) * 100) : 0,
      avgProgress: v.assigned ? Math.round(v.sum / v.assigned) : 0,
    }))
    .sort((a, b) => b.assigned - a.assigned)

  const topGaps = Array.from(gapAgg.entries())
    .map(([competency, count]) => ({ competency, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const overview = {
    byDepartment,
    topGaps,
    overdueCount: overdueList.length,
    overdueList: overdueList.sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 10),
  }

  return NextResponse.json({ success: true, rows, totals, overview })
}

// POST — InspiraSuite'ten toplu ilerleme senkronu (Yenile butonu)
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  const rl = await rateLimitByUser(req, 'admin:training-center:sync', String(s.uid || ''), 12, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const orgId = resolveOrg(req, s)
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  try {
    const updated = await syncTrainingProgress(supabase, orgId)
    return NextResponse.json({ success: true, updated })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Senkron başarısız' },
      { status: 502 }
    )
  }
}
