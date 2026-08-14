// ============================================================================
// Matris görev atama — DB katmanı (server-only). matrix-target-duty-assign.ts'in
// SAF kısmından AYRILDI: o dosya 8 client component'e (matrix-evaluation-context
// üzerinden) transitively bağlı → @/lib/db oraya EKLENEMEZ. DB-yazan assign*
// fonksiyonları buraya taşındı; saf helper'lar (findDutyIdForMatrixPreset,
// resolveMatrixDutyPresetFromDuty, MatrixDutyPreset) client-safe dosyada kalır.
//
// Yazma: evaluation_period_user_duties INSERT → withActor (RLS org-context, actor
// opts.actor ile route'tan gelir). Okuma: pgRead fallback. env yok → Supabase.
// ============================================================================
import { isPgEnabled, query as pgQuery } from '@/lib/db'
import { pgRead } from '@/lib/server/pg-read'
import { withActor, type Actor } from '@/lib/server/secure-query'
import {
  PRESET_CONFIG,
  findDutyIdForMatrixPreset,
  formatPeriodDutyNamesForError,
  type MatrixDutyAssignResult,
  type MatrixDutyPreset,
} from '@/lib/matrix-target-duty-assign'
import type { DutyLike } from '@/lib/duty-title-match'

type AssignOpts = { dryRun?: boolean; actor?: Actor }
type DutyRow = { period_id: string; user_id: string; duty_id: string; is_active: boolean }

/** Mevcut (period + is_active) görev anahtarları — dedup için. Eksik tablo → boş küme. */
async function readExistingDutyKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  periodId: string
): Promise<{ keys: Set<string>; error: string | null }> {
  // org-scope: period_id.
  const { data, error } = isPgEnabled()
    ? await pgRead<{ user_id?: string; duty_id?: string }>('select user_id, duty_id from evaluation_period_user_duties where period_id = $1 and is_active = true', [periodId])
    : await supabase
        .from('evaluation_period_user_duties')
        .select('user_id, duty_id')
        .eq('period_id', periodId)
        .eq('is_active', true)
  if (error && !String(error.message || '').includes('does not exist')) {
    return { keys: new Set(), error: error.message || 'Görev kayıtları okunamadı' }
  }
  const keys = new Set(
    ((data || []) as { user_id?: string; duty_id?: string }[]).map((r) => `${r.user_id}::${r.duty_id}`)
  )
  return { keys, error: null }
}

/** toInsert satırlarını yazar. pg: withActor (RLS) — actor yoksa parametreli pgQuery (explicit period_id).
 *  else supabase. Hata mesajı döner (null = başarı). Kolon adları koddan sabit → enjeksiyon yok. */
async function insertDutyAssignments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: DutyRow[],
  actor?: Actor
): Promise<string | null> {
  if (!rows.length) return null
  const cols = ['period_id', 'user_id', 'duty_id', 'is_active'] as const
  const buildInsert = () => {
    const params: unknown[] = []
    const tuples = rows.map((r) => {
      const ph = cols.map((c) => {
        params.push(r[c])
        return `$${params.length}`
      })
      return `(${ph.join(', ')})`
    })
    return { sql: `insert into evaluation_period_user_duties (${cols.join(', ')}) values ${tuples.join(', ')}`, params }
  }
  if (isPgEnabled()) {
    try {
      const { sql, params } = buildInsert()
      if (actor) await withActor(actor, async (c) => { await c.query(sql, params) })
      else await pgQuery(sql, params) // actor yoksa: explicit period_id ile parametreli insert (RLS'siz)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Görev atanamadı'
    }
  }
  const { error } = await supabase.from('evaluation_period_user_duties').insert(rows)
  return error ? error.message || 'Görev atanamadı' : null
}

