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
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const msg = (tr: string, en: string, fr: string) => (lang === 'fr' ? fr : lang === 'en' ? en : tr)

  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 401 })
  }

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

  const supabase = getSupabaseAdmin()
  if (!supabase)
    return NextResponse.json(
      { success: false, error: msg('Supabase yapılandırması eksik', 'Supabase configuration missing', 'Configuration Supabase manquante') },
      { status: 503 }
    )

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

  // manager scope requires users.manager_id in DB (see sql/compensation-manager-scope.sql)

  // Prefer org snapshot scoring settings for confidence threshold; fall back to org/default.
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

  // Fetch completed assignments for the period
  const { data: assignments, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select(
      `
      id,
      evaluator_id,
      target_id,
      status,
      period_id,
      evaluator:evaluator_id(id, name),
      target:target_id(id, name, department, organization_id, manager_id)
    `
    )
    .eq('period_id', periodId)
    .eq('status', 'completed')

  if (aErr) {
    const m = String(aErr.message || '')
    // If DB is not migrated yet, PostgREST can error on missing manager_id select.
    if (scope === 'manager' && m.toLowerCase().includes('manager_id')) {
      return NextResponse.json(
        {
          success: false,
          error: msg(
            'manager_id kolonu yok. Supabase’te sql/compensation-manager-scope.sql çalıştırın.',
            'manager_id column is missing. Run sql/compensation-manager-scope.sql in Supabase.',
            'Colonne manager_id manquante. Exécutez sql/compensation-manager-scope.sql dans Supabase.'
          ),
        },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, error: aErr.message || msg('Atamalar alınamadı', 'Failed to load assignments', 'Impossible de charger les attributions') },
      { status: 400 }
    )
  }

  const filteredAssignments = (assignments || []).filter((a: any) => String(a?.target?.organization_id || '') === String(orgToUse))
  if (!filteredAssignments.length) {
    return NextResponse.json({ success: true, rows: [] as Row[] })
  }

  const assignmentIds = filteredAssignments.map((a: any) => a.id)
  const { data: responses, error: rErr } = await supabase
    .from('evaluation_responses')
    .select('assignment_id, category_name, reel_score, std_score')
    .in('assignment_id', assignmentIds)

  if (rErr)
    return NextResponse.json(
      { success: false, error: rErr.message || msg('Yanıtlar alınamadı', 'Failed to load responses', 'Impossible de charger les réponses') },
      { status: 400 }
    )

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

  filteredAssignments.forEach((a: any) => {
    const tid = String(a?.target?.id || a.target_id || '')
    if (!tid) return
    if (!byTarget.has(tid)) {
      byTarget.set(tid, {
        targetId: tid,
        targetName: String(a?.target?.name || '-'),
        targetDept: String(a?.target?.department || '-') || '-',
        targetManagerId: String(a?.target?.manager_id || ''),
        sum: 0,
        count: 0,
        evaluatorSet: new Set<string>(),
        cat: {},
      })
    }
    const agg = byTarget.get(tid)!
    const eid = String(a?.evaluator_id || a?.evaluator?.id || '')
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
}

