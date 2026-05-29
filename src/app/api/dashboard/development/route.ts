import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { buildDevelopmentInsights } from '@/lib/development-insights'

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

type CategoryScore = { name: string; selfScore: number; peerScore: number; gap: number }

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const msg = (tr: string, en: string, fr: string) => (lang === 'fr' ? fr : lang === 'en' ? en : tr)

  if (!s?.uid) return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 401 })

  // Report endpoint (user-facing): rate limit by user to avoid corporate NAT false-positives
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

  const pickPeriodName = (p: any) => {
    if (!p) return ''
    if (lang === 'fr') return String(p.name_fr || p.name || '')
    if (lang === 'en') return String(p.name_en || p.name || '')
    return String(p.name || '')
  }

  const generalLabel = msg('Genel', 'General', 'Général')

  // Translate category names (responses store category_name as text). Best-effort mapping from categories tables.
  const pickCatName = (row: any) => {
    if (!row) return ''
    if (lang === 'fr') return String(row.name_fr || row.name || '')
    if (lang === 'en') return String(row.name_en || row.name || '')
    return String(row.name || '')
  }
  const categoryNameMap = new Map<string, string>()
  // Two possible schemas: categories or question_categories
  const [catsRes, qCatsRes] = await Promise.all([
    supabase.from('categories').select('name,name_en,name_fr'),
    supabase.from('question_categories').select('name,name_en,name_fr'),
  ])
  if (!catsRes.error) {
    ;(catsRes.data || []).forEach((r: any) => {
      const key = String(r?.name || '').trim()
      if (!key) return
      const val = pickCatName(r) || key
      categoryNameMap.set(key, val)
    })
  }
  if (!qCatsRes.error) {
    ;(qCatsRes.data || []).forEach((r: any) => {
      const key = String(r?.name || '').trim()
      if (!key) return
      const val = pickCatName(r) || key
      categoryNameMap.set(key, val)
    })
  }

  const { data: assignments, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select(
      `
      *,
      evaluator:evaluator_id(name),
      evaluation_periods(id, name, name_en, name_fr, results_released, assessment_kind)
    `
    )
    .eq('target_id', s.uid)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })

  if (aErr)
    return NextResponse.json({ success: false, error: aErr.message || msg('Veri alınamadı', 'Failed to load data', 'Impossible de charger les données') }, { status: 400 })

  const uniq: { id: string; name: string }[] = []
  const seen = new Set<string>()
  const developmentAssignments = (assignments || []).filter(
    (a: any) => String(a?.evaluation_periods?.assessment_kind || 'development_360') === 'development_360'
  )

  ;developmentAssignments.forEach((a: any) => {
    const pid = a?.evaluation_periods?.id
    const pname = pickPeriodName(a?.evaluation_periods)
    if (!pid || !pname) return
    if (seen.has(pid)) return
    seen.add(pid)
    uniq.push({ id: pid, name: pname })
  })

  if (!periodId) {
    return NextResponse.json({ success: true, periods: uniq })
  }

  const periodAssignments = developmentAssignments.filter((a: any) => a?.evaluation_periods?.id === periodId)
  const periodName = pickPeriodName(periodAssignments[0]?.evaluation_periods)
  if (!periodAssignments.length) {
    return NextResponse.json({ success: true, periods: uniq, periodName, plan: null })
  }

  // Gate development plan visibility by results_released (same as Sonuçlar & Raporlar)
  const isAdmin = s.role === 'super_admin' || s.role === 'org_admin'
  const resultsReleased = Boolean(periodAssignments[0]?.evaluation_periods?.results_released ?? false)
  if (!isAdmin && !resultsReleased) {
    return NextResponse.json({
      success: true,
      periods: uniq,
      periodName,
      plan: null,
      resultsReleased: false,
    })
  }

  const assignmentIds = periodAssignments.map((a: any) => a.id)
  const { data: responses, error: rErr } = await supabase
    .from('evaluation_responses')
    .select('*')
    .in('assignment_id', assignmentIds)
  if (rErr)
    return NextResponse.json(
      { success: false, error: rErr.message || msg('Yanıtlar alınamadı', 'Failed to load responses', 'Impossible de charger les réponses') },
      { status: 400 }
    )

  const selfScores: Record<string, { total: number; count: number }> = {}
  const peerScores: Record<string, { total: number; count: number }> = {}

  periodAssignments.forEach((assignment: any) => {
    const isSelf = String(assignment.evaluator_id) === String(assignment.target_id)
    const assignmentResponses = (responses || []).filter((r: any) => r.assignment_id === assignment.id)
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
  return NextResponse.json({ success: true, periods: uniq, periodName, plan, resultsReleased: true })
}

