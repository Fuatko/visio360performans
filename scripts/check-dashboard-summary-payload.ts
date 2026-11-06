/**
 * /api/dashboard/summary by_period izin listesi + Sonuçlarım yönetim dalı bayrağı (DB yok).
 * Çalıştırma: npx tsx scripts/check-dashboard-summary-payload.ts
 * Her kontrol PASS/FAIL basar; bir FAIL varsa çıkış kodu 1.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DashboardPeriodSummary } from '../src/lib/dashboard-evaluations-filter'
import { serializeDashboardPeriodSummaries, serializeDashboardPeriodSummary } from '../src/lib/dashboard-summary-payload'
import { buildAdminPeriodResult } from '../src/lib/dashboard-results-payload'

let failures = 0
function check(id: number | string, label: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} [${id}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const HIDDEN = ['about_me_completed', 'target_total', 'target_completed'] as const

function row(over: Partial<DashboardPeriodSummary> = {}): DashboardPeriodSummary {
  return {
    period_id: 'p-1',
    name: '2026 Dönemi',
    name_en: '2026 Period',
    name_fr: null,
    period_status: 'active',
    pending: 4,
    completed: 2,
    about_me_completed: 3,
    target_total: 7,
    target_completed: 3,
    ...over,
  }
}

// [4] gizli alanlar yok, bayraklar var
{
  const out = serializeDashboardPeriodSummary(row())
  const json = JSON.stringify(out)
  check(4, 'about_me_completed / target_total / target_completed yok', HIDDEN.every((k) => !(k in out) && !json.includes(k)))
  check(4, 'hasAboutMe ve hasTargetAssignments var', typeof out.hasAboutMe === 'boolean' && typeof out.hasTargetAssignments === 'boolean')
  console.log(`\n[4] Ham JSON:\n${json}\n`)

  // Route by_period'u yardımcıdan geçiriyor
  const src = readFileSync(join(__dirname, '../src/app/api/dashboard/summary/route.ts'), 'utf8')
  check(4, "route.ts: by_period: serializeDashboardPeriodSummaries(byPeriod)", /by_period:\s*serializeDashboardPeriodSummaries\(byPeriod\)/.test(src))
}

// [5] pending / completed DURUYOR
{
  const out = serializeDashboardPeriodSummary(row())
  check(5, 'pending duruyor (4)', out.pending === 4)
  check(5, 'completed duruyor (2)', out.completed === 2)
}

// [6] hasAboutMe
check(6, 'about_me_completed=0 → false', serializeDashboardPeriodSummary(row({ about_me_completed: 0 })).hasAboutMe === false)
check(6, 'about_me_completed=3 → true', serializeDashboardPeriodSummary(row({ about_me_completed: 3 })).hasAboutMe === true)

// [7] hasTargetAssignments
check(7, 'target_total=0 → false', serializeDashboardPeriodSummary(row({ target_total: 0 })).hasTargetAssignments === false)
check(7, 'target_total=7 → true', serializeDashboardPeriodSummary(row({ target_total: 7 })).hasTargetAssignments === true)
check(7, 'target_total yok → false', serializeDashboardPeriodSummary(row({ target_total: undefined })).hasTargetAssignments === false)

// [8] izin listesi gerçekten izin listesi
{
  const input = { ...row(), secret_col: 'x' } as DashboardPeriodSummary
  const out = serializeDashboardPeriodSummaries([input])[0]
  check(8, "uydurma alan 'secret_col' çıktıda yok", !('secret_col' in out) && !JSON.stringify(out).includes('secret_col'))
  const keys = Object.keys(out).sort().join(',')
  check(
    8,
    'çıktı anahtarları tam olarak izin listesi',
    keys === 'completed,hasAboutMe,hasTargetAssignments,name,name_en,name_fr,pending,period_id,period_status',
    keys
  )
}

// [9] Sonuçlarım yönetim dalı
{
  const admin = buildAdminPeriodResult({
    periodId: 'p-1',
    peerExpectedCount: 7,
    peerCompletedCount: 3,
    peerContributorsInAverage: 3,
  })
  check(9, 'yönetim dalında hasPeerAssignments=true', admin.hasPeerAssignments === true)
  check(
    9,
    'yönetim dalında sayılar duruyor',
    admin.peerExpectedCount === 7 && admin.peerCompletedCount === 3 && admin.peerContributorsInAverage === 3
  )
  const admin0 = buildAdminPeriodResult({ periodId: 'p-2', peerExpectedCount: 0 })
  check(9, 'yönetim dalında beklenen 0 → hasPeerAssignments=false', admin0.hasPeerAssignments === false)
}

console.log(failures ? `\n${failures} FAIL` : '\nHepsi PASS')
process.exit(failures ? 1 : 0)
