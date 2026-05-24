import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  computeAssignmentScopePreview,
  loadBulkScopeReportContext,
  type AssignmentScopePreview,
} from '@/lib/server/evaluation-evaluator-scope'
import { assignmentMatchesDepartment } from '@/lib/user-departments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_ROWS = 5000
const DEFAULT_PAGE_SIZE = 350
const MAX_PAGE_SIZE = 500
const BATCH_SIZE = 80

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
  matrix_context?: string
  evaluator_name: string
  evaluator_title: string | null
  evaluator_department: string | null
  target_name: string
  target_title: string | null
  target_department: string | null
  preview: AssignmentScopePreview
}

function statsFromRows(rows: MatrixScopeReportRow[]) {
  return {
    total: rows.length,
    avg_questions: rows.length
      ? Math.round(rows.reduce((sum, r) => sum + r.preview.question_count, 0) / rows.length)
      : 0,
    min_questions: rows.length ? Math.min(...rows.map((r) => r.preview.question_count)) : 0,
    max_questions: rows.length ? Math.max(...rows.map((r) => r.preview.question_count)) : 0,
    unscoped_count: rows.filter((r) => r.preview.scope_kind === 'all_unscoped').length,
    target_override_count: rows.filter((r) => r.preview.scope_kind === 'target_override').length,
  }
}

function emptyPreview(label: string): AssignmentScopePreview {
  return {
    question_count: 0,
    period_question_count: 0,
    duty_question_count: 0,
    scope_kind: 'all_unscoped',
    scope_label: label,
    restrict_period: false,
    duty_mode: 'full',
    period_category_labels: [],
    duty_package_labels: [],
    target_duty_names: [],
    breakdown: [],
  }
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
        matrix_context,
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
        .select('id, evaluator_id, target_id, matrix_context')
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeRowsForAssignments(supabase: any, periodId: string, slice: any[], fullDetail: boolean) {
  /** Tek satır detay (göz ikonu): tam kategori dökümü — önbellek yüklemesine gerek yok */
  const ctx =
    fullDetail && slice.length === 1 ? undefined : await loadBulkScopeReportContext(supabase, periodId)

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
          return { ...base, preview: emptyPreview('Geçersiz atama') }
        }
        try {
          const mctx = String(a.matrix_context || 'genel')
          const preview = await computeAssignmentScopePreview(supabase, periodId, eid, tid, ctx, mctx)
          return { ...base, matrix_context: mctx, preview }
        } catch {
          error_count += 1
          return { ...base, preview: emptyPreview('Önizleme hatası') }
        }
      })
    )
    rows.push(...chunkRows)
  }

  return { rows, error_count }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:matrix-scope-report', String(s.uid || ''), 60, 60 * 1000)
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
  const department = (url.searchParams.get('department') || '').trim()
  const fullDetail = url.searchParams.get('full') === '1' || url.searchParams.get('detail') === '1'
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0)
  const limitRaw = parseInt(url.searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10)
  const limit = Math.min(Math.max(1, limitRaw || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)

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
  if (department) {
    list = list.filter((a) =>
      assignmentMatchesDepartment(
        (a as { evaluator?: { department: string | null } | null }).evaluator ?? undefined,
        (a as { target?: { department: string | null } | null }).target ?? undefined,
        department
      )
    )
  }

  const assignment_count = list.length
  const filtered_by_department = department || null
  const truncated = list.length > MAX_ROWS
  const capped = truncated ? list.slice(0, MAX_ROWS) : list

  if (!capped.length) {
    return NextResponse.json({
      success: true,
      period_id: periodId,
      assignment_count: 0,
      filtered_by_department,
      truncated: false,
      offset: 0,
      limit,
      has_more: false,
      stats: statsFromRows([]),
      rows: [],
      message: department
        ? 'Bu birim için matris ataması bulunamadı.'
        : 'Bu dönemde matris ataması yok. Önce atama ekleyin.',
    })
  }

  const pageSlice = fullDetail && capped.length === 1 ? capped : capped.slice(offset, offset + limit)
  const has_more = !fullDetail && offset + pageSlice.length < capped.length

  try {
    const { rows, error_count } = await computeRowsForAssignments(supabase, periodId, pageSlice, fullDetail)
    const stats = statsFromRows(rows)

    return NextResponse.json(
      {
        success: true,
        period_id: periodId,
        assignment_count,
        filtered_by_department,
        computed_count: rows.length,
        error_count,
        truncated,
        offset: fullDetail ? 0 : offset,
        limit: pageSlice.length,
        has_more,
        stats,
        rows,
        message: has_more
          ? `${offset + rows.length} / ${capped.length} atama hesaplandı — devam ediliyor…`
          : rows.length > 0
            ? `${capped.length} atama için puanlanacak soru özeti hesaplandı.`
            : 'Sonuç üretilemedi.',
      },
      { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } }
    )
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: e?.message || 'Kapsam raporu hesaplanamadı',
        assignment_count,
        offset,
        limit,
      },
      { status: 500 }
    )
  }
}
