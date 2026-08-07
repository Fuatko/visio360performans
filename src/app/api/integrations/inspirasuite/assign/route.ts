import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { sendTransactionalEmail } from '@/lib/server/email'
import { assignCourse, getInspiraConfig, logIntegration, recordAssignment, resolveUserEmail } from '@/lib/server/inspirasuite'

export const runtime = 'nodejs'

function getSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

type AssignBody = {
  user_id?: string
  user_email?: string
  user_name?: string
  course_id?: string
  course_title?: string
  assigned_by?: string
  reason?: string
  due_date?: string
  gap_competency?: string
}

function assignedEmailHtml(input: { name: string; courseTitle: string; reason?: string; dueDate?: string }) {
  const { name, courseTitle, reason, dueDate } = input
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 12px">Yeni bir eğitim atandı</h2>
      <p style="margin:0 0 8px">Merhaba ${name || ''},</p>
      <p style="margin:0 0 12px">Gelişiminiz için size yeni bir eğitim atandı:</p>
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#f8fafc">
        <div style="font-size:16px;font-weight:600">${courseTitle}</div>
        ${reason ? `<div style="margin-top:6px;color:#475569;font-size:14px">Neden: ${reason}</div>` : ''}
        ${dueDate ? `<div style="margin-top:6px;color:#475569;font-size:14px">Son tamamlanma: ${dueDate}</div>` : ''}
      </div>
      <p style="margin:16px 0 0;color:#475569;font-size:13px">Eğitiminize InspiraSuite üzerinden ulaşabilirsiniz.</p>
    </div>`
}

// POST — InspiraSuite'te bir kullanıcıya kurs ata
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'integrations:inspirasuite:assign', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  if (!(await getInspiraConfig()).enabled) {
    return NextResponse.json({ success: false, error: 'InspiraSuite entegrasyonu aktif değil' }, { status: 503 })
  }

  const supabase = getSupabaseAdmin()
  const body = (await req.json().catch(() => ({}))) as AssignBody

  const courseId = String(body.course_id || '').trim()
  const courseTitle = String(body.course_title || '').trim()
  if (!courseId || !courseTitle) {
    return NextResponse.json({ success: false, error: 'course_id ve course_title gerekli' }, { status: 400 })
  }

  // Resolve the target user. Prefer user_id (server-side lookup, KVKK org-scoped);
  // fall back to a directly supplied email.
  let email = String(body.user_email || '').trim()
  let name = String(body.user_name || '').trim()
  let orgId: string | null = s.role === 'org_admin' ? String(s.org_id || '') : null
  const userId = String(body.user_id || '').trim()

  if (userId) {
    if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })
    const resolved = await resolveUserEmail(supabase, userId, orgId)
    if (!resolved) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı veya yetki yok' }, { status: 404 })
    email = resolved.email
    name = name || resolved.name
    orgId = resolved.organization_id
  }

  if (!email) return NextResponse.json({ success: false, error: 'user_id veya user_email gerekli' }, { status: 400 })

  const assignedBy = String(body.assigned_by || '').trim() || 'Visio360PDS'
  const reason = body.reason ? String(body.reason).trim() : undefined
  const dueDate = body.due_date ? String(body.due_date).trim() : undefined
  const gapCompetency = body.gap_competency ? String(body.gap_competency).trim() : null

  try {
    await assignCourse({
      user_email: email,
      course_id: courseId,
      course_title: courseTitle,
      assigned_by: assignedBy,
      reason,
      due_date: dueDate,
    })
  } catch (err) {
    await logIntegration(supabase, {
      direction: 'outbound',
      event_type: 'course_assigned',
      user_email: email,
      organization_id: orgId,
      status: 'error',
      payload: { course_id: courseId, course_title: courseTitle, reason },
      error: err instanceof Error ? err.message : String(err),
    })
    const msg = err instanceof Error ? err.message : 'InspiraSuite atama başarısız'
    // InspiraSuite kullanıcıyı otomatik oluşturmaz: kişi orada kayıtlı değilse net mesaj ver.
    if (msg.includes('user_not_found')) {
      return NextResponse.json(
        { success: false, error: 'Bu kişi InspiraSuite\'te kayıtlı değil. Önce InspiraSuite\'e davet edilmeli.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ success: false, error: msg }, { status: 502 })
  }

  await logIntegration(supabase, {
    direction: 'outbound',
    event_type: 'course_assigned',
    user_email: email,
    organization_id: orgId,
    payload: { course_id: courseId, course_title: courseTitle, reason, due_date: dueDate, assigned_by: assignedBy },
  })

  // Eğitim Merkezi için yerel atama kaydı (best-effort).
  await recordAssignment(supabase, {
    user_email: email,
    course_id: courseId,
    course_title: courseTitle,
    user_id: userId || null,
    user_name: name || null,
    assigned_by: assignedBy,
    reason,
    gap_competency: gapCompetency,
    due_date: dueDate,
    source: 'manual',
    organization_id: orgId,
  })

  // Notify the employee (best-effort).
  let notified = false
  try {
    const sent = await sendTransactionalEmail({
      to: email,
      subject: `Yeni bir eğitim atandı: ${courseTitle}`,
      html: assignedEmailHtml({ name, courseTitle, reason, dueDate }),
    })
    notified = Boolean((sent as any)?.ok)
  } catch {
    // ignore — assignment already succeeded
  }

  return NextResponse.json({ success: true, notified, user_email: email })
}
