import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

// Peer kategori ortalaması bu eşiğin altındaysa "yetkinlik açığı" (önerilen eğitim).
// Otomatik atamadaki 4.0 hedef − 0.5 ile ve cron'daki weak-area mantığıyla tutarlı.
const GAP_THRESHOLD = 3.5

function getSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

// GET — Kurumdaki her kişi için yetkinlik açığı (önerilen eğitim) sayısını hesapla.
// Org-geneli TEK batched geçiş (kişi-başı N+1 yok). Ağır olduğu için ayrı/lazy uç.
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  const rl = await rateLimitByUser(req, 'admin:training-center:reco', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : String(new URL(req.url).searchParams.get('org_id') || '').trim()
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  // 1) kurumun kullanıcı id + e-posta'ları
  const { data: users, error: uErr } = await supabase.from('users').select('id,email').eq('organization_id', orgId)
  if (uErr) return NextResponse.json({ success: false, error: uErr.message || 'Kullanıcılar alınamadı' }, { status: 400 })
  const userIds = (users || []).map((u: any) => String(u.id)).filter(Boolean)
  if (userIds.length === 0) return NextResponse.json({ success: true, byUser: {} })
  const emailById = new Map<string, string>()
  for (const u of (users || []) as any[]) emailById.set(String(u.id), String(u.email || '').toLowerCase())

  // 2) tamamlanmış değerlendirme atamaları (peer'ları memory'de ayıklayacağız)
  const { data: assigns, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select('id, evaluator_id, target_id')
    .in('target_id', userIds)
    .eq('status', 'completed')
    .limit(20000)
  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atamalar alınamadı' }, { status: 400 })

  const targetByAssignment = new Map<string, string>()
  for (const a of (assigns || []) as any[]) {
    if (String(a.evaluator_id) === String(a.target_id)) continue // öz değerlendirme hariç
    targetByAssignment.set(String(a.id), String(a.target_id))
  }
  const assignmentIds = Array.from(targetByAssignment.keys())
  if (assignmentIds.length === 0) return NextResponse.json({ success: true, byUser: {} })

  // 3) yanıtları chunk'lı çek (PostgREST .in() URL limiti için) — yalnızca gerekli kolonlar
  // (target_id, category) -> { total, count }
  const catAgg = new Map<string, { total: number; count: number }>()
  const CHUNK = 300
  for (let i = 0; i < assignmentIds.length; i += CHUNK) {
    const chunk = assignmentIds.slice(i, i + CHUNK)
    const { data: responses } = await supabase
      .from('evaluation_responses')
      .select('assignment_id, category_name, reel_score, std_score')
      .in('assignment_id', chunk)
    for (const r of (responses || []) as any[]) {
      const target = targetByAssignment.get(String(r.assignment_id))
      if (!target) continue
      const cat = String(r.category_name || 'Genel').trim() || 'Genel'
      const score = Number(r.reel_score ?? r.std_score ?? 0)
      if (!(score > 0)) continue
      const key = `${target}|${cat}`
      const cur = catAgg.get(key) || { total: 0, count: 0 }
      cur.total += score
      cur.count += 1
      catAgg.set(key, cur)
    }
  }

  // 4) o yetkinliğe zaten atanmış eğitimler (gap_competency) → açıktan düşülecek
  //    (otomatik atamalarda gap_competency kaydedilir; e-posta bazında normalize eşleşme)
  const assignedCompsByEmail = new Map<string, Set<string>>()
  try {
    const { data: taRows } = await supabase
      .from('training_assignments')
      .select('user_email, gap_competency')
      .eq('organization_id', orgId)
      .not('gap_competency', 'is', null)
    for (const t of (taRows || []) as any[]) {
      const em = String(t.user_email || '').toLowerCase()
      const comp = String(t.gap_competency || '').trim().toLowerCase()
      if (!em || !comp) continue
      const set = assignedCompsByEmail.get(em) || new Set<string>()
      set.add(comp)
      assignedCompsByEmail.set(em, set)
    }
  } catch {
    // training_assignments yoksa düşme yapılmaz (açıklar olduğu gibi kalır)
  }

  // 5) kişi başına eşik altı kategoriler − zaten atanmış olanlar
  const byUser: Record<string, { count: number; competencies: string[] }> = {}
  for (const [key, v] of catAgg.entries()) {
    if (v.count === 0) continue
    const avg = v.total / v.count
    if (avg >= GAP_THRESHOLD) continue
    const [target, cat] = key.split('|')
    const email = emailById.get(target) || ''
    const assigned = assignedCompsByEmail.get(email)
    if (assigned && assigned.has(cat.trim().toLowerCase())) continue // bu açığa eğitim zaten atanmış
    const entry = byUser[target] || { count: 0, competencies: [] }
    entry.count += 1
    entry.competencies.push(cat)
    byUser[target] = entry
  }

  return NextResponse.json({ success: true, byUser, threshold: GAP_THRESHOLD })
}
