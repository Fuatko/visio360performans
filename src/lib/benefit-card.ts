/**
 * 90 günlük fayda kartı — dönemin ölçülebilir sonuçları. TEK hesap: Raporlar ekranındaki
 * `benefit_card` bölümü ve dönem kapanış paketinin onuncu bölümü bunu çağırır.
 *
 * Dürüstlük kuralları:
 *  - Yalnız veritabanında karşılığı olan sayılar; tahmini/türetilmiş "tasarruf" yok.
 *  - Her oran paydasıyla birlikte (num / den).
 *  - Veri yoksa bölüm null → ekranda "veri yok", PDF'e girmez.
 *  - Yorum cümlesi üretilmez; çıktı yalnız sayı, oran ve etiket anahtarları.
 *  - İlk dönemde / farklı türde önceki dönemde fark hesaplanmaz.
 *  - Gelişim görevlerinde kapanış zamanı kolonu yok → süre hesaplanmaz.
 */
import { MIN_EVALUATORS_FOR_EMPLOYEE_RESULT } from '@/lib/employee-result-visibility'
import { GOAL_STATUSES, type GoalStatus } from '@/lib/goals'
import type { PeriodComparisonDeptRow, PeriodComparisonPersonRow } from '@/lib/admin-department-ranking'
import { userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'
import { t } from '@/lib/i18n'

type Lang = 'tr' | 'en' | 'fr'

export type BenefitRatio = { num: number; den: number; pct: number }

const ratio = (num: number, den: number): BenefitRatio => ({ num, den, pct: den > 0 ? Math.round((num / den) * 100) : 0 })
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// 1) Katılım
// ---------------------------------------------------------------------------

export type BenefitParticipation = {
  assignments: BenefitRatio
  /** Değerlendirilen kişi başına (öz hariç) tamamlanmış tekil değerlendirici ortalaması. */
  avgEvaluatorsPerPerson: number
  people: number
}

export function computeParticipation(
  rows: Array<{ status?: string | null; evaluator_id?: string | null; target_id?: string | null }>
): BenefitParticipation | null {
  if (!rows.length) return null
  const completed = rows.filter((r) => r.status === 'completed').length
  const byTarget = new Map<string, Set<string>>()
  for (const r of rows) {
    const tid = String(r.target_id || '')
    if (!tid) continue
    if (!byTarget.has(tid)) byTarget.set(tid, new Set())
    if (r.status === 'completed' && !userIdsEqualForSelfEval(r.evaluator_id, r.target_id)) {
      byTarget.get(tid)!.add(String(r.evaluator_id || ''))
    }
  }
  const people = byTarget.size
  const sum = [...byTarget.values()].reduce((s, set) => s + set.size, 0)
  return {
    assignments: ratio(completed, rows.length),
    avgEvaluatorsPerPerson: people ? r1(sum / people) : 0,
    people,
  }
}

// ---------------------------------------------------------------------------
// 2) Döngü süresi
// ---------------------------------------------------------------------------

export type BenefitCycleTime = { count: number; avgDays: number; medianDays: number }

export function computeCycleTime(
  rows: Array<{ status?: string | null; created_at?: string | Date | null; completed_at?: string | Date | null }>
): BenefitCycleTime | null {
  const days: number[] = []
  for (const r of rows) {
    if (r.status !== 'completed' || !r.created_at || !r.completed_at) continue
    const d = (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()) / 86_400_000
    if (Number.isFinite(d) && d >= 0) days.push(d)
  }
  if (!days.length) return null
  days.sort((a, b) => a - b)
  const mid = Math.floor(days.length / 2)
  const median = days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2
  return {
    count: days.length,
    avgDays: r1(days.reduce((s, d) => s + d, 0) / days.length),
    medianDays: r1(median),
  }
}

// ---------------------------------------------------------------------------
// 3–4) Sonuç tebliği ve yönetici görüşmesi
// ---------------------------------------------------------------------------

export type BenefitAckStats = { acknowledged: BenefitRatio; meetings: BenefitRatio }

/**
 * Payda: tebliğ edilebilir kişi = hesaplanmış sonucu olan ve ≥3 değerlendiricisi olan
 * (Sonuçlarım kapısıyla aynı sayım; /api/admin/result-acknowledgements ile aynı kaynak).
 * Kapıdan geçemeyen kişi paydaya girmez.
 */
export function computeAckStats(
  evaluatorCountByUser: Map<string, number>,
  acks: Array<{ user_id: string; acknowledged_at?: string | Date | null; meeting_at?: string | Date | null }>
): BenefitAckStats | null {
  const eligible = new Set(
    [...evaluatorCountByUser.entries()].filter(([, n]) => n >= MIN_EVALUATORS_FOR_EMPLOYEE_RESULT).map(([id]) => id)
  )
  if (!eligible.size) return null
  const inScope = acks.filter((a) => eligible.has(String(a.user_id)))
  return {
    acknowledged: ratio(inScope.filter((a) => a.acknowledged_at).length, eligible.size),
    meetings: ratio(inScope.filter((a) => a.meeting_at).length, eligible.size),
  }
}

// ---------------------------------------------------------------------------
// 5) Gelişim görevleri — yalnız sayı ve oran (kapanış zamanı kolonu yok)
// ---------------------------------------------------------------------------

export type BenefitTasks = { done: BenefitRatio }

export function computeTaskStats(tasks: Array<{ status?: string | null }>): BenefitTasks | null {
  if (!tasks.length) return null
  return { done: ratio(tasks.filter((x) => x.status === 'done').length, tasks.length) }
}

// ---------------------------------------------------------------------------
// 6) Hedefler — boşsa null (bölüm hiç gösterilmez)
// ---------------------------------------------------------------------------

export type BenefitGoals = {
  total: number
  scored: number
  byStatus: Record<GoalStatus, number>
  /** Ağırlık toplamı 100 olan kişi / hedefi olan kişi. */
  weight100: BenefitRatio
}

export function computeGoalStats(
  goals: Array<{ user_id: string; status?: string | null; score?: number | string | null; weight?: number | string | null }>
): BenefitGoals | null {
  if (!goals.length) return null
  const byStatus = Object.fromEntries(GOAL_STATUSES.map((s) => [s, 0])) as Record<GoalStatus, number>
  const weightByUser = new Map<string, number>()
  let scored = 0
  for (const g of goals) {
    const st = (GOAL_STATUSES as readonly string[]).includes(String(g.status)) ? (g.status as GoalStatus) : 'open'
    byStatus[st] += 1
    if (g.score != null && g.score !== '') scored += 1
    const uid = String(g.user_id)
    weightByUser.set(uid, (weightByUser.get(uid) || 0) + (Number(g.weight) || 0))
  }
  const users = [...weightByUser.values()]
  return {
    total: goals.length,
    scored,
    byStatus,
    weight100: ratio(users.filter((w) => Math.abs(w - 100) < 1e-9).length, users.length),
  }
}

// ---------------------------------------------------------------------------
// 7) Önceki döneme göre — mevcut dönem karşılaştırma hesabının çıktısı (yeniden hesap yok)
// ---------------------------------------------------------------------------

export const BENEFIT_DEPT_TOP_N = 3

export type BenefitChange =
  | { status: 'first_period' }
  | { status: 'no_comparable' }
  | {
      status: 'compared'
      previousPeriodName: string
      /** Her iki dönemde puanı olan kişilerin ortalaması. */
      orgAvg: { cur: number; prev: number; delta: number; people: number }
      deptUp: Array<{ department: string; cur: number; prev: number; delta: number; people: number }>
      deptDown: Array<{ department: string; cur: number; prev: number; delta: number; people: number }>
    }

export function computeChange(input: {
  /** Seçili dönemden önce herhangi bir dönem var mı (türüne bakmadan). */
  hasAnyPreviousPeriod: boolean
  /** Aynı türde önceki dönem (yoksa null) — farklı türler karşılaştırılmaz. */
  sameKindPrevious: { name: string } | null
  people: PeriodComparisonPersonRow[]
  deptMoves: PeriodComparisonDeptRow[]
}): BenefitChange {
  if (!input.hasAnyPreviousPeriod) return { status: 'first_period' }
  if (!input.sameKindPrevious || !input.people.length) return { status: 'no_comparable' }
  const n = input.people.length
  const cur = r2(input.people.reduce((s, p) => s + p.cur, 0) / n)
  const prev = r2(input.people.reduce((s, p) => s + p.prev, 0) / n)
  const dept = (d: PeriodComparisonDeptRow) => ({ department: d.department, cur: d.cur, prev: d.prev, delta: d.delta, people: d.nCur })
  return {
    status: 'compared',
    previousPeriodName: input.sameKindPrevious.name,
    orgAvg: { cur, prev, delta: r2(cur - prev), people: n },
    deptUp: [...input.deptMoves].filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, BENEFIT_DEPT_TOP_N).map(dept),
    deptDown: [...input.deptMoves].filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, BENEFIT_DEPT_TOP_N).map(dept),
  }
}

