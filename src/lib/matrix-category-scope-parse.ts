import { normalizeMatchKey } from '@/lib/duty-title-match'
import {
  cellStr,
  isCategoryColumnHeader,
  isMatrixActiveCell,
  type ParsedGrid,
} from '@/lib/matrix-assignment-import'

export type EvaluatorMatrixCategoryScope = {
  evaluatorColIdx: number
  evaluatorLabel: string
  categoryColIdx: number
  categoryLabels: string[]
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
