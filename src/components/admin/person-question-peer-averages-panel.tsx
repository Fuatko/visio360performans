'use client'

import { useMemo } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { PersonQuestionPeerAverageRow } from '@/lib/server/person-question-peer-averages'
import { Card, CardHeader, CardBody, CardTitle, Badge, toast } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import { openPrintableReport } from '@/lib/admin-report-export'
import { BarChart3, Loader2, User } from 'lucide-react'

type Props = {
  data: {
    target: { id: string; name: string; department: string }
    totals: {
      assignmentCount: number
      questionCount: number
      uniqueEvaluators: number
    }
    rows: PersonQuestionPeerAverageRow[]
  }
  periodLabel: string
}

export function PersonQuestionPeerAveragesPanel({ data, periodLabel }: Props) {
  const lang = useLang()

  const grouped = useMemo(() => {
    const byMatrix = new Map<string, { matrixLabel: string; rows: PersonQuestionPeerAverageRow[] }>()
    for (const row of data.rows) {
      const key = row.matrixContext || row.matrixLabel
      let g = byMatrix.get(key)
      if (!g) {
        g = { matrixLabel: row.matrixLabel, rows: [] }
        byMatrix.set(key, g)
      }
      g.rows.push(row)
    }
    return Array.from(byMatrix.values()).sort((a, b) => a.matrixLabel.localeCompare(b.matrixLabel, 'tr'))
  }, [data.rows])

  const noOpinionLabel =
    lang === 'en' ? 'No opinion' : lang === 'fr' ? 'Sans avis' : 'Fikrim yok'

  const exportCsv = () => {
    if (!data.rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers =
      lang === 'en'
        ? ['Person', 'Department', 'Matrix', 'Category', '#', 'Question', 'Average', 'Evaluators', 'No opinion']
        : lang === 'fr'
          ? ['Personne', 'Département', 'Matrice', 'Catégorie', '#', 'Question', 'Moyenne', 'Évaluateurs', 'Sans avis']
          : ['Kişi', 'Birim', 'Matris', 'Kategori', '#', 'Soru', 'Ortalama', 'Değerlendiren', 'Fikrim yok']
    let csv = `\ufeff${headers.map(esc).join(sep)}\n`
    for (const row of data.rows) {
      csv += [
        data.target.name,
        data.target.department,
        row.matrixLabel,
        row.categoryLabel,
        String(row.questionOrder),
        row.questionText,
        row.peerAvg != null ? String(row.peerAvg) : '—',
        String(row.evaluatorCount),
        String(row.noOpinionCount),
      ]
        .map(esc)
        .join(sep)
      csv += '\n'
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `soru-ortalama-${data.target.name.replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    if (!data.rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const headers =
      lang === 'en'
        ? ['Matrix', 'Category', '#', 'Question', 'Average', 'Evaluators']
        : lang === 'fr'
          ? ['Matrice', 'Catégorie', '#', 'Question', 'Moyenne', 'Évaluateurs']
          : ['Matris', 'Kategori', '#', 'Soru', 'Ortalama', 'Değerlendiren']
    const rows = data.rows.map((r) => [
      r.matrixLabel,
      r.categoryLabel,
      String(r.questionOrder),
      r.questionText,
      r.peerAvg != null ? String(r.peerAvg) : '—',
      String(r.evaluatorCount),
    ])
    const ok = openPrintableReport({
      lang,
      title: `${t('personQuestionPeerAveragesTitle', lang)} — ${data.target.name}`,
      subtitle: `${periodLabel} · ${data.target.department}`,
      headers,
      rows,
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres contextuelles' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
    if (!ok) toast(t('exportNoData', lang), 'error')
  }

  return (
    <Card className="mb-6 overflow-hidden border-[var(--border)] shadow-sm">
      <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-600 shrink-0" />
              {t('personQuestionPeerAveragesTitle', lang)}
            </CardTitle>
            <ReportPurposeNote purposeKey="reportPurpose_personQuestionPeerAverages" />
          </div>
          <ReportExportButtons onExcel={exportCsv} onPdf={exportPdf} />
        </div>
      </CardHeader>
      <CardBody>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge variant="info" className="gap-1.5">
            <User className="w-3.5 h-3.5" />
            {data.target.name}
          </Badge>
          <span className="text-sm text-[var(--muted)]">{data.target.department}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-3">
            <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru'}</div>
            <div className="text-2xl font-bold">{data.totals.questionCount}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-3">
            <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Evaluators' : lang === 'fr' ? 'Évaluateurs' : 'Değerlendiren'}</div>
            <div className="text-2xl font-bold">{data.totals.uniqueEvaluators}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-3">
            <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Assignments' : lang === 'fr' ? 'Affectations' : 'Atama'}</div>
            <div className="text-2xl font-bold">{data.totals.assignmentCount}</div>
          </div>
        </div>

        {grouped.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t('exportNoData', lang)}</p>
        ) : (
          <div className="space-y-6">
            {grouped.map((matrix) => (
              <div key={matrix.matrixLabel} className="rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-4 py-2.5 bg-[var(--surface-2)]/80 border-b border-[var(--border)] font-medium text-sm">
                  {matrix.matrixLabel}
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {matrix.rows.map((row, idx) => (
                    <div key={`${row.questionId}-${idx}`} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className="shrink-0 w-7 h-7 rounded-lg bg-[var(--surface-2)] text-xs font-semibold flex items-center justify-center text-[var(--muted)]">
                          {row.questionOrder || idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)] mb-0.5">{row.categoryLabel}</div>
                          <div className="text-sm text-[var(--foreground)] leading-snug">{row.questionText}</div>
                          {row.noOpinionCount > 0 ? (
                            <div className="text-[11px] text-[var(--muted)] mt-1">
                              {row.noOpinionCount} {noOpinionLabel}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 sm:text-right pl-10 sm:pl-0">
                        <div className="text-2xl font-bold tabular-nums text-[var(--brand)]">
                          {row.peerAvg != null ? row.peerAvg.toFixed(2) : '—'}
                        </div>
                        <div className="text-[11px] text-[var(--muted)]">
                          {row.evaluatorCount}{' '}
                          {lang === 'en' ? 'evaluators' : lang === 'fr' ? 'évaluateurs' : 'değerlendiren'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-[var(--muted)] mt-5">{t('personQuestionPeerAveragesFooter', lang)}</p>
      </CardBody>
    </Card>
  )
}

export function PersonQuestionPeerAveragesLoadingCard() {
  const lang = useLang()
  return (
    <Card className="mb-6">
      <CardBody className="flex items-center gap-3 py-8 justify-center text-[var(--muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        {t('personQuestionPeerAveragesLoading', lang)}
      </CardBody>
    </Card>
  )
}
