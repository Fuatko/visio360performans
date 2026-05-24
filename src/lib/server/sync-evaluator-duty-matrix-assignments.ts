import { assignmentPairKey } from '@/lib/matrix-evaluation-context'
import {
  resolveMatrixDutyPresetFromDuty,
  type MatrixDutyPreset,
} from '@/lib/matrix-target-duty-assign'
import type { DutyLike } from '@/lib/duty-title-match'

type SupabaseLike = {
  from: (table: string) => any
}

const DEFAULT_PRESETS: MatrixDutyPreset[] = [
  'zumre',
  'rehberlik_ogretmeni',
  'sinif_ogretmeni',
  'yasam_koordinatoru',
]

export type SyncDutyMatrixResult = {
  ok: boolean
  error?: string
  dry_run: boolean
  evaluator_id?: string
  presets: MatrixDutyPreset[]
  inserted: number
  skipped_existing: number
  pairs: Array<{ evaluator_id: string; target_id: string; matrix_context: MatrixDutyPreset; target_name?: string }>
}

export async function syncDutyMatrixAssignmentsFromGenel(
  supabase: SupabaseLike,
  periodId: string,
  opts?: {
    evaluatorId?: string
    presets?: MatrixDutyPreset[]
    dryRun?: boolean
  }
): Promise<SyncDutyMatrixResult> {
  const presets = opts?.presets?.length ? opts.presets : DEFAULT_PRESETS
  const presetSet = new Set(presets)
  const dryRun = Boolean(opts?.dryRun)

  if (!periodId) {
    return { ok: false, error: 'period_id gerekli', dry_run: dryRun, presets, inserted: 0, skipped_existing: 0, pairs: [] }
  }

  let genelQuery = supabase
    .from('evaluation_assignments')
    .select('evaluator_id, target_id')
    .eq('period_id', periodId)
    .or('matrix_context.is.null,matrix_context.eq.genel')

  if (opts?.evaluatorId) {
    genelQuery = genelQuery.eq('evaluator_id', opts.evaluatorId)
  }

  const { data: genelRows, error: genelErr } = await genelQuery
  if (genelErr) {
    return { ok: false, error: genelErr.message, dry_run: dryRun, presets, inserted: 0, skipped_existing: 0, pairs: [] }
  }

  const genelPairs = (genelRows || []) as Array<{ evaluator_id: string; target_id: string }>
  if (!genelPairs.length) {
    return {
      ok: true,
      dry_run: dryRun,
      evaluator_id: opts?.evaluatorId,
      presets,
      inserted: 0,
      skipped_existing: 0,
      pairs: [],
      error: opts?.evaluatorId ? 'Bu değerlendiren için genel atama yok' : undefined,
    }
  }

  const { data: dutyLinks, error: dutyErr } = await supabase
    .from('evaluation_period_user_duties')
    .select('user_id, duty_id, evaluation_duties:duty_id(id, name, code, name_en, name_fr)')
    .eq('period_id', periodId)
    .eq('is_active', true)

  if (dutyErr) {
    return { ok: false, error: dutyErr.message, dry_run: dryRun, presets, inserted: 0, skipped_existing: 0, pairs: [] }
  }

  const targetPresets = new Map<string, Set<MatrixDutyPreset>>()
  for (const row of (dutyLinks || []) as any[]) {
    const targetId = String(row.user_id || '')
    const duty = row.evaluation_duties as DutyLike | null
    if (!targetId || !duty) continue
    const preset = resolveMatrixDutyPresetFromDuty(duty)
    if (!preset || !presetSet.has(preset)) continue
    const set = targetPresets.get(targetId) || new Set()
    set.add(preset)
    targetPresets.set(targetId, set)
  }

  let existQuery = supabase
    .from('evaluation_assignments')
    .select('evaluator_id, target_id, matrix_context')
    .eq('period_id', periodId)
    .in('matrix_context', [...presets])

  if (opts?.evaluatorId) {
    existQuery = existQuery.eq('evaluator_id', opts.evaluatorId)
  }

  const { data: existingRows, error: existErr } = await existQuery
  if (existErr) {
    return { ok: false, error: existErr.message, dry_run: dryRun, presets, inserted: 0, skipped_existing: 0, pairs: [] }
  }

  const existingKeys = new Set(
    ((existingRows || []) as Array<{ evaluator_id: string; target_id: string; matrix_context: string }>).map((r) =>
      assignmentPairKey(String(r.evaluator_id), String(r.target_id), String(r.matrix_context))
    )
  )

  const toInsert: Array<{
    period_id: string
    evaluator_id: string
    target_id: string
    matrix_context: MatrixDutyPreset
    status: 'pending'
  }> = []

  for (const { evaluator_id, target_id } of genelPairs) {
    const evId = String(evaluator_id || '')
    const tgId = String(target_id || '')
    if (!evId || !tgId) continue
    const applicable = targetPresets.get(tgId)
    if (!applicable?.size) continue
    for (const preset of applicable) {
      const key = assignmentPairKey(evId, tgId, preset)
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      toInsert.push({
        period_id: periodId,
        evaluator_id: evId,
        target_id: tgId,
        matrix_context: preset,
        status: 'pending',
      })
    }
  }

  if (!dryRun && toInsert.length) {
    const BATCH = 200
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH)
      const { error: insErr } = await supabase.from('evaluation_assignments').insert(batch)
      if (insErr) {
        return {
          ok: false,
          error: insErr.message,
          dry_run: dryRun,
          evaluator_id: opts?.evaluatorId,
          presets,
          inserted: i,
          skipped_existing: 0,
          pairs: [],
        }
      }
    }
  }

  const targetIds = [...new Set(toInsert.map((r) => r.target_id))]
  const nameById = new Map<string, string>()
  if (targetIds.length) {
    const { data: users } = await supabase.from('users').select('id, name').in('id', targetIds)
    ;((users || []) as Array<{ id: string; name?: string }>).forEach((u) => {
      if (u.id) nameById.set(String(u.id), String(u.name || ''))
    })
  }

  return {
    ok: true,
    dry_run: dryRun,
    evaluator_id: opts?.evaluatorId,
    presets,
    inserted: dryRun ? 0 : toInsert.length,
    skipped_existing: 0,
    pairs: toInsert.map((r) => ({
      evaluator_id: r.evaluator_id,
      target_id: r.target_id,
      matrix_context: r.matrix_context,
      target_name: nameById.get(r.target_id),
    })),
  }
}
