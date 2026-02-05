import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

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

type PeriodResult = any // keep payload flexible; UI already validates with rendering safeguards

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const msg = (tr: string, en: string, fr: string) => (lang === 'fr' ? fr : lang === 'en' ? en : tr)

  // Heavy report endpoint (user-facing): rate limit by user to avoid corporate NAT false-positives.
  const rl = await rateLimitByUser(req, 'dashboard:results:get', s.uid, 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const pickPeriodName = (p: any) => {
    if (!p) return '-'
    if (lang === 'fr') return String(p.name_fr || p.name || '-')
    if (lang === 'en') return String(p.name_en || p.name || '-')
    return String(p.name || '-')
  }

  // Category name translations:
  // - Stored responses keep `category_name` as plain text (historically TR).
  // - For display, we best-effort map TR name -> EN/FR from categories tables.
  // - IMPORTANT: keep canonical names for scoring/weights; only translate at the end.
  const categoryNameMap = new Map<string, string>()
  const categoryNameNormMap = new Map<string, string>()
  const categoryByQuestionId = new Map<string, { key: string; label: string }>()
  const categoryById = new Map<string, { key: string; label: string }>()
  const normKey = (s: string) =>
    String(s || '')
      .trim()
      .toLowerCase()
      // strip accents/diacritics
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      // normalize punctuation/spaces
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9ğüşıöç\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const pickCatName = (row: any) => {
    if (!row) return ''
    if (lang === 'fr') return String(row.name_fr || row.name || '')
    if (lang === 'en') return String(row.name_en || row.name || '')
    return String(row.name || '')
  }
  const addRowsToMap = (rows: any[] | null | undefined) => {
    ;(rows || []).forEach((r: any) => {
      const key = String(r?.name || '').trim()
      if (!key) return
      const val = (pickCatName(r) || key).trim()
      if (!val) return
      categoryNameMap.set(key, val)
      const nk = normKey(key)
      if (nk && !categoryNameNormMap.has(nk)) categoryNameNormMap.set(nk, val)
    })
  }
  try {
    const [catsRes, qCatsRes] = await Promise.all([
      supabase.from('categories').select('name,name_en,name_fr'),
      supabase.from('question_categories').select('name,name_en,name_fr'),
    ])
    if (!catsRes.error) addRowsToMap(catsRes.data as any[])
    if (!qCatsRes.error) addRowsToMap(qCatsRes.data as any[])
  } catch {
    // ignore (tables may not exist in some deployments)
  }

  // Fetch user to get org_id (do not trust cookie blindly)
  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id,organization_id')
    .eq('id', s.uid)
    .maybeSingle()
  if (uErr || !user) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })

  const orgId = (user as any).organization_id || null

  // Standards framework list (optional)
  let standardsFramework: { code: string | null; title: string; description: string | null }[] = []
  if (orgId) {
    try {
      const { data: fw, error: fwErr } = await supabase
        .from('international_standards')
        .select('code,title,description,sort_order,is_active,created_at')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at')
      if (!fwErr && fw) {
        standardsFramework = (fw as any[]).map((r) => ({
          code: r.code ? String(r.code) : null,
          title: String(r.title || '-'),
          description: r.description ? String(r.description) : null,
        }))
      }
    } catch {
      // ignore if table not installed
    }
  }

  // All assignments for progress (peer completion gating)
  const { data: allAssignments } = await supabase
    .from('evaluation_assignments')
    .select('id, evaluator_id, target_id, status, evaluation_periods(id)')
    .eq('target_id', s.uid)

  const peerProgressByPeriod = new Map<string, { total: number; completed: number }>()
  ;(allAssignments || []).forEach((a: any) => {
    const pid = a?.evaluation_periods?.id
    if (!pid) return
    const isSelf = String(a.evaluator_id) === String(a.target_id)
    if (isSelf) return
    const cur = peerProgressByPeriod.get(pid) || { total: 0, completed: 0 }
    cur.total += 1
    if (a.status === 'completed') cur.completed += 1
    peerProgressByPeriod.set(pid, cur)
  })

  // Completed assignments (results base)
  const { data: assignments, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select(
      `
        *,
        evaluator:evaluator_id(name, position_level),
        evaluation_periods(id, name, name_en, name_fr, organization_id)
      `
    )
    .eq('target_id', s.uid)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })

  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Veri alınamadı' }, { status: 400 })
  if (!assignments || assignments.length === 0) return NextResponse.json({ success: true, results: [] as PeriodResult[] })

  const assignmentIds = (assignments || []).map((a: any) => a.id)

  const { data: responses, error: rErr } = await supabase.from('evaluation_responses').select('*').in('assignment_id', assignmentIds)
  if (rErr) return NextResponse.json({ success: false, error: rErr.message || 'Yanıtlar alınamadı' }, { status: 400 })

  // Also build category translations from the actual questions referenced in the results.
  // This is more reliable than loading all categories because `category_name` stored in responses
  // may not match current category tables if names were edited later.
  try {
    const qIds = Array.from(new Set((responses || []).map((r: any) => String(r?.question_id || '')).filter(Boolean)))
    if (qIds.length) {
      const fetchQ = async (mode: 'question_categories' | 'categories') => {
        const select =
          mode === 'question_categories'
            ? 'id, question_categories:category_id(name,name_en,name_fr)'
            : 'id, categories:category_id(name,name_en,name_fr)'
        return await supabase.from('questions').select(select).in('id', qIds)
      }
      let qRes: any = await fetchQ('question_categories')
      if (qRes?.error) qRes = await fetchQ('categories')
      if (qRes && !qRes.error) {
        ;((qRes.data || []) as any[]).forEach((q) => {
          const cat = (q as any)?.question_categories || (q as any)?.categories
          const key = String(cat?.name || '').trim()
          if (!key) return
          const val = (pickCatName(cat) || key).trim()
          if (!val) return
          categoryNameMap.set(key, val)
          categoryByQuestionId.set(String((q as any)?.id || ''), { key, label: val })
        })
      }
    }
  } catch {
    // ignore
  }

  // If responses contain older/stale category names, map them to the canonical label as well
  // so display translations still work.
  ;(responses || []).forEach((r: any) => {
    const raw = String(r?.category_name || '').trim()
    const qid = String(r?.question_id || '').trim()
    if (!raw || !qid) return
    const info = categoryByQuestionId.get(qid)
    if (!info?.label) return
    categoryNameMap.set(raw, info.label)
  })

  // Fail-safe: if some rows have missing question_id but have category_id, resolve by id.
  try {
    const ids = Array.from(
      new Set(
        (responses || [])
          .map((r: any) => String(r?.category_id || '').trim())
          .filter(Boolean)
      )
    )
    if (ids.length) {
      const [catsRes, qCatsRes] = await Promise.all([
        supabase.from('categories').select('id,name,name_en,name_fr').in('id', ids),
        supabase.from('question_categories').select('id,name,name_en,name_fr').in('id', ids),
      ])
      ;((catsRes.data || []) as any[]).forEach((r) => {
        const key = String(r?.name || '').trim()
        const label = (pickCatName(r) || key).trim()
        if (!key || !label) return
        categoryById.set(String(r.id), { key, label })
        categoryNameMap.set(key, label)
        const nk = normKey(key)
        if (nk && !categoryNameNormMap.has(nk)) categoryNameNormMap.set(nk, label)
      })
      ;((qCatsRes.data || []) as any[]).forEach((r) => {
        const key = String(r?.name || '').trim()
        const label = (pickCatName(r) || key).trim()
        if (!key || !label) return
        categoryById.set(String(r.id), { key, label })
        categoryNameMap.set(key, label)
        const nk = normKey(key)
        if (nk && !categoryNameNormMap.has(nk)) categoryNameNormMap.set(nk, label)
      })
      ;(responses || []).forEach((r: any) => {
        const raw = String(r?.category_name || '').trim()
        const cid = String(r?.category_id || '').trim()
        if (!raw || !cid) return
        const info = categoryById.get(cid)
        if (!info?.label) return
        categoryNameMap.set(raw, info.label)
      })
    }
  } catch {
    // ignore
  }

  // Weights/settings
  const evaluatorWeightByLevel: Record<string, number> = {}
  const categoryWeightByName: Record<string, number> = {}

  const pickLatestBy = (rows: any[] | null | undefined, key: string) => {
    const out = new Map<string, any>()
    ;(rows || []).forEach((r) => {
      const k = String(r?.[key] ?? '')
      if (!k) return
      if (!out.has(k)) out.set(k, r)
    })
    return out
  }

  let confidenceMinHighLocal = 5
  let deviationLocal = {
    lenient_diff_threshold: 0.75,
    harsh_diff_threshold: 0.75,
    lenient_multiplier: 0.85,
    harsh_multiplier: 1.15,
  }

  if (orgId) {
    const [orgEval, defEval, orgCatW, defCatW, conf, dev] = await Promise.all([
      supabase.from('evaluator_weights').select('position_level,weight').eq('organization_id', orgId).order('created_at', { ascending: false }),
      supabase.from('evaluator_weights').select('position_level,weight').is('organization_id', null).order('created_at', { ascending: false }),
      supabase.from('category_weights').select('category_name,weight').eq('organization_id', orgId),
      supabase.from('category_weights').select('category_name,weight').is('organization_id', null),
      supabase.from('confidence_settings').select('min_high_confidence_evaluator_count').eq('organization_id', orgId).maybeSingle(),
      supabase.from('deviation_settings')
        .select('lenient_diff_threshold,harsh_diff_threshold,lenient_multiplier,harsh_multiplier')
        .eq('organization_id', orgId)
        .maybeSingle(),
    ])

    const orgEvalMap = pickLatestBy(orgEval.data as any[], 'position_level')
    const defEvalMap = pickLatestBy(defEval.data as any[], 'position_level')
    new Set<string>([...defEvalMap.keys(), ...orgEvalMap.keys()]).forEach((lvl) => {
      const row = orgEvalMap.get(lvl) || defEvalMap.get(lvl)
      evaluatorWeightByLevel[lvl] = Number(row?.weight ?? 1)
    })
    if (!evaluatorWeightByLevel.self) evaluatorWeightByLevel.self = 1

    const orgCatMap = new Map<string, any>(((orgCatW.data || []) as any[]).map((r) => [String(r.category_name), r]))
    const defCatMap = new Map<string, any>(((defCatW.data || []) as any[]).map((r) => [String(r.category_name), r]))
    new Set<string>([...defCatMap.keys(), ...orgCatMap.keys()]).forEach((name) => {
      const row = orgCatMap.get(name) || defCatMap.get(name)
      categoryWeightByName[name] = Number(row?.weight ?? 1)
    })

    if (!conf.error && conf.data) confidenceMinHighLocal = Number((conf.data as any).min_high_confidence_evaluator_count ?? 5) || 5
    if (!dev.error && dev.data) {
      deviationLocal = {
        lenient_diff_threshold: Number((dev.data as any).lenient_diff_threshold ?? 0.75),
        harsh_diff_threshold: Number((dev.data as any).harsh_diff_threshold ?? 0.75),
        lenient_multiplier: Number((dev.data as any).lenient_multiplier ?? 0.85),
        harsh_multiplier: Number((dev.data as any).harsh_multiplier ?? 1.15),
      }
    }
  }

  // Standard score aggregates (optional)
  let standardsByAssignment: Record<string, number> = {}
  try {
    const { data: stdScores, error: stdErr } = await supabase
      .from('international_standard_scores')
      .select('assignment_id, score')
      .in('assignment_id', assignmentIds)
    if (!stdErr && stdScores) {
      const agg: Record<string, { sum: number; count: number }> = {}
      ;(stdScores as any[]).forEach((r) => {
        const aid = String(r.assignment_id || '')
        if (!aid) return
        if (!agg[aid]) agg[aid] = { sum: 0, count: 0 }
        agg[aid].sum += Number(r.score || 0)
        agg[aid].count += 1
      })
      standardsByAssignment = Object.fromEntries(
        Object.entries(agg).map(([k, v]) => [k, v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0])
      )
    }
  } catch {
    // ignore
  }

  // Group by period and compute
  const periodMap: Record<string, any> = {}

  // Preload period snapshot coefficients for all periods (best-effort; table may not exist yet)
  const periodIds = Array.from(
    new Set(
      (assignments as any[])
        .map((a) => String(a?.evaluation_periods?.id || ''))
        .filter(Boolean)
    )
  )

  const periodEvalWeights = new Map<string, Record<string, number>>()
  const periodCatWeights = new Map<string, Record<string, number>>()
  const periodScoring = new Map<
    string,
    {
      min_high_confidence_evaluator_count: number
      lenient_diff_threshold: number
      harsh_diff_threshold: number
      lenient_multiplier: number
      harsh_multiplier: number
      standard_weight: number
    }
  >()

  if (periodIds.length) {
    try {
      const [pEvalW, pCatW, pSc] = await Promise.all([
        supabase.from('evaluation_period_evaluator_weights').select('period_id,position_level,weight').in('period_id', periodIds),
        supabase.from('evaluation_period_category_weights').select('period_id,category_name,weight').in('period_id', periodIds),
        supabase
          .from('evaluation_period_scoring_settings')
          .select(
            'period_id,min_high_confidence_evaluator_count,lenient_diff_threshold,harsh_diff_threshold,lenient_multiplier,harsh_multiplier,standard_weight'
          )
          .in('period_id', periodIds),
      ])

      ;((pEvalW.data || []) as any[]).forEach((r) => {
        const pid = String(r.period_id || '')
        const lvl = String(r.position_level || '')
        if (!pid || !lvl) return
        const cur = periodEvalWeights.get(pid) || {}
        cur[lvl] = Number(r.weight ?? 1)
        periodEvalWeights.set(pid, cur)
      })
      ;((pCatW.data || []) as any[]).forEach((r) => {
        const pid = String(r.period_id || '')
        const name = String(r.category_name || '')
        if (!pid || !name) return
        const cur = periodCatWeights.get(pid) || {}
        cur[name] = Number(r.weight ?? 1)
        periodCatWeights.set(pid, cur)
      })
      ;((pSc.data || []) as any[]).forEach((r) => {
        const pid = String(r.period_id || '')
        if (!pid) return
        periodScoring.set(pid, {
          min_high_confidence_evaluator_count: Number(r.min_high_confidence_evaluator_count ?? 5) || 5,
          lenient_diff_threshold: Number(r.lenient_diff_threshold ?? 0.75),
          harsh_diff_threshold: Number(r.harsh_diff_threshold ?? 0.75),
          lenient_multiplier: Number(r.lenient_multiplier ?? 0.85),
          harsh_multiplier: Number(r.harsh_multiplier ?? 1.15),
          standard_weight: Number(r.standard_weight ?? 0.15) || 0.15,
        })
      })
    } catch {
      // ignore if snapshot tables are not installed yet
    }
  }

  const weightForEval = (periodId: string, e: { isSelf: boolean; evaluatorLevel?: string }) => {
    const k = e.isSelf ? 'self' : (e.evaluatorLevel || 'peer')
    const per = periodEvalWeights.get(String(periodId || ''))
    if (per && typeof per[k] !== 'undefined') return Number(per[k] ?? 1)
    return Number(evaluatorWeightByLevel[k] ?? 1)
  }

  const weightForCategory = (periodId: string, categoryName: string) => {
    const per = periodCatWeights.get(String(periodId || ''))
    if (per && typeof per[categoryName] !== 'undefined') return Number(per[categoryName] ?? 1)
    return Number(categoryWeightByName[categoryName] ?? 1)
  }

  const weightedAvg = (rows: Array<{ w: number; v: number }>) => {
    const sumW = rows.reduce((s, r) => s + (r.w || 0), 0)
    if (!sumW) return 0
    return rows.reduce((s, r) => s + (r.v || 0) * (r.w || 0), 0) / sumW
  }

  ;(assignments as any[]).forEach((assignment) => {
    const periodId = assignment.evaluation_periods?.id
    const periodName = pickPeriodName(assignment.evaluation_periods)
    if (!periodId) return

    if (!periodMap[periodId]) {
      const peerProg = peerProgressByPeriod.get(periodId) || { total: 0, completed: 0 }
      const pSc = periodScoring.get(String(periodId || ''))
      const confidenceMinHighForPeriod = pSc?.min_high_confidence_evaluator_count ?? confidenceMinHighLocal
      const deviationForPeriod = pSc
        ? {
            lenient_diff_threshold: pSc.lenient_diff_threshold,
            harsh_diff_threshold: pSc.harsh_diff_threshold,
            lenient_multiplier: pSc.lenient_multiplier,
            harsh_multiplier: pSc.harsh_multiplier,
          }
        : deviationLocal
      periodMap[periodId] = {
        periodId,
        periodName,
        overallAvg: 0,
        selfScore: 0,
        peerAvg: 0,
        peerExpectedCount: peerProg.total,
        peerCompletedCount: peerProg.completed,
        standardsScore: 0,
        standardsSelfAvg: 0,
        standardsPeerAvg: 0,
        confidenceCoeff: 1,
        confidenceLabel: 'Yüksek',
        evaluations: [],
        categoryAverages: [],
        categoryCompare: [],
        swot: {
          self: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
          peer: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
        },
        standardAvg: 0,
        standardCount: 0,
        standardByTitle: [],
        standardsFramework,
        // extra knobs for client charts
        confidenceMinHigh: confidenceMinHighForPeriod,
        deviation: deviationForPeriod,
      }
    }

    const p = periodMap[periodId]
    const isSelf = String(assignment.evaluator_id) === String(assignment.target_id)
    const evaluatorLevel = isSelf ? 'self' : (assignment.evaluator?.position_level || 'peer')
    const assignmentResponses = (responses || []).filter((r: any) => r.assignment_id === assignment.id)

    const avgScore =
      assignmentResponses.length > 0
        ? Math.round(
            (assignmentResponses.reduce((sum: number, r: any) => sum + Number(r.reel_score ?? r.std_score ?? 0), 0) / assignmentResponses.length) * 10
          ) / 10
        : 0

    // category scores within this evaluation
    const catAgg: Record<string, { sum: number; count: number }> = {}
    assignmentResponses.forEach((r: any) => {
      const raw = String(r.category_name || '').trim()
      const qid = String(r?.question_id || '').trim()
      const cid = String(r?.category_id || '').trim()
      const info = qid ? categoryByQuestionId.get(qid) : null
      const byId = !info?.key && cid ? categoryById.get(cid) : null
      const name = (info?.key || byId?.key || raw || 'Genel').toString()
      const score = Number(r.reel_score ?? r.std_score ?? 0)
      if (!catAgg[name]) catAgg[name] = { sum: 0, count: 0 }
      catAgg[name].sum += score
      catAgg[name].count += 1
    })
    const categories = Object.entries(catAgg).map(([name, v]) => ({
      name,
      score: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
    }))

    const stdAvg = standardsByAssignment[String(assignment.id)] ?? 0

    p.evaluations.push({
      evaluatorName: assignment.evaluator?.name || '-',
      isSelf,
      evaluatorLevel,
      avgScore,
      categories,
      standardsAvg: stdAvg,
      completedAt: assignment.completed_at || new Date().toISOString(),
    })
  })

  const results: any[] = Object.values(periodMap)

  // finalize period-level aggregates
  results.forEach((p) => {
    const evals = p.evaluations || []
    const selfEval = evals.find((e: any) => e.isSelf)
    const peerEvals = evals.filter((e: any) => !e.isSelf)

    p.selfScore = selfEval?.avgScore || 0
    p.peerAvg = peerEvals.length ? Math.round((peerEvals.reduce((s: number, e: any) => s + (e.avgScore || 0), 0) / peerEvals.length) * 10) / 10 : 0

    const weightedRows = evals.map((e: any) => ({ w: weightForEval(String(p.periodId || ''), e), v: e.avgScore || 0 }))
    p.overallAvg = Math.round(weightedAvg(weightedRows) * 10) / 10

    // standards aggregates
    const selfStd = selfEval?.standardsAvg || 0
    const peerStd = peerEvals.length ? Math.round((peerEvals.reduce((s: number, e: any) => s + (e.standardsAvg || 0), 0) / peerEvals.length) * 10) / 10 : 0
    p.standardsSelfAvg = selfStd
    p.standardsPeerAvg = peerStd
    const stdRows = evals.map((e: any) => ({ w: weightForEval(String(p.periodId || ''), e), v: e.standardsAvg || 0 }))
    p.standardsScore = Math.round(weightedAvg(stdRows) * 10) / 10

    // confidence
    const peerCount = Number(p.peerCompletedCount || 0)
    const minHigh = Number(p.confidenceMinHigh || confidenceMinHighLocal || 5) || 5
    if (peerCount >= minHigh) {
      p.confidenceCoeff = 1
      p.confidenceLabel = msg('Yüksek', 'High', 'Élevée')
    } else if (peerCount >= Math.max(1, Math.ceil(minHigh / 2))) {
      p.confidenceCoeff = 0.9
      p.confidenceLabel = msg('Orta', 'Medium', 'Moyenne')
    } else {
      p.confidenceCoeff = 0.8
      p.confidenceLabel = msg('Düşük', 'Low', 'Faible')
    }

    // category averages and compare
    const catMap: Record<string, { selfSum: number; selfCount: number; peerSum: number; peerCount: number; weight: number }> = {}
    evals.forEach((e: any) => {
      const isSelf = Boolean(e.isSelf)
      ;(e.categories || []).forEach((c: any) => {
        const name = String(c.name || 'Genel')
        if (!catMap[name]) {
          catMap[name] = { selfSum: 0, selfCount: 0, peerSum: 0, peerCount: 0, weight: weightForCategory(String(p.periodId || ''), name) }
        }
        const score = Number(c.score || 0)
        if (isSelf) {
          catMap[name].selfSum += score
          catMap[name].selfCount += 1
        } else {
          catMap[name].peerSum += score
          catMap[name].peerCount += 1
        }
      })
    })
    const categoryCompare = Object.entries(catMap).map(([name, v]) => {
      const self = v.selfCount ? Math.round((v.selfSum / v.selfCount) * 10) / 10 : 0
      const peer = v.peerCount ? Math.round((v.peerSum / v.peerCount) * 10) / 10 : 0
      const diff = Math.round((self - peer) * 10) / 10
      return { name, self, peer, diff, weight: v.weight }
    })
    p.categoryCompare = categoryCompare
    p.categoryAverages = categoryCompare.map((c: any) => ({ name: c.name, score: c.peer || c.self || 0 }))

    // SWOT (simple: based on peer category scores)
    const sortedPeer = [...categoryCompare].sort((a: any, b: any) => (b.peer || 0) - (a.peer || 0))
    const strengths = sortedPeer.filter((c: any) => (c.peer || 0) >= 3.5).slice(0, 6).map((c: any) => ({ name: c.name, score: c.peer || 0 }))
    const weaknesses = sortedPeer.filter((c: any) => (c.peer || 0) > 0 && (c.peer || 0) < 3.5).slice(-6).map((c: any) => ({ name: c.name, score: c.peer || 0 }))
    const opportunities = weaknesses.slice(0, 4)
    const recommendations: string[] = []
    if (weaknesses[0]) recommendations.push(`"${weaknesses[0].name}" alanında gelişim planı oluşturulmalı.`)
    if (strengths[0]) recommendations.push(`"${strengths[0].name}" alanındaki güçlü yönünüzü yaygınlaştırın.`)
    p.swot.peer = { strengths, weaknesses, opportunities, recommendations }
    // Self SWOT (based on self scores)
    const sortedSelf = [...categoryCompare].sort((a: any, b: any) => (b.self || 0) - (a.self || 0))
    const sStrengths = sortedSelf.filter((c: any) => (c.self || 0) >= 3.5).slice(0, 6).map((c: any) => ({ name: c.name, score: c.self || 0 }))
    const sWeak = sortedSelf.filter((c: any) => (c.self || 0) > 0 && (c.self || 0) < 3.5).slice(-6).map((c: any) => ({ name: c.name, score: c.self || 0 }))
    const sOpp = sWeak.slice(0, 4)
    const sRec: string[] = []
    if (sWeak[0]) sRec.push(`"${sWeak[0].name}" alanında gelişim planı oluşturulmalı.`)
    if (sStrengths[0]) sRec.push(`"${sStrengths[0].name}" alanındaki güçlü yönünüzü yaygınlaştırın.`)
    p.swot.self = { strengths: sStrengths, weaknesses: sWeak, opportunities: sOpp, recommendations: sRec }

    // KVKK / Privacy: Do not return per-rater evaluation rows to the client.
    // Instead, expose a single aggregated "team average" row + the self row.
    const teamComplete = Boolean(p.peerExpectedCount > 0 && p.peerCompletedCount >= p.peerExpectedCount)
    const selfCompletedAt = selfEval?.completedAt || new Date().toISOString()
    const teamCompletedAt = peerEvals.length
      ? peerEvals
          .slice()
          .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
          ?.completedAt || new Date().toISOString()
      : new Date().toISOString()

    const selfCategories = (p.categoryCompare || []).map((c: any) => ({ name: c.name, score: Number(c.self || 0) }))
    const teamCategories = (p.categoryCompare || []).map((c: any) => ({ name: c.name, score: Number(c.peer || 0) }))

    const summaryRows: any[] = []
    if (selfEval || p.selfScore) {
      summaryRows.push({
        evaluatorName: msg('Öz Değerlendirme', 'Self Evaluation', 'Auto‑évaluation'),
        isSelf: true,
        evaluatorLevel: 'self',
        avgScore: Number(p.selfScore || 0),
        categories: selfCategories,
        standardsAvg: Number(p.standardsSelfAvg || 0),
        completedAt: selfCompletedAt,
      })
    }
    if (teamComplete && peerEvals.length > 0) {
      summaryRows.push({
        evaluatorName: msg('Ekip (Ortalama)', 'Team (Average)', 'Équipe (Moyenne)'),
        isSelf: false,
        evaluatorLevel: 'peer',
        avgScore: Number(p.peerAvg || 0),
        categories: teamCategories,
        standardsAvg: Number(p.standardsPeerAvg || 0),
        completedAt: teamCompletedAt,
      })
    }

    p.evaluations = summaryRows
  })

  // Apply category label translations for display (do not affect scoring).
  const translateCategory = (name: string) => {
    const key = String(name || '').trim()
    if (!key) return key
    if (key.toLowerCase() === 'genel') return msg('Genel', 'General', 'Général')
    const direct = categoryNameMap.get(key)
    if (direct) return direct
    const nk = normKey(key)
    return (nk && categoryNameNormMap.get(nk)) || key
  }
  results.forEach((p) => {
    if (Array.isArray(p.categoryAverages)) {
      p.categoryAverages = p.categoryAverages.map((c: any) => {
        const key = String(c?.name || '').trim()
        return { ...c, key, name: translateCategory(key) }
      })
    }
    if (Array.isArray(p.categoryCompare)) {
      p.categoryCompare = p.categoryCompare.map((c: any) => {
        const key = String(c?.name || '').trim()
        return { ...c, key, name: translateCategory(key) }
      })
    }
    if (Array.isArray(p.evaluations)) {
      p.evaluations = p.evaluations.map((e: any) => ({
        ...e,
        categories: Array.isArray(e?.categories)
          ? e.categories.map((c: any) => {
              const key = String(c?.name || '').trim()
              return { ...c, key, name: translateCategory(key) }
            })
          : e.categories,
      }))
    }
    if (p?.swot?.peer) {
      p.swot.peer = {
        ...p.swot.peer,
        strengths: (p.swot.peer.strengths || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
        weaknesses: (p.swot.peer.weaknesses || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
        opportunities: (p.swot.peer.opportunities || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
      }
    }
    if (p?.swot?.self) {
      p.swot.self = {
        ...p.swot.self,
        strengths: (p.swot.self.strengths || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
        weaknesses: (p.swot.self.weaknesses || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
        opportunities: (p.swot.self.opportunities || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
      }
    }
  })

  // sort by completed date via first evaluation completion
  results.sort((a, b) => {
    const ad = a?.evaluations?.[0]?.completedAt ? new Date(a.evaluations[0].completedAt).getTime() : 0
    const bd = b?.evaluations?.[0]?.completedAt ? new Date(b.evaluations[0].completedAt).getTime() : 0
    return bd - ad
  })

  return NextResponse.json(
    { success: true, results },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}

