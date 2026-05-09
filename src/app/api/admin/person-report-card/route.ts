import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl.replace(/\/$/, ''), service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

function assessmentKindLabel(kind: string) {
  if (kind === 'job_evaluation') return 'İş Değerlendirmesi'
  if (kind === 'other') return 'Diğer Değerlendirme'
  return 'Kişisel Gelişim'
}

function avg(total: number, count: number) {
  return count ? Math.round((total / count) * 10) / 10 : 0
}

function buildTextSummary(cards: any[]) {
  const allStrengths = cards.flatMap((c) => c.swot.peer.strengths.map((x: any) => x.name)).filter(Boolean)
  const allWeaknesses = cards.flatMap((c) => c.swot.peer.weaknesses.map((x: any) => x.name)).filter(Boolean)
  const countByName = (items: string[]) =>
    Array.from(
      items.reduce((m, name) => {
        m.set(name, (m.get(name) || 0) + 1)
        return m
      }, new Map<string, number>())
    )
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

  return {
    commonStrengths: countByName(allStrengths),
    commonRisks: countByName(allWeaknesses),
    narrative:
      cards.length === 0
        ? 'Bu kişi için tamamlanmış değerlendirme bulunamadı.'
        : `${cards.length} ayrı değerlendirme bulundu. Skorlar değerlendirme türlerine göre ayrı tutulur; ortak güçlü ve gelişim alanları aşağıda özetlenir.`,
  }
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:person-report-card:get', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const personId = (url.searchParams.get('person_id') || '').trim()
  const orgParam = (url.searchParams.get('org_id') || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : orgParam
  if (!personId || !orgId) return NextResponse.json({ success: false, error: 'person_id ve org_id gerekli' }, { status: 400 })

  const { data: person, error: pErr } = await supabase
    .from('users')
    .select('id,name,email,department,title,organization_id')
    .eq('id', personId)
    .maybeSingle()
  if (pErr || !person) return NextResponse.json({ success: false, error: 'Kişi bulunamadı' }, { status: 404 })
  if (String((person as any).organization_id || '') !== String(orgId)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  const { data: assignments, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select(
      `
      id, evaluator_id, target_id, status, completed_at,
      evaluator:evaluator_id(id, name, position_level),
      evaluation_periods(id, name, name_en, name_fr, start_date, end_date, assessment_kind, results_released, organization_id)
    `
    )
    .eq('target_id', personId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })

  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atamalar alınamadı' }, { status: 400 })
  const rows = (assignments || []).filter((a: any) => String(a?.evaluation_periods?.organization_id || '') === String(orgId))
  const assignmentIds = rows.map((a: any) => String(a.id)).filter(Boolean)

  const responsesByAssignment = new Map<string, any[]>()
  if (assignmentIds.length) {
    const { data: responses, error: rErr } = await supabase.from('evaluation_responses').select('*').in('assignment_id', assignmentIds)
    if (rErr) return NextResponse.json({ success: false, error: rErr.message || 'Yanıtlar alınamadı' }, { status: 400 })
    ;((responses || []) as any[]).forEach((r) => {
      const aid = String(r.assignment_id || '')
      if (!aid) return
      const cur = responsesByAssignment.get(aid) || []
      cur.push(r)
      responsesByAssignment.set(aid, cur)
    })
  }

  const standardsByAssignment = new Map<string, any[]>()
  try {
    if (assignmentIds.length) {
      const { data } = await supabase
        .from('international_standard_scores')
        .select('assignment_id, score, standard_id')
        .in('assignment_id', assignmentIds)
      ;((data || []) as any[]).forEach((r) => {
        const aid = String(r.assignment_id || '')
        const cur = standardsByAssignment.get(aid) || []
        cur.push(r)
        standardsByAssignment.set(aid, cur)
      })
    }
  } catch {
    // optional table
  }

  const byPeriod = new Map<string, any>()
  rows.forEach((assignment: any) => {
    const period = assignment.evaluation_periods || {}
    const periodId = String(period.id || '')
    if (!periodId) return
    if (!byPeriod.has(periodId)) {
      byPeriod.set(periodId, {
        periodId,
        periodName: String(period.name || ''),
        periodNameEn: period.name_en || null,
        periodNameFr: period.name_fr || null,
        assessmentKind: String(period.assessment_kind || 'development_360'),
        assessmentLabel: assessmentKindLabel(String(period.assessment_kind || 'development_360')),
        startDate: period.start_date || null,
        endDate: period.end_date || null,
        completedAssignments: 0,
        self: { total: 0, count: 0 },
        peer: { total: 0, count: 0 },
        categories: new Map<string, { selfTotal: number; selfCount: number; peerTotal: number; peerCount: number }>(),
        standards: { total: 0, count: 0 },
      })
    }

    const card = byPeriod.get(periodId)
    const aid = String(assignment.id || '')
    const isSelf = String(assignment.evaluator_id || '') === String(assignment.target_id || '')
    const responses = responsesByAssignment.get(aid) || []
    if (responses.length) card.completedAssignments += 1
    responses.forEach((resp) => {
      const score = Number(resp.reel_score ?? resp.std_score ?? 0)
      if (!Number.isFinite(score) || score <= 0) return
      const category = String(resp.category_name || 'Genel').trim() || 'Genel'
      const bucket = card.categories.get(category) || { selfTotal: 0, selfCount: 0, peerTotal: 0, peerCount: 0 }
      if (isSelf) {
        card.self.total += score
        card.self.count += 1
        bucket.selfTotal += score
        bucket.selfCount += 1
      } else {
        card.peer.total += score
        card.peer.count += 1
        bucket.peerTotal += score
        bucket.peerCount += 1
      }
      card.categories.set(category, bucket)
    })

    ;(standardsByAssignment.get(aid) || []).forEach((st) => {
      const score = Number(st.score || 0)
      if (Number.isFinite(score) && score > 0) {
        card.standards.total += score
        card.standards.count += 1
      }
    })
  })

  const cards = Array.from(byPeriod.values())
    .map((card: any) => {
      const categoryCompare = Array.from(card.categories.entries()).map(([name, v]: any) => {
        const self = avg(v.selfTotal, v.selfCount)
        const peer = avg(v.peerTotal, v.peerCount)
        return { name, self, peer, diff: Math.round((self - peer) * 10) / 10 }
      })
      const sortedPeer = [...categoryCompare].sort((a, b) => (b.peer || 0) - (a.peer || 0))
      const strengths = sortedPeer.filter((c) => (c.peer || 0) >= 3.5).slice(0, 5).map((c) => ({ name: c.name, score: c.peer }))
      const weaknesses = sortedPeer.filter((c) => (c.peer || 0) > 0 && (c.peer || 0) < 3.5).slice(-5).map((c) => ({ name: c.name, score: c.peer }))
      return {
        periodId: card.periodId,
        periodName: card.periodName,
        assessmentKind: card.assessmentKind,
        assessmentLabel: card.assessmentLabel,
        startDate: card.startDate,
        endDate: card.endDate,
        overallAvg: avg(card.self.total + card.peer.total, card.self.count + card.peer.count),
        selfScore: avg(card.self.total, card.self.count),
        peerAvg: avg(card.peer.total, card.peer.count),
        evaluatorCount: card.completedAssignments,
        standardAvg: avg(card.standards.total, card.standards.count),
        standardCount: card.standards.count,
        categoryCompare,
        swot: {
          peer: { strengths, weaknesses },
        },
        aiSummary:
          strengths.length || weaknesses.length
            ? `Güçlü alanlar: ${strengths.map((x) => x.name).join(', ') || '-'}. Gelişim alanları: ${weaknesses.map((x) => x.name).join(', ') || '-'}.`
            : 'Yeterli kategori verisi yok.',
      }
    })
    .sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')))

  return NextResponse.json({
    success: true,
    person,
    cards,
    summary: buildTextSummary(cards),
  })
}
