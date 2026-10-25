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
  MatrixKarnePeriodBlock,
  MatrixKarnePeriodSlice,
} from '@/lib/server/matrix-karne-build'

type Props = {
  data: MatrixKarnePayload
  onClose?: () => void
  embedded?: boolean
  showPeerDetail?: boolean
}

/**
 * Bir dönem bloğunun özet değerleri. Kişinin birden çok dilimi (core + kadro)
 * olabilir; puanlar cevaplanan soru sayısına göre ağırlıklı ortalanır.
 * Soru ve değerlendirici sayıları, iki dönemin karşılaştırılabilir olup
 * olmadığını okuyana göstermek için taşınır.
 */
function periodBlockStats(block: MatrixKarnePeriodBlock) {
  const slices = [block.core, ...block.dutySlices].filter(Boolean) as MatrixKarnePeriodSlice[]
  let w = 0
  let peer = 0
  let trim = 0
  let self = 0
  let selfW = 0
  let questions = 0
  const evaluators = new Set<string>()
  for (const s of slices) {
    const weight = Math.max(1, s.score.answeredQuestionCount || 0)
    w += weight
    peer += (s.score.overallPeerAvg || 0) * weight
    trim += (s.score.overallPeerAvgTrimmed || s.score.overallPeerAvg || 0) * weight
    questions += s.score.answeredQuestionCount || 0
    for (const q of s.score.questions || []) {
      for (const sc of q.scorers || []) {
        if (sc?.evaluatorId) evaluators.add(String(sc.evaluatorId))
      }
    }
    const selfVals = Object.values(s.selfCategoryByKey || {}).filter(
      (v) => typeof v === 'number' && Number.isFinite(v) && v > 0
    ) as number[]
    if (selfVals.length) {
      self += (selfVals.reduce((a, b) => a + b, 0) / selfVals.length) * weight
      selfW += weight
    }
  }
  if (!w) return null
  return {
    peer: peer / w,
    trim: trim / w,
    self: selfW ? self / selfW : null,
    questions,
    evaluators: evaluators.size,
  }
}

function fmtScore(n: number | null | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : '—'
}

