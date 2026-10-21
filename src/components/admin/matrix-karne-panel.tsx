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
    }))
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
                      {lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark'}
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
                                    {qDiff === null
                                      ? '—'
                                      : `${qDiff > 0 ? '+' : ''}${qDiff.toFixed(2)}`}
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
                : 'Fark = Ekip − Öz. Soruları görmek için kategoriye tıklayın.'}
          </p>
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
