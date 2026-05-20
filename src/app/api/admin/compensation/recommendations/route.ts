import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { isCompensationEnabled } from '@/lib/feature-flags'
import { buildDutyScopeIndexForPeriod } from '@/lib/server/evaluation-duty-questions'
import {
  aggregateAssignmentResponses,
  buildCategoryCompareForScope,
  finalizeTargetScopeAverages,
} from '@/lib/server/evaluation-response-scope'
import { buildScopeScoreSummary } from '@/lib/server/evaluation-score-metrics'

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
  score100Trimmed: number | null
  overallAvgDuty: number | null
  score100TrimmedDuty: number | null
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
      .select('id, organization_id, assessment_kind')
      .eq('id', periodId)
      .maybeSingle()
    if (pErr || !period) {
      return NextResponse.json(
        { success: false, error: msg('Dönem bulunamadı', 'Period not found', 'Période introuvable'), detail: debug ? String(pErr?.message || pErr || '') : undefined },
        { status: 400 }
      )
    }
    const assessmentKind = String((period as any).assessment_kind || 'development_360')

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
        .select('assignment_id, question_id, category_id, category_name, reel_score, std_score, question_scope')
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

  let dutyScopeByTarget = new Map<string, Set<string>>()
  try {
    dutyScopeByTarget = await buildDutyScopeIndexForPeriod(supabase, periodId)
  } catch {
    dutyScopeByTarget = new Map()
  }

  const categoryByQuestionId = new Map<string, { key: string; label: string }>()
  const categoryById = new Map<string, { key: string; label: string }>()
  const categoryWeightByName: Record<string, number> = {}

  type Agg = {
    targetId: string
    targetName: string
    targetDept: string
    targetManagerId: string
    evaluatorSet: Set<string>
    evaluations: any[]
    weakest: Array<{ name: string; avg: number }>
    overallAvg: number
    score100Trimmed: number | null
    overallAvgDuty: number | null
    score100TrimmedDuty: number | null
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
        evaluatorSet: new Set<string>(),
        evaluations: [],
        weakest: [],
        overallAvg: 0,
        score100Trimmed: null,
        overallAvgDuty: null,
        score100TrimmedDuty: null,
      })
    }
    const agg = byTarget.get(tid)!
    const eid = String(a.evaluator_id || '')
    if (eid) agg.evaluatorSet.add(eid)

    const isSelf = eid === tid
    const dutyOnly = dutyScopeByTarget.get(tid) || new Set<string>()
    const bundled = aggregateAssignmentResponses(respByAssignment.get(String(a.id)) || [], {
      dutyOnlyQuestionIds: dutyOnly,
      categoryByQuestionId,
      categoryById,
    })
    const periodScores = bundled.period
    const dutyScores = bundled.duty

    agg.evaluations.push({
      evaluatorId: eid,
      isSelf,
      evaluatorLevel: isSelf ? 'self' : 'peer',
      avgScore: periodScores.avgScore,
      hasScorableResponses: periodScores.hasScorableResponses,
      categories: periodScores.categories,
      questionScores: periodScores.questionScores,
      avgScoreDuty: dutyScores.responseCount ? dutyScores.avgScore : null,
      hasDutyScorableResponses: dutyScores.hasScorableResponses,
      categoriesDuty: dutyScores.categories,
      questionScoresDuty: dutyScores.questionScores,
    })
  })

  const baseRows = Array.from(byTarget.values()).map((a) => {
    const evals = a.evaluations
    const scopeAvgs = finalizeTargetScopeAverages(evals, () => 1)
    const categoryCompare = buildCategoryCompareForScope(evals, 'period', categoryWeightByName)
    const periodMetrics = buildScopeScoreSummary({
      evaluations: evals,
      scope: 'period',
      categoryCompare,
      categoryWeightByName,
      assessmentKind,
      overallAvg: scopeAvgs.overallAvgPeriod,
    })

    let dutyMetrics: ReturnType<typeof buildScopeScoreSummary> = null
    if (scopeAvgs.hasDutyScope) {
      const categoryCompareDuty = buildCategoryCompareForScope(evals, 'duty', categoryWeightByName)
      if (categoryCompareDuty.length) {
        dutyMetrics = buildScopeScoreSummary({
          evaluations: evals,
          scope: 'duty',
          categoryCompare: categoryCompareDuty,
          categoryWeightByName,
          assessmentKind,
          overallAvg: scopeAvgs.overallAvgDuty,
        })
      }
    }

    const compareRows = periodMetrics?.categoryCompare || categoryCompare
    const weakest = [...compareRows]
      .sort((x, y) => (x.peer || 0) - (y.peer || 0))
      .slice(0, 2)
      .filter((c) => c.name && (c.peer || 0) > 0)
      .map((c) => ({ name: c.name, avg: c.peer }))

    return {
      ...a,
      overallAvg: scopeAvgs.overallAvgPeriod ?? 0,
      score100Trimmed: periodMetrics?.score100Trimmed ?? null,
      overallAvgDuty: scopeAvgs.overallAvgDuty,
      score100TrimmedDuty: dutyMetrics?.score100Trimmed ?? null,
      evaluatorCount: a.evaluatorSet.size,
      weakest,
    }
  })

  // Pool normalization
  const poolKey = (r: { targetDept: string; targetManagerId?: string | null }) => {
    if (scope === 'department') return String(r.targetDept || '-')
    if (scope === 'manager') return String(r.targetManagerId || '')
    return 'org'
  }
  const poolStats = new Map<string, { min: number; max: number }>()
  const perfScore = (r: { score100Trimmed: number | null; overallAvg: number }) => {
    if (r.score100Trimmed != null && r.score100Trimmed > 0) return r.score100Trimmed
    return (r.overallAvg || 0) * 20
  }

  baseRows.forEach((r) => {
    const k = poolKey(r)
    if (scope === 'manager' && !k) return
    const cur = poolStats.get(k) || { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
    const ps = perfScore(r)
    cur.min = Math.min(cur.min, ps)
    cur.max = Math.max(cur.max, ps)
    poolStats.set(k, cur)
  })

  const rows: Row[] = baseRows
    .filter((r) => perfScore(r) > 0)
    .filter((r) => (scope === 'manager' ? Boolean(poolKey(r)) : true))
    .map((r) => {
      const k = poolKey(r)
      const st = poolStats.get(k) || { min: 0, max: 0 }
      const ps = perfScore(r)
      const denom = st.max - st.min
      const perfNorm = denom > 0 ? (ps - st.min) / denom : 0.5
      const conf = clamp(r.evaluatorCount / Math.max(1, confidenceMinHigh), 0, 1)

      // Confidence reduces volatility (low confidence -> closer to mid band)
      const score = clamp(0.5 + (perfNorm - 0.5) * (0.6 + 0.4 * conf), 0, 1)
      const pctRaw = minPct + (maxPct - minPct) * score
      const pct = Math.round(pctRaw * 10) / 10

      const dutyNote =
        r.score100TrimmedDuty != null
          ? msg(
              ` • Ek görev (trim/100): ${r.score100TrimmedDuty}`,
              ` • Extra duty (trim/100): ${r.score100TrimmedDuty}`,
              ` • Tâche + (trim/100) : ${r.score100TrimmedDuty}`
            )
          : ''

      const rationale = msg(
        `Performans (trim/100): ${r.score100Trimmed ?? Math.round(ps * 10) / 10} • Ölçek ort.: ${r.overallAvg} / 5${dutyNote} • Değerlendirici: ${r.evaluatorCount} • Güven: ${(conf * 100).toFixed(0)}% • Havuz: ${scope === 'department' ? 'Departman' : 'Kurum'}`,
        `Performance (trim/100): ${r.score100Trimmed ?? Math.round(ps * 10) / 10} • Scale avg: ${r.overallAvg} / 5${dutyNote} • Evaluators: ${r.evaluatorCount} • Confidence: ${(conf * 100).toFixed(0)}% • Pool: ${scope === 'department' ? 'Department' : 'Organization'}`,
        `Performance (trim/100) : ${r.score100Trimmed ?? Math.round(ps * 10) / 10} • Moy. échelle : ${r.overallAvg} / 5${dutyNote} • Évaluateurs : ${r.evaluatorCount} • Confiance : ${(conf * 100).toFixed(0)}% • Pool : ${scope === 'department' ? 'Département' : 'Organisation'}`
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
        score100Trimmed: r.score100Trimmed,
        overallAvgDuty: r.overallAvgDuty,
        score100TrimmedDuty: r.score100TrimmedDuty,
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

