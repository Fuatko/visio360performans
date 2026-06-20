'use client'

import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import { openPrintableReport } from '@/lib/admin-report-export'
import { Award } from 'lucide-react'

export type MatrixFullRankingRow = {
  rank: number
  targetId: string
  name: string
  dept: string
  matrixScore: number
  questionCount: number
}

function scoreBadgeVariant(score: number): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  if (score >= 4) return 'success'
  if (score >= 3.5) return 'info'
  if (score >= 3) return 'warning'
  if (score > 0) return 'danger'
  return 'gray'
}

type Props = {
  rows: MatrixFullRankingRow[]
  onExcel: () => void
  onPdf: () => void
}

export function MatrixFullRankingPanel({ rows, onExcel, onPdf }: Props) {
  const lang = useLang()

  if (!rows.length) return null

  return (
    <Card className="mb-6 overflow-hidden border-sky-500/20 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Award className="w-5 h-5 text-sky-600 shrink-0" />
            <div className="min-w-0">
              <CardTitle>{t('matrixFullRankingTitle', lang)}</CardTitle>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">
              {rows.length} {lang === 'en' ? 'people' : lang === 'fr' ? 'personnes' : 'kişi'}
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
        <div className="mt-3 max-h-[min(70vh,720px)] overflow-y-auto px-3 pb-3 sm:px-4 space-y-1.5">
          {rows.map((row) => {
            const isTop = row.rank === 1
            const isLast = row.rank === rows.length && rows.length > 1
            return (
              <div
                key={row.targetId}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5 ${
                  isTop
                    ? 'border-emerald-500/25 bg-emerald-500/5'
                    : isLast
                      ? 'border-rose-500/25 bg-rose-500/5'
                      : 'border-[var(--border)]/70 bg-[var(--surface)]'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-xs font-bold text-sky-800 dark:text-sky-200">
                  {row.rank}
                </span>
                <div className="min-w-0 flex-1 basis-[10rem]">
                  <div className="font-medium text-sm text-[var(--foreground)] leading-snug">{row.name}</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5 truncate" title={row.dept}>
                    {row.dept}
                  </div>
                </div>
                <span className="text-[10px] text-[var(--muted)] tabular-nums shrink-0">
                  {row.questionCount} {lang === 'en' ? 'questions' : lang === 'fr' ? 'questions' : 'soru'}
                </span>
                <Badge variant={scoreBadgeVariant(row.matrixScore)} className="tabular-nums shrink-0">
                  {row.matrixScore.toFixed(2)}
                </Badge>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-[var(--muted)] px-4 py-3 border-t border-[var(--border)]">
          {t('matrixFullRankingFootnote', lang)}
        </p>
      </CardBody>
    </Card>
  )
}

export function matrixFullRankingExportHeaders(lang: 'tr' | 'en' | 'fr') {
  return [
    lang === 'en' ? 'Rank' : lang === 'fr' ? 'Rang' : 'Sıra',
    lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
    lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
    lang === 'en' ? 'MATRIX score' : lang === 'fr' ? 'Score MATRIX' : 'MATRIX puanı',
    lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru',
  ]
}

export function matrixFullRankingExportRows(rows: MatrixFullRankingRow[]) {
  return rows.map((r) => [r.rank, r.name, r.dept, r.matrixScore.toFixed(2), r.questionCount])
}

export function openMatrixFullRankingPdf(
  rows: MatrixFullRankingRow[],
  opts: { lang: 'tr' | 'en' | 'fr'; periodLabel: string; onBlocked?: () => void }
) {
  const { lang, periodLabel, onBlocked } = opts
  return openPrintableReport({
    lang,
    title: `${t('matrixFullRankingTitle', lang)} — ${periodLabel}`,
    subtitle: t('matrixStructureScopeNote', lang),
    headers: matrixFullRankingExportHeaders(lang),
    rows: matrixFullRankingExportRows(rows).map((row) => row.map((c) => String(c))),
    onBlocked,
  })
}
