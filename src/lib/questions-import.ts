import * as XLSX from 'xlsx'
import {
  isNoInfoAnswerText,
  JOB_EVALUATION_PERFORMANCE_SCORES,
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
  std_score: ['std_score', 'std', 'standart_puan', 'standard_score', 'puan_std', 'aciklama', 'açıklama', 'score'],
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
    s.includes('sans_avis') ||
    s === 'n/a' ||
    s === 'na'
  ) {
    return 0
  }

  const m = s.match(/(\d+(?:\.\d+)?)/)
  const n = m ? Number(m[1]) : NaN

  if (Number.isFinite(n) && n >= 11) return Math.round(n)

  if (s.includes('3+') || (s.startsWith('3') && !(Number.isFinite(n) && n >= 10))) return 3
  if (s.includes('1-3') || s.includes('1_3') || (/^1\b/.test(s) && !(Number.isFinite(n) && n >= 10))) return 1

  if (!m || !Number.isFinite(n)) return 0
  return Math.round(n)
}

function columnLabel(matrix: unknown[][], col: number, maxHeaderRows: number) {
  const parts: string[] = []
  for (let r = 0; r < maxHeaderRows; r++) {
    const v = normHeader(cellStr(matrix[r]?.[col]))
    if (v) parts.push(v)
  }
  return parts.join(' ')
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
  excludeIncludes: string[] = []
) {
  const exactSet = new Set(exact)
  for (let c = 0; c < maxCols; c++) {
    const label = columnLabel(matrix, c, 4)
    if (!label || isFrenchSideLabel(label)) continue
    if (exactSet.has(label)) return c
  }
  for (let c = 0; c < maxCols; c++) {
    const label = columnLabel(matrix, c, 4)
    if (!label || isFrenchSideLabel(label)) continue
    if (excludeIncludes.some((x) => label.includes(x))) continue
    if (includes.some((x) => label.includes(x))) return c
  }
  return -1
}

function findFrColumn(matrix: unknown[][], maxCols: number, includes: string[]) {
  for (let c = 0; c < maxCols; c++) {
    const label = columnLabel(matrix, c, 4)
    if (!label || !isFrenchSideLabel(label)) continue
    if (includes.some((x) => label.includes(x))) return c
  }
  return -1
}

const TR_HEADER_LABELS = new Set([
  'kategori',
  'category',
  'soru',
  'cevaplar',
  'cevap',
  'aciklama',
  'puan',
  'score',
  'turkce',
  'turkce_tr',
])
const FR_HEADER_LABELS = new Set([
  'categorie',
  'question',
  'reponses',
  'responses',
  'explication',
  'fransizca',
  'francais',
])

function isHeaderLabel(text: string) {
  const n = normHeader(text)
  return TR_HEADER_LABELS.has(n) || FR_HEADER_LABELS.has(n)
}

function isBilingualTitleRow(raw: unknown[]) {
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

  if (cat === 'kategori' && q === 'soru' && (a === 'cevaplar' || a === 'cevap')) return true
  if (cat === 'kategori' && q === 'soru') return true
  if (q === 'soru' && (a === 'cevaplar' || a === 'cevap')) return true

  const frCat = normHeader(cellStr(raw[cols.frCat]))
  const frQ = normHeader(cellStr(raw[cols.frQ]))
  const frA = normHeader(cellStr(raw[cols.frA]))
  if (frCat === 'categorie' && frQ === 'question' && (frA === 'reponses' || frA === 'responses')) return true

  const headerHits = [cat, q, a, score, frCat, frQ, frA].filter((x) => x && isHeaderLabel(x)).length
  if (headerHits >= 2) return true

  return false
}

/** Başlık satırının hemen altından başla; boş puan = veri sayma hatasını önler */
function findBilingualDataStartRow(matrix: unknown[][], cols: BilingualCols) {
  for (let r = 0; r < Math.min(15, matrix.length); r++) {
    const raw = matrix[r] || []
    if (isBilingualTitleRow(raw)) continue
    const q = normHeader(cellStr(raw[cols.trQ]))
    const a = normHeader(cellStr(raw[cols.trA]))
    if (q === 'soru' && (a === 'cevaplar' || a === 'cevap')) return r + 1
  }

  for (let r = 0; r < Math.min(15, matrix.length); r++) {
    const raw = matrix[r] || []
    if (isBilingualTitleRow(raw) || isBilingualHeaderRow(raw, cols)) continue
    const aTr = cellStr(raw[cols.trA])
    if (!aTr || isHeaderLabel(aTr)) continue
    const cat = normHeader(cellStr(raw[cols.trCat]))
    const q = normHeader(cellStr(raw[cols.trQ]))
    if (cat === 'kategori' && q === 'soru') continue
    return r
  }

  return 2
}

