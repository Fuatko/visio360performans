import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { isCompensationEnabled } from '@/lib/feature-flags'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

type Scope = 'org' | 'department' | 'manager'

type Row = {
  targetId: string
  targetName: string
  targetDept: string
  overallAvg: number
  evaluatorCount: number
  recommendedPct: number
  rationale: string
  actionPlan: string[]
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export async function GET(req: NextRequest) {
  if (!isCompensationEnabled()) {
    return NextResponse.json({ success: false, error: 'Not Found' }, { status: 404 })
  }

  const url = new URL(req.url)
  const debug = url.searchParams.get('debug') === '1'
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const msg = (tr: string, en: string, fr: string) => (lang === 'fr' ? fr : lang === 'en' ? en : tr)
  let step = 'start'

  try {
    const s = sessionFromReq(req)
    if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
      return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 401 })
    }

    step = 'rate_limit'
    const rl = await rateLimitByUser(req, 'admin:comp:recommend:get', String(s.uid || ''), 20, 60 * 1000)
    if (rl.blocked) {
      return NextResponse.json(
        {
          success: false,
          error: msg('Çok fazla istek yapıldı', 'Too many requests', 'Trop de requêtes'),
          detail: msg(
            `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.`,
            `Please try again in ${rl.retryAfterSec} seconds.`,
            `Veuillez réessayer dans ${rl.retryAfterSec} secondes.`
          ),
        },
        { status: 429, headers: rl.headers }
      )
    }

    step = 'supabase_client'
    const supabase = getSupabaseAdmin()
    if (!supabase)
      return NextResponse.json(
        { success: false, error: msg('Supabase yapılandırması eksik', 'Supabase configuration missing', 'Configuration Supabase manquante') },
        { status: 503 }
      )

    step = 'params'
    const periodId = (url.searchParams.get('period_id') || '').trim()
    const orgIdParam = (url.searchParams.get('org_id') || '').trim()
    const orgToUse = s.role === 'org_admin' ? String(s.org_id || '') : orgIdParam

    const scope = ((url.searchParams.get('scope') || 'org').trim() as Scope) || 'org'
    const minPct = clamp(Number(url.searchParams.get('min') || 20), 0, 200)
    const maxPct = clamp(Number(url.searchParams.get('max') || 30), 0, 200)

    if (!periodId || !orgToUse) {
      return NextResponse.json({ success: false, error: msg('period_id ve org_id gerekli', 'period_id and org_id required', 'period_id et org_id requis') }, { status: 400 })
    }
    if (maxPct < minPct) {
      return NextResponse.json({ success: false, error: msg('Max, Min değerinden küçük olamaz', 'Max cannot be smaller than Min', 'Le max ne peut pas être inférieur au min') }, { status: 400 })
    }

    step = 'period_check'
    const { data: period, error: pErr } = await supabase
      .from('evaluation_periods')
      .select('id, organization_id')
      .eq('id', periodId)
      .maybeSingle()
    if (pErr || !period) {
      return NextResponse.json(
        { success: false, error: msg('Dönem bulunamadı', 'Period not found', 'Période introuvable'), detail: debug ? String(pErr?.message || pErr || '') : undefined },
        { status: 400 }
      )
    }
    if (String((period as any).organization_id || '') !== String(orgToUse || '')) {
      return NextResponse.json(
        { success: false, error: msg('Dönem/kurum uyuşmuyor', 'Period / org mismatch', "Période / organisation incompatible"), detail: debug ? `period.org=${String((period as any).organization_id || '')}` : undefined },
        { status: 400 }
      )
    }

    // manager scope requires users.manager_id in DB (see sql/compensation-manager-scope.sql)

    // Prefer org snapshot scoring settings for confidence threshold; fall back to org/default.
    step = 'confidence'
    let confidenceMinHigh = 5
    const pScoring = await supabase
      .from('evaluation_period_scoring_settings')
      .select('min_high_confidence_evaluator_count')
      .eq('period_id', periodId)
      .maybeSingle()
    if (!pScoring.error && pScoring.data) {
      confidenceMinHigh = Number((pScoring.data as any).min_high_confidence_evaluator_count ?? 5) || 5
    } else {
      const conf = await supabase
        .from('confidence_settings')
        .select('min_high_confidence_evaluator_count')
        .eq('organization_id', orgToUse)
        .maybeSingle()
      if (!conf.error && conf.data) confidenceMinHigh = Number((conf.data as any).min_high_confidence_evaluator_count ?? 5) || 5
    }

    step = 'assignments'
    const { data: assignments, error: aErr } = await supabase
      .from('evaluation_assignments')
      .select('id, evaluator_id, target_id, status, period_id')
      .eq('period_id', periodId)
      .eq('status', 'completed')

    if (aErr) {
      return NextResponse.json(
        {
          success: false,
          error: aErr.message || msg('Atamalar alınamadı', 'Failed to load assignments', 'Impossible de charger les attributions'),
          detail: debug ? `step=${step} code=${String((aErr as any)?.code || '')}` : undefined,
        },
        { status: 400 }
      )
    }

    const filteredAssignments = (assignments || []) as Array<{ id: string; evaluator_id: string; target_id: string }>
    if (!filteredAssignments.length) {
      return NextResponse.json({ success: true, rows: [] as Row[] })
    }

    // Load user attributes without PostgREST joins (reduces 400s when users schema differs).
    step = 'users'
    const userIds = Array.from(
      new Set(
        filteredAssignments
          .flatMap((a) => [a.evaluator_id, a.target_id])
          .map((x) => String(x || '').trim())
          .filter(Boolean)
      )
    )

    type UserRow = { id: string; name?: string | null; department?: string | null; manager_id?: string | null }
    let users: UserRow[] = []

    const desiredCols = (() => {
      const cols = ['id', 'name']
      if (scope === 'department') cols.push('department')
      if (scope === 'manager') cols.push('manager_id')
      return cols.join(', ')
    })()

    if (userIds.length) {
      const first = await supabase.from('users').select(desiredCols).in('id', userIds)
      if (!first.error) {
        users = ((first.data || []) as unknown) as UserRow[]
      } else {
        // Fallback: deployments may not have department/manager_id columns.
        const m = String(first.error.message || '').toLowerCase()
        if ((scope === 'department' && m.includes('department')) || (scope === 'manager' && (m.includes('manager_id') || m.includes('manager')))) {
          const fallback = await supabase.from('users').select('id, name').in('id', userIds)
          if (fallback.error) {
            return NextResponse.json(
              {
                success: false,
                error: fallback.error.message || msg('Kullanıcılar alınamadı', 'Failed to load users', 'Impossible de charger les utilisateurs'),
                detail: debug ? `step=${step} code=${String((fallback.error as any)?.code || '')}` : undefined,
              },
              { status: 400 }
            )
          }
          users = ((fallback.data || []) as unknown) as UserRow[]
        } else {
          return NextResponse.json(
            {
              success: false,
              error: first.error.message || msg('Kullanıcılar alınamadı', 'Failed to load users', 'Impossible de charger les utilisateurs'),
              detail: debug ? `step=${step} code=${String((first.error as any)?.code || '')}` : undefined,
            },
            { status: 400 }
          )
        }
      }
    }

    const nameById = new Map(users.map((u) => [String(u.id), String(u.name || '')]))
    const deptById = new Map(users.map((u) => [String(u.id), String(u.department || '')]))
    const managerById = new Map(users.map((u) => [String(u.id), String(u.manager_id || '')]))

    const assignmentIds = filteredAssignments.map((a) => a.id)
    step = 'responses'
    // PostgREST GET + çok uzun `.in(...)` listesi URL sınırına takılabilir (400 Bad Request, boş code).
    const RESPONSES_IN_CHUNK = 100
    const responses: any[] = []
    for (let off = 0; off < assignmentIds.length; off += RESPONSES_IN_CHUNK) {
      const chunk = assignmentIds.slice(off, off + RESPONSES_IN_CHUNK)
      const { data: part, error: rErr } = await supabase
        .from('evaluation_responses')
        .select('assignment_id, category_name, reel_score, std_score')
        .in('assignment_id', chunk)

      if (rErr) {
        const anyErr = rErr as any
        const hint = [anyErr?.hint, anyErr?.details].filter(Boolean).join(' ')
        return NextResponse.json(
          {
            success: false,
            error:
              rErr.message ||
              msg('Yanıtlar alınamadı', 'Failed to load responses', 'Impossible de charger les réponses'),
            detail: debug
              ? `step=${step} code=${String(anyErr?.code || '')} chunk=${off}-${off + chunk.length}${hint ? ` ${hint}` : ''}`
              : hint || undefined,
          },
          { status: 400 }
        )
      }
      responses.push(...(part || []))
    }

  // Aggregate: per target overall + per-category averages + evaluator count
  type Agg = {
    targetId: string
    targetName: string
    targetDept: string
    targetManagerId: string
    sum: number
    count: number
    evaluatorSet: Set<string>
    cat: Record<string, { sum: number; count: number }>
  }
  const byTarget = new Map<string, Agg>()

  const respByAssignment = new Map<string, Array<any>>()
  ;(responses || []).forEach((r: any) => {
    const aid = String(r.assignment_id || '')
    if (!aid) return
    if (!respByAssignment.has(aid)) respByAssignment.set(aid, [])
    respByAssignment.get(aid)!.push(r)
  })

  filteredAssignments.forEach((a) => {
    const tid = String(a.target_id || '')
    if (!tid) return
    if (!byTarget.has(tid)) {
      byTarget.set(tid, {
        targetId: tid,
        targetName: nameById.get(tid) || '-',
        targetDept: deptById.get(tid) || '-',
        targetManagerId: managerById.get(tid) || '',
        sum: 0,
        count: 0,
        evaluatorSet: new Set<string>(),
        cat: {},
      })
    }
    const agg = byTarget.get(tid)!
    const eid = String(a.evaluator_id || '')
    if (eid) agg.evaluatorSet.add(eid)

    const rs = respByAssignment.get(String(a.id)) || []
    rs.forEach((r: any) => {
      const score = Number(r.reel_score ?? r.std_score ?? 0) || 0
      if (score <= 0) return
      agg.sum += score
      agg.count += 1
      const cat = String(r.category_name || msg('Genel', 'General', 'Général'))
      if (!agg.cat[cat]) agg.cat[cat] = { sum: 0, count: 0 }
      agg.cat[cat].sum += score
      agg.cat[cat].count += 1
    })
  })

  const baseRows = Array.from(byTarget.values()).map((a) => {
    const overall = a.count ? Math.round((a.sum / a.count) * 10) / 10 : 0
    const evaluatorCount = a.evaluatorSet.size
    const cats = Object.entries(a.cat)
      .map(([name, v]) => ({ name, avg: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0 }))
      .sort((x, y) => x.avg - y.avg)
    const weakest = cats.slice(0, 2).filter((c) => c.name && c.avg > 0)

    return { ...a, overallAvg: overall, evaluatorCount, weakest }
  })

  // Pool normalization
  const poolKey = (r: { targetDept: string; targetManagerId?: string | null }) => {
    if (scope === 'department') return String(r.targetDept || '-')
    if (scope === 'manager') return String(r.targetManagerId || '')
    return 'org'
  }
  const poolStats = new Map<string, { min: number; max: number }>()
  baseRows.forEach((r) => {
    const k = poolKey(r)
    if (scope === 'manager' && !k) return
    const cur = poolStats.get(k) || { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
    cur.min = Math.min(cur.min, r.overallAvg || 0)
    cur.max = Math.max(cur.max, r.overallAvg || 0)
    poolStats.set(k, cur)
  })

  const rows: Row[] = baseRows
    .filter((r) => (r.overallAvg || 0) > 0)
    .filter((r) => (scope === 'manager' ? Boolean(poolKey(r)) : true))
    .map((r) => {
      const k = poolKey(r)
      const st = poolStats.get(k) || { min: 0, max: 0 }
      const denom = st.max - st.min
      const perfNorm = denom > 0 ? (r.overallAvg - st.min) / denom : 0.5
      const conf = clamp(r.evaluatorCount / Math.max(1, confidenceMinHigh), 0, 1)

      // Confidence reduces volatility (low confidence -> closer to mid band)
      const score = clamp(0.5 + (perfNorm - 0.5) * (0.6 + 0.4 * conf), 0, 1)
      const pctRaw = minPct + (maxPct - minPct) * score
      const pct = Math.round(pctRaw * 10) / 10

      const rationale = msg(
        `Genel skor: ${r.overallAvg} / 5 • Değerlendirici: ${r.evaluatorCount} • Güven: ${(conf * 100).toFixed(0)}% • Havuz: ${scope === 'department' ? 'Departman' : 'Kurum'}`,
        `Overall: ${r.overallAvg} / 5 • Evaluators: ${r.evaluatorCount} • Confidence: ${(conf * 100).toFixed(0)}% • Pool: ${scope === 'department' ? 'Department' : 'Organization'}`,
        `Global : ${r.overallAvg} / 5 • Évaluateurs : ${r.evaluatorCount} • Confiance : ${(conf * 100).toFixed(0)}% • Pool : ${scope === 'department' ? 'Département' : 'Organisation'}`
      )

      const actionPlan: string[] = []
      if (r.weakest.length) {
        r.weakest.forEach((w: any) => {
          actionPlan.push(
            msg(
              `${w.name} alanında gelişim: hedef ${w.avg.toFixed(1)} → ${(Math.min(5, w.avg + 1)).toFixed(1)} (3 ay)`,
              `Development in ${w.name}: target ${w.avg.toFixed(1)} → ${(Math.min(5, w.avg + 1)).toFixed(1)} (3 months)`,
              `Progrès sur ${w.name} : objectif ${w.avg.toFixed(1)} → ${(Math.min(5, w.avg + 1)).toFixed(1)} (3 mois)`
            )
          )
        })
      } else {
        actionPlan.push(
          msg(
            'Gelişim alanı: veri yetersiz (kategori kırılımı bulunamadı).',
            'Development area: insufficient data (no category breakdown).',
            'Axe de progrès : données insuffisantes (pas de ventilation par catégorie).'
          )
        )
      }

      return {
        targetId: r.targetId,
        targetName: r.targetName,
        targetDept: r.targetDept,
        overallAvg: r.overallAvg,
        evaluatorCount: r.evaluatorCount,
        recommendedPct: pct,
        rationale,
        actionPlan,
      }
    })
    .sort((a, b) => b.recommendedPct - a.recommendedPct)

  if (scope === 'manager') {
    const missing = baseRows.filter((r) => (r.overallAvg || 0) > 0).filter((r: any) => !String(r.targetManagerId || '')).length
    if (missing === rows.length && missing > 0) {
      return NextResponse.json(
        {
          success: false,
          error: msg(
            'Yönetici bazlı havuz için önce kullanıcıların yöneticilerini tanımlayın (users.manager_id).',
            'For manager-based pooling, assign managers to users first (users.manager_id).',
            'Pour le pool par manager, assignez d’abord un manager aux utilisateurs (users.manager_id).'
          ),
        },
        { status: 400 }
      )
    }
  }

    return NextResponse.json({ success: true, rows })
  } catch (e: any) {
    const errMsg = String(e?.message ?? e ?? '')
    return NextResponse.json(
      {
        success: false,
        error: errMsg || msg('Bad request', 'Bad request', 'Bad request'),
        detail: debug ? `step=${step} ${errMsg}` : undefined,
      },
      { status: 400 }
    )
  }
}

