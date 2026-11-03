/**
 * Hedef yönetimi + görünürlük damgası — saf kural testleri (DB yok, oturum yok).
 * Çalıştırma: npx tsx scripts/check-goals-rules.ts
 * Her kontrol PASS/FAIL basar; bir FAIL varsa çıkış kodu 1.
 */
import {
  canScoreGoals,
  checkGoalDelete,
  checkGoalUpdate,
  goalErrorStatus,
  isGoalTextLocked,
  isValidGoalScore,
  serializeGoalForEmployee,
  weightTotal,
} from '../src/lib/goals'
import { applyVisibilityStamp, VISIBILITY_STAMP_KEYS } from '../src/lib/org-visibility-stamp'

let failures = 0
function check(id: number | string, label: string, cond: boolean, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} [${id}] ${label}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

const SESSION_UID = '11111111-1111-1111-1111-111111111111'
const OTHER_UID = '99999999-9999-9999-9999-999999999999'

function goalRow(score: number | null): Record<string, unknown> {
  return {
    id: 'g-1',
    organization_id: 'org-1',
    period_id: 'p-1',
    user_id: SESSION_UID,
    title: 'Satış hedefi',
    description: 'Çeyrek bazında',
    weight: 40,
    target_text: '%10 artış',
    due_date: '2026-12-31',
    status: 'open',
    score,
    score_rationale: score === null ? null : 'Hedefin büyük kısmı gerçekleşti',
    scored_by: score === null ? null : OTHER_UID,
    scored_at: score === null ? null : '2026-11-01T10:00:00.000Z',
    created_by: OTHER_UID,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
  }
}

const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k)

// ---------------------------------------------------------------------------
// Sızıntı — serializeGoalForEmployee
// ---------------------------------------------------------------------------
console.log('--- Sızıntı: serializeGoalForEmployee ---')
const cases: Array<{ id: number; score: number | null; status: string; expectScore: boolean }> = [
  { id: 4, score: null, status: 'active', expectScore: false },
  { id: 5, score: 4.2, status: 'active', expectScore: false },
  { id: 6, score: 4.2, status: 'inactive', expectScore: false },
  { id: 7, score: 4.2, status: 'completed', expectScore: true },
  { id: 8, score: null, status: 'completed', expectScore: false },
]
const outs: Array<{ id: number; out: Record<string, unknown> }> = []
for (const c of cases) {
  const out = serializeGoalForEmployee(goalRow(c.score), c.status)
  outs.push({ id: c.id, out })
  if (c.expectScore) {
    check(
      c.id,
      `score=${c.score} × dönem ${c.status} → score ve score_rationale VAR, değer doğru`,
      has(out, 'score') && has(out, 'score_rationale') && out.score === 4.2 && out.score_rationale === 'Hedefin büyük kısmı gerçekleşti',
      JSON.stringify(out)
    )
  } else {
    check(
      c.id,
      `score=${c.score} × dönem ${c.status} → score ve score_rationale anahtarları YOK`,
      !('score' in out) && !('score_rationale' in out),
      JSON.stringify(out)
    )
  }
}
check(
  9,
  'beş durumun hepsinde scored_by, created_by, organization_id YOK',
  outs.every(({ out }) => !has(out, 'scored_by') && !has(out, 'created_by') && !has(out, 'organization_id') && !has(out, 'scored_at')),
  outs.map(({ id, out }) => `${id}:[${Object.keys(out).join(',')}]`).join(' ')
)
const withSecret = { ...goalRow(4.2), secret_col: 'x' }
const secretOut = serializeGoalForEmployee(withSecret, 'completed')
check(10, 'uydurma kolon (secret_col) çıktıda YOK — beyaz liste', !has(secretOut, 'secret_col') && !JSON.stringify(secretOut).includes('"x"'))
const input = goalRow(4.2)
const snapshot = JSON.stringify(input)
serializeGoalForEmployee(input, 'completed')
serializeGoalForEmployee(input, 'active')
check(11, 'girdi nesnesi çağrıdan sonra değişmemiş', JSON.stringify(input) === snapshot)

