import { matchUserForDutyImport } from '@/lib/duty-assignment-import'
import { normalizeMatchKey } from '@/lib/duty-title-match'
import type { MatrixAssignmentPair } from '@/lib/matrix-assignment-import'
import { loadPeriodCategoryOptions, persistEvaluatorScopeConfig } from '@/lib/server/evaluation-evaluator-scope'
import {
  buildEvaluatorCategoryScopes,
  detectEvaluatorCategoryColumn,
  type EvaluatorMatrixCategoryScope,
} from '@/lib/matrix-category-scope-parse'

export type { EvaluatorMatrixCategoryScope } from '@/lib/matrix-category-scope-parse'
export { buildEvaluatorCategoryScopes, detectEvaluatorCategoryColumn }

export type CategoryScopeApplyResult = {
  ok: boolean
  error?: string
  /** Hedefe özel (matris satırı) kapsam yazıldı */
  pairs_applied?: number
  applied: Array<{
    evaluator_id: string
    evaluator_label: string
    category_labels: string[]
    matched_category_ids: string[]
    unmatched_labels: string[]
    assignment_pairs: number
  }>
}

type CategoryLike = {
  id: string
  name?: string | null
  main_category_name?: string | null
}

type ResolvedEvaluatorScope = {
  evaluator_id: string
  evaluator_label: string
  category_labels: string[]
  matched_category_ids: string[]
  unmatched_labels: string[]
}

function matchCategoryLabelToId(label: string, categories: CategoryLike[]): string | null {
  const key = normalizeMatchKey(label)
  if (!key) return null
  let best: { id: string; score: number } | null = null
  for (const c of categories) {
    const blob = normalizeMatchKey([c.name, c.main_category_name].filter(Boolean).join(' '))
    if (!blob) continue
    let score = 0
    if (blob === key) score = 100
    else if (blob.includes(key) || key.includes(blob)) score = 80
    else {
      const words = key.split(' ').filter((w) => w.length > 2)
      const hit = words.filter((w) => blob.includes(w)).length
      if (hit >= Math.min(2, words.length)) score = 50 + hit * 10
    }
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, score }
  }
  return best && best.score >= 50 ? best.id : null
}

function resolveScopeForEvaluator(
  scope: EvaluatorMatrixCategoryScope,
  users: Array<{ id: string; name?: string | null; email?: string | null }>,
  categories: CategoryLike[]
): { ok: true; resolved: ResolvedEvaluatorScope } | { ok: false; error: string } {
  const { user } = matchUserForDutyImport({ name: scope.evaluatorLabel, email: '' }, users)
  if (!user) {
    return { ok: false, error: `Değerlendiren bulunamadı: «${scope.evaluatorLabel}»` }
  }

  const matchedIds: string[] = []
  const unmatched: string[] = []
  for (const label of scope.categoryLabels) {
    const id = matchCategoryLabelToId(label, categories)
    if (id) matchedIds.push(id)
    else unmatched.push(label)
  }

  if (!matchedIds.length) {
    return {
      ok: false,
      error: `«${scope.evaluatorLabel}» için dönemde eşleşen alt kategori yok: ${unmatched.join(', ')}`,
    }
  }

  return {
    ok: true,
    resolved: {
      evaluator_id: String(user.id),
      evaluator_label: scope.evaluatorLabel,
      category_labels: scope.categoryLabels,
      matched_category_ids: Array.from(new Set(matchedIds)),
      unmatched_labels: unmatched,
    },
  }
}

function scopeForPairEvaluator(
  pair: MatrixAssignmentPair,
  resolvedByEvaluatorId: Map<string, ResolvedEvaluatorScope>
): ResolvedEvaluatorScope | null {
  const byId = resolvedByEvaluatorId.get(pair.evaluatorId)
  if (byId) return byId
  const pairKey = normalizeMatchKey(pair.evaluatorLabel)
  for (const r of resolvedByEvaluatorId.values()) {
    if (normalizeMatchKey(r.evaluator_label) === pairKey) return r
  }
  return null
}

