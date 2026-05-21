import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  buildDutyAssignmentPreview,
  buildDutyAssignmentTemplateWorkbook,
  mergeDutyUserAssignments,
  parseDutyAssignmentExcel,
} from '@/lib/duty-assignment-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl.replace(/\/$/, ''), service)
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  return new NextResponse(new Uint8Array(buildDutyAssignmentTemplateWorkbook()), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="gorev_atama_sablonu.xlsx"',
    },
  })
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:period-duty-user-import', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek', detail: `Lütfen ${rl.retryAfterSec} sn sonra deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const form = await req.formData()
  const periodId = String(form.get('period_id') || '').trim()
  const dryRun = String(form.get('dry_run') || 'true') === 'true'
  const file = form.get('file')

  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Excel dosyası (file) gerekli' }, { status: 400 })
  }

  const { data: period, error: periodErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()

  if (periodErr || !period) {
    return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  }
  if (s.role === 'org_admin' && s.org_id && String((period as any).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  const orgId = String((period as any).organization_id || '')

  const [dutiesRes, usersRes, userDutiesRes] = await Promise.all([
    supabase.from('evaluation_duties').select('id, name, code, name_fr').eq('period_id', periodId).eq('is_active', true),
    supabase.from('users').select('id, name, email, title').eq('organization_id', orgId).order('name'),
    supabase
      .from('evaluation_period_user_duties')
      .select('duty_id, user_id')
      .eq('period_id', periodId)
      .eq('is_active', true),
  ])

  const duties = (dutiesRes.data || []) as any[]
  if (!duties.length) {
    return NextResponse.json(
      {
        success: false,
        error: 'Bu dönemde henüz görev tanımı yok. Önce Görev Bazlı Sorular ekranında görevleri oluşturun.',
      },
      { status: 400 }
    )
  }

  const buf = await file.arrayBuffer()
  const parsed = parseDutyAssignmentExcel(buf)
  if (parsed.errors.length && !parsed.rows.length) {
    return NextResponse.json({ success: false, dry_run: true, preview: parsed }, { status: 400 })
  }

  const existingRows = ((userDutiesRes.data || []) as any[]).map((r) => ({
    duty_id: String(r.duty_id),
    user_id: String(r.user_id),
  }))

  const preview = buildDutyAssignmentPreview(
    parsed,
    (usersRes.data || []) as any[],
    duties,
    existingRows
  )

  if (dryRun) {
    return NextResponse.json({
      success: preview.errors.length === 0 || preview.matched.length > 0,
      dry_run: true,
      preview,
    })
  }

  if (!preview.matched.length) {
    return NextResponse.json(
      { success: false, error: 'Uygulanacak yeni atama yok', preview },
      { status: 400 }
    )
  }

  const { rows: merged, added } = mergeDutyUserAssignments(existingRows, preview.matched)

  const { error: delErr } = await supabase.from('evaluation_period_user_duties').delete().eq('period_id', periodId)
  if (delErr) {
    return NextResponse.json({ success: false, error: delErr.message || 'Eski atamalar temizlenemedi' }, { status: 400 })
  }

  const payload = merged.map((r) => ({
    period_id: periodId,
    duty_id: r.duty_id,
    user_id: r.user_id,
    is_active: true,
  }))

  if (payload.length) {
    const { error: insErr } = await supabase.from('evaluation_period_user_duties').insert(payload)
    if (insErr) {
      return NextResponse.json({ success: false, error: insErr.message || 'Atamalar kaydedilemedi' }, { status: 400 })
    }
  }

  return NextResponse.json({
    success: true,
    dry_run: false,
    preview,
    applied: { added, total: payload.length },
  })
}