function ensureDistinctTrColumns(matrix: unknown[][], cols: BilingualCols, maxCols: number): BilingualCols {
  let { trCat, trQ, trA, trScore } = cols
  if (trQ === trCat) {
    for (let c = trCat + 1; c < maxCols; c++) {
      const label = columnLabel(matrix, c, 4)
      if (isFrenchSideLabel(label)) continue
      if (label === 'soru' || (label.includes('soru') && !label.includes('cevap'))) {
        trQ = c
        break
      }
    }
  }
  if (trA === trQ || trA === trCat) {
    const start = Math.max(trCat, trQ) + 1
    for (let c = start; c < maxCols; c++) {
      const label = columnLabel(matrix, c, 4)
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
  const maxCols = Math.max(0, ...matrix.slice(0, 4).map((r) => (r || []).length))
  if (maxCols < 6) return null

  let trCat = findTrColumn(matrix, maxCols, ['kategori', 'category'], ['kategori'], ['ana', 'baslik', 'main'])
  let trQ = findTrColumn(matrix, maxCols, ['soru', 'question_tr'], ['soru'], ['cevap', 'answer'])
  let trA = findTrColumn(matrix, maxCols, ['cevaplar', 'answers', 'answers_tr'], ['cevaplar', 'cevap', 'answers'])
  let trScore = findTrColumn(matrix, maxCols, ['aciklama', 'score', 'puan'], ['aciklama', 'puan', 'score'])
  let frCat = findFrColumn(matrix, maxCols, ['categorie'])
  let frQ = findFrColumn(matrix, maxCols, ['question'])
  let frA = findFrColumn(matrix, maxCols, ['reponses', 'responses'])
  let frScore = findFrColumn(matrix, maxCols, ['explication'])

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
    dataStartRow: 0,
  }
  cols = ensureDistinctTrColumns(matrix, cols, maxCols)

  if (frCat < 0) cols.frCat = cols.trCat + 4
  if (frQ < 0) cols.frQ = cols.trQ + 4
  if (frA < 0) cols.frA = cols.trA + 4
  if (frScore < 0) cols.frScore = cols.trScore >= 0 ? cols.trScore + 4 : cols.frA + 1

  cols.dataStartRow = findBilingualDataStartRow(matrix, cols)
  return cols
}

function applyQuestionCarry(
  carry: { catTr: string; catFr: string; qTr: string; qFr: string },
  explicitCatTr: string,
  explicitCatFr: string,
  explicitQTr: string,
  explicitQFr: string
) {
  if (explicitQTr) {
    carry.qTr = explicitQTr
    carry.qFr = explicitQFr || explicitQTr
  } else if (explicitQFr && !carry.qTr) {
    carry.qFr = explicitQFr
    carry.qTr = explicitQFr
  } else if (explicitQFr) {
    carry.qFr = explicitQFr
  }
  if (explicitCatTr) carry.catTr = explicitCatTr
  if (explicitCatFr) carry.catFr = explicitCatFr
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
  let qOrder = 0
  let aOrder = 0
  let lastQKey = ''
  let multilineCellsExpanded = 0
  let excelRowsWithAnswer = 0
  let skippedNoContext = 0

  for (let i = cols.dataStartRow; i < matrix.length; i++) {
    const raw = matrix[i] || []
    if (isBilingualTitleRow(raw) || isBilingualHeaderRow(raw, cols)) continue

    const explicitCatTr = cellStr(raw[cols.trCat])
    const explicitQTr = cellStr(raw[cols.trQ])
    const explicitCatFr = cellStr(raw[cols.frCat])
    const explicitQFr = cellStr(raw[cols.frQ])
    const aTr = cellStr(raw[cols.trA])
    const aFr = cellStr(raw[cols.frA])
    const scoreLabel = cellStr(raw[cols.trScore]) || cellStr(raw[cols.frScore])

    // Yeni kategori satırında Soru boşsa önceki soruyu taşıma (birleştirilmiş hücre hatası)
    if (explicitCatTr && explicitCatTr !== carry.catTr) {
      carry.catTr = explicitCatTr
      carry.catFr = explicitCatFr || carry.catFr
      if (explicitQTr || explicitQFr) {
        applyQuestionCarry(carry, '', '', explicitQTr, explicitQFr)
      } else {
        carry.qTr = ''
        carry.qFr = ''
        lastQKey = ''
        parserWarnings.push(
          `Satır ${i + 1}: yeni kategori «${explicitCatTr}» — Soru hücresi boş; bir sonraki satırda soru metni olmalı.`
        )
      }
    } else {
      applyQuestionCarry(carry, explicitCatTr, explicitCatFr, explicitQTr, explicitQFr)
    }

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

    const qKey = `${carry.catTr}::${carry.qTr}`
    if (qKey !== lastQKey) {
      qOrder += 1
      aOrder = 0
      lastQKey = qKey
    }

    const aLinesTr = splitMultilineCell(aTr)
    const aLinesFr = splitMultilineCell(aFr)
    const scoreLines = splitMultilineCell(scoreLabel)
    const lineCount = Math.max(aLinesTr.length, aLinesFr.length, scoreLines.length, 1)
    if (lineCount > 1) multilineCellsExpanded += 1

    for (let j = 0; j < lineCount; j++) {
      const lineAtr = aLinesTr[j] ?? aLinesTr[0] ?? ''
      const lineAfr = aLinesFr[j] ?? aLinesFr[0] ?? lineAtr
      const lineScore = scoreLines[j] ?? scoreLines[0] ?? ''
      if (!lineAtr && !lineAfr) continue

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
        q_order: qOrder,
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
      `${overFourAnswerQuestions} soru 5+ cevap aldı — muhtemelen yeni soru satırında Soru boş (Excel birleştirme); her soru bloğunun ilk satırına Soru yazın.`
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
    const k = `${r.cat_tr}::${r.q_tr}`
    const cur = byQ.get(k) || []
    cur.push(r)
    byQ.set(k, cur)
  })

  const perfSet = new Set(JOB_EVALUATION_PERFORMANCE_SCORES)

  byQ.forEach((group) => {
    const scored = group.filter((r) => r.level !== 'no_opinion' && !isNoInfoAnswerText(r.a_tr, r.a_fr))
    if (scored.length !== 4) return
    const scores = new Set(scored.map((r) => r.std_score))
    if (![...perfSet].every((p) => scores.has(p))) return
    group.forEach((r) => {
      if (r.level === 'no_opinion') return
      r.level = 'job_evaluation'
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
    const k = `${r.cat_tr}::${r.q_tr}`
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
  byQ.forEach((g) => {
    if (g.length === 4) withFour += 1
  })
  return withFour * 100 + byQ.size * 10 + rows.length
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
  const headerRow = Math.max(0, base.dataStartRow - 1)
  const header = matrix[headerRow] || []
  const frStart = base.frCat >= 0 ? base.frCat : base.trCat + 4
  const trPairs = collectAnswerColumnPairs(header, base.trQ + 1, frStart)
  const frPairs = collectAnswerColumnPairs(header, base.frQ + 1, header.length)
  if (trPairs.length < 2) return null
  return { ...base, headerRow, trPairs, frPairs: frPairs.length ? frPairs : trPairs }
}

function parseBilingualWideRows(matrix: unknown[][], cols: WideBilingualCols): QuestionsImportRow[] {
  const rows: QuestionsImportRow[] = []
  let qOrder = 0
  let lastQKey = ''

  for (let i = cols.dataStartRow; i < matrix.length; i++) {
    const raw = matrix[i] || []
    if (isBilingualTitleRow(raw) || isBilingualHeaderRow(raw, cols)) continue

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
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  if (!matrix.length) {
    return {
      rows: [],
      format: 'flat',
      stats: {
        rowCount: 0,
        categoryCount: 0,
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
      if (importQualityScore(wideRows) > importQualityScore(vertical.rows)) {
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
        warnings.push(
          'Format: 1 soru + 4 cevap = ya 4 satır (Soru yalnızca ilk satırda) ya da tek satırda Cevaplar/Açıklama Alt+Enter. Ana başlık import formunda.'
        )
      }
    }
  } else {
    const headerRow = (matrix[0] || []).map((c) => cellStr(c))
    const col = mapHeaders(headerRow)
    if (col.cat_tr == null || col.q_tr == null || col.a_tr == null) {
      errors.push(
        'Tanınmayan Excel düzeni. Beklenen: (1) Yan yana TR+FR: Kategori|Soru|Cevaplar|Açıklama | Catégorie|Question|Réponses|Explication veya (2) Düz liste: cat_tr, q_tr, a_tr, std_score...'
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

/** İndirilebilir şablon: kurumunuzdaki yan yana TR/FR düzeni */
export function buildQuestionsImportTemplateWorkbook(): ArrayBuffer {
  const row0 = ['TÜRKÇE (TR)', '', '', '', 'FRANSIZCA (FR)', '', '', '']
  const row1 = ['Kategori', 'Soru', 'Cevaplar', 'Açıklama', 'Catégorie', 'Question', 'Réponses', 'Explication']
  const examples: unknown[][] = [
    [
      'Mesleki Sorumluluk',
      'Mesleki sorumluluklarını yerine getirirken nasıl bir tutum sergiler?',
      'İşini titizlikle ve zamanında yapar.',
      '5',
      'Responsabilité professionnelle',
      'Quelle attitude adopte-t-il/elle ?',
      'Il/Elle effectue son travail avec soin.',
      '5',
    ],
    [
      '',
      '',
      'Genellikle zamanında yerine getirir.',
      '3+',
      '',
      '',
      'Il/Elle s\'acquitte généralement à temps.',
      '3+',
    ],
    [
      '',
      '',
      'Bazen aksatır.',
      '1-3',
      '',
      '',
      'Il/Elle néglige parfois.',
      '1',
    ],
    [
      '',
      '',
      'Zorlanır, zamanında teslim etmez.',
      '0',
      '',
      '',
      'Il/Elle a du mal à respecter les délais.',
      '0',
    ],
    [
      '',
      '',
      'Fikrim yok.',
      '0',
      '',
      '',
      'Sans avis.',
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
  XLSX.utils.book_append_sheet(wb, ws, '4_satir_soru')
  XLSX.utils.book_append_sheet(wb, wsWide, 'tek_satir_4_cevap')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
