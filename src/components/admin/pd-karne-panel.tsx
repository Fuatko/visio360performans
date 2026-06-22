'use client'

import { useCallback, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useLang } from '@/components/i18n/language-context'
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, toast } from '@/components/ui'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { RadarCompare } from '@/components/charts/radar-compare'
import { BarCompare } from '@/components/charts/bar-compare'
import {
  groupPersonEvaluationsByPositionLevel,
  personalDevelopmentReportSectionLabel,
} from '@/lib/admin-person-results-sections'
import { positionLevelLabel } from '@/lib/server/evaluator-answer-detail'
import { t } from '@/lib/i18n'

export type PdKarneEvaluation = {
  evaluatorId?: string
  evaluatorName?: string
  isSelf?: boolean
  evaluatorLevel?: string
  evaluatorWeight?: number
  avgScore?: number
  hasScorableResponses?: boolean
  categories?: Array<{ name: string; score: number }>
}

export type PdKarnePeriodResult = {
  periodId: string
  periodName: string
  targetName: string
  targetDept?: string
  selfScore: number
  peerAvg: number
  overallAvg: number
  peerAvgTrimmed?: number
  overallAvgTrimmed?: number
  peerAvgTrimmedGeneral?: number
  overallAvgTrimmedGeneral?: number
  peerTrimEligible?: boolean
  peerTrimGeneralEligible?: boolean
  score100?: number | null
  score100Trimmed?: number | null
  score100TrimmedGeneral?: number | null
  standardAvg?: number
  peerEvaluatorCountForTrim?: number
  categoryCompare: Array<{
    name: string
    self: number
    peer: number
    diff: number
    peerTrimmed?: number
    peerTrimmedGeneral?: number
  }>
  swot?: {
    peer: {
      strengths: Array<{ name: string; score: number }>
      weaknesses: Array<{ name: string; score: number }>
    }
  }
  evaluations?: PdKarneEvaluation[]
  evaluationsAll?: PdKarneEvaluation[]
}

export type PdKarnePayload = {
  person: { name: string; department?: string; title?: string }
  periods: PdKarnePeriodResult[]
}

function scoreColorClass(score: number) {
  if (score >= 4) return 'text-emerald-600'
  if (score >= 3) return 'text-blue-600'
  if (score >= 2) return 'text-amber-600'
  return 'text-red-600'
}

