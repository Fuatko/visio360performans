import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { getIp } from '@/lib/server/rate-limit'
import { hasAcceptedConsent, recordConsent } from '@/lib/server/consent'

export const runtime = 'nodejs'

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

/** GET ?period_id= → { accepted } — istemci gerekirse durum sorgular */
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  const periodId = String(req.nextUrl.searchParams.get('period_id') || '').trim()
  if (!periodId) return NextResponse.json({ success: false, error: 'period_id zorunlu' }, { status: 400 })
  const accepted = await hasAcceptedConsent(String(s.uid), periodId)
  return NextResponse.json({ success: true, accepted })
}

/** POST { period_id } → onayı kaydet */
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { period_id?: string }
  const periodId = String(body.period_id || '').trim()
  if (!periodId) return NextResponse.json({ success: false, error: 'period_id zorunlu' }, { status: 400 })

  const res = await recordConsent(String(s.uid), periodId, getIp(req))
  if (!res.ok) return NextResponse.json({ success: false, error: res.error || 'Onay kaydedilemedi' }, { status: 400 })
  return NextResponse.json({ success: true })
}
