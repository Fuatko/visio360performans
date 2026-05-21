import * as XLSX from 'xlsx'
import {
  isNoInfoAnswerText,
  JOB_EVALUATION_PERFORMANCE_SCORES,
  resolveImportAnswerLevel,
} from '@/lib/evaluation-scale'

export type QuestionsImportRow = {
  cat_tr: string
  cat_fr: string
  q_tr: string
  q_fr: string
  a_tr: string
  a_fr: string
  std_score: number
  reel_score: number
  q_order: number
  a_order: number
  level: string | null
}

export type QuestionGroupPreview = {
  category: string
  question: string
  answerCount: number
  answers: Array<{ tr: string; fr: string; score: number }>
}

export type QuestionsImportPreview = {
  rows: QuestionsImportRow[]
  format: 'flat' | 'bilingual_blocks' | 'bilingual_wide'
  stats: {
    rowCount: number
    categoryCount: number
    categories: string[]
    questionCount: number
    answerCount: number
    /** Soru başına cevap sayısı → kaç soru (örn. { "4": 20, "11": 5 }) */
    answersPerQuestion: Record<string, number>
    jobEvaluationQuestionCount: number
    /** Önizleme: 1 soru → altında cevaplar */
    questionGroups: QuestionGroupPreview[]
  }
  errors: string[]
  warnings: string[]
}

const HEADER_ALIASES: Record<keyof QuestionsImportRow, string[]> = {
  cat_tr: ['cat_tr', 'kategori_tr', 'category_tr', 'kategori', 'alt_kategori_tr'],
  cat_fr: ['cat_fr', 'kategori_fr', 'category_fr', 'categorie', 'catégorie', 'alt_kategori_fr'],
  q_tr: ['q_tr', 'soru_tr', 'question_tr', 'soru'],
  q_fr: ['q_fr', 'soru_fr', 'question_fr', 'question'],
  a_tr: ['a_tr', 'cevap_tr', 'answer_tr', 'cevap', 'cevaplar', 'answers_tr'],
  a_fr: ['a_fr', 'cevap_fr', 'answer_fr', 'reponses', 'réponses', 'responses'],
  std_score: ['std_score', 'std', 'standart_puan', 'standard_score', 'puan_std', 'puanlama', 'puan', 'aciklama', 'açıklama', 'score'],
  reel_score: ['reel_score', 'reel', 'gercek_puan', 'real_score', 'puan_reel', 'explication', 'explication_score'],
  q_order: ['q_order', 'soru_sira', 'question_order', 'soru_sirasi'],
  a_order: ['a_order', 'cevap_sira', 'answer_order', 'cevap_sirasi'],
  level: ['level', 'seviye', 'level_code'],
}

type BilingualCols = {
  trCat: number
  trQ: number
  trA: number
  trScore: number
  frCat: number
  frQ: number
  frA: number
  frScore: number
  /** Kategori | Kriter | Cevaplar başlık satırı (üstteki ana başlık satırı değil) */
  headerRow: number
  dataStartRow: number
}

type AnswerColPair = { a: number; s: number }

type WideBilingualCols = BilingualCols & {
  headerRow: number
  trPairs: AnswerColPair[]
  frPairs: AnswerColPair[]
}

function normHeader(h: string) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .normalize('NFKC')
    .replace(/ı/g, 'i')
    .replace(/[éèêë]/g, 'e')
    .replace(/[àâä]/g, 'a')
    .replace(/[ùûü]/g, 'u')
    .replace(/[ôö]/g, 'o')
    .replace(/ç/g, 'c')
}

function cellStr(v: unknown) {
  if (v == null) return ''
  return String(v).trim()
}

/** Excel birleşik hücre: yalnızca Kategori/Kriter (ve FR) — Cevaplar/açıklama birleştirilmez */
function expandMergedCells(
  matrix: unknown[][],
  sheet: XLSX.WorkSheet,
  onlyCols?: Set<number>
): { matrix: unknown[][]; filled: number } {
  const merges = sheet['!merges']
  if (!merges?.length) return { matrix, filled: 0 }

  const maxRow = Math.max(matrix.length - 1, ...merges.map((m) => m.e.r))
  const out: unknown[][] = []
  for (let r = 0; r <= maxRow; r++) {
    const src = matrix[r] || []
    out[r] = [...src]
  }

  let filled = 0
  for (const m of merges) {
    const sr = m.s.r
    const sc = m.s.c
    const er = m.e.r
    const ec = m.e.c
    if (onlyCols?.size) {
      let touches = false
      for (let c = sc; c <= ec; c++) {
        if (onlyCols.has(c)) {
          touches = true
          break
        }
      }
      if (!touches) continue
    }

    const masterAddr = XLSX.utils.encode_cell({ r: sr, c: sc })
    const masterCell = sheet[masterAddr]
    const value =
      masterCell != null && masterCell.v != null && masterCell.v !== ''
        ? cellStr(masterCell.v)
        : cellStr(out[sr]?.[sc])
    if (!value) continue

    for (let r = sr; r <= er; r++) {
      if (!out[r]) out[r] = []
      for (let c = sc; c <= ec; c++) {
        if (onlyCols?.size && !onlyCols.has(c)) continue
        const cur = cellStr(out[r][c])
        if (!cur) {
          out[r][c] = value
          filled += 1
        }
      }
    }
  }

  return { matrix: out, filled }
}

function isLikelyRubricLevelLabel(text: string): boolean {
  const s = normHeader(String(text || '')).replace(/_/g, ' ')
  if (!s) return false
  if (s.includes('beklentiyi') || s.includes('karşilar') || s.includes('karsilar')) return true
  if (/^(iyi|orta|zayif|fort|faible|moyen)/.test(s) && s.length < 50) return true
  return false
}

/** Puan / reel / seviye etiketi yanlışlıkla Soru hücresinde */
function isLikelyScoreOrNoiseLabel(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return true
  if (isHeaderLabel(t)) return true
  if (isLikelyRubricLevelLabel(t)) return true
  if (/^\d+$/.test(t)) return true
  if (/^\d+[.,]\d+$/.test(t)) return true
  if (/^[5013](?:\s*[+\-])?$/.test(t)) return true
  if (t.length <= 5 && /^[5013]/.test(t) && !/[a-zA-ZÇĞİÖŞÜçğıöşü]{3,}/.test(t)) return true
  return false
}

function isLikelyRealCategoryName(text: string): boolean {
  const t = String(text || '').trim()
  if (!t || isLikelyScoreOrNoiseLabel(t)) return false
  return t.length >= 4
}

function isLikelyRealQuestionText(text: string, categoryHint = ''): boolean {
  const t = String(text || '').trim()
  if (!t || isLikelyScoreOrNoiseLabel(t)) return false
  const cat = String(categoryHint || '').trim()
  if (cat && t === cat) return false
  if (t.length >= 8 && /[a-zA-ZÇĞİÖŞÜçğıöşü]{4,}/.test(t)) return true
  return t.length >= 20
}

function sanitizeExplicitLabels(
  catTr: string,
  qTr: string,
  catFr: string,
  qFr: string,
  carryCatTr = '',
  carryCatFr = ''
) {
  const catOk = isLikelyRealCategoryName(catTr) ? catTr : ''
  const catFrOk = isLikelyRealCategoryName(catFr) ? catFr : ''
  return {
    catTr: catOk,
    qTr: isLikelyRealQuestionText(qTr, catOk || carryCatTr) ? qTr : '',
    catFr: catFrOk,
    qFr: isLikelyRealQuestionText(qFr, catFrOk || carryCatFr) ? qFr : '',
  }
}

/** Aynı Excel satırında TR+FR soru = tek soru (çift sayım yok) */
function applyBilingualQuestionCarry(
  carry: { catTr: string; catFr: string; qTr: string; qFr: string },
  explicitQTr: string,
  explicitQFr: string,
  state: { qInstance: number; aOrder: number }
) {
  const prevTr = carry.qTr
  const prevFr = carry.qFr
  const newTr = explicitQTr
  const newFr = explicitQFr

  if (newTr) carry.qTr = newTr
  if (newFr) carry.qFr = newFr
  if (newTr && !carry.qFr) carry.qFr = newFr || carry.catFr || newTr
  if (newFr && !carry.qTr) carry.qTr = newTr || carry.catTr || newFr

  const changed = (newTr && newTr !== prevTr) || (newFr && newFr !== prevFr)
  if (changed) {
    state.qInstance = state.qInstance > 0 ? state.qInstance + 1 : 1
    state.aOrder = 0
  }
}

