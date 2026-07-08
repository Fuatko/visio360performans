'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, Button, Badge, toast } from '@/components/ui'
import { Sparkles, Loader2, TrendingUp, TrendingDown, Lightbulb, AlertTriangle, RefreshCw, Smile, Meh, Frown } from 'lucide-react'
import { t, type Lang } from '@/lib/i18n'
import type { SurveyAiReport } from '@/lib/server/survey-ai'

type Cached = { report: SurveyAiReport; model: string | null; response_count: number | null; created_at: string } | null

export function SurveyAiPanel({
  surveyId,
  lang,
  responseCount,
}: {
  surveyId: string
  lang: Lang
  responseCount: number
}) {
  const [report, setReport] = useState<SurveyAiReport | null>(null)
  const [meta, setMeta] = useState<{ model: string | null; response_count: number | null; created_at: string | null }>({
    model: null,
    response_count: null,
    created_at: null,
  })
  const [loadingCache, setLoadingCache] = useState(true)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoadingCache(true)
      try {
        const resp = await fetch(`/api/admin/surveys/ai-analyze?survey_id=${encodeURIComponent(surveyId)}`)
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!alive) return
        const cached: Cached = payload?.cached || null
        if (cached) {
          setReport(cached.report)
          setMeta({ model: cached.model, response_count: cached.response_count, created_at: cached.created_at })
        }
      } catch {
        /* sessiz */
      } finally {
        if (alive) setLoadingCache(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [surveyId])

  const runAnalysis = useCallback(async () => {
    setRunning(true)
    try {
      const resp = await fetch('/api/admin/surveys/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ survey_id: surveyId, lang }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        if (payload?.error === 'no_responses') {
          toast(t('surveyNoResponses', lang), 'error')
        } else {
          toast(payload?.detail || payload?.error || t('surveyAiFailed', lang), 'error')
        }
        // Fallback SWOT geldiyse göster
        if (payload?.fallback?.swot) {
          setReport((r) => ({
            executiveSummary: '',
            swot: payload.fallback.swot,
            sentiment: { positivePct: 0, neutralPct: 0, negativePct: 0, themes: [] },
            recommendations: [],
            keyFindings: [],
            ...(r || {}),
            swotFallback: true,
          } as any))
        }
        return
      }
      setReport(payload.report)
      setMeta({ model: payload.model, response_count: payload.response_count, created_at: new Date().toISOString() })
      toast(t('surveyAiDone', lang), 'success')
    } catch (e: any) {
      toast(e?.message || t('surveyAiFailed', lang), 'error')
    } finally {
      setRunning(false)
    }
  }, [surveyId, lang])

  if (loadingCache) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--brand)]" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Aksiyon barı */}
      <Card>
        <CardBody className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--brand-soft)] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[var(--brand)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--foreground)]">{t('surveyAiTitle', lang)}</p>
              <p className="text-xs text-[var(--muted)]">
                {meta.created_at
                  ? t('surveyAiCachedAt', lang)
                      .replace('{date}', new Date(meta.created_at).toLocaleString(lang === 'tr' ? 'tr-TR' : lang))
                      .replace('{n}', String(meta.response_count ?? '—'))
                  : t('surveyAiHint', lang)}
              </p>
            </div>
          </div>
          <Button onClick={runAnalysis} disabled={running || responseCount === 0}>
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : report ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {report ? t('surveyAiRerun', lang) : t('surveyAiRun', lang)}
          </Button>
        </CardBody>
      </Card>

      {responseCount === 0 && (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--muted)] text-center py-6">{t('surveyNoResponses', lang)}</p>
          </CardBody>
        </Card>
      )}

      {running && !report && (
        <Card>
          <CardBody className="text-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)] mx-auto mb-3" />
            <p className="text-sm text-[var(--muted)]">{t('surveyAiRunning', lang)}</p>
          </CardBody>
        </Card>
      )}

      {report && (
        <>
          {report.executiveSummary && (
            <Card>
              <CardHeader>
                <CardTitle>{t('surveyAiSummary', lang)}</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-line">{report.executiveSummary}</p>
              </CardBody>
            </Card>
          )}

          {/* SWOT */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SwotCard title={t('swotStrengths', lang)} items={report.swot?.strengths} icon={TrendingUp} tone="success" />
            <SwotCard title={t('swotWeaknesses', lang)} items={report.swot?.weaknesses} icon={TrendingDown} tone="danger" />
            <SwotCard title={t('swotOpportunities', lang)} items={report.swot?.opportunities} icon={Lightbulb} tone="info" />
            <SwotCard title={t('swotThreats', lang)} items={report.swot?.threats} icon={AlertTriangle} tone="warning" />
          </div>

          {/* Duygu analizi */}
          {report.sentiment && (report.sentiment.themes?.length || report.sentiment.positivePct > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>{t('surveyAiSentiment', lang)}</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="flex h-3 rounded-full overflow-hidden bg-[var(--surface-2)]">
                  <div className="bg-[var(--success)]" style={{ width: `${report.sentiment.positivePct}%` }} />
                  <div className="bg-[var(--muted)]" style={{ width: `${report.sentiment.neutralPct}%` }} />
                  <div className="bg-[var(--danger)]" style={{ width: `${report.sentiment.negativePct}%` }} />
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1 text-[var(--foreground)]"><Smile className="w-4 h-4 text-[var(--success)]" /> {report.sentiment.positivePct}%</span>
                  <span className="flex items-center gap-1 text-[var(--foreground)]"><Meh className="w-4 h-4 text-[var(--muted)]" /> {report.sentiment.neutralPct}%</span>
                  <span className="flex items-center gap-1 text-[var(--foreground)]"><Frown className="w-4 h-4 text-[var(--danger)]" /> {report.sentiment.negativePct}%</span>
                </div>
                {report.sentiment.themes?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {report.sentiment.themes.map((th, i) => (
                      <Badge
                        key={i}
                        variant={th.sentiment === 'positive' ? 'success' : th.sentiment === 'negative' ? 'danger' : 'gray'}
                      >
                        {th.theme} ({th.mentions})
                      </Badge>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Öneriler */}
          {report.recommendations?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('surveyAiRecommendations', lang)}</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                {report.recommendations.map((rec, i) => (
                  <div key={i} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'gray'}>
                        {t(`priority${cap(rec.priority)}` as any, lang)}
                      </Badge>
                      <span className="font-medium text-[var(--foreground)]">{rec.title}</span>
                    </div>
                    {rec.rationale && <p className="text-sm text-[var(--muted)] mb-2">{rec.rationale}</p>}
                    {rec.actions?.length > 0 && (
                      <ul className="list-disc list-inside text-sm text-[var(--foreground)] space-y-0.5">
                        {rec.actions.map((a, j) => (
                          <li key={j}>{a}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {/* Ana bulgular */}
          {report.keyFindings?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('surveyAiKeyFindings', lang)}</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="list-disc list-inside text-sm text-[var(--foreground)] space-y-1">
                  {report.keyFindings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function SwotCard({
  title,
  items,
  icon: Icon,
  tone,
}: {
  title: string
  items?: Array<{ name: string; detail?: string }>
  icon: React.ComponentType<{ className?: string }>
  tone: 'success' | 'danger' | 'info' | 'warning'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-[var(--success)]'
      : tone === 'danger'
        ? 'text-[var(--danger)]'
        : tone === 'warning'
          ? 'text-[var(--warning)]'
          : 'text-[var(--info)]'
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`w-5 h-5 ${toneClass}`} />
          <h4 className="font-semibold text-[var(--foreground)]">{title}</h4>
        </div>
        {items && items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-[var(--foreground)]">{it.name}</span>
                {it.detail && <p className="text-[var(--muted)] text-xs mt-0.5">{it.detail}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--muted)]">—</p>
        )}
      </CardBody>
    </Card>
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
