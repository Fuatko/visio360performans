/**
 * /api/dashboard/summary by_period izin listesi + Sonuçlarım yönetim dalı bayrağı (DB yok).
 * Çalıştırma: npx tsx scripts/check-dashboard-summary-payload.ts
 * Her kontrol PASS/FAIL basar; bir FAIL varsa çıkış kodu 1.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DashboardPeriodSummary } from '../src/lib/dashboard-evaluations-filter'
import {
  buildDashboardSummaryBody,
  serializeDashboardPeriodSummaries,
  serializeDashboardPeriodSummary,
} from '../src/lib/dashboard-summary-payload'
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

  // Uç gövdesi (buildDashboardSummaryBody, route.ts bunu kullanıyor — A4'te kontrol) by_period'u izin listesinden geçiriyor
  const body = buildDashboardSummaryBody({ pending: [], completed: [], aboutMe: [], byPeriod: [{ ...row(), secret_col: 'x' } as DashboardPeriodSummary] })
  check(4, 'uç gövdesindeki by_period izin listesinden geçiyor', !/about_me_completed|target_total|target_completed|secret_col/.test(JSON.stringify(body.by_period)))
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

// ---------------------------------------------------------------------------
// n-pano-karti: uç gövdesi — "Hakkımdaki değerlendirmeler" sayı ve listesi yok
// ---------------------------------------------------------------------------
{
  const pending = [{ id: 'a-1', status: 'pending', period_id: 'p-1', target: { name: 'Hedef Kişi' } }]
  const completed = [{ id: 'a-2', status: 'completed', period_id: 'p-1', completed_at: '2026-10-01T10:00:00Z' }]
  const aboutMe3 = [
    { id: 'm-1', completed_at: '2026-10-02T09:00:00Z', matrix_context: 'genel' },
    { id: 'm-2', completed_at: '2026-10-03T09:00:00Z', matrix_context: 'genel' },
    { id: 'm-3', completed_at: '2026-10-04T09:00:00Z', matrix_context: 'genel' },
  ]
  const body = buildDashboardSummaryBody({ pending, completed, aboutMe: aboutMe3, byPeriod: [row()] })
  const json = JSON.stringify(body)

  check('A4', 'counts.about_me yok', !('about_me' in body.counts))
  check('A4', 'counts.has_about_me var', typeof body.counts.has_about_me === 'boolean')
  check('A5', 'lists.about_me yok', !('about_me' in body.lists))
  check('A5', 'hakkımdaki satırların izi yok (m-1, zaman damgaları)', !json.includes('m-1') && !json.includes('2026-10-02T09'))
  check(
    'A6',
    'counts.pending / counts.completed / lists.pending / lists.completed duruyor',
    body.counts.pending === 1 && body.counts.completed === 1 && body.lists.pending.length === 1 && body.lists.completed.length === 1
  )
  check('A7', 'has_about_me: üç kayıt → true', body.counts.has_about_me === true)
  check('A7', 'has_about_me: liste boş → false', buildDashboardSummaryBody({ pending, completed, aboutMe: [], byPeriod: [] }).counts.has_about_me === false)
  console.log(`\n[A8] Ham JSON:\n${json}\n`)

  const src = readFileSync(join(__dirname, '../src/app/api/dashboard/summary/route.ts'), 'utf8')
  check('A4', 'route.ts gövdeyi buildDashboardSummaryBody ile kuruyor', /buildDashboardSummaryBody\(/.test(src) && !/about_me:\s*aboutMeList/.test(src))
}

console.log(failures ? `\n${failures} FAIL` : '\nHepsi PASS')
process.exit(failures ? 1 : 0)
