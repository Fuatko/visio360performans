import { NextRequest, NextResponse } from 'next/server'
import { isPgEnabled } from '@/lib/db'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { withActor, type Actor } from '@/lib/server/secure-query'
import { buildActor, getSupabaseAdmin } from '@/lib/server/admin-db'
import { loadOrgEmployeeResultsVisible } from '@/lib/server/employee-result-gate'
import { buildMatrixStructureReport } from '@/lib/server/matrix-structure-report-build'
import { normalizeAssessmentKind } from '@/lib/evaluation-period-kind'
import { evaluateEmployeeResultVisibility } from '@/lib/employee-result-visibility'
import { serializeAckAdminRow, type AckAdminRowInput } from '@/lib/my-result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 120

/**
 * İK — Sonuç onayları. Yetki: super_admin / org_admin (diğer roller 401).
 * GET    ?period_id=&org_id=(super)  → dönem bazında onay durumu listesi
 * POST   { period_id, user_id, meeting_at, meeting_note } → görüşme kaydı
 * DELETE ?period_id=&user_id=        → yanlışlıkla verilen onay kaydını siler
 * employee_note yanıta yalnız serializeAckAdminRow üzerinden (rol kontrollü) girer.
 */

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

type Session = NonNullable<ReturnType<typeof verifySession>>

function adminOnly(s: Session | null): s is Session {
  return !!s && (s.role === 'super_admin' || s.role === 'org_admin')
}

function resolveOrg(s: Session, orgParam: string): string {
  return s.role === 'org_admin' ? String(s.org_id || '') : orgParam
}

async function loadPeriod(actor: Actor, periodId: string) {
  const r = await withActor(actor, (c) =>
    c.query<{ id: string; organization_id: string; results_released: boolean | null; assessment_kind: string | null }>(
      'select id, organization_id, results_released, assessment_kind from evaluation_periods where id = $1 limit 1',
      [periodId]
    )
  )
  return r.rows[0] || null
}