// ---------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------

/** Sunucuda (/api/admin/benefit-card) hesaplanan kısım. */
export type BenefitServerFacts = {
  participation: BenefitParticipation | null
  cycleTime: BenefitCycleTime | null
  ack: BenefitAckStats | null
  tasks: BenefitTasks | null
  goals: BenefitGoals | null
}

export type BenefitCard = BenefitServerFacts & { change: BenefitChange }

export function computeBenefitServerFacts(input: {
  assignments: Array<{
    status?: string | null
    evaluator_id?: string | null
    target_id?: string | null
    created_at?: string | Date | null
    completed_at?: string | Date | null
  }>
  evaluatorCountByUser: Map<string, number>
  acks: Array<{ user_id: string; acknowledged_at?: string | Date | null; meeting_at?: string | Date | null }>
  tasks: Array<{ status?: string | null }>
  goals: Array<{ user_id: string; status?: string | null; score?: number | string | null; weight?: number | string | null }>
}): BenefitServerFacts {
  return {
    participation: computeParticipation(input.assignments),
    cycleTime: computeCycleTime(input.assignments),
    ack: computeAckStats(input.evaluatorCountByUser, input.acks),
    tasks: computeTaskStats(input.tasks),
    goals: computeGoalStats(input.goals),
  }
}

