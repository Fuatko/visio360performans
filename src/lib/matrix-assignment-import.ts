import * as XLSX from 'xlsx'
import { normalizeMatchKey } from '@/lib/duty-title-match'
import { matchUserForDutyImport } from '@/lib/duty-assignment-import'

export type MatrixAssignmentPair = {
  evaluatorId: string
  evaluatorLabel: string
  targetId: string
  targetLabel: string
  rowNum: number
  colNum: number
}

export type MatrixAssignmentImportPreview = {
  format: 'grid_01'
  pairs: MatrixAssignmentPair[]
  errors: string[]
  warnings: string[]
  stats: {
    targetRows: number
    evaluatorColumns: number
    cellsWithOne: number
    assignmentsToAdd: number
    alreadyExists: number
    unknownTargets: number
    unknownEvaluators: number
    skippedInactive: number
  }
  unmatchedTargets: string[]
  unmatchedEvaluators: string[]
}

const TARGET_HEADER_ALIASES = [
  'hedef',
  'degerlendirilecek',
  'degerlendirilecek kisi',
  'ad soyad',
  'ad',
  'isim',
  'name',
  'target',
  'person',
]

function cellStr(v: unknown) {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function normHeader(h: string) {
  return normalizeMatchKey(h).replace(/\s+/g, ' ')
}

function isTargetCornerLabel(label: string) {
  const k = normHeader(label)
  if (!k) return true
  return TARGET_HEADER_ALIASES.some((a) => k === a || k.includes(a))
}

export function isMatrixActiveCell(v: unknown): boolean {
  const s = cellStr(v).toLowerCase()
  if (!s) return false
  if (['0', 'false', 'hayir', 'hayır', 'no', '-', ''].includes(s)) return false
  if (['1', 'x', 'evet', 'yes', 'true', 'v', '✓', '✔'].includes(s)) return true
  const n = Number(s.replace(',', '.'))
  if (!Number.isNaN(n) && n === 1) return true
  return false
}

type ParsedGrid = {
  headerRowIdx: number
  targetColIdx: number
  evaluatorCols: Array<{ colIdx: number; label: string }>
  targetRows: Array<{ rowIdx: number; label: string }>
  cells: Array<{ rowIdx: number; colIdx: number; evaluatorLabel: string; targetLabel: string }>
  errors: string[]
}

function scoreAsHeaderRow(row: unknown[]): number {
  const cells = row.map(cellStr)
  let textCols = 0
  for (let c = 1; c < cells.length; c++) {
    const t = cells[c]
    if (t && !isMatrixActiveCell(t)) textCols += 1
  }
  const corner = cells[0] || ''
  const cornerOk = !corner || isTargetCornerLabel(corner) ? 1 : 0
  return textCols + cornerOk * 2
}

export function parseMatrixAssignmentGrid(matrix: unknown[][]): ParsedGrid {
  const errors: string[] = []
  const empty: ParsedGrid = {
    headerRowIdx: 0,
    targetColIdx: 0,
    evaluatorCols: [],
    targetRows: [],
    cells: [],
    errors: ['Excel dosyası boş.'],
  }
  if (!matrix.length) return empty

  let headerRowIdx = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(15, matrix.length); i++) {
    const sc = scoreAsHeaderRow(matrix[i] || [])
    if (sc > bestScore) {
      bestScore = sc
      headerRowIdx = i
    }
  }

  if (bestScore < 2) {
    errors.push('Üst satır (değerlendiren isimleri) bulunamadı. İlk satırda sütun başlıkları olmalı.')
    return { ...empty, errors }
  }

  const headerRow = (matrix[headerRowIdx] || []).map(cellStr)
  const targetColIdx = 0
  const evaluatorCols: ParsedGrid['evaluatorCols'] = []
  for (let c = 1; c < headerRow.length; c++) {
    const label = headerRow[c]
    if (!label || isMatrixActiveCell(label)) continue
    evaluatorCols.push({ colIdx: c, label })
  }

  if (!evaluatorCols.length) {
    errors.push('Değerlendiren sütunları boş. Üst satıra isimleri yazın.')
    return { ...empty, headerRowIdx, targetColIdx, evaluatorCols, errors }
  }

  const targetRows: ParsedGrid['targetRows'] = []
  const cells: ParsedGrid['cells'] = []
  let skippedInactive = 0

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || []
    const targetLabel = cellStr(row[targetColIdx])
    if (!targetLabel) continue
    if (isTargetCornerLabel(targetLabel)) continue
    targetRows.push({ rowIdx: r, label: targetLabel })

    for (const ev of evaluatorCols) {
      const raw = row[ev.colIdx]
      if (!isMatrixActiveCell(raw)) {
        if (cellStr(raw)) skippedInactive += 1
        continue
      }
      cells.push({
        rowIdx: r,
        colIdx: ev.colIdx,
        evaluatorLabel: ev.label,
        targetLabel,
      })
    }
  }

  if (!targetRows.length) errors.push('Sol sütunda değerlendirilecek kişi bulunamadı.')
  if (!cells.length && !errors.length) errors.push('Hiç «1» hücresi yok (değerlendirme ataması).')

  return {
    headerRowIdx,
    targetColIdx,
    evaluatorCols,
    targetRows,
    cells,
    errors,
  }
}

