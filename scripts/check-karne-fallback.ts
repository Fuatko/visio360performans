/**
 * Karne yedek yolu (sınıflandırılamayan matris bağlamı) — saf fonksiyon testleri (DB yok).
 * Çalıştırma: npx tsx scripts/check-karne-fallback.ts
 * Her kontrol PASS/FAIL basar; bir FAIL varsa çıkış kodu 1.
 */
import type { EvaluatorAnswerDetailRow } from '../src/lib/server/evaluator-answer-detail'
import {
  computeMatrixStructureScoresForDutyContext,
  computeMatrixStructureScoresForTarget,
  type MatrixStructurePersonScore,
} from '../src/lib/server/matrix-structure-scoring'
import { isCoreGeneralReportMatrixContext, isDutyMatrixContext } from '../src/lib/matrix-evaluation-context'
import { resolveKarneCoreInputs } from '../src/lib/server/matrix-karne-build'

let failures = 0
function check(id: number | string, label: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} [${id}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const TARGET = { targetName: 'Test Kişi', targetDept: 'Test Birim' }

const QUESTIONS = [
  { id: 'q1', order: 1, cat: 'iletisim', catLabel: 'İletişim' },
  { id: 'q2', order: 2, cat: 'iletisim', catLabel: 'İletişim' },
  { id: 'q3', order: 3, cat: 'sorumluluk', catLabel: 'Sorumluluk' },
]

function row(
  ctx: string,
  evaluatorId: string,
  q: (typeof QUESTIONS)[number],
  score: number,
  opts: { isSelf?: boolean; isScorable?: boolean } = {}
): EvaluatorAnswerDetailRow {
  return {
    assignmentId: `a-${evaluatorId}-${ctx}`,
    targetId: 'target-1',
    targetName: TARGET.targetName,
    targetDept: TARGET.targetDept,
    evaluatorId: opts.isSelf ? 'target-1' : evaluatorId,
    evaluatorName: `Değerlendiren ${evaluatorId}`,
    evaluatorTitle: 'Öğretmen',
    evaluatorDept: 'Test Birim',
    evaluatorLevel: opts.isSelf ? 'self' : 'peer',
    evaluatorLevelLabel: opts.isSelf ? 'Öz' : 'Ekip',
    evaluatorWeight: 1,
    matrixContext: ctx,
    matrixLabel: ctx,
    isSelf: !!opts.isSelf,
    categoryKey: q.cat,
    categoryLabel: q.catLabel,
    questionId: q.id,
    questionText: `Soru ${q.id}`,
    questionOrder: q.order,
    score,
    isScorable: opts.isScorable ?? true,
    questionScope: 'period',
    dutyId: null,
    dutyName: null,
    assignmentHints: [],
  }
}

/** Üç değerlendiren × üç soru, sabit puan deseni. */
function teamRows(ctx: string, scores: number[][] = [[4, 5, 3], [5, 4, 4], [3, 4, 5]]) {
  const out: EvaluatorAnswerDetailRow[] = []
  scores.forEach((evScores, i) => {
    QUESTIONS.forEach((q, j) => out.push(row(ctx, `ev${i + 1}`, q, evScores[j])))
  })
  return out
}

/** Bağlam etiketi (scorer.matrixContext) dışındaki her şeyi karşılaştırmak için. */
function stripContext(score: MatrixStructurePersonScore | null) {
  if (!score) return null
  return JSON.parse(
    JSON.stringify(score, (k, v) => (k === 'matrixContext' ? undefined : v))
  )
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** buildPeriodBlock'taki sırayı izler: önce mevcut çekirdek skoru, sonra yedek yol kararı. */
function karneCore(rows: EvaluatorAnswerDetailRow[], hasDutySlices: boolean) {
  const before = computeMatrixStructureScoresForTarget(rows, TARGET)
  const after = resolveKarneCoreInputs(rows, TARGET, before, hasDutySlices)
  return { before, after }
}

// [ön] Bağlam sınıflandırması — testlerin varsayımı
check('ön', "'sj_hmş' ne görev ne çekirdek", !isDutyMatrixContext('sj_hmş') && !isCoreGeneralReportMatrixContext('sj_hmş'))
check('ön', "'temizlik_kadrosu' görev bağlamı", isDutyMatrixContext('temizlik_kadrosu'))

// [4] genel — yedek yol tetiklenmez, sonuç birebir aynı
{
  const rows = teamRows('genel')
  const { before, after } = karneCore(rows, false)
  check(4, 'genel: önceki davranışta skor var', !!before && before.answeredQuestionCount > 0)
  check(4, 'genel: yedek yol tetiklenmedi', !after.usedAnyContextFallback)
  check(4, 'genel: skor nesnesi birebir aynı (aynı referans)', after.coreScore === before)
  check(
    4,
    'genel: skor ve cevaplanan soru sayısı aynı',
    after.coreScore?.overallPeerAvg === before?.overallPeerAvg &&
      after.coreScore?.answeredQuestionCount === before?.answeredQuestionCount,
    `skor=${after.coreScore?.overallPeerAvg} soru=${after.coreScore?.answeredQuestionCount}`
  )
}

// [5] okul_yasam — aynı şekilde değişmez
{
  const rows = teamRows('okul_yasam')
  const { before, after } = karneCore(rows, false)
  check(5, 'okul_yasam: önceki davranışta skor var', !!before && before.answeredQuestionCount > 0)
  check(5, 'okul_yasam: yedek yol tetiklenmedi', !after.usedAnyContextFallback)
  check(5, 'okul_yasam: skor nesnesi birebir aynı', after.coreScore === before)
}

// [6] görev bağlamı — görev dilimi üretilir, çekirdek davranışı değişmez
{
  const rows = teamRows('temizlik_kadrosu')
  const duty = computeMatrixStructureScoresForDutyContext(rows, 'temizlik_kadrosu', TARGET)
  check(6, 'temizlik_kadrosu: görev dilimi üretildi', !!duty && duty.answeredQuestionCount > 0, `skor=${duty?.overallPeerAvg}`)
  const { before, after } = karneCore(rows, true)
  check(6, 'temizlik_kadrosu: önceki çekirdek boş', before === null)
  check(6, 'temizlik_kadrosu: yedek yol tetiklenmedi (görev dilimi var)', !after.usedAnyContextFallback)
  check(6, 'temizlik_kadrosu: çekirdek önceki gibi boş', after.coreScore === null)
}

// [7] sj_hmş — önceden null, şimdi genel ile aynı skor
{
  const rows = teamRows('sj_hmş')
  const { before, after } = karneCore(rows, false)
  const asGenel = computeMatrixStructureScoresForTarget(teamRows('genel'), TARGET)
  check(7, 'sj_hmş: önceki davranışta skor null', before === null)
  check(7, 'sj_hmş: yedek yol tetiklendi', after.usedAnyContextFallback)
  check(7, 'sj_hmş: skor üretildi', !!after.coreScore && after.coreScore.answeredQuestionCount > 0)
  check(
    7,
    'sj_hmş: skor ve cevaplanan soru sayısı genel ile aynı',
    after.coreScore?.overallPeerAvg === asGenel?.overallPeerAvg &&
      after.coreScore?.answeredQuestionCount === asGenel?.answeredQuestionCount,
    `sj_hmş=${after.coreScore?.overallPeerAvg}/${after.coreScore?.answeredQuestionCount} genel=${asGenel?.overallPeerAvg}/${asGenel?.answeredQuestionCount}`
  )
  check(7, 'sj_hmş: bağlam etiketi dışında tüm skor yapısı genel ile aynı', same(stripContext(after.coreScore), stripContext(asGenel)))
}

// [8] karışık — genel + sj_hmş: yedek yol tetiklenmez, yalnız genel satırları sayılır
{
  const genel = teamRows('genel')
  const sj = teamRows('sj_hmş', [[1, 1, 1], [2, 1, 2]])
  const { before, after } = karneCore([...genel, ...sj], false)
  const genelOnly = computeMatrixStructureScoresForTarget(genel, TARGET)
  check(8, 'karışık: yedek yol tetiklenmedi', !after.usedAnyContextFallback)
  check(8, 'karışık: skor nesnesi önceki davranışla aynı', after.coreScore === before)
  check(
    8,
    'karışık: sonuç yalnız genel satırlarından',
    same(after.coreScore, genelOnly),
    `karışık=${after.coreScore?.overallPeerAvg} yalnız-genel=${genelOnly?.overallPeerAvg}`
  )
}

// [9] puanlanabilir satır yok — yedek yoldan sonra da null
{
  const rows = [
    ...QUESTIONS.map((q) => row('sj_hmş', 'self', q, 4, { isSelf: true })),
    ...QUESTIONS.map((q) => row('sj_hmş', 'ev1', q, 0)),
    ...QUESTIONS.map((q) => row('sj_hmş', 'ev2', q, 3, { isScorable: false })),
  ]
  const { before, after } = karneCore(rows, false)
  check(9, 'puansız: önceki davranışta null', before === null)
  check(9, 'puansız: yedek yoldan sonra da null (uydurma skor yok)', after.coreScore === null)
}

// [10] kategori kırılımı — yedek yol tetiklendiğinde boş değil
{
  const rows = teamRows('sj_hmş')
  const { after } = karneCore(rows, false)
  const keys = Object.keys(after.categoryStatsByKey)
  check(10, 'sj_hmş: kategori istatistikleri boş değil', keys.length > 0, JSON.stringify(after.categoryStatsByKey))
  check(10, 'sj_hmş: her kategori 3 değerlendiren', keys.every((k) => after.categoryStatsByKey[k].n === 3))
  const genelStats = resolveKarneCoreInputs(teamRows('genel'), TARGET, computeMatrixStructureScoresForTarget(teamRows('genel'), TARGET), false)
  check(10, 'sj_hmş: kategori istatistikleri genel ile aynı', same(after.categoryStatsByKey, genelStats.categoryStatsByKey))
}

console.log(failures ? `\n${failures} FAIL` : '\nHepsi PASS')
process.exit(failures ? 1 : 0)
