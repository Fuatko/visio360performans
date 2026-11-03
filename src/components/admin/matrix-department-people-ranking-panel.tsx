'use client'

import { useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { CadreRankingGroup, DeptPeopleGroup } from '@/lib/admin-department-ranking'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import {
  ReportCatalogSubtitle,
  resolveCatalogTitle,
  type ReportCatalogDisplayProps,
} from '@/components/admin/report-catalog-display'
import { openPrintableReportDocument, type PrintableReportSection } from '@/lib/admin-report-export'
import { Building2, ChevronDown, ChevronRight } from 'lucide-react'

export type MatrixDepartmentPeopleRow = {
  rankInDept: number
  targetId: string
  name: string
  matrixScore: number
  questionCount: number
}

export type MatrixDepartmentPeopleGroup = DeptPeopleGroup<MatrixDepartmentPeopleRow>
export type MatrixCadrePeopleGroup = CadreRankingGroup<MatrixDepartmentPeopleRow>

/** Ekrandaki seçim: kadro (null = Hepsi) ve tek liste görünümü. */
export type MatrixDepartmentPeopleView = { cadreKey: string | null; flat: boolean }

export type MatrixCadreFlatRow = MatrixDepartmentPeopleRow & { department: string; rankInCadre: number }

/**
 * Kadronun bütün kişileri birim ayrımı olmadan tek sırada: puana göre
 * yüksekten düşüğe, eşitlikte ada göre (Türkçe). Sıra 1'den kesintisiz.
 */
export function flattenCadrePeople(cadre: MatrixCadrePeopleGroup): MatrixCadreFlatRow[] {
  return cadre.departments
    .flatMap((g) => g.rows.map((r) => ({ ...r, department: g.department })))
    .sort((a, b) => b.matrixScore - a.matrixScore || a.name.localeCompare(b.name, 'tr'))
    .map((r, i) => ({ ...r, rankInCadre: i + 1 }))
}

/** Seçili kadroya göre süzme: null = Hepsi (dokunulmaz). */
export function filterCadreGroups(
  cadreGroups: MatrixCadrePeopleGroup[] | null | undefined,
  cadreKey: string | null
): MatrixCadrePeopleGroup[] | null {
  if (!cadreGroups || !cadreGroups.length) return cadreGroups ?? null
  return cadreKey ? cadreGroups.filter((c) => c.key === cadreKey) : cadreGroups
}

/** Dosya adı için kadro etiketinin sadeleştirilmiş hali. */
export function cadreFileSlug(label: string): string {
  return (
    String(label || '')
      .trim()
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'kadro'
  )
}

function scoreBadgeVariant(score: number): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  if (score >= 4) return 'success'
  if (score >= 3.5) return 'info'
  if (score >= 3) return 'warning'
  if (score > 0) return 'danger'
  return 'gray'
}

type Props = ReportCatalogDisplayProps & {
  groups: MatrixDepartmentPeopleGroup[]
  /** Kurumun kadro tanımı varsa birimlerin üstünde kadro katmanı. Yoksa null. */
  cadreGroups?: MatrixCadrePeopleGroup[] | null
  onExcel: (view: MatrixDepartmentPeopleView) => void
  onPdf: (view: MatrixDepartmentPeopleView) => void
}

