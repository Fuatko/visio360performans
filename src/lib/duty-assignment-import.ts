import * as XLSX from 'xlsx'
import { DutyLike, matchDutyIdForTitle, normalizeMatchKey } from '@/lib/duty-title-match'

export type DutyAssignmentImportRow = {
  rowNum: number
  name: string
  email: string
  dutyName: string
}

export type DutyAssignmentMatch = {
  rowNum: number
  name: string
  email: string
  dutyName: string
  userId: string
  userLabel: string
  dutyId: string
  dutyLabel: string
}

export type DutyAssignmentImportPreview = {
  format: 'long_list'
  rows: DutyAssignmentImportRow[]
  matched: DutyAssignmentMatch[]
  errors: string[]
  warnings: string[]
  stats: {
    totalRows: number
    uniquePeople: number
    assignmentsToAdd: number
    alreadyAssigned: number
    userNotFound: number
    dutyNotFound: number
  }
}

const NAME_HEADERS = ['ad_soyad', 'ad', 'isim', 'name', 'person', 'kisi', 'degerlendirilen']
const EMAIL_HEADERS = ['e_posta', 'eposta', 'email', 'e_mail', 'mail']
const DUTY_HEADERS = ['gorev', 'görev', 'duty', 'rol', 'role', 'paket', 'statü', 'statu', 'unvan']

function normHeader(h: string) {
  return normalizeMatchKey(h).replace(/\s+/g, '_')
}

function cellStr(v: unknown) {
  return String(v ?? '').trim()
}

function mapHeaders(headerRow: string[]) {
  const normalized = headerRow.map(normHeader)
  const find = (aliases: string[]) => normalized.findIndex((h) => aliases.some((a) => h === a || h.includes(a)))
  return {
    name: find(NAME_HEADERS),
    email: find(EMAIL_HEADERS),
    duty: find(DUTY_HEADERS),
  }
}

function parseLongList(matrix: unknown[][]): { rows: DutyAssignmentImportRow[]; errors: string[] } {
  const errors: string[] = []
  const rows: DutyAssignmentImportRow[] = []
  if (!matrix.length) {
    errors.push('Excel dosyası boş.')
    return { rows, errors }
  }

  let headerRowIdx = 0
  for (let i = 0; i < Math.min(5, matrix.length); i++) {
    const cols = (matrix[i] || []).map(cellStr)
    const joined = cols.map(normHeader).join(' ')
    if (DUTY_HEADERS.some((d) => joined.includes(d)) && NAME_HEADERS.some((n) => joined.includes(n) || joined.includes('soyad'))) {
      headerRowIdx = i
      break
    }
  }

  const header = (matrix[headerRowIdx] || []).map(cellStr)
  const col = mapHeaders(header)
  if (col.name < 0 || col.duty < 0) {
    errors.push('Başlık satırı bulunamadı. Beklenen sütunlar: Ad Soyad | E-posta (opsiyonel) | Görev')
    return { rows, errors }
  }

  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const raw = matrix[i] || []
    const name = cellStr(raw[col.name])
    const email = col.email >= 0 ? cellStr(raw[col.email]) : ''
    const dutyName = cellStr(raw[col.duty])
    if (!name && !email && !dutyName) continue
    if (!name && !email) {
      errors.push(`Satır ${i + 1}: Ad Soyad veya E-posta gerekli.`)
      continue
    }
    if (!dutyName) {
      errors.push(`Satır ${i + 1}: Görev sütunu boş.`)
      continue
    }
    rows.push({ rowNum: i + 1, name, email, dutyName })
  }

  if (!rows.length && !errors.length) errors.push('Veri satırı bulunamadı.')
  return { rows, errors }
}

export function parseDutyAssignmentExcel(buffer: ArrayBuffer): DutyAssignmentImportPreview {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) {
    return emptyPreview(['Excel sayfası bulunamadı.'])
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  const { rows, errors } = parseLongList(matrix)
  return {
    format: 'long_list',
    rows,
    matched: [],
    errors,
    warnings: [],
    stats: {
      totalRows: rows.length,
      uniquePeople: 0,
      assignmentsToAdd: 0,
      alreadyAssigned: 0,
      userNotFound: 0,
      dutyNotFound: 0,
    },
  }
}

function emptyPreview(errors: string[]): DutyAssignmentImportPreview {
  return {
    format: 'long_list',
    rows: [],
    matched: [],
    errors,
    warnings: [],
    stats: {
      totalRows: 0,
      uniquePeople: 0,
      assignmentsToAdd: 0,
      alreadyAssigned: 0,
      userNotFound: 0,
      dutyNotFound: 0,
    },
  }
}

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase()
}

