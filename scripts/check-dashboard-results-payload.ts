/**
 * /api/dashboard/results — çalışana değerlendirici sayısı gitmiyor mu (DB yok).
 * Çalıştırma: npx tsx scripts/check-dashboard-results-payload.ts
 * Her kontrol PASS/FAIL basar; bir FAIL varsa çıkış kodu 1.
 */
import {
  buildAdminPeriodResult,
  buildEmployeePeriodResult,
  omitTrimFromPeriodResult,
  peerCompleteFrom,
} from '../src/lib/dashboard-results-payload'

let failures = 0
function check(id: number | string, label: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} [${id}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const COUNT_KEYS = ['peerContributorsInAverage', 'peerExpectedCount', 'peerCompletedCount'] as const
const SCORE_KEYS = ['peerAvg', 'selfScore', 'overallAvg', 'score100', 'categoryCompare'] as const

function period(over: Record<string, unknown> = {}) {
  return {
    periodId: 'p-1',
    periodName: '2026 Dönemi',
    resultsReleased: true,
    peerAvg: 4.12,
    selfScore: 4.5,
    overallAvg: 4.2,
    score100: 84,
    peerAvgTrimmed: 4.1,
    score100Trimmed: 83,
    peerExpectedCount: 7,
    peerCompletedCount: 7,
    peerContributorsInAverage: 7,
    categoryCompare: [{ name: 'İletişim', self: 4.5, peer: 4.12, diff: -0.38, peerTrimmed: 4.1 }],
    evaluations: [
      { evaluatorName: 'Öz Değerlendirme', isSelf: true, avgScore: 4.5 },
      { evaluatorName: 'Ekip değerlendirmesi (anonim, 7 kişi)', isSelf: false, avgScore: 4.12 },
    ],
    ...over,
  }
}

const noCountKeys = (o: object) => COUNT_KEYS.every((k) => !(k in o) && !JSON.stringify(o).includes(k))

// [4] Çalışan dalı — görünür
{
  const out = buildEmployeePeriodResult(period(), true)
  const json = JSON.stringify(out)
  check(4, 'görünür: kapı açık (puan var)', out.resultsReleased === true && out.peerAvg === 4.12)
  check(4, 'görünür: üç sayı alanı JSON\'da yok', noCountKeys(out))
  check(4, 'görünür: peerComplete var', out.peerComplete === true)
  check(4, 'görünür: trim alanları da yok (mevcut davranış)', !json.includes('Trimmed'))
  check(4, "görünür: ekip satırı adındaki '7 kişi' yok", !json.includes('kişi)') && !json.includes('anonim, 7'))
  check(4, 'görünür: öz satırı adı duruyor', out.evaluations?.[0]?.evaluatorName === 'Öz Değerlendirme')
  console.log(`\n[4] Ham JSON:\n${json}\n`)
}

// [5] Çalışan dalı — engelli (kurum anahtarı kapalı)
{
  const out = buildEmployeePeriodResult(period(), false)
  check(5, 'engelli: resultsReleased=false, blockedReason=org_disabled', out.resultsReleased === false && out.blockedReason === 'org_disabled')
  check(5, 'engelli: üç sayı alanı yok', noCountKeys(out))
  check(5, 'engelli: peerComplete var', typeof out.peerComplete === 'boolean' && out.peerComplete === true)
  check(5, 'engelli: puan alanları yok', SCORE_KEYS.every((k) => !(k in out)), JSON.stringify(out))
}

// [6] peerComplete hesabı
check(6, '7/7 → true', peerCompleteFrom({ peerExpectedCount: 7, peerCompletedCount: 7 }) === true)
check(6, '7 beklenen / 3 tamamlanan → false', peerCompleteFrom({ peerExpectedCount: 7, peerCompletedCount: 3 }) === false)
check(6, 'beklenen 0 → false', peerCompleteFrom({ peerExpectedCount: 0, peerCompletedCount: 0 }) === false)
check(
  6,
  'çalışan dalında 7/3 → peerComplete=false',
  buildEmployeePeriodResult(period({ peerCompletedCount: 3 }), true).peerComplete === false
)

// [7] Üç kişi kapısı
{
  const two = buildEmployeePeriodResult(period({ peerContributorsInAverage: 2 }), true)
  check(7, '2 değerlendirici → kapı kapalı', two.resultsReleased === false && two.blockedReason === 'too_few_evaluators')
  check(7, '2 değerlendirici → puan yok', SCORE_KEYS.every((k) => !(k in two)) && !JSON.stringify(two).includes('4.12'))
  const three = buildEmployeePeriodResult(period({ peerContributorsInAverage: 3 }), true)
  check(7, '3 değerlendirici → kapı açık, puan var', three.resultsReleased === true && three.peerAvg === 4.12)
}

// [8] Yönetim dalı — sayılar duruyor
{
  const out = buildAdminPeriodResult(period())
  check(
    8,
    'admin: üç sayı alanı duruyor',
    out.peerContributorsInAverage === 7 && out.peerExpectedCount === 7 && out.peerCompletedCount === 7
  )
  check(8, 'admin: ekip satırı adı aynen duruyor', out.evaluations?.[1]?.evaluatorName === 'Ekip değerlendirmesi (anonim, 7 kişi)')
}

// Silme listesi doğrudan
{
  const out = omitTrimFromPeriodResult(period())
  check('ek', 'omitTrimFromPeriodResult üç sayı alanını siliyor', noCountKeys(out))
}

console.log(failures ? `\n${failures} FAIL` : '\nHepsi PASS')
process.exit(failures ? 1 : 0)
