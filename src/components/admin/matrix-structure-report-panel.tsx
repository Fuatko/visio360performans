'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { MatrixStructureReportPayload, MatrixStructureUnscoredTarget } from '@/lib/server/matrix-structure-report-build'
import type { MatrixStructurePersonScore } from '@/lib/server/matrix-structure-scoring'
import { canonicalUserId } from '@/lib/server/evaluation-identity'
import { Card, CardHeader, CardBody, CardTitle, Badge, toast, Button } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import { openPrintableReport, downloadCsv, buildCsv } from '@/lib/admin-report-export'
import { ChevronDown, ChevronUp, Award, ListOrdered, Loader2, TrendingDown, TrendingUp, Download } from 'lucide-react'

const MATRIX_STRUCTURE_LEADERBOARD_SIZE = 15

type Props = {
  data: MatrixStructureReportPayload | null
  loading: boolean
  periodLabel: string
  mode: 'period_summary' | 'question_scores'
  selectedPersonId?: string
  selectedPersonName?: string
}

function matchTargetId(targetId: string, personId: string) {
  if (!personId) return false
  return canonicalUserId(targetId) === canonicalUserId(personId)
}

function filterPayloadForPerson(
  data: MatrixStructureReportPayload | null,
  personId: string
): MatrixStructureReportPayload | null {
  if (!data || !personId) return data
  return {
    ...data,
    rankings: data.rankings.filter((r) => matchTargetId(r.targetId, personId)),
    unscoredTargets: (data.unscoredTargets || []).filter((u) => matchTargetId(u.targetId, personId)),
  }
}

function exportFileSuffix(personName: string) {
  if (!personName) return ''
  const slug = personName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return slug ? `-${slug}` : ''
}

function unscoredReasonLabel(reason: MatrixStructureUnscoredTarget['reason'], lang: 'tr' | 'en' | 'fr') {
  if (reason === 'no_peer_assignment') return t('matrixStructureUnscoredReason_no_peer_assignment', lang)
  if (reason === 'pending_peer_only') return t('matrixStructureUnscoredReason_pending_peer_only', lang)
  if (reason === 'duty_matrix_only') return t('matrixStructureUnscoredReason_duty_matrix_only', lang)
  return t('matrixStructureUnscoredReason_no_scorable_peer', lang)
}

function scoreBadgeVariant(score: number): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  if (score >= 4) return 'success'
  if (score >= 3.5) return 'info'
  if (score >= 3) return 'warning'
  if (score > 0) return 'danger'
  return 'gray'
}

function matrixContextExportLabel(ctx: string, lang: 'tr' | 'en' | 'fr') {
  if (ctx === 'okul_yasam') {
    return lang === 'en' ? 'school_life' : lang === 'fr' ? 'vie_scolaire' : 'okul_yasam'
  }
  if (ctx === 'genel') {
    return lang === 'en' ? 'general' : lang === 'fr' ? 'general' : 'genel'
  }
  return ctx
}