export function matchUserForDutyImport(
  row: Pick<DutyAssignmentImportRow, 'name' | 'email'>,
  users: Array<{ id: string; name?: string | null; email?: string | null }>
): { user: (typeof users)[0] | null; reason?: string } {
  const email = normalizeEmail(row.email)
  if (email) {
    const byEmail = users.filter((u) => normalizeEmail(String(u.email || '')) === email)
    if (byEmail.length === 1) return { user: byEmail[0] }
    if (byEmail.length > 1) return { user: null, reason: `E-posta birden fazla kullanıcıda: ${email}` }
  }

  const nameKey = normalizeMatchKey(row.name)
  if (!nameKey) return { user: null, reason: 'Ad soyad boş' }

  const byName = users.filter((u) => normalizeMatchKey(String(u.name || '')) === nameKey)
  if (byName.length === 1) return { user: byName[0] }
  if (byName.length > 1) return { user: null, reason: `Aynı isimde ${byName.length} kullanıcı — e-posta ekleyin` }
  return { user: null, reason: 'Kullanıcı bulunamadı' }
}

export function buildDutyAssignmentPreview(
  parsed: DutyAssignmentImportPreview,
  users: Array<{ id: string; name?: string | null; email?: string | null }>,
  duties: DutyLike[],
  existingRows: Array<{ duty_id: string; user_id: string }>
): DutyAssignmentImportPreview {
  const errors = [...parsed.errors]
  const warnings: string[] = []
  const matched: DutyAssignmentMatch[] = []
  const seenAssign = new Set(existingRows.map((r) => `${r.duty_id}::${r.user_id}`))
  const people = new Set<string>()

  let userNotFound = 0
  let dutyNotFound = 0
  let alreadyAssigned = 0
  let assignmentsToAdd = 0

  for (const row of parsed.rows) {
    const { user, reason } = matchUserForDutyImport(row, users)
    if (!user) {
      userNotFound += 1
      warnings.push(`Satır ${row.rowNum}: ${reason || 'Kullanıcı yok'} — ${row.name || row.email}`)
      continue
    }
    people.add(String(user.id))

    const dutyId = matchDutyIdForTitle(row.dutyName, duties)
    if (!dutyId) {
      dutyNotFound += 1
      warnings.push(`Satır ${row.rowNum}: Görev eşleşmedi — «${row.dutyName}»`)
      continue
    }

    const dutyLabel = duties.find((d) => String(d.id) === dutyId)?.name || row.dutyName
    const k = `${dutyId}::${user.id}`
    if (seenAssign.has(k)) {
      alreadyAssigned += 1
      continue
    }
    seenAssign.add(k)
    assignmentsToAdd += 1
    matched.push({
      rowNum: row.rowNum,
      name: row.name,
      email: row.email,
      dutyName: row.dutyName,
      userId: String(user.id),
      userLabel: String(user.name || user.email || row.name),
      dutyId,
      dutyLabel: String(dutyLabel || row.dutyName),
    })
  }

  if (assignmentsToAdd > 0) {
    warnings.unshift(`${assignmentsToAdd} yeni görev ataması eklenecek (mevcut atamalar korunur).`)
  }

  return {
    ...parsed,
    matched,
    errors,
    warnings,
    stats: {
      totalRows: parsed.rows.length,
      uniquePeople: people.size,
      assignmentsToAdd,
      alreadyAssigned,
      userNotFound,
      dutyNotFound,
    },
  }
}

export function mergeDutyUserAssignments(
  existingRows: Array<{ duty_id: string; user_id: string; is_active?: boolean }>,
  matched: DutyAssignmentMatch[]
) {
  const rows = [...existingRows.map((r) => ({ ...r, is_active: r.is_active !== false }))]
  const seen = new Set(rows.map((r) => `${r.duty_id}::${r.user_id}`))
  let added = 0
  for (const m of matched) {
    const k = `${m.dutyId}::${m.userId}`
    if (seen.has(k)) continue
    seen.add(k)
    rows.push({ duty_id: m.dutyId, user_id: m.userId, is_active: true })
    added += 1
  }
  return { rows, added }
}

export function buildDutyAssignmentTemplateWorkbook(): ArrayBuffer {
  const rows = [
    ['Ad Soyad', 'E-posta', 'Görev'],
    ['Ayşe Örnek', 'ayse.ornek@okul.tr', 'Öğretmen'],
    ['Ali Örnek', 'ali.ornek@okul.tr', 'Öğretmen'],
    ['Ali Örnek', 'ali.ornek@okul.tr', 'Sınıf Öğretmeni'],
    ['Mehmet Örnek', 'mehmet.ornek@okul.tr', 'Nöbetçi Öğretmen'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'GorevAtama')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
