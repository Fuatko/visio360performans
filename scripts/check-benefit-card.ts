/**
 * 90 günlük fayda kartı — saf hesap testleri (DB yok).
 * Çalıştırma: npx tsx scripts/check-benefit-card.ts
 * Her kontrol PASS/FAIL basar; bir FAIL varsa çıkış kodu 1.
 */
import {
  benefitCardSections,
  benefitCardTableRows,
  buildBenefitCard,
  computeAckStats,
  computeBenefitServerFacts,
  computeChange,
  computeCycleTime,
  computeGoalStats,
  computeParticipation,
  computeTaskStats,
} from '../src/lib/benefit-card'
import { buildClosingPackSections, buildClosingPackPdfSections } from '../src/lib/closing-pack'

let failures = 0
function check(id: number | string, label: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} [${id}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const DAY = 86_400_000
const T0 = Date.parse('2026-09-29T08:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

// 46 atama: 23 kişi × 2 değerlendirici; 38'i tamamlanmış.
const assignments = Array.from({ length: 46 }, (_, i) => {
  const completed = i < 38
  return {
    status: completed ? 'completed' : 'pending',
    evaluator_id: `e${i % 2}`,
    target_id: `t${Math.floor(i / 2)}`,
    created_at: iso(T0),
    completed_at: completed ? iso(T0 + (i % 5) * DAY) : null,
  }
})

// [4] Katılım
{
  const p = computeParticipation(assignments)!
  check(4, '46 beklenen / 38 tamamlanan → %83', p.assignments.pct === 83 && p.assignments.num === 38 && p.assignments.den === 46, JSON.stringify(p.assignments))
  const rows = benefitCardSections(buildBenefitCard({ participation: p, cycleTime: null, ack: null, tasks: null, goals: null }, { status: 'first_period' }), 'tr')
  const partRow = rows.find((s) => s.key === 'participation')!.rows[0][1]
  check(4, 'payda çıktıda görünüyor', partRow.includes('38 / 46'), partRow)
  check(4, 'kişi başına ortalama değerlendirici + kişi sayısı', p.people === 23 && p.avgEvaluatorsPerPerson > 0, `ort=${p.avgEvaluatorsPerPerson} kişi=${p.people}`)
}

// [5] Döngü süresi
{
  const rows = [
    { status: 'completed', created_at: iso(T0), completed_at: iso(T0 + 1 * DAY) },
    { status: 'completed', created_at: iso(T0), completed_at: iso(T0 + 2 * DAY) },
    { status: 'completed', created_at: iso(T0), completed_at: iso(T0 + 3 * DAY) },
    { status: 'completed', created_at: iso(T0), completed_at: iso(T0 + 30 * DAY) },
    // tamamlanmamış — hesaba girmemeli (completed_at dolu olsa bile)
    { status: 'pending', created_at: iso(T0), completed_at: iso(T0 + 100 * DAY) },
    { status: 'pending', created_at: iso(T0), completed_at: null },
  ]
  const c = computeCycleTime(rows)!
  check(5, 'ortalama = (1+2+3+30)/4 = 9.0 gün', c.avgDays === 9, `ort=${c.avgDays}`)
  check(5, 'medyan = (2+3)/2 = 2.5 gün', c.medianDays === 2.5, `medyan=${c.medianDays}`)
  check(5, 'tamamlanmamış satırlar sayıya girmiyor (4)', c.count === 4, `n=${c.count}`)
  check(5, 'hiç tamamlanan yoksa null', computeCycleTime(rows.filter((r) => r.status !== 'completed')) === null)
}

// [6] Tebliğ paydası
{
  const counts = new Map<string, number>([
    ['u2', 2],
    ['u3', 3],
    ['u5', 5],
  ])
  const acks = [
    { user_id: 'u2', acknowledged_at: iso(T0), meeting_at: iso(T0) },
    { user_id: 'u3', acknowledged_at: iso(T0), meeting_at: null },
    { user_id: 'u5', acknowledged_at: null, meeting_at: iso(T0) },
  ]
  const a0 = computeAckStats(counts, acks, true)!
  if (a0.status !== 'released') throw new Error('yayınlanmış dönem beklendi')
  const a = a0
  check(6, '2 değerlendiricili kişi paydaya girmiyor, 3 ve 5 giriyor (payda 2)', a.acknowledged.den === 2, JSON.stringify(a.acknowledged))
  check(6, 'tebliğ: payda içinden 1 kişi (u3)', a.acknowledged.num === 1 && a.acknowledged.pct === 50)
  check(6, 'görüşme: aynı payda, 1 kişi (u5)', a.meetings.num === 1 && a.meetings.den === 2)
  check(6, 'kapıdan geçen yoksa null', computeAckStats(new Map([['u2', 2]]), acks, true) === null)
}

// [7] Gelişim görevleri
{
  const tk = computeTaskStats([{ status: 'done' }, { status: 'done' }, { status: 'started' }, { status: 'pending' }])!
  check(7, 'yalnız sayı ve oran: 2 / 4 → %50', tk.done.num === 2 && tk.done.den === 4 && tk.done.pct === 50)
  check(7, 'kapanış zamanı/süre alanı yok', Object.keys(tk).join(',') === 'done' && !/day|time|duration|at/i.test(JSON.stringify(Object.keys(tk.done))), Object.keys(tk).join(','))
  check(7, 'görev yoksa null', computeTaskStats([]) === null)
}

// [8] Hedefler boş → bölüm yok
{
  const card = buildBenefitCard(
    computeBenefitServerFacts({ assignments, evaluatorCountByUser: new Map(), acks: [], tasks: [], goals: [], periodReleased: true }),
    { status: 'first_period' }
  )
  check(8, 'hedef tablosu boş → goals null', card.goals === null)
  check(8, 'hedef bölümü ekran çıktısında yok', !benefitCardSections(card, 'tr').some((s) => s.key === 'goals'))
  check(8, 'hedef bölümü PDF/kapanış tablosunda yok', !benefitCardTableRows(card, 'tr').some((r) => r[0] === 'Hedefler'))
  const g = computeGoalStats([
    { user_id: 'a', status: 'achieved', score: 4, weight: 60 },
    { user_id: 'a', status: 'partial', score: null, weight: 40 },
    { user_id: 'b', status: 'missed', score: 2, weight: 50 },
  ])!
  check(8, 'dolu hedef: puanlı 2 / 3, ağırlık 100 olan 1 / 2', g.scored === 2 && g.total === 3 && g.weight100.num === 1 && g.weight100.den === 2)
}

// [9] Önceki dönem kuralları
{
  const people = [
    { name: 'A', dept: 'X', cur: 4, prev: 3.5, delta: 0.5 },
    { name: 'B', dept: 'Y', cur: 3, prev: 3.2, delta: -0.2 },
  ]
  const depts = [
    { department: 'X', cur: 4, prev: 3.5, delta: 0.5, nCur: 1, nPrev: 1 },
    { department: 'Y', cur: 3, prev: 3.2, delta: -0.2, nCur: 1, nPrev: 1 },
  ]
  const first = computeChange({ hasAnyPreviousPeriod: false, sameKindPrevious: null, people: [], deptMoves: [] })
  check(9, 'önceki dönem yok → first_period', first.status === 'first_period')
  check(9, 'first_period → metin benefitFirstPeriod', benefitCardSections(buildBenefitCard(null, first), 'tr').find((s) => s.key === 'change')!.rows[0][0] === 'İlk dönem — karşılaştırma tabanı oluşturuldu')
  const other = computeChange({ hasAnyPreviousPeriod: true, sameKindPrevious: null, people, deptMoves: depts })
  check(9, 'önceki dönem farklı türde → no_comparable', other.status === 'no_comparable')
  check(9, 'no_comparable → metin benefitNoComparable', benefitCardSections(buildBenefitCard(null, other), 'tr').find((s) => s.key === 'change')!.rows[0][0] === 'Karşılaştırılabilir önceki dönem yok')
  check(9, 'first/no_comparable: fark ya da %0 üretilmiyor', !('orgAvg' in first) && !('orgAvg' in other))
  const same = computeChange({ hasAnyPreviousPeriod: true, sameKindPrevious: { name: '2025' }, people, deptMoves: depts })
  check(
    9,
    'aynı türde → fark hesaplanıyor (3.35 → 3.50, +0.15, 2 kişi)',
    same.status === 'compared' && same.orgAvg.prev === 3.35 && same.orgAvg.cur === 3.5 && same.orgAvg.delta === 0.15 && same.orgAvg.people === 2,
    JSON.stringify(same.status === 'compared' ? same.orgAvg : same)
  )
  check(9, 'yükselen / gerileyen birim (en çok 3)', same.status === 'compared' && same.deptUp[0]?.department === 'X' && same.deptDown[0]?.department === 'Y')
}

// [10] Yorum metni yok
let rawCard: unknown = null
{
  const facts = computeBenefitServerFacts({
    assignments,
    evaluatorCountByUser: new Map([
      ['t0', 3],
      ['t1', 4],
      ['t2', 2],
    ]),
    acks: [{ user_id: 't0', acknowledged_at: iso(T0), meeting_at: iso(T0 + DAY) }],
    tasks: [{ status: 'done' }, { status: 'pending' }, { status: 'started' }],
    goals: [],
    periodReleased: true,
  })
  const card = buildBenefitCard(
    facts,
    computeChange({
      hasAnyPreviousPeriod: true,
      sameKindPrevious: { name: '2025 İş Değerlendirmesi' },
      people: [
        { name: 'A', dept: 'X', cur: 4, prev: 3.5, delta: 0.5 },
        { name: 'B', dept: 'Y', cur: 3, prev: 3.2, delta: -0.2 },
      ],
      deptMoves: [
        { department: 'X', cur: 4, prev: 3.5, delta: 0.5, nCur: 1, nPrev: 1 },
        { department: 'Y', cur: 3, prev: 3.2, delta: -0.2, nCur: 1, nPrev: 1 },
      ],
    })
  )
  rawCard = card
  const json = JSON.stringify(card)
  const isPlain = (v: unknown): boolean =>
    v == null || typeof v === 'number' || typeof v === 'boolean'
      ? true
      : typeof v === 'string'
        ? false
        : Array.isArray(v)
          ? v.every(isPlain)
          : Object.values(v as object).every(isPlain)
  // Kart nesnesinde serbest metin yalnız: change.status (sabit kod), dönem ve birim adları (veri).
  // Sabit durum kodları (ör. ack.status: 'released' | 'not_released') yorum değil; çıkarılıp bakılır.
  const STATUS_CODES = new Set(['released', 'not_released'])
  const { change, ...numeric } = JSON.parse(JSON.stringify(card), (k, v) =>
    k === 'status' && STATUS_CODES.has(v) ? undefined : v
  ) as typeof card
  check(10, 'sayısal bölümler yalnız sayı + sabit durum kodu (serbest metin yok)', isPlain(numeric), json.slice(0, 80))
  check(10, 'change yalnız sabit durum kodu + veri adları', ['first_period', 'no_comparable', 'compared'].includes(change.status))
  const allText = benefitCardTableRows(card, 'tr').flat().join(' | ')
  const banned = /(iyileşti|arttı|azaldı|kötüleşti|başarılı|başarısız|güçlü|zayıf|olumlu|olumsuz|improved|declined|good|bad)/i
  check(10, 'sunum satırlarında değerlendirme cümlesi yok', !banned.test(allText), allText.match(banned)?.[0] || '')
  const ack = facts.ack!
  check(10, 'tebliğ paydası 2 (t0, t1; t2 kapıdan geçemiyor)', ack.status === 'released' && ack.acknowledged.den === 2 && ack.acknowledged.num === 1)

  // Kapanış paketi: onuncu bölüm, aynı hesap
  const pack = buildClosingPackSections({ benefit: card }, 'tr')
  check('paket', 'kapanış paketinde 10 bölüm, sonuncusu benefit', pack.length === 10 && pack[9].key === 'benefit' && pack[9].hasData)
  check('paket', 'paket satırları fayda kartıyla aynı hesap', JSON.stringify(pack[9].section.rows) === JSON.stringify(benefitCardTableRows(card, 'tr')))
  check('paket', 'benefit yokken onuncu bölüm boş → PDF\'e girmiyor', (() => {
    const p0 = buildClosingPackSections({ benefit: null }, 'tr')
    return p0.length === 10 && !p0[9].hasData && buildClosingPackPdfSections(p0, 'tr').length === 0
  })())
  check('paket', 'yalnız "ilk dönem" notu varsa veri sayılmıyor', (() => {
    const p1 = buildClosingPackSections({ benefit: buildBenefitCard(null, { status: 'first_period' }) }, 'tr')
    return !p1[9].hasData
  })())
}

// ---------------------------------------------------------------------------
// Yayın durumu (fayda-karti-yayin-duzeltmesi)
// ---------------------------------------------------------------------------
{
  const counts = new Map<string, number>(Array.from({ length: 46 }, (_, i) => [`p${i}`, 3]))
  const goalsIn = [
    { user_id: 'p0', status: 'achieved', score: 4, weight: 100 },
    { user_id: 'p1', status: 'open', score: null, weight: 50 },
  ]
  const tasksIn = [{ status: 'done' }, { status: 'pending' }]
  const changeIn = computeChange({
    hasAnyPreviousPeriod: true,
    sameKindPrevious: { name: '2025' },
    people: [{ name: 'A', dept: 'X', cur: 4, prev: 3.5, delta: 0.5 }],
    deptMoves: [{ department: 'X', cur: 4, prev: 3.5, delta: 0.5, nCur: 1, nPrev: 1 }],
  })
  const base = { assignments, evaluatorCountByUser: counts, acks: [], tasks: tasksIn, goals: goalsIn }

  // [Y4] Yayınlanmamış: tebliğ/görüşme sayı-oran yok, yalnız durum
  const unrel = buildBenefitCard(computeBenefitServerFacts({ ...base, periodReleased: false }), changeIn)
  check('Y4', 'yayınlanmamış: ack = { status: not_released }', JSON.stringify(unrel.ack) === '{"status":"not_released"}')
  check('Y4', 'yayınlanmamış: ack içinde num/den/pct yok', !/num|den|pct/.test(JSON.stringify(unrel.ack)))
  const unrelSections = benefitCardSections(unrel, 'tr')
  const ackRows = unrelSections.find((s) => s.key === 'ack')!.rows
  const meetRows = unrelSections.find((s) => s.key === 'meeting')!.rows
  const NR = 'Dönem henüz yayınlanmadı; tebliğ süreci başlamadı.'
  check('Y4', 'ekran/PDF: tebliğ satırı durum metni, oran yok', ackRows.length === 1 && ackRows[0][0] === NR && !/\d+ \/ \d+/.test(ackRows.flat().join(' ')))
  check('Y4', 'ekran/PDF: görüşme satırı aynı metin', meetRows.length === 1 && meetRows[0][0] === NR)
  check('Y4', 'kapanış paketi satırlarında "0 / 46" yok', !benefitCardTableRows(unrel, 'tr').some((r) => /\b0 \/ 46\b/.test(r.join(' '))))
  check('Y4', 'en/fr metinleri', benefitCardSections(unrel, 'en').find((s) => s.key === 'ack')!.rows[0][0] === 'Period not released yet; notification has not started.' && benefitCardSections(unrel, 'fr').find((s) => s.key === 'ack')!.rows[0][0] === "Période non publiée ; la notification n'a pas commencé.")
  console.log(`\n[Y4] Ham JSON (yayınlanmamış dönem, ack):\n${JSON.stringify({ ack: unrel.ack })}\n`)

  // [Y5] Yayınlanmış: önceki davranış
  const rel = buildBenefitCard(computeBenefitServerFacts({ ...base, periodReleased: true }), changeIn)
  check(
    'Y5',
    'yayınlanmış: tebliğ 0 / 46 ve görüşme 0 / 46 (payda yerinde)',
    rel.ack?.status === 'released' && rel.ack.acknowledged.den === 46 && rel.ack.acknowledged.num === 0 && rel.ack.meetings.den === 46,
    JSON.stringify(rel.ack)
  )
  check('Y5', 'yayınlanmış: ekranda oran ve payda', benefitCardSections(rel, 'tr').find((s) => s.key === 'ack')!.rows[0][1] === '%0 — 0 / 46')

  // [Y6] Diğer beş gösterge yayından bağımsız
  const pick = (c: typeof rel) => JSON.stringify({ p: c.participation, cy: c.cycleTime, t: c.tasks, g: c.goals, ch: c.change })
  check('Y6', 'katılım, döngü, görev, hedef, dönem farkı yayınlanmamışta aynı', pick(unrel) === pick(rel))
  check('Y6', 'beşi de dolu (normal çalışıyor)', !!unrel.participation && !!unrel.cycleTime && !!unrel.tasks && !!unrel.goals && unrel.change.status === 'compared')

  // [Y7] Kurum görünürlük anahtarı hesaba girmiyor (girdi bile değil; verilse de yok sayılır)
  const withSwitch = (orgVisible: boolean) =>
    JSON.stringify(computeBenefitServerFacts({ ...base, periodReleased: true, orgVisible } as Parameters<typeof computeBenefitServerFacts>[0]))
  check('Y7', 'anahtar açık / kapalı → sonuç aynı (yayınlanmış)', withSwitch(true) === withSwitch(false))
  const withSwitchUnrel = (orgVisible: boolean) =>
    JSON.stringify(computeBenefitServerFacts({ ...base, periodReleased: false, orgVisible } as Parameters<typeof computeBenefitServerFacts>[0]))
  check('Y7', 'anahtar açık / kapalı → sonuç aynı (yayınlanmamış)', withSwitchUnrel(true) === withSwitchUnrel(false))

  // Yalnız durum notu veri sayılmaz: başka veri yoksa kapanış paketi bölümü boş kalır
  check('Y', 'yalnız not_released notu → kapanış paketinde veri yok', !buildClosingPackSections({ benefit: buildBenefitCard({ participation: null, cycleTime: null, ack: { status: 'not_released' }, tasks: null, goals: null }, { status: 'first_period' }) }, 'tr')[9].hasData)
}

// [11] Ham JSON
console.log(`\n[11] Ham JSON:\n${JSON.stringify(rawCard, null, 1)}\n`)

console.log(failures ? `\n${failures} FAIL` : '\nHepsi PASS')
process.exit(failures ? 1 : 0)