function PeriodBlock({
  block,
  lang,
  showPeerDetail,
  personName,
  personDept,
}: {
  block: PdKarnePeriodResult
  lang: 'tr' | 'en' | 'fr'
  showPeerDetail: boolean
  personName: string
  personDept?: string
}) {
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const evalsForDetail =
    showPeerDetail && (block.evaluationsAll?.length || 0) > 0
      ? block.evaluationsAll!
      : block.evaluations || []
  const byLevel = groupPersonEvaluationsByPositionLevel(evalsForDetail)

  const onAiSummary = useCallback(async () => {
    setAiLoading(true)
    try {
      const resp = await fetch(`/api/admin/results/ai-explain?lang=${lang}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataScope:
            lang === 'en'
              ? 'Personal development 360 report card'
              : lang === 'fr'
                ? 'KARNE développement personnel 360'
                : 'Kişisel Gelişim 360 karnesi',
          person: {
            name: personName,
            department: personDept,
            teamScore: block.peerAvg,
            overallScore: block.overallAvg,
            swotPeerStrengths: (block.swot?.peer?.strengths || []).map((x) => x.name),
            swotPeerWeaknesses: (block.swot?.peer?.weaknesses || []).map((x) => x.name),
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
  }, [block, lang, personDept, personName])

  const chartRows = block.categoryCompare.map((c) => ({
    name: c.name,
    self: c.self || 0,
    peer: c.peer || 0,
  }))

  const renderEvalCard = (ev: PdKarneEvaluation, idx: number, kind: 'self' | 'team') => (
    <div
      key={`${kind}-${String(ev.evaluatorId)}-${idx}`}
      className={`bg-[var(--surface)] p-3 rounded-xl border ${
        ev.isSelf ? 'border-[var(--brand)]/40 bg-[var(--brand-soft)]' : 'border-[var(--border)]'
      }`}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-sm font-medium text-[var(--foreground)] min-w-0">
          {ev.isSelf ? t('selfEvaluationLabel', lang) : ev.evaluatorName}
        </span>
        {ev.hasScorableResponses === false ? (
          <Badge variant="gray">—</Badge>
        ) : (
          <Badge variant="info">{Number(ev.avgScore || 0).toFixed(2)}</Badge>
        )}
      </div>
      {!ev.isSelf && ev.evaluatorLevel ? (
        <div className="text-[11px] text-[var(--muted)] mb-1">
          <strong className="text-[var(--foreground)]">
            {positionLevelLabel(String(ev.evaluatorLevel), lang)}
          </strong>
          {ev.evaluatorWeight != null ? (
            <span>
              {' '}
              · {lang === 'en' ? 'Weight' : lang === 'fr' ? 'Poids' : 'Katsayı'}:{' '}
              <strong className="text-[var(--foreground)]">{ev.evaluatorWeight}</strong>
            </span>
          ) : null}
        </div>
      ) : null}
      {showPeerDetail && ev.categories && ev.categories.length > 0 ? (
        <div className="mt-2 space-y-0.5">
          {ev.categories.slice(0, 6).map((c) => (
            <div key={c.name} className="text-[11px] flex justify-between gap-2 text-[var(--muted)]">
              <span className="truncate">{c.name}</span>
              <span className="font-semibold text-[var(--foreground)]">{Number(c.score).toFixed(2)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-5 rounded-2xl border border-[var(--brand)]/25 bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-lg text-[var(--foreground)]">{block.periodName}</div>
          <Badge variant="info" className="mt-1">
            {personalDevelopmentReportSectionLabel(lang)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
        <MetricBox label={t('selfShort', lang)} value={block.selfScore} />
        <MetricBox label={t('teamShort', lang)} value={block.peerAvg} />
        <MetricBox
          label={t('reportTrimRulesColumn', lang)}
          value={
            block.peerTrimEligible && Number(block.peerAvgTrimmed || 0) > 0
              ? Number(block.peerAvgTrimmed)
              : null
          }
          hint={t('reportTrimRulesHint', lang)}
        />
        <MetricBox
          label={t('reportTrimGeneralColumn', lang)}
          value={
            block.peerTrimGeneralEligible && Number(block.peerAvgTrimmedGeneral || 0) > 0
              ? Number(block.peerAvgTrimmedGeneral)
              : null
          }
          hint={t('reportTrimGeneralHint', lang)}
        />
        <MetricBox label={t('overallShort', lang)} value={block.overallAvg} emphasize />
        <MetricBox
          label={lang === 'en' ? '/100' : "100'lük"}
          value={block.score100 != null ? block.score100 : null}
        />
      </div>

      {chartRows.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-2)]/30 min-h-[320px]">
            <div className="text-sm font-semibold mb-3">{t('radarCompare', lang)}</div>
            <RadarCompare rows={chartRows} selfLabel={t('selfShort', lang)} peerLabel={t('teamShort', lang)} />
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-2)]/30 min-h-[320px]">
            <div className="text-sm font-semibold mb-3">{t('barCompare', lang)}</div>
            <BarCompare rows={chartRows} selfLabel={t('selfShort', lang)} peerLabel={t('teamShort', lang)} />
          </div>
        </div>
      ) : null}

      {block.categoryCompare.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                  {lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori'}
                </th>
                <th className="text-center py-2 px-3 font-semibold text-[var(--muted)]">{t('selfShort', lang)}</th>
                <th className="text-center py-2 px-3 font-semibold text-[var(--muted)]">{t('teamShort', lang)}</th>
                <th className="text-center py-2 px-3 font-semibold text-[var(--muted)]" title={t('reportTrimRulesHint', lang)}>
                  {t('reportTrimRulesColumn', lang)}
                </th>
                <th className="text-center py-2 px-3 font-semibold text-[var(--muted)]" title={t('reportTrimGeneralHint', lang)}>
                  {t('reportTrimGeneralColumn', lang)}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {block.categoryCompare.map((c) => (
                <tr key={c.name}>
                  <td className="py-2 px-3 font-medium">{c.name}</td>
                  <td className="py-2 px-3 text-center">{c.self > 0 ? c.self.toFixed(2) : '—'}</td>
                  <td className="py-2 px-3 text-center">{c.peer > 0 ? c.peer.toFixed(2) : '—'}</td>
                  <td className="py-2 px-3 text-center">
                    {c.peerTrimmed && c.peerTrimmed > 0 ? c.peerTrimmed.toFixed(2) : '—'}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {c.peerTrimmedGeneral && c.peerTrimmedGeneral > 0 ? c.peerTrimmedGeneral.toFixed(2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {evalsForDetail.length > 0 ? (
        <div className="space-y-4">
          <div className="text-sm font-semibold text-[var(--foreground)]">
            {lang === 'en' ? 'Evaluators by level' : lang === 'fr' ? 'Évaluateurs par niveau' : 'Değerlendiriciler (düzey)'}
          </div>
          {byLevel.selfEvals.length > 0 ? (
            <div>
              <h6 className="text-sm font-semibold mb-2">{t('evaluationSectionSelf', lang)}</h6>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {byLevel.selfEvals.map((ev, idx) => renderEvalCard(ev, idx, 'self'))}
              </div>
            </div>
          ) : null}
          {byLevel.teamGroups.map((group) => (
            <div key={group.level}>
              <h6 className="text-sm font-semibold mb-2">{positionLevelLabel(group.level, lang)}</h6>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.evaluations.map((ev, idx) => renderEvalCard(ev, idx, 'team'))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <div className="text-sm font-semibold mb-2">{t('matrixKarneSwotTitle', lang)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SwotList
            title={lang === 'en' ? 'Strengths' : lang === 'fr' ? 'Forces' : 'Güçlü yönler'}
            items={block.swot?.peer?.strengths || []}
            variant="success"
          />
          <SwotList
            title={lang === 'en' ? 'Development areas' : lang === 'fr' ? 'Axes de progrès' : 'Gelişim alanları'}
            items={block.swot?.peer?.weaknesses || []}
            variant="warning"
          />
        </div>
      </div>

      <Button type="button" variant="secondary" size="sm" disabled={aiLoading} onClick={() => void onAiSummary()}>
        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {t('matrixKarneAiSummaryButton', lang)}
      </Button>

      {aiText ? (
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 text-sm whitespace-pre-wrap">
          {aiText}
        </div>
      ) : null}
    </div>
  )
}

function MetricBox({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string
  value: number | null
  hint?: string
  emphasize?: boolean
}) {
  const display = value != null && Number.isFinite(value) && value > 0 ? value.toFixed(2) : '—'
  return (
    <div className="rounded-lg bg-[var(--surface-2)] p-2.5 border border-[var(--border)]/60" title={hint}>
      <div className="text-[10px] text-[var(--muted)] leading-tight">{label}</div>
      <div
        className={`font-bold text-base mt-0.5 ${
          display !== '—' ? (emphasize ? 'text-[var(--brand)]' : scoreColorClass(Number(value))) : 'text-[var(--muted)]'
        }`}
      >
        {display}
      </div>
    </div>
  )
}

function SwotList({
  title,
  items,
  variant,
}: {
  title: string
  items: Array<{ name: string; score: number }>
  variant: 'success' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
      <div className="text-xs font-semibold text-[var(--muted)] mb-2">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.length ? (
          items.map((item) => (
            <Badge key={item.name} variant={variant}>
              {item.name} ({item.score.toFixed(2)})
            </Badge>
          ))
        ) : (
          <span className="text-xs text-[var(--muted)]">—</span>
        )}
      </div>
    </div>
  )
}

export function PdKarnePanel({
  data,
  onClose,
  embedded = false,
  showPeerDetail = false,
}: {
  data: PdKarnePayload
  onClose?: () => void
  embedded?: boolean
  showPeerDetail?: boolean
}) {
  const rawLang = useLang()
  const lang = rawLang === 'fr' ? 'fr' : rawLang === 'en' ? 'en' : 'tr'

  return (
    <Card className={embedded ? 'border-[var(--border)]' : 'mb-0 shadow-2xl'}>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 w-full">
          <div className="min-w-0">
            <CardTitle>{t('pdKarneTitle', lang)}</CardTitle>
            <ReportPurposeNote purposeKey="reportPurpose_karne" />
            <div className="text-sm text-[var(--muted)] mt-1">
              {data.person.name}
              {data.person.department ? ` • ${data.person.department}` : ''}
              {data.person.title ? ` • ${data.person.title}` : ''}
            </div>
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
        {!data.periods.length ? (
          <p className="text-sm text-[var(--muted)] text-center py-8">{t('pdKarneEmpty', lang)}</p>
        ) : (
          <div className="space-y-6">
            {data.periods.map((block) => (
              <PeriodBlock
                key={block.periodId}
                block={block}
                lang={lang}
                showPeerDetail={showPeerDetail}
                personName={data.person.name}
                personDept={data.person.department}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
