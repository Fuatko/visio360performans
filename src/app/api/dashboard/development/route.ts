import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { buildDevelopmentInsights } from '@/lib/development-insights'
import { isPersonalDevelopmentPeriod } from '@/lib/evaluation-period-kind'
import { canonicalAssignmentId, userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'
import { buildDevelopmentPeriodCatalog, type DevelopmentPeriodMeta } from '@/lib/server/development-period-catalog'
import { fetchEvaluationResponsesInChunks } from '@/lib/server/fetch-evaluation-responses'

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

type CategoryScore = { name: string; selfScore: number; peerScore: number; gap: number }

async function loadPeriodRow(supabase: ReturnType<typeof getSupabaseAdmin>, periodId: string) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('evaluation_periods')
    .select('id, name, name_en, name_fr, results_released, assessment_kind')
    .eq('id', periodId)
    .maybeSingle()
  if (error) throw new Error(error.message || 'Period not found')
  return data
}

function buildMetaForPeriod(
  periodId: string,
  periodRow: any,
  assignments: Array<{ status?: string }>,
  pickPeriodName: (p: any) => string,
  isAdmin: boolean
): DevelopmentPeriodMeta | null {
  if (!periodRow) return null
  const pname = pickPeriodName(periodRow)
  if (!pname) return null
  const completedAsTarget = assignments.filter((a) => a.status === 'completed').length
  return {
    id: periodId,
    name: pname,
    resultsReleased: Boolean(periodRow.results_released ?? false),
    totalAsTarget: assignments.length,
    completedAsTarget,
    canViewPlan: completedAsTarget > 0 && (isAdmin || Boolean(periodRow.results_released)),
  }
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const msg = (tr: string, en: string, fr: string) => (lang === 'fr' ? fr : lang === 'en' ? en : tr)

  if (!s?.uid) return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 401 })

  const rl = await rateLimitByUser(req, 'dashboard:development:get', s.uid, 30, 60 * 1000)
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
  const isAdmin = s.role === 'super_admin' || s.role === 'org_admin'

  const pickPeriodName = (p: any) => {
    if (!p) return ''
    if (lang === 'fr') return String(p.name_fr || p.name || '')
    if (lang === 'en') return String(p.name_en || p.name || '')
    return String(p.name || '')
  }

  const generalLabel = msg('Genel', 'General', 'Général')

  const pickCatName = (row: any) => {
    if (!row) return ''
    if (lang === 'fr') return String(row.name_fr || row.name || '')
    if (lang === 'en') return String(row.name_en || row.name || '')
    return String(row.name || '')
  }
  const categoryNameMap = new Map<string, string>()
  const [catsRes, qCatsRes] = await Promise.all([
    supabase.from('categories').select('name,name_en,name_fr'),
    supabase.from('question_categories').select('name,name_en,name_fr'),
  ])
  if (!catsRes.error) {
    ;(catsRes.data || []).forEach((r: any) => {
      const key = String(r?.name || '').trim()
      if (!key) return
      categoryNameMap.set(key, pickCatName(r) || key)
    })
  }
  if (!qCatsRes.error) {
    ;(qCatsRes.data || []).forEach((r: any) => {
      const key = String(r?.name || '').trim()
      if (!key) return
      categoryNameMap.set(key, pickCatName(r) || key)
    })
  }

  const { data: allTargetAssignments, error: allErr } = await supabase
    .from('evaluation_assignments')
    .select('id, status, period_id, evaluator_id, target_id')
    .eq('target_id', s.uid)

  if (allErr)
    return NextResponse.json({ success: false, error: allErr.message || msg('Veri alınamadı', 'Failed to load data', 'Impossible de charger les données') }, { status: 400 })

  let periods: DevelopmentPeriodMeta[] = []
  let periodById = new Map<string, any>()
  let rawTargetCount = 0
  let devTargetCount = 0

  try {
    const catalog = await buildDevelopmentPeriodCatalog({
      supabase,
      targetAssignments: allTargetAssignments || [],
      pickPeriodName,
      isAdmin,
    })
    periods = catalog.periods
    periodById = catalog.periodById
    rawTargetCount = catalog.rawTargetCount
    devTargetCount = catalog.devTargetCount
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || msg('Dönem bilgisi alınamadı', 'Failed to load periods', 'Impossible de charger les périodes') }, { status: 400 })
  }

  const hasTargetAssignments = rawTargetCount > 0
  const hasDevelopmentTarget = devTargetCount > 0

  if (!periodId) {
    return NextResponse.json(
      {
        success: true,
        periods,
        hasTargetAssignments,
        hasDevelopmentTarget,
        rawTargetCount,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }

  const assignmentsForPeriod = (allTargetAssignments || []).filter((a) => String(a.period_id || '') === periodId)

  let selectedMeta = periods.find((p) => p.id === periodId) || null
  let periodRow = periodById.get(periodId)

  if (!selectedMeta && assignmentsForPeriod.length > 0) {
    try {
      if (!periodRow) {
        periodRow = await loadPeriodRow(supabase, periodId)
        if (periodRow) periodById.set(periodId, periodRow)
      }
      selectedMeta = buildMetaForPeriod(periodId, periodRow, assignmentsForPeriod, pickPeriodName, isAdmin)
      if (selectedMeta && !periods.some((p) => p.id === periodId)) {
        periods = [...periods, selectedMeta].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      }
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message || msg('Dönem bilgisi alınamadı', 'Failed to load period', 'Impossible de charger la période') }, { status: 400 })
    }
  }

  const periodName = selectedMeta?.name || pickPeriodName(periodRow)

  if (!selectedMeta || !assignmentsForPeriod.length) {
    return NextResponse.json({
      success: true,
      periods,
      periodName,
      plan: null,
      planStatus: hasTargetAssignments && !hasDevelopmentTarget ? 'not_development_period' : 'no_period',
      hasTargetAssignments,
      hasDevelopmentTarget,
      rawTargetCount,
    })
  }

  if (selectedMeta.completedAsTarget === 0) {
    return NextResponse.json({
      success: true,
      periods,
      periodName,
      plan: null,
      planStatus: 'awaiting_evaluations',
      resultsReleased: selectedMeta.resultsReleased,
      progress: { completed: 0, total: selectedMeta.totalAsTarget },
      hasTargetAssignments: true,
      hasDevelopmentTarget: true,
    })
  }

  const resultsReleased = selectedMeta.resultsReleased
  if (!isAdmin && !resultsReleased) {
    return NextResponse.json({
      success: true,
      periods,
      periodName,
      plan: null,
      planStatus: 'not_released',
      resultsReleased: false,
      progress: {
        completed: selectedMeta.completedAsTarget,
        total: selectedMeta.totalAsTarget,
      },
      hasTargetAssignments: true,
      hasDevelopmentTarget: true,
    })
  }

  if (!periodRow) {
    try {
      periodRow = await loadPeriodRow(supabase, periodId)
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message || msg('Dönem bilgisi alınamadı', 'Failed to load period', 'Impossible de charger la période') }, { status: 400 })
    }
  }

  if (!isPersonalDevelopmentPeriod(periodRow?.assessment_kind)) {
    return NextResponse.json({
      success: true,
      periods,
      periodName,
      plan: null,
      planStatus: 'not_development_period',
      hasTargetAssignments: true,
      hasDevelopmentTarget: false,
    })
  }

  const { data: completedAssignments, error: cErr } = await supabase
    .from('evaluation_assignments')
    .select('id, status, period_id, evaluator_id, target_id')
    .eq('target_id', s.uid)
    .eq('status', 'completed')
    .eq('period_id', periodId)

  if (cErr)
    return NextResponse.json(
      { success: false, error: cErr.message || msg('Veri alınamadı', 'Failed to load data', 'Impossible de charger les données') },
      { status: 400 }
    )

  const periodAssignments = completedAssignments || []
  if (!periodAssignments.length) {
    return NextResponse.json({
      success: true,
      periods,
      periodName,
      plan: null,
      planStatus: 'no_completed',
      resultsReleased,
      hasTargetAssignments: true,
      hasDevelopmentTarget: true,
    })
  }

  const assignmentIds = periodAssignments.map((a: any) => a.id)
  const { responses, error: rErr } = await fetchEvaluationResponsesInChunks(supabase, assignmentIds)
  if (rErr)
    return NextResponse.json(
      { success: false, error: rErr || msg('Yanıtlar alınamadı', 'Failed to load responses', 'Impossible de charger les réponses') },
      { status: 400 }
    )

  const responsesByAssignment = new Map<string, any[]>()
  responses.forEach((r: any) => {
    const key = canonicalAssignmentId(r?.assignment_id)
    if (!key) return
    const cur = responsesByAssignment.get(key) || []
    cur.push(r)
    responsesByAssignment.set(key, cur)
  })

  const selfScores: Record<string, { total: number; count: number }> = {}
  const peerScores: Record<string, { total: number; count: number }> = {}

  periodAssignments.forEach((assignment: any) => {
    const isSelf = userIdsEqualForSelfEval(assignment.evaluator_id, assignment.target_id)
    const assignmentResponses = responsesByAssignment.get(canonicalAssignmentId(assignment.id)) || []
    assignmentResponses.forEach((resp: any) => {
      const raw = String(resp.category_name || '').trim()
      const base = raw || generalLabel
      const catName = categoryNameMap.get(base) || base
      const score = resp.reel_score || resp.std_score || 0
      if (isSelf) {
        if (!selfScores[catName]) selfScores[catName] = { total: 0, count: 0 }
        selfScores[catName].total += score
        selfScores[catName].count++
      } else {
        if (!peerScores[catName]) peerScores[catName] = { total: 0, count: 0 }
        peerScores[catName].total += score
        peerScores[catName].count++
      }
    })
  })

  const allCategories = new Set([...Object.keys(selfScores), ...Object.keys(peerScores)])
  const categoryScores: CategoryScore[] = []
  allCategories.forEach((catName) => {
    const selfAvg = selfScores[catName] ? Math.round((selfScores[catName].total / selfScores[catName].count) * 10) / 10 : 0
    const peerAvg = peerScores[catName] ? Math.round((peerScores[catName].total / peerScores[catName].count) * 10) / 10 : 0
    categoryScores.push({ name: catName, selfScore: selfAvg, peerScore: peerAvg, gap: Math.round((selfAvg - peerAvg) * 10) / 10 })
  })

  const langTyped = (lang === 'fr' ? 'fr' : lang === 'en' ? 'en' : 'tr') as 'tr' | 'en' | 'fr'
  const insights = buildDevelopmentInsights(categoryScores, langTyped)
  const plan = {
    strengths: insights.strengths,
    improvements: insights.improvements,
    recommendations: insights.recommendations,
    headline: insights.headline,
    subline: insights.subline,
    chartRows: insights.chartRows,
    insightCards: insights.insightCards,
    actionSteps: insights.actionSteps,
  }
  return NextResponse.json({
    success: true,
    periods,
    periodName,
    plan,
    planStatus: 'ready',
    resultsReleased: true,
    hasTargetAssignments: true,
    hasDevelopmentTarget: true,
  })
}