/** Kişi başına (öz hariç) puan vermiş değerlendirici sayısı — çalışan tarafıyla aynı tanım. */
async function evaluatorCountsByTarget(
  actor: Actor,
  input: { periodId: string; orgId: string; kind: string; lang: 'tr' | 'en' | 'fr' }
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (input.kind === 'job_evaluation') {
    // MATRIX: yönetimin dönem raporu (soru puanlayıcılarının tekil sayısı).
    const supabase = getSupabaseAdmin()
    if (!supabase) return out
    try {
      const report = await buildMatrixStructureReport(supabase, {
        periodId: input.periodId,
        orgId: input.orgId,
        lang: input.lang,
        actor,
      })
      for (const person of report.rankings) {
        if (!(Number(person.overallPeerAvg) > 0)) continue
        const ids = new Set<string>()
        for (const q of person.questions || []) {
          for (const sc of q.scorers || []) {
            const id = String(sc?.evaluatorId || '').trim()
            if (id && id !== String(person.targetId)) ids.add(id)
          }
        }
        out.set(String(person.targetId), ids.size)
      }
    } catch {
      /* boş */
    }
    return out
  }
  // 360: tamamlanmış, öz olmayan ve en az bir puanlı cevabı olan atama sayısı.
  const r = await withActor(actor, (c) =>
    c.query<{ target_id: string; n: string | number }>(
      `select a.target_id, count(distinct a.id) as n
         from evaluation_assignments a
        where a.period_id = $1
          and a.status = 'completed'
          and a.evaluator_id is distinct from a.target_id
          and exists (
            select 1 from evaluation_responses r
             where r.assignment_id = a.id and coalesce(r.reel_score, r.std_score, 0) > 0
          )
        group by a.target_id`,
      [input.periodId]
    )
  )
  for (const row of r.rows) out.set(String(row.target_id), Number(row.n) || 0)
  return out
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!adminOnly(s)) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  if (!isPgEnabled()) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })

  const rl = await rateLimitByUser(req, 'admin:result-acks:get', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const url = new URL(req.url)
  const periodId = (url.searchParams.get('period_id') || '').trim()
  const orgId = resolveOrg(s, (url.searchParams.get('org_id') || '').trim())
  const l = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const lang: 'tr' | 'en' | 'fr' = l === 'en' || l === 'fr' ? l : 'tr'
  if (!periodId || !orgId) return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })

  const actor = buildActor({ role: s.role, org_id: orgId, uid: s.uid })
  try {
    const period = await loadPeriod(actor, periodId)
    if (!period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
    if (String(period.organization_id) !== orgId) {
      return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
    }
    const kind = normalizeAssessmentKind(period.assessment_kind)
    const [orgVisible, users, acks, counts] = await Promise.all([
      loadOrgEmployeeResultsVisible(orgId, actor),
      withActor(actor, (c) =>
        c.query<{ id: string; name: string | null; department: string | null }>(
          "select id, name, department from users where organization_id = $1 and status = 'active' order by name",
          [orgId]
        )
      ).then((r) => r.rows),
      withActor(actor, (c) =>
        c.query<{
          user_id: string
          acknowledged_at: string | Date | null
          employee_note: string | null
          meeting_at: string | Date | null
          meeting_note: string | null
        }>(
          'select user_id, acknowledged_at, employee_note, meeting_at, meeting_note from result_acknowledgements where period_id = $1 and organization_id = $2',
          [periodId, orgId]
        )
      ).then((r) => r.rows),
      evaluatorCountsByTarget(actor, { periodId, orgId, kind, lang }),
    ])
    const ackByUser = new Map(acks.map((a) => [String(a.user_id), a]))
    const iso = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString() : null)

    const rows = users.map((u) => {
      const n = counts.get(String(u.id))
      const gate = evaluateEmployeeResultVisibility({
        orgVisible,
        released: period.results_released === true,
        hasResult: n != null,
        evaluatorCount: n ?? 0,
      })
      const a = ackByUser.get(String(u.id))
      const input: AckAdminRowInput = {
        userId: String(u.id),
        name: String(u.name || ''),
        department: String(u.department || ''),
        canSee: gate.visible,
        reason: gate.reason,
        acknowledgedAt: iso(a?.acknowledged_at),
        meetingAt: iso(a?.meeting_at),
        meetingNote: a?.meeting_note ?? null,
        employeeNote: a?.employee_note ?? null,
      }
      return serializeAckAdminRow(input, s.role)
    })

    return NextResponse.json(
      {
        success: true,
        orgVisible,
        periodReleased: period.results_released === true,
        summary: {
          canSee: rows.filter((r) => r.canSee).length,
          acknowledged: rows.filter((r) => r.acknowledgedAt).length,
          meetings: rows.filter((r) => r.meetingAt).length,
          total: rows.length,
        },
        rows,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Liste alınamadı' }, { status: 400 })
  }
}

async function verifyTarget(actor: Actor, orgId: string, periodId: string, userId: string) {
  const period = await loadPeriod(actor, periodId)
  if (!period || String(period.organization_id) !== orgId) return false
  const r = await withActor(actor, (c) =>
    c.query<{ id: string }>('select id from users where id = $1 and organization_id = $2 limit 1', [userId, orgId])
  )
  return r.rows.length > 0
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!adminOnly(s)) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  if (!isPgEnabled()) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })

  const rl = await rateLimitByUser(req, 'admin:result-acks:post', String(s.uid || ''), 60, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const periodId = typeof body.period_id === 'string' ? body.period_id.trim() : ''
  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  const orgId = resolveOrg(s, typeof body.org_id === 'string' ? body.org_id.trim() : '')
  const meetingAtRaw = typeof body.meeting_at === 'string' ? body.meeting_at.trim() : ''
  const meetingAt = meetingAtRaw ? new Date(meetingAtRaw) : null
  const meetingNote = typeof body.meeting_note === 'string' ? body.meeting_note.trim().slice(0, 4000) || null : null
  if (!periodId || !userId || !orgId) return NextResponse.json({ success: false, error: 'period_id, user_id ve org_id gerekli' }, { status: 400 })
  if (meetingAt && Number.isNaN(meetingAt.getTime())) return NextResponse.json({ success: false, error: 'meeting_at geçersiz' }, { status: 400 })

  const actor = buildActor({ role: s.role, org_id: orgId, uid: s.uid })
  try {
    if (!(await verifyTarget(actor, orgId, periodId, userId))) {
      return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
    }
    // Görüşme kaydı; çalışanın onay alanlarına (acknowledged_at, employee_note) DOKUNMAZ.
    await withActor(actor, (c) =>
      c.query(
        `insert into result_acknowledgements (organization_id, period_id, user_id, meeting_at, meeting_note, recorded_by)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (period_id, user_id) do update
           set meeting_at = excluded.meeting_at,
               meeting_note = excluded.meeting_note,
               recorded_by = excluded.recorded_by,
               updated_at = now()`,
        [orgId, periodId, userId, meetingAt ? meetingAt.toISOString() : null, meetingNote, String(s.uid)]
      )
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Kaydedilemedi' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!adminOnly(s)) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  if (!isPgEnabled()) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const periodId = (url.searchParams.get('period_id') || '').trim()
  const userId = (url.searchParams.get('user_id') || '').trim()
  const orgId = resolveOrg(s, (url.searchParams.get('org_id') || '').trim())
  if (!periodId || !userId || !orgId) return NextResponse.json({ success: false, error: 'period_id, user_id ve org_id gerekli' }, { status: 400 })

  const actor = buildActor({ role: s.role, org_id: orgId, uid: s.uid })
  try {
    const r = await withActor(actor, (c) =>
      c.query('delete from result_acknowledgements where period_id = $1 and user_id = $2 and organization_id = $3', [
        periodId,
        userId,
        orgId,
      ])
    )
    return NextResponse.json({ success: true, deleted: r.rowCount })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Silinemedi' }, { status: 400 })
  }
}