export function parseMatrixAssignmentExcel(buffer: ArrayBuffer): MatrixAssignmentImportPreview {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) {
    return emptyPreview(['Excel sayfası bulunamadı.'])
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  const grid = parseMatrixAssignmentGrid(matrix)
  if (grid.errors.length && !grid.cells.length) {
    return emptyPreview(grid.errors)
  }
  return buildMatrixAssignmentPreview(grid, [], [])
}

function emptyPreview(errors: string[]): MatrixAssignmentImportPreview {
  return {
    format: 'grid_01',
    pairs: [],
    errors,
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
}

/** Excel «1» hücrelerinden tüm geçerli evaluator–target çiftleri */
export function collectMatrixPairsFromGrid(
  grid: ParsedGrid,
  users: Array<{ id: string; name?: string | null; email?: string | null }>
): { pairs: MatrixAssignmentPair[]; warnings: string[] } {
  const warnings: string[] = []
  const evaluatorByCol = new Map<number, { id: string; label: string } | null>()
  for (const ev of grid.evaluatorCols) {
    const { user, reason } = matchUserForDutyImport({ name: ev.label, email: '' }, users)
    if (!user) {
      warnings.push(`Sütun «${ev.label}»: ${reason || 'Kullanıcı bulunamadı'}`)
      evaluatorByCol.set(ev.colIdx, null)
      continue
    }
    evaluatorByCol.set(ev.colIdx, { id: String(user.id), label: String(user.name || user.email || ev.label) })
  }

  const targetByRow = new Map<number, { id: string; label: string } | null>()
  for (const tr of grid.targetRows) {
    const { user, reason } = matchUserForDutyImport({ name: tr.label, email: '' }, users)
    if (!user) {
      warnings.push(`Satır ${tr.rowIdx + 1} «${tr.label}»: ${reason || 'Kullanıcı bulunamadı'}`)
      targetByRow.set(tr.rowIdx, null)
      continue
    }
    targetByRow.set(tr.rowIdx, { id: String(user.id), label: String(user.name || user.email || tr.label) })
  }

  const pairs: MatrixAssignmentPair[] = []
  const seen = new Set<string>()
  for (const cell of grid.cells) {
    const ev = evaluatorByCol.get(cell.colIdx)
    const tg = targetByRow.get(cell.rowIdx)
    if (!ev || !tg) continue
    const key = `${ev.id}::${tg.id}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push({
      evaluatorId: ev.id,
      evaluatorLabel: ev.label,
      targetId: tg.id,
      targetLabel: tg.label,
      rowNum: cell.rowIdx + 1,
      colNum: cell.colIdx + 1,
    })
  }
  return { pairs, warnings }
}

export function buildMatrixAssignmentPreview(
  grid: ParsedGrid,
  users: Array<{ id: string; name?: string | null; email?: string | null }>,
  existing: Array<{ evaluator_id: string; target_id: string }>
): MatrixAssignmentImportPreview {
  const errors = [...grid.errors]
  const { pairs: allPairs, warnings: matchWarnings } = collectMatrixPairsFromGrid(grid, users)
  const warnings = [...matchWarnings]
  const pairs: MatrixAssignmentPair[] = []
  const existingKeys = new Set(existing.map((a) => `${a.evaluator_id}::${a.target_id}`))

  const unmatchedEvaluators = new Set<string>()
  const unmatchedTargets = new Set<string>()
  let unknownEvaluators = 0
  let unknownTargets = 0
  matchWarnings.forEach((w) => {
    if (w.startsWith('Sütun')) {
      unknownEvaluators += 1
      const m = w.match(/«([^»]+)»/)
      if (m) unmatchedEvaluators.add(m[1])
    }
    if (w.startsWith('Satır')) {
      unknownTargets += 1
      const m = w.match(/«([^»]+)»/)
      if (m) unmatchedTargets.add(m[1])
    }
  })

  let alreadyExists = 0
  for (const p of allPairs) {
    const key = `${p.evaluatorId}::${p.targetId}`
    if (existingKeys.has(key)) {
      alreadyExists += 1
      continue
    }
    pairs.push(p)
  }

  if (pairs.length) {
    warnings.unshift(`${pairs.length} yeni değerlendirme ataması eklenecek.`)
  }
  if (alreadyExists) {
    warnings.push(`${alreadyExists} atama zaten kayıtlı (atlanır).`)
  }

  return {
    format: 'grid_01',
    pairs,
    errors,
    warnings,
    stats: {
      targetRows: grid.targetRows.length,
      evaluatorColumns: grid.evaluatorCols.length,
      cellsWithOne: grid.cells.length,
      assignmentsToAdd: pairs.length,
      alreadyExists,
      unknownTargets,
      unknownEvaluators,
      skippedInactive: 0,
    },
    unmatchedTargets: Array.from(unmatchedTargets).sort((a, b) => a.localeCompare(b, 'tr')),
    unmatchedEvaluators: Array.from(unmatchedEvaluators).sort((a, b) => a.localeCompare(b, 'tr')),
  }
}

export function buildMatrixAssignmentTemplateWorkbook(): ArrayBuffer {
  const rows: unknown[][] = [
    ['Değerlendirilecek ↓ / Değerlendiren →', 'Ali Örnek', 'Ayşe Örnek'],
    ['Mehmet Hedef', 1, 0],
    ['Zeynep Hedef', 0, 1],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Matris')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
