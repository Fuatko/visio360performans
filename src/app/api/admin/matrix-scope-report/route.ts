import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  computeAssignmentScopePreview,
  loadPeriodEvaluatorScopeCache,
  loadScopePreviewPeriodContext,
  preloadDutyQuestionsByTarget,
  type AssignmentScopePreview,
} from '@/lib/server/evaluation-evaluator-scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_ROWS = 2000
const BATCH_SIZE = 40

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

export type MatrixScopeReportRow = {
  assignment_id: string
  evaluator_id: string
  target_id: string
  evaluator_name: string
  evaluator_title: string | null
  evaluator_department: string | null
  target_name: string
  target_title: string | null
  target_department: string | null
  preview: AssignmentScopePreview
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAssignmentsForPeriod(supabase: any, periodId: string) {
  const all: any[] = []
  const PAGE = 500
  let from = 0
  while (all.length < MAX_ROWS + 1) {
    const to = from + PAGE - 1
    const res = await supabase
      .from('evaluation_assignments')
      .select(
        `
        id,
        evaluator_id,
        target_id,
        evaluator:evaluator_id(id, name, title, department),
        target:target_id(id, name, title, department)
      `
      )
      .eq('period_id', periodId)
      .order('id', { ascending: true })
      .range(from, to)

    if (res.error) {
      const plain = await supabase
        .from('evaluation_assignments')
        .select('id, evaluator_id, target_id')
        .eq('period_id', periodId)
        .order('id', { ascending: true })
        .range(from, to)
      if (plain.error) throw plain.error
      all.push(...(plain.data || []))
      break
    }

    const page = res.data || []
    all.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }
  return all
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:matrix-scope-report', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek', detail: `Lütfen ${rl.retryAfterSec} sn sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const periodId = (url.searchParams.get('period_id') || '').trim()
  const orgId = (url.searchParams.get('org_id') || '').trim()
  const evaluatorId = (url.searchParams.get('evaluator_id') || '').trim()
  const targetId = (url.searchParams.get('target_id') || '').trim()

  if (!periodId) {
    return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })
  }

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  const periodOrg = String((period as any).organization_id || '')
  if (s.role === 'org_admin' && s.org_id && periodOrg !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }
  if (orgId && periodOrg !== orgId) {
    return NextResponse.json({ success: false, error: 'KVKK: dönem/kurum uyuşmuyor' }, { status: 403 })
  }

  let list: any[] = []
  try {
    list = await fetchAssignmentsForPeriod(supabase, periodId)
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Atamalar okunamadı' }, { status: 400 })
  }

  if (evaluatorId) list = list.filter((a) => String(a.evaluator_id) === evaluatorId)
  if (targetId) list = list.filter((a) => String(a.target_id) === targetId)

  const assignment_count = list.length
  const truncated = list.length > MAX_ROWS
  const slice = truncated ? list.slice(0, MAX_ROWS) : list

  if (!slice.length) {
    return NextResponse.json({
      success: true,
      period_id: periodId,
      assignment_count: 0,
      truncated: false,
      stats: { total: 0, avg_questions: 0, min_questions: 0, max_questions: 0, unscoped_count: 0, target_override_count: 0 },
      rows: [],
      message: 'Bu dönemde matris ataması yok. Önce atama ekleyin.',
    })
  }

  const [scopeCache, ctxBase] = await Promise.all([
    loadPeriodEvaluatorScopeCache(supabase, periodId),
    loadScopePreviewPeriodContext(supabase, periodId, { preloadQuestions: true }),
  ])
  const periodQIds = new Set((ctxBase.periodQuestionsBase || []).map((q) => String(q.id)))
  const dutyQuestionsByTarget = await preloadDutyQuestionsByTarget(supabase, periodId, periodQIds)
  const ctx = { ...ctxBase, scopeCache, dutyQuestionsByTarget }
  const rows: MatrixScopeReportRow[] = []
  let error_count = 0

  for (let i = 0; i < slice.length; i += BATCH_SIZE) {
    const chunk = slice.slice(i, i + BATCH_SIZE)
    const chunkRows = await Promise.all(
      chunk.map(async (a) => {
        const eid = String(a.evaluator_id || '')
        const tid = String(a.target_id || '')
        const base = {
          assignment_id: String(a.id),
          evaluator_id: eid,
          target_id: tid,
          evaluator_name: String(a.evaluator?.name || a.evaluator_id || ''),
          evaluator_title: a.evaluator?.title ? String(a.evaluator.title) : null,
          evaluator_department: a.evaluator?.department ? String(a.evaluator.department) : null,
          target_name: String(a.target?.name || a.target_id || ''),
          target_title: a.target?.title ? String(a.target.title) : null,
          target_department: a.target?.department ? String(a.target.department) : null,
        }
        if (!eid || !tid) {
          error_count += 1
          return {
            ...base,
            preview: {
              question_count: 0,
              period_question_count: 0,
              duty_question_count: 0,
              scope_kind: 'all_unscoped' as const,
              scope_label: 'Geçersiz atama',
              restrict_period: false,
              duty_mode: 'full' as const,
              period_category_labels: [],
              duty_package_labels: [],
              target_duty_names: [],
              breakdown: [],
            },
          }
        }
        try {
          const preview = await computeAssignmentScopePreview(supabase, periodId, eid, tid, ctx)
          return { ...base, preview }
        } catch {
          error_count += 1
          return {
            ...base,
            preview: {
              question_count: 0,
              period_question_count: 0,
              duty_question_count: 0,
              scope_kind: 'all_unscoped' as const,
              scope_label: 'Önizleme hatası',
              restrict_period: false,
              duty_mode: 'full' as const,
              period_category_labels: [],
              duty_package_labels: [],
              target_duty_names: [],
              breakdown: [],
            },
          }
        }
      })
    )
    rows.push(...chunkRows)
  }

  const stats = {
    total: rows.length,
    avg_questions: rows.length
      ? Math.round(rows.reduce((sum, r) => sum + r.preview.question_count, 0) / rows.length)
      : 0,
    min_questions: rows.length ? Math.min(...rows.map((r) => r.preview.question_count)) : 0,
    max_questions: rows.length ? Math.max(...rows.map((r) => r.preview.question_count)) : 0,
    unscoped_count: rows.filter((r) => r.preview.scope_kind === 'all_unscoped').length,
    target_override_count: rows.filter((r) => r.preview.scope_kind === 'target_override').length,
  }

  return NextResponse.json(
    {
      success: true,
      period_id: periodId,
      assignment_count,
      computed_count: rows.length,
      error_count,
      truncated,
      stats,
      rows,
      message:
        rows.length > 0
          ? `${rows.length} atama için puanlanacak soru özeti hesaplandı.`
          : 'Sonuç üretilemedi.',
    },
    { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } }
  )
}
