import { NextRequest, NextResponse } from 'next/server'
import { isPgEnabled } from '@/lib/db'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'
import { normalizeAssessmentKind } from '@/lib/evaluation-period-kind'
import { evaluatorCountsByTarget, loadPeriod } from '@/lib/server/result-ack-eligibility'
import { computeBenefitServerFacts } from '@/lib/benefit-card'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 120

/**
 * 90 günlük fayda kartı — sunucu tarafı göstergeler (yalnız OKUMA, DDL yok).
 * Yetki: super_admin / org_admin (diğer roller 401). org_admin yalnız kendi kurumu.
 * GET ?period_id=&org_id=(super)&lang= → { success, facts } (hesap: src/lib/benefit-card.ts)
 * "Önceki döneme göre" göstergesi Raporlar sayfasının dönem karşılaştırmasından gelir.
 */

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || !(s.role === 'super_admin' || s.role === 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  if (!isPgEnabled()) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })

  const rl = await rateLimitByUser(req, 'admin:benefit-card:get', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const url = new URL(req.url)
  const periodId = (url.searchParams.get('period_id') || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : (url.searchParams.get('org_id') || '').trim()
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

    const [assignments, counts, acks, tasks, goals] = await Promise.all([
      withActor(actor, (c) =>
        c.query<{ status: string; evaluator_id: string; target_id: string; created_at: string | Date; completed_at: string | Date | null }>(
          'select status, evaluator_id, target_id, created_at, completed_at from evaluation_assignments where period_id = $1',
          [periodId]
        )
      ).then((r) => r.rows),
      evaluatorCountsByTarget(actor, { periodId, orgId, kind, lang }),
      withActor(actor, (c) =>
        c.query<{ user_id: string; acknowledged_at: string | Date | null; meeting_at: string | Date | null }>(
          'select user_id, acknowledged_at, meeting_at from result_acknowledgements where period_id = $1 and organization_id = $2',
          [periodId, orgId]
        )
      ).then((r) => r.rows),
      withActor(actor, (c) =>
        c.query<{ status: string }>(
          `select t.status from action_plan_tasks t
             join action_plans p on p.id = t.plan_id
            where p.period_id = $1 and p.organization_id = $2`,
          [periodId, orgId]
        )
      ).then((r) => r.rows),
      withActor(actor, (c) =>
        c.query<{ user_id: string; status: string; score: number | null; weight: number | null }>(
          'select user_id, status, score, weight from goals where period_id = $1 and organization_id = $2',
          [periodId, orgId]
        )
      ).then((r) => r.rows),
    ])

    const facts = computeBenefitServerFacts({
      assignments,
      evaluatorCountByUser: counts,
      acks: acks.map((a) => ({ ...a, user_id: String(a.user_id) })),
      tasks,
      goals: goals.map((g) => ({ ...g, user_id: String(g.user_id) })),
    })
    return NextResponse.json({ success: true, facts }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Fayda kartı alınamadı' }, { status: 400 })
  }
}