export async function assignMatrixPresetDutyToTargets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  periodId: string,
  targetUserIds: string[],
  duties: DutyLike[],
  preset: MatrixDutyPreset,
  opts?: AssignOpts
): Promise<MatrixDutyAssignResult> {
  const dryRun = Boolean(opts?.dryRun)
  const cfg = PRESET_CONFIG[preset]
  const uniqueTargets = Array.from(new Set(targetUserIds.filter(Boolean)))
  if (!uniqueTargets.length) {
    return { ok: false, error: 'Matriste hedef kişi bulunamadı', preset, targets_in_matrix: 0, duties_added: 0, duties_already: 0 }
  }

  const dutyId = findDutyIdForMatrixPreset(duties, preset)
  if (!dutyId) {
    return { ok: false, error: `${cfg.missingError} ${formatPeriodDutyNamesForError(duties)}`, preset, targets_in_matrix: uniqueTargets.length, duties_added: 0, duties_already: 0 }
  }
  const dutyName = duties.find((d) => String(d.id) === dutyId)?.name || cfg.label

  const { keys: existingKeys, error: readErr } = await readExistingDutyKeys(supabase, periodId)
  if (readErr) {
    return { ok: false, error: readErr, preset, targets_in_matrix: uniqueTargets.length, duties_added: 0, duties_already: 0 }
  }

  const toInsert: DutyRow[] = []
  let already = 0
  for (const userId of uniqueTargets) {
    if (existingKeys.has(`${userId}::${dutyId}`)) {
      already += 1
      continue
    }
    toInsert.push({ period_id: periodId, user_id: userId, duty_id: dutyId, is_active: true })
  }

  if (toInsert.length && !dryRun) {
    const insErr = await insertDutyAssignments(supabase, toInsert, opts?.actor)
    if (insErr) {
      return { ok: false, error: insErr || `${cfg.label} görevi atanamadı`, preset, targets_in_matrix: uniqueTargets.length, duties_added: 0, duties_already: already }
    }
  }

  return { ok: true, preset, duty_id: dutyId, duty_name: dutyName, targets_in_matrix: uniqueTargets.length, duties_added: toInsert.length, duties_already: already }
}

/** Dönem görev kaydı id ile hedeflere görev atar (kurumsal / özel code). */
export async function assignDutyByIdToTargets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  periodId: string,
  targetUserIds: string[],
  duties: DutyLike[],
  dutyId: string,
  opts?: AssignOpts
): Promise<MatrixDutyAssignResult> {
  const dryRun = Boolean(opts?.dryRun)
  const uniqueTargets = Array.from(new Set(targetUserIds.filter(Boolean)))
  const duty = duties.find((d) => String(d.id) === String(dutyId))
  if (!duty) {
    return { ok: false, error: 'Seçilen görev bu dönemde bulunamadı', preset: 'zumre', targets_in_matrix: uniqueTargets.length, duties_added: 0, duties_already: 0 }
  }
  const label = String(duty.name || duty.code || 'Görev').trim()
  if (!uniqueTargets.length) {
    return { ok: false, error: 'Matriste hedef kişi bulunamadı', preset: 'zumre', targets_in_matrix: 0, duties_added: 0, duties_already: 0 }
  }

  const { keys: existingKeys, error: readErr } = await readExistingDutyKeys(supabase, periodId)
  if (readErr) {
    return { ok: false, error: readErr, preset: 'zumre', targets_in_matrix: uniqueTargets.length, duties_added: 0, duties_already: 0 }
  }

  const toInsert: DutyRow[] = []
  let already = 0
  for (const userId of uniqueTargets) {
    if (existingKeys.has(`${userId}::${dutyId}`)) {
      already += 1
      continue
    }
    toInsert.push({ period_id: periodId, user_id: userId, duty_id: dutyId, is_active: true })
  }

  if (toInsert.length && !dryRun) {
    const insErr = await insertDutyAssignments(supabase, toInsert, opts?.actor)
    if (insErr) {
      return { ok: false, error: insErr || `${label} görevi atanamadı`, preset: 'zumre', targets_in_matrix: uniqueTargets.length, duties_added: 0, duties_already: already }
    }
  }

  return { ok: true, duty_id: dutyId, duty_name: label, targets_in_matrix: uniqueTargets.length, duties_added: toInsert.length, duties_already: already }
}

/** @deprecated use assignMatrixPresetDutyToTargets(..., 'zumre') */
export async function assignZumreDutyToMatrixTargets(
  supabase: Parameters<typeof assignMatrixPresetDutyToTargets>[0],
  periodId: string,
  targetUserIds: string[],
  duties: DutyLike[],
  opts?: AssignOpts
) {
  const r = await assignMatrixPresetDutyToTargets(supabase, periodId, targetUserIds, duties, 'zumre', opts)
  return { ...r, zumre_duty_id: r.duty_id, zumre_duty_name: r.duty_name }
}
