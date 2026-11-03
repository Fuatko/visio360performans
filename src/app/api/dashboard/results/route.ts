import { NextRequest, NextResponse } from 'next/server'
import { buildActor } from '@/lib/server/admin-db'
import { isAdminRole, verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { computeSelfPeriodResults } from '@/lib/server/self-period-results'
import { loadOrgEmployeeResultsVisible } from '@/lib/server/employee-result-gate'
import { evaluateEmployeeResultVisibility } from '@/lib/employee-result-visibility'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

type PeriodResult = any // keep payload flexible; UI already validates with rendering safeguards

function omitTrimFromPeriodResult(p: PeriodResult): PeriodResult {
  if (!p || typeof p !== 'object') return p
  const cleaned = { ...p }
  delete cleaned.peerAvgTrimmed
  delete cleaned.overallAvgTrimmed
  delete cleaned.score100Trimmed
  delete cleaned.peerAvgTrimmedDuty
  delete cleaned.overallAvgTrimmedDuty
  delete cleaned.score100TrimmedDuty
  if (Array.isArray(cleaned.categoryCompare)) {
    cleaned.categoryCompare = cleaned.categoryCompare.map((c: any) => {
      const { peerTrimmed: _peerTrimmed, ...rest } = c || {}
      return rest
    })
  }
  if (Array.isArray(cleaned.categoryCompareDuty)) {
    cleaned.categoryCompareDuty = cleaned.categoryCompareDuty.map((c: any) => {
      const { peerTrimmed: _peerTrimmed, ...rest } = c || {}
      return rest
    })
  }
  return cleaned
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
    ? results.map((p: any) => ({ ...p, resultsReleased: p.resultsReleased ?? true }))
    : results.map((p: any) => {
        const gate = evaluateEmployeeResultVisibility({
          orgVisible,
          released: Boolean(p.resultsReleased),
          hasResult: true,
          evaluatorCount: Number(p.peerContributorsInAverage || 0),
        })
        if (!gate.visible) {
          // Puan YOK: yalnız dönem ve ilerleme. resultsReleased=false → ekran içerik çizmez;
          // blockedReason hangi sebeple gösterilmediğini söyler.
          return {
            periodId: p.periodId,
            periodName: p.periodName,
            resultsReleased: false,
            blockedReason: gate.reason,
            peerExpectedCount: p.peerExpectedCount ?? 0,
            peerCompletedCount: p.peerCompletedCount ?? 0,
          }
        }
        return omitTrimFromPeriodResult({ ...p, resultsReleased: true })
      })

  return NextResponse.json(
    { success: true, results: finalResults },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}

