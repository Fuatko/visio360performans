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

export type QuestionsImportPreview = {
  rows: QuestionsImportRow[]
  format: 'flat' | 'bilingual_blocks'
  stats: {
    rowCount: number
    categoryCount: number
    questionCount: number
    answerCount: number
    /** Soru başına cevap sayısı → kaç soru (örn. { "4": 20, "11": 5 }) */
    answersPerQuestion: Record<string, number>
    jobEvaluationQuestionCount: number
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
  if (frCat < 0) frCat = trCat + 4
  if (frQ < 0) frQ = trQ + 4
  if (frA < 0) frA = trA + 4
  if (frScore < 0) frScore = trScore >= 0 ? trScore + 4 : frA + 1

  let dataStartRow = 1
  for (let r = 1; r < Math.min(6, matrix.length); r++) {
    const aTr = cellStr(matrix[r]?.[trA])
    const scoreTr = cellStr(matrix[r]?.[trScore])
    if (aTr && (scoreTr || parseScoreFromLabel(scoreTr) >= 0)) {
      dataStartRow = r
      break
    }
  }

  return { trCat, trQ, trA, trScore, frCat, frQ, frA, frScore, dataStartRow }
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
      },
      errors: ['Boş dosya.'],
      warnings: [],
    }
  }

  const bilingualCols = detectBilingualColumns(matrix)
  let rows: QuestionsImportRow[] = []
  let format: 'flat' | 'bilingual_blocks' = 'flat'

  if (bilingualCols) {
    format = 'bilingual_blocks'
    const parsed = parseBilingualBlocks(matrix, bilingualCols)
    rows = parsed.rows
    const { excelRowsWithAnswer, skippedNoContext } = parsed.diagnostics
    if (excelRowsWithAnswer > 0 && rows.length < excelRowsWithAnswer - skippedNoContext) {
      warnings.push(
        `Excel’de ~${excelRowsWithAnswer} cevap satırı, içe aktarılan ${rows.length} cevap (${excelRowsWithAnswer - rows.length} eksik). Uyarıları kontrol edin.`
      )
    }
    if (parsed.warnings.length) {
      const extra = parsed.warnings.length > 5 ? ` (+${parsed.warnings.length - 5} benzer uyarı)` : ''
      warnings.push(...parsed.warnings.slice(0, 5))
      if (extra) warnings.push(extra)
    }
    if (!rows.length) {
      errors.push('Çift dilli blok formatı algılandı ancak veri satırı okunamadı.')
    } else {
      applyJobEvaluationLevel(rows)
      warnings.push(
        'Dosya formatı: yan yana TR/FR. (A) Her cevap ayrı satır — şablon gibi. (B) Tek satır: Kategori+Soru dolu, Cevaplar ve Açıklama hücrelerinde Alt+Enter ile alt alta (veya |). Ana başlık = import formu.'
      )
      const sample = [...groupRowsByQuestion(rows).keys()].slice(0, 8)
      if (sample.length) {
        warnings.push(`Örnek eşleşme (kategori::soru): ${sample.join(' | ')}${groupRowsByQuestion(rows).size > 8 ? ' …' : ''}`)
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
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'sorular')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
