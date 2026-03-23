import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

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

const IN_CHUNK = 120

/**
 * Tamamlanmış ama hiç evaluation_responses satırı olmayan atamaları pending yapar
 * (tüm sorularda yalnızca «Bilgim yok» ile kapanan eski kayıtlar için).
 */
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:assignments:reopen-empty:post', String(s.uid || ''), 10, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as { period_id?: string; organization_id?: string }
  const periodId = String(body.period_id || '').trim()
  const orgIdParam = String(body.organization_id || '').trim()
  const orgToUse = s.role === 'org_admin' ? String(s.org_id || '') : orgIdParam

  if (!periodId || !orgToUse) {
    return NextResponse.json({ success: false, error: 'period_id ve organization_id gerekli' }, { status: 400 })
  }

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) {
    return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  }
  if (String((period as any).organization_id || '') !== String(orgToUse)) {
    return NextResponse.json({ success: false, error: 'Dönem/kurum uyuşmuyor' }, { status: 403 })
  }

  const { data: completedRows, error: cErr } = await supabase
    .from('evaluation_assignments')
    .select('id')
    .eq('period_id', periodId)
    .eq('status', 'completed')

  if (cErr) {
    return NextResponse.json({ success: false, error: cErr.message || 'Atamalar alınamadı' }, { status: 400 })
  }

  const completedIds = (completedRows || []).map((r: any) => String(r.id)).filter(Boolean)
  if (!completedIds.length) {
    return NextResponse.json({ success: true, reopened: 0, message: 'Tamamlanmış atama yok' })
  }

  const withResponse = new Set<string>()
  for (let off = 0; off < completedIds.length; off += IN_CHUNK) {
    const chunk = completedIds.slice(off, off + IN_CHUNK)
    const { data: respPart, error: rErr } = await supabase
      .from('evaluation_responses')
      .select('assignment_id')
      .in('assignment_id', chunk)

    if (rErr) {
      return NextResponse.json(
        { success: false, error: rErr.message || 'Yanıtlar sorgulanamadı', detail: String((rErr as any)?.code || '') },
        { status: 400 }
      )
    }
    ;(respPart || []).forEach((row: any) => {
      const aid = String(row?.assignment_id || '')
      if (aid) withResponse.add(aid)
    })
  }

  const toReopen = completedIds.filter((id) => !withResponse.has(id))
  if (!toReopen.length) {
    return NextResponse.json({ success: true, reopened: 0, message: 'Yanıtsız tamamlanmış atama yok' })
  }

  // Temizlik: bu atamalara ait olası uluslararası standart skorları (edge case; tablo yoksa sessiz geç)
  for (let off = 0; off < toReopen.length; off += IN_CHUNK) {
    const chunk = toReopen.slice(off, off + IN_CHUNK)
    await supabase.from('international_standard_scores').delete().in('assignment_id', chunk)
  }

  for (let off = 0; off < toReopen.length; off += IN_CHUNK) {
    const chunk = toReopen.slice(off, off + IN_CHUNK)
    const { error: uErr } = await supabase
      .from('evaluation_assignments')
      .update({ status: 'pending', completed_at: null })
      .in('id', chunk)

    if (uErr) {
      return NextResponse.json({ success: false, error: uErr.message || 'Güncelleme başarısız' }, { status: 400 })
    }
  }

  return NextResponse.json({ success: true, reopened: toReopen.length })
}
