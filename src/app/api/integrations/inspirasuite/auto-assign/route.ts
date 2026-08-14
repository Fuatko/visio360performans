import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { buildMatrixReportPeriodGroups, flattenMatrixReportSlices } from '@/lib/server/matrix-report-slices'
import { autoAssignForGaps, getInspiraConfig, type CompetencyGap } from '@/lib/server/inspirasuite'
import { isPgEnabled } from '@/lib/db'
import { pgRead, pgReadOne } from '@/lib/server/pg-read'

export const runtime = 'nodejs'

function getSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

// Fixed target on the 1..5 scale. A meaningful gap is peer score falling
// >= 0.5 below this target. Overridable via env.
function targetScore() {
  const t = Number(process.env.INSPIRASUITE_TARGET_SCORE)
  return Number.isFinite(t) && t > 0 ? t : 4.0
}

// POST — Yetkinlik açıklarını (sabit hedefe göre) tespit et ve InspiraSuite'te otomatik kurs ata
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'integrations:inspirasuite:auto-assign', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  if (!(await getInspiraConfig()).enabled) {
    return NextResponse.json({ success: false, error: 'InspiraSuite entegrasyonu aktif değil' }, { status: 503 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as { person_id?: string }
  const personId = String(body.person_id || '').trim()
  if (!personId) return NextResponse.json({ success: false, error: 'person_id gerekli' }, { status: 400 })

  const { data: person, error: pErr } = isPgEnabled()
    ? await pgReadOne<{ id: string; name: string; email: string; organization_id: string }>(
        'select id, name, email, organization_id from users where id = $1 limit 1',
        [personId]
      )
    : await supabase
        .from('users')
        .select('id,name,email,organization_id')
        .eq('id', personId)
        .maybeSingle()
  if (pErr || !person || !(person as any).email) {
    return NextResponse.json({ success: false, error: 'Kişi bulunamadı' }, { status: 404 })
  }
  const orgId = String((person as any).organization_id || '')
  if (s.role === 'org_admin' && orgId !== String(s.org_id || '')) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  // --- Recompute the person's peer category scores (same pipeline as the report card) ---
  const { data: assignments, error: aErr } = isPgEnabled()
    ? await pgRead(
        `select a.id, a.evaluator_id, a.target_id, a.status, a.completed_at, a.matrix_context,
           case when ev.id is null then null else jsonb_build_object(
             'id', ev.id, 'name', ev.name, 'position_level', ev.position_level
           ) end as evaluator,
           case when p.id is null then null else jsonb_build_object(
             'id', p.id, 'name', p.name, 'name_en', p.name_en, 'name_fr', p.name_fr,
             'start_date', p.start_date, 'end_date', p.end_date, 'assessment_kind', p.assessment_kind,
             'results_released', p.results_released, 'organization_id', p.organization_id
           ) end as evaluation_periods
         from evaluation_assignments a
         left join users ev on ev.id = a.evaluator_id
         left join evaluation_periods p on p.id = a.period_id
         where a.target_id = $1`,
        [personId]
      )
    : await supabase
        .from('evaluation_assignments')
        .select(
          `id, evaluator_id, target_id, status, completed_at, matrix_context,
       evaluator:evaluator_id(id, name, position_level),
       evaluation_periods(id, name, name_en, name_fr, start_date, end_date, assessment_kind, results_released, organization_id)`
        )
        .eq('target_id', personId)
  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atamalar alınamadı' }, { status: 400 })

  const rows = (assignments || []).filter(
    (a: any) => String(a?.evaluation_periods?.organization_id || '') === orgId && String(a?.status || '') === 'completed'
  )
  const assignmentIds = rows.map((a: any) => String(a.id)).filter(Boolean)

  const responsesByAssignment = new Map<string, any[]>()
  if (assignmentIds.length) {
    const { data: responses } = isPgEnabled()
      ? await pgRead('select * from evaluation_responses where assignment_id = any($1::uuid[])', [assignmentIds])
      : await supabase.from('evaluation_responses').select('*').in('assignment_id', assignmentIds)
    ;((responses || []) as any[]).forEach((r) => {
      const aid = String(r.assignment_id || '')
      if (!aid) return
      const cur = responsesByAssignment.get(aid) || []
      cur.push(r)
      responsesByAssignment.set(aid, cur)
    })
  }

  const periodGroups = buildMatrixReportPeriodGroups({
    assignments: rows,
    responsesByAssignment,
    standardsByAssignment: new Map(),
    categoryByQuestionId: new Map(),
    categoryById: new Map(),
    categoryWeightByName: {},
    includeSelf: false,
  })
  const slices = flattenMatrixReportSlices(periodGroups)

  // Aggregate each competency to its worst (lowest) peer score across slices.
  const worstByName = new Map<string, number>()
  for (const slice of slices) {
    for (const c of slice.categoryCompare || []) {
      const peer = Number(c.peer)
      if (!c.name || !Number.isFinite(peer) || peer <= 0) continue
      const prev = worstByName.get(c.name)
      if (prev === undefined || peer < prev) worstByName.set(c.name, peer)
    }
  }

  const target = targetScore()
  const competencies: CompetencyGap[] = Array.from(worstByName.entries()).map(([name, peer]) => ({
    name,
    score: Math.round(peer * 100) / 100,
    required_score: target,
  }))

  const assigned = await autoAssignForGaps({
    supabase,
    evaluatee: { email: (person as any).email, organization_id: orgId },
    competencies,
    assignedBy: 'Visio360PDS (Otomatik)',
    minGap: 0.5,
  })

  return NextResponse.json({
    success: true,
    target,
    evaluated: competencies.length,
    assigned: assigned.map((a) => ({ competency: a.competency, course_title: a.course.title, course_id: a.course.id })),
  })
}
