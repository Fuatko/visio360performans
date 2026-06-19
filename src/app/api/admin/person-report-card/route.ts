import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  buildMatrixReportPeriodGroups,
  buildMatrixReportSummary,
  flattenMatrixReportSlices,
} from '@/lib/server/matrix-report-slices'
import { buildPeerEvaluatorCoverage } from '@/lib/server/evaluation-evaluator-coverage'

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
      id, evaluator_id, target_id, status, completed_at, matrix_context,
      evaluator:evaluator_id(id, name, position_level),
      evaluation_periods(id, name, name_en, name_fr, start_date, end_date, assessment_kind, results_released, organization_id)
    `
    )
    .eq('target_id', personId)
    .order('completed_at', { ascending: false })

  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atamalar alınamadı' }, { status: 400 })
  const allRows = (assignments || []).filter((a: any) => String(a?.evaluation_periods?.organization_id || '') === String(orgId))
  const rows = allRows.filter((a: any) => String(a?.status || '') === 'completed')
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

  const periodIdFromAssignment = (a: any) => {
    const p = a?.evaluation_periods
    if (Array.isArray(p)) return String(p[0]?.id || '')
    return String(p?.id || '')
  }

  const assignmentsByPeriod = new Map<string, any[]>()
  const coverageAssignmentsByPeriod = new Map<string, any[]>()
  for (const a of allRows) {
    const pid = periodIdFromAssignment(a)
    if (!pid) continue
    const list = assignmentsByPeriod.get(pid) || []
    list.push(a)
    assignmentsByPeriod.set(pid, list)
  }
  for (const a of allRows) {
    const pid = periodIdFromAssignment(a)
    if (!pid) continue
    const list = coverageAssignmentsByPeriod.get(pid) || []
    list.push(a)
    coverageAssignmentsByPeriod.set(pid, list)
  }

  const periodGroups = buildMatrixReportPeriodGroups({
    assignments: rows,
    responsesByAssignment,
    standardsByAssignment,
    categoryByQuestionId,
    categoryById,
    categoryWeightByName,
    includeSelf: false,
  }).map((group) => {
    const periodAssignments = assignmentsByPeriod.get(group.periodId) || []
    const coverageAssignments = coverageAssignmentsByPeriod.get(group.periodId) || periodAssignments
    const coverage = buildPeerEvaluatorCoverage(coverageAssignments, personId, responsesByAssignment)
    return {
      ...group,
      peerEvaluatorCoverage: {
        peerEvaluatorAssigned: coverage.peerEvaluatorAssigned,
        peerEvaluatorCompletedScorable: coverage.peerEvaluatorCompletedScorable,
        peerEvaluatorCompletedNoOpinion: coverage.peerEvaluatorCompletedNoOpinion,
        peerEvaluatorPending: coverage.peerEvaluatorPending,
        peerEvaluatorCountGenel: coverage.peerEvaluatorCountGenel,
        bySlice: coverage.bySlice,
        rows: coverage.rows,
      },
    }
  })

  const cards = flattenMatrixReportSlices(periodGroups)

  return NextResponse.json({
    success: true,
    person,
    /** Dönem başına genel + yan görev dilimleri (yan yana gösterim için) */
    periodGroups,
    /** Geriye uyumluluk — her dilim ayrı kart */
    cards,
    summary: buildMatrixReportSummary(cards),
  })
}
