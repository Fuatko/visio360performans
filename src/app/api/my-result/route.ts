import { NextRequest, NextResponse } from 'next/server'
import { isPgEnabled } from '@/lib/db'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { withActor, type Actor } from '@/lib/server/secure-query'
import { buildActor, getSupabaseAdmin } from '@/lib/server/admin-db'
import { loadOrgEmployeeResultsVisible, loadUserOrgId } from '@/lib/server/employee-result-gate'
import { buildMatrixKarneForPerson } from '@/lib/server/matrix-karne-build'
import { computeSelfPeriodResults } from '@/lib/server/self-period-results'
import { normalizeAssessmentKind } from '@/lib/evaluation-period-kind'
import {
  acknowledgeMyResult,
  coreFromKarneBlock,
  coreFromSelfPeriodResult,
  getMyResult,
  type MyResultCore,
  type MyResultDeps,
  type MyResultPeriod,
} from '@/lib/my-result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 120

type Lang = 'tr' | 'en' | 'fr'
type Session = NonNullable<ReturnType<typeof verifySession>>

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

/**
 * Bağımlılıklar. KİMLİK YALNIZ OTURUMDAN (s.uid): istekteki user_id / gövdedeki
 * kimlik hiçbir yerde okunmaz. Kurum, kişinin kendi kaydından gelir.
 */
function buildDeps(s: Session, lang: Lang): MyResultDeps {
  const uid = String(s.uid)
  let orgCache: Promise<string | null> | null = null
  const loadUserOrg = () => (orgCache ??= loadUserOrgId(uid))
  const actorFor = (orgId: string): Actor => buildActor({ role: s.role, org_id: orgId, uid })
  const pickName = (p: { name?: string | null; name_en?: string | null; name_fr?: string | null }) =>
    String((lang === 'en' ? p.name_en : lang === 'fr' ? p.name_fr : null) || p.name || '')

  return {
    loadUserOrg,
    loadOrgVisible: (orgId) => loadOrgEmployeeResultsVisible(orgId, actorFor(orgId)),
    async loadOrgPeriods(orgId) {
      const r = await withActor(actorFor(orgId), (c) =>
        c.query<{
          id: string
          name: string | null
          name_en: string | null
          name_fr: string | null
          assessment_kind: string | null
          results_released: boolean | null
          created_at: string | Date | null
        }>(
          'select id, name, name_en, name_fr, assessment_kind, results_released, created_at from evaluation_periods where organization_id = $1',
          [orgId]
        )
      )
      return r.rows.map(
        (p): MyResultPeriod => ({
          id: String(p.id),
          name: pickName(p),
          assessmentKind: normalizeAssessmentKind(p.assessment_kind),
          released: p.results_released === true,
          createdAt: p.created_at ? new Date(p.created_at).toISOString() : '',
        })
      )
    },
    async computeCores(orgId, periods) {
      const out = new Map<string, MyResultCore>()
      // İş değerlendirmesi: yönetimin kişi karnesi (MATRIX) hesabı.
      const jobIds = periods.filter((p) => p.assessmentKind === 'job_evaluation').map((p) => p.id)
      if (jobIds.length) {
        const supabase = getSupabaseAdmin()
        if (supabase) {
          try {
            const karne = await buildMatrixKarneForPerson(supabase, {
              personId: uid,
              orgId,
              lang,
              periodIds: jobIds,
              actor: actorFor(orgId),
            })
            for (const g of karne.assessmentGroups) {
              for (const block of g.periods) {
                const core = coreFromKarneBlock(block, uid)
                if (core) out.set(String(block.periodId), core)
              }
            }
          } catch {
            /* sonuç yok sayılır */
          }
        }
      }
      // Kişisel gelişim (ve diğer): çalışanın "Sonuçlarım" ekip puanı hesabı.
      const otherIds = new Set(periods.filter((p) => p.assessmentKind !== 'job_evaluation').map((p) => p.id))
      if (otherIds.size) {
        const computed = await computeSelfPeriodResults(s, lang)
        if (!(computed instanceof NextResponse)) {
          for (const p of computed.results) {
            const pid = String(p?.periodId || '')
            if (!otherIds.has(pid)) continue
            const core = coreFromSelfPeriodResult(p)
            if (core) out.set(pid, core)
          }
        }
      }
      return out
    },
    async loadAck(periodId) {
      const orgId = await loadUserOrg()
      if (!orgId) return null
      const r = await withActor(actorFor(orgId), (c) =>
        c.query<{ acknowledged_at: string | Date | null }>(
          'select acknowledged_at from result_acknowledgements where period_id = $1 and user_id = $2 limit 1',
          [periodId, uid]
        )
      )
      const at = r.rows[0]?.acknowledged_at
      return at ? { acknowledgedAt: new Date(at).toISOString() } : null
    },
    async insertAck({ organizationId, periodId, note }) {
      // İK önceden görüşme kaydı açmış olabilir (acknowledged_at boş) → yalnız o durumda doldurulur.
      // Zaten onaylıysa satır DEĞİŞMEZ ve hiçbir satır dönmez → 409.
      const r = await withActor(actorFor(organizationId), (c) =>
        c.query<{ acknowledged_at: string | Date }>(
          `insert into result_acknowledgements (organization_id, period_id, user_id, acknowledged_at, employee_note)
           values ($1, $2, $3, now(), $4)
           on conflict (period_id, user_id) do update
             set acknowledged_at = excluded.acknowledged_at,
                 employee_note = excluded.employee_note,
                 updated_at = now()
             where result_acknowledgements.acknowledged_at is null
           returning acknowledged_at`,
          [organizationId, periodId, uid, note]
        )
      )
      const at = r.rows[0]?.acknowledged_at
      return at ? { acknowledgedAt: new Date(at).toISOString() } : null
    },
  }
}

function langOf(url: URL): Lang {
  const l = (url.searchParams.get('lang') || 'tr').toLowerCase()
  return l === 'en' || l === 'fr' ? l : 'tr'
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  if (!isPgEnabled()) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })

  const rl = await rateLimitByUser(req, 'my-result:get', String(s.uid), 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })
  }

  const url = new URL(req.url)
  // Yalnız period_id ve lang okunur; user_id vb. parametreler YOK SAYILIR.
  const periodId = (url.searchParams.get('period_id') || '').trim() || null
  try {
    const body = await getMyResult(buildDeps(s, langOf(url)), { periodId })
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch {
    return NextResponse.json({ success: false, error: 'Sonuç alınamadı' }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  if (!isPgEnabled()) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })

  const rl = await rateLimitByUser(req, 'my-result:post', String(s.uid), 10, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })
  }

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>
  // Gövdeden YALNIZ period_id ve note; kimlik oturumdan.
  const url = new URL(req.url)
  try {
    const result = await acknowledgeMyResult(buildDeps(s, langOf(url)), { periodId: raw?.period_id, note: raw?.note })
    return NextResponse.json(result.body, { status: result.status })
  } catch {
    return NextResponse.json({ success: false, error: 'Onay kaydedilemedi' }, { status: 400 })
  }
}