/**
 * Matris sağ sütunundaki kategorileri yazar.
 * assignmentPairs verilirse: her değerlendiren→hedef satırı için ayrı kapsam (Onur zümre vs okul yaşam ayrı kalır).
 * assignmentPairs yoksa: eski davranış — değerlendiren varsayılan kapsamı.
 */
export async function applyEvaluatorCategoryScopesFromMatrix(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  periodId: string,
  scopes: EvaluatorMatrixCategoryScope[],
  users: Array<{ id: string; name?: string | null; email?: string | null }>,
  opts?: { dryRun?: boolean; assignmentPairs?: MatrixAssignmentPair[]; matrixContext?: string }
): Promise<CategoryScopeApplyResult> {
  const dryRun = Boolean(opts?.dryRun)
  const pairs = opts?.assignmentPairs || []
  const matrixContext = opts?.matrixContext || 'genel'
  if (!scopes.length) {
    return { ok: true, applied: [], pairs_applied: 0 }
  }

  const categories = await loadPeriodCategoryOptions(supabase, periodId)
  const resolvedByEvaluatorId = new Map<string, ResolvedEvaluatorScope>()

  for (const scope of scopes) {
    const out = resolveScopeForEvaluator(scope, users, categories)
    if (!out.ok) {
      return { ok: false, error: out.error, applied: [] }
    }
    resolvedByEvaluatorId.set(out.resolved.evaluator_id, out.resolved)
  }

  const applied: CategoryScopeApplyResult['applied'] = []
  const pairCountByEvaluator = new Map<string, number>()

  const persistPayload = {
    restrict_period: true,
    duty_mode: 'none' as const,
    duty_category_ids: [] as string[],
    duty_package_ids: [] as string[],
  }

  if (pairs.length) {
    for (const pair of pairs) {
      const resolved = scopeForPairEvaluator(pair, resolvedByEvaluatorId)
      if (!resolved) {
        return {
          ok: false,
          error: `«${pair.evaluatorLabel}» için kategori listesi tanımlı değil (matris sütunu / sağ sütun).`,
          applied,
        }
      }
      if (!dryRun) {
        await persistEvaluatorScopeConfig(
          supabase,
          periodId,
          resolved.evaluator_id,
          {
            ...persistPayload,
            period_category_ids: resolved.matched_category_ids,
          },
          pair.targetId,
          matrixContext
        )
      }
      pairCountByEvaluator.set(
        resolved.evaluator_id,
        (pairCountByEvaluator.get(resolved.evaluator_id) || 0) + 1
      )
    }

    for (const resolved of resolvedByEvaluatorId.values()) {
      applied.push({
        evaluator_id: resolved.evaluator_id,
        evaluator_label: resolved.evaluator_label,
        category_labels: resolved.category_labels,
        matched_category_ids: resolved.matched_category_ids,
        unmatched_labels: resolved.unmatched_labels,
        assignment_pairs: pairCountByEvaluator.get(resolved.evaluator_id) || 0,
      })
    }

    return { ok: true, applied, pairs_applied: pairs.length }
  }

  // Geriye dönük: değerlendiren varsayılan kapsamı
  for (const resolved of resolvedByEvaluatorId.values()) {
    if (!dryRun) {
      await persistEvaluatorScopeConfig(
        supabase,
        periodId,
        resolved.evaluator_id,
        {
          ...persistPayload,
          period_category_ids: resolved.matched_category_ids,
        },
        null
      )
    }
    applied.push({
      evaluator_id: resolved.evaluator_id,
      evaluator_label: resolved.evaluator_label,
      category_labels: resolved.category_labels,
      matched_category_ids: resolved.matched_category_ids,
      unmatched_labels: resolved.unmatched_labels,
      assignment_pairs: 0,
    })
  }

  return { ok: true, applied, pairs_applied: 0 }
}
