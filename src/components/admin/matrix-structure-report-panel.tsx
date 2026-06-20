'use client'

import { useMemo, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { MatrixStructureReportPayload } from '@/lib/server/matrix-structure-report-build'
import type { MatrixStructurePersonScore } from '@/lib/server/matrix-structure-scoring'
import { Card, CardHeader, CardBody, CardTitle, Badge, toast } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import { openPrintableReport } from '@/lib/admin-report-export'
import { ChevronDown, ChevronUp, LayoutGrid, ListOrdered, Loader2 } from 'lucide-react'

type Props = {
  data: MatrixStructureReportPayload | null
  loading: boolean
  periodLabel: string
  mode: 'period_summary' | 'question_scores'
}

function scoreBadgeVariant(score: number): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  if (score >= 4) return 'success'
  if (score >= 3.5) return 'info'
  if (score >= 3) return 'warning'
  if (score > 0) return 'danger'
  return 'gray'
}

export function MatrixStructureReportPanel({ data, loading, periodLabel, mode }: Props) {
  const lang = useLang()
  const [expandedTargetId, setExpandedTargetId] = useState<string | null>(null)

  const categoryColumns = useMemo(() => data?.categoryLabels || [], [data?.categoryLabels])

  const exportRankingsCsv = () => {
    if (!data?.rankings.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = [
      lang === 'en' ? 'Rank' : lang === 'fr' ? 'Rang' : 'Sıra',
      lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
      lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
      lang === 'en' ? 'Matrix structure score' : lang === 'fr' ? 'Score structure matricielle' : 'Matris yapı puanı',
      lang === 'en' ? 'Answered questions' : lang === 'fr' ? 'Questions répondues' : 'Cevaplanan soru',
      ...categoryColumns.map((c) => c.label),
    ]
    let csv = `\ufeff${headers.map(esc).join(sep)}\n`
    data.rankings.forEach((row, idx) => {
      const catByKey = new Map(row.categories.map((c) => [c.categoryKey, c.peerAvg]))
      csv += [
        idx + 1,
        row.targetName,
        row.targetDept,
        row.overallPeerAvg.toFixed(2),
        row.answeredQuestionCount,
        ...categoryColumns.map((c) => {
          const v = catByKey.get(c.key)
          return v != null && v > 0 ? v.toFixed(2) : '—'
        }),
      ]
        .map(esc)
        .join(sep)
      csv += '\n'
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matris-yapi-${mode === 'period_summary' ? 'ozet' : 'puan'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    if (!data?.rankings.length && mode === 'question_scores') {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const headers =
      mode === 'question_scores'
        ? [
            '#',
            lang === 'en' ? 'Person' : 'Kişi',
            lang === 'en' ? 'Score' : 'Puan',
            ...categoryColumns.map((c) => c.label),
          ]
        : [
            lang === 'en' ? 'Metric' : 'Metrik',
            lang === 'en' ? 'Value' : 'Değer',
          ]
    const rows: string[][] =
      mode === 'question_scores'
        ? data!.rankings.map((row, idx) => {
            const catByKey = new Map(row.categories.map((c) => [c.categoryKey, c.peerAvg]))
            return [
              String(idx + 1),
              row.targetName,
              row.overallPeerAvg.toFixed(2),
              ...categoryColumns.map((c) => {
                const v = catByKey.get(c.key)
                return v != null && v > 0 ? v.toFixed(2) : '—'
              }),
            ]
          })
        : data
          ? [
              [lang === 'en' ? 'Targets' : 'Hedef kişi', String(data.periodSummary.targetCount)],
              [lang === 'en' ? 'With scores' : 'Puanlı kişi', String(data.periodSummary.targetsWithScores)],
              [lang === 'en' ? 'Completed assignments' : 'Tamamlanan atama', String(data.periodSummary.completedAssignmentCount)],
              [lang === 'en' ? 'Pending assignments' : 'Bekleyen atama', String(data.periodSummary.pendingAssignmentCount)],
              [lang === 'en' ? 'Evaluators' : 'Değerlendiren', String(data.periodSummary.uniqueEvaluatorCount)],
              [lang === 'en' ? 'Questions (answered)' : 'Soru (cevaplı)', String(data.periodSummary.uniqueQuestionCount)],
              [lang === 'en' ? 'Categories' : 'Kategori', String(data.periodSummary.categoryCount)],
            ]
          : []

    const title =
      mode === 'period_summary'
        ? t('matrixStructurePeriodSummaryTitle', lang)
        : t('matrixStructureQuestionScoresTitle', lang)

    openPrintableReport({
      lang,
      title: `${title} — ${periodLabel}`,
      subtitle: t('matrixStructureScopeNote', lang),
      headers,
      rows,
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
  }

  if (loading) {
    return (
      <Card className="mb-6">
        <CardBody className="py-10 flex items-center justify-center gap-2 text-[var(--muted)]">
          <Loader2 className="w-5 h-5 animate-spin" />
          {t('matrixStructureReportLoading', lang)}
        </CardBody>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card className="mb-6">
        <CardBody className="py-8 text-sm text-[var(--muted)] text-center">
          {t('matrixStructureReportEmpty', lang)}
        </CardBody>
      </Card>
    )
  }

  const summary = data.periodSummary

  if (mode === 'period_summary') {
    return (
      <Card className="mb-6 overflow-hidden border-sky-500/20">
        <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
          <div className="flex flex-wrap items-start justify-between gap-3 w-full">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-sky-600" />
                {t('matrixStructurePeriodSummaryTitle', lang)}
              </CardTitle>
              <ReportPurposeNote purposeKey="reportPurpose_matrixStructurePeriodSummary" />
            </div>
            <ReportExportButtons onExcel={exportRankingsCsv} onPdf={exportPdf} />
          </div>
        </CardHeader>
        <CardBody className="space-y-5">
          <p className="text-sm text-sky-900/90 dark:text-sky-100/90 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
            {t('matrixStructureScopeNote', lang)}
          </p>
          <p className="text-xs text-[var(--muted)]">{t('matrixStructureScoringRulesNote', lang)}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label: lang === 'en' ? 'Target people' : 'Hedef kişi', value: summary.targetCount },
              { label: lang === 'en' ? 'Scored people' : 'Puanlı kişi', value: summary.targetsWithScores },
              { label: lang === 'en' ? 'Completed' : 'Tamamlanan', value: summary.completedAssignmentCount },
              { label: lang === 'en' ? 'Pending' : 'Bekleyen', value: summary.pendingAssignmentCount },
              { label: lang === 'en' ? 'Evaluators' : 'Değerlendiren', value: summary.uniqueEvaluatorCount },
              { label: lang === 'en' ? 'Answered questions' : 'Cevaplanan soru', value: summary.uniqueQuestionCount },
              { label: lang === 'en' ? 'Categories' : 'Kategori', value: summary.categoryCount },
              {
                label: lang === 'en' ? 'Excluded (extra duty)' : 'Hariç (yan görev)',
                value: summary.excludedDutyMatrixCount,
              },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{item.label}</div>
                <div className="text-2xl font-bold text-[var(--foreground)] mt-1">{item.value}</div>
              </div>
            ))}
          </div>

          {categoryColumns.length > 0 ? (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] font-medium text-sm">
                {lang === 'en' ? 'Category pool (matrix structure)' : 'Kategori havuzu (matris yapı)'}
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {categoryColumns.map((c) => (
                  <Badge key={c.key} variant="info">
                    {c.label}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>
    )
  }

  return (
    <Card className="mb-6 overflow-hidden border-sky-500/20">
      <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-start justify-between gap-3 w-full">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListOrdered className="w-5 h-5 text-sky-600" />
              {t('matrixStructureQuestionScoresTitle', lang)}
            </CardTitle>
            <ReportPurposeNote purposeKey="reportPurpose_matrixStructureQuestionScores" />
          </div>
          <ReportExportButtons onExcel={exportRankingsCsv} onPdf={exportPdf} />
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-sky-900/90 dark:text-sky-100/90 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
          {t('matrixStructureScopeNote', lang)}
        </p>
        <p className="text-xs text-[var(--muted)]">{t('matrixStructureScoringRulesNote', lang)}</p>

        {data.rankings.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t('exportNoData', lang)}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                <tr>
                  <th className="py-3 px-3 text-left font-semibold text-[var(--muted)] w-10">#</th>
                  <th className="py-3 px-3 text-left font-semibold text-[var(--muted)]">
                    {lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'}
                  </th>
                  <th className="py-3 px-3 text-left font-semibold text-[var(--muted)]">
                    {lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}
                  </th>
                  <th className="py-3 px-3 text-center font-semibold text-[var(--muted)]">
                    {lang === 'en' ? 'Matrix score' : lang === 'fr' ? 'Score matrice' : 'Matris yapı puanı'}
                  </th>
                  <th className="py-3 px-3 text-center font-semibold text-[var(--muted)]">
                    {lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru'}
                  </th>
                  {categoryColumns.map((c) => (
                    <th key={c.key} className="py-3 px-2 text-center font-semibold text-[var(--muted)] min-w-[4.5rem]">
                      {c.label}
                    </th>
                  ))}
                  <th className="py-3 px-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.rankings.map((row, idx) => (
                  <PersonScoreRows
                    key={row.targetId}
                    row={row}
                    rank={idx + 1}
                    categoryColumns={categoryColumns}
                    expanded={expandedTargetId === row.targetId}
                    onToggle={() => setExpandedTargetId(expandedTargetId === row.targetId ? null : row.targetId)}
                    lang={lang}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function PersonScoreRows({
  row,
  rank,
  categoryColumns,
  expanded,
  onToggle,
  lang,
}: {
  row: MatrixStructurePersonScore
  rank: number
  categoryColumns: Array<{ key: string; label: string }>
  expanded: boolean
  onToggle: () => void
  lang: 'tr' | 'en' | 'fr'
}) {
  const catByKey = new Map(row.categories.map((c) => [c.categoryKey, c.peerAvg]))
  const colSpan = 5 + categoryColumns.length

  return (
    <>
      <tr className="hover:bg-[var(--surface-2)]/50">
        <td className="py-3 px-3 font-semibold text-[var(--muted)]">{rank}</td>
        <td className="py-3 px-3 font-medium text-[var(--foreground)]">{row.targetName}</td>
        <td className="py-3 px-3 text-[var(--muted)]">{row.targetDept}</td>
        <td className="py-3 px-3 text-center">
          <Badge variant={scoreBadgeVariant(row.overallPeerAvg)}>{row.overallPeerAvg.toFixed(2)}</Badge>
        </td>
        <td className="py-3 px-3 text-center text-[var(--foreground)]">{row.answeredQuestionCount}</td>
        {categoryColumns.map((c) => {
          const v = catByKey.get(c.key)
          return (
            <td key={c.key} className="py-3 px-2 text-center font-semibold tabular-nums">
              {v != null && v > 0 ? (
                <span className={v >= 4 ? 'text-emerald-700' : v >= 3.5 ? 'text-sky-700' : 'text-[var(--foreground)]'}>
                  {v.toFixed(2)}
                </span>
              ) : (
                '—'
              )}
            </td>
          )
        })}
        <td className="py-3 px-2">
          {row.questions.length > 0 ? (
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-[var(--surface-2)] text-[var(--muted)]"
              onClick={onToggle}
              title={lang === 'en' ? 'Question breakdown' : 'Soru kırılımı'}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          ) : null}
        </td>
      </tr>
      {expanded && row.questions.length > 0 ? (
        <tr className="bg-[var(--surface-2)]/40">
          <td colSpan={colSpan + 1} className="px-4 py-3">
            <div className="text-xs font-semibold text-[var(--muted)] mb-2 uppercase tracking-wide">
              {lang === 'en' ? 'Question-level averages' : lang === 'fr' ? 'Moyennes par question' : 'Soru bazlı ortalamalar'}
            </div>
            <div className="rounded-lg border border-[var(--border)] overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-2)] sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-3">{lang === 'en' ? 'Category' : 'Kategori'}</th>
                    <th className="text-left py-2 px-3">{lang === 'en' ? 'Question' : 'Soru'}</th>
                    <th className="text-center py-2 px-3">{lang === 'en' ? 'Avg' : 'Ort.'}</th>
                    <th className="text-center py-2 px-3">n</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/60">
                  {row.questions.map((q) => (
                    <tr key={q.questionId}>
                      <td className="py-1.5 px-3 text-[var(--muted)]">{q.categoryLabel}</td>
                      <td className="py-1.5 px-3 text-[var(--foreground)]">{q.questionText}</td>
                      <td className="py-1.5 px-3 text-center font-semibold">{q.peerAvg.toFixed(2)}</td>
                      <td className="py-1.5 px-3 text-center text-[var(--muted)]">{q.scorerCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