// ---------------------------------------------------------------------------
// Kural fonksiyonları
// ---------------------------------------------------------------------------
console.log('--- Kural fonksiyonları ---')
check(
  12,
  "canScoreGoals: 'completed'→true; 'active','inactive',null,'','COMPLETED'→false",
  canScoreGoals('completed') === true &&
    [canScoreGoals('active'), canScoreGoals('inactive'), canScoreGoals(null), canScoreGoals(''), canScoreGoals('COMPLETED')].every((v) => v === false)
)
check(
  13,
  'isGoalTextLocked: null/undefined→false; 0→true; 3.5→true',
  isGoalTextLocked(null) === false && isGoalTextLocked(undefined) === false && isGoalTextLocked(0) === true && isGoalTextLocked(3.5) === true
)
const validOk = [1, 5, 3.5, null].map((v) => isValidGoalScore(v))
const validBad = [0, 5.1, -2, '4', NaN, undefined].map((v) => isValidGoalScore(v))
check(
  14,
  "isValidGoalScore: 1,5,3.5,null→true; 0,5.1,-2,'4',NaN,undefined→false",
  validOk.every((v) => v === true) && validBad.every((v) => v === false),
  `true grubu=${JSON.stringify(validOk)} false grubu=${JSON.stringify(validBad)}`
)
check(
  15,
  'weightTotal: [60,null,40]→100; []→0',
  weightTotal([{ weight: 60 }, { weight: null }, { weight: 40 }]) === 100 && weightTotal([]) === 0
)

// ---------------------------------------------------------------------------
// Damga — applyVisibilityStamp
// ---------------------------------------------------------------------------
console.log('--- Damga: applyVisibilityStamp ---')
const NOW = new Date('2026-11-03T09:30:00.000Z')
const actor = { uid: SESSION_UID, name: 'Fuat Kocabıçak' }
const s16 = applyVisibilityStamp({ employee_results_visible: true }, actor, NOW)
check(
  16,
  '{employee_results_visible:true} → üç damga eklendi, _changed_by = oturum uid',
  VISIBILITY_STAMP_KEYS.every((k) => has(s16, k)) &&
    s16.employee_results_visible_changed_by === SESSION_UID &&
    s16.employee_results_visible_changed_at === NOW.toISOString() &&
    s16.employee_results_visible_changed_by_name === 'Fuat Kocabıçak',
  JSON.stringify(s16)
)
const s17 = applyVisibilityStamp(
  {
    employee_results_visible: true,
    employee_results_visible_changed_by: OTHER_UID,
    employee_results_visible_changed_at: '2000-01-01T00:00:00.000Z',
    employee_results_visible_changed_by_name: 'Sahte',
  },
  actor,
  NOW
)
check(
  17,
  'istemcinin gönderdiği damga atıldı; oturum uid var, gönderilen değer YOK',
  s17.employee_results_visible_changed_by === SESSION_UID &&
    !JSON.stringify(s17).includes(OTHER_UID) &&
    !JSON.stringify(s17).includes('2000-01-01') &&
    !JSON.stringify(s17).includes('Sahte'),
  JSON.stringify(s17)
)
const s18 = applyVisibilityStamp({ employee_results_visible: false }, actor, NOW)
check(
  18,
  '{employee_results_visible:false} → damga yine eklendi',
  s18.employee_results_visible === false && s18.employee_results_visible_changed_by === SESSION_UID && has(s18, 'employee_results_visible_changed_at'),
  JSON.stringify(s18)
)
const s19 = applyVisibilityStamp({ matrix_profile: 'standard_360' }, actor, NOW)
const s19b = applyVisibilityStamp({ matrix_profile: 'standard_360', employee_results_visible_changed_by: OTHER_UID }, actor, NOW)
check(
  19,
  '{matrix_profile} → damga anahtarı eklenmedi (istemci damgası da atıldı)',
  VISIBILITY_STAMP_KEYS.every((k) => !has(s19, k) && !has(s19b, k)) && s19.matrix_profile === 'standard_360',
  `${JSON.stringify(s19)} | ${JSON.stringify(s19b)}`
)
const s20a = applyVisibilityStamp({ employee_results_visible: true }, { uid: SESSION_UID, name: '' }, NOW)
const s20b = applyVisibilityStamp({ employee_results_visible: true }, { uid: SESSION_UID, name: null }, NOW)
const s20c = applyVisibilityStamp({ employee_results_visible: true }, { uid: SESSION_UID, name: '   ' }, NOW)
check(
  20,
  'actor.name boş/null/boşluk → _changed_by_name eklenmedi, diğer iki damga var',
  [s20a, s20b, s20c].every(
    (o) => !has(o, 'employee_results_visible_changed_by_name') && has(o, 'employee_results_visible_changed_by') && has(o, 'employee_results_visible_changed_at')
  ),
  JSON.stringify(s20a)
)
const patch = { employee_results_visible: true, employee_results_visible_changed_by: OTHER_UID, matrix_profile: 'school_full' }
const patchSnap = JSON.stringify(patch)
applyVisibilityStamp(patch, actor, NOW)
check(21, 'girdi patch nesnesi çağrıdan sonra değişmemiş', JSON.stringify(patch) === patchSnap)

