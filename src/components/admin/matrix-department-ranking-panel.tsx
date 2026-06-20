'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { DepartmentRankingGroups } from '@/lib/admin-department-ranking'
import { departmentSizeTierLabel } from '@/lib/department-size-tier'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import { Building2 } from 'lucide-react'

function scoreBadgeVariant(score: number): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  if (score >= 4) return 'success'
  if (score >= 3.5) return 'info'
  if (score >= 3) return 'warning'
  if (score > 0) return 'danger'
  return 'gray'
}

type Props = {
  groups: DepartmentRankingGroups
  onExcel: () => void
  onPdf: () => void
}

export function MatrixDepartmentRankingPanel({ groups, onExcel, onPdf }: Props) {
  const lang = useLang()

  if (!groups.allRows.length) return null

  return (
    <Card className="overflow-hidden border-sky-500/20 shadow-sm mb-6">
      <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-5 h-5 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <CardTitle>{t('matrixDepartmentRankingTitle', lang)}</CardTitle>
              <ReportPurposeNote purposeKey="reportPurpose_matrixDepartmentRanking" />
            </div>
          </div>
          <ReportExportButtons onExcel={onExcel} onPdf={onPdf} />
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <p className="text-sm text-sky-900/90 dark:text-sky-100/90 mx-4 mt-4 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
          {t('matrixStructureScopeNote', lang)}
        </p>
        <p className="text-xs text-[var(--muted)] px-4 pt-2 pb-1">{t('matrixStructureScoringRulesNote', lang)}</p>
        <div className="mt-3">
          {groups.tiers.map((group) => (
            <div key={group.tier} className="border-t border-[var(--border)] first:border-t-0">
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[var(--surface-2)]/80">
                <span className="font-semibold text-sm text-[var(--foreground)]">
                  {departmentSizeTierLabel(group.tier, lang)}
                </span>
                <Badge variant="info">
                  {group.rows.length} {lang === 'en' ? 'dept.' : lang === 'fr' ? 'dép.' : 'birim'}
                </Badge>
              </div>
              <div className="px-3 pb-3 sm:px-4 space-y-2">
                {group.rows.map((r) => {
                  const isTop = r.rankInTier === 1
                  const isLast = r.rankInTier === group.rows.length && group.rows.length > 1
                  return (
                    <div
                      key={`${group.tier}-${r.department}`}
                      className={`rounded-xl border px-3 py-3 sm:px-4 ${
                        isTop
                          ? 'border-emerald-500/25 bg-emerald-500/5'
                          : isLast
                            ? 'border-rose-500/25 bg-rose-500/5'
                            : 'border-[var(--border)] bg-[var(--surface)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-xs font-bold text-sky-800 dark:text-sky-200">
                          {r.rankInTier}
                        </span>
                        <div className="min-w-0 flex-1 basis-[10rem]">
                          <div className="font-semibold text-[var(--foreground)] leading-snug">{r.department}</div>
                          <div className="text-xs text-[var(--muted)] mt-0.5">
                            {r.peopleCount}{' '}
                            {lang === 'en' ? 'people' : lang === 'fr' ? 'personnes' : 'kişi'}
                          </div>
                        </div>
                        <div className="text-center shrink-0 ml-auto">
                          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            {lang === 'en' ? 'Dept. avg' : lang === 'fr' ? 'Moy. dép.' : 'Birim ort.'}
                          </div>
                          <Badge variant={scoreBadgeVariant(r.avgOverall)} className="mt-0.5 tabular-nums">
                            {r.avgOverall.toFixed(2)}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg border border-[var(--border)]/70 bg-[var(--surface-2)]/40 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-0.5">
                            {lang === 'en' ? 'Highest' : lang === 'fr' ? 'Plus élevé' : 'En yüksek'}
                          </div>
                          <span className="font-medium text-[var(--foreground)]">{r.bestPerson}</span>
                          <span className="text-[var(--muted)]"> ({r.bestScore.toFixed(2)})</span>
                        </div>
                        <div className="rounded-lg border border-[var(--border)]/70 bg-[var(--surface-2)]/40 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-0.5">
                            {lang === 'en' ? 'Lowest' : lang === 'fr' ? 'Plus bas' : 'En düşük'}
                          </div>
                          <span className="font-medium text-[var(--foreground)]">{r.worstPerson}</span>
                          <span className="text-[var(--muted)]"> ({r.worstScore.toFixed(2)})</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--muted)] px-4 py-3 border-t border-[var(--border)]">
          {t('matrixDepartmentRankingFootnote', lang)}
        </p>
      </CardBody>
    </Card>
  )
}

export function matrixDepartmentRankingExportHeaders(lang: 'tr' | 'en' | 'fr') {
  return [
    lang === 'en' ? 'Size group' : lang === 'fr' ? 'Groupe taille' : 'Kişi grubu',
    lang === 'en' ? 'Rank in group' : lang === 'fr' ? 'Rang dans le groupe' : 'Gruptaki sıra',
    lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
    lang === 'en' ? 'People' : lang === 'fr' ? 'Personnes' : 'Kişi sayısı',
    lang === 'en' ? 'MATRIX avg' : lang === 'fr' ? 'Moy. MATRIX' : 'MATRIX ort.',
    lang === 'en' ? 'Best person' : lang === 'fr' ? 'Meilleur' : 'Birimde en yüksek',
    lang === 'en' ? 'Best score' : lang === 'fr' ? 'Score' : 'Puan',
    lang === 'en' ? 'Lowest person' : lang === 'fr' ? 'Plus bas' : 'Birimde en düşük',
    lang === 'en' ? 'Lowest score' : lang === 'fr' ? 'Score' : 'Puan',
  ]
}

export function matrixDepartmentRankingExportRows(
  groups: DepartmentRankingGroups,
  lang: 'tr' | 'en' | 'fr'
) {
  const rows: unknown[][] = []
  groups.tiers.forEach((g) => {
    g.rows.forEach((r) => {
      rows.push([
        departmentSizeTierLabel(g.tier, lang),
        r.rankInTier,
        r.department,
        r.peopleCount,
        r.avgOverall.toFixed(2),
        r.bestPerson,
        r.bestScore.toFixed(2),
        r.worstPerson,
        r.worstScore.toFixed(2),
      ])
    })
  })
  return rows
}
