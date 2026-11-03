import type { PrintableReportSection } from '@/lib/admin-report-export'
import type { PeriodComparisonPersonRow } from '@/lib/admin-department-ranking'
import { t } from '@/lib/i18n'

/**
 * Dönem kapanış paketi — mevcut raporların ÜRETTİĞİ veriyi tek belgede
 * derler. Yeni hesap ve yorum üretmez; yalnız sıralar, keser (ilk 5) ve
 * tabloya döker. Verisi olmayan bölüm boş kalır ve PDF'e girmez.
 */

type Lang = 'tr' | 'en' | 'fr'

export const CLOSING_PACK_TOP_N = 5

export type ClosingPackPersonRow = { name: string; dept: string; score: number }

export type ClosingPackInput = {
  orgName?: string | null
  periodName?: string | null
  periodKindLabel?: string | null
  /** Dönemin tarih aralığı; sayfada bilinmiyorsa null (satır atlanır). */
  periodDateRange?: string | null
  evaluatedCount?: number | null
  /** Katılım raporundaki atama toplamları. */
  participation?: { completed: number; total: number } | null
  /** Risk kartındaki ekip değerlendirici sayılarının ortalaması. */
  avgEvaluatorsPerPerson?: number | null
  lowCoverageCount?: number | null
  lowCoverageThreshold?: number
  distribution?: Array<{ label: string; count: number }>
  departments?: Array<{ department: string; peopleCount: number; avg: number }>
  cadres?: Array<{ label: string; peopleCount: number; avg: number }> | null
  categories?: { top: Array<{ name: string; avg: number }>; bottom: Array<{ name: string; avg: number }> }
  topPeople?: ClosingPackPersonRow[]
  bottomPeople?: ClosingPackPersonRow[]
  /** Dönem karşılaştırma raporunun hazır listeleri; karşılaştırma yoksa null. */
  change?: {
    up: PeriodComparisonPersonRow[]
    down: PeriodComparisonPersonRow[]
    /** Performans × İvme matrisindeki "yüksek + düşüyor" hücresi. */
    highFalling: PeriodComparisonPersonRow[]
  } | null
  /** Risk kartının öncelikli kişileri (ekrandaki sırayla). */
  risk?: Array<{ name: string; dept: string; riskScore: number; overall: number }>
}

export type ClosingPackSectionKey =
  | 'identity'
  | 'participation'
  | 'distribution'
  | 'departments'
  | 'cadres'
  | 'competencies'
  | 'people'
  | 'change'
  | 'attention'

export type ClosingPackSection = {
  key: ClosingPackSectionKey
  title: string
  section: PrintableReportSection
  hasData: boolean
}