// ---------------------------------------------------------------------------
// Ek: rotanın PUT/DELETE kuralları (checkGoalUpdate / checkGoalDelete)
// ---------------------------------------------------------------------------
console.log('--- Ek: rota kuralları ---')
const unscored = goalRow(null)
const scored = goalRow(4.2)
const upd = (existing: Record<string, unknown>, periodStatus: string | null, body: Record<string, unknown>) =>
  checkGoalUpdate({ existing, periodStatus, body })
const e1 = upd(unscored, 'active', { score: 4 })
check('E1', "dönem active iken puan → period_not_completed (409)", e1 === 'period_not_completed' && goalErrorStatus(e1) === 409)
const e2 = upd(scored, 'completed', { title: 'Kolaylaştırılmış hedef' })
check('E2', "puanlı hedefin başlığı → goal_scored_locked (409)", e2 === 'goal_scored_locked' && goalErrorStatus(e2) === 409)
check('E3', 'puanlı hedefte metin alanları aynı değerle gelirse kilit tetiklenmez', upd(scored, 'completed', { title: 'Satış hedefi', weight: 40, due_date: '2026-12-31' }) === null)
const e4 = checkGoalDelete(scored.score)
check('E4', 'puanlı hedef silme → goal_scored_no_delete (409); puansız silinebilir', e4 === 'goal_scored_no_delete' && goalErrorStatus(e4) === 409 && checkGoalDelete(null) === null)
check('E5', "puanlı hedefin durumu 'cancelled' → izinli (200)", upd(scored, 'active', { status: 'cancelled' }) === null)
const e6 = upd(unscored, 'completed', { score: 7 })
check('E6', 'score=7 → invalid_score (400)', e6 === 'invalid_score' && goalErrorStatus(e6) === 400)
check('E7', 'dönem completed iken geçerli puan → izinli; puan düzeltme (yeniden puanlama) izinli', upd(unscored, 'completed', { score: 3.5 }) === null && upd(scored, 'completed', { score: 3, score_rationale: 'düzeltme' }) === null)
check('E8', "geçersiz status → invalid_status (400)", upd(unscored, 'active', { status: 'done' }) === 'invalid_status')
check('E9', 'dönem açıkken metin girişi serbest (puansız hedef)', upd(unscored, 'active', { title: 'Yeni', weight: 60 }) === null)

console.log(failures ? `\n${failures} FAIL` : '\nTÜMÜ PASS')
process.exit(failures ? 1 : 0)
