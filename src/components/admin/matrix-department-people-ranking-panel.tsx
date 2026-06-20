'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { DeptPeopleGroup } from '@/lib/admin-department-ranking'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import { openPrintableReportDocument } from '@/lib/admin-report-export'
import { Building2 } from 'lucide-react'

export type MatrixDepartmentPeopleRow = {
  rankInDept: number
  targetId: string
  name: string
  matrixScore: number
  questionCount: number
}

export type MatrixDepartmentPeopleGroup = DeptPeopleGroup<MatrixDepartmentPeopleRow>

function scoreBadgeVariant(score: number): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  if (score >= 4) return 'success'
  if (score >= 3.5) return 'info'
  if (score >= 3) return 'warning'
  if (score > 0) return 'danger'
  return 'gray'
}

type Props = {
  groups: MatrixDepartmentPeopleGroup[]
  onExcel: () => void
  onPdf: () => void
}

export function MatrixDepartmentPeopleRankingPanel({ groups, onExcel, onPdf }: Props) {
  const lang = useLang()

  if (!groups.length) return null

  return (
    <Card className="mb-6 overflow-hidden border-sky-500/20 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-5 h-5 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <CardTitle>{t('matrixDepartmentPeopleRankingTitle', lang)}</CardTitle>
              <ReportPurposeNote purposeKey="reportPurpose_matrixDepartmentPeopleRanking" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">
              {groups.length} {lang === 'en' ? 'dept.' : lang === 'fr' ? 'dép.' : 'birim'}
            </Badge>
            <ReportExportButtons onExcel={onExcel} onPdf={onPdf} />
          </div>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <p className="text-sm text-sky-900/90 dark:text-sky-100/90 mx-4 mt-4 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
          {t('matrixStructureScopeNote', lang)}
        </p>
        <p className="text-xs text-[var(--muted)] px-4 pt-2 pb-1">{t('matrixStructureScoringRulesNote', lang)}</p>
        <div className="mt-3 max-h-[min(70vh,720px)] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.department} className="border-t border-[var(--border)]">
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[var(--surface-2)]/80 sticky top-0 z-10">
                <span className="font-semibold text-sm text-[var(--foreground)]">{group.department}</span>
                <Badge variant="info">
                  {group.peopleCount} {lang === 'en' ? 'people' : lang === 'fr' ? 'personnes' : 'kişi'}
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
          ))}
        </div>
        <p className="text-xs text-[var(--muted)] px-4 py-3 border-t border-[var(--border)]">
          {t('matrixDepartmentPeopleRankingFootnote', lang)}
        </p>
      </CardBody>
    </Card>
  )
}

export function matrixDepartmentPeopleExportHeaders(lang: 'tr' | 'en' | 'fr') {
  return [
    lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
    lang === 'en' ? 'Dept. people' : lang === 'fr' ? 'Effectif' : 'Birim kişi',
    lang === 'en' ? 'Dept. avg' : lang === 'fr' ? 'Moy. dép.' : 'Birim ort.',
    lang === 'en' ? 'Rank in dept.' : lang === 'fr' ? 'Rang dép.' : 'Birimde sıra',
    lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
    lang === 'en' ? 'MATRIX score' : lang === 'fr' ? 'Score MATRIX' : 'MATRIX puanı',
    lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru',
  ]
}

export function matrixDepartmentPeopleExportRows(groups: MatrixDepartmentPeopleGroup[]) {
  const rows: unknown[][] = []
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

export function openMatrixDepartmentPeoplePdf(
  groups: MatrixDepartmentPeopleGroup[],
  opts: { lang: 'tr' | 'en' | 'fr'; periodLabel: string; onBlocked?: () => void }
) {
  const { lang, periodLabel, onBlocked } = opts
  const headers = [
    '#',
    lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
    lang === 'en' ? 'MATRIX score' : lang === 'fr' ? 'Score MATRIX' : 'MATRIX puanı',
    lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru',
  ]
  return openPrintableReportDocument({
    lang,
    title: `${t('matrixDepartmentPeopleRankingTitle', lang)} — ${periodLabel}`,
    subtitle: t('matrixStructureScopeNote', lang),
    sections: groups.map((g) => ({
      heading: `${g.department} (${g.peopleCount} ${lang === 'en' ? 'people' : lang === 'fr' ? 'personnes' : 'kişi'} · ${lang === 'en' ? 'avg' : lang === 'fr' ? 'moy.' : 'ort.'} ${g.avgOverall.toFixed(2)})`,
      headers,
      rows: g.rows.map((r) => [
        String(r.rankInDept),
        r.name,
        r.matrixScore.toFixed(2),
        String(r.questionCount),
      ]),
    })),
    onBlocked,
  })
}
