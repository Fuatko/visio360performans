import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'
import { matrixEvaluationContextLabel } from '@/lib/matrix-evaluation-context'

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

type Body = {
  period_id?: string
  org_id?: string
}

const ASSIGNMENTS_PAGE = 1000
/** Supabase .in() URL limit — results route ile aynı */
const RESPONSES_IN_CHUNK = 100

function numericScore(r: { reel_score?: unknown; std_score?: unknown; score?: unknown }): number {
  const n = Number(r?.reel_score ?? r?.std_score ?? r?.score ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Tamamlanmış atama: en az bir yanıt var ve hiçbirinde puan > 0 yok (= tamamı Fikrim yok). */
function isAllNoOpinionResponses(responses: Array<{ reel_score?: unknown; std_score?: unknown; score?: unknown }>): boolean {
  if (!responses.length) return false
  return responses.every((r) => numericScore(r) <= 0)
}

export type NoOpinionReportRow = {
  assignmentId: string
  evaluatorId: string
  evaluatorName: string
  evaluatorDept: string
  evaluatorLevel: string
  targetId: string
  targetName: string
  targetDept: string
  matrixContext: string
  matrixContextLabel: string
  isSelf: boolean
  responseCount: number
  completedAt: string | null
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:no-opinion-report:post', String(s.uid || ''), 30, 60 * 1000)
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
  const orgIdParam = String(body.org_id || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : orgIdParam

  if (!periodId || !orgId) {
    return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })
  }

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (String((period as any).organization_id || '') !== orgId) {
    return NextResponse.json({ success: false, error: 'Dönem/kurum uyuşmuyor' }, { status: 403 })
  }

  type AssignRow = {
    id: string
    evaluator_id: string
    target_id: string
    matrix_context: string | null
    completed_at: string | null
    evaluator: { id?: string; name?: string; department?: string; position_level?: string } | null
    target: { id?: string; name?: string; department?: string; organization_id?: string } | null
  }

  const completedAssignments: AssignRow[] = []
  let from = 0
  while (true) {
    const { data: rows, error } = await supabase
      .from('evaluation_assignments')
      .select(
        `
        id, evaluator_id, target_id, matrix_context, completed_at,
        evaluator:evaluator_id(id, name, department, position_level),
        target:target_id(id, name, department, organization_id)
      `
      )
      .eq('period_id', periodId)
      .eq('status', 'completed')
      .order('id', { ascending: true })
      .range(from, from + ASSIGNMENTS_PAGE - 1)

    if (error) return NextResponse.json({ success: false, error: error.message || 'Atamalar alınamadı' }, { status: 400 })
    const part = (rows || []) as AssignRow[]
    for (const a of part) {
      const tOrg = String(a?.target?.organization_id || '')
      if (tOrg && tOrg !== orgId) continue
      completedAssignments.push(a)
    }
    if (part.length < ASSIGNMENTS_PAGE) break
    from += ASSIGNMENTS_PAGE
  }

  const responsesByAssignment = new Map<string, Array<{ reel_score?: unknown; std_score?: unknown; score?: unknown }>>()
  const assignmentIds = completedAssignments.map((a) => String(a.id))
  for (let i = 0; i < assignmentIds.length; i += RESPONSES_IN_CHUNK) {
    const chunk = assignmentIds.slice(i, i + RESPONSES_IN_CHUNK)
    if (!chunk.length) continue
    const { data: respRows, error: rErr } = await supabase
      .from('evaluation_responses')
      .select('assignment_id, std_score, reel_score')
      .in('assignment_id', chunk)
    if (rErr) return NextResponse.json({ success: false, error: rErr.message || 'Yanıtlar alınamadı' }, { status: 400 })
    for (const r of respRows || []) {
      const aid = String((r as any).assignment_id || '')
      if (!aid) continue
      const cur = responsesByAssignment.get(aid) || []
      cur.push(r as any)
      responsesByAssignment.set(aid, cur)
    }
  }

  const reportRows: NoOpinionReportRow[] = []
  for (const a of completedAssignments) {
    const aid = String(a.id)
    const responses = responsesByAssignment.get(aid) || []
    if (!isAllNoOpinionResponses(responses)) continue

    const evalId = String(a.evaluator?.id || a.evaluator_id || '')
    const targetId = String(a.target?.id || a.target_id || '')
    const matrixContext = String(a.matrix_context || 'genel')
    reportRows.push({
      assignmentId: aid,
      evaluatorId: evalId,
      evaluatorName: String(a.evaluator?.name || '-'),
      evaluatorDept: String(a.evaluator?.department || '-'),
      evaluatorLevel: String(a.evaluator?.position_level || 'peer'),
      targetId,
      targetName: String(a.target?.name || '-'),
      targetDept: String(a.target?.department || '-'),
      matrixContext,
      matrixContextLabel: matrixEvaluationContextLabel(matrixContext),
      isSelf: userIdsEqualForSelfEval(evalId, targetId),
      responseCount: responses.length,
      completedAt: a.completed_at ? String(a.completed_at) : null,
    })
  }

  reportRows.sort(
    (a, b) =>
      a.evaluatorName.localeCompare(b.evaluatorName, 'tr') ||
      a.targetName.localeCompare(b.targetName, 'tr') ||
      a.matrixContextLabel.localeCompare(b.matrixContextLabel, 'tr')
  )

  const evaluatorIds = new Set(reportRows.map((r) => r.evaluatorId))
  const targetIds = new Set(reportRows.map((r) => r.targetId))

  return NextResponse.json({
    success: true,
    totals: {
      completedAssignments: completedAssignments.length,
      allNoOpinionCount: reportRows.length,
      uniqueEvaluators: evaluatorIds.size,
      uniqueTargets: targetIds.size,
    },
    rows: reportRows,
  })
}
