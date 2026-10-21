'use client'

import { Fragment, useCallback, useMemo, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useLang } from '@/components/i18n/language-context'
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, toast } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { MatrixPersonScoreCard } from '@/components/admin/matrix-person-score-card'
import { RadarCompare } from '@/components/charts/radar-compare'
import { BarCompare } from '@/components/charts/bar-compare'
import { matrixKarneCategoryChartRows } from '@/lib/matrix-karne-swot'
import { t } from '@/lib/i18n'
import type {
  MatrixKarneAssessmentGroup,
  MatrixKarnePayload,
  MatrixKarnePeriodSlice,
} from '@/lib/server/matrix-karne-build'

type Props = {
  data: MatrixKarnePayload
  onClose?: () => void
  embedded?: boolean
  showPeerDetail?: boolean
}

function SwotGrid({
  slice,
  lang,
}: {
  slice: MatrixKarnePeriodSlice
  lang: 'tr' | 'en' | 'fr'
}) {
  const { swot } = slice
  const empty =
    lang === 'en' ? 'Insufficient data' : lang === 'fr' ? 'Données insuffisantes' : 'Yeterli veri yok'

  const blocks = [
    {
      title: lang === 'en' ? 'Strengths' : lang === 'fr' ? 'Forces' : 'Güçlü yönler',
      items: swot.strengths,
      variant: 'success' as const,
    },
    {
      title: lang === 'en' ? 'Weaknesses' : lang === 'fr' ? 'Faiblesses' : 'Gelişim alanları',
      items: swot.weaknesses,
      variant: 'warning' as const,
    },
    {
      title: lang === 'en' ? 'Opportunities' : lang === 'fr' ? 'Opportunités' : 'Fırsatlar',
      items: swot.opportunities,
      variant: 'info' as const,
    },
    {
      title: lang === 'en' ? 'Threats / risks' : lang === 'fr' ? 'Risques' : 'Risk alanları',
      items: swot.threats,
      variant: 'danger' as const,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {blocks.map((block) => (
        <div key={block.title} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
          <div className="text-xs font-semibold text-[var(--muted)] mb-2">{block.title}</div>
          <div className="flex flex-wrap gap-1.5">
            {block.items.length ? (
              block.items.map((item) => (
                <Badge key={item.name} variant={block.variant}>
                  {item.name} ({item.score.toFixed(2)})
                </Badge>
              ))
            ) : (
              <span className="text-xs text-[var(--muted)]">{empty}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function SliceSection({
  slice,
  periodId,
  categoryColumns,
  lang,
  expandedKey,
  onToggle,
  aiLoadingKey,
  onAiSummary,
  aiText,
  showPeerDetail = false,
}: {
  slice: MatrixKarnePeriodSlice
  periodId: string
  categoryColumns: Array<{ key: string; label: string }>
  lang: 'tr' | 'en' | 'fr'
  expandedKey: string | null
  onToggle: (key: string) => void
  aiLoadingKey: string | null
  onAiSummary: (slice: MatrixKarnePeriodSlice, periodId: string) => void
  aiText?: string
  showPeerDetail?: boolean
}) {
  const sliceKey = `${periodId}:${slice.matrixContext}:${slice.score.targetId}`
  const selfMap = new Map(Object.entries(slice.selfCategoryByKey))
  const selfQuestionMap = new Map(Object.entries(slice.selfQuestionById || {}))
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({})
  const tableRows = slice.score.categories
    .filter(
      (c) => Number(c.peerAvg) > 0 || Number(selfMap.get(c.categoryKey) || 0) > 0
    )
    .map((c) => ({
      key: c.categoryKey,
      name: c.categoryLabel,
      self: Number(selfMap.get(c.categoryKey) || 0),
      peer: Number(c.peerAvg) || 0,
      trim: Number(c.peerAvgTrimmed) || 0,
      n: Number(slice.categoryStatsByKey?.[c.categoryKey]?.n || 0),
      noOpinion: Number(slice.categoryStatsByKey?.[c.categoryKey]?.noOpinion || 0),
    }))
  const selfOverallValues = Object.values(slice.selfQuestionById || {})
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)
  const selfOverall = selfOverallValues.length
    ? Math.round(
        (selfOverallValues.reduce((a, b) => a + b, 0) / selfOverallValues.length) * 100
      ) / 100
    : 0
  const peerOverall = Number(slice.score.overallPeerAvg) || 0
  const overallDiff =
    selfOverall > 0 && peerOverall > 0
      ? Math.round((peerOverall - selfOverall) * 100) / 100
      : null
  const peerScore100 = peerOverall > 0 ? Math.round((peerOverall / 5) * 10000) / 100 : 0
  const evaluatorAgg = new Map<string, { name: string; scores: number[] }>()
  for (const q of slice.score.questions) {
    for (const s of q.scorers || []) {
      const id = String(s.evaluatorId || '').trim()
      if (!id) continue
      const cur = evaluatorAgg.get(id) || { name: s.evaluatorName || '-', scores: [] }
      const v = Number(s.score)
      if (Number.isFinite(v) && v > 0) cur.scores.push(v)
      evaluatorAgg.set(id, cur)
    }
  }
  const evaluatorRows = [...evaluatorAgg.entries()]
    .map(([id, v]) => ({
      id,
      name: v.name,
      avg: v.scores.length
        ? Math.round((v.scores.reduce((a, b) => a + b, 0) / v.scores.length) * 100) / 100
        : 0,
      count: v.scores.length,
    }))
    .filter((e) => e.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  const chartRows = matrixKarneCategoryChartRows(slice.score.categories, selfMap)
  const expanded = expandedKey === sliceKey

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] p-4 bg-[var(--surface)]">
      <MatrixPersonScoreCard
        row={slice.score}
        showRank={false}
        categoryColumns={categoryColumns}
        expanded={expanded}
        onToggle={() => onToggle(sliceKey)}
        lang={lang}
        sectionLabel={slice.matrixContextLabel}
        nested
        showPeerDetail={showPeerDetail}
      />

      {peerOverall > 0 || selfOverall > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-3">
            <div className="text-xs text-[var(--muted)] mb-1">
              {lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz'}
            </div>
            <div className="text-xl font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
              {selfOverall > 0 ? selfOverall.toFixed(2) : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-3">
            <div className="text-xs text-[var(--muted)] mb-1">
              {lang === 'en' ? 'Team' : lang === 'fr' ? 'Équipe' : 'Ekip'}
            </div>
            <div className="text-xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {peerOverall > 0 ? peerOverall.toFixed(2) : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-3">
            <div className="text-xs text-[var(--muted)] mb-1">
              {lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark'}
            </div>
            <div
              className={`text-xl font-semibold tabular-nums ${
                overallDiff === null
                  ? ''
                  : overallDiff > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : overallDiff < 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : ''
              }`}
            >
              {overallDiff === null
                ? '—'
                : `${overallDiff > 0 ? '+' : ''}${overallDiff.toFixed(2)}`}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-3">
            <div className="text-xs text-[var(--muted)] mb-1">
              {lang === 'en' ? 'Trim (team)' : lang === 'fr' ? 'Trim (équipe)' : 'Trim (ekip)'}
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {Number(slice.score.overallPeerAvgTrimmed) > 0
                ? Number(slice.score.overallPeerAvgTrimmed).toFixed(2)
                : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 px-4 py-3">
            <div className="text-xs text-[var(--muted)] mb-1">
              {lang === 'en' ? 'Out of 100 (team)' : lang === 'fr' ? 'Sur 100 (équipe)' : "100'lük (ekip)"}
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {peerScore100 > 0 ? peerScore100.toFixed(2) : '—'}
            </div>
          </div>
        </div>
      ) : null}

      {chartRows.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-2)]/30 min-w-0 overflow-hidden">
            <div className="text-sm font-semibold mb-3">
              {lang === 'en' ? 'Radar (Self vs Team MATRIX)' : lang === 'fr' ? 'Radar (Auto vs Équipe MATRIX)' : 'Radar (Öz vs Ekip MATRIX)'}
            </div>
            <div className="w-full min-h-[360px]">
              <RadarCompare rows={chartRows} />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-2)]/30 min-w-0 overflow-hidden">
            <div className="text-sm font-semibold mb-3">
              {lang === 'en' ? 'Bar chart (Self vs Team MATRIX)' : lang === 'fr' ? 'Barres (Auto vs Équipe MATRIX)' : 'Bar grafik (Öz vs Ekip MATRIX)'}
            </div>
            <div className="w-full min-h-[340px] overflow-x-auto">
              <div className="min-w-[520px]">
                <BarCompare rows={chartRows} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tableRows.length > 0 ? (
        <div>
          <div className="text-sm font-semibold mb-2">
            {lang === 'en'
              ? 'Self vs Team comparison'
              : lang === 'fr'
                ? 'Comparaison Auto / Équipe'
                : 'Öz / Ekip karşılaştırması'}
          </div>
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-[var(--surface-2)]">
                  <tr className="text-left text-[var(--muted)]">
                    <th className="py-3 px-4 font-medium">
                      {lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori'}
                    </th>
                    <th className="py-3 px-4 font-medium text-right w-24">
                      {lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz'}
                    </th>
                    <th className="py-3 px-4 font-medium text-right w-24">
                      {lang === 'en' ? 'Team' : lang === 'fr' ? 'Équipe' : 'Ekip'}
                    </th>
                    <th className="py-3 px-4 font-medium text-right w-24">
                      {lang === 'en' ? 'Trim' : lang === 'fr' ? 'Trim' : 'Trim'}
                    </th>
                    <th className="py-3 px-4 font-medium text-right w-24">
                      {lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark'}
                    </th>
                    <th className="py-3 px-4 font-medium text-right w-16">n</th>
                    <th className="py-3 px-4 font-medium text-right w-16">
                      {lang === 'en' ? 'NO' : lang === 'fr' ? 'SA' : 'FY'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => {
                    const hasSelf = r.self > 0
                    const hasPeer = r.peer > 0
                    const diff = hasSelf && hasPeer ? r.peer - r.self : null
                    const isOpen = !!openCategories[r.key]
                    const catQuestions = slice.score.questions.filter(
                      (q) => q.categoryKey === r.key
                    )
                    return (
                      <Fragment key={r.key}>
                        <tr
                          className="border-t border-[var(--border)] cursor-pointer hover:bg-[var(--surface-2)]/40"
                          onClick={() =>
                            setOpenCategories((prev) => ({ ...prev, [r.key]: !prev[r.key] }))
                          }
                        >
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className={`text-[var(--muted)] transition-transform ${
                                  isOpen ? 'rotate-90' : ''
                                }`}
                                aria-hidden
                              >
                                ›
                              </span>
                              <span>{r.name}</span>
                              {catQuestions.length ? (
                                <span className="text-xs text-[var(--muted)]">
                                  ({catQuestions.length})
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums">
                            {hasSelf ? r.self.toFixed(2) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums">
                            {hasPeer ? r.peer.toFixed(2) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-[var(--muted)]">
                            {r.trim > 0 ? r.trim.toFixed(2) : '—'}
                          </td>
                          <td
                            className={`py-3 px-4 text-right tabular-nums ${
                              diff === null
                                ? ''
                                : diff > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : diff < 0
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : ''
                            }`}
                          >
                            {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-[var(--muted)]">
                            {r.n > 0 ? r.n : '—'}
                          </td>
                          <td
                            className={`py-3 px-4 text-right tabular-nums ${
                              r.noOpinion > 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-[var(--muted)]'
                            }`}
                          >
                            {r.noOpinion > 0 ? r.noOpinion : '—'}
                          </td>
                        </tr>
                        {isOpen
                          ? catQuestions.map((q) => {
                              const qSelf = Number(selfQuestionMap.get(q.questionId) || 0)
                              const qPeer = Number(q.peerAvg) || 0
                              const qDiff = qSelf > 0 && qPeer > 0 ? qPeer - qSelf : null
                              return (
                                <tr
                                  key={`${r.key}:${q.questionId}`}
                                  className="border-t border-[var(--border)] bg-[var(--surface-2)]/20"
                                >
                                  <td className="py-2 px-4 pl-10 text-[var(--muted)]">
                                    {q.questionText}
                                  </td>
                                  <td className="py-2 px-4 text-right tabular-nums text-[var(--muted)]">
                                    {qSelf > 0 ? qSelf.toFixed(2) : '—'}
                                  </td>
                                  <td className="py-2 px-4 text-right tabular-nums text-[var(--muted)]">
                                    {qPeer > 0 ? qPeer.toFixed(2) : '—'}
                                  </td>
                                  <td className="py-2 px-4 text-right tabular-nums text-[var(--muted)]">
                                    {Number(q.peerAvgTrimmed) > 0
                                      ? Number(q.peerAvgTrimmed).toFixed(2)
                                      : '—'}
                                  </td>
                                  <td className="py-2 px-4 text-right tabular-nums text-[var(--muted)]">
                                    {qDiff === null
                                      ? '—'
                                      : `${qDiff > 0 ? '+' : ''}${qDiff.toFixed(2)}`}
                                  </td>
                                  <td className="py-2 px-4 text-right tabular-nums text-[var(--muted)]">
                                    {Number(q.scorerCount) > 0 ? Number(q.scorerCount) : '—'}
                                  </td>
                                  <td className="py-2 px-4 text-right tabular-nums text-[var(--muted)]">
                                    —
                                  </td>
                                </tr>
                              )
                            })
                          : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {lang === 'en'
              ? 'Diff = Team − Self. Click a category to see its questions.'
              : lang === 'fr'
                ? 'Écart = Équipe − Auto. Cliquez sur une catégorie pour voir ses questions.'
                : 'Fark = Ekip − Öz. Trim: her soruda en düşük ve en yüksek cevap atılarak hesaplanır (soruda en az 3 puanlanabilir cevap varsa). n = kategoriyi puanlayan ekip değerlendiricisi sayısı, FY = «fikrim yok» cevap sayısı. Soruları görmek için kategoriye tıklayın.'}
          </p>
        </div>
      ) : null}

      {selfOverall > 0 || evaluatorRows.length > 0 ? (
        <div>
          <div className="text-sm font-semibold mb-2">
            {lang === 'en'
              ? 'Evaluators (level)'
              : lang === 'fr'
                ? 'Évaluateurs (niveau)'
                : 'Değerlendiriciler (düzey)'}
          </div>

          {selfOverall > 0 ? (
            <div className="mb-3">
              <div className="text-xs text-[var(--muted)] mb-1.5">
                {lang === 'en'
                  ? 'Self evaluation'
                  : lang === 'fr'
                    ? 'Auto-évaluation'
                    : 'Öz değerlendirme'}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 px-4 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" aria-hidden />
                  {lang === 'en'
                    ? 'Self evaluation'
                    : lang === 'fr'
                      ? 'Auto-évaluation'
                      : 'Öz Değerlendirme'}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {selfOverall.toFixed(2)}
                </span>
              </div>
            </div>
          ) : null}

          {evaluatorRows.length > 0 ? (
            <div>
              <div className="text-xs text-[var(--muted)] mb-1.5">
                {lang === 'en' ? 'Team' : lang === 'fr' ? 'Équipe' : 'Ekip'}
              </div>
              <div className="space-y-2">
                {showPeerDetail ? (
                  evaluatorRows.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 px-4 py-2.5"
                    >
                      <span className="inline-flex items-center gap-2 text-sm min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"
                          aria-hidden
                        />
                        <span className="truncate">{e.name}</span>
                        <span className="text-xs text-[var(--muted)] shrink-0">
                          ({e.count}{' '}
                          {lang === 'en' ? 'questions' : lang === 'fr' ? 'questions' : 'soru'})
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {e.avg.toFixed(2)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"
                        aria-hidden
                      />
                      {lang === 'en'
                        ? `Team evaluation (average of ${evaluatorRows.length} people)`
                        : lang === 'fr'
                          ? `Évaluation de l'équipe (moyenne de ${evaluatorRows.length} personnes)`
                          : `Ekip değerlendirmesi (${evaluatorRows.length} kişinin ortalaması)`}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {peerOverall > 0 ? peerOverall.toFixed(2) : '—'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="text-sm font-semibold mb-2">{t('matrixKarneSwotTitle', lang)}</div>
        <SwotGrid slice={slice} lang={lang} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={aiLoadingKey === sliceKey}
          onClick={() => onAiSummary(slice, periodId)}
        >
          {aiLoadingKey === sliceKey ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {t('matrixKarneAiSummaryButton', lang)}
        </Button>
      </div>

      {aiText ? (
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 text-sm">
          <div className="text-xs font-semibold text-violet-800 dark:text-violet-200 mb-1">
            {t('matrixKarneAiSummaryTitle', lang)}
          </div>
          <p className="text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{aiText}</p>
        </div>
      ) : null}
    </div>
  )
}

function AssessmentGroupColumn({
  group,
  lang,
  expandedKey,
  onToggle,
  aiLoadingKey,
  onAiSummary,
  aiTextByKey,
  showPeerDetail = false,
}: {
  group: MatrixKarneAssessmentGroup
  lang: 'tr' | 'en' | 'fr'
  expandedKey: string | null
  onToggle: (key: string) => void
  aiLoadingKey: string | null
  onAiSummary: (slice: MatrixKarnePeriodSlice, periodId: string) => void
  aiTextByKey: Record<string, string>
  showPeerDetail?: boolean
}) {
  const emptyMsg =
    lang === 'en'
      ? 'No released period with MATRIX data for this evaluation type.'
      : lang === 'fr'
        ? 'Aucune période publiée avec données MATRIX pour ce type.'
        : 'Bu değerlendirme türü için yayınlanmış dönemde MATRIX verisi yok.'

  return (
    <div className="rounded-2xl border border-[var(--border)] overflow-hidden w-full">
      <div className="px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)]">
        <div className="font-semibold text-lg text-[var(--foreground)]">{group.assessmentLabel}</div>
        <div className="text-xs text-[var(--muted)] mt-0.5">
          {group.periods.length}{' '}
          {lang === 'en' ? 'period(s) with MATRIX data' : lang === 'fr' ? 'période(s) avec données MATRIX' : 'dönem — MATRIX verisi'}
        </div>
      </div>
      <div className="p-4 sm:p-6 space-y-8">
        {!group.periods.length ? (
          <p className="text-sm text-[var(--muted)] text-center py-6">{emptyMsg}</p>
        ) : null}
        {group.periods.map((period) => (
          <div key={period.periodId} className="space-y-5 border-b border-[var(--border)]/60 pb-8 last:border-b-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-[var(--foreground)]">{period.periodName}</span>
              <Badge variant={period.assessmentKind === 'job_evaluation' ? 'warning' : 'info'}>
                {period.assessmentLabel}
              </Badge>
            </div>
            {period.core ? (
              <SliceSection
                slice={period.core}
                periodId={period.periodId}
                categoryColumns={period.categoryLabels}
                lang={lang}
                expandedKey={expandedKey}
                onToggle={onToggle}
                aiLoadingKey={aiLoadingKey}
                onAiSummary={onAiSummary}
                aiText={aiTextByKey[`${period.periodId}:${period.core.matrixContext}:${period.core.score.targetId}`]}
                showPeerDetail={showPeerDetail}
              />
            ) : null}
            {period.dutySlices.map((slice) => {
              const sliceKey = `${period.periodId}:${slice.matrixContext}:${slice.score.targetId}`
              return (
                <SliceSection
                  key={`${period.periodId}-${slice.matrixContext}`}
                  slice={slice}
                  periodId={period.periodId}
                  categoryColumns={period.categoryLabels}
                  lang={lang}
                  expandedKey={expandedKey}
                  onToggle={onToggle}
                  aiLoadingKey={aiLoadingKey}
                  onAiSummary={onAiSummary}
                  aiText={aiTextByKey[sliceKey]}
                  showPeerDetail={showPeerDetail}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MatrixKarnePanel({ data, onClose, embedded = false, showPeerDetail = false }: Props) {
  const rawLang = useLang()
  const lang = rawLang === 'fr' ? 'fr' : rawLang === 'en' ? 'en' : 'tr'
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [aiLoadingKey, setAiLoadingKey] = useState<string | null>(null)
  const [aiTextByKey, setAiTextByKey] = useState<Record<string, string>>({})

  const dutyLabels = useMemo(() => data.person.dutyNames, [data.person.dutyNames])
  const hasKarneData = useMemo(
    () => data.assessmentGroups.some((g) => g.periods.length > 0),
    [data.assessmentGroups]
  )

  const onAiSummary = useCallback(
    async (slice: MatrixKarnePeriodSlice, periodId: string) => {
      const key = `${periodId}:${slice.matrixContext}:${slice.score.targetId}`
      setAiLoadingKey(key)
      try {
        const resp = await fetch(`/api/admin/results/ai-explain?lang=${lang}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataScope:
              lang === 'en'
                ? `MATRIX report card — ${slice.matrixContextLabel} (question-based team scores)`
                : lang === 'fr'
                  ? `KARNE MATRIX — ${slice.matrixContextLabel}`
                  : `KARNE MATRIX — ${slice.matrixContextLabel} (soru bazlı ekip puanları)`,
            person: {
              name: data.person.name,
              department: data.person.department,
              teamScore: slice.score.overallPeerAvg,
              overallScore: slice.score.overallPeerAvg,
              swotPeerStrengths: slice.swot.strengths.map((x) => x.name),
              swotPeerWeaknesses: slice.swot.weaknesses.map((x) => x.name),
            },
          }),
        })
        const payload = (await resp.json().catch(() => ({}))) as {
          success?: boolean
          ai?: { summary?: string; oneLiner?: string; nextSteps?: string[] }
          error?: string
        }
        if (!resp.ok || !payload.success) throw new Error(payload.error || 'AI özeti alınamadı')
        const parts = [
          payload.ai?.oneLiner,
          payload.ai?.summary,
          payload.ai?.nextSteps?.length ? payload.ai.nextSteps.map((s) => `• ${s}`).join('\n') : '',
        ].filter(Boolean)
        setAiTextByKey((prev) => ({ ...prev, [key]: parts.join('\n\n') }))
      } catch (e: unknown) {
        toast(e instanceof Error ? e.message : 'AI özeti alınamadı', 'error')
      } finally {
        setAiLoadingKey(null)
      }
    },
    [data.person.department, data.person.name, lang]
  )

  return (
    <Card className={embedded ? 'border-[var(--border)]' : 'mb-0 shadow-2xl'}>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 w-full">
          <div className="min-w-0">
            <CardTitle>{t('matrixKarneTitle', lang)}</CardTitle>
            <ReportPurposeNote purposeKey="reportPurpose_karne" />
            <div className="text-sm text-[var(--muted)] mt-1">
              {data.person.name}
              {data.person.department ? ` • ${data.person.department}` : ''}
              {data.person.title ? ` • ${data.person.title}` : ''}
            </div>
            {dutyLabels.length ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {dutyLabels.map((name) => (
                  <Badge key={name} variant="default">
                    {name}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface)]"
            >
              {lang === 'en' ? 'Close' : lang === 'fr' ? 'Fermer' : 'Kapat'}
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardBody>
        {!hasKarneData ? (
          <p className="text-sm text-[var(--muted)] text-center py-8">{t('matrixKarneEmpty', lang)}</p>
        ) : (
          <div className="space-y-8">
            {data.assessmentGroups.map((group) => (
              <AssessmentGroupColumn
                key={group.assessmentKind}
                group={group}
                lang={lang}
                expandedKey={expandedKey}
                onToggle={(key) => setExpandedKey((cur) => (cur === key ? null : key))}
                aiLoadingKey={aiLoadingKey}
                onAiSummary={onAiSummary}
                aiTextByKey={aiTextByKey}
                showPeerDetail={showPeerDetail}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
