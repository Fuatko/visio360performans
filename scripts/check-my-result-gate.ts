/**
 * "Sonucum" — üç değerlendirici kapısı ve yanıtta değerlendirici sayısı olmaması (DB yok).
 * Çalıştırma: npx tsx scripts/check-my-result-gate.ts
 * Her kontrol PASS/FAIL basar; bir FAIL varsa çıkış kodu 1.
 */
import { getMyResult, type MyResultCore, type MyResultDeps, type MyResultPeriod } from '../src/lib/my-result'

let failures = 0
function check(id: number | string, label: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} [${id}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const ORG = 'org-1'
const CUR: MyResultPeriod = { id: 'p-2026', name: '2026 Dönemi', assessmentKind: 'job_evaluation', released: true, createdAt: '2026-09-01T00:00:00Z' }
const PREV: MyResultPeriod = { id: 'p-2025', name: '2025 Dönemi', assessmentKind: 'job_evaluation', released: true, createdAt: '2025-09-01T00:00:00Z' }

function core(overall: number, evaluatorCount: number): MyResultCore {
  return {
    overall,
    categories: [
      { name: 'İletişim', score: overall, self: 4 },
      { name: 'Sorumluluk', score: overall, self: null },
    ],
    self: 4,
    evaluatorCount,
  }
}

function deps(opts: { orgVisible?: boolean; periods?: MyResultPeriod[]; cores: Record<string, MyResultCore> }): MyResultDeps {
  return {
    loadUserOrg: async () => ORG,
    loadOrgVisible: async () => opts.orgVisible ?? true,
    loadOrgPeriods: async () => opts.periods ?? [CUR],
    computeCores: async (_org, periods) => {
      const m = new Map<string, MyResultCore>()
      for (const p of periods) if (opts.cores[p.id]) m.set(p.id, opts.cores[p.id])
      return m
    },
    loadAck: async () => null,
    insertAck: async () => null,
  }
}

async function main() {
  // [4] EN KRİTİK — 2 değerlendirici: özet yok, puan yok
  {
    const res = await getMyResult(deps({ cores: { [CUR.id]: core(4.2, 2) } }), {})
    check(4, 'evaluatorCount=2 → özet gösterilmiyor', res.summary === null && res.status.visible === false, `reason=${res.status.reason}`)
    check(4, 'evaluatorCount=2 → yanıtta puan yok', !JSON.stringify(res).includes('4.2'))
  }

  // [5] 3 değerlendirici: özet ve puan var
  const visible = await getMyResult(deps({ cores: { [CUR.id]: core(4.2, 3) } }), {})
  check(5, 'evaluatorCount=3 → özet gösteriliyor', !!visible.summary && visible.status.visible === true)
  check(5, 'evaluatorCount=3 → puan var', visible.summary?.overall === 4.2, `overall=${visible.summary?.overall}`)

  // [6] Yanıtta sayı yok
  const json = JSON.stringify(visible)
  check(6, "yanıt JSON'unda 'evaluatorCount' anahtarı yok", !json.includes('evaluatorCount'))
  check(6, "özet nesnesinde 'evaluatorCount' alanı yok", !!visible.summary && !('evaluatorCount' in visible.summary))
  console.log(`\n[6] Ham JSON:\n${json}\n`)

  // [7] Önceki dönem koruması
  {
    const res = await getMyResult(
      deps({ periods: [CUR, PREV], cores: { [CUR.id]: core(4.2, 3), [PREV.id]: core(3.5, 2) } }),
      {}
    )
    check(7, 'önceki dönem 2 değerlendiricili → previous (delta) gösterilmiyor', !!res.summary && res.summary.previous === null)
    check(7, 'önceki dönem 2 değerlendiricili → önceki puan yanıtta yok', !JSON.stringify(res).includes('3.5'))
  }
  {
    const res = await getMyResult(
      deps({ periods: [CUR, PREV], cores: { [CUR.id]: core(4.2, 3), [PREV.id]: core(3.5, 3) } }),
      {}
    )
    check(
      7,
      'önceki dönem 3 değerlendiricili → previous gösteriliyor',
      res.summary?.previous?.overall === 3.5 && res.summary?.previous?.delta === 0.7,
      JSON.stringify(res.summary?.previous)
    )
  }

  // [8] Kurum anahtarı kapalı → özet yok
  {
    const res = await getMyResult(deps({ orgVisible: false, cores: { [CUR.id]: core(4.2, 5) } }), {})
    check(
      8,
      'kurum anahtarı kapalı → özet yok, dönem listesi yok',
      res.summary === null && res.status.reason === 'org_disabled' && res.periods.length === 0,
      `reason=${res.status.reason}`
    )
  }

  console.log(failures ? `\n${failures} FAIL` : '\nHepsi PASS')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