export function MatrixStructureReportPanel({
  data,
  loading,
  periodLabel,
  mode,
  selectedPersonId = '',
  selectedPersonName = '',
}: Props) {
  const lang = useLang()
  const [expandedTargetId, setExpandedTargetId] = useState<string | null>(null)

  const viewData = useMemo(
    () => filterPayloadForPerson(data, selectedPersonId),
    [data, selectedPersonId]
  )

  const personRank = useMemo(() => {
    if (!selectedPersonId || !data?.rankings.length) return null
    const idx = data.rankings.findIndex((r) => matchTargetId(r.targetId, selectedPersonId))
    return idx >= 0 ? idx + 1 : null
  }, [data?.rankings, selectedPersonId])

  const exportSuffix = exportFileSuffix(selectedPersonName)

  useEffect(() => {
    if (selectedPersonId && viewData?.rankings.length === 1) {
      setExpandedTargetId(viewData.rankings[0].targetId)
    } else if (!selectedPersonId) {
      setExpandedTargetId(null)
    }
  }, [selectedPersonId, viewData?.rankings])

  const categoryColumns = useMemo(() => viewData?.categoryLabels || [], [viewData?.categoryLabels])

  const leaderboard = useMemo(() => {
    const rankings = viewData?.rankings || []
    const top = rankings.slice(0, MATRIX_STRUCTURE_LEADERBOARD_SIZE)
    const bottom = [...rankings]
      .filter((r) => r.overallPeerAvg > 0)
      .sort((a, b) => a.overallPeerAvg - b.overallPeerAvg)
      .slice(0, MATRIX_STRUCTURE_LEADERBOARD_SIZE)
    return { top, bottom }
  }, [viewData?.rankings])

  const exportLeaderboardCsv = () => {
    if (!leaderboard.top.length && !leaderboard.bottom.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const section = lang === 'en' ? 'Section' : lang === 'fr' ? 'Section' : 'Bölüm'
    const headers = [
      section,
      lang === 'en' ? 'Rank' : lang === 'fr' ? 'Rang' : 'Sıra',
      lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
      lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
      lang === 'en' ? 'Matrix structure score' : lang === 'fr' ? 'Score matrice' : 'Matris yapı puanı',
      lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru',
    ]
    const rows: unknown[][] = []
    const pushRows = (label: string, items: MatrixStructurePersonScore[]) => {
      items.forEach((row, idx) => {
        rows.push([label, idx + 1, row.targetName, row.targetDept, row.overallPeerAvg.toFixed(2), row.answeredQuestionCount])
      })
    }
    pushRows(lang === 'en' ? 'Highest' : lang === 'fr' ? 'Plus élevé' : 'En yüksek', leaderboard.top)
    pushRows(lang === 'en' ? 'Lowest' : lang === 'fr' ? 'Plus bas' : 'En düşük', leaderboard.bottom)
    downloadCsv(`matris-yapi-donem-ozeti${exportSuffix}.csv`, buildCsv(headers, rows))
  }

  const exportLeaderboardPdf = () => {
    if (!leaderboard.top.length && !leaderboard.bottom.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const headers = ['#', lang === 'en' ? 'Person' : 'Kişi', lang === 'en' ? 'Dept' : 'Birim', lang === 'en' ? 'Score' : 'Puan']
    const rows: string[][] = []
    leaderboard.top.forEach((row, i) => {
      rows.push([String(i + 1), row.targetName, row.targetDept, row.overallPeerAvg.toFixed(2)])
    })
    leaderboard.bottom.forEach((row, i) => {
      rows.push([String(i + 1), row.targetName, row.targetDept, row.overallPeerAvg.toFixed(2)])
    })
    openPrintableReport({
      lang,
      title: `${t('matrixStructurePeriodSummaryTitle', lang)} — ${periodLabel}`,
      subtitle: `${t('matrixStructureScopeNote', lang)} · ${t('matrixStructureScoringRulesNote', lang)}`,
      headers,
      rows,
      onBlocked: () =>
        toast(
          lang === 'en' ? 'Allow pop-ups to print' : lang === 'fr' ? 'Autorisez les fenêtres' : 'Yazdırmak için açılır pencereye izin verin',
          'error'
        ),
    })
  }

  const exportQuestionDetailCsv = () => {
    if (!viewData?.rankings.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const rowType = lang === 'en' ? 'Row type' : lang === 'fr' ? 'Type de ligne' : 'Satır tipi'
    const headers = [
      rowType,
      lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
      lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
      lang === 'en' ? 'Question order' : lang === 'fr' ? 'Ordre question' : 'Soru sıra',
      lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori',
      lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru',
      lang === 'en' ? 'Evaluator' : lang === 'fr' ? 'Évaluateur' : 'Değerlendiren',
      lang === 'en' ? 'Score' : lang === 'fr' ? 'Note' : 'Puan',
      lang === 'en' ? 'Slice' : lang === 'fr' ? 'Tranche' : 'Dilim',
      lang === 'en' ? 'Scorer count' : lang === 'fr' ? 'Nb évaluateurs' : 'Değerlendirici sayısı',
      lang === 'en' ? 'Score sum' : lang === 'fr' ? 'Somme notes' : 'Puan toplamı',
      lang === 'en' ? 'Question avg (exact)' : lang === 'fr' ? 'Moy. question (exact)' : 'Soru ort. (tam)',
      lang === 'en' ? 'Question avg (display)' : lang === 'fr' ? 'Moy. question (affichage)' : 'Soru ort. (gösterim)',
      lang === 'en' ? 'Question count' : lang === 'fr' ? 'Nb questions' : 'Soru sayısı',
      lang === 'en' ? 'Sum of question avgs' : lang === 'fr' ? 'Somme moy. questions' : 'Soru ort. toplamı',
      lang === 'en' ? 'Overall avg (exact)' : lang === 'fr' ? 'Moy. globale (exact)' : 'Genel ort. (tam)',
      lang === 'en' ? 'Overall avg (display)' : lang === 'fr' ? 'Moy. globale (affichage)' : 'Genel ort. (gösterim)',
    ]

    const detailLabel = lang === 'en' ? 'DETAIL' : lang === 'fr' ? 'DETAIL' : 'DETAY'
    const questionLabel = lang === 'en' ? 'QUESTION_AVG' : lang === 'fr' ? 'MOY_QUESTION' : 'SORU_ORT'
    const personLabel = lang === 'en' ? 'PERSON_AVG' : lang === 'fr' ? 'MOY_PERSONNE' : 'KISI_ORT'

    const rows: unknown[][] = []
    for (const person of viewData.rankings) {
      for (const q of person.questions) {
        const questionRef = `#${q.questionOrder} ${q.categoryLabel}`
        for (const scorer of q.scorers || []) {
          rows.push([
            detailLabel,
            person.targetName,
            person.targetDept,
            q.questionOrder,
            q.categoryLabel,
            questionRef,
            scorer.evaluatorName,
            scorer.score,
            matrixContextExportLabel(scorer.matrixContext, lang),
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
          ])
        }
        rows.push([
          questionLabel,
          person.targetName,
          person.targetDept,
          q.questionOrder,
          q.categoryLabel,
          q.questionText,
          '',
          '',
          '',
          q.scorerCount,
          q.scoreSum != null ? q.scoreSum.toFixed(6) : '',
          q.peerAvgExact != null ? q.peerAvgExact.toFixed(6) : '',
          q.peerAvg.toFixed(2),
          '',
          '',
          '',
          '',
        ])
      }
      rows.push([
        personLabel,
        person.targetName,
        person.targetDept,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        person.answeredQuestionCount,
        person.questionAvgSum != null ? person.questionAvgSum.toFixed(6) : '',
        person.overallPeerAvgExact != null ? person.overallPeerAvgExact.toFixed(6) : '',
        person.overallPeerAvg.toFixed(2),
      ])
    }

    downloadCsv(`matris-yapi-soru-kirilimi${exportSuffix}.csv`, buildCsv(headers, rows))
  }

  const exportRankingsCsv = () => {
    if (!viewData?.rankings.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const headers = [
      lang === 'en' ? 'Rank' : lang === 'fr' ? 'Rang' : 'Sıra',
      lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi',
      lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim',
      lang === 'en' ? 'Matrix structure score' : lang === 'fr' ? 'Score structure matricielle' : 'Matris yapı puanı',
      lang === 'en' ? 'Answered questions' : lang === 'fr' ? 'Questions répondues' : 'Cevaplanan soru',
      ...categoryColumns.map((c) => c.label),
    ]
    const rows: unknown[][] = viewData.rankings.map((row, idx) => {
      const catByKey = new Map(row.categories.map((c) => [c.categoryKey, c.peerAvg]))
      return [
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
    })
    downloadCsv(`matris-yapi-${mode === 'period_summary' ? 'ozet' : 'puan'}${exportSuffix}.csv`, buildCsv(headers, rows))
  }

  const exportPdf = () => {
    if (!viewData?.rankings.length && mode === 'question_scores') {
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
        ? viewData!.rankings.map((row, idx) => {
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
        : viewData?.rankings[0]
          ? [
              [lang === 'en' ? 'Person' : 'Kişi', viewData.rankings[0].targetName],
              [lang === 'en' ? 'Department' : 'Birim', viewData.rankings[0].targetDept],
              [lang === 'en' ? 'Score' : 'Puan', viewData.rankings[0].overallPeerAvg.toFixed(2)],
              [lang === 'en' ? 'Questions' : 'Soru', String(viewData.rankings[0].answeredQuestionCount)],
              ...(personRank != null && data
                ? [[lang === 'en' ? 'Rank' : 'Sıra', `${personRank} / ${data.rankings.length}`]]
                : []),
            ]
          : viewData
            ? [
                [lang === 'en' ? 'Targets' : 'Hedef kişi', String(viewData.periodSummary.targetCount)],
                [lang === 'en' ? 'With scores' : 'Puanlı kişi', String(viewData.periodSummary.targetsWithScores)],
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

  if (!viewData) {
    return (
      <Card className="mb-6">
        <CardBody className="py-8 text-sm text-[var(--muted)] text-center">
          {t('matrixStructureReportEmpty', lang)}
        </CardBody>
      </Card>
    )
  }

  const summary = viewData.periodSummary
  const selectedPersonRow = selectedPersonId ? viewData.rankings[0] : null
  const personFilterEmpty =
    !!selectedPersonId &&
    viewData.rankings.length === 0 &&
    (viewData.unscoredTargets?.length || 0) === 0

  const personFilterBanner = selectedPersonId && selectedPersonName ? (
    <p className="text-sm text-[var(--foreground)] rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/5 px-4 py-3">
      {t('matrixStructurePersonFilterActive', lang)}:{' '}
      <strong>{selectedPersonName}</strong>
    </p>
  ) : null

  if (mode === 'period_summary') {
    const hasLeaderboard = !selectedPersonId && (leaderboard.top.length > 0 || leaderboard.bottom.length > 0)
    const hasSelectedPersonScore = !!selectedPersonRow
    return (
      <Card className="mb-6 overflow-hidden border-sky-500/20">
        <CardHeader className="bg-gradient-to-r from-sky-500/10 to-transparent border-b border-[var(--border)]">
          <div className="flex flex-wrap items-start justify-between gap-3 w-full">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-6 h-6 text-sky-600" />
                {t('matrixStructurePeriodSummaryTitle', lang)}
              </CardTitle>
              <ReportPurposeNote purposeKey="reportPurpose_matrixStructurePeriodSummary" />
            </div>
            <ReportExportButtons onExcel={exportLeaderboardCsv} onPdf={exportLeaderboardPdf} />
          </div>
        </CardHeader>
        <CardBody className="space-y-5">
          {personFilterBanner}
          <p className="text-sm text-sky-900/90 dark:text-sky-100/90 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
            {t('matrixStructureScopeNote', lang)}
          </p>
          <p className="text-xs text-[var(--muted)]">{t('matrixStructureScoringRulesNote', lang)}</p>
          <p className="text-xs text-amber-800 dark:text-amber-300/90 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
            {t('matrixStructureVsLegacyNote', lang)}
          </p>

          {personFilterEmpty ? (
            <p className="text-sm text-[var(--muted)] rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/60 px-4 py-3">
              {t('matrixStructurePersonFilterEmpty', lang)}
            </p>
          ) : hasSelectedPersonScore ? (
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-[var(--foreground)]">{selectedPersonRow!.targetName}</div>
                  <div className="text-sm text-[var(--muted)]">{selectedPersonRow!.targetDept}</div>
                  {personRank != null && data ? (
                    <div className="text-xs text-[var(--muted)] mt-1">
                      {lang === 'en' ? 'Rank' : lang === 'fr' ? 'Rang' : 'Sıralama'}: {personRank} / {data.rankings.length}
                    </div>
                  ) : null}
                </div>
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                    {lang === 'en' ? 'Matrix score' : 'Matris yapı puanı'}
                  </div>
                  <Badge variant={scoreBadgeVariant(selectedPersonRow!.overallPeerAvg)} className="text-base px-3 py-1 mt-1">
                    {selectedPersonRow!.overallPeerAvg.toFixed(2)}
                  </Badge>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {selectedPersonRow!.answeredQuestionCount}{' '}
                    {lang === 'en' ? 'questions' : lang === 'fr' ? 'questions' : 'soru'}
                  </div>
                </div>
              </div>
            </div>
          ) : hasLeaderboard ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                  <TrendingUp className="w-5 h-5" />
                  <span className="font-semibold">
                    {lang === 'en' ? 'Highest matrix structure scores' : lang === 'fr' ? 'Scores matrice les plus élevés' : 'En yüksek matris yapı puanları'}
                    <span className="text-xs font-normal text-[var(--muted)] ml-1">
                      ({MATRIX_STRUCTURE_LEADERBOARD_SIZE})
                    </span>
                  </span>
                </div>
                <p className="text-[11px] text-[var(--muted)] mb-2 leading-snug">
                  {t('matrixStructureLeaderboardHint', lang)}
                </p>
                <ul className="space-y-2 text-sm">
                  {leaderboard.top.map((row, i) => (
                    <li
                      key={`ms-top-${row.targetId}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700">
                          {i + 1}
                        </span>
                        <span className="truncate font-medium text-[var(--foreground)]" title={row.targetName}>
                          {row.targetName}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.targetDept}>
                        {row.targetDept}
                      </span>
                      <Badge variant="success">{row.overallPeerAvg.toFixed(2)}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <div className="flex items-center gap-2 mb-3 text-rose-700 dark:text-rose-400">
                  <TrendingDown className="w-5 h-5" />
                  <span className="font-semibold">
                    {lang === 'en' ? 'Lowest matrix structure scores' : lang === 'fr' ? 'Scores matrice les plus bas' : 'En düşük matris yapı puanları'}
                    <span className="text-xs font-normal text-[var(--muted)] ml-1">
                      ({MATRIX_STRUCTURE_LEADERBOARD_SIZE})
                    </span>
                  </span>
                </div>
                <p className="text-[11px] text-[var(--muted)] mb-2 leading-snug">
                  {t('matrixStructureLeaderboardHint', lang)}
                </p>
                <ul className="space-y-2 text-sm">
                  {leaderboard.bottom.map((row, i) => (
                    <li
                      key={`ms-bottom-${row.targetId}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-xs font-bold text-rose-700">
                          {i + 1}
                        </span>
                        <span className="truncate font-medium text-[var(--foreground)]" title={row.targetName}>
                          {row.targetName}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.targetDept}>
                        {row.targetDept}
                      </span>
                      <Badge variant="danger">{row.overallPeerAvg.toFixed(2)}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)] rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/60 px-4 py-3">
              {t('exportNoData', lang)}
            </p>
          )}

          {(viewData.unscoredTargets?.length || 0) > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-500/20 font-semibold text-sm text-amber-950 dark:text-amber-100">
                {t('matrixStructureUnscoredTitle', lang)} ({viewData.unscoredTargets!.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-2)]/80">
                    <tr>
                      <th className="text-left py-2 px-4 font-semibold text-[var(--muted)]">
                        {lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'}
                      </th>
                      <th className="text-left py-2 px-4 font-semibold text-[var(--muted)]">
                        {lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}
                      </th>
                      <th className="text-left py-2 px-4 font-semibold text-[var(--muted)]">
                        {lang === 'en' ? 'Reason' : lang === 'fr' ? 'Motif' : 'Neden'}
                      </th>
                      <th className="text-center py-2 px-4 font-semibold text-[var(--muted)]">
                        {lang === 'en' ? 'Completed peer' : 'Tamamlanan ekip'}
                      </th>
                      <th className="text-center py-2 px-4 font-semibold text-[var(--muted)]">
                        {lang === 'en' ? 'Pending peer' : 'Bekleyen ekip'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/60">
                    {viewData.unscoredTargets!.map((row) => (
                      <tr key={row.targetId} className="hover:bg-[var(--surface-2)]/40">
                        <td className="py-2.5 px-4 font-medium text-[var(--foreground)]">{row.targetName}</td>
                        <td className="py-2.5 px-4 text-[var(--muted)]">{row.targetDept}</td>
                        <td className="py-2.5 px-4 text-[var(--foreground)]">{unscoredReasonLabel(row.reason, lang)}</td>
                        <td className="py-2.5 px-4 text-center">{row.completedPeerAssignments}</td>
                        <td className="py-2.5 px-4 text-center">{row.pendingPeerAssignments}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <details className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--foreground)]">
              {lang === 'en' ? 'Period scope details' : lang === 'fr' ? 'Détails du périmètre' : 'Dönem kapsam detayı'}
            </summary>
            <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: lang === 'en' ? 'Target people' : 'Hedef kişi', value: summary.targetCount },
                { label: lang === 'en' ? 'Scored people' : 'Puanlı kişi', value: summary.targetsWithScores },
                {
                  label: lang === 'en' ? 'Unscored people' : 'Puanlanamayan',
                  value: summary.unscoredCount ?? viewData.unscoredTargets?.length ?? 0,
                },
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
                <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{item.label}</div>
                  <div className="text-xl font-bold text-[var(--foreground)] mt-1">{item.value}</div>
                </div>
              ))}
            </div>
          </details>
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
          <div className="flex flex-wrap items-center gap-2">
            <ReportExportButtons onExcel={exportRankingsCsv} onPdf={exportPdf} />
            <Button variant="secondary" size="sm" onClick={exportQuestionDetailCsv} disabled={!viewData?.rankings.length}>
              <Download className="w-4 h-4" />
              {t('matrixStructureExportQuestionDetailExcel', lang)}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {personFilterBanner}
        <p className="text-sm text-sky-900/90 dark:text-sky-100/90 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
          {t('matrixStructureScopeNote', lang)}
        </p>
        <p className="text-xs text-[var(--muted)]">{t('matrixStructureScoringRulesNote', lang)}</p>

        {personFilterEmpty ? (
          <p className="text-sm text-[var(--muted)]">{t('matrixStructurePersonFilterEmpty', lang)}</p>
        ) : viewData.rankings.length === 0 ? (
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
                {viewData.rankings.map((row, idx) => (
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
                    <th className="text-center py-2 px-3">{lang === 'en' ? 'Avg (exact)' : 'Ort. (tam)'}</th>
                    <th className="text-center py-2 px-3">{lang === 'en' ? 'Avg' : 'Ort.'}</th>
                    <th className="text-center py-2 px-3">n</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/60">
                  {row.questions.map((q) => (
                    <tr key={q.questionId}>
                      <td className="py-1.5 px-3 text-[var(--muted)]">{q.categoryLabel}</td>
                      <td className="py-1.5 px-3 text-[var(--foreground)]">{q.questionText}</td>
                      <td className="py-1.5 px-3 text-center font-mono text-[10px] text-[var(--muted)]">
                        {q.peerAvgExact.toFixed(6)}
                      </td>
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
