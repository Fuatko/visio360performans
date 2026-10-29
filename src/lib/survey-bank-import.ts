import * as XLSX from 'xlsx'

export type BankOption = { label: string; score: number | null }

export type BankQuestionType = 'single' | 'text'

export type BankQuestionDraft = {
  question_code: string | null
  sub_theme: string | null
  text_tr: string
  respondent_note: string | null
  question_type: BankQuestionType
  options: BankOption[]
}

export type BankAudience = 'ogrenci' | 'veli' | 'personel' | 'genel'

export type BankSheetParse = {
  sheet: string
  mainThemeGuess: string
  audienceGuess: BankAudience
  questions: BankQuestionDraft[]
  errors: string[]
  warnings: string[]
}

/** Başlık karşılaştırması için sadeleştirme (küçük harf, TR aksanları). */
function norm(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

/**
 * Seçenek başlığından puan çıkarır.
 * "Seçenek 5 — Düzey 5" → 5 | "Seçenek 10 — Puan dışı" → null
 */
function scoreFromHeader(header: string): number | null {
  const h = norm(header)
  if (h.includes('puan disi') || h.includes('puansiz')) return null
  const m = h.match(/duzey\s*(\d+)/)
  if (m) return Number(m[1])
  // "Düzey" yazmıyorsa seçenek sırasını puan kabul et: "secenek 3" → 3
  const m2 = h.match(/secenek\s*(\d+)/)
  return m2 ? Number(m2[1]) : null
}

/**
 * "Soru türü" sütununu okur. Açık uçlu sorularda seçenek yoktur ve
 * seçenek şartı aranmaz — bu cevaplar yapay zekâ metin analizini besler.
 */
function mapQuestionType(raw: unknown): BankQuestionType {
  const s = norm(raw)
  if (!s) return 'single'
  if (
    s.includes('uzun yanit') ||
    s.includes('acik uclu') ||
    s.includes('serbest') ||
    s.includes('metin') ||
    s.includes('text') ||
    s.includes('libre')
  ) {
    return 'text'
  }
  return 'single'
}

function guessAudience(sheetName: string): BankAudience {
  const s = norm(sheetName)
  if (s.includes('veli')) return 'veli'
  if (s.includes('personel') || s.includes('ogretmen') || s.includes('calisan')) return 'personel'
  if (s.includes('ogrenci') || s.includes('anket sorulari')) return 'ogrenci'
  return 'genel'
}

/** Bir sayfayı ayrıştırır. Başlık satırı "Soru kodu" içeren ilk satırdır. */
function parseSheet(ws: XLSX.WorkSheet, sheetName: string): BankSheetParse {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null })
  const out: BankSheetParse = {
    sheet: sheetName,
    mainThemeGuess: '',
    audienceGuess: guessAudience(sheetName),
    questions: [],
    errors: [],
    warnings: [],
  }

  const headerIdx = rows.findIndex((r) => (r || []).some((c) => norm(c) === 'soru kodu'))
  if (headerIdx < 0) {
    out.errors.push(`"${sheetName}": "Soru kodu" başlığı bulunamadı, sayfa atlandı.`)
    return out
  }

  // Ana tema tahmini: başlık satırının üstündeki ilk dolu hücre.
  for (let i = 0; i < headerIdx; i++) {
    const first = (rows[i] || []).find((c) => String(c ?? '').trim())
    if (first) {
      out.mainThemeGuess = String(first).trim()
      break
    }
  }

  const header = (rows[headerIdx] || []).map((c) => String(c ?? ''))
  const findCol = (...names: string[]) =>
    header.findIndex((h) => names.some((n) => norm(h) === n || norm(h).startsWith(n)))

  const cCode = findCol('soru kodu')
  const cSub = findCol('alt tema', 'alt konu')
  // "Soru kodu" da "soru" ile başladığı için önce tam eşleşme aranır, yoksa
  // kod sütunu dışındaki ilk "soru…" sütunu alınır.
  const cTextExact = header.findIndex((h) => norm(h) === 'soru')
  const cText =
    cTextExact >= 0 ? cTextExact : header.findIndex((h, i) => i !== cCode && norm(h).startsWith('soru'))
  const cWho = findCol('kim yanitlayacak')
  const cType = findCol('soru turu', 'soru tipi')
  const optCols = header
    .map((h, i) => ({ i, h }))
    .filter((x) => norm(x.h).startsWith('secenek'))

  if (cText < 0) {
    out.errors.push(`"${sheetName}": "Soru" sütunu bulunamadı, sayfa atlandı.`)
    return out
  }
  if (!optCols.length) {
    out.errors.push(`"${sheetName}": "Seçenek" sütunu bulunamadı, sayfa atlandı.`)
    return out
  }

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || []
    const text = String(row[cText] ?? '').trim()
    if (!text) continue

    const options: BankOption[] = []
    for (const oc of optCols) {
      const label = String(row[oc.i] ?? '').trim()
      if (!label) continue
      options.push({ label, score: scoreFromHeader(oc.h) })
    }

    // Soru türü sütunu yoksa: seçenek varsa seçmeli, yoksa açık uçlu say.
    const declared = cType >= 0 ? mapQuestionType(row[cType]) : options.length >= 2 ? 'single' : 'text'
    const qType: BankQuestionType = declared

    if (qType === 'single' && options.length < 2) {
      out.warnings.push(`${r + 1}. satır: seçmeli soruda ikiden az seçenek var, atlandı.`)
      continue
    }

    out.questions.push({
      question_code: cCode >= 0 ? String(row[cCode] ?? '').trim() || null : null,
      sub_theme: cSub >= 0 ? String(row[cSub] ?? '').trim() || null : null,
      text_tr: text,
      respondent_note: cWho >= 0 ? String(row[cWho] ?? '').trim() || null : null,
      question_type: qType,
      // Açık uçlu soruda seçenek saklanmaz.
      options: qType === 'text' ? [] : options,
    })
  }

  if (!out.questions.length) out.warnings.push(`"${sheetName}": okunabilir soru bulunamadı.`)
  return out
}

/** Çalışma kitabındaki her sayfayı ayrı ayrı ayrıştırır. */
export function parseSurveyBankWorkbook(buf: ArrayBuffer): BankSheetParse[] {
  const wb = XLSX.read(buf, { type: 'array' })
  return wb.SheetNames.map((name) => parseSheet(wb.Sheets[name], name)).filter(
    (s) => s.questions.length > 0 || s.errors.length > 0
  )
}