const L = (lang: Lang, tr: string, en: string, fr: string) => (lang === 'en' ? en : lang === 'fr' ? fr : tr)
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '')
const fd = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(2)}`
const personKey = (r: { name: string; dept: string }) => `${r.name}\u0000${r.dept}`

/** İlk N en yüksek ve (onlarla çakışmayan) ilk N en düşük — küçük kümelerde aynı kayıt iki kez yazılmaz. */
function topBottom<T>(items: T[], score: (x: T) => number, key: (x: T) => string, n = CLOSING_PACK_TOP_N) {
  const desc = [...items].sort((a, b) => score(b) - score(a))
  const top = desc.slice(0, n)
  const used = new Set(top.map(key))
  const bottom = [...items]
    .sort((a, b) => score(a) - score(b))
    .filter((x) => !used.has(key(x)))
    .slice(0, n)
  return { top, bottom }
}

export function buildClosingPackSections(input: ClosingPackInput, lang: Lang): ClosingPackSection[] {
  const out: ClosingPackSection[] = []
  const push = (key: ClosingPackSectionKey, title: string, headers: string[], rows: string[][]) =>
    out.push({ key, title, section: { heading: title, headers, rows }, hasData: rows.length > 0 })

  const kv = [L(lang, 'Alan', 'Field', 'Champ'), L(lang, 'Değer', 'Value', 'Valeur')]
  const typeCol = L(lang, 'Tür', 'Type', 'Type')
  const highest = L(lang, 'En yüksek', 'Highest', 'Plus haut')
  const lowest = L(lang, 'En düşük', 'Lowest', 'Plus bas')
  const peopleCol = L(lang, 'Kişi', 'People', 'Personnes')
  const avgCol = L(lang, 'Ortalama', 'Average', 'Moyenne')

  // 1) Dönem künyesi
  const identity: string[][] = []
  if (input.orgName) identity.push([L(lang, 'Kurum', 'Organization', 'Organisation'), input.orgName])
  if (input.periodName) identity.push([L(lang, 'Dönem', 'Period', 'Période'), input.periodName])
  if (input.periodKindLabel) identity.push([L(lang, 'Dönem türü', 'Period type', 'Type de période'), input.periodKindLabel])
  if (input.periodDateRange) identity.push([L(lang, 'Tarih aralığı', 'Date range', 'Dates'), input.periodDateRange])
  if (input.evaluatedCount != null && input.evaluatedCount > 0) {
    identity.push([L(lang, 'Değerlendirilen kişi', 'People evaluated', 'Personnes évaluées'), String(input.evaluatedCount)])
  }
  push('identity', L(lang, 'Dönem künyesi', 'Period identity', 'Fiche de la période'), kv, identity)

  // 2) Katılım ve kapsama
  const part: string[][] = []
  const p = input.participation
  if (p && p.total > 0) {
    part.push([
      L(lang, 'Tamamlanma oranı', 'Completion rate', 'Taux de complétion'),
      `%${Math.round((p.completed / p.total) * 100)} (${p.completed} / ${p.total})`,
    ])
  }
  if (input.avgEvaluatorsPerPerson != null && input.avgEvaluatorsPerPerson > 0) {
    part.push([
      L(lang, 'Kişi başına ortalama değerlendirici', 'Average evaluators per person', 'Évaluateurs moyens par personne'),
      input.avgEvaluatorsPerPerson.toFixed(1),
    ])
  }
  if (input.lowCoverageCount != null && (part.length > 0 || input.lowCoverageCount > 0)) {
    part.push([
      L(
        lang,
        `Yetersiz kapsamalı kişi (< ${input.lowCoverageThreshold ?? 3} değerlendirici)`,
        `People with low coverage (< ${input.lowCoverageThreshold ?? 3} evaluators)`,
        `Personnes à couverture faible (< ${input.lowCoverageThreshold ?? 3} évaluateurs)`
      ),
      String(input.lowCoverageCount),
    ])
  }
  push('participation', L(lang, 'Katılım ve kapsama', 'Participation and coverage', 'Participation et couverture'), kv, part)

  // 3) Puan dağılımı
  const dist = input.distribution || []
  const distTotal = dist.reduce((s, b) => s + b.count, 0)
  push(
    'distribution',
    L(lang, 'Puan dağılımı', 'Score distribution', 'Distribution des scores'),
    [L(lang, 'Aralık', 'Range', 'Intervalle'), peopleCol],
    distTotal > 0 ? dist.map((b) => [b.label, String(b.count)]) : []
  )

  // 4) Birim özeti
  const depts = (input.departments || []).filter((d) => d.peopleCount > 0)
  const db = topBottom(depts, (d) => d.avg, (d) => d.department)
  push(
    'departments',
    L(lang, 'Birim özeti', 'Department summary', 'Synthèse par département'),
    [typeCol, L(lang, 'Birim', 'Department', 'Département'), peopleCol, avgCol],
    [
      ...db.top.map((d) => [highest, d.department, String(d.peopleCount), f2(d.avg)]),
      ...db.bottom.map((d) => [lowest, d.department, String(d.peopleCount), f2(d.avg)]),
    ]
  )

  // 5) Kadro özeti (kadro tanımı varsa)
  push(
    'cadres',
    L(lang, 'Kadro özeti', 'Staff group summary', 'Synthèse par groupe'),
    [L(lang, 'Kadro', 'Staff group', 'Groupe'), peopleCol, avgCol],
    (input.cadres || []).filter((c) => c.peopleCount > 0).map((c) => [c.label, String(c.peopleCount), f2(c.avg)])
  )

  // 6) Yetkinlik özeti — kategori özetinin hazır listeleri
  const cats = input.categories
  const usedCats = new Set((cats?.top || []).slice(0, CLOSING_PACK_TOP_N).map((c) => c.name))
  push(
    'competencies',
    L(lang, 'Yetkinlik özeti', 'Competency summary', 'Synthèse des compétences'),
    [typeCol, L(lang, 'Yetkinlik', 'Competency', 'Compétence'), avgCol],
    [
      ...(cats?.top || []).slice(0, CLOSING_PACK_TOP_N).map((c) => [L(lang, 'En güçlü', 'Strongest', 'Plus fort'), c.name, f2(c.avg)]),
      ...(cats?.bottom || [])
        .filter((c) => !usedCats.has(c.name))
        .slice(0, CLOSING_PACK_TOP_N)
        .map((c) => [L(lang, 'Gelişime en açık', 'Most room to develop', 'Plus grande marge'), c.name, f2(c.avg)]),
    ]
  )

  // 7) Öne çıkanlar
  const usedPeople = new Set((input.topPeople || []).slice(0, CLOSING_PACK_TOP_N).map(personKey))
  const personHeaders = [typeCol, L(lang, 'Kişi', 'Person', 'Personne'), L(lang, 'Birim', 'Department', 'Département'), L(lang, 'Puan', 'Score', 'Score')]
  push('people', L(lang, 'Öne çıkanlar', 'Highlights', 'Points saillants'), personHeaders, [
    ...(input.topPeople || []).slice(0, CLOSING_PACK_TOP_N).map((r) => [highest, r.name, r.dept, f2(r.score)]),
    ...(input.bottomPeople || [])
      .filter((r) => !usedPeople.has(personKey(r)))
      .slice(0, CLOSING_PACK_TOP_N)
      .map((r) => [lowest, r.name, r.dept, f2(r.score)]),
  ])

  // 8) Önceki döneme göre değişim
  const ch = input.change
  const changeRow = (label: string) => (r: PeriodComparisonPersonRow) => [label, r.name, r.dept, f2(r.prev), f2(r.cur), fd(r.delta)]
  push(
    'change',
    L(lang, 'Önceki döneme göre değişim', 'Change vs previous period', 'Évolution vs période précédente'),
    [
      typeCol,
      L(lang, 'Kişi', 'Person', 'Personne'),
      L(lang, 'Birim', 'Department', 'Département'),
      L(lang, 'Önceki', 'Previous', 'Précédent'),
      L(lang, 'Bu dönem', 'This period', 'Cette période'),
      L(lang, 'Değişim', 'Change', 'Évolution'),
    ],
    ch
      ? [
          ...ch.up.filter((r) => r.delta > 0).slice(0, CLOSING_PACK_TOP_N).map(changeRow(L(lang, 'En çok yükselen', 'Largest rise', 'Plus forte hausse'))),
          ...ch.down.filter((r) => r.delta < 0).slice(0, CLOSING_PACK_TOP_N).map(changeRow(L(lang, 'En çok düşen', 'Largest drop', 'Plus forte baisse'))),
          ...ch.highFalling.map(
            changeRow(`${t('momentumHigh', lang)} · ${t('momentumDown', lang)}`)
          ),
        ]
      : []
  )

  // 9) Dikkat gerektirenler — risk kartının öncelikli kişileri
  push(
    'attention',
    L(lang, 'Dikkat gerektirenler', 'Needs attention', 'À surveiller'),
    [L(lang, 'Kişi', 'Person', 'Personne'), L(lang, 'Birim', 'Department', 'Département'), L(lang, 'Risk', 'Risk', 'Risque'), L(lang, 'Puan', 'Score', 'Score')],
    (input.risk || []).map((r) => [r.name, r.dept, String(r.riskScore), f2(r.overall)])
  )

  return out
}

/** Künye dışında en az bir bölümde veri var mı? Yoksa PDF açılmaz. */
export function closingPackHasData(sections: ClosingPackSection[]): boolean {
  return sections.some((s) => s.key !== 'identity' && s.hasData)
}

/** PDF bölümleri: yalnız verisi olanlar + sonda yorum notu (tek satır). */
export function buildClosingPackPdfSections(sections: ClosingPackSection[], lang: Lang): PrintableReportSection[] {
  if (!closingPackHasData(sections)) return []
  return [
    ...sections.filter((s) => s.hasData).map((s) => s.section),
    { headers: [L(lang, 'Not', 'Note', 'Note')], rows: [[t('closingPackCommentaryNote', lang)]] },
  ]
}
