/**
 * Hedef yönetimi — saf kurallar (DB yok, import yok). Hem yönetim ucu
 * (/api/admin/goals) hem çalışan ucu (/api/my-goals) bunu kullanır.
 *
 * Hedef puanı performans puanına KARIŞMAZ; ayrı bir boyuttur. Hiçbir
 * performans / karne / rapor hesabı goals tablosunu okumaz.
 */

export const GOAL_STATUSES = ['open', 'achieved', 'partial', 'missed', 'cancelled'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const GOAL_SCORE_MIN = 1
export const GOAL_SCORE_MAX = 5

/** Puanlanmış hedefin metin alanları (title, description, weight, target_text, due_date). */
export const GOAL_TEXT_FIELDS = ['title', 'description', 'weight', 'target_text', 'due_date'] as const

export function isGoalStatus(v: unknown): v is GoalStatus {
  return typeof v === 'string' && (GOAL_STATUSES as readonly string[]).includes(v)
}

/** Puanlanmış hedefin metin alanları kilitli (0 da puandır). */
export function isGoalTextLocked(score: number | null | undefined): boolean {
  return score !== null && score !== undefined
}

/** Puanlama yalnız dönem kapandıysa (status tam olarak 'completed'). */
export function canScoreGoals(periodStatus: string | null | undefined): boolean {
  return periodStatus === 'completed'
}

/** 1-5 aralığı ve sayı denetimi. null geçerli (puan silme); metin, NaN, undefined geçersiz. */
export function isValidGoalScore(score: unknown): boolean {
  if (score === null) return true
  if (typeof score !== 'number' || !Number.isFinite(score)) return false
  return score >= GOAL_SCORE_MIN && score <= GOAL_SCORE_MAX
}

/** Ağırlık toplamı (null'lar 0 sayılır), 2 haneye yuvarlı. */
export function weightTotal(rows: { weight: number | null }[]): number {
  const sum = rows.reduce((s, r) => s + (typeof r.weight === 'number' && Number.isFinite(r.weight) ? r.weight : 0), 0)
  return Math.round(sum * 100) / 100
}

/** Çalışana puan gösterilir mi? Puan dolu VE dönem kapanmış olmalı. */
export function isGoalScoreVisibleToEmployee(input: { score: number | null; periodStatus: string | null }): boolean {
  return input.score !== null && input.score !== undefined && canScoreGoals(input.periodStatus)
}

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
const toStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const toDate = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

/**
 * Çalışana giden satır — BEYAZ LİSTE: çıktı alan alan yazılır, girdi
 * kopyalanmaz. scored_by, created_by, organization_id ASLA girmez; yeni bir
 * DB kolonu kendiliğinden sızmaz. Puan koşulu sağlanmıyorsa score ve
 * score_rationale anahtarları nesneye HİÇ konmaz (null da değil).
 */
export function serializeGoalForEmployee(row: Record<string, unknown>, periodStatus: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: toStr(row.id),
    title: toStr(row.title) ?? '',
    description: toStr(row.description),
    weight: toNum(row.weight),
    target_text: toStr(row.target_text),
    due_date: toDate(row.due_date),
    status: isGoalStatus(row.status) ? row.status : 'open',
  }
  const score = toNum(row.score)
  if (isGoalScoreVisibleToEmployee({ score, periodStatus })) {
    out.score = score
    out.score_rationale = toStr(row.score_rationale)
  }
  return out
}

export type GoalUpdateError = 'goal_scored_locked' | 'period_not_completed' | 'invalid_score' | 'invalid_status'

/** Hata kodu → HTTP durumu (rota bunu kullanır). */
export function goalErrorStatus(e: GoalUpdateError | 'goal_scored_no_delete'): 400 | 409 {
  return e === 'invalid_score' || e === 'invalid_status' ? 400 : 409
}

const sameValue = (field: (typeof GOAL_TEXT_FIELDS)[number], a: unknown, b: unknown) => {
  if (field === 'weight') return toNum(a) === toNum(b)
  if (field === 'due_date') return toDate(a) === toDate(b)
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  return s(a) === s(b)
}

/**
 * PUT gövdesini mevcut hedefe göre denetler. Kurallar:
 * - Puanlanmış hedefin metin alanları DEĞİŞTİRİLEMEZ (aynı değeri göndermek serbest).
 * - Puan gövdede varsa: 1-5 ya da null olmalı; dönem 'completed' değilse reddedilir.
 * - status yalnız GOAL_STATUSES.
 */
export function checkGoalUpdate(input: {
  existing: Record<string, unknown>
  periodStatus: string | null
  body: Record<string, unknown>
}): GoalUpdateError | null {
  const { existing, periodStatus, body } = input
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
  if (isGoalTextLocked(toNum(existing.score))) {
    for (const f of GOAL_TEXT_FIELDS) {
      if (has(f) && !sameValue(f, body[f], existing[f])) return 'goal_scored_locked'
    }
  }
  if (has('status') && !isGoalStatus(body.status)) return 'invalid_status'
  if (has('score')) {
    if (!isValidGoalScore(body.score)) return 'invalid_score'
    if (!canScoreGoals(periodStatus)) return 'period_not_completed'
  }
  return null
}

/** DELETE kuralı: puanlanmış hedef silinemez (İptal durumu kullanılır). */
export function checkGoalDelete(existingScore: unknown): 'goal_scored_no_delete' | null {
  return isGoalTextLocked(toNum(existingScore)) ? 'goal_scored_no_delete' : null
}