export function buildBenefitCard(facts: BenefitServerFacts | null, change: BenefitChange): BenefitCard {
  return {
    participation: facts?.participation ?? null,
    cycleTime: facts?.cycleTime ?? null,
    ack: facts?.ack ?? null,
    tasks: facts?.tasks ?? null,
    goals: facts?.goals ?? null,
    change,
  }
}

// ---------------------------------------------------------------------------
// Sunum: bölüm satırları (ekran + PDF aynı satırları kullanır)
// ---------------------------------------------------------------------------

export type BenefitSectionKey = 'participation' | 'cycleTime' | 'ack' | 'meeting' | 'tasks' | 'goals' | 'change'

export type BenefitTitleKey =
  | 'benefitParticipation'
  | 'benefitCycleTime'
  | 'benefitAckRate'
  | 'benefitMeetingRate'
  | 'benefitTasks'
  | 'benefitGoals'
  | 'benefitChange'

export type BenefitSection = {
  key: BenefitSectionKey
  titleKey: BenefitTitleKey
  /** [etiket, değer] satırları; boşsa bölümde veri yok. */
  rows: string[][]
}

const L = (lang: Lang, tr: string, en: string, fr: string) => (lang === 'en' ? en : lang === 'fr' ? fr : tr)
const fmtRatio = (x: BenefitRatio) => `%${x.pct} — ${x.num} / ${x.den}`
const fmtDelta = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(2)}`

export function benefitCardSections(card: BenefitCard, lang: Lang): BenefitSection[] {
  const days = t('benefitDays', lang)
  const out: BenefitSection[] = []
  const p = card.participation
  out.push({
    key: 'participation',
    titleKey: 'benefitParticipation',
    rows: p
      ? [
          [L(lang, 'Tamamlanan atama', 'Completed assignments', 'Affectations terminées'), fmtRatio(p.assignments)],
          [
            L(lang, 'Kişi başına ortalama değerlendirici', 'Average evaluators per person', 'Évaluateurs moyens par personne'),
            `${p.avgEvaluatorsPerPerson.toFixed(1)} — ${p.people} ${L(lang, 'kişi', 'people', 'personnes')}`,
          ],
        ]
      : [],
  })
  const c = card.cycleTime
  out.push({
    key: 'cycleTime',
    titleKey: 'benefitCycleTime',
    rows: c
      ? [
          [t('benefitCycleAvg', lang), `${c.avgDays.toFixed(1)} ${days} — ${c.count} ${L(lang, 'atama', 'assignments', 'affectations')}`],
          [t('benefitCycleMedian', lang), `${c.medianDays.toFixed(1)} ${days} — ${c.count} ${L(lang, 'atama', 'assignments', 'affectations')}`],
        ]
      : [],
  })
  const eligibleLabel = L(lang, 'Tebliğ edilebilir kişi', 'Eligible people', 'Personnes éligibles')
  out.push({
    key: 'ack',
    titleKey: 'benefitAckRate',
    rows: card.ack ? [[eligibleLabel, fmtRatio(card.ack.acknowledged)]] : [],
  })
  out.push({
    key: 'meeting',
    titleKey: 'benefitMeetingRate',
    rows: card.ack ? [[eligibleLabel, fmtRatio(card.ack.meetings)]] : [],
  })
  out.push({
    key: 'tasks',
    titleKey: 'benefitTasks',
    rows: card.tasks
      ? [[L(lang, 'Tamamlanan görev', 'Completed tasks', 'Actions terminées'), fmtRatio(card.tasks.done)]]
      : [],
  })
  // Hedefler: boşsa bölüm HİÇ eklenmez (sıfır tablosu çizilmez).
  const g = card.goals
  if (g) {
    const st = (k: GoalStatus) => String(g.byStatus[k])
    out.push({
      key: 'goals',
      titleKey: 'benefitGoals',
      rows: [
        [L(lang, 'Puanlanmış hedef', 'Scored goals', 'Objectifs notés'), `${g.scored} / ${g.total}`],
        [L(lang, 'Gerçekleşti', 'Achieved', 'Atteint'), st('achieved')],
        [L(lang, 'Kısmen', 'Partial', 'Partiel'), st('partial')],
        [L(lang, 'Gerçekleşmedi', 'Missed', 'Non atteint'), st('missed')],
        [L(lang, 'İptal', 'Cancelled', 'Annulé'), st('cancelled')],
        [L(lang, 'Ağırlık toplamı 100 olan kişi', 'People with weights totalling 100', 'Personnes avec pondération = 100'), fmtRatio(g.weight100)],
      ],
    })
  }
  const ch = card.change
  const changeRows: string[][] =
    ch.status === 'first_period'
      ? [[t('benefitFirstPeriod', lang), '']]
      : ch.status === 'no_comparable'
        ? [[t('benefitNoComparable', lang), '']]
        : [
            [
              `${L(lang, 'Kurum ortalaması', 'Organization average', 'Moyenne organisation')} (${L(lang, 'önceki', 'previous', 'précédente')}: ${ch.previousPeriodName})`,
              `${ch.orgAvg.prev.toFixed(2)} → ${ch.orgAvg.cur.toFixed(2)} (${fmtDelta(ch.orgAvg.delta)}) — ${ch.orgAvg.people} ${L(lang, 'kişi', 'people', 'personnes')}`,
            ],
            ...ch.deptUp.map((d) => [
              `${L(lang, 'Yükselen birim', 'Rising department', 'Département en hausse')}: ${d.department}`,
              `${d.prev.toFixed(2)} → ${d.cur.toFixed(2)} (${fmtDelta(d.delta)}) — ${d.people} ${L(lang, 'kişi', 'people', 'personnes')}`,
            ]),
            ...ch.deptDown.map((d) => [
              `${L(lang, 'Gerileyen birim', 'Declining department', 'Département en baisse')}: ${d.department}`,
              `${d.prev.toFixed(2)} → ${d.cur.toFixed(2)} (${fmtDelta(d.delta)}) — ${d.people} ${L(lang, 'kişi', 'people', 'personnes')}`,
            ]),
          ]
  out.push({ key: 'change', titleKey: 'benefitChange', rows: changeRows })
  return out
}

/** Kapanış paketi / PDF için tek tablo: [Gösterge, Ölçüt, Değer]. */
export function benefitCardTableRows(card: BenefitCard, lang: Lang): string[][] {
  return benefitCardSections(card, lang).flatMap((s) => s.rows.map((r) => [t(s.titleKey, lang), r[0], r[1]]))
}

/** Değişim dışında en az bir ölçülmüş gösterge var mı (yalnız "ilk dönem" notu veri sayılmaz). */
export function benefitCardHasData(card: BenefitCard): boolean {
  return !!(card.participation || card.cycleTime || card.ack || card.tasks || card.goals || card.change.status === 'compared')
}
