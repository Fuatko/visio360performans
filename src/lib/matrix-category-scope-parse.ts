import { normalizeMatchKey } from '@/lib/duty-title-match'
import {
  cellStr,
  isCategoryColumnHeader,
  isMatrixActiveCell,
  type MatrixAssignmentPair,
  type ParsedGrid,
} from '@/lib/matrix-assignment-import'

export type EvaluatorMatrixCategoryScope = {
  evaluatorColIdx: number
  evaluatorLabel: string
  categoryColIdx: number
  categoryLabels: string[]
  /** Matris satırı bazlı kapsam (hedef başına farklı sağ sütun) */
  targetId?: string
  targetLabel?: string
  targetRowIdx?: number
}

function sanitizeMatrixCategoryLabel(raw: string): string {
  return String(raw || '')
    .replace(/^[\s\-–—•*·\d.]+/, '')
    .trim()
}

/** Hedef satırı ve altındaki kategori hücreleri (bir sonraki hedef satırına kadar). */
export function collectCategoryLabelsForTargetRow(
  matrix: unknown[][],
  grid: ParsedGrid,
  targetRowIdx: number,
  categoryColIdx: number
): string[] {
  const targetKeys = new Set(grid.targetRows.map((t) => normalizeMatchKey(t.label)))
  const targetRowSet = new Set(grid.targetRows.map((t) => t.rowIdx))
  const seen = new Set<string>()
  const labels: string[] = []

  const pushLabel = (raw: string) => {
    const t = sanitizeMatrixCategoryLabel(raw)
    const key = normalizeMatchKey(t)
    if (!key || key.length < 3) return
    if (targetKeys.has(key)) return
    if (seen.has(key)) return
    seen.add(key)
    labels.push(t)
  }

  pushLabel(cellStr((matrix[targetRowIdx] || [])[categoryColIdx]))

  for (let r = targetRowIdx + 1; r < matrix.length; r++) {
    if (targetRowSet.has(r)) break
    const t = cellStr((matrix[r] || [])[categoryColIdx])
    if (!t || isMatrixActiveCell(t)) continue
    pushLabel(t)
  }

  return labels
}

/** Sağ sütun: değerlendirilecek kategoriler (hedef | değerlendiren | kategori listesi) */
export function detectEvaluatorCategoryColumn(
  matrix: unknown[][],
  grid: ParsedGrid
): { categoryColIdx: number; categoryLabels: string[] } | null {
  const headerRow = (matrix[grid.headerRowIdx] || []).map(cellStr)
  const targetKeys = new Set(grid.targetRows.map((t) => normalizeMatchKey(t.label)))

  let categoryColIdx = grid.categoryColIdx ?? -1
  if (categoryColIdx < 0) {
    for (let c = 0; c < headerRow.length; c++) {
      if (isCategoryColumnHeader(headerRow[c] || '')) {
        categoryColIdx = c
        break
      }
    }
  }

  if (categoryColIdx < 0 && grid.evaluatorCols.length) {
    const maxEvCol = Math.max(...grid.evaluatorCols.map((e) => e.colIdx))
    const candidate = maxEvCol + 1
    if (candidate < headerRow.length) {
      let textLike = 0
      let total = 0
      for (let r = grid.headerRowIdx + 1; r < matrix.length; r++) {
        const t = cellStr((matrix[r] || [])[candidate])
        if (!t) continue
        total += 1
        if (!isMatrixActiveCell(t) && t.length > 4) textLike += 1
      }
      if (total > 0 && textLike >= 2) categoryColIdx = candidate
    }
  }

  if (categoryColIdx < 0) return null

  const seen = new Set<string>()
  const categoryLabels: string[] = []
  for (let r = grid.headerRowIdx + 1; r < matrix.length; r++) {
    let t = cellStr((matrix[r] || [])[categoryColIdx])
    if (!t || isMatrixActiveCell(t)) continue
    t = t.replace(/^[\s\-–—•*·\d.]+/, '').trim()
    const key = normalizeMatchKey(t)
    if (!key || key.length < 4) continue
    if (targetKeys.has(key)) continue
    if (seen.has(key)) continue
    seen.add(key)
    categoryLabels.push(t)
  }

  if (!categoryLabels.length) return null
  return { categoryColIdx, categoryLabels }
}

export function buildEvaluatorCategoryScopes(
  matrix: unknown[][],
  grid: ParsedGrid
): EvaluatorMatrixCategoryScope[] {
  const detected = detectEvaluatorCategoryColumn(matrix, grid)
  if (!detected || !grid.evaluatorCols.length) return []

  return grid.evaluatorCols.map((ev) => ({
    evaluatorColIdx: ev.colIdx,
    evaluatorLabel: ev.label,
    categoryColIdx: detected.categoryColIdx,
    categoryLabels: [...detected.categoryLabels],
  }))
}

/**
 * Her değerlendiren→hedef çifti için sağ sütundan satır bazlı kategori listesi.
 * Global liste yedek olarak birleştirilir (Teknolojik Yetkinlikler vb. tek satırda kalmasın diye).
 */
export function buildEvaluatorCategoryScopesForPairs(
  matrix: unknown[][],
  grid: ParsedGrid,
  pairs: MatrixAssignmentPair[]
): EvaluatorMatrixCategoryScope[] {
  const detected = detectEvaluatorCategoryColumn(matrix, grid)
  if (!detected || !pairs.length) return buildEvaluatorCategoryScopes(matrix, grid)

  const { categoryColIdx, categoryLabels: globalLabels } = detected
  const evaluatorColByIdx = new Map(grid.evaluatorCols.map((e) => [e.colIdx, e]))
  const seenPair = new Set<string>()
  const scopes: EvaluatorMatrixCategoryScope[] = []

  for (const pair of pairs) {
    const pk = `${pair.evaluatorId}::${pair.targetId}`
    if (seenPair.has(pk)) continue
    seenPair.add(pk)

    const rowIdx = Math.max(0, pair.rowNum - 1)
    const rowLabels = collectCategoryLabelsForTargetRow(matrix, grid, rowIdx, categoryColIdx)
    const merged: string[] = []
    const seen = new Set<string>()
    for (const label of [...rowLabels, ...globalLabels]) {
      const key = normalizeMatchKey(label)
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(label)
    }
    if (!merged.length) continue

    const evCol = grid.evaluatorCols.find((e) => e.colIdx === pair.colNum - 1) || evaluatorColByIdx.get(pair.colNum - 1)
    scopes.push({
      evaluatorColIdx: evCol?.colIdx ?? pair.colNum - 1,
      evaluatorLabel: pair.evaluatorLabel,
      categoryColIdx,
      categoryLabels: merged,
      targetId: pair.targetId,
      targetLabel: pair.targetLabel,
      targetRowIdx: rowIdx,
    })
  }

  return scopes.length ? scopes : buildEvaluatorCategoryScopes(matrix, grid)
}
