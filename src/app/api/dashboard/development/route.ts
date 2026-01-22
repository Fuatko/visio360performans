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

type CategoryScore = { name: string; selfScore: number; peerScore: number; gap: number }
type DevelopmentPlan = { strengths: CategoryScore[]; improvements: CategoryScore[]; recommendations: string[] }

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
      evaluation_periods(id, name, name_en, name_fr)
    `
    )
    .eq('target_id', s.uid)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })

  if (aErr)
    return NextResponse.json({ success: false, error: aErr.message || msg('Veri alınamadı', 'Failed to load data', 'Impossible de charger les données') }, { status: 400 })

  const uniq: { id: string; name: string }[] = []
  const seen = new Set<string>()
  ;(assignments || []).forEach((a: any) => {
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

  const periodAssignments = (assignments || []).filter((a: any) => a?.evaluation_periods?.id === periodId)
  const periodName = pickPeriodName(periodAssignments[0]?.evaluation_periods)
  if (!periodAssignments.length) {
    return NextResponse.json({ success: true, periods: uniq, periodName, plan: null })
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

  const strengths = categoryScores.filter((c) => c.peerScore >= 3.5).sort((a, b) => b.peerScore - a.peerScore)
  const improvements = categoryScores.filter((c) => c.peerScore < 3.5).sort((a, b) => a.peerScore - b.peerScore)

  const recommendations: string[] = []
  const overconfident = categoryScores.filter((c) => c.gap > 0.5)
  const underconfident = categoryScores.filter((c) => c.gap < -0.5)
  if (overconfident.length > 0) {
    recommendations.push(
      msg(
        `"${overconfident[0].name}" alanında kendinizi değerlendirmeniz, diğerlerinin değerlendirmesinden daha yüksek. Bu alanda farkındalığınızı artırmanız önerilir.`,
        `In "${overconfident[0].name}", your self-rating is higher than others’ ratings. Consider increasing your awareness in this area.`,
        `Sur "${overconfident[0].name}", votre auto‑évaluation est plus élevée que celle des autres. Il est recommandé d’augmenter votre prise de conscience sur ce point.`
      )
    )
  }
  if (underconfident.length > 0) {
    recommendations.push(
      msg(
        `"${underconfident[0].name}" alanında potansiyelinizi yeterince fark etmiyorsunuz. Diğerleri sizi daha yüksek değerlendiriyor.`,
        `In "${underconfident[0].name}", you may be underestimating yourself. Others rate you higher than you rate yourself.`,
        `Sur "${underconfident[0].name}", vous vous sous‑estimez peut‑être. Les autres vous évaluent plus haut que vous‑même.`
      )
    )
  }
  if (improvements.length > 0) {
    improvements.slice(0, 2).forEach((imp) => {
      recommendations.push(
        msg(
          `"${imp.name}" alanında gelişim göstermeniz gerekiyor. Bu konuda eğitim veya mentorluk desteği alabilirsiniz.`,
          `You may want to develop in "${imp.name}". Consider training or mentoring support.`,
          `Vous pourriez progresser sur "${imp.name}". Envisagez une formation ou un accompagnement (mentorat).`
        )
      )
    })
  }
  if (strengths.length > 0) {
    recommendations.push(
      msg(
        `"${strengths[0].name}" alanında güçlüsünüz. Bu yetkinliğinizi takım arkadaşlarınıza aktararak liderlik gösterebilirsiniz.`,
        `You are strong in "${strengths[0].name}". Consider sharing this skill with your teammates to demonstrate leadership.`,
        `Vous êtes fort sur "${strengths[0].name}". Vous pouvez partager cette compétence avec votre équipe pour démontrer votre leadership.`
      )
    )
  }

  const plan: DevelopmentPlan = { strengths, improvements, recommendations }
  return NextResponse.json({ success: true, periods: uniq, periodName, plan })
}