function TrendDelta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur == null || prev == null) return null
  const d = cur - prev
  if (Math.abs(d) < 0.005) return <span className="text-xs text-[var(--muted)] ml-1">→ 0.00</span>
  return (
    <span className={`text-xs ml-1 ${d > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(2)}
    </span>
  )
}

function TrendSwotBox({
  title,
  tone,
  items,
  emptyText,
}: {
  title: string
  tone: 'good' | 'bad' | 'up' | 'down'
  items: Array<{ label: string; detail: string }>
  emptyText: string
}) {
  const ring =
    tone === 'good'
      ? 'border-emerald-500/40'
      : tone === 'up'
        ? 'border-sky-500/40'
        : tone === 'down'
          ? 'border-rose-500/40'
          : 'border-amber-500/40'
  return (
    <div className={`rounded-xl border ${ring} p-3`}>
      <div className="text-sm font-semibold text-[var(--foreground)] mb-2">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">{emptyText}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.label} className="text-xs text-[var(--foreground)]">
              {it.label} <span className="text-[var(--muted)]">{it.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Dönem karşılaştırma özeti. Yalnız aynı değerlendirme türü içinde kurulur;
 * farklı türlerin puanları aynı ölçekte değildir.
 */
function PeriodTrendSummary({
  group,
  lang,
}: {
  group: MatrixKarneAssessmentGroup
  lang: 'tr' | 'en' | 'fr'
}) {
  // Eskiden yeniye: soldan sağa okununca gidişat görünür.
  const ordered = [...group.periods].reverse()
  const stats = ordered.map((b) => periodBlockStats(b))
  if (stats.filter(Boolean).length < 2) return null

  const L = (tr: string, en: string, fr: string) => (lang === 'en' ? en : lang === 'fr' ? fr : tr)

  // Kategoriler dönemler arasında anahtar değiştirebildiği için etikete göre eşleşir.
  const catLabels: string[] = []
  const seen = new Set<string>()
  const catByPeriod = ordered.map((b) => {
    const m = new Map<string, number>()
    const slices = [b.core, ...b.dutySlices].filter(Boolean) as MatrixKarnePeriodSlice[]
    for (const s of slices) {
      for (const c of s.score.categories || []) {
        const label = String(c.categoryLabel || '').trim()
        if (!label) continue
        const k = label.toLocaleLowerCase('tr')
        if (!seen.has(k)) {
          seen.add(k)
          catLabels.push(label)
        }
        if (Number.isFinite(c.peerAvg) && c.peerAvg > 0) m.set(k, c.peerAvg)
      }
    }
    return m
  })

  const scoreRows: Array<{ label: string; values: Array<number | null> }> = [
    { label: L('Ekip ortalaması', 'Team average', 'Moyenne équipe'), values: stats.map((s) => s?.peer ?? null) },
    { label: L('Trim (kırpılmış)', 'Trimmed mean', 'Moyenne élaguée'), values: stats.map((s) => s?.trim ?? null) },
    { label: L('Öz değerlendirme', 'Self-assessment', 'Auto-évaluation'), values: stats.map((s) => s?.self ?? null) },
  ]

  // Karşılaştırılabilirlik: taban değiştiyse puan farkı tek başına anlam taşımaz.
  const qCounts = stats.map((s) => s?.questions ?? 0).filter((n) => n > 0)
  const baseShifted =
    qCounts.length >= 2 && Math.min(...qCounts) > 0 && Math.max(...qCounts) / Math.min(...qCounts) >= 1.25

  // --- Yıllar içindeki değişim ---
  const RISE = 0.25
  const HIGH = 4.0
  const LOW = 3.5

  type TrendCat = {
    label: string
    first: number
    last: number
    delta: number | null
    min: number
    max: number
    /** Kaç dönemde ölçüldü. 1 ise trend yorumu yapılamaz. */
    n: number
  }
  const trendCats: TrendCat[] = []
  for (const label of catLabels) {
    const k = label.toLocaleLowerCase('tr')
    const vals = catByPeriod
      .map((m) => (m.has(k) ? (m.get(k) as number) : null))
      .filter((v): v is number => v != null)
    if (!vals.length) continue
    trendCats.push({
      label,
      first: vals[0],
      last: vals[vals.length - 1],
      delta: vals.length >= 2 ? vals[vals.length - 1] - vals[0] : null,
      min: Math.min(...vals),
      max: Math.max(...vals),
      n: vals.length,
    })
  }

  const falling = trendCats.filter((c) => c.delta != null && c.delta <= -RISE)
  const rising = trendCats.filter((c) => c.delta != null && c.delta >= RISE)
  const moved = new Set([...falling, ...rising].map((c) => c.label))
  const strong = trendCats.filter((c) => !moved.has(c.label) && c.min >= HIGH)
  const weak = trendCats.filter((c) => !moved.has(c.label) && c.max < LOW)

  // Tek dönemde ölçülen kategoride süreklilik iddiası yapılamaz, işaretlenir.
  const swotDetail = (c: TrendCat) =>
    c.n < 2
      ? `${c.last.toFixed(2)} · ${L('tek dönem', 'single period', 'période unique')}`
      : c.last.toFixed(2)

  const arrow = (c: TrendCat) =>
    `${(c.delta as number) > 0 ? '+' : '−'}${Math.abs(c.delta as number).toFixed(2)} (${c.first.toFixed(2)} → ${c.last.toFixed(2)})`

  const overallFirst = stats.find((s) => s)?.peer ?? null
  const overallLast = [...stats].reverse().find((s) => s)?.peer ?? null
  const overallDelta =
    overallFirst != null && overallLast != null ? overallLast - overallFirst : null

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="px-3 py-2 bg-[var(--surface-2)] border-b border-[var(--border)] text-sm font-semibold text-[var(--foreground)]">
          {L('Dönem karşılaştırma özeti', 'Period comparison summary', 'Résumé comparatif des périodes')}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{L('Ölçüt', 'Metric', 'Indicateur')}</th>
                {ordered.map((b) => (
                  <th key={b.periodId} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    {b.periodName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {scoreRows.map((r) => (
                <tr key={r.label}>
                  <td className="px-3 py-2 text-[var(--muted)] whitespace-nowrap">{r.label}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium text-[var(--foreground)]">{fmtScore(v)}</span>
                      {i > 0 ? <TrendDelta cur={v} prev={r.values[i - 1]} /> : null}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="px-3 py-2 text-[var(--muted)] whitespace-nowrap">
                  {L('Soru sayısı', 'Question count', 'Nombre de questions')}
                </td>
                {stats.map((s, i) => (
                  <td key={i} className="px-3 py-2 text-[var(--foreground)]">
                    {s?.questions || '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2 text-[var(--muted)] whitespace-nowrap">
                  {L('Değerlendirici sayısı', 'Evaluator count', 'Nombre d’évaluateurs')}
                </td>
                {stats.map((s, i) => (
                  <td key={i} className="px-3 py-2 text-[var(--foreground)]">
                    {s?.evaluators || '—'}
                  </td>
                ))}
              </tr>
              {catLabels.length ? (
                <tr className="bg-[var(--surface-2)]">
                  <td className="px-3 py-2 font-medium text-[var(--foreground)]" colSpan={ordered.length + 1}>
                    {L('Kategori bazında ekip puanı', 'Team score by category', 'Score équipe par catégorie')}
                  </td>
                </tr>
              ) : null}
              {catLabels.map((label) => {
                const k = label.toLocaleLowerCase('tr')
                const vals = catByPeriod.map((m) => (m.has(k) ? (m.get(k) as number) : null))
                return (
                  <tr key={k}>
                    <td className="px-3 py-2 text-[var(--muted)]">{label}</td>
                    {vals.map((v, i) => (
                      <td key={i} className="px-3 py-2 whitespace-nowrap">
                        <span className="text-[var(--foreground)]">{fmtScore(v)}</span>
                        {i > 0 ? <TrendDelta cur={v} prev={vals[i - 1]} /> : null}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-xs text-[var(--muted)] border-t border-[var(--border)] space-y-1">
          <div>
            {L(
              'Dönemler eskiden yeniye sıralıdır. Oklar bir önceki döneme göre değişimi gösterir. Boş hücre, o kategorinin ilgili dönemde ölçülmediğini belirtir.',
              'Periods run oldest to newest. Arrows show the change versus the previous period. An empty cell means the category was not measured in that period.',
              'Les périodes vont de la plus ancienne à la plus récente. Les flèches indiquent la variation par rapport à la période précédente. Une cellule vide signifie que la catégorie n’a pas été mesurée sur cette période.'
            )}
          </div>
          {baseShifted ? (
            <div className="text-amber-600">
              {L(
                'Dikkat: dönemler arasında soru sayısı belirgin değişmiş. Her dönemin puanı kendi soru setinden hesaplanır, bu yüzden puan farkı tek başına performans değişimi anlamına gelmeyebilir.',
                'Note: the number of questions differs markedly between periods. Each period is scored from its own question set, so a score difference alone may not reflect a change in performance.',
                'Attention : le nombre de questions diffère sensiblement entre les périodes. Chaque période est notée à partir de son propre questionnaire ; un écart de score ne traduit donc pas nécessairement une évolution de la performance.'
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] p-3 space-y-3">
        <div className="text-sm font-semibold text-[var(--foreground)]">
          {L('Yıllar içindeki değişim', 'Change over time', 'Évolution dans le temps')}
          {overallDelta != null ? (
            <span className={`ml-2 text-xs font-normal ${overallDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {L('ekip ortalaması', 'team average', 'moyenne équipe')} {overallDelta >= 0 ? '+' : '−'}
              {Math.abs(overallDelta).toFixed(2)}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TrendSwotBox
            tone="good"
            title={L('Güçlü yönler', 'Strengths', 'Points forts')}
            items={strong.map((c) => ({ label: c.label, detail: swotDetail(c) }))}
            emptyText={L('Bu dönemlerde yok', 'None in these periods', 'Aucun sur ces périodes')}
          />
          <TrendSwotBox
            tone="bad"
            title={L('Gelişim alanları', 'Development areas', 'Axes de progrès')}
            items={weak.map((c) => ({ label: c.label, detail: swotDetail(c) }))}
            emptyText={L('Bu dönemlerde yok', 'None in these periods', 'Aucun sur ces périodes')}
          />
          <TrendSwotBox
            tone="up"
            title={L('Yükselişte', 'Improving', 'En progression')}
            items={rising.map((c) => ({ label: c.label, detail: arrow(c) }))}
            emptyText={L('Belirgin yükseliş yok', 'No marked improvement', 'Aucune progression marquée')}
          />
          <TrendSwotBox
            tone="down"
            title={L('Düşüşte', 'Declining', 'En recul')}
            items={falling.map((c) => ({ label: c.label, detail: arrow(c) }))}
            emptyText={L('Belirgin düşüş yok', 'No marked decline', 'Aucun recul marqué')}
          />
        </div>
        <div className="text-xs text-[var(--muted)]">
          {L(
            'Eşikler: 0.25 puan ve üzeri değişim yükseliş veya düşüş sayılır. Ölçüldüğü bütün dönemlerde 4.00 ve üzeri olan kategori güçlü, hiçbir dönemde 3.50’ye ulaşmayan kategori gelişim alanıdır. Hesap ilk ve son dönem arasındaki farka dayanır. "Tek dönem" ibaresi, o kategorinin yalnız bir dönemde ölçüldüğünü ve trend yorumu yapılamayacağını belirtir.',
            'Thresholds: a change of 0.25 or more counts as improvement or decline. A category at 4.00 or above in every period where it was measured is a strength; one that never reaches 3.50 is a development area. The calculation compares the first and last period. "Single period" means the category was measured only once, so no trend can be read.',
            'Seuils : une variation de 0,25 ou plus est considérée comme une progression ou un recul. Une catégorie à 4,00 ou plus sur toutes les périodes où elle a été mesurée est un point fort ; une catégorie n’atteignant jamais 3,50 est un axe de progrès. Le calcul compare la première et la dernière période. « Période unique » signifie que la catégorie n’a été mesurée qu’une fois ; aucune tendance ne peut en être déduite.'
          )}
        </div>
      </div>
    </div>
  )
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
        <PeriodTrendSummary group={group} lang={lang} />
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
