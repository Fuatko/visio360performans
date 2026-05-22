import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  buildMatrixAssignmentPreview,
  buildMatrixAssignmentTemplateWorkbook,
  collectMatrixPairsFromGrid,
  parseMatrixAssignmentExcel,
  parseMatrixAssignmentGrid,
} from '@/lib/matrix-assignment-import'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INSERT_BATCH = 200

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl.replace(/\/$/, ''), service)
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  return new NextResponse(new Uint8Array(buildMatrixAssignmentTemplateWorkbook()), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="degerlendirme_matrisi_sablonu.xlsx"',
    },
  })
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:period-matrix-import', String(s.uid || ''), 15, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek', detail: `Lütfen ${rl.retryAfterSec} sn sonra deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const form = await req.formData()
  const periodId = String(form.get('period_id') || '').trim()
  const dryRun = String(form.get('dry_run') || 'true') === 'true'
  const replacePending = String(form.get('replace_pending') || 'false') === 'true'
  const file = form.get('file')

  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Excel dosyası (file) gerekli' }, { status: 400 })
  }

  const { data: period, error: periodErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()

  if (periodErr || !period) {
    return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  }
  if (s.role === 'org_admin' && s.org_id && String((period as any).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  const orgId = String((period as any).organization_id || '')

  const [usersRes, assignmentsRes] = await Promise.all([
    supabase.from('users').select('id, name, email, title').eq('organization_id', orgId).eq('status', 'active').order('name'),
    supabase.from('evaluation_assignments').select('id, evaluator_id, target_id, status').eq('period_id', periodId),
  ])

  if (usersRes.error) {
    return NextResponse.json({ success: false, error: usersRes.error.message }, { status: 400 })
  }
  if (assignmentsRes.error) {
    return NextResponse.json({ success: false, error: assignmentsRes.error.message }, { status: 400 })
  }

  const users = (usersRes.data || []) as any[]
  const existing = ((assignmentsRes.data || []) as any[]).map((a) => ({
    evaluator_id: String(a.evaluator_id),
    target_id: String(a.target_id),
    status: String(a.status || 'pending'),
  }))
  const completedCount = existing.filter((a) => a.status === 'completed').length
  const completedKeys = new Set(
    existing.filter((a) => a.status === 'completed').map((a) => `${a.evaluator_id}::${a.target_id}`)
  )

  const buf = await file.arrayBuffer()
  const parsed = parseMatrixAssignmentExcel(buf)
  if (parsed.errors.length && !parsed.stats.cellsWithOne) {
    return NextResponse.json({ success: false, dry_run: true, preview: parsed }, { status: 400 })
  }

  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const matrix = sheet
    ? (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][])
    : []
  const grid = parseMatrixAssignmentGrid(matrix)

  let preview = buildMatrixAssignmentPreview(
    grid,
    users,
    existing.map((a) => ({ evaluator_id: a.evaluator_id, target_id: a.target_id }))
  )

  const { pairs: allExcelPairs } = collectMatrixPairsFromGrid(grid, users)

  if (replacePending) {
    preview = {
      ...preview,
      warnings: [
        `Tam senkron: bekleyen atamalar silinir, Excel'deki «1» hücreleri yazılır (tamamlanmış ${completedCount} atama korunur).`,
        ...preview.warnings,
      ],
      stats: {
        ...preview.stats,
        assignmentsToAdd: allExcelPairs.filter((p) => !completedKeys.has(`${p.evaluatorId}::${p.targetId}`)).length,
      },
    }
  }

  if (dryRun) {
    return NextResponse.json({
      success: preview.errors.length === 0 || preview.pairs.length > 0 || allExcelPairs.length > 0,
      dry_run: true,
      preview,
      completed_assignments: completedCount,
      excel_pairs_total: allExcelPairs.length,
    })
  }

  const toInsertKeys = new Set<string>()
  if (replacePending) {
    for (const p of allExcelPairs) {
      const key = `${p.evaluatorId}::${p.targetId}`
      if (!completedKeys.has(key)) toInsertKeys.add(key)
    }
  } else {
    if (!preview.pairs.length) {
      return NextResponse.json({ success: false, error: 'Uygulanacak yeni atama yok', preview }, { status: 400 })
    }
    for (const p of preview.pairs) {
      toInsertKeys.add(`${p.evaluatorId}::${p.targetId}`)
    }
  }

  let deletedPending = 0
  if (replacePending) {
    const { error: delErr } = await supabase
      .from('evaluation_assignments')
      .delete()
      .eq('period_id', periodId)
      .eq('status', 'pending')
    if (delErr) {
      return NextResponse.json({ success: false, error: delErr.message || 'Bekleyen atamalar silinemedi' }, { status: 400 })
    }
    deletedPending = existing.filter((a) => a.status !== 'completed').length
  }

  const payload = Array.from(toInsertKeys).map((k) => {
    const [evaluator_id, target_id] = k.split('::')
    return { period_id: periodId, evaluator_id, target_id, status: 'pending' as const }
  })

  let inserted = 0
  for (let i = 0; i < payload.length; i += INSERT_BATCH) {
    const batch = payload.slice(i, i + INSERT_BATCH)
    const { error: insErr } = await supabase.from('evaluation_assignments').insert(batch)
    if (insErr) {
      return NextResponse.json({ success: false, error: insErr.message || 'Atamalar kaydedilemedi' }, { status: 400 })
    }
    inserted += batch.length
  }

  return NextResponse.json({
    success: true,
    dry_run: false,
    preview,
    applied: { inserted, deleted_pending: deletedPending, replace_pending: replacePending },
  })
}