export function MatrixDepartmentPeopleRankingPanel({
  groups,
  cadreGroups,
  catalogTitle,
  catalogDescription,
  onExcel,
  onPdf,
}: Props) {
  const lang = useLang()
  // Kadro açık/kapalı durumu. Varsayılan: ilk kadro açık, diğerleri kapalı.
  const [openCadres, setOpenCadres] = useState<Record<string, boolean>>({})
  const hasCadres = !!cadreGroups && cadreGroups.length > 0
  // null = Hepsi. Hepsi'de tek liste sunulmaz → flatView yok sayılır.
  const [selectedCadre, setSelectedCadre] = useState<string | null>(null)
  const [flatView, setFlatView] = useState(false)
  const activeCadre = hasCadres ? selectedCadre : null
  const flat = activeCadre != null && flatView
  const visibleCadres = hasCadres ? filterCadreGroups(cadreGroups, activeCadre)! : []
  const view: MatrixDepartmentPeopleView = { cadreKey: activeCadre, flat }

  if (!groups.length) return null

  const peopleWord = lang === 'en' ? 'people' : lang === 'fr' ? 'personnes' : 'kişi'
  const avgWord = lang === 'en' ? 'Avg' : lang === 'fr' ? 'Moy.' : 'Ort.'

  const renderDepartment = (group: MatrixDepartmentPeopleGroup, stickyTop: string) => (
    <div key={group.department} className="border-t border-[var(--border)]">
      <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[var(--surface-2)]/80 sticky ${stickyTop} z-10`}>
        <span className="font-semibold text-sm text-[var(--foreground)]">{group.department}</span>
        <Badge variant="info">
          {group.peopleCount} {peopleWord}
        </Badge>
        <span className="text-xs text-[var(--muted)] ml-auto">
          {lang === 'en' ? 'Dept. avg' : lang === 'fr' ? 'Moy. dép.' : 'Birim ort.'}{' '}
          <strong className="text-[var(--foreground)]">{group.avgOverall.toFixed(2)}</strong>
        </span>
      </div>
      <div className="px-3 pb-3 sm:px-4 space-y-1.5">
        {group.rows.map((row) => {
          const isTop = row.rankInDept === 1
          const isLast = row.rankInDept === group.rows.length && group.rows.length > 1
          return (
            <div
              key={row.targetId}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 ${
                isTop
                  ? 'border-emerald-500/25 bg-emerald-500/5'
                  : isLast
                    ? 'border-rose-500/25 bg-rose-500/5'
                    : 'border-[var(--border)]/70 bg-[var(--surface)]'
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-[11px] font-bold text-sky-800 dark:text-sky-200">
                {row.rankInDept}
              </span>
              <span className="font-medium text-sm text-[var(--foreground)] min-w-0 flex-1">{row.name}</span>
              <span className="text-[10px] text-[var(--muted)] tabular-nums shrink-0">
                {row.questionCount} {lang === 'en' ? 'q' : lang === 'fr' ? 'q' : 'soru'}
              </span>
              <Badge variant={scoreBadgeVariant(row.matrixScore)} className="tabular-nums shrink-0">
                {row.matrixScore.toFixed(2)}
              </Badge>
            </div>
          )
        })}
      </div>
    </div>
  )

  const cadreSummaryLine = (cadre: MatrixCadrePeopleGroup) => (
    <>
      <span className="font-bold text-[var(--foreground)]">{cadre.label}</span>
      <Badge variant="info">
        {cadre.peopleCount} {peopleWord}
      </Badge>
      <span className="text-xs text-[var(--muted)]">
        {avgWord} <strong className="text-[var(--foreground)]">{cadre.avgOverall.toFixed(2)}</strong>
      </span>
      <span className="text-xs text-[var(--muted)] ml-auto">
        ▲ {cadre.bestPerson} ({cadre.bestScore.toFixed(2)}) · ▼ {cadre.worstPerson} ({cadre.worstScore.toFixed(2)})
      </span>
    </>
  )

  const renderFlatCadre = (cadre: MatrixCadrePeopleGroup) => {
    const rows = flattenCadrePeople(cadre)
    return (
      <div key={cadre.key} className="border-t-2 border-sky-500/30">
        <div
          className={`flex flex-wrap items-center gap-2 px-4 py-3 ${cadre.unassigned ? 'bg-amber-500/10' : 'bg-sky-500/10'}`}
        >
          {cadreSummaryLine(cadre)}
        </div>
        <div className="px-3 py-3 sm:px-4 space-y-1.5">
          {rows.map((row) => {
            const isTop = row.rankInCadre === 1
            const isLast = row.rankInCadre === rows.length && rows.length > 1
            return (
              <div
                key={row.targetId}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 ${
                  isTop
                    ? 'border-emerald-500/25 bg-emerald-500/5'
                    : isLast
                      ? 'border-rose-500/25 bg-rose-500/5'
                      : 'border-[var(--border)]/70 bg-[var(--surface)]'
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-[11px] font-bold text-sky-800 dark:text-sky-200">
                  {row.rankInCadre}
                </span>
                <span className="font-medium text-sm text-[var(--foreground)] min-w-0 flex-1">{row.name}</span>
                <span className="text-xs text-[var(--muted)] shrink-0">{row.department}</span>
                <span className="text-[10px] text-[var(--muted)] tabular-nums shrink-0">
                  {row.questionCount} {lang === 'en' ? 'q' : lang === 'fr' ? 'q' : 'soru'}
                </span>
                <Badge variant={scoreBadgeVariant(row.matrixScore)} className="tabular-nums shrink-0">
                  {row.matrixScore.toFixed(2)}
                </Badge>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${
      active
        ? 'border-sky-500 bg-sky-500/15 text-[var(--foreground)]'
        : 'border-[var(--border)] text-[var(--muted)] hover:border-sky-500/50'
    }`

  return (
    <Card className="mb-6 overflow-hidden border-sky-500/20 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-5 h-5 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <CardTitle>
                {resolveCatalogTitle(catalogTitle, t('matrixDepartmentPeopleRankingTitle', lang))}
              </CardTitle>
              <ReportCatalogSubtitle catalogDescription={catalogDescription} />
              <ReportPurposeNote purposeKey="reportPurpose_matrixDepartmentPeopleRanking" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">
              {groups.length} {lang === 'en' ? 'dept.' : lang === 'fr' ? 'dép.' : 'birim'}
            </Badge>
            <ReportExportButtons onExcel={() => onExcel(view)} onPdf={() => onPdf(view)} />
          </div>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <p className="text-sm text-sky-900/90 dark:text-sky-100/90 mx-4 mt-4 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
          {t('matrixStructureScopeNote', lang)}
        </p>
        <p className="text-xs text-[var(--muted)] px-4 pt-2 pb-1">{t('matrixStructureScoringRulesNote', lang)}</p>
        {hasCadres ? (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <button
              type="button"
              className={chipClass(activeCadre == null)}
              aria-pressed={activeCadre == null}
              onClick={() => {
                setSelectedCadre(null)
                setFlatView(false)
              }}
            >
              {t('cadreAll', lang)} ({cadreGroups!.reduce((sum, c) => sum + c.peopleCount, 0)})
            </button>
            {cadreGroups!.map((c) => (
              <button
                key={c.key}
                type="button"
                className={chipClass(activeCadre === c.key)}
                aria-pressed={activeCadre === c.key}
                onClick={() => setSelectedCadre(c.key)}
              >
                {c.label} ({c.peopleCount})
              </button>
            ))}
            {activeCadre != null ? (
              <div className="ml-auto inline-flex rounded-lg border border-[var(--border)] p-0.5">
                <button type="button" className={chipClass(!flat)} aria-pressed={!flat} onClick={() => setFlatView(false)}>
                  {t('cadreViewByDept', lang)}
                </button>
                <button type="button" className={chipClass(flat)} aria-pressed={flat} onClick={() => setFlatView(true)}>
                  {t('cadreViewFlat', lang)}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 max-h-[min(70vh,720px)] overflow-y-auto">
          {hasCadres && visibleCadres.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--muted)]">{t('cadreEmptyInPeriod', lang)}</p>
          ) : hasCadres && flat ? (
            visibleCadres.map((cadre) => renderFlatCadre(cadre))
          ) : hasCadres
            ? visibleCadres.map((cadre, ci) => {
                const open = openCadres[cadre.key] ?? ci === 0
                return (
                  <div key={cadre.key} className="border-t-2 border-sky-500/30">
                    <button
                      type="button"
                      onClick={() => setOpenCadres((prev) => ({ ...prev, [cadre.key]: !open }))}
                      aria-expanded={open}
                      className={`w-full flex flex-wrap items-center gap-2 px-4 py-3 text-left ${
                        cadre.unassigned ? 'bg-amber-500/10' : 'bg-sky-500/10'
                      }`}
                    >
                      {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                      {cadreSummaryLine(cadre)}
                    </button>
                    {open ? cadre.departments.map((g) => renderDepartment(g, 'top-0')) : null}
                  </div>
                )
              })
            : groups.map((group) => renderDepartment(group, 'top-0'))}
        </div>
        <p className="text-xs text-[var(--muted)] px-4 py-3 border-t border-[var(--border)]">
          {t('matrixDepartmentPeopleRankingFootnote', lang)}
        </p>
      </CardBody>
    </Card>
  )
}

export function matrixDepartmentPeopleExportHeaders(lang: 'tr' | 'en' | 'fr', withCadre = false, flat = false) {
  if (flat) {
    // Tek liste: birim kişi/ortalama sütunları anlamsız; Birim kalır (kişinin nereden geldiği).
    return [
      ...(withCadre ? [lang === 'en' ? 'Staff group' : lang === 'fr' ? 'Groupe de personnel' : 'Kadro'] : []),
      lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
      t('cadreRankInCadre', lang),
      lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
      lang === 'en' ? 'MATRIX score' : lang === 'fr' ? 'Score MATRIX' : 'MATRIX puanı',
      lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru',
    ]
  }
  return [
    // Kadro sütunu yalnız kurumun kadro tanımı varsa eklenir; yoksa çıktı bugünkü gibi.
    ...(withCadre ? [lang === 'en' ? 'Staff group' : lang === 'fr' ? 'Groupe de personnel' : 'Kadro'] : []),
    lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
    lang === 'en' ? 'Dept. people' : lang === 'fr' ? 'Effectif' : 'Birim kişi',
    lang === 'en' ? 'Dept. avg' : lang === 'fr' ? 'Moy. dép.' : 'Birim ort.',
    lang === 'en' ? 'Rank in dept.' : lang === 'fr' ? 'Rang dép.' : 'Birimde sıra',
    lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
    lang === 'en' ? 'MATRIX score' : lang === 'fr' ? 'Score MATRIX' : 'MATRIX puanı',
    lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru',
  ]
}

export function matrixDepartmentPeopleExportRows(
  groups: MatrixDepartmentPeopleGroup[],
  cadreGroups?: MatrixCadrePeopleGroup[] | null,
  flat = false
) {
  const rows: unknown[][] = []
  // Tek liste: her kadronun kişileri ekrandaki tek sırayla.
  if (flat && cadreGroups && cadreGroups.length) {
    cadreGroups.forEach((c) => {
      flattenCadrePeople(c).forEach((r) => {
        rows.push([c.label, r.department, r.rankInCadre, r.name, r.matrixScore.toFixed(2), r.questionCount])
      })
    })
    return rows
  }
  // Kadro varsa satır sırası ekrandakiyle aynı: kadro → birim (ort.) → kişi (puan).
  if (cadreGroups && cadreGroups.length) {
    cadreGroups.forEach((c) => {
      c.departments.forEach((g) => {
        g.rows.forEach((r) => {
          rows.push([
            c.label,
            g.department,
            g.peopleCount,
            g.avgOverall.toFixed(2),
            r.rankInDept,
            r.name,
            r.matrixScore.toFixed(2),
            r.questionCount,
          ])
        })
      })
    })
    return rows
  }
  groups.forEach((g) => {
    g.rows.forEach((r) => {
      rows.push([
        g.department,
        g.peopleCount,
        g.avgOverall.toFixed(2),
        r.rankInDept,
        r.name,
        r.matrixScore.toFixed(2),
        r.questionCount,
      ])
    })
  })
  return rows
}

/**
 * PDF bölümleri — saf fonksiyon (test edilebilir). Kadro tanımı varsa önce
 * "Kadro özeti" tablosu, sonra kadro sırasıyla birimler ("Kadro › Birim").
 * Kadro yoksa bölümler bugünkü gibi yalnız birimlerden oluşur.
 */
export function buildMatrixDepartmentPeoplePdfSections(
  groups: MatrixDepartmentPeopleGroup[],
  lang: 'tr' | 'en' | 'fr',
  cadreGroups?: MatrixCadrePeopleGroup[] | null,
  flat = false,
  /** Kadro özeti tablosu — yalnız "Hepsi" seçiliyken. */
  withCadreSummary = true
): PrintableReportSection[] {
  const L = (tr: string, en: string, fr: string) => (lang === 'en' ? en : lang === 'fr' ? fr : tr)
  const headers = [
    '#',
    L('Kişi', 'Person', 'Personne'),
    L('MATRIX puanı', 'MATRIX score', 'Score MATRIX'),
    L('Soru', 'Questions', 'Questions'),
  ]
  const deptSection = (g: MatrixDepartmentPeopleGroup, prefix = ''): PrintableReportSection => ({
    heading: `${prefix}${g.department} (${g.peopleCount} ${L('kişi', 'people', 'personnes')} · ${L('ort.', 'avg', 'moy.')} ${g.avgOverall.toFixed(2)})`,
    headers,
    rows: g.rows.map((r) => [String(r.rankInDept), r.name, r.matrixScore.toFixed(2), String(r.questionCount)]),
  })

  if (!cadreGroups || cadreGroups.length === 0) return groups.map((g) => deptSection(g))

  // Ekrandaki sıra: kadrolar tanım sırasıyla, "Tanımsız" en sonda.
  const ordered = [...cadreGroups.filter((c) => !c.unassigned), ...cadreGroups.filter((c) => c.unassigned)]
  const summary: PrintableReportSection = {
    heading: t('cadreSummary', lang),
    headers: [
      L('Kadro', 'Staff group', 'Groupe'),
      L('Birim sayısı', 'Units', 'Unités'),
      L('Kişi', 'People', 'Personnes'),
      L('Ortalama', 'Average', 'Moyenne'),
      L('En iyi', 'Best', 'Meilleur'),
      L('En düşük', 'Lowest', 'Plus bas'),
    ],
    rows: ordered.map((c) => [
      c.label,
      String(c.departments.length),
      String(c.peopleCount),
      c.avgOverall.toFixed(2),
      c.bestPerson ? `${c.bestPerson} (${c.bestScore.toFixed(2)})` : '',
      c.worstPerson ? `${c.worstPerson} (${c.worstScore.toFixed(2)})` : '',
    ]),
  }
  const body = flat
    ? // Tek liste: her kadro tek tablo, başlık kadro adı + özeti; birim başlığı yok.
      ordered.map(
        (c): PrintableReportSection => ({
          heading: `${c.label} (${c.peopleCount} ${L('kişi', 'people', 'personnes')} · ${L('ort.', 'avg', 'moy.')} ${c.avgOverall.toFixed(2)} · ▲ ${c.bestPerson} (${c.bestScore.toFixed(2)}) · ▼ ${c.worstPerson} (${c.worstScore.toFixed(2)}))`,
          headers: [
            '#',
            L('Kişi', 'Person', 'Personne'),
            L('Birim', 'Department', 'Département'),
            L('MATRIX puanı', 'MATRIX score', 'Score MATRIX'),
            L('Soru', 'Questions', 'Questions'),
          ],
          rows: flattenCadrePeople(c).map((r) => [
            String(r.rankInCadre),
            r.name,
            r.department,
            r.matrixScore.toFixed(2),
            String(r.questionCount),
          ]),
        })
      )
    : ordered.flatMap((c) => c.departments.map((g) => deptSection(g, `${c.label} › `)))
  return withCadreSummary ? [summary, ...body] : body
}

export function openMatrixDepartmentPeoplePdf(
  groups: MatrixDepartmentPeopleGroup[],
  opts: {
    lang: 'tr' | 'en' | 'fr'
    periodLabel: string
    catalogTitle?: string
    onBlocked?: () => void
    /** Seçili kadro (null/verilmezse Hepsi). Tek kadroda kadro özeti tablosu basılmaz. */
    cadreKey?: string | null
  },
  cadreGroups?: MatrixCadrePeopleGroup[] | null,
  flat = false
) {
  const { lang, periodLabel, catalogTitle, onBlocked, cadreKey } = opts
  return openPrintableReportDocument({
    lang,
    title: `${resolveCatalogTitle(catalogTitle, t('matrixDepartmentPeopleRankingTitle', lang))} — ${periodLabel}`,
    subtitle: t('matrixStructureScopeNote', lang),
    sections: buildMatrixDepartmentPeoplePdfSections(groups, lang, cadreGroups, flat, !cadreKey),
    onBlocked,
  })
}