/** 4 cevap sonrası yeni şık satırı (Soru hücresi boş, birleşik hücre bitti) */
function looksLikeNewRubricAnswerStart(aTr: string, aFr: string, scoreLabel: string): boolean {
  if (isAnswerContinuationLine(aTr, aFr, scoreLabel)) return false
  const sc = parseScoreFromLabel(scoreLabel)
  if ([5, 3, 1, 0].includes(sc)) return true
  if (aTr) {
    const peeled = peelLeadingScoreFromAnswer(aTr)
    if (peeled.scoreLabel && [5, 3, 1, 0].includes(parseScoreFromLabel(peeled.scoreLabel))) return true
  }
  if (isNoInfoAnswerText(aTr, aFr)) return true
  return false
}

/** Rubrik alt satırı: — ile başlayan veya puan sütunu boş devam metni */
function isAnswerContinuationLine(aTr: string, aFr: string, scoreLabel: string): boolean {
  const primary = (aTr || aFr).trim()
  if (!primary) return false

  if (scoreLabel.trim()) {
    const sc = parseScoreFromLabel(scoreLabel)
    if ([5, 3, 1, 0].includes(sc)) return false
  }

  if (/^[—–\-•]\s*/u.test(primary)) return true
  if (/^[5013](?:\s*[+\-]|(?=[A-Za-zÇĞİÖŞÜçğıöşü]))/.test(primary)) return false
  if (!scoreLabel.trim() && /^[a-zçğıöşü(]/.test(primary)) return true
  return false
}

function peelLeadingScoreFromAnswer(text: string): { scoreLabel: string; text: string } {
  const t = text.trim()
  const m = t.match(/^([5013])(?:\s*([+\-]))?\s*(.+)$/)
  if (m?.[3]) {
    return { scoreLabel: m[1] + (m[2] || ''), text: m[3].trim() }
  }
  return { scoreLabel: '', text: t }
}

function appendAnswerContinuation(last: QuestionsImportRow, aTr: string, aFr: string) {
  const stripLead = (s: string) => s.replace(/^[—–\-•]\s*/u, '').trim()
  const join = (prev: string, next: string) => {
    const n = stripLead(next)
    if (!n) return prev
    if (!prev) return n
    return `${prev}\n${n}`
  }
  if (aTr) last.a_tr = join(last.a_tr, aTr)
  if (aFr) last.a_fr = join(last.a_fr || last.a_tr, aFr)
  else if (aTr && !last.a_fr) last.a_fr = last.a_tr
}

/** Tek hücrede Alt+Enter veya | / ; ile yazılmış birden fazla cevap veya puan satırı */
function splitMultilineCell(text: string): string[] {
  const raw = String(text ?? '')
  if (!raw.trim()) return []
  if (!/[\r\n|;]/.test(raw)) return [raw.trim()]
  return raw
    .split(/\r?\n+|(?:\s*\|\s*)|(?:\s*;\s*)/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Tek hücrede 4 şık (Alt+Enter) — rehberlik öğretmeni formatı */
function hasMultilineRubricCell(aTr: string, aFr: string, scoreLabel: string) {
  return (
    splitMultilineCell(aTr).length > 1 ||
    splitMultilineCell(aFr).length > 1 ||
    splitMultilineCell(scoreLabel).length > 1
  )
}

/** Kategori hücresinde üst satır kategori, alt satır soru (nadir) */
function splitCategoryQuestionCell(text: string): { cat: string; question: string } | null {
  const lines = splitMultilineCell(text)
  if (lines.length < 2) return null
  const cat = lines[0]
  const question = lines.slice(1).join('\n').trim()
  if (!cat || !question || cat.length > 120) return null
  if (question.length < 12) return null
  return { cat, question }
}

/** Rubrik: 4 satır VEYA tek satırda 4 cevap (Alt+Enter) */
function answerLinesForRow(
  aTr: string,
  aFr: string,
  scoreLabel: string,
  singleRowQuestion: boolean
) {
  if (singleRowQuestion) {
    const aLinesTr = splitMultilineCell(aTr)
    const aLinesFr = splitMultilineCell(aFr)
    const scoreLines = splitMultilineCell(scoreLabel)
    const lineCount = Math.max(aLinesTr.length, aLinesFr.length, scoreLines.length, 1)
    return { aLinesTr, aLinesFr, scoreLines, lineCount, multiline: lineCount > 1 }
  }
  return {
    aLinesTr: aTr ? [aTr] : [],
    aLinesFr: aFr ? [aFr] : [],
    scoreLines: scoreLabel ? [scoreLabel] : [],
    lineCount: aTr || aFr ? 1 : 0,
    multiline: false,
  }
}

function cellNum(v: unknown, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function mapHeaders(headerRow: string[]): Partial<Record<keyof QuestionsImportRow, number>> {
  const idx: Partial<Record<keyof QuestionsImportRow, number>> = {}
  const normalized = headerRow.map(normHeader)
  for (const key of Object.keys(HEADER_ALIASES) as Array<keyof QuestionsImportRow>) {
    const aliases = HEADER_ALIASES[key]
    const found = normalized.findIndex((h) => h && aliases.some((a) => h === a || h.includes(a)))
    if (found >= 0) idx[key] = found
  }
  return idx
}

/**
 * Açıklama hücresinden puan.
 * - İş değ.: "5", "3+", "1-3", "0" → 5, 3, 1, 0
 * - Geniş ölçek (9/11/15 şık): "11", "12", "16" vb. → ham sayı (11+ asla 5'e indirgenmez)
 */
export function parseScoreFromLabel(label: string): number {
  const s = normHeader(label).replace(/_/g, ' ')
  if (!s) return 0
  if (
    s.includes('bilgim_yok') ||
    s.includes('fikrim_yok') ||
    s.includes('je_ne_sais') ||
    s.includes('je_n_ai_pas') ||
    s.includes('sans_avis') ||
    s.includes('aucune_idee') ||
    s.includes('aucune') ||
    s === 'n/a' ||
    s === 'na'
  ) {
    return 0
  }

  // TR rubrik: İyi / Orta / Zayıf (rehberlik öğretmeni vb.)
  if (/\biyi\b/.test(s) || s === 'i̇yi') return 5
  if (/\bzayif\b/.test(s)) return 1
  if (/\borta\b/.test(s) || s.includes('gelistirilebilir') || s.includes('geliştirilebilir')) return 3

  // FR metin etiketleri (Forte / Répond aux attentes / Faible / Aucune)
  if (/\bforte?\b/.test(s) || /\bfort\b/.test(s) || s.includes('fort_e') || s.includes('tres_bonne') || s.includes('exemplaire'))
    return 5
  if (s.includes('moyen') || s.includes('moyenne')) return 3
  if (
    s.includes('attente') ||
    s.includes('repond_aux') ||
    s.includes('remplit') ||
    s.includes('moyenne') ||
    s.includes('beiklentiyi') ||
    s.includes('beklentiyi') ||
    s.includes('karsilar') ||
    s.includes('karşılar')
  ) {
    return 3
  }
  if (/\bfaible\b/.test(s) || s.includes('insuffisant')) return 1

  const m = s.match(/(\d+(?:\.\d+)?)/)
  const n = m ? Number(m[1]) : NaN

  if (Number.isFinite(n) && n >= 11) return Math.round(n)

  if (s.includes('3+') || (s.startsWith('3') && !(Number.isFinite(n) && n >= 10))) return 3
  if (s.includes('1-3') || s.includes('1_3') || (/^1\b/.test(s) && !(Number.isFinite(n) && n >= 10))) return 1

  if (!m || !Number.isFinite(n)) return 0
  return Math.round(n)
}

function columnLabelSingle(matrix: unknown[][], row: number, col: number) {
  return normHeader(cellStr(matrix[row]?.[col]))
}

function columnLabel(matrix: unknown[][], col: number, maxHeaderRows: number) {
  const parts: string[] = []
  for (let r = 0; r < maxHeaderRows; r++) {
    const v = normHeader(cellStr(matrix[r]?.[col]))
    if (v) parts.push(v)
  }
  return parts.join(' ')
}

/** Excel üst satırı: SINIF ÖĞRETMENİ… | ÉVALUATION… (veri değil) */
function isDocumentTitleOnlyRow(raw: unknown[]) {
  const cells = (raw || []).map((c) => cellStr(c)).filter(Boolean)
  if (!cells.length) return false
  if (cells.some((c) => isHeaderLabel(c) || isQuestionHeaderLabel(c) || isAnswerHeaderLabel(c))) return false
  // Kategori | Soru | Cevaplar… dolu satır veridir («Öğretmen» kategori adında geçebilir)
  if (cells.length >= 3) return false
  const joined = cells.join(' ')
  // Yalnızca kategori adı (mor başlık) — üst başlık değil
  if (cells.length <= 2 && !/degerlendirme|değerlendirme|evaluation|performance/i.test(joined)) return false
  if (joined.length < 28) return false
  return /degerlendirme|değerlendirme|evaluation|performance|enseignant|enseignants|ogretmen|öğretmen|ogretmeni|öğretmeni|sorular|questions|professionnelle/i.test(
    joined
  )
}

function findBilingualHeaderRowIndex(matrix: unknown[][]): number {
  for (let r = 0; r < Math.min(15, matrix.length); r++) {
    const raw = matrix[r] || []
    if (isDocumentTitleOnlyRow(raw)) continue
    const joined = raw
      .slice(0, 12)
      .map((c) => normHeader(cellStr(c)))
      .filter(Boolean)
      .join(' ')
    if (joined.includes('turkce') && (joined.includes('fransizca') || joined.includes('francais'))) continue

    let hits = 0
    for (let c = 0; c < (raw as unknown[]).length; c++) {
      const n = normHeader(cellStr(raw[c]))
      if (TR_HEADER_LABELS.has(n) || FR_HEADER_LABELS.has(n)) hits++
      else if (isQuestionHeaderLabel(n) || isAnswerHeaderLabel(n)) hits++
    }
    if (hits >= 3) return r

    for (let c = 0; c < (raw as unknown[]).length - 1; c++) {
      const a = normHeader(cellStr(raw[c]))
      const b = normHeader(cellStr(raw[c + 1]))
      if (a === 'kategori' && (b === 'kriter' || b === 'soru' || b === 'critere')) return r
      if (a === 'categorie' && (b === 'critere' || b === 'question')) return r
    }
  }
  return 1
}

function isFrenchSideLabel(label: string) {
  return (
    label.includes('categorie') ||
    label.includes('fransizca') ||
    label.includes('francais') ||
    (label.includes('question') && !label.includes('soru')) ||
    label.includes('reponses') ||
    label.includes('explication')
  )
}

/** İlk eşleşen sütun; ana_kategori / ana_baslik gibi yanlış kolonları ele */
function findTrColumn(
  matrix: unknown[][],
  maxCols: number,
  exact: string[],
  includes: string[],
  excludeIncludes: string[] = [],
  headerRow = 1
) {
  const exactSet = new Set(exact)
  for (let c = 0; c < maxCols; c++) {
    const label = columnLabelSingle(matrix, headerRow, c)
    if (!label || isFrenchSideLabel(label)) continue
    if (exactSet.has(label)) return c
  }
  for (let c = 0; c < maxCols; c++) {
    const label = columnLabelSingle(matrix, headerRow, c)
    if (!label || isFrenchSideLabel(label)) continue
    if (excludeIncludes.some((x) => label.includes(x))) continue
    if (includes.some((x) => label.includes(x))) return c
  }
  return -1
}

function findFrColumn(matrix: unknown[][], maxCols: number, includes: string[], headerRow = 1) {
  for (let c = 0; c < maxCols; c++) {
    const label = columnLabelSingle(matrix, headerRow, c)
    if (!label || !isFrenchSideLabel(label)) continue
    if (includes.some((x) => label.includes(x))) return c
  }
  return -1
}

/** Soru sütunu: Soru / Kriter (Kriter-Cevaplar sütunu değil) */
function findTrQuestionColumn(matrix: unknown[][], maxCols: number, headerRow = 1) {
  for (let c = 0; c < maxCols; c++) {
    const label = columnLabelSingle(matrix, headerRow, c)
    if (!label || isFrenchSideLabel(label)) continue
    if (label === 'soru' || label === 'kriter' || label === 'critere') return c
    if (label.includes('soru') && !label.includes('cevap')) return c
    if (label.includes('kriter') && !label.includes('cevap')) return c
  }
  return -1
}

/** Cevap sütunu: Cevaplar / Kriter-Cevaplar */
function findTrAnswerColumn(matrix: unknown[][], maxCols: number, afterCol: number, headerRow = 1) {
  for (let c = Math.max(0, afterCol + 1); c < maxCols; c++) {
    const label = columnLabelSingle(matrix, headerRow, c)
    if (!label || isFrenchSideLabel(label)) continue
    if (
      label === 'cevaplar' ||
      label === 'cevap' ||
      label.includes('kriter_cevap') ||
      label.includes('kriter-cevap') ||
      label.includes('kritercevap')
    ) {
      return c
    }
    if (label.includes('cevaplar') || (label.includes('cevap') && !label.includes('soru'))) return c
  }
  return -1
}

function findTrScoreColumn(matrix: unknown[][], maxCols: number, afterCol: number, headerRow = 1) {
  for (let c = Math.max(0, afterCol + 1); c < maxCols; c++) {
    const label = columnLabelSingle(matrix, headerRow, c)
    if (!label || isFrenchSideLabel(label)) continue
    if (
      label === 'puanlama' ||
      label === 'puan' ||
      label === 'aciklama' ||
      label === 'score' ||
      label.includes('puanlama') ||
      label.includes('notation')
    ) {
      return c
    }
  }
  return -1
}

const TR_HEADER_LABELS = new Set([
  'kategori',
  'category',
  'soru',
  'kriter',
  'cevaplar',
  'cevap',
  'kriter_cevaplar',
  'kriter-cevaplar',
  'aciklama',
  'puan',
  'puanlama',
  'score',
  'turkce',
  'turkce_tr',
])
const FR_HEADER_LABELS = new Set([
  'categorie',
  'question',
  'critere',
  'reponses',
  'responses',
  'explication',
  'puanlama',
  'notation',
  'fransizca',
  'francais',
])

function isQuestionHeaderLabel(text: string) {
  const n = normHeader(text)
  return n === 'soru' || n === 'kriter' || n === 'critere' || n === 'question'
}

function isAnswerHeaderLabel(text: string) {
  const n = normHeader(text)
  return (
    n === 'cevaplar' ||
    n === 'cevap' ||
    n.includes('kriter_cevap') ||
    n.includes('kriter-cevap') ||
    n === 'reponses' ||
    n === 'responses'
  )
}

function isHeaderLabel(text: string) {
  const n = normHeader(text)
  return TR_HEADER_LABELS.has(n) || FR_HEADER_LABELS.has(n)
}

function isBilingualTitleRow(raw: unknown[]) {
  if (isDocumentTitleOnlyRow(raw)) return true
  const joined = raw
    .slice(0, 12)
    .map((c) => normHeader(cellStr(c)))
    .filter(Boolean)
    .join(' ')
  if (!joined) return false
  const trSide = joined.includes('turkce') || joined.includes('(tr)')
  const frSide = joined.includes('fransizca') || joined.includes('francais') || joined.includes('(fr)')
  return trSide && frSide && !/\d/.test(joined)
}

function isBilingualHeaderRow(raw: unknown[], cols: BilingualCols) {
  const cat = normHeader(cellStr(raw[cols.trCat]))
  const q = normHeader(cellStr(raw[cols.trQ]))
  const a = normHeader(cellStr(raw[cols.trA]))
  const score = cols.trScore >= 0 ? normHeader(cellStr(raw[cols.trScore])) : ''

  if (cat === 'kategori' && isQuestionHeaderLabel(q) && isAnswerHeaderLabel(a)) return true
  if (cat === 'kategori' && isQuestionHeaderLabel(q)) return true
  if (isQuestionHeaderLabel(q) && isAnswerHeaderLabel(a)) return true
  if (score === 'puanlama' || score === 'puan' || score === 'notation') return true

  const frCat = normHeader(cellStr(raw[cols.frCat]))
  const frQ = normHeader(cellStr(raw[cols.frQ]))
  const frA = normHeader(cellStr(raw[cols.frA]))
  if (frCat === 'categorie' && (frQ === 'question' || frQ === 'critere') && isAnswerHeaderLabel(frA)) {
    return true
  }

  const headerHits = [cat, q, a, score, frCat, frQ, frA].filter((x) => x && isHeaderLabel(x)).length
  if (headerHits >= 2) return true

  return false
}

/** Başlık satırının hemen altından başla; boş puan = veri sayma hatasını önler */
function findBilingualDataStartRow(matrix: unknown[][], cols: BilingualCols) {
  const minStart = cols.headerRow + 1
  for (let r = 0; r < Math.min(15, matrix.length); r++) {
    const raw = matrix[r] || []
    if (isBilingualTitleRow(raw) || isDocumentTitleOnlyRow(raw)) continue
    const q = normHeader(cellStr(raw[cols.trQ]))
    const a = normHeader(cellStr(raw[cols.trA]))
    if (isQuestionHeaderLabel(q) && isAnswerHeaderLabel(a)) return r + 1
  }

  for (let r = minStart; r < Math.min(15, matrix.length); r++) {
    const raw = matrix[r] || []
    if (isBilingualTitleRow(raw) || isBilingualHeaderRow(raw, cols) || isDocumentTitleOnlyRow(raw)) continue
    const aTr = cellStr(raw[cols.trA])
    if (!aTr || isHeaderLabel(aTr)) continue
    const cat = normHeader(cellStr(raw[cols.trCat]))
    const q = normHeader(cellStr(raw[cols.trQ]))
    if (cat === 'kategori' && isQuestionHeaderLabel(q)) continue
    return r
  }

  return minStart
}

function ensureDistinctTrColumns(matrix: unknown[][], cols: BilingualCols, maxCols: number): BilingualCols {
  let { trCat, trQ, trA, trScore } = cols
  const hr = cols.headerRow
  if (trQ === trCat) {
    for (let c = trCat + 1; c < maxCols; c++) {
      const label = columnLabelSingle(matrix, hr, c)
      if (isFrenchSideLabel(label)) continue
      if (
        label === 'soru' ||
        label === 'kriter' ||
        (label.includes('soru') && !label.includes('cevap')) ||
        (label.includes('kriter') && !label.includes('cevap'))
      ) {
        trQ = c
        break
      }
    }
  }
  if (trA === trQ || trA === trCat) {
    const start = Math.max(trCat, trQ) + 1
    for (let c = start; c < maxCols; c++) {
      const label = columnLabelSingle(matrix, hr, c)
      if (isFrenchSideLabel(label)) continue
      if (label.includes('cevaplar') || label === 'cevap' || label.includes('answers')) {
        trA = c
        break
      }
    }
  }
  if (trScore >= 0 && (trScore === trA || trScore === trQ || trScore === trCat)) {
    trScore = trA + 1
  }
  return { ...cols, trCat, trQ, trA, trScore }
}

function detectBilingualColumns(matrix: unknown[][]): BilingualCols | null {
  const maxCols = Math.max(0, ...matrix.slice(0, 12).map((r) => (r || []).length))
  if (maxCols < 4) return null

  const headerRow = findBilingualHeaderRowIndex(matrix)

  let trCat = findTrColumn(matrix, maxCols, ['kategori', 'category'], ['kategori'], ['ana', 'baslik', 'main'], headerRow)
  let trQ = findTrQuestionColumn(matrix, maxCols, headerRow)
  let trA = trQ >= 0 ? findTrAnswerColumn(matrix, maxCols, trQ, headerRow) : -1
  let trScore =
    trA >= 0
      ? findTrScoreColumn(matrix, maxCols, trA, headerRow)
      : findTrColumn(matrix, maxCols, ['puanlama', 'puan'], ['puanlama', 'puan', 'aciklama', 'score'], [], headerRow)
  let frCat = findFrColumn(matrix, maxCols, ['categorie'], headerRow)
  let frQ = findFrColumn(matrix, maxCols, ['question', 'critere'], headerRow)
  let frA = findFrColumn(matrix, maxCols, ['reponses', 'responses'], headerRow)
  let frScore = findFrColumn(matrix, maxCols, ['explication', 'puanlama', 'notation', 'score'], headerRow)

  if (trCat < 0 || trQ < 0 || trA < 0) return null

  let cols: BilingualCols = {
    trCat,
    trQ,
    trA,
    trScore,
    frCat,
    frQ,
    frA,
    frScore,
    headerRow,
    dataStartRow: 0,
  }
  cols = ensureDistinctTrColumns(matrix, cols, maxCols)

  if (cols.frCat >= 0 && cols.trA >= cols.frCat) {
    const fixedA = findTrAnswerColumn(matrix, maxCols, cols.trQ, headerRow)
    if (fixedA >= 0 && fixedA < cols.frCat) cols.trA = fixedA
  }
  if (cols.frCat >= 0 && cols.trScore >= cols.frCat) {
    const fixedS = findTrScoreColumn(matrix, maxCols, cols.trA, headerRow)
    if (fixedS >= 0 && fixedS < cols.frCat) cols.trScore = fixedS
  }

  if (frCat < 0) cols.frCat = cols.trCat + 4
  if (frQ < 0) cols.frQ = cols.trQ + 4
  if (frA < 0) cols.frA = cols.trA + 4
  if (frScore < 0) cols.frScore = cols.trScore >= 0 ? cols.trScore + 4 : cols.frA + 1

  cols.dataStartRow = findBilingualDataStartRow(matrix, cols)
  return cols
}

function parseBilingualBlocks(
  matrix: unknown[][],
  cols: BilingualCols
): {
  rows: QuestionsImportRow[]
  warnings: string[]
  diagnostics: { excelRowsWithAnswer: number; skippedNoContext: number }
} {
  const rows: QuestionsImportRow[] = []
  const parserWarnings: string[] = []
  const carry = { catTr: '', catFr: '', qTr: '', qFr: '' }
  let qInstance = 0
  let aOrder = 0
  let multilineCellsExpanded = 0
  let excelRowsWithAnswer = 0
  let skippedNoContext = 0
  let lastRowWasFullMultilineQuestion = false
  let skipAnswerRowsUntil = -1

  for (let i = cols.dataStartRow; i < matrix.length; i++) {
    const raw = matrix[i] || []
    if (isBilingualTitleRow(raw) || isBilingualHeaderRow(raw, cols) || isDocumentTitleOnlyRow(raw)) continue

    if (skipAnswerRowsUntil >= 0 && i < skipAnswerRowsUntil) {
      const peekQ = sanitizeExplicitLabels(
        '',
        cellStr(raw[cols.trQ]),
        '',
        cellStr(raw[cols.frQ]),
        carry.catTr,
        carry.catFr
      )
      if (!peekQ.qTr && !peekQ.qFr) continue
      skipAnswerRowsUntil = -1
    }

    let explicitCatTr = cellStr(raw[cols.trCat])
    let explicitQTr = cellStr(raw[cols.trQ])
    let explicitCatFr = cellStr(raw[cols.frCat])
    let explicitQFr = cellStr(raw[cols.frQ])

    const catQSplit = splitCategoryQuestionCell(explicitCatTr)
    if (catQSplit) {
      explicitCatTr = catQSplit.cat
      if (!explicitQTr) explicitQTr = catQSplit.question
    }

    let aTr = cellStr(raw[cols.trA])
    let aFr = cellStr(raw[cols.frA])
    let scoreLabel = cellStr(raw[cols.trScore]) || cellStr(raw[cols.frScore])
    if (!scoreLabel.trim() && aTr) {
      const peeled = peelLeadingScoreFromAnswer(aTr)
      if (peeled.scoreLabel) {
        scoreLabel = peeled.scoreLabel
        aTr = peeled.text
      }
    }

    ;({ catTr: explicitCatTr, qTr: explicitQTr, catFr: explicitCatFr, qFr: explicitQFr } = sanitizeExplicitLabels(
      explicitCatTr,
      explicitQTr,
      explicitCatFr,
      explicitQFr,
      carry.catTr,
      carry.catFr
    ))

    const categoryChanged =
      Boolean(explicitCatTr && explicitCatTr !== carry.catTr) ||
      Boolean(!explicitCatTr && explicitCatFr && explicitCatFr !== carry.catFr)

    if (categoryChanged) {
      carry.catTr = explicitCatTr || explicitCatFr
      carry.catFr = explicitCatFr || explicitCatTr || carry.catTr
      if (!(explicitQTr || explicitQFr)) {
        carry.qTr = ''
        carry.qFr = ''
        qInstance = 0
        aOrder = 0
        parserWarnings.push(
          `Satır ${i + 1}: yeni kategori «${carry.catTr}» — Soru hücresi boş; bir sonraki satırda soru metni olmalı.`
        )
      }
    } else {
      if (explicitCatTr) carry.catTr = explicitCatTr
      if (explicitCatFr) carry.catFr = explicitCatFr
    }

    if (lastRowWasFullMultilineQuestion) {
      const hasNewQuestion =
        isLikelyRealQuestionText(explicitQTr, carry.catTr) ||
        isLikelyRealQuestionText(explicitQFr, carry.catFr)
      const multi = hasMultilineRubricCell(aTr, aFr, scoreLabel)
      if (!hasNewQuestion && !multi) {
        lastRowWasFullMultilineQuestion = false
        continue
      }
      lastRowWasFullMultilineQuestion = false
    }

    const qState = { qInstance, aOrder }
    applyBilingualQuestionCarry(carry, explicitQTr, explicitQFr, qState)
    qInstance = qState.qInstance
    aOrder = qState.aOrder

    if (!aTr && !aFr) continue
    if (isHeaderLabel(aTr) || isHeaderLabel(aFr)) continue
    if (
      isHeaderLabel(explicitCatTr) &&
      (isHeaderLabel(explicitQTr) || !explicitQTr) &&
      isHeaderLabel(aTr)
    ) {
      continue
    }

    excelRowsWithAnswer += 1
    if (!carry.catTr || !carry.qTr) {
      skippedNoContext += 1
      if (!carry.qTr && (explicitCatTr || carry.catTr)) {
        parserWarnings.push(
          `Satır ${i + 1}: cevap var ama Soru boş (Excel birleşik hücre?) — bu satır atlandı.`
        )
      }
      continue
    }

    const compactMultilineRow = hasMultilineRubricCell(aTr, aFr, scoreLabel)

    if (
      aOrder >= 4 &&
      !explicitQTr &&
      !explicitCatTr &&
      !compactMultilineRow &&
      !lastRowWasFullMultilineQuestion &&
      looksLikeNewRubricAnswerStart(aTr, aFr, scoreLabel)
    ) {
      qInstance += 1
      aOrder = 0
      lastRowWasFullMultilineQuestion = false
      if (explicitQFr) {
        carry.qFr = explicitQFr
        carry.qTr = explicitQFr
      } else {
        parserWarnings.push(
          `Satır ${i + 1}: yeni soru (4 şık tamamlandı) — Soru hücresi boş; metin bir sonraki satırlarda veya birleşik hücrede olmalı.`
        )
      }
    } else if (!qInstance && carry.qTr) {
      qInstance = 1
    }

    lastRowWasFullMultilineQuestion = false

    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null
    const sameQuestionLast = lastRow && lastRow.q_order === qInstance

    if (sameQuestionLast && isAnswerContinuationLine(aTr, aFr, scoreLabel)) {
      appendAnswerContinuation(lastRow, aTr, aFr)
      continue
    }

    if (aOrder >= 4 && !explicitQTr && !explicitCatTr) {
      parserWarnings.push(
        `Satır ${i + 1}: bu soru zaten 4 cevap aldı — fazla satır atlandı (alt satır «—» ile devam ediyorsa birleştirildi).`
      )
      continue
    }

    const singleRowQuestion = compactMultilineRow
    const { aLinesTr, aLinesFr, scoreLines, lineCount, multiline } = answerLinesForRow(
      aTr,
      aFr,
      scoreLabel,
      singleRowQuestion
    )
    if (multiline) multilineCellsExpanded += 1
    if (!lineCount) continue

    if (compactMultilineRow && lineCount >= 4 && isLikelyRealQuestionText(carry.qTr)) {
      lastRowWasFullMultilineQuestion = true
      skipAnswerRowsUntil = i + 4
    }

    for (let j = 0; j < lineCount; j++) {
      const lineAtr = aLinesTr[j] ?? aLinesTr[0] ?? ''
      const lineAfr = aLinesFr[j] ?? aLinesFr[0] ?? lineAtr
      const lineScore = scoreLines[j] ?? scoreLines[0] ?? ''
      if (!lineAtr && !lineAfr) continue

      if (sameQuestionLast && aOrder >= 4) continue

      aOrder += 1
      const noInfo =
        isNoInfoAnswerText(lineAtr, lineAfr) || isNoInfoAnswerText(lineScore)
      const std_score = noInfo ? 0 : parseScoreFromLabel(lineScore)
      const reel_score = noInfo ? 0 : std_score

      rows.push({
        cat_tr: carry.catTr,
        cat_fr: carry.catFr || carry.catTr,
        q_tr: carry.qTr,
        q_fr: carry.qFr || carry.qTr,
        a_tr: lineAtr || lineAfr,
        a_fr: lineAfr || lineAtr,
        std_score,
        reel_score,
        q_order: qInstance,
        a_order: aOrder,
        level: noInfo ? 'no_opinion' : null,
      })
    }
  }

  if (multilineCellsExpanded) {
    parserWarnings.push(
      `${multilineCellsExpanded} satırda Cevaplar/Açıklama hücresi çok satırlı (Alt+Enter veya |) olarak ayrıştırıldı.`
    )
  }

  if (skippedNoContext > 0) {
    parserWarnings.push(
      `${skippedNoContext} Excel satırında cevap var ama kategori/soru okunamadı (birleşik Soru hücresi: her yeni sorunun ilk satırında Soru metnini tekrar yazın).`
    )
  }

  const byQ = groupRowsByQuestion(rows)
  let singleAnswerQuestions = 0
  let overFourAnswerQuestions = 0
  byQ.forEach((group) => {
    if (group.length === 1) singleAnswerQuestions += 1
    if (group.length > 5) overFourAnswerQuestions += 1
  })
  if (singleAnswerQuestions >= 3 && singleAnswerQuestions >= byQ.size * 0.25) {
    parserWarnings.push(
      `${singleAnswerQuestions} soru yalnızca 1 cevap aldı — Soru sütununda her cevap satırında farklı metin olabilir; soru metni yalnızca 4 cevabın ilkinde olmalı, diğer satırlarda Soru boş bırakılmalı.`
    )
  }
  if (overFourAnswerQuestions > 0) {
    parserWarnings.push(
      `${overFourAnswerQuestions} soru hâlâ 5+ cevap gösteriyor — Excel’de Soru/Kriter birleşik hücre mi kontrol edin; her soru tam 4 satır olmalı.`
    )
  }

  return {
    rows,
    warnings: parserWarnings,
    diagnostics: { excelRowsWithAnswer, skippedNoContext },
  }
}

/** 4 performans (5-3-1-0) ± Fikrim yok → job_evaluation; 9/11/15 şıklı sorulara dokunulmaz */
function applyJobEvaluationLevel(rows: QuestionsImportRow[]) {
  const byQ = new Map<string, QuestionsImportRow[]>()
  rows.forEach((r) => {
    const k = `${r.cat_tr}::${r.q_order}`
    const cur = byQ.get(k) || []
    cur.push(r)
    byQ.set(k, cur)
  })

  const perfSet = new Set(JOB_EVALUATION_PERFORMANCE_SCORES)

  byQ.forEach((group) => {
    const scored = group.filter((r) => r.level !== 'no_opinion' && !isNoInfoAnswerText(r.a_tr, r.a_fr))
    if (scored.length === 4) {
      const scores = new Set(scored.map((r) => r.std_score))
      if ([...perfSet].every((p) => scores.has(p))) {
        group.forEach((r) => {
          if (r.level === 'no_opinion') return
          r.level = 'job_evaluation'
        })
      }
    }
    group.forEach((r) => {
      if (r.level?.trim()) return
      r.level = resolveImportAnswerLevel(r)
    })
  })
}

function parseFlatRow(raw: unknown[], col: Partial<Record<keyof QuestionsImportRow, number>>): QuestionsImportRow | null {
  const get = (k: keyof QuestionsImportRow) => {
    const i = col[k]
    if (i == null || i < 0) return ''
    return cellStr(raw[i])
  }
  const cat_tr = get('cat_tr')
  const q_tr = get('q_tr')
  const a_tr = get('a_tr')
  if (!cat_tr && !q_tr && !a_tr) return null
  if (!cat_tr || !q_tr || !a_tr) return null

  const stdCol = col.std_score
  const stdRaw = stdCol != null ? raw[stdCol] : undefined
  let std_score = cellNum(stdRaw, NaN)
  if (!Number.isFinite(std_score)) {
    std_score = parseScoreFromLabel(cellStr(stdRaw))
  }
  const reelCol = col.reel_score
  const reelRaw = reelCol != null ? raw[reelCol] : undefined
  let reel_score = cellNum(reelRaw, NaN)
  if (!Number.isFinite(reel_score)) reel_score = std_score

  const a_fr = get('a_fr')
  const noInfo = isNoInfoAnswerText(a_tr, a_fr)
  if (noInfo) {
    std_score = 0
    reel_score = 0
  }

  const levelFromSheet = get('level') || null
  const level = noInfo ? 'no_opinion' : levelFromSheet

  return {
    cat_tr,
    cat_fr: get('cat_fr'),
    q_tr,
    q_fr: get('q_fr'),
    a_tr,
    a_fr,
    std_score,
    reel_score,
    q_order: Math.max(0, Math.floor(cellNum(col.q_order != null ? raw[col.q_order] : 0, 0))),
    a_order: Math.max(0, Math.floor(cellNum(col.a_order != null ? raw[col.a_order] : 0, 0))),
    level,
  }
}

function groupRowsByQuestion(rows: QuestionsImportRow[]) {
  const byQ = new Map<string, QuestionsImportRow[]>()
  rows.forEach((r) => {
    const k = `${r.cat_tr}::${r.q_order}`
    const cur = byQ.get(k) || []
    cur.push(r)
    byQ.set(k, cur)
  })
  return byQ
}

function buildQuestionGroupPreviews(rows: QuestionsImportRow[], limit = 12): QuestionGroupPreview[] {
  const out: QuestionGroupPreview[] = []
  const byQ = groupRowsByQuestion(rows)
  for (const [, group] of byQ) {
    if (out.length >= limit) break
    const first = group[0]
    out.push({
      category: first.cat_tr,
      question: first.q_tr,
      answerCount: group.length,
      answers: group.map((r) => ({
        tr: r.a_tr,
        fr: r.a_fr,
        score: r.std_score,
      })),
    })
  }
  return out
}

function importQualityScore(rows: QuestionsImportRow[]) {
  const byQ = groupRowsByQuestion(rows)
  let withFour = 0
  let overFour = 0
  byQ.forEach((g) => {
    if (g.length === 4) withFour += 1
    if (g.length > 4) overFour += 1
  })
  const size = byQ.size || 1
  const fourRatio = withFour / size
  // 4 satırlı rubrik: tam 4 cevaplı sorular yüksek puan; 5–6 cevap cezalı
  return fourRatio * 500 + withFour * 50 + byQ.size * 10 - overFour * 200 + rows.length
}

function shouldPreferWideFormat(verticalRows: QuestionsImportRow[], wideRows: QuestionsImportRow[]) {
  const vByQ = groupRowsByQuestion(verticalRows)
  let four = 0
  let over = 0
  vByQ.forEach((g) => {
    if (g.length === 4) four += 1
    if (g.length > 4) over += 1
  })
  if (vByQ.size > 0 && four / vByQ.size >= 0.6) return false
  if (over > four) return importQualityScore(wideRows) > importQualityScore(verticalRows) + 100
  return importQualityScore(wideRows) > importQualityScore(verticalRows) + 150
}

function collectAnswerColumnPairs(
  header: unknown[],
  fromCol: number,
  toCol: number
): AnswerColPair[] {
  const pairs: AnswerColPair[] = []
  let c = fromCol
  while (c < toCol) {
    const h = normHeader(cellStr(header[c]))
    if (!h) {
      c += 1
      continue
    }
    const isAnswerCol =
      h.includes('cevap') ||
      h.includes('sik') ||
      h.includes('option') ||
      h.includes('reponse') ||
      /^c\d+$/.test(h)
    if (isAnswerCol && !h.includes('soru') && !h.includes('kategori')) {
      const scoreCol = c + 1
      if (scoreCol < toCol) {
        const h2 = normHeader(cellStr(header[scoreCol]))
        const isScoreCol =
          h2.includes('aciklama') ||
          h2.includes('puan') ||
          h2.includes('score') ||
          h2.includes('explication') ||
          h2.includes('point') ||
          /^\d+$/.test(h2) ||
          h2.includes('note')
        if (isScoreCol) {
          pairs.push({ a: c, s: scoreCol })
          c = scoreCol + 1
          continue
        }
      }
    }
    c += 1
  }
  return pairs
}

/** Tek Excel satırı = 1 soru, yan yana Cevap1|Puan1 … Cevap4|Puan4 */
function detectWideBilingualColumns(matrix: unknown[][]): WideBilingualCols | null {
  const base = detectBilingualColumns(matrix)
  if (!base) return null
  const headerRow = base.headerRow
  const header = matrix[headerRow] || []
  const frStart = base.frCat >= 0 ? base.frCat : base.trCat + 4
  const trPairs = collectAnswerColumnPairs(header, base.trQ + 1, frStart)
  const frPairs = collectAnswerColumnPairs(header, base.frQ + 1, header.length)
  // Yalnızca gerçekten 2+ ayrı cevap sütunu varsa (yanlış 5–6 çift üretmesin)
  const realPairs = trPairs.filter((p) => p.a !== base.trQ && p.a !== base.trCat)
  if (realPairs.length < 2) return null
  return {
    ...base,
    headerRow,
    trPairs: realPairs,
    frPairs: frPairs.length ? frPairs : realPairs,
  }
}

function parseBilingualWideRows(matrix: unknown[][], cols: WideBilingualCols): QuestionsImportRow[] {
  const rows: QuestionsImportRow[] = []
  let qOrder = 0
  let lastQKey = ''

  for (let i = cols.dataStartRow; i < matrix.length; i++) {
    const raw = matrix[i] || []
    if (isBilingualTitleRow(raw) || isBilingualHeaderRow(raw, cols) || isDocumentTitleOnlyRow(raw)) continue

    const catTr = cellStr(raw[cols.trCat])
    const qTr = cellStr(raw[cols.trQ])
    const catFr = cellStr(raw[cols.frCat]) || catTr
    const qFr = cellStr(raw[cols.frQ]) || qTr
    if (!catTr || !qTr || isHeaderLabel(catTr) || isHeaderLabel(qTr)) continue

    const qKey = `${catTr}::${qTr}`
    if (qKey !== lastQKey) {
      qOrder += 1
      lastQKey = qKey
    }

    let aOrder = 0
    cols.trPairs.forEach((pair, pi) => {
      const aTr = cellStr(raw[pair.a])
      const scoreLabel = cellStr(raw[pair.s])
      if (!aTr || isHeaderLabel(aTr)) return
      const frPair = cols.frPairs[pi] ?? cols.frPairs[0]
      const aFr = frPair ? cellStr(raw[frPair.a]) : ''
      const scoreFr = frPair ? cellStr(raw[frPair.s]) : ''
      const lineScore = scoreLabel || scoreFr
      aOrder += 1
      const noInfo =
        isNoInfoAnswerText(aTr, aFr) || isNoInfoAnswerText(lineScore)
      const std_score = noInfo ? 0 : parseScoreFromLabel(lineScore)
      rows.push({
        cat_tr: catTr,
        cat_fr: catFr,
        q_tr: qTr,
        q_fr: qFr,
        a_tr: aTr,
        a_fr: aFr || aTr,
        std_score,
        reel_score: noInfo ? 0 : std_score,
        q_order: qOrder,
        a_order: aOrder,
        level: noInfo ? 'no_opinion' : null,
      })
    })
  }
  return rows
}

function buildStats(rows: QuestionsImportRow[]) {
  const catSet = new Set(rows.map((r) => r.cat_tr))
  const byQ = groupRowsByQuestion(rows)
  const answersPerQuestion: Record<string, number> = {}
  let jobEvaluationQuestionCount = 0

  byQ.forEach((group) => {
    const n = group.length
    const key = String(n)
    answersPerQuestion[key] = (answersPerQuestion[key] || 0) + 1
    if (group.some((r) => r.level === 'job_evaluation')) jobEvaluationQuestionCount += 1
  })

  return {
    rowCount: rows.length,
    categoryCount: catSet.size,
    categories: Array.from(catSet).sort((a, b) => a.localeCompare(b, 'tr')),
    questionCount: byQ.size,
    answerCount: rows.length,
    answersPerQuestion,
    jobEvaluationQuestionCount,
    questionGroups: buildQuestionGroupPreviews(rows),
  }
}

function formatAnswerCountSummary(answersPerQuestion: Record<string, number>) {
  return Object.entries(answersPerQuestion)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([n, count]) => `${count} soru × ${n} cevap`)
    .join(', ')
}

export function parseQuestionsExcelBuffer(buffer: ArrayBuffer): QuestionsImportPreview {
  const errors: string[] = []
  const warnings: string[] = []

  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return {
      rows: [],
      format: 'flat',
      stats: {
        rowCount: 0,
        categoryCount: 0,
        categories: [] as string[],
        questionCount: 0,
        answerCount: 0,
        answersPerQuestion: {},
        jobEvaluationQuestionCount: 0,
        questionGroups: [],
      },
      errors: ['Excel dosyasında sayfa bulunamadı.'],
      warnings: [],
    }
  }

  const sheet = wb.Sheets[sheetName]
  let matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  const bilingualColsEarly = detectBilingualColumns(matrix)
  const mergeMetaCols = new Set<number>()
  if (bilingualColsEarly) {
    for (const c of [
      bilingualColsEarly.trCat,
      bilingualColsEarly.trQ,
      bilingualColsEarly.frCat,
      bilingualColsEarly.frQ,
    ]) {
      if (c >= 0) mergeMetaCols.add(c)
    }
  }
  const merged = expandMergedCells(matrix, sheet, mergeMetaCols)
  matrix = merged.matrix
  if (!matrix.length) {
    return {
      rows: [],
      format: 'flat',
      stats: {
        rowCount: 0,
        categoryCount: 0,
        categories: [] as string[],
        questionCount: 0,
        answerCount: 0,
        answersPerQuestion: {},
        jobEvaluationQuestionCount: 0,
        questionGroups: [],
      },
      errors: ['Boş dosya.'],
      warnings: [],
    }
  }

  if (merged.filled > 0) {
    warnings.push(
      `${merged.filled} birleşik Kategori/Kriter hücresi dolduruldu (4 satırlık soru blokları).`
    )
  }

  const bilingualCols = detectBilingualColumns(matrix)
  const wideCols = detectWideBilingualColumns(matrix)
  let rows: QuestionsImportRow[] = []
  let format: QuestionsImportPreview['format'] = 'flat'
  let parsedWarnings: string[] = []

  if (bilingualCols) {
    const vertical = parseBilingualBlocks(matrix, bilingualCols)
    let chosen = vertical.rows
    let chosenFormat: QuestionsImportPreview['format'] = 'bilingual_blocks'
    parsedWarnings = vertical.warnings

    if (wideCols) {
      const wideRows = parseBilingualWideRows(matrix, wideCols)
      if (shouldPreferWideFormat(vertical.rows, wideRows)) {
        chosen = wideRows
        chosenFormat = 'bilingual_wide'
        parsedWarnings = [
          `Geniş satır formatı: 1 Excel satırı = 1 soru, ${wideCols.trPairs.length} cevap sütunu (TR).`,
        ]
      }
    }

    rows = chosen
    format = chosenFormat
    const { excelRowsWithAnswer, skippedNoContext } = vertical.diagnostics
    if (
      chosenFormat === 'bilingual_blocks' &&
      excelRowsWithAnswer > 0 &&
      rows.length < excelRowsWithAnswer - skippedNoContext
    ) {
      warnings.push(
        `Excel’de ~${excelRowsWithAnswer} cevap satırı, içe aktarılan ${rows.length} cevap (${excelRowsWithAnswer - rows.length} eksik). Uyarıları kontrol edin.`
      )
    }
    if (parsedWarnings.length) {
      const extra = parsedWarnings.length > 5 ? ` (+${parsedWarnings.length - 5} benzer uyarı)` : ''
      warnings.push(...parsedWarnings.slice(0, 5))
      if (extra) warnings.push(extra)
    }
    if (!rows.length) {
      errors.push(
        'Çift dilli blok formatı algılandı ancak veri satırı okunamadı. Başlık satırından (Kategori|Soru|Cevaplar) sonra en az bir veri satırı olmalı; şablonu indirip karşılaştırın.'
      )
    } else if (
      rows.length === 1 &&
      (rows[0].cat_tr === 'Kategori' || isHeaderLabel(rows[0].cat_tr)) &&
      (rows[0].q_tr === 'Soru' || rows[0].q_tr === rows[0].cat_tr)
    ) {
      errors.push(
        'Yalnızca Excel başlık satırı okundu — veri satırları algılanmadı. İlk veri satırında Kategori ve Soru dolu, Cevaplar gerçek cevap metni olmalı (başlık metni değil).'
      )
      rows = []
    } else {
      applyJobEvaluationLevel(rows)
      if (format === 'bilingual_wide') {
        warnings.push(
          'Format: tek satırda 1 soru — Cevap1|Puan1, Cevap2|Puan2… yan yana (TR ve FR blokları).'
        )
      } else {
        const hr = bilingualCols?.headerRow ?? 1
        const scoreHdr =
          bilingualCols && bilingualCols.trScore >= 0
            ? columnLabelSingle(matrix, hr, bilingualCols.trScore)
            : ''
        const qHdr =
          bilingualCols && bilingualCols.trQ >= 0 ? columnLabelSingle(matrix, hr, bilingualCols.trQ) : ''
        if (qHdr === 'kriter' && (scoreHdr === 'aciklama' || scoreHdr.includes('aciklama'))) {
          warnings.push(
            'Rehberlik rubriği: Kategori | Kriter | Cevaplar | Açıklama — her soru 4 satır; Kriter ve Kategori birleşik hücre (şablon: Rehberlik_4_satir).'
          )
        } else {
          warnings.push(
            'Format: 1 soru + 4 cevap = ya 4 satır (Soru yalnızca ilk satırda) ya da tek satırda Cevaplar/Açıklama Alt+Enter. Ana başlık import formunda.'
          )
        }
      }
    }
  } else {
    const headerRow = (matrix[0] || []).map((c) => cellStr(c))
    const col = mapHeaders(headerRow)
    if (col.cat_tr == null || col.q_tr == null || col.a_tr == null) {
      errors.push(
        'Tanınmayan Excel düzeni. Beklenen: (1) Yan yana TR+FR: Kategori | Kriter | Kriter-Cevaplar | Puanlama (+ FR: Catégorie | Critère | Réponses | Notation). Üst satırda yalnızca ana başlık (SINIF ÖĞRETMENİ… / ÉVALUATION…) olabilir; hemen altında sütun başlıkları olmalı. (2) Düz liste: cat_tr, q_tr, a_tr…'
      )
    } else {
      for (let i = 1; i < matrix.length; i++) {
        const row = parseFlatRow(matrix[i] || [], col)
        if (row) rows.push(row)
      }
      if (!rows.length) errors.push('Veri satırı bulunamadı.')
    }
  }

  const dupAnswers = new Map<string, number>()
  rows.forEach((r) => {
    const k = `${r.cat_tr}::${r.q_tr}::${r.a_tr}`
    dupAnswers.set(k, (dupAnswers.get(k) || 0) + 1)
  })
  const dupCount = [...dupAnswers.values()].filter((n) => n > 1).length
  if (dupCount) warnings.push(`${dupCount} yinelenen cevap satırı birleştirildi.`)

  const stats = buildStats(rows)
  if (stats.questionCount > 0) {
    const summary = formatAnswerCountSummary(stats.answersPerQuestion)
    if (summary) warnings.push(`Cevap dağılımı: ${summary}.`)
    if (stats.jobEvaluationQuestionCount > 0) {
      warnings.push(
        `${stats.jobEvaluationQuestionCount} soru otomatik iş değerlendirmesi (5-3-1-0 + isteğe bağlı Fikrim yok) olarak işaretlendi.`
      )
    }
    const multiOption = Object.entries(stats.answersPerQuestion).filter(([n]) => Number(n) !== 4)
    if (multiOption.length) {
      warnings.push(
        '4 dışı şık sayısı olan sorular çoklu seçim modunda kalır; Excel’de level sütunu veya admin’den seviye tanımlayabilirsiniz.'
      )
    }
  }

  return {
    rows,
    format,
    stats,
    errors,
    warnings,
  }
}

type XlsxMerge = { s: { r: number; c: number }; e: { r: number; c: number } }

function pushSheetMerge(ws: XLSX.WorkSheet, merges: XlsxMerge[]) {
  const cur = (ws['!merges'] || []) as XlsxMerge[]
  ws['!merges'] = [...cur, ...merges]
}

/** Rehberlik öğretmeni: Kategori | Kriter | Cevaplar | Açıklama — 4 satır = 1 soru, birleşik Kategori+Kriter */
export function buildRehberlikQuestionsImportTemplateWorkbook(): ArrayBuffer {
  const header = [
    'Kategori',
    'Kriter',
    'Cevaplar',
    'Açıklama',
    'Catégorie',
    'Critère',
    'Réponses',
    'Explication',
  ]
  const rows: unknown[][] = [header]
  const merges: XlsxMerge[] = []

  const block = (
    catTr: string,
    qTr: string,
    answersTr: Array<{ text: string; level: string }>,
    catFr: string,
    qFr: string,
    answersFr: Array<{ text: string; level: string }>
  ) => {
    const start = rows.length
    answersTr.forEach((a, i) => {
      rows.push([
        i === 0 ? catTr : '',
        i === 0 ? qTr : '',
        a.text,
        a.level,
        i === 0 ? catFr : '',
        i === 0 ? qFr : '',
        answersFr[i]?.text || '',
        answersFr[i]?.level || '',
      ])
    })
    const end = rows.length - 1
    if (catTr) merges.push({ s: { r: start, c: 0 }, e: { r: end, c: 0 } })
    merges.push({ s: { r: start, c: 1 }, e: { r: end, c: 1 } })
    if (catFr) merges.push({ s: { r: start, c: 4 }, e: { r: end, c: 4 } })
    merges.push({ s: { r: start, c: 5 }, e: { r: end, c: 5 } })
  }

  const lvl = (iyi: string, orta: string, zayif: string, none: string) => [
    { text: iyi, level: 'İyi' },
    { text: orta, level: 'Orta (Beklentiyi Karşılar)' },
    { text: zayif, level: 'Zayıf' },
    { text: none, level: '' },
  ]

  block(
    'Rehberlik Programı ve Planlama',
    'Okul rehberlik programını ihtiyaç analizine dayalı şekilde planlama ve yürütme konusunda tutumu nasıldır?',
    lvl(
      'Yıl başında okul ve öğrenci ihtiyacına yönelik kapsamlı bir analiz yapar',
      'programı bu analize göre planlar ve düzenli olarak uygular',
      'Bir program oluşturur ve kısmen uygular ancak ihtiyaç analizi yetersiz veya plan-uygulama uyumu zayıftır',
      'Sistematik bir program yürütmez, faaliyetler dağınık ve plansız ilerler'
    ),
    'Programme et planification',
    'Comment planifie-t-il/elle le programme de guidance ?',
    lvl('Analyse complète', 'Planifie et applique', 'Application partielle', 'Pas de programme')
  )

  block(
    'Bireysel ve Grup Çalışmaları',
    'Öğrencilerle bireysel görüşmeleri planlama ve etkili biçimde yürütme konusunda tutumu nasıldır?',
    lvl(
      'Görüşmeleri düzenli, planlı ve hedefli şekilde yürütür',
      'her görüşmenin kayıt ve takibini eksiksiz tutar',
      'Görüşmeleri yürütür ancak planlama, kayıt veya takipte aksaklıklar olur',
      'Bireysel görüşmeler düzensiz, yetersiz veya sonuçsuz kalır'
    ),
    'Travaux individuels et de groupe',
    'Entretiens individuels planifiés ?',
    lvl('Entretiens réguliers', 'Suivi complet', 'Entretiens irréguliers', 'Entretiens insuffisants')
  )

  block(
    '',
    'Grup rehberliği çalışmaları (sınav kaygısı, sosyal beceri, akran ilişkileri vb.) düzenleme konusunda tutumu nasıldır?',
    lvl(
      'İhtiyaç analizine dayalı, düzenli ve etkili grup rehberliği oturumları yürütür',
      'Grup çalışmaları düzenler ancak süreklilik veya etkinlik açısından sınırlı kalır',
      'Grup rehberliği çalışmaları nadir veya yetersizdir',
      'Fikrim yok'
    ),
    '',
    'Activités de groupe ?',
    lvl('Groupes efficaces', 'Groupes limités', 'Groupes rares', 'Aucune idée')
  )

  block(
    'Risk Takibi ve Yönlendirme',
    'Risk grubundaki öğrencileri belirleme ve uygun müdahale süreci yürütme konusunda tutumu nasıldır?',
    lvl('Erken tespit ve sistematik takip', 'Müdahale eder', 'Tespit zayıf', 'Fikrim yok'),
    'Suivi des risques',
    'Identification des élèves à risque ?',
    lvl('Détection précoce', 'Suivi partiel', 'Suivi faible', 'Aucune idée')
  )

  block(
    '',
    'Gerekli durumlarda RAM, sağlık kuruluşları ve dış kurumlarla işbirliği konusunda tutumu nasıldır?',
    lvl('Etkili işbirliği', 'İşbirliği sınırlı', 'Zorlanır', 'Fikrim yok'),
    '',
    'Coopération avec institutions externes ?',
    lvl('Coopération efficace', 'Coopération limitée', 'Difficultés', 'Aucune idée')
  )

  block(
    'Kriz Yönetimi',
    'Kriz durumlarını fark etme ve müdahale konusunda tutumu nasıldır?',
    lvl('Hızlı müdahale', 'Müdahale gecikmeli', 'Yetersiz', 'Fikrim yok'),
    'Gestion de crise',
    'Gestion des crises ?',
    lvl('Intervention rapide', 'Intervention tardive', 'Insuffisant', 'Aucune idée')
  )

  block(
    'Profesyonellik ve Etik',
    'Bireysel görüşmelerde gizlilik ve etik ilkelere uyum konusunda tutumu nasıldır?',
    lvl('Titiz gizlilik', 'Genelde uyumlu', 'Sorunlar var', 'Fikrim yok'),
    'Professionnalisme et éthique',
    'Confidentialité ?',
    lvl('Confidentialité stricte', 'Généralement conforme', 'Problèmes', 'Aucune idée')
  )

  block(
    'Yönetim ve Öğretmen İşbirliği (PDR-Spesifik)',
    'Sınıf öğretmenleri ve idare ile öğrenci takibi konusunda işbirliği tutumu nasıldır?',
    lvl('Düzenli işbirliği', 'Sınırlı işbirliği', 'Yetersiz', 'Fikrim yok'),
    'Coopération école',
    'Coopération avec enseignants ?',
    lvl('Coopération régulière', 'Coopération limitée', 'Insuffisant', 'Aucune idée')
  )

  const ws = XLSX.utils.aoa_to_sheet(rows)
  pushSheetMerge(ws, merges)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rehberlik_4_satir')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/** İndirilebilir şablon: Kategori | Kriter | Kriter-Cevaplar | Puanlama (+ FR) */
export function buildQuestionsImportTemplateWorkbook(): ArrayBuffer {
  const rehberlikBuf = buildRehberlikQuestionsImportTemplateWorkbook()
  const rehberlikWb = XLSX.read(rehberlikBuf, { type: 'array' })

  const row0 = ['TÜRKÇE (TR)', '', '', '', 'FRANSIZCA (FR)', '', '', '']
  const row1 = [
    'Kategori',
    'Kriter',
    'Kriter-Cevaplar',
    'Puanlama',
    'Catégorie',
    'Critère',
    'Réponses',
    'Notation',
  ]
  const examples: unknown[][] = [
    [
      'Mesleki Sorumluluk',
      'Okul kurallarına ve etik değerlere ne derece uyum sağlar?',
      'Tüm kurallara eksiksiz uyar; örnek teşkil eder.',
      '5',
      'Responsabilité professionnelle',
      'Dans quelle mesure respecte-t-il/elle les règles et valeurs de l\'école ?',
      'Respecte toutes les règles de manière exemplaire.',
      'Forte',
    ],
    [
      '',
      '',
      'Kurallara genel olarak uyar; nadiren sapma olur.',
      '3 (Beklentiyi karşılar)',
      '',
      '',
      'Respecte généralement les règles.',
      'Répond aux attentes',
    ],
    [
      '',
      '',
      'Kurallara uymakta zorlanır; uyarı gerektirir.',
      '1',
      '',
      '',
      'A des difficultés à respecter les règles.',
      'Faible',
    ],
    [
      '',
      '',
      'Fikrim yok',
      '0',
      '',
      '',
      'Je n\'ai pas d\'avis',
      '0',
    ],
  ]
  const ws = XLSX.utils.aoa_to_sheet([row0, row1, ...examples])

  const wide0 = ['TÜRKÇE (TR)', '', '', '', '', '', '', '', 'FRANSIZCA (FR)', '', '', '', '', '', '', '']
  const wide1 = [
    'Kategori',
    'Soru',
    'Cevap 1',
    'Puan 1',
    'Cevap 2',
    'Puan 2',
    'Cevap 3',
    'Puan 3',
    'Cevap 4',
    'Puan 4',
    'Catégorie',
    'Question',
    'Réponse 1',
    'Note 1',
    'Réponse 2',
    'Note 2',
    'Réponse 3',
    'Note 3',
    'Réponse 4',
    'Note 4',
  ]
  const wideExample = [
    [
      'Mesleki Sorumluluk',
      'Mesleki sorumluluklarını yerine getirirken nasıl bir tutum sergiler?',
      'İşini titizlikle yapar.',
      '5',
      'Genellikle zamanında.',
      '3+',
      'Bazen aksatır.',
      '1-3',
      'Zorlanır.',
      '0',
      'Responsabilité professionnelle',
      'Quelle attitude adopte-t-il/elle ?',
      'Travail soigné.',
      '5',
      'Généralement à temps.',
      '3+',
      'Parfois néglige.',
      '1',
      'Difficultés de délai.',
      '0',
    ],
  ]
  const wsWide = XLSX.utils.aoa_to_sheet([wide0, wide1, ...wideExample])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, rehberlikWb.Sheets[rehberlikWb.SheetNames[0]], 'Rehberlik_4_satir')
  XLSX.utils.book_append_sheet(wb, ws, 'Klasik_4_satir')
  XLSX.utils.book_append_sheet(wb, wsWide, 'tek_satir_4_cevap')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
