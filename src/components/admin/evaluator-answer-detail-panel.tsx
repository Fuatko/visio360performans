'use client'

import { Fragment, useMemo, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { hintFlagLabel, positionLevelLabel, type EvaluatorAnswerDetailRow } from '@/lib/server/evaluator-answer-detail'
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, toast } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import {
  ReportCatalogSubtitle,
  resolveCatalogTitle,
  type ReportCatalogDisplayProps,
} from '@/components/admin/report-catalog-display'
import { openPrintableReport } from '@/lib/admin-report-export'
import { ChevronDown, ChevronRight, AlertTriangle, Loader2, Users } from 'lucide-react'

type Props = ReportCatalogDisplayProps & {
  data: {
    totals: {
      assignmentCount: number
      rowCount: number
      uniqueTargets: number
      uniqueEvaluators: number
    }
    rows: EvaluatorAnswerDetailRow[]
  }
  periodLabel: string
}

function hintBadgeVariant(flag: string): 'warning' | 'danger' | 'info' | 'gray' {
  if (flag === 'uniform_low') return 'danger'
  if (flag === 'uniform_high' || flag === 'low_variance') return 'warning'
  if (flag === 'mostly_no_opinion') return 'info'
  return 'gray'
}

export function EvaluatorAnswerDetailPanel({
  data,
  periodLabel,
  catalogTitle,
  catalogDescription,
}: Props) {
  const lang = useLang()
  const [expandedTargets, setExpandedTargets] = useState<Record<string, boolean>>({})
  const [expandedEvaluators, setExpandedEvaluators] = useState<Record<string, boolean>>({})
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})

  const grouped = useMemo(() => {
    const byTarget = new Map<
      string,
      {
        targetId: string
        targetName: string
        targetDept: string
        evaluators: Map<
          string,
          {
            key: string
            evaluatorId: string
            evaluatorName: string
            evaluatorTitle: string
            evaluatorLevel: string
            evaluatorWeight: number
            matrixLabel: string
            isSelf: boolean
            hints: string[]
            categories: Map<
              string,
              { categoryLabel: string; rows: EvaluatorAnswerDetailRow[] }
            >
          }
        >
      }
    >()

    for (const row of data.rows) {
      let target = byTarget.get(row.targetId)
      if (!target) {
        target = {
          targetId: row.targetId,
          targetName: row.targetName,
          targetDept: row.targetDept,
          evaluators: new Map(),
        }
        byTarget.set(row.targetId, target)
      }
      const evalKey = `${row.assignmentId}`
      let ev = target.evaluators.get(evalKey)
      if (!ev) {
        ev = {
          key: evalKey,
          evaluatorId: row.evaluatorId,
          evaluatorName: row.evaluatorName,
          evaluatorTitle: row.evaluatorTitle,
          evaluatorLevel: row.evaluatorLevel,
          evaluatorWeight: row.evaluatorWeight,
          matrixLabel: row.matrixLabel,
          isSelf: row.isSelf,
          hints: row.assignmentHints,
          categories: new Map(),
        }
        target.evaluators.set(evalKey, ev)
      }
      const catKey = row.categoryKey || row.categoryLabel
      let cat = ev.categories.get(catKey)
      if (!cat) {
        cat = { categoryLabel: row.categoryLabel, rows: [] }
        ev.categories.set(catKey, cat)
      }
      cat.rows.push(row)
    }

    return Array.from(byTarget.values()).sort((a, b) => a.targetName.localeCompare(b.targetName, 'tr'))
  }, [data.rows])

  const exportCsv = () => {
    if (!data.rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers =
      lang === 'en'
        ? ['Evaluated', 'Department', 'Evaluator', 'Title', 'Role', 'Weight', 'Matrix', 'Category', 'Question', 'Score', 'Hints']
        : lang === 'fr'
          ? ['Évalué', 'Département', 'Évaluateur', 'Fonction', 'Rôle', 'Poids', 'Matrice', 'Catégorie', 'Question', 'Note', 'Indices']
          : ['Değerlendirilen', 'Birim', 'Değerlendiren', 'Görevi', 'Rol', 'Katsayı', 'Matris', 'Kategori', 'Soru', 'Puan', 'İpuçları']
    let csv = `\ufeff${headers.map(esc).join(sep)}\n`
    data.rows.forEach((r) => {
      csv +=
        [
          r.targetName,
          r.targetDept,
          r.evaluatorName,
          r.evaluatorTitle,
          r.evaluatorLevelLabel,
          r.evaluatorWeight,
          r.matrixLabel,
          r.categoryLabel,
          r.questionText,
          r.isScorable ? r.score : lang === 'en' ? 'No opinion' : lang === 'fr' ? 'Sans avis' : 'Fikrim yok',
          r.assignmentHints.map((h) => hintFlagLabel(h, lang)).join(' · '),
        ]
          .map(esc)
          .join(sep) + '\n'
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `degerlendirici_cevap_detayi_${periodLabel.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportPdf = () => {
    if (!data.rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const headers =
      lang === 'en'
        ? ['Evaluated', 'Department', 'Evaluator', 'Title', 'Role', 'Weight', 'Matrix', 'Category', 'Question', 'Score', 'Hints']
        : lang === 'fr'
          ? ['Évalué', 'Département', 'Évaluateur', 'Fonction', 'Rôle', 'Poids', 'Matrice', 'Catégorie', 'Question', 'Note', 'Indices']
          : ['Değerlendirilen', 'Birim', 'Değerlendiren', 'Görevi', 'Rol', 'Katsayı', 'Matris', 'Kategori', 'Soru', 'Puan', 'İpuçları']
    const rows = data.rows.map((r) => [
      r.targetName,
      r.targetDept,
      r.evaluatorName,
      r.evaluatorTitle,
      r.evaluatorLevelLabel,
      String(r.evaluatorWeight),
      r.matrixLabel,
      r.categoryLabel,
      r.questionText,
      r.isScorable ? String(r.score) : lang === 'en' ? 'No opinion' : lang === 'fr' ? 'Sans avis' : 'Fikrim yok',
      r.assignmentHints.map((h) => hintFlagLabel(h, lang)).join(' · '),
    ])
    const ok = openPrintableReport({
      lang,
      title: resolveCatalogTitle(catalogTitle, t('evaluatorAnswerDetailTitle', lang)),
      subtitle: periodLabel,
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

  const toggleTarget = (id: string) => setExpandedTargets((p) => ({ ...p, [id]: !p[id] }))
  const toggleEvaluator = (key: string) => setExpandedEvaluators((p) => ({ ...p, [key]: !p[key] }))
  const toggleCategory = (key: string) => setExpandedCategories((p) => ({ ...p, [key]: !p[key] }))

  return (
    <Card className="mb-6 overflow-hidden border-[var(--border)] shadow-sm">
      <CardHeader className="bg-gradient-to-r from-violet-500/10 to-transparent border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-600 shrink-0" />
              {resolveCatalogTitle(catalogTitle, t('evaluatorAnswerDetailTitle', lang))}
            </CardTitle>
            <ReportCatalogSubtitle catalogDescription={catalogDescription} />
            <ReportPurposeNote purposeKey="reportPurpose_evaluatorAnswerDetail" />
          </div>
          <ReportExportButtons onExcel={exportCsv} onPdf={exportPdf} />
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-3">
            <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'People' : lang === 'fr' ? 'Personnes' : 'Kişi'}</div>
            <div className="text-2xl font-bold">{data.totals.uniqueTargets}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-3">
            <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Evaluators' : lang === 'fr' ? 'Évaluateurs' : 'Değerlendiren'}</div>
            <div className="text-2xl font-bold">{data.totals.uniqueEvaluators}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-3">
            <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Assignments' : lang === 'fr' ? 'Affectations' : 'Atama'}</div>
            <div className="text-2xl font-bold">{data.totals.assignmentCount}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/50 p-3">
            <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Answer rows' : lang === 'fr' ? 'Lignes' : 'Cevap satırı'}</div>
            <div className="text-2xl font-bold">{data.totals.rowCount}</div>
          </div>
        </div>

        {grouped.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t('exportNoData', lang)}</p>
        ) : (
          <div className="space-y-3">
            {grouped.map((target) => {
              const targetOpen = expandedTargets[target.targetId] !== false
              return (
                <div key={target.targetId} className="rounded-xl border border-[var(--border)] overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-[var(--surface-2)]/70 hover:bg-[var(--surface-2)] text-left"
                    onClick={() => toggleTarget(target.targetId)}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--foreground)]">{target.targetName}</div>
                      <div className="text-xs text-[var(--muted)]">{target.targetDept}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="info">{target.evaluators.size}</Badge>
                      {targetOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>
                  {targetOpen ? (
                    <div className="p-3 space-y-2 border-t border-[var(--border)]">
                      {Array.from(target.evaluators.values()).map((ev) => {
                        const evOpen = expandedEvaluators[ev.key] !== false
                        return (
                          <div key={ev.key} className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                            <button
                              type="button"
                              className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--surface-2)]/50"
                              onClick={() => toggleEvaluator(ev.key)}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-[var(--foreground)]">
                                  {ev.isSelf ? t('selfEvaluationLabel', lang) : ev.evaluatorName}
                                </div>
                                <div className="text-xs text-[var(--muted)] flex flex-wrap gap-x-2 gap-y-0.5">
                                  <span>{ev.matrixLabel}</span>
                                  <span>·</span>
                                  <span>{ev.evaluatorTitle !== '-' ? ev.evaluatorTitle : positionLevelLabel(ev.evaluatorLevel, lang)}</span>
                                  <span>·</span>
                                  <span>
                                    {lang === 'en' ? 'Weight' : lang === 'fr' ? 'Poids' : 'Katsayı'}: {ev.evaluatorWeight}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {ev.hints.map((h) => (
                                  <Badge key={h} variant={hintBadgeVariant(h)} className="text-[10px]">
                                    {hintFlagLabel(h, lang)}
                                  </Badge>
                                ))}
                                {evOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </div>
                            </button>
                            {evOpen ? (
                              <div className="px-3 pb-3 space-y-2">
                                {Array.from(ev.categories.entries()).map(([catKey, cat]) => {
                                  const catExpandKey = `${ev.key}:${catKey}`
                                  const catOpen = expandedCategories[catExpandKey] !== false
                                  return (
                                    <Fragment key={catExpandKey}>
                                      <button
                                        type="button"
                                        className="w-full flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/60 px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
                                        onClick={() => toggleCategory(catExpandKey)}
                                      >
                                        <span className="font-medium text-[var(--foreground)]">{cat.categoryLabel}</span>
                                        <div className="flex items-center gap-2">
                                          <Badge variant="gray">{cat.rows.length}</Badge>
                                          {catOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        </div>
                                      </button>
                                      {catOpen ? (
                                        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                                          <table className="w-full text-xs">
                                            <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                                              <tr>
                                                <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                                                  {lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru'}
                                                </th>
                                                <th className="text-right py-2 px-3 font-semibold text-[var(--muted)] w-20">
                                                  {lang === 'en' ? 'Score' : lang === 'fr' ? 'Note' : 'Puan'}
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--border)]">
                                              {cat.rows
                                                .sort((a, b) => a.questionOrder - b.questionOrder || a.questionText.localeCompare(b.questionText, 'tr'))
                                                .map((row) => (
                                                  <tr key={`${row.questionId}-${row.score}`} className="hover:bg-[var(--surface-2)]/40">
                                                    <td className="py-2 px-3 text-[var(--foreground)]">{row.questionText}</td>
                                                    <td className="py-2 px-3 text-right font-semibold">
                                                      {row.isScorable ? row.score.toFixed(2) : (
                                                        <span className="text-[var(--muted)] font-normal">
                                                          {lang === 'en' ? 'No opinion' : lang === 'fr' ? 'Sans avis' : 'Fikrim yok'}
                                                        </span>
                                                      )}
                                                    </td>
                                                  </tr>
                                                ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : null}
                                    </Fragment>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        <p className="mt-4 text-xs text-[var(--muted)] flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
          {t('evaluatorAnswerDetailHintFooter', lang)}
        </p>
      </CardBody>
    </Card>
  )
}

export function EvaluatorAnswerDetailLoadingCard() {
  const lang = useLang()
  return (
    <Card className="mb-6">
      <CardBody className="flex items-center gap-3 py-8 justify-center text-[var(--muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        {t('evaluatorAnswerDetailLoading', lang)}
      </CardBody>
    </Card>
  )
}
