import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { isPgEnabled } from '@/lib/db'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'
import { CONSENT_VERSION } from '@/lib/consent-content'

export const runtime = 'nodejs'

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

function guard(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) return null
  return s
}

/** GET → dönem listesi (seçici için) */
export async function GET(req: NextRequest) {
  const s = guard(req)
  if (!s) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  if (!isPgEnabled()) return NextResponse.json({ success: true, periods: [] })
  try {
    const rows = await withActor(buildActor(s), (c) =>
      c.query<{ id: string; name: string; status: string | null }>(
        'select id, name, status from evaluation_periods order by created_at desc nulls last, name'
      )
    ).then((r) => r.rows)
    return NextResponse.json({ success: true, periods: rows })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error)?.message || 'Dönemler alınamadı' }, { status: 400 })
  }
}

/** POST { period_id } → kim onayladı / kim onaylamadı raporu */
export async function POST(req: NextRequest) {
  const s = guard(req)
  if (!s) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { period_id?: string }
  const periodId = String(body.period_id || '').trim()
  if (!periodId) return NextResponse.json({ success: false, error: 'period_id zorunlu' }, { status: 400 })
  if (!isPgEnabled()) return NextResponse.json({ success: true, version: CONSENT_VERSION, rows: [] })

  try {
    const rows = await withActor(buildActor(s), (c) =>
      c.query<{
        user_id: string
        name: string | null
        email: string | null
        department: string | null
        accepted_at: string | null
        ip_address: string | null
        text_version: string | null
      }>(
        `select u.id as user_id, u.name, u.email, u.department,
                c.accepted_at, c.ip_address, c.text_version
           from (select distinct evaluator_id from evaluation_assignments where period_id = $1) a
           join users u on u.id = a.evaluator_id
           left join evaluation_consents c on c.period_id = $1 and c.user_id = u.id
          order by (c.accepted_at is null) asc, u.name asc`,
        [periodId]
      )
    ).then((r) => r.rows)

    const result = rows.map((r) => ({
      user_id: r.user_id,
      name: r.name || '',
      email: r.email || '',
      department: r.department || '',
      accepted: !!r.accepted_at && String(r.text_version || '') === CONSENT_VERSION,
      accepted_at: r.accepted_at,
      ip_address: r.ip_address,
      text_version: r.text_version,
      // Eski sürümde onay var ama metin güncellenmiş → yeniden onay bekliyor
      stale: !!r.accepted_at && String(r.text_version || '') !== CONSENT_VERSION,
    }))

    const acceptedCount = result.filter((r) => r.accepted).length
    return NextResponse.json({
      success: true,
      version: CONSENT_VERSION,
      total: result.length,
      accepted: acceptedCount,
      pending: result.length - acceptedCount,
      rows: result,
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error)?.message || 'Rapor alınamadı' }, { status: 400 })
  }
}
