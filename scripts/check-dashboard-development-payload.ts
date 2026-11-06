/**
 * Gelişimim (/api/dashboard/development) ve Sonuçlarım hasPeerAssignments — çalışana sayı gitmiyor mu (DB yok).
 * Çalıştırma: npx tsx scripts/check-dashboard-development-payload.ts
 * Her kontrol PASS/FAIL basar; bir FAIL varsa çıkış kodu 1.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildMetaForPeriod,
  evaluationCompleteFrom,
  serializeDevelopmentPeriods,
} from '../src/lib/dashboard-development-payload'
import { buildAdminPeriodResult, buildEmployeePeriodResult } from '../src/lib/dashboard-results-payload'

let failures = 0
function check(id: number | string, label: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} [${id}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const COUNT_KEYS = ['progress', 'completedAsTarget', 'totalAsTarget', 'rawTargetCount'] as const
const pickName = (p: any) => String(p?.name || '')
const assignments = (total: number, completed: number) =>
  Array.from({ length: total }, (_, i) => ({ status: i < completed ? 'completed' : 'pending' }))

// [4] Gelişimim yanıtı — route'un kurduğu biçimle aynı (not_released dalı)
{
  const meta = buildMetaForPeriod('p-1', { name: '2026 Kişisel Gelişim', results_released: false }, assignments(7, 3), pickName, false)!
  const body = {
    success: true,
    periods: serializeDevelopmentPeriods([meta]),
    periodName: meta.name,
    plan: null,
    planStatus: 'not_released',
    resultsReleased: false,
    evaluationComplete: evaluationCompleteFrom(meta),
    hasTargetAssignments: true,
    hasDevelopmentTarget: true,
  }
  const json = JSON.stringify(body)
  check(4, 'yanıtta progress / completedAsTarget / totalAsTarget / rawTargetCount yok', COUNT_KEYS.every((k) => !json.includes(`"${k}"`)))
  check(4, 'yanıtta evaluationComplete var', typeof body.evaluationComplete === 'boolean')
  check(4, 'dönem satırında da sayı yok, evaluationComplete var', body.periods.every((p) => COUNT_KEYS.every((k) => !(k in p)) && typeof p.evaluationComplete === 'boolean'))
  console.log(`\n[4] Ham JSON:\n${json}\n`)

  // Route kaynağı: yanıta sayı koyan anahtar kalmadı (buildMetaForPeriod iç hesapta kalıyor)
  const src = readFileSync(join(__dirname, '../src/app/api/dashboard/development/route.ts'), 'utf8')
  check(4, "route.ts'de 'progress:' / 'rawTargetCount,' anahtarı yok", !/\bprogress\s*:/.test(src) && !/^\s+rawTargetCount,$/m.test(src))
  check(4, "route.ts'de yanıtlara giden her 'periods' serileştiriliyor", !/^\s+periods,$/m.test(src) && /periods: serializeDevelopmentPeriods\(periods\)/.test(src))
}

// [5] evaluationComplete
check(5, '7/7 → true', evaluationCompleteFrom({ totalAsTarget: 7, completedAsTarget: 7 }) === true)
check(5, '7 beklenen / 3 tamamlanan → false', evaluationCompleteFrom({ totalAsTarget: 7, completedAsTarget: 3 }) === false)
check(5, 'beklenen 0 → false', evaluationCompleteFrom({ totalAsTarget: 0, completedAsTarget: 0 }) === false)

// [6] canViewPlan kapısı
{
  const zero = buildMetaForPeriod('p-1', { name: 'D', results_released: true }, assignments(7, 0), pickName, false)!
  check(6, 'completedAsTarget=0 → plan görünmüyor', zero.canViewPlan === false)
  const okReleased = buildMetaForPeriod('p-1', { name: 'D', results_released: true }, assignments(7, 2), pickName, false)!
  check(6, 'completedAsTarget>0 ve yayınlanmış → görünüyor', okReleased.canViewPlan === true)
  const notReleased = buildMetaForPeriod('p-1', { name: 'D', results_released: false }, assignments(7, 2), pickName, false)!
  check(6, 'completedAsTarget>0 ama yayınlanmamış (çalışan) → görünmüyor', notReleased.canViewPlan === false)
  check(6, 'serileştirilmiş satırda canViewPlan aynı', serializeDevelopmentPeriods([okReleased])[0].canViewPlan === true)
}

// [7] hasTargetAssignments route yanıtlarında duruyor
{
  const src = readFileSync(join(__dirname, '../src/app/api/dashboard/development/route.ts'), 'utf8')
  const n = (src.match(/hasTargetAssignments(: true)?,/g) || []).length
  check(7, "route.ts yanıtlarında hasTargetAssignments duruyor", n >= 9, `${n} yanıtta`)
}

// [8] Sonuçlarım — hasPeerAssignments
function period(over: Record<string, unknown> = {}) {
  return {
    periodId: 'p-1',
    periodName: '2026',
    resultsReleased: true,
    peerAvg: 4.1,
    peerExpectedCount: 7,
    peerCompletedCount: 7,
    peerContributorsInAverage: 7,
    ...over,
  }
}
{
  const visible7 = buildEmployeePeriodResult(period(), true)
  const blocked7 = buildEmployeePeriodResult(period(), false)
  const visible0 = buildEmployeePeriodResult(period({ peerExpectedCount: 0, peerCompletedCount: 0 }), true)
  const blocked0 = buildEmployeePeriodResult(period({ peerExpectedCount: 0, peerCompletedCount: 0 }), false)
  check(8, 'beklenen 7 → hasPeerAssignments=true (görünür)', visible7.hasPeerAssignments === true)
  check(8, 'beklenen 7 → hasPeerAssignments=true (engelli)', blocked7.hasPeerAssignments === true)
  check(8, 'beklenen 0 → hasPeerAssignments=false (görünür dal)', 'hasPeerAssignments' in visible0 && visible0.hasPeerAssignments === false)
  check(8, 'beklenen 0 → hasPeerAssignments=false (engelli dal)', 'hasPeerAssignments' in blocked0 && blocked0.hasPeerAssignments === false)
  check(8, 'çalışan dalında sayılar hâlâ yok', !/peerExpectedCount|peerCompletedCount|peerContributorsInAverage/.test(JSON.stringify([visible7, blocked7])))
  const admin = buildAdminPeriodResult(period())
  check(8, 'yönetim dalı değişmedi (hasPeerAssignments eklenmedi, sayılar duruyor)', !('hasPeerAssignments' in admin) && admin.peerExpectedCount === 7)
}

console.log(failures ? `\n${failures} FAIL` : '\nHepsi PASS')
process.exit(failures ? 1 : 0)
