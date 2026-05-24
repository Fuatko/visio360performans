import { matchUserForDutyImport } from '@/lib/duty-assignment-import'
import { normalizeMatchKey } from '@/lib/duty-title-match'
import type { MatrixAssignmentPair } from '@/lib/matrix-assignment-import'
import { loadPeriodCategoryOptions, persistEvaluatorScopeConfig } from '@/lib/server/evaluation-evaluator-scope'
import type { EvaluatorMatrixCategoryScope } from '@/lib/matrix-category-scope-parse'

export type { EvaluatorMatrixCategoryScope } from '@/lib/matrix-category-scope-parse'
export {
  buildEvaluatorCategoryScopes,
  buildEvaluatorCategoryScopesForPairs,
  detectEvaluatorCategoryColumn,
} from '@/lib/matrix-category-scope-parse'

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

/** Excel sağ sütun: «- Teknolojik Yetkinlikler» gibi madde işaretlerini temizle */
export function sanitizeCategoryMatrixLabel(label: string): string {
  return String(label || '')
    .replace(/^[\s\-–—•*·\d.]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function expandMatchedCategoryIds(categories: CategoryLike[], seed: CategoryLike[]): string[] {
  if (!seed.length) return []
  const mainKeys = new Set(
    seed.map((c) => normalizeMatchKey(c.main_category_name || '')).filter(Boolean)
  )
  const ids = new Set<string>()
  for (const c of categories) {
    if (seed.some((s) => s.id === c.id)) ids.add(c.id)
    else if (c.main_category_name && mainKeys.has(normalizeMatchKey(c.main_category_name))) ids.add(c.id)
  }
  return [...ids]
}

/**
 * Matris sağ sütunundaki kategori etiketini dönem alt kategori id'lerine çevirir.
 * Ana kategori adı (ör. «Teknolojik Yetkinlikler») verilmişse o ana başlığın TÜM alt kategorileri dahil edilir.
 */
export function matchCategoryLabelToIds(label: string, categories: CategoryLike[]): string[] {
  const key = normalizeMatchKey(sanitizeCategoryMatrixLabel(label))
  if (!key) return []

  const exactSub = categories.filter((c) => normalizeMatchKey(c.name || '') === key)
  if (exactSub.length) return expandMatchedCategoryIds(categories, exactSub)

  const byMain = categories.filter((c) => {
    const main = normalizeMatchKey(c.main_category_name || '')
    if (!main) return false
    return main === key || key.includes(main) || main.includes(key)
  })
  if (byMain.length) return expandMatchedCategoryIds(categories, byMain)

  const nameHit = categories.filter((c) => {
    const n = normalizeMatchKey(c.name || '')
    return n && (n === key || n.includes(key) || key.includes(n))
  })
  if (nameHit.length) return expandMatchedCategoryIds(categories, nameHit)

  const scored: CategoryLike[] = []
  let top = 0
  for (const c of categories) {
    const blob = normalizeMatchKey([c.name, c.main_category_name].filter(Boolean).join(' '))
    if (!blob) continue
    let score = 0
    if (blob === key) score = 100
    else if (blob.includes(key) || key.includes(blob)) score = 80
    else {
      const words = key.split(' ').filter((w) => w.length > 2)
      const hit = words.filter((w) => blob.includes(w)).length
      if (words.length && hit >= Math.min(2, words.length)) score = 50 + hit * 10
      if (key.includes('teknolojik') && blob.includes('teknolojik')) score = Math.max(score, 75)
    }
    if (score >= 50) {
      if (score > top) {
        top = score
        scored.length = 0
        scored.push(c)
      } else if (score === top) {
        scored.push(c)
      }
    }
  }
  if (!scored.length) return []
  return expandMatchedCategoryIds(categories, scored)
}

function matchCategoryLabelToId(label: string, categories: CategoryLike[]): string | null {
  const ids = matchCategoryLabelToIds(label, categories)
  return ids[0] || null
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
    const ids = matchCategoryLabelToIds(label, categories)
    if (ids.length) matchedIds.push(...ids)
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
  resolvedByEvaluatorId: Map<string, ResolvedEvaluatorScope>,
  resolvedByPairKey: Map<string, ResolvedEvaluatorScope>
): ResolvedEvaluatorScope | null {
  const pk = `${pair.evaluatorId}::${pair.targetId}`
  const byPair = resolvedByPairKey.get(pk)
  if (byPair) return byPair
  const byId = resolvedByEvaluatorId.get(pair.evaluatorId)
  if (byId) return byId
  const pairKey = normalizeMatchKey(pair.evaluatorLabel)
  for (const r of resolvedByPairKey.values()) {
    if (r.evaluator_id === pair.evaluatorId) return r
  }
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
  const resolvedByPairKey = new Map<string, ResolvedEvaluatorScope>()

  for (const scope of scopes) {
    const out = resolveScopeForEvaluator(scope, users, categories)
    if (!out.ok) {
      return { ok: false, error: out.error, applied: [] }
    }
    if (scope.targetId) {
      resolvedByPairKey.set(`${out.resolved.evaluator_id}::${scope.targetId}`, out.resolved)
    } else {
      resolvedByEvaluatorId.set(out.resolved.evaluator_id, out.resolved)
    }
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
      const resolved = scopeForPairEvaluator(pair, resolvedByEvaluatorId, resolvedByPairKey)
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
