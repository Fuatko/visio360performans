import { NextRequest, NextResponse } from 'next/server'
import { buildActor } from '@/lib/server/admin-db'
import { isAdminRole, verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { computeSelfPeriodResults } from '@/lib/server/self-period-results'
import { loadOrgEmployeeResultsVisible } from '@/lib/server/employee-result-gate'
import { buildAdminPeriodResult, buildEmployeePeriodResult } from '@/lib/dashboard-results-payload'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()

  // Heavy report endpoint (user-facing): rate limit by user to avoid corporate NAT false-positives.
  const rl = await rateLimitByUser(req, 'dashboard:results:get', s.uid, 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const computed = await computeSelfPeriodResults(s, lang)
  if (computed instanceof NextResponse) return computed
  const { results, orgId } = computed

  const isAdmin = isAdminRole(s.role)
  // Kurum kademesi (varsayılan KAPALI) + en az 3 değerlendirici: çalışan tarafı her istekte sunucuda.
  const orgVisible = isAdmin
    ? true
    : await loadOrgEmployeeResultsVisible(orgId, buildActor({ role: s.role, org_id: orgId, uid: s.uid }))

  // For non-admin users: hide result content unless org setting + release + ≥3 evaluators all hold.
  const finalResults = isAdmin
    ? results.map((p: any) => buildAdminPeriodResult(p))
    : results.map((p: any) => buildEmployeePeriodResult(p, orgVisible))

  return NextResponse.json(
    { success: true, results: finalResults },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}

