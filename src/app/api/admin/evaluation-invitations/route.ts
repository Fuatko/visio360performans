import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { sendTransactionalEmail } from '@/lib/server/email'

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

function getOrigin(req: NextRequest): string {
  const headerOrigin = req.headers.get('origin')
  if (headerOrigin) return headerOrigin.replace(/\/$/, '')
  try {
    return new URL(req.url).origin
  } catch {
    return ''
  }
}

function isMissingTable(err: any): boolean {
  return err?.code === '42P01' || /evaluation_invitations/i.test(String(err?.message || ''))
}

const MISSING_HINT =
  'Davet takip tablosu bulunamadı. Lütfen sql/evaluation-invitations.sql dosyasını Supabase üzerinde çalıştırın.'

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inviteHtml(opts: { name: string; count: number; periodName: string; loginUrl: string }): string {
  const { name, count, periodName, loginUrl } = opts
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
    <h2 style="color:#111827">Değerlendirme daveti</h2>
    <p>Sayın ${escapeHtml(name)},</p>
    <p><strong>${escapeHtml(periodName)}</strong> döneminde tamamlamanız gereken
    <strong>${count}</strong> değerlendirme bulunuyor.</p>
    <p>Değerlendirmeleri yapmak için sisteme giriş yapın; bekleyen değerlendirmeleriniz
    ana sayfanızda listelenir.</p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(loginUrl)}"
         style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">
        Giriş yap ve değerlendir
      </a>
    </p>
    <p style="color:#6b7280;font-size:12px">Bu e-posta VISIO 360 değerlendirme sistemi tarafından gönderilmiştir.</p>
  </div>`
}

// ---------------------------------------------------------------------------
// GET: ?period_id=  → dönemde ataması olan değerlendirenler + davet durumu
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:eval-invite:get', String(s.uid || ''), 90, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const periodId = String(new URL(req.url).searchParams.get('period_id') || '').trim()
  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  const { data: period } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id, name')
    .eq('id', periodId)
    .maybeSingle()
  if (!period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  const orgId = String((period as any).organization_id || '')
  if (s.role === 'org_admin' && orgId !== String(s.org_id || '')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const { data: assignments, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select('evaluator_id, status')
    .eq('period_id', periodId)
  if (aErr) return NextResponse.json({ success: false, error: aErr.message }, { status: 400 })

  // Değerlendiren başına atama / bekleyen sayıları
  const byEvaluator = new Map<string, { total: number; pending: number }>()
  for (const a of (assignments || []) as Array<{ evaluator_id: string; status: string }>) {
    const key = String(a.evaluator_id)
    const cur = byEvaluator.get(key) || { total: 0, pending: 0 }
    cur.total += 1
    if (a.status !== 'completed') cur.pending += 1
    byEvaluator.set(key, cur)
  }
  const evaluatorIds = Array.from(byEvaluator.keys())
  if (!evaluatorIds.length) return NextResponse.json({ success: true, items: [], period_name: (period as any).name || '' })

  const { data: users } = await supabase
    .from('users')
    .select('id, name, email, title, department')
    .in('id', evaluatorIds)
  const userMap = new Map<string, any>()
  for (const u of (users || []) as any[]) userMap.set(String(u.id), u)

  // Davet durumu (tablo yoksa özellik pasif — hint döndür)
  let inviteMap = new Map<string, { sent_at: string; status: string }>()
  let needsMigration = false
  const invRes = await supabase
    .from('evaluation_invitations')
    .select('evaluator_id, sent_at, status')
    .eq('period_id', periodId)
  if (invRes.error) {
    if (isMissingTable(invRes.error)) needsMigration = true
    else return NextResponse.json({ success: false, error: invRes.error.message }, { status: 400 })
  } else {
    for (const r of (invRes.data || []) as Array<{ evaluator_id: string; sent_at: string; status: string }>) {
      inviteMap.set(String(r.evaluator_id), { sent_at: r.sent_at, status: r.status })
    }
  }

  const items = evaluatorIds
    .map((id) => {
      const u = userMap.get(id) || {}
      const counts = byEvaluator.get(id)!
      const inv = inviteMap.get(id)
      return {
        evaluator_id: id,
        name: u.name || '(isimsiz)',
        email: u.email || '',
        title: u.title || '',
        department: u.department || '',
        pending_count: counts.pending,
        total_count: counts.total,
        invited_at: inv?.sent_at || null,
        invited_status: inv?.status || null,
      }
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'))

  return NextResponse.json({
    success: true,
    items,
    period_name: (period as any).name || '',
    needs_migration: needsMigration,
    ...(needsMigration ? { hint: MISSING_HINT } : {}),
  })
}

// ---------------------------------------------------------------------------
// POST: { period_id, evaluator_ids } → seçilenlere daveti gönder + kaydet
// (E-posta yalnızca burada, admin onayıyla çıkar)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:eval-invite:post', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as { period_id?: string; evaluator_ids?: string[] }
  const periodId = String(body.period_id || '').trim()
  const evaluatorIds = Array.from(new Set((body.evaluator_ids || []).map((x) => String(x).trim()).filter(Boolean)))
  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })
  if (!evaluatorIds.length) return NextResponse.json({ success: false, error: 'En az bir değerlendiren seçin' }, { status: 400 })

  const { data: period } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id, name')
    .eq('id', periodId)
    .maybeSingle()
  if (!period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  const orgId = String((period as any).organization_id || '')
  if (s.role === 'org_admin' && orgId !== String(s.org_id || '')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
  }
  const periodName = String((period as any).name || '')
  const loginUrl = `${getOrigin(req)}/login`

  // Bekleyen atama sayıları
  const { data: assignments } = await supabase
    .from('evaluation_assignments')
    .select('evaluator_id, status')
    .eq('period_id', periodId)
    .in('evaluator_id', evaluatorIds)
  const pendingByEvaluator = new Map<string, number>()
  for (const a of (assignments || []) as Array<{ evaluator_id: string; status: string }>) {
    if (a.status === 'completed') continue
    pendingByEvaluator.set(String(a.evaluator_id), (pendingByEvaluator.get(String(a.evaluator_id)) || 0) + 1)
  }

  const { data: users } = await supabase
    .from('users')
    .select('id, name, email')
    .in('id', evaluatorIds)
  const userMap = new Map<string, any>()
  for (const u of (users || []) as any[]) userMap.set(String(u.id), u)

  const nowIso = new Date().toISOString()
  const results: Array<{ evaluator_id: string; ok: boolean; error?: string }> = []
  let sentCount = 0

  for (const id of evaluatorIds) {
    const u = userMap.get(id)
    const name = u?.name || ''
    const email = String(u?.email || '').trim()
    const count = pendingByEvaluator.get(id) || 0
    if (!email) {
      results.push({ evaluator_id: id, ok: false, error: 'E-posta adresi yok' })
      continue
    }

    const send = await sendTransactionalEmail({
      to: email,
      subject: `Değerlendirme daveti — ${periodName}`,
      html: inviteHtml({ name, count, periodName, loginUrl }),
    })

    const row = {
      period_id: periodId,
      organization_id: orgId || null,
      evaluator_id: id,
      email,
      assignment_count: count,
      status: send.ok ? 'sent' : 'failed',
      provider: (send as any).provider || null,
      sent_by: s.uid ? String(s.uid) : null,
      sent_at: nowIso,
      updated_at: nowIso,
    }
    const up = await supabase.from('evaluation_invitations').upsert(row, { onConflict: 'period_id,evaluator_id' })
    if (up.error && isMissingTable(up.error)) {
      return NextResponse.json({ success: false, error: MISSING_HINT, needs_migration: true }, { status: 400 })
    }

    if (send.ok) {
      sentCount += 1
      results.push({ evaluator_id: id, ok: true })
    } else {
      results.push({ evaluator_id: id, ok: false, error: (send as any).error || 'Gönderilemedi' })
    }
  }

  return NextResponse.json({ success: true, sent: sentCount, total: evaluatorIds.length, results })
}
