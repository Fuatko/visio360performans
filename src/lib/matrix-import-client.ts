import * as XLSX from 'xlsx'
import {
  buildMatrixAssignmentPreview,
  MATRIX_PARSER_VERSION,
  parseMatrixAssignmentGrid,
  type MatrixAssignmentImportPreview,
} from '@/lib/matrix-assignment-import'
import { buildEvaluatorCategoryScopes } from '@/lib/matrix-category-scope-parse'
import type { EvaluatorMatrixCategoryScope } from '@/lib/matrix-category-scope-parse'

export type ClientMatrixParseResult = {
  preview: MatrixAssignmentImportPreview
  categoryScopes: EvaluatorMatrixCategoryScope[]
  parserVersion: string
  gridMeta: {
    category_col_idx: number | null
    category_col_label: string | null
    evaluator_labels: string[]
  }
}

export async function parseMatrixExcelInBrowser(
  file: File,
  users: Array<{ id: string; name?: string | null; email?: string | null }>,
  existing: Array<{ evaluator_id: string; target_id: string; matrix_context?: string | null }>,
  matrixContext = 'genel'
): Promise<ClientMatrixParseResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) {
    const preview: MatrixAssignmentImportPreview = {
      format: 'grid_01',
      parser_version: MATRIX_PARSER_VERSION,
      pairs: [],
      errors: ['Excel sayfası bulunamadı.'],
      warnings: [],
      stats: {
        targetRows: 0,
        evaluatorColumns: 0,
        cellsWithOne: 0,
        assignmentsToAdd: 0,
        alreadyExists: 0,
        unknownTargets: 0,
        unknownEvaluators: 0,
        skippedInactive: 0,
      },
      unmatchedTargets: [],
      unmatchedEvaluators: [],
    }
    return {
      preview,
      categoryScopes: [],
      parserVersion: MATRIX_PARSER_VERSION,
      gridMeta: { category_col_idx: null, category_col_label: null, evaluator_labels: [] },
    }
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  const grid = parseMatrixAssignmentGrid(matrix)
  const preview = buildMatrixAssignmentPreview(grid, users, existing, matrixContext)
  const categoryScopes = buildEvaluatorCategoryScopes(matrix, grid)

  const scopeWarnings: string[] = []
  if (categoryScopes.length) {
    for (const row of categoryScopes) {
      scopeWarnings.push(
        `Sağ sütun kapsamı — «${row.evaluatorLabel}»: ${row.categoryLabels.length} kategori (${row.categoryLabels.join(', ')}). Uygulamada dönemle eşleştirilir.`
      )
    }
  }

  return {
    preview: {
      ...preview,
      parser_version: MATRIX_PARSER_VERSION,
      preview_source: 'browser',
      warnings: [...scopeWarnings, ...preview.warnings],
    } as MatrixAssignmentImportPreview & { preview_source?: string },
    categoryScopes,
    parserVersion: MATRIX_PARSER_VERSION,
    gridMeta: {
      category_col_idx: grid.categoryColIdx,
      category_col_label: grid.categoryColLabel,
      evaluator_labels: grid.evaluatorCols.map((e) => e.label),
    },
  }
}
