import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

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

type Body = { period_id?: string; org_id?: string; person_id?: string | null }

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  // Heavy report endpoint: rate limit by user to avoid corporate NAT false-positives
  const rl = rateLimitByUser(req, 'admin:results:post', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const periodId = String(body.period_id || '').trim()
  const orgId = String(body.org_id || '').trim()
  const personId = body.person_id ? String(body.person_id) : ''

  const orgToUse = s.role === 'org_admin' ? String(s.org_id || '') : orgId
  if (!periodId || !orgToUse) {
    return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })
  }

  // Fetch completed assignments for the period
  const { data: assignments, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select(
      `
      *,
      evaluator:evaluator_id(id, name, department, organization_id, position_level),
      target:target_id(id, name, department, organization_id)
    `
    )
    .eq('period_id', periodId)
    .eq('status', 'completed')

  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atamalar alınamadı' }, { status: 400 })

  const filteredAssignments = (assignments || []).filter((a: any) => {
    const tOrg = a?.target?.organization_id
    if (String(tOrg || '') !== String(orgToUse)) return false
    if (personId && String(a?.target?.id || '') !== personId) return false
    return true
  })

  if (!filteredAssignments.length) {
    return NextResponse.json({ success: true, results: [] })
  }

  const assignmentIds = filteredAssignments.map((a: any) => a.id)
  const { data: responses, error: rErr } = await supabase.from('evaluation_responses').select('*').in('assignment_id', assignmentIds)
  if (rErr) return NextResponse.json({ success: false, error: rErr.message || 'Yanıtlar alınamadı' }, { status: 400 })

  type StdScoreRow = { assignment_id: string; score: number; standard?: { title?: string | null; code?: string | null } | null }
  const { data: stdScores } = await supabase
    .from('international_standard_scores')
    .select('assignment_id, score, standard:standard_id(title,code)')
    .in('assignment_id', assignmentIds)

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

  // Prefer period snapshot coefficients if available, fall back to org/default
  const [pEvalW, pCatW, pScoring, orgEval, defEval, orgCatW, defCatW] = await Promise.all([
    supabase.from('evaluation_period_evaluator_weights').select('position_level,weight').eq('period_id', periodId),
    supabase.from('evaluation_period_category_weights').select('category_name,weight').eq('period_id', periodId),
    supabase
      .from('evaluation_period_scoring_settings')
      .select('min_high_confidence_evaluator_count,lenient_diff_threshold,harsh_diff_threshold,lenient_multiplier,harsh_multiplier,standard_weight')
      .eq('period_id', periodId)
      .maybeSingle(),
    supabase.from('evaluator_weights').select('position_level,weight').eq('organization_id', orgToUse).order('created_at', { ascending: false }),
    supabase.from('evaluator_weights').select('position_level,weight').is('organization_id', null).order('created_at', { ascending: false }),
    supabase.from('category_weights').select('category_name,weight').eq('organization_id', orgToUse),
    supabase.from('category_weights').select('category_name,weight').is('organization_id', null),
  ])

  let confidenceMinHigh = 5
  let deviation = {
    lenient_diff_threshold: 0.75,
    harsh_diff_threshold: 0.75,
    lenient_multiplier: 0.85,
    harsh_multiplier: 1.15,
  }
  let standardWeight = 0.15

  // Scoring settings: snapshot first
  if (!pScoring.error && pScoring.data) {
    confidenceMinHigh = Number((pScoring.data as any).min_high_confidence_evaluator_count ?? 5) || 5
    deviation = {
      lenient_diff_threshold: Number((pScoring.data as any).lenient_diff_threshold ?? 0.75),
      harsh_diff_threshold: Number((pScoring.data as any).harsh_diff_threshold ?? 0.75),
      lenient_multiplier: Number((pScoring.data as any).lenient_multiplier ?? 0.85),
      harsh_multiplier: Number((pScoring.data as any).harsh_multiplier ?? 1.15),
    }
    standardWeight = Number((pScoring.data as any).standard_weight ?? 0.15) || 0.15
  } else {
    const [conf, dev] = await Promise.all([
      supabase.from('confidence_settings').select('min_high_confidence_evaluator_count').eq('organization_id', orgToUse).maybeSingle(),
      supabase.from('deviation_settings')
        .select('lenient_diff_threshold,harsh_diff_threshold,lenient_multiplier,harsh_multiplier')
        .eq('organization_id', orgToUse)
        .maybeSingle(),
    ])
    if (!conf.error && conf.data) confidenceMinHigh = Number((conf.data as any).min_high_confidence_evaluator_count ?? 5) || 5
    if (!dev.error && dev.data) {
      deviation = {
        lenient_diff_threshold: Number((dev.data as any).lenient_diff_threshold ?? 0.75),
        harsh_diff_threshold: Number((dev.data as any).harsh_diff_threshold ?? 0.75),
        lenient_multiplier: Number((dev.data as any).lenient_multiplier ?? 0.85),
        harsh_multiplier: Number((dev.data as any).harsh_multiplier ?? 1.15),
      }
    }
  }

  if (!pEvalW.error && (pEvalW.data || []).length) {
    ;((pEvalW.data || []) as any[]).forEach((r) => {
      const lvl = String(r.position_level || '')
      if (!lvl) return
      evaluatorWeightByLevel[lvl] = Number(r.weight ?? 1)
    })
  } else {
    const orgEvalMap = pickLatestBy(orgEval.data as any[], 'position_level')
    const defEvalMap = pickLatestBy(defEval.data as any[], 'position_level')
    new Set<string>([...defEvalMap.keys(), ...orgEvalMap.keys()]).forEach((lvl) => {
      const row = orgEvalMap.get(lvl) || defEvalMap.get(lvl)
      evaluatorWeightByLevel[lvl] = Number(row?.weight ?? 1)
    })
  }
  if (!evaluatorWeightByLevel.self) evaluatorWeightByLevel.self = 1

  if (!pCatW.error && (pCatW.data || []).length) {
    ;((pCatW.data || []) as any[]).forEach((r) => {
      const name = String(r.category_name || '')
      if (!name) return
      categoryWeightByName[name] = Number(r.weight ?? 1)
    })
  } else {
    const orgCatMap = new Map<string, any>(((orgCatW.data || []) as any[]).map((r) => [String(r.category_name), r]))
    const defCatMap = new Map<string, any>(((defCatW.data || []) as any[]).map((r) => [String(r.category_name), r]))
    new Set<string>([...defCatMap.keys(), ...orgCatMap.keys()]).forEach((name) => {
      const row = orgCatMap.get(name) || defCatMap.get(name)
      categoryWeightByName[name] = Number(row?.weight ?? 1)
    })
  }

  const weightForEval = (e: { isSelf: boolean; evaluatorLevel?: string }) => {
    const k = e.isSelf ? 'self' : (e.evaluatorLevel || 'peer')
    return Number(evaluatorWeightByLevel[k] ?? 1)
  }

  const weightedAvg = (rows: Array<{ w: number; v: number }>) => {
    const sumW = rows.reduce((s, r) => s + (r.w || 0), 0)
    if (!sumW) return 0
    return rows.reduce((s, r) => s + (r.v || 0) * (r.w || 0), 0) / sumW
  }

  // Per target aggregation
  const byTarget: Record<string, any> = {}

  filteredAssignments.forEach((a: any) => {
    const tid = String(a?.target?.id || '')
    if (!tid) return
    if (!byTarget[tid]) {
      byTarget[tid] = {
        targetId: tid,
        targetName: a?.target?.name || '-',
        targetDept: a?.target?.department || '-',
        evaluations: [],
        overallAvg: 0,
        selfScore: 0,
        peerAvg: 0,
        standardAvg: 0,
        standardCount: 0,
        standardByTitle: [],
        categoryCompare: [],
        swot: {
          self: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
          peer: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
        },
        confidenceMinHigh,
        deviation,
        standardWeight,
      }
    }

    const isSelf = String(a.evaluator_id) === String(a.target_id)
    const evaluatorLevel = isSelf ? 'self' : (a?.evaluator?.position_level || 'peer')
    const assignmentResponses = (responses || []).filter((r: any) => r.assignment_id === a.id)
    const avgScore =
      assignmentResponses.length > 0
        ? Math.round(
            (assignmentResponses.reduce((sum: number, r: any) => sum + Number(r.reel_score ?? r.std_score ?? 0), 0) / assignmentResponses.length) * 10
          ) / 10
        : 0

    const catAgg: Record<string, { sum: number; count: number }> = {}
    assignmentResponses.forEach((r: any) => {
      const name = String(r.category_name || 'Genel')
      const score = Number(r.reel_score ?? r.std_score ?? 0)
      if (!catAgg[name]) catAgg[name] = { sum: 0, count: 0 }
      catAgg[name].sum += score
      catAgg[name].count += 1
    })
    const categories = Object.entries(catAgg).map(([name, v]) => ({
      name,
      score: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
    }))

    const stdForAssignment = ((stdScores || []) as StdScoreRow[]).filter((r) => r.assignment_id === a.id)
    const standardsAvg =
      stdForAssignment.length > 0
        ? Math.round((stdForAssignment.reduce((s, r) => s + Number(r.score || 0), 0) / stdForAssignment.length) * 10) / 10
        : 0

    byTarget[tid].evaluations.push({
      evaluatorId: a?.evaluator?.id || a.evaluator_id,
      evaluatorName: a?.evaluator?.name || '-',
      isSelf,
      evaluatorLevel,
      avgScore,
      categories,
      standardsAvg,
    })
  })

  const results = Object.values(byTarget).map((r: any) => {
    const evals = r.evaluations || []
    const selfEval = evals.find((e: any) => e.isSelf)
    const peerEvals = evals.filter((e: any) => !e.isSelf)
    r.selfScore = selfEval?.avgScore || 0
    r.peerAvg = peerEvals.length ? Math.round((peerEvals.reduce((s: number, e: any) => s + (e.avgScore || 0), 0) / peerEvals.length) * 10) / 10 : 0
    r.overallAvg = Math.round(weightedAvg(evals.map((e: any) => ({ w: weightForEval(e), v: e.avgScore || 0 }))) * 10) / 10

    // category compare
    const catMap: Record<string, { selfSum: number; selfCount: number; peerSum: number; peerCount: number }> = {}
    evals.forEach((e: any) => {
      ;(e.categories || []).forEach((c: any) => {
        const name = String(c.name || 'Genel')
        if (!catMap[name]) catMap[name] = { selfSum: 0, selfCount: 0, peerSum: 0, peerCount: 0 }
        const score = Number(c.score || 0)
        if (e.isSelf) {
          catMap[name].selfSum += score
          catMap[name].selfCount += 1
        } else {
          catMap[name].peerSum += score
          catMap[name].peerCount += 1
        }
      })
    })
    r.categoryCompare = Object.entries(catMap).map(([name, v]) => {
      const self = v.selfCount ? Math.round((v.selfSum / v.selfCount) * 10) / 10 : 0
      const peer = v.peerCount ? Math.round((v.peerSum / v.peerCount) * 10) / 10 : 0
      const diff = Math.round((self - peer) * 10) / 10
      return { name, self, peer, diff, weight: Number(categoryWeightByName[name] ?? 1) }
    })

    // standards summary
    const stdVals = evals.map((e: any) => Number(e.standardsAvg || 0)).filter((x: number) => x > 0)
    r.standardCount = stdVals.length
    r.standardAvg = stdVals.length ? Math.round((stdVals.reduce((s: number, x: number) => s + x, 0) / stdVals.length) * 10) / 10 : 0

    // standard by title
    const byTitle: Record<string, { title: string; sum: number; count: number }> = {}
    ;((stdScores || []) as StdScoreRow[]).forEach((x) => {
      const aid = String(x.assignment_id || '')
      const a = filteredAssignments.find((z: any) => z.id === aid)
      if (!a) return
      const tid = String(a?.target?.id || '')
      if (tid !== String(r.targetId)) return
      const title = x.standard?.title ? String(x.standard.title) : '-'
      const code = x.standard?.code ? String(x.standard.code) : ''
      const k = `${code}||${title}`
      if (!byTitle[k]) byTitle[k] = { title: code ? `${code} — ${title}` : title, sum: 0, count: 0 }
      const s = Number(x.score || 0)
      if (!s) return
      byTitle[k].sum += s
      byTitle[k].count += 1
    })
    r.standardByTitle = Object.values(byTitle)
      .map((x) => ({ title: x.title, avg: x.count ? Math.round((x.sum / x.count) * 10) / 10 : 0, count: x.count }))
      .sort((a, b) => b.avg - a.avg)

    // SWOT (peer vs self)
    const sortedPeer = [...r.categoryCompare].sort((a: any, b: any) => (b.peer || 0) - (a.peer || 0))
    r.swot.peer.strengths = sortedPeer.filter((c: any) => (c.peer || 0) >= 3.5).slice(0, 6).map((c: any) => ({ name: c.name, score: c.peer || 0 }))
    r.swot.peer.weaknesses = sortedPeer.filter((c: any) => (c.peer || 0) > 0 && (c.peer || 0) < 3.5).slice(-6).map((c: any) => ({ name: c.name, score: c.peer || 0 }))
    r.swot.peer.opportunities = r.swot.peer.weaknesses.slice(0, 4)
    r.swot.peer.recommendations = []
    if (r.swot.peer.weaknesses[0]) r.swot.peer.recommendations.push(`"${r.swot.peer.weaknesses[0].name}" alanında gelişim planı oluşturulmalı.`)
    if (r.swot.peer.strengths[0]) r.swot.peer.recommendations.push(`"${r.swot.peer.strengths[0].name}" alanındaki güçlü yön yaygınlaştırılmalı.`)

    const sortedSelf = [...r.categoryCompare].sort((a: any, b: any) => (b.self || 0) - (a.self || 0))
    r.swot.self.strengths = sortedSelf.filter((c: any) => (c.self || 0) >= 3.5).slice(0, 6).map((c: any) => ({ name: c.name, score: c.self || 0 }))
    r.swot.self.weaknesses = sortedSelf.filter((c: any) => (c.self || 0) > 0 && (c.self || 0) < 3.5).slice(-6).map((c: any) => ({ name: c.name, score: c.self || 0 }))
    r.swot.self.opportunities = r.swot.self.weaknesses.slice(0, 4)
    r.swot.self.recommendations = []
    if (r.swot.self.weaknesses[0]) r.swot.self.recommendations.push(`"${r.swot.self.weaknesses[0].name}" alanında gelişim planı oluşturulmalı.`)
    if (r.swot.self.strengths[0]) r.swot.self.recommendations.push(`"${r.swot.self.strengths[0].name}" alanındaki güçlü yön yaygınlaştırılmalı.`)

    return r
  })

  return NextResponse.json({ success: true, results })
}

