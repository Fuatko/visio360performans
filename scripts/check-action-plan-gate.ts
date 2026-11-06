/**
 * Eylem planı kapısı + Sonuçlarım kalan iki alan + Gelişimim planStatus (DB yok).
 * Çalıştırma: npx tsx scripts/check-action-plan-gate.ts
 * Her kontrol PASS/FAIL basar; bir FAIL varsa çıkış kodu 1.
 */
import {
  checkActionPlanPost,
  countScoredPeerEvaluators,
  handleActionPlanGet,
  type ActionPlanCandidatePeriod,
  type ActionPlanGetDeps,
  type ActionPlanPostGateDeps,
} from '../src/lib/action-plan-gate'
import { buildAdminPeriodResult, buildEmployeePeriodResult } from '../src/lib/dashboard-results-payload'
import { developmentEarlyPlanStatus } from '../src/lib/dashboard-development-payload'

let failures = 0
function check(id: number | string, label: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} [${id}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const RELEASED: ActionPlanCandidatePeriod = { id: 'p-rel', name: '2026 Gelişim (yayında)', released: true }
const UNRELEASED: ActionPlanCandidatePeriod = { id: 'p-unrel', name: '2026 Gelişim (yayında değil)', released: false }

/** Sahte bağımlılıklar; ensurePlan çağrıları sayılır (üretim = satır yazma). */
function getDeps(opts: { isAdmin?: boolean; orgVisible?: boolean; peers?: number }) {
  const calls = { ensurePlan: 0, countScoredPeers: 0 }
  const deps: ActionPlanGetDeps = {
    isAdmin: opts.isAdmin ?? false,
    loadOrgVisible: async () => opts.orgVisible ?? true,
    loadCandidatePeriods: async () => [RELEASED, UNRELEASED],
    countScoredPeers: async () => {
      calls.countScoredPeers++
      return opts.peers ?? 3
    },
    ensurePlan: async (pid) => {
      calls.ensurePlan++
      return { ok: true, plan: { id: `plan-${pid}`, status: 'draft' }, tasks: [{ area: 'İletişim', baseline_score: 2.5 }] }
    },
    loadPlanSummaries: async () => new Map(),
  }
  return { deps, calls }
}
const get = (deps: ActionPlanGetDeps, periodId: string, flagEnabled = true) =>
  handleActionPlanGet(deps, { flagEnabled, periodId, errorText: 'hata' })

async function main() {
  // [4] Kurum anahtarı kapalı
  {
    const { deps, calls } = getDeps({ orgVisible: false })
    const r = await get(deps, RELEASED.id)
    check(4, 'kurum anahtarı kapalı → plan yok, blockedReason=org_disabled', r.body.plan === null && r.body.blockedReason === 'org_disabled')
    check(4, 'kurum anahtarı kapalı → üretici çağrılmadı', calls.ensurePlan === 0)
  }

  // [5] Dönem yayınlanmamış
  {
    const { deps, calls } = getDeps({})
    const r = await get(deps, UNRELEASED.id)
    check(5, 'yayınlanmamış → plan yok, blockedReason=not_released', r.body.plan === null && r.body.blockedReason === 'not_released')
    check(5, 'yayınlanmamış → üretici çağrılmadı', calls.ensurePlan === 0)
  }

  // [6] 2 / 3 değerlendirici
  {
    const two = getDeps({ peers: 2 })
    const r2 = await get(two.deps, RELEASED.id)
    check(6, '2 değerlendirici → plan yok (too_few_evaluators)', r2.body.plan === null && r2.body.blockedReason === 'too_few_evaluators')
    const three = getDeps({ peers: 3 })
    const r3 = await get(three.deps, RELEASED.id)
    check(6, '3 değerlendirici + yayın + anahtar açık → plan var', !!r3.body.plan && !('blockedReason' in r3.body) && three.calls.ensurePlan === 1)
  }

  // [7] EN KRİTİK — kapı kapalıyken üretici hiç çağrılmıyor
  {
    const scenarios = [
      { name: 'anahtar kapalı', d: getDeps({ orgVisible: false }), pid: RELEASED.id },
      { name: 'yayında değil', d: getDeps({}), pid: UNRELEASED.id },
      { name: '2 değerlendirici', d: getDeps({ peers: 2 }), pid: RELEASED.id },
      { name: '0 değerlendirici', d: getDeps({ peers: 0 }), pid: RELEASED.id },
      { name: 'bilinmeyen dönem', d: getDeps({}), pid: 'p-yok' },
    ]
    const raw: Record<string, unknown>[] = []
    for (const sc of scenarios) {
      const r = await get(sc.d.deps, sc.pid)
      raw.push({ senaryo: sc.name, ensurePlanCagrisi: sc.d.calls.ensurePlan, status: r.status, body: r.body })
      check(7, `${sc.name} → ensurePlan çağrı sayısı 0`, sc.d.calls.ensurePlan === 0, `çağrı=${sc.d.calls.ensurePlan}`)
    }
    console.log(`\n[7] Ham sonuç:\n${JSON.stringify(raw, null, 1)}\n`)
  }

  // [8] isAdmin → kapı yok
  {
    const { deps, calls } = getDeps({ isAdmin: true, orgVisible: false, peers: 0 })
    const r = await get(deps, UNRELEASED.id)
    check(8, 'admin: anahtar kapalı + yayında değil + 0 değerlendirici → plan üretiliyor (mevcut davranış)', !!r.body.plan && calls.ensurePlan === 1)
    const list = await get(deps, '')
    check(8, 'admin: dönem listesi süzülmüyor', Array.isArray(list.body.periods) && (list.body.periods as unknown[]).length === 2)
  }

  // [9] Bayrak kapalı → 404
  {
    const { deps, calls } = getDeps({})
    const r = await get(deps, RELEASED.id, false)
    check(9, 'GET: bayrak kapalı → 404, üretici çağrılmadı', r.status === 404 && calls.ensurePlan === 0)
    const p = await checkActionPlanPost(postDeps({}), { flagEnabled: false, uid: 'u-1', planId: 'pl-1', texts })
    check(9, 'POST: bayrak kapalı → 404', !p.ok && p.status === 404)
  }

  // [10] POST: kapı + sahiplik
  {
    const own = await checkActionPlanPost(postDeps({ owner: 'u-2' }), { flagEnabled: true, uid: 'u-1', planId: 'pl-1', texts })
    check(10, 'sahiplik: user_id !== uid → 403', !own.ok && own.status === 403 && own.body.error === 'Yetkisiz')
    const off = await checkActionPlanPost(postDeps({ orgVisible: false }), { flagEnabled: true, uid: 'u-1', planId: 'pl-1', texts })
    check(10, 'kapı kapalı (anahtar) → güncelleme reddedildi', !off.ok && off.status === 403 && off.body.blockedReason === 'org_disabled')
    const unrel = await checkActionPlanPost(postDeps({ released: false }), { flagEnabled: true, uid: 'u-1', planId: 'pl-1', texts })
    check(10, 'kapı kapalı (yayında değil) → reddedildi', !unrel.ok && unrel.body.blockedReason === 'not_released')
    const few = await checkActionPlanPost(postDeps({ peers: 2 }), { flagEnabled: true, uid: 'u-1', planId: 'pl-1', texts })
    check(10, 'kapı kapalı (2 değerlendirici) → reddedildi', !few.ok && few.body.blockedReason === 'too_few_evaluators')
    const ok = await checkActionPlanPost(postDeps({}), { flagEnabled: true, uid: 'u-1', planId: 'pl-1', texts })
    check(10, 'kapı açık + sahibi → izin', ok.ok)
    const adminOk = await checkActionPlanPost(postDeps({ isAdmin: true, orgVisible: false }), { flagEnabled: true, uid: 'u-1', planId: 'pl-1', texts })
    check(10, 'admin + sahibi → kapı uygulanmıyor', adminOk.ok)
    const missing = await checkActionPlanPost(postDeps({ missing: true }), { flagEnabled: true, uid: 'u-1', planId: 'pl-1', texts })
    check(10, 'plan yok → 404', !missing.ok && missing.status === 404)
  }

  // [11] Kapı kapalıyken periods[] yayınlanmamış dönemleri içermiyor
  {
    const { deps } = getDeps({ peers: 2 })
    const r = await get(deps, UNRELEASED.id)
    const ids = ((r.body.periods as Array<{ id: string }>) || []).map((p) => p.id)
    check(11, 'kapı kapalı yanıtında yayınlanmamış dönem yok', !ids.includes(UNRELEASED.id), JSON.stringify(ids))
    check(11, 'yayınlanmamış dönemin adı da yok (periodName boş)', r.body.periodName === '')
    const list = await get(deps, '')
    const listIds = ((list.body.periods as Array<{ id: string }>) || []).map((p) => p.id)
    check(11, 'liste (period_id yok): yalnız yayındaki dönem', listIds.length === 1 && listIds[0] === RELEASED.id, JSON.stringify(listIds))
    const off = await get(getDeps({ orgVisible: false }).deps, '')
    check(11, 'anahtar kapalı: liste boş', Array.isArray(off.body.periods) && (off.body.periods as unknown[]).length === 0)
  }

  // Sayım tanımı (Sonuçlarım ile aynı)
  {
    const n = countScoredPeerEvaluators(
      [
        { id: 'a1', evaluator_id: 'e1', target_id: 'u' },
        { id: 'a2', evaluator_id: 'e2', target_id: 'u' },
        { id: 'a3', evaluator_id: 'u', target_id: 'u' },
        { id: 'a4', evaluator_id: 'e4', target_id: 'u' },
        { id: 'a5', evaluator_id: 'e1', target_id: 'u' },
      ],
      [
        { assignment_id: 'a1', reel_score: 4 },
        { assignment_id: 'a2', std_score: 3 },
        { assignment_id: 'a3', reel_score: 5 },
        { assignment_id: 'a4', reel_score: 0 },
        { assignment_id: 'a5', reel_score: 2 },
      ]
    )
    check('sayım', 'öz hariç, puansız hariç, tekil değerlendirici → 2', n === 2, `n=${n}`)
  }

  // [12] Ekip satırında completedAt yok, öz satırında var
  const period = {
    periodId: 'p-1',
    periodName: '2026',
    resultsReleased: true,
    peerAvg: 4.1,
    peerExpectedCount: 7,
    peerCompletedCount: 7,
    peerContributorsInAverage: 7,
    confidenceLabel: 'Yüksek',
    confidenceCoeff: 1,
    confidenceMinHigh: 5,
    evaluations: [
      { evaluatorName: 'Öz Değerlendirme', isSelf: true, avgScore: 4.5, completedAt: '2026-10-01T08:00:00Z' },
      { evaluatorName: 'Ekip değerlendirmesi (anonim, 7 kişi)', isSelf: false, avgScore: 4.1, completedAt: '2026-10-09T17:42:00Z' },
    ],
  }
  {
    const out = buildEmployeePeriodResult(period, true)
    const team = out.evaluations.find((e: any) => !e.isSelf)
    const self = out.evaluations.find((e: any) => e.isSelf)
    check(12, 'ekip satırında completedAt yok', team && !('completedAt' in team))
    check(12, 'öz satırında completedAt var', self?.completedAt === '2026-10-01T08:00:00Z')
    check(12, 'son ekip zamanı JSON\'da hiç geçmiyor', !JSON.stringify(out).includes('2026-10-09'))
    console.log(`\n[12] Ham JSON:\n${JSON.stringify(out)}\n`)
  }

  // [13] Güven alanları
  {
    const emp = buildEmployeePeriodResult(period, true)
    check(13, 'çalışan: confidenceLabel / confidenceCoeff / confidenceMinHigh yok', !/confidence/.test(JSON.stringify(emp)))
    const adm = buildAdminPeriodResult(period)
    check(13, 'yönetim: üçü de var', adm.confidenceLabel === 'Yüksek' && adm.confidenceCoeff === 1 && adm.confidenceMinHigh === 5)
    const adminTeam = adm.evaluations.find((e: any) => !e.isSelf)
    check(13, 'yönetim: ekip satırı completedAt duruyor', adminTeam?.completedAt === '2026-10-09T17:42:00Z')
  }

  // [14] Gelişimim planStatus
  {
    const s0 = developmentEarlyPlanStatus({ isAdmin: false, completedAsTarget: 0, resultsReleased: false })
    const s2 = developmentEarlyPlanStatus({ isAdmin: false, completedAsTarget: 2, resultsReleased: false })
    check(14, 'çalışan, yayında değil, 0 değerlendirme → not_released (awaiting değil)', s0 === 'not_released')
    check(14, 'çalışan, yayında değil, 2 değerlendirme → not_released (ayrım yok)', s2 === 'not_released' && s0 === s2)
    check(14, 'çalışan, yayında, 0 değerlendirme → awaiting_evaluations (mevcut davranış)', developmentEarlyPlanStatus({ isAdmin: false, completedAsTarget: 0, resultsReleased: true }) === 'awaiting_evaluations')
    check(14, 'çalışan, yayında, 2 değerlendirme → devam (null)', developmentEarlyPlanStatus({ isAdmin: false, completedAsTarget: 2, resultsReleased: true }) === null)
    check(14, 'admin, yayında değil, 0 → awaiting (mevcut davranış)', developmentEarlyPlanStatus({ isAdmin: true, completedAsTarget: 0, resultsReleased: false }) === 'awaiting_evaluations')
    check(14, 'admin, yayında değil, 2 → devam (mevcut davranış)', developmentEarlyPlanStatus({ isAdmin: true, completedAsTarget: 2, resultsReleased: false }) === null)
  }

  console.log(failures ? `\n${failures} FAIL` : '\nHepsi PASS')
  process.exit(failures ? 1 : 0)
}

const texts = { notFound: 'Plan bulunamadı', unauthorized: 'Yetkisiz' }
function postDeps(opts: { isAdmin?: boolean; owner?: string; orgVisible?: boolean; released?: boolean; peers?: number; missing?: boolean }): ActionPlanPostGateDeps {
  return {
    isAdmin: opts.isAdmin ?? false,
    loadPlan: async () => (opts.missing ? null : { user_id: opts.owner ?? 'u-1', period_id: 'p-rel' }),
    loadOrgVisible: async () => opts.orgVisible ?? true,
    loadPeriodReleased: async () => opts.released ?? true,
    countScoredPeers: async () => opts.peers ?? 3,
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
