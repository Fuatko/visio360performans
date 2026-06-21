'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Badge, Button, toast } from '@/components/ui'
import { MatrixPersonScoreCard } from '@/components/admin/matrix-person-score-card'
import { RadarCompare } from '@/components/charts/radar-compare'
import { BarCompare } from '@/components/charts/bar-compare'
import { BarPeerBenchmark } from '@/components/charts/bar-peer-benchmark'
import { BarPeerRanking } from '@/components/charts/bar-peer-ranking'
import { buildMatrixKarneSwot, matrixKarneCategoryChartRows } from '@/lib/matrix-karne-swot'
import type { OrgPeerBenchmark } from '@/lib/matrix-person-results-peer-compare'
import { t } from '@/lib/i18n'
import type { MatrixStructurePersonScore } from '@/lib/server/matrix-structure-scoring'

type Lang = 'tr' | 'en' | 'fr'

function SwotGrid({
  categories,
  lang,
}: {
  categories: MatrixStructurePersonScore['categories']
  lang: Lang
}) {
  const swot = buildMatrixKarneSwot(categories)
  const empty =
    lang === 'en' ? 'Insufficient data' : lang === 'fr' ? 'Données insuffisantes' : 'Yeterli veri yok'

  const blocks = [
    { title: lang === 'en' ? 'Strengths' : lang === 'fr' ? 'Forces' : 'Güçlü yönler', items: swot.strengths, variant: 'success' as const },
    { title: lang === 'en' ? 'Weaknesses' : lang === 'fr' ? 'Faiblesses' : 'Gelişim alanları', items: swot.weaknesses, variant: 'warning' as const },
    { title: lang === 'en' ? 'Opportunities' : lang === 'fr' ? 'Opportunités' : 'Fırsatlar', items: swot.opportunities, variant: 'info' as const },
    { title: lang === 'en' ? 'Threats / risks' : lang === 'fr' ? 'Risques' : 'Risk alanları', items: swot.threats, variant: 'danger' as const },
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

type Props = {
  sectionLabel: string
  score: MatrixStructurePersonScore
  selfCategoryByKey: Record<string, number>
  categoryColumns: Array<{ key: string; label: string }>
  benchmark: OrgPeerBenchmark | null
  personName: string
  personDept: string
  questionsExpanded: boolean
  onToggleQuestions: () => void
  lang: Lang
  showPeerDetail?: boolean
}

export function MatrixPersonSliceKarneDetail({
  sectionLabel,
  score,
  selfCategoryByKey,
  categoryColumns,
  benchmark,
  personName,
  personDept,
  questionsExpanded,
  onToggleQuestions,
  lang,
  showPeerDetail = false,
}: Props) {
  const [aiLoading, setAiLoading] = useState(false)
  const [aiText, setAiText] = useState<string | null>(null)

  const selfMap = new Map(Object.entries(selfCategoryByKey))
  const selfTeamRows = matrixKarneCategoryChartRows(score.categories, selfMap)
  const swot = buildMatrixKarneSwot(score.categories)

  const onAiSummary = async () => {
    setAiLoading(true)
    try {
      const resp = await fetch(`/api/admin/results/ai-explain?lang=${lang}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataScope:
            lang === 'en'
              ? `MATRIX person report — ${sectionLabel}`
              : `MATRIX kişi raporu — ${sectionLabel} (soru bazlı ekip puanları)`,
          person: {
            name: personName,
            department: personDept,
            teamScore: score.overallPeerAvg,
            overallScore: score.overallPeerAvg,
            swotPeerStrengths: swot.strengths.map((x) => x.name),
            swotPeerWeaknesses: swot.weaknesses.map((x) => x.name),
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
      setAiText(parts.join('\n\n'))
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'AI özeti alınamadı', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  const personLabel = lang === 'en' ? 'This person' : lang === 'fr' ? 'Cette personne' : 'Bu kişi'
  const orgLabel = lang === 'en' ? 'Org. average' : lang === 'fr' ? 'Moy. org.' : 'Kurum ort.'

  return (
    <div className="space-y-5">
      <MatrixPersonScoreCard
        row={score}
        showRank={false}
        sectionLabel={sectionLabel}
        categoryColumns={categoryColumns}
        expanded={questionsExpanded}
        onToggle={onToggleQuestions}
        lang={lang}
        nested
        showPeerDetail={showPeerDetail}
      />

      {selfTeamRows.length > 0 ? (
        <div className="space-y-4 rounded-2xl border border-[var(--border)] p-4 bg-[var(--surface)]">
          <div className="text-sm font-semibold text-[var(--foreground)]">
            {t('matrixPersonKarneSelfTeamCharts', lang)}
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-2)]/30 min-w-0 overflow-hidden">
            <div className="text-xs font-medium text-[var(--muted)] mb-2">{t('matrixPersonKarneRadar', lang)}</div>
            <div className="w-full min-h-[360px]">
              <RadarCompare rows={selfTeamRows} />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-2)]/30 min-w-0 overflow-hidden">
            <div className="text-xs font-medium text-[var(--muted)] mb-2">{t('matrixPersonKarneBarSelfTeam', lang)}</div>
            <div className="w-full min-h-[340px] overflow-x-auto">
              <div className="min-w-[520px]">
                <BarCompare rows={selfTeamRows} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {benchmark && benchmark.rankingRows.length > 1 ? (
        <div className="space-y-4 rounded-2xl border border-[var(--border)] p-4 bg-[var(--surface)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[var(--foreground)]">
              {t('matrixPersonKarnePeerCompare', lang)}
            </div>
            <Badge variant="info">
              #{benchmark.rank} / {benchmark.total}
              {benchmark.orgAvgOverall > 0
                ? ` • ${lang === 'en' ? 'Org avg' : lang === 'fr' ? 'Moy.' : 'Kurum ort.'} ${benchmark.orgAvgOverall.toFixed(2)}`
                : ''}
            </Badge>
          </div>
          {benchmark.categoryRows.length > 0 ? (
            <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-2)]/30 overflow-x-auto">
              <div className="text-xs font-medium text-[var(--muted)] mb-2">
                {t('matrixPersonKarneCategoryVsOrg', lang)}
              </div>
              <div className="min-w-[520px]">
                <BarPeerBenchmark rows={benchmark.categoryRows} personLabel={personLabel} orgLabel={orgLabel} />
              </div>
            </div>
          ) : null}
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-2)]/30">
            <div className="text-xs font-medium text-[var(--muted)] mb-2">
              {t('matrixPersonKarneRankingChart', lang)}
            </div>
            <BarPeerRanking rows={benchmark.rankingRows} title={t('matrixPersonKarneRankingChart', lang)} />
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[var(--border)] p-4 bg-[var(--surface)]">
        <div className="text-sm font-semibold mb-3">{t('matrixKarneSwotTitle', lang)}</div>
        <SwotGrid categories={score.categories} lang={lang} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={aiLoading} onClick={() => void onAiSummary()}>
          {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {t('matrixKarneAiSummaryButton', lang)}
        </Button>
      </div>

      {aiText ? (
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 text-sm">
          <div className="text-xs font-semibold text-violet-800 dark:text-violet-200 mb-1">
            {t('matrixKarneAiSummaryTitle', lang)} — {sectionLabel}
          </div>
          <p className="text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{aiText}</p>
        </div>
      ) : null}
    </div>
  )
}
