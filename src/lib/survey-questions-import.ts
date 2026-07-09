import * as XLSX from 'xlsx'
import type { SurveyQuestionType } from '@/types/database'

/** Builder'daki QDraft ile aynı şekil (id hariç) — anket detay sayfası bunu doğrudan kullanır. */
export type SurveyQuestionDraft = {
  question_type: SurveyQuestionType
  text: string
  optionsText: string
  scale_min: number
  scale_max: number
  is_required: boolean
}

export type SurveyImportResult = {
  questions: SurveyQuestionDraft[]
  errors: string[]
  warnings: string[]
}

const QUESTION_TYPES: SurveyQuestionType[] = [
  'likert',
  'single',
  'multi',
  'text',
  'nps',
  'yesno',
  'date',
  'rank',
]

const NEEDS_OPTIONS: SurveyQuestionType[] = ['single', 'multi', 'rank']

/** Başlıkları ve tip değerlerini karşılaştırmak için normalize (küçük harf, TR/FR aksanları sadeleştir). */
function norm(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFKC')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/[éèêë]/g, 'e')
    .replace(/[àâä]/g, 'a')
    .replace(/[ùûü]/g, 'u')
    .replace(/[ôö]/g, 'o')
    .replace(/[îï]/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
}

type Field = 'text' | 'type' | 'options' | 'min' | 'max' | 'required'

const HEADER_ALIASES: Record<Field, string[]> = {
  text: ['soru', 'soru metni', 'question', 'question text', 'texte', 'texte de la question'],
  type: ['tip', 'tur', 'soru tipi', 'type', 'question type', 'type de question'],
  options: [
    'secenekler',
    'secenek',
    'siklar',
    'sik',
    'cevaplar',
    'cevap',
    'options',
    'option',
    'choix',
    'reponses',
  ],
  min: ['min', 'scale min', 'scale_min', 'minimum', 'alt', 'olcek min'],
  max: ['max', 'scale max', 'scale_max', 'maximum', 'ust', 'olcek max'],
  required: ['zorunlu', 'gerekli', 'required', 'mandatory', 'obligatoire'],
}

/** Her tip için kabul edilen etiketler (TR/EN/FR). */
const TYPE_ALIASES: Record<SurveyQuestionType, string[]> = {
  likert: ['likert', 'puan', 'puan olcegi', 'olcek', 'rating', 'rating scale', 'scale', 'echelle'],
  single: ['single', 'tek', 'tek secim', 'radio', 'choix unique', 'tekli'],
  multi: ['multi', 'coklu', 'coklu secim', 'multiple', 'multiple choice', 'checkbox', 'choix multiple'],
  text: ['text', 'metin', 'acik', 'acik uclu', 'acik uclu metin', 'open', 'open text', 'texte', 'libre'],
  nps: ['nps', 'net promoter', 'tavsiye'],
  yesno: ['yesno', 'evet hayir', 'evet/hayir', 'evet', 'hayir', 'yes no', 'yes/no', 'boolean', 'oui non', 'oui/non'],
  date: ['date', 'tarih'],
  rank: ['rank', 'ranking', 'siralama', 'sirala', 'classement'],
}

function resolveType(raw: string): SurveyQuestionType | null {
  const n = norm(raw)
  if (!n) return null
  if (QUESTION_TYPES.includes(n as SurveyQuestionType)) return n as SurveyQuestionType
  for (const type of QUESTION_TYPES) {
    if (TYPE_ALIASES[type].some((a) => n === a || n.includes(a))) return type
  }
  return null
}

function mapHeaders(headerRow: unknown[]): Partial<Record<Field, number>> {
  const idx: Partial<Record<Field, number>> = {}
  const normalized = headerRow.map((h) => norm(h))
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    const aliases = HEADER_ALIASES[field]
    const found = normalized.findIndex((h) => h && aliases.some((a) => h === a || h === a.replace(/ /g, '_')))
    if (found >= 0) idx[field] = found
  }
  return idx
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

/** Seçenekleri satır sonu, | veya ; ile ayır. */
function splitOptions(v: string): string[] {
  if (!v.trim()) return []
  return v
    .split(/\r?\n+|\s*\|\s*|\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function truthy(v: string): boolean {
  const n = norm(v)
  return ['evet', 'yes', 'oui', 'true', '1', 'x', 'zorunlu', 'e'].includes(n)
}

/**
 * Anket sorularını Excel'den ayrıştırır (client-side).
 * Beklenen sütunlar: Soru | Tip | Seçenekler | Min | Max | Zorunlu
 */
export function parseSurveyQuestionsWorkbook(data: ArrayBuffer): SurveyImportResult {
  const errors: string[] = []
  const warnings: string[] = []
  const questions: SurveyQuestionDraft[] = []

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(data, { type: 'array' })
  } catch {
    return { questions, errors: ['Excel dosyası okunamadı.'], warnings }
  }

  const sheetName = wb.SheetNames[0]
  const sheet = sheetName ? wb.Sheets[sheetName] : null
  if (!sheet) return { questions, errors: ['Excel dosyasında sayfa bulunamadı.'], warnings }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' })
  if (matrix.length < 2) {
    return { questions, errors: ['Excel boş görünüyor (başlık + en az bir soru satırı gerekli).'], warnings }
  }

  const col = mapHeaders(matrix[0] || [])
  if (col.text == null) {
    return {
      questions,
      errors: ['«Soru» sütunu bulunamadı. Lütfen şablonu indirip sütun başlıklarını koruyun.'],
      warnings,
    }
  }
  if (col.type == null) {
    warnings.push('«Tip» sütunu bulunamadı — tüm sorular «Açık uçlu metin» varsayıldı.')
  }

  for (let r = 1; r < matrix.length; r++) {
    const raw = matrix[r] || []
    const text = cellStr(raw[col.text])
    if (!text) continue // boş satır atla

    const rowNo = r + 1
    let type: SurveyQuestionType = 'text'
    if (col.type != null) {
      const rawType = cellStr(raw[col.type])
      const resolved = resolveType(rawType)
      if (resolved) {
        type = resolved
      } else if (rawType) {
        warnings.push(`Satır ${rowNo}: «${rawType}» tipi tanınmadı — «Açık uçlu metin» kullanıldı.`)
      } else {
        type = 'likert'
      }
    }

    const optionsText = col.options != null ? splitOptions(cellStr(raw[col.options])).join('\n') : ''
    if (NEEDS_OPTIONS.includes(type) && !optionsText) {
      warnings.push(`Satır ${rowNo}: «${text}» için seçenek girilmemiş (seçenekli soru tipi seçildi).`)
    }

    const scaleMin = col.min != null ? Number(cellStr(raw[col.min])) : NaN
    const scaleMax = col.max != null ? Number(cellStr(raw[col.max])) : NaN
    const isRequired = col.required != null ? truthy(cellStr(raw[col.required])) : false

    questions.push({
      question_type: type,
      text,
      optionsText,
      scale_min: Number.isFinite(scaleMin) ? scaleMin : 1,
      scale_max: Number.isFinite(scaleMax) ? scaleMax : 5,
      is_required: isRequired,
    })
  }

  if (questions.length === 0) {
    errors.push('Excel’de geçerli soru satırı bulunamadı.')
  }

  return { questions, errors, warnings }
}

/** İçe aktarma formatını gösteren örnek şablon üretir ve indirir. */
export function downloadSurveyImportTemplate(filename = 'anket-sorulari-sablonu.xlsx') {
  const header = ['Soru', 'Tip', 'Seçenekler', 'Min', 'Max', 'Zorunlu']
  const examples: (string | number)[][] = [
    ['Hizmetten genel memnuniyetiniz nedir?', 'likert', '', 1, 5, 'Evet'],
    ['Hangi ürünü kullanıyorsunuz?', 'single', 'Ürün A | Ürün B | Ürün C', '', '', 'Evet'],
    ['Hangi özellikleri kullanıyorsunuz?', 'multi', 'Raporlar; Bildirimler; Entegrasyonlar', '', '', 'Hayır'],
    ['Bizi tavsiye eder misiniz?', 'nps', '', '', '', 'Evet'],
    ['Görüş ve önerileriniz', 'text', '', '', '', 'Hayır'],
    ['Uygulamamızı beğendiniz mi?', 'yesno', '', '', '', 'Evet'],
    ['Önceliklendirin', 'rank', 'Fiyat | Kalite | Hız', '', '', 'Hayır'],
  ]

  const ws = XLSX.utils.aoa_to_sheet([header, ...examples])
  ws['!cols'] = [{ wch: 42 }, { wch: 10 }, { wch: 36 }, { wch: 6 }, { wch: 6 }, { wch: 9 }]

  // Yardım sayfası: geçerli tip değerleri
  const help: string[][] = [
    ['Tip değeri', 'Açıklama'],
    ['likert', 'Puan ölçeği (Min/Max ile). Seçenek gerekmez.'],
    ['single', 'Tek seçim. Seçenekler sütununu | ; veya satır ile ayırın.'],
    ['multi', 'Çoklu seçim. Seçenekler sütununu doldurun.'],
    ['text', 'Açık uçlu metin. Seçenek gerekmez.'],
    ['nps', 'NPS 0-10. Seçenek gerekmez.'],
    ['yesno', 'Evet / Hayır.'],
    ['date', 'Tarih.'],
    ['rank', 'Sıralama. Seçenekler sütununu doldurun.'],
    ['', ''],
    ['Zorunlu', 'Evet / Hayır (veya 1 / 0).'],
  ]
  const helpWs = XLSX.utils.aoa_to_sheet(help)
  helpWs['!cols'] = [{ wch: 14 }, { wch: 60 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sorular')
  XLSX.utils.book_append_sheet(wb, helpWs, 'Yardım')
  XLSX.writeFile(wb, filename)
}
