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
import {
  assignMatrixPresetDutyToTargets,
  type MatrixDutyAssignResult,
  type MatrixDutyPreset,
} from '@/lib/matrix-target-duty-assign'
import {
  applyEvaluatorCategoryScopesFromMatrix,
  buildEvaluatorCategoryScopes,
} from '@/lib/matrix-evaluator-category-scope'
import { assignmentPairKey, resolveMatrixContextFromImport } from '@/lib/matrix-evaluation-context'
import * as XLSX from 'xlsx'
import { MATRIX_PARSER_VERSION } from '@/lib/matrix-assignment-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Matrix-Parser-Version': MATRIX_PARSER_VERSION,
}

const INSERT_BATCH = 200

const MATRIX_DUTY_KIND_LABEL: Record<MatrixDutyPreset, string> = {
  zumre: 'Zümre başkanı',
  sinif_ogretmeni: 'Sınıf öğretmeni',
  rehberlik_ogretmeni: 'Rehberlik öğretmeni',
  nobetci_ogretmeni: 'Nöbetçi öğretmeni',
  kulup_ogretmeni: 'Kulüp öğretmeni',
  formator: 'Formatör',
  yasam_koordinatoru: 'Okul içi yaşam koordinatörü',
  bilimsel_etkinlik_koordinatoru: 'Bilimsel etkinlik koordinatörü',
}

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

  const url = new URL(req.url)
  if (url.searchParams.get('meta') === '1') {
    return NextResponse.json(
      { success: true, parser_version: MATRIX_PARSER_VERSION, matrix_import_mode: 'browser_preview' },
      { headers: NO_CACHE_HEADERS }
    )
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
  const assignZumreDuty = String(form.get('assign_zumre_duty') || 'false') === 'true'
  const assignSinifDuty = String(form.get('assign_sinif_duty') || 'false') === 'true'
  const assignRehberDuty = String(form.get('assign_rehber_duty') || 'false') === 'true'
  const assignNobetciDuty = String(form.get('assign_nobetci_duty') || 'false') === 'true'
  const assignKulupDuty = String(form.get('assign_kulup_duty') || 'false') === 'true'
  const assignFormatorDuty = String(form.get('assign_formator_duty') || 'false') === 'true'
  const assignYasamKoordinatoruDuty = String(form.get('assign_yasam_koordinatoru_duty') || 'false') === 'true'
  const assignBilimselEtkinlikKoordinatoruDuty =
    String(form.get('assign_bilimsel_etkinlik_koordinatoru_duty') || 'false') === 'true'
  const applyEvaluatorScopeFromMatrix = String(form.get('apply_evaluator_scope_from_matrix') || 'true') === 'true'
  const file = form.get('file')

  const dutyPresetCount = [
    assignZumreDuty,
    assignSinifDuty,
    assignRehberDuty,
    assignNobetciDuty,
    assignKulupDuty,
    assignFormatorDuty,
    assignYasamKoordinatoruDuty,
    assignBilimselEtkinlikKoordinatoruDuty,
  ].filter(Boolean).length
  if (dutyPresetCount > 1) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Aynı yüklemede yalnızca bir otomatik görev kutusu seçin (Zümre, Sınıf, Rehberlik, Nöbetçi, Kulüp öğretmeni, Formatör, Okul içi yaşam koordinatörü veya Bilimsel etkinlik koordinatörü).',
      },
      { status: 400 }
    )
  }
  const dutyPreset: MatrixDutyPreset | null = assignZumreDuty
    ? 'zumre'
    : assignSinifDuty
      ? 'sinif_ogretmeni'
      : assignRehberDuty
        ? 'rehberlik_ogretmeni'
        : assignNobetciDuty
          ? 'nobetci_ogretmeni'
          : assignKulupDuty
            ? 'kulup_ogretmeni'
            : assignFormatorDuty
              ? 'formator'
              : assignYasamKoordinatoruDuty
                ? 'yasam_koordinatoru'
                : assignBilimselEtkinlikKoordinatoruDuty
                  ? 'bilimsel_etkinlik_koordinatoru'
                  : null

  const matrixContext = resolveMatrixContextFromImport({
    applyCategoryScope: applyEvaluatorScopeFromMatrix,
    dutyPreset,
  })

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

  const [usersRes, assignmentsResRaw] = await Promise.all([
    supabase.from('users').select('id, name, email, title').eq('organization_id', orgId).eq('status', 'active').order('name'),
    supabase
      .from('evaluation_assignments')
      .select('id, evaluator_id, target_id, status, matrix_context')
      .eq('period_id', periodId),
  ])

  if (usersRes.error) {
    return NextResponse.json({ success: false, error: usersRes.error.message }, { status: 400 })
  }

  let assignmentRows: any[] = (assignmentsResRaw.data || []) as any[]
  if (assignmentsResRaw.error) {
    if (String(assignmentsResRaw.error.message || '').includes('matrix_context')) {
      const legacy = await supabase
        .from('evaluation_assignments')
        .select('id, evaluator_id, target_id, status')
        .eq('period_id', periodId)
      if (legacy.error) {
        return NextResponse.json({ success: false, error: legacy.error.message }, { status: 400 })
      }
      assignmentRows = (legacy.data || []) as any[]
    } else {
      return NextResponse.json({ success: false, error: assignmentsResRaw.error.message }, { status: 400 })
    }
  }

  const users = (usersRes.data || []) as any[]
  const existing = assignmentRows.map((a) => ({
    evaluator_id: String(a.evaluator_id),
    target_id: String(a.target_id),
    status: String(a.status || 'pending'),
    matrix_context: String(a.matrix_context || 'genel'),
  }))
  const completedCount = existing.filter((a) => a.status === 'completed').length
  const completedKeys = new Set(
    existing
      .filter((a) => a.status === 'completed')
      .map((a) => assignmentPairKey(a.evaluator_id, a.target_id, a.matrix_context))
  )
  const existingForPreview = existing.map((a) => ({
    evaluator_id: a.evaluator_id,
    target_id: a.target_id,
    matrix_context: a.matrix_context,
  }))

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

  let evaluatorCategoryScopes: Awaited<ReturnType<typeof buildEvaluatorCategoryScopes>> = []
  const clientScopesRaw = String(form.get('category_scopes_json') || '').trim()
  if (clientScopesRaw && applyEvaluatorScopeFromMatrix) {
    try {
      const parsed = JSON.parse(clientScopesRaw) as unknown
      if (Array.isArray(parsed)) {
        evaluatorCategoryScopes = parsed
          .map((row) => {
            const o = row as Record<string, unknown>
            const evaluatorLabel = String(o.evaluatorLabel || o.evaluator_label || '').trim()
            const categoryLabels = Array.isArray(o.categoryLabels || o.category_labels)
              ? (o.categoryLabels || o.category_labels) as unknown[]
              : []
            if (!evaluatorLabel || !categoryLabels.length) return null
            return {
              evaluatorColIdx: Number(o.evaluatorColIdx ?? o.evaluator_col_idx ?? 0),
              evaluatorLabel,
              categoryColIdx: Number(o.categoryColIdx ?? o.category_col_idx ?? 0),
              categoryLabels: categoryLabels.map((x) => String(x)).filter(Boolean),
            }
          })
          .filter(Boolean) as Awaited<ReturnType<typeof buildEvaluatorCategoryScopes>>
      }
    } catch {
      /* sunucu parse */
    }
  }
  if (!evaluatorCategoryScopes.length && applyEvaluatorScopeFromMatrix) {
    evaluatorCategoryScopes = buildEvaluatorCategoryScopes(matrix, grid)
  }

  const { pairs: allExcelPairs } = collectMatrixPairsFromGrid(grid, users)
  const matrixTargetIds = Array.from(new Set(allExcelPairs.map((p) => p.targetId)))
  const categoryScopePairOpts = { assignmentPairs: allExcelPairs, matrixContext }

  let matrixCategoryScopePreview: Awaited<ReturnType<typeof applyEvaluatorCategoryScopesFromMatrix>> | null =
    null
  if (evaluatorCategoryScopes.length) {
    matrixCategoryScopePreview = await applyEvaluatorCategoryScopesFromMatrix(
      supabase,
      periodId,
      evaluatorCategoryScopes,
      users,
      { dryRun: true, ...categoryScopePairOpts }
    )
    if (!matrixCategoryScopePreview.ok) {
      return NextResponse.json(
        {
          success: false,
          dry_run: true,
          error: matrixCategoryScopePreview.error,
          preview: buildMatrixAssignmentPreview(grid, users, existingForPreview, matrixContext),
        },
        { status: 400 }
      )
    }
  }

  let preview = buildMatrixAssignmentPreview(grid, users, existingForPreview, matrixContext)

  let matrixDutyPreview: MatrixDutyAssignResult | null = null
  if (dutyPreset) {
    const { data: duties } = await supabase
      .from('evaluation_duties')
      .select('id, name, code, name_en, name_fr')
      .eq('period_id', periodId)
      .eq('is_active', true)
    matrixDutyPreview = await assignMatrixPresetDutyToTargets(
      supabase,
      periodId,
      matrixTargetIds,
      (duties || []) as any[],
      dutyPreset,
      { dryRun }
    )
    const kindLabel = MATRIX_DUTY_KIND_LABEL[dutyPreset]
    if (!matrixDutyPreview.ok) {
      preview = {
        ...preview,
        errors: [...preview.errors, matrixDutyPreview.error || `${kindLabel} görevi atanamadı`],
      }
    } else if (dryRun) {
      preview = {
        ...preview,
        warnings: [
          `${kindLabel} matrisi: ${matrixDutyPreview.targets_in_matrix} hedefe «${matrixDutyPreview.duty_name}» görevi uygulamada atanacak (${matrixDutyPreview.duties_added} yeni, ${matrixDutyPreview.duties_already} zaten vardı).`,
          'Değerlendiren kapsamında «Yan görev yok» + genel kategoriler kayıtlı olmalı — sonra kapsamda G:21 + Y:… görünür.',
          ...preview.warnings,
        ],
      }
    }
  }

  if (matrixCategoryScopePreview?.applied.length) {
    for (const row of matrixCategoryScopePreview.applied) {
      const extra =
        row.unmatched_labels.length > 0
          ? ` (${row.unmatched_labels.length} kategori eşleşmedi: ${row.unmatched_labels.join(', ')})`
          : ''
      const pairNote =
        (matrixCategoryScopePreview.pairs_applied || 0) > 0
          ? ` — ${row.assignment_pairs} matris satırına hedefe özel kapsam`
          : ''
      preview = {
        ...preview,
        warnings: [
          `Sağ sütun kapsamı — «${row.evaluator_label}»: ${row.category_labels.length} kategori${pairNote} (${row.matched_category_ids.length} eşleşti)${extra}. Yan görev: hedef görevine göre otomatik.`,
          ...preview.warnings,
        ],
      }
    }
  }

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

  const previewPayload = {
    ...preview,
    parser_version: preview.parser_version || MATRIX_PARSER_VERSION,
    grid_meta: {
      category_col_idx: grid.categoryColIdx,
      category_col_label: grid.categoryColLabel,
      evaluator_labels: grid.evaluatorCols.map((e) => e.label),
    },
  }

  if (dryRun) {
    return NextResponse.json(
      {
        success:
          (preview.errors.length === 0 || preview.pairs.length > 0 || allExcelPairs.length > 0) &&
          (!dutyPreset || matrixDutyPreview?.ok !== false),
        dry_run: true,
        preview: previewPayload,
        completed_assignments: completedCount,
        excel_pairs_total: allExcelPairs.length,
        assign_zumre_duty: assignZumreDuty,
        assign_sinif_duty: assignSinifDuty,
        assign_rehber_duty: assignRehberDuty,
        assign_nobetci_duty: assignNobetciDuty,
        assign_kulup_duty: assignKulupDuty,
        assign_formator_duty: assignFormatorDuty,
        assign_yasam_koordinatoru_duty: assignYasamKoordinatoruDuty,
        assign_bilimsel_etkinlik_koordinatoru_duty: assignBilimselEtkinlikKoordinatoruDuty,
        matrix_duty: matrixDutyPreview,
        evaluator_category_scopes: matrixCategoryScopePreview?.applied ?? [],
      },
      { headers: NO_CACHE_HEADERS }
    )
  }

  const toInsertKeys = new Set<string>()
  if (replacePending) {
    for (const p of allExcelPairs) {
      const key = assignmentPairKey(p.evaluatorId, p.targetId, matrixContext)
      if (!completedKeys.has(key)) toInsertKeys.add(key)
    }
  } else {
    if (!preview.pairs.length && !dutyPreset && !evaluatorCategoryScopes.length) {
      return NextResponse.json({ success: false, error: 'Uygulanacak yeni atama yok', preview }, { status: 400 })
    }
    for (const p of preview.pairs) {
      toInsertKeys.add(assignmentPairKey(p.evaluatorId, p.targetId, matrixContext))
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
    const parts = k.split('::')
    const evaluator_id = parts[0]
    const target_id = parts[1]
    const ctx = parts[2] || matrixContext
    return { period_id: periodId, evaluator_id, target_id, matrix_context: ctx, status: 'pending' as const }
  })

  let inserted = 0
  if (payload.length) {
    for (let i = 0; i < payload.length; i += INSERT_BATCH) {
      const batch = payload.slice(i, i + INSERT_BATCH)
      const { error: insErr } = await supabase.from('evaluation_assignments').insert(batch)
      if (insErr) {
        return NextResponse.json({ success: false, error: insErr.message || 'Atamalar kaydedilemedi' }, { status: 400 })
      }
      inserted += batch.length
    }
  }

  let matrixCategoryScopeApplied: Awaited<ReturnType<typeof applyEvaluatorCategoryScopesFromMatrix>> | null =
    null
  if (evaluatorCategoryScopes.length) {
    matrixCategoryScopeApplied = await applyEvaluatorCategoryScopesFromMatrix(
      supabase,
      periodId,
      evaluatorCategoryScopes,
      users,
      categoryScopePairOpts
    )
    if (!matrixCategoryScopeApplied.ok) {
      return NextResponse.json(
        {
          success: false,
          error: matrixCategoryScopeApplied.error || 'Değerlendiren kapsamı yazılamadı',
          preview,
          applied: { inserted, deleted_pending: deletedPending, replace_pending: replacePending },
        },
        { status: 400 }
      )
    }
  }

  let matrixDutyApplied: MatrixDutyAssignResult | null = null
  if (dutyPreset) {
    const { data: duties } = await supabase
      .from('evaluation_duties')
      .select('id, name, code, name_en, name_fr')
      .eq('period_id', periodId)
      .eq('is_active', true)
    matrixDutyApplied = await assignMatrixPresetDutyToTargets(
      supabase,
      periodId,
      matrixTargetIds,
      (duties || []) as any[],
      dutyPreset
    )
    if (!matrixDutyApplied.ok) {
      return NextResponse.json(
        {
          success: false,
          error: matrixDutyApplied.error || 'Görev ataması başarısız',
          preview,
          applied: { inserted, deleted_pending: deletedPending, replace_pending: replacePending },
        },
        { status: 400 }
      )
    }
  }

  return NextResponse.json(
    {
      success: true,
      dry_run: false,
      preview: previewPayload,
      applied: {
        inserted,
        deleted_pending: deletedPending,
        replace_pending: replacePending,
        assign_zumre_duty: assignZumreDuty,
        assign_sinif_duty: assignSinifDuty,
        assign_rehber_duty: assignRehberDuty,
        assign_nobetci_duty: assignNobetciDuty,
        assign_kulup_duty: assignKulupDuty,
        assign_formator_duty: assignFormatorDuty,
        assign_yasam_koordinatoru_duty: assignYasamKoordinatoruDuty,
        assign_bilimsel_etkinlik_koordinatoru_duty: assignBilimselEtkinlikKoordinatoruDuty,
        matrix_duty: matrixDutyApplied,
        evaluator_category_scopes: matrixCategoryScopeApplied?.applied ?? [],
      },
    },
    { headers: NO_CACHE_HEADERS }
  )
}
