import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { buildDutyScopeIndexForPeriod } from '@/lib/server/evaluation-duty-questions'
import {
  aggregateAssignmentResponses,
  buildCategoryCompareForScope,
  finalizeTargetScopeAverages,
} from '@/lib/server/evaluation-response-scope'
import { buildScopeScoreSummary } from '@/lib/server/evaluation-score-metrics'

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
        : `${cards.length} ayrı değerlendirme bulundu. Temel görev ve ek görev skorları ayrı tutulur; trim ve 100 puan normalizasyonu değerlendirme türüne göre hesaplanır.`,
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

  const categoryByQuestionId = new Map<string, { key: string; label: string }>()
  const categoryById = new Map<string, { key: string; label: string }>()
  const categoryWeightByName: Record<string, number> = {}

  const periodIds = Array.from(
    new Set(rows.map((a: any) => String(a?.evaluation_periods?.id || '')).filter(Boolean))
  )
  const dutyScopeByPeriod = new Map<string, Set<string>>()
  for (const pid of periodIds) {
    try {
      const idx = await buildDutyScopeIndexForPeriod(supabase, pid)
      dutyScopeByPeriod.set(pid, idx.get(personId) || new Set())
    } catch {
      dutyScopeByPeriod.set(pid, new Set())
    }
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
        evaluations: [] as any[],
        standards: { total: 0, count: 0 },
      })
    }

    const card = byPeriod.get(periodId)
    const aid = String(assignment.id || '')
    const isSelf = String(assignment.evaluator_id || '') === String(assignment.target_id || '')
    const responses = responsesByAssignment.get(aid) || []
    if (responses.length) card.completedAssignments += 1

    const dutyOnly = dutyScopeByPeriod.get(periodId) || new Set<string>()
    const bundled = aggregateAssignmentResponses(responses, {
      dutyOnlyQuestionIds: dutyOnly,
      categoryByQuestionId,
      categoryById,
    })
    const periodScores = bundled.period
    const dutyScores = bundled.duty

    let stdTotal = 0
    let stdCount = 0
    ;(standardsByAssignment.get(aid) || []).forEach((st) => {
      const score = Number(st.score || 0)
      if (Number.isFinite(score) && score > 0) {
        stdTotal += score
        stdCount += 1
        card.standards.total += score
        card.standards.count += 1
      }
    })

    card.evaluations.push({
      evaluatorId: assignment.evaluator_id,
      evaluatorName: assignment.evaluator?.name || '-',
      isSelf,
      evaluatorLevel: isSelf ? 'self' : assignment.evaluator?.position_level || 'peer',
      avgScore: periodScores.avgScore,
      hasScorableResponses: periodScores.hasScorableResponses,
      categories: periodScores.categories,
      questionScores: periodScores.questionScores,
      avgScoreDuty: dutyScores.responseCount ? dutyScores.avgScore : null,
      hasDutyScorableResponses: dutyScores.hasScorableResponses,
      categoriesDuty: dutyScores.categories,
      questionScoresDuty: dutyScores.questionScores,
      standardsAvg: stdCount ? Math.round((stdTotal / stdCount) * 10) / 10 : 0,
    })
  })

  const cards = Array.from(byPeriod.values())
    .map((card: any) => {
      const evals = card.evaluations || []
      const scopeAvgs = finalizeTargetScopeAverages(evals, () => 1)
      const categoryCompare = buildCategoryCompareForScope(evals, 'period', categoryWeightByName)
      const categoryCompareDuty = scopeAvgs.hasDutyScope
        ? buildCategoryCompareForScope(evals, 'duty', categoryWeightByName)
        : []

      const assessmentKind = String(card.assessmentKind || 'development_360')
      const periodMetrics = buildScopeScoreSummary({
        evaluations: evals,
        scope: 'period',
        categoryCompare,
        categoryWeightByName,
        assessmentKind,
        overallAvg: scopeAvgs.overallAvgPeriod,
      })

      let dutyMetrics: ReturnType<typeof buildScopeScoreSummary> = null
      if (scopeAvgs.hasDutyScope && categoryCompareDuty.length) {
        dutyMetrics = buildScopeScoreSummary({
          evaluations: evals,
          scope: 'duty',
          categoryCompare: categoryCompareDuty,
          categoryWeightByName,
          assessmentKind,
          overallAvg: scopeAvgs.overallAvgDuty,
        })
      }

      const compareForSwot = periodMetrics?.categoryCompare || categoryCompare
      const sortedPeer = [...compareForSwot].sort((a, b) => (b.peer || 0) - (a.peer || 0))
      const strengths = sortedPeer.filter((c) => (c.peer || 0) >= 3.5).slice(0, 5).map((c) => ({ name: c.name, score: c.peer }))
      const weaknesses = sortedPeer
        .filter((c) => (c.peer || 0) > 0 && (c.peer || 0) < 3.5)
        .slice(-5)
        .map((c) => ({ name: c.name, score: c.peer }))

      return {
        periodId: card.periodId,
        periodName: card.periodName,
        assessmentKind: card.assessmentKind,
        assessmentLabel: card.assessmentLabel,
        startDate: card.startDate,
        endDate: card.endDate,
        overallAvg: scopeAvgs.overallAvgPeriod ?? 0,
        overallAvgDuty: scopeAvgs.overallAvgDuty,
        selfScore: scopeAvgs.selfScorePeriod ?? 0,
        selfScoreDuty: scopeAvgs.selfScoreDuty,
        peerAvg: scopeAvgs.peerAvgPeriod ?? 0,
        peerAvgDuty: scopeAvgs.peerAvgDuty,
        hasDutyScope: scopeAvgs.hasDutyScope,
        peerAvgTrimmed: periodMetrics?.peerAvgTrimmed ?? 0,
        overallAvgTrimmed: periodMetrics?.overallAvgTrimmed ?? 0,
        score100: periodMetrics?.score100 ?? null,
        score100Trimmed: periodMetrics?.score100Trimmed ?? null,
        peerAvgTrimmedDuty: dutyMetrics?.peerAvgTrimmed ?? 0,
        overallAvgTrimmedDuty: dutyMetrics?.overallAvgTrimmed ?? 0,
        score100Duty: dutyMetrics?.score100 ?? null,
        score100TrimmedDuty: dutyMetrics?.score100Trimmed ?? null,
        evaluatorCount: card.completedAssignments,
        standardAvg: avg(card.standards.total, card.standards.count),
        standardCount: card.standards.count,
        categoryCompare: compareForSwot,
        categoryCompareDuty: dutyMetrics?.categoryCompare || categoryCompareDuty,
        swot: {
          peer: { strengths, weaknesses },
        },
        aiSummary:
          strengths.length || weaknesses.length
            ? `Temel görev — Güçlü: ${strengths.map((x) => x.name).join(', ') || '-'}. Gelişim: ${weaknesses.map((x) => x.name).join(', ') || '-'}.${scopeAvgs.hasDutyScope && dutyMetrics?.score100Trimmed != null ? ` Ek görev (trim/100): ${dutyMetrics.score100Trimmed}.` : ''}`
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
