import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'

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
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const periodId = (url.searchParams.get('period_id') || '').trim()

  const { data: assignments, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select(
      `
      *,
      evaluator:evaluator_id(name),
      evaluation_periods(id, name)
    `
    )
    .eq('target_id', s.uid)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })

  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Veri alınamadı' }, { status: 400 })

  const uniq: { id: string; name: string }[] = []
  const seen = new Set<string>()
  ;(assignments || []).forEach((a: any) => {
    const pid = a?.evaluation_periods?.id
    const pname = a?.evaluation_periods?.name
    if (!pid || !pname) return
    if (seen.has(pid)) return
    seen.add(pid)
    uniq.push({ id: pid, name: pname })
  })

  if (!periodId) {
    return NextResponse.json({ success: true, periods: uniq })
  }

  const periodAssignments = (assignments || []).filter((a: any) => a?.evaluation_periods?.id === periodId)
  const periodName = periodAssignments[0]?.evaluation_periods?.name || ''
  if (!periodAssignments.length) {
    return NextResponse.json({ success: true, periods: uniq, periodName, plan: null })
  }

  const assignmentIds = periodAssignments.map((a: any) => a.id)
  const { data: responses, error: rErr } = await supabase
    .from('evaluation_responses')
    .select('*')
    .in('assignment_id', assignmentIds)
  if (rErr) return NextResponse.json({ success: false, error: rErr.message || 'Yanıtlar alınamadı' }, { status: 400 })

  const selfScores: Record<string, { total: number; count: number }> = {}
  const peerScores: Record<string, { total: number; count: number }> = {}

  periodAssignments.forEach((assignment: any) => {
    const isSelf = String(assignment.evaluator_id) === String(assignment.target_id)
    const assignmentResponses = (responses || []).filter((r: any) => r.assignment_id === assignment.id)
    assignmentResponses.forEach((resp: any) => {
      const catName = resp.category_name || 'Genel'
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
      `"${overconfident[0].name}" alanında kendinizi değerlendirmeniz, diğerlerinin değerlendirmesinden daha yüksek. Bu alanda farkındalığınızı artırmanız önerilir.`
    )
  }
  if (underconfident.length > 0) {
    recommendations.push(
      `"${underconfident[0].name}" alanında potansiyelinizi yeterince fark etmiyorsunuz. Diğerleri sizi daha yüksek değerlendiriyor.`
    )
  }
  if (improvements.length > 0) {
    improvements.slice(0, 2).forEach((imp) => {
      recommendations.push(`"${imp.name}" alanında gelişim göstermeniz gerekiyor. Bu konuda eğitim veya mentorluk desteği alabilirsiniz.`)
    })
  }
  if (strengths.length > 0) {
    recommendations.push(`"${strengths[0].name}" alanında güçlüsünüz. Bu yetkinliğinizi takım arkadaşlarınıza aktararak liderlik gösterebilirsiniz.`)
  }

  const plan: DevelopmentPlan = { strengths, improvements, recommendations }
  return NextResponse.json({ success: true, periods: uniq, periodName, plan })
}

