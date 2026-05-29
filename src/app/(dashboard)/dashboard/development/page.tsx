'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import type { DevelopmentActionStep, DevelopmentInsightCard } from '@/lib/development-insights'
import {
  Target,
  Lightbulb,
  BookOpen,
  CheckCircle,
  Clock,
  Loader2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  ListChecks,
} from 'lucide-react'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { GapBar } from '@/components/charts/gap-bar'

interface CategoryScore {
  name: string
  selfScore: number
  peerScore: number
  gap: number
}

interface DevelopmentPlan {
  strengths: CategoryScore[]
  improvements: CategoryScore[]
  recommendations: string[]
  headline?: string
  subline?: string
  chartRows?: CategoryScore[]
  insightCards?: DevelopmentInsightCard[]
  actionSteps?: DevelopmentActionStep[]
}

function insightBadgeVariant(kind: DevelopmentInsightCard['kind']) {
  if (kind === 'priority') return 'warning' as const
  if (kind === 'awareness_over') return 'info' as const
  if (kind === 'awareness_under') return 'success' as const
  return 'success' as const
}

export default function DevelopmentPage() {
  const lang = useLang()
  const { user } = useAuthStore()
  const [plan, setPlan] = useState<DevelopmentPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodName, setPeriodName] = useState('')
  const [periodOptions, setPeriodOptions] = useState<{ id: string; name: string }[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [planStatus, setPlanStatus] = useState<string | null>(null)
  const [evalProgress, setEvalProgress] = useState<{ completed: number; total: number } | null>(null)
  const [hasTargetAssignments, setHasTargetAssignments] = useState<boolean | null>(null)

  const loadPeriods = useCallback(async () => {
    if (!user) return

    try {
      const resp = await fetch(`/api/dashboard/development?lang=${encodeURIComponent(lang)}`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')
      setPeriodOptions((payload.periods || []) as any)
      setSelectedPeriodId('')
      setPeriodName('')
      setPlan(null)
      setPlanStatus(null)
      setEvalProgress(null)
      setHasTargetAssignments(
        typeof payload.hasTargetAssignments === 'boolean' ? payload.hasTargetAssignments : payload.periods?.length > 0
      )
      setLoading(false)
      return
    } catch (error) {
      console.error('Development plan error:', error)
    } finally {
      setLoading(false)
    }
  }, [user, lang])

  useEffect(() => {
    if (user) loadPeriods()
  }, [user, loadPeriods])

  const loadDevelopmentPlanForPeriod = async (periodId: string) => {
    if (!user) return
    setLoading(true)
    setPlanStatus(null)
    setEvalProgress(null)
    try {
      const resp = await fetch(
        `/api/dashboard/development?lang=${encodeURIComponent(lang)}&period_id=${encodeURIComponent(periodId)}`,
        { method: 'GET' }
      )
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')
      setPeriodName(String(payload.periodName || ''))
      setPlan(payload.plan || null)
      setPlanStatus(String(payload.planStatus || (payload.plan ? 'ready' : 'unknown')))
      if (payload.progress) {
        setEvalProgress({
          completed: Number(payload.progress.completed || 0),
          total: Number(payload.progress.total || 0),
        })
      } else if (payload.periods) {
        const meta = (payload.periods as { id: string; completedAsTarget?: number; totalAsTarget?: number }[]).find(
          (p) => p.id === periodId
        )
        if (meta) {
          setEvalProgress({
            completed: Number(meta.completedAsTarget || 0),
            total: Number(meta.totalAsTarget || 0),
          })
        }
      }
      setHasTargetAssignments(payload.hasTargetAssignments !== false)

      try {
        fetch(`/api/dashboard/action-plans?lang=${encodeURIComponent(lang)}&period_id=${encodeURIComponent(periodId)}`, {
          method: 'GET',
        }).catch(() => {})
      } catch {}
    } catch (error) {
      console.error('Development plan error:', error)
      setPlan(null)
      setPlanStatus(null)
      setEvalProgress(null)
    } finally {
      setLoading(false)
    }
  }

  const chartRows = plan?.chartRows?.length
    ? plan.chartRows
    : [...(plan?.strengths || []), ...(plan?.improvements || [])].filter((c) => c.selfScore > 0 && c.peerScore > 0)

  const insightCards = plan?.insightCards?.length ? plan.insightCards : []
  const actionSteps = plan?.actionSteps?.length ? plan.actionSteps : []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">🎯 {t('myDevelopmentTitle', lang)}</h1>
        <p className="text-[var(--muted)] mt-1">{t('myDevelopmentSubtitle', lang)}</p>
      </div>

      {periodOptions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>📅 {t('periodSelectionTitle', lang)}</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {periodOptions.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPeriodId(p.id)
                  loadDevelopmentPlanForPeriod(p.id)
                }}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  selectedPeriodId === p.id
                    ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                    : 'bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {p.name}
              </button>
            ))}
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      ) : periodOptions.length > 0 && !selectedPeriodId ? (
        <RequireSelection
          enabled={true}
          title={t('kvkkSecurityTitle', lang)}
          message={t('kvkkSelectPeriodToContinue', lang)}
        >
          <div />
        </RequireSelection>
      ) : periodOptions.length === 0 && hasTargetAssignments === false ? (
        <Card>
          <CardBody className="py-12 text-center text-[var(--muted)]">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-60" />
            <p className="text-[var(--foreground)] font-medium">{t('developmentNoTargetAssignments', lang)}</p>
          </CardBody>
        </Card>
      ) : planStatus === 'not_released' ? (
        <Card>
          <CardBody className="py-12 text-center">
            <AlertCircle className="w-14 h-14 mx-auto text-[var(--muted)] mb-4" />
            <p className="text-lg text-[var(--foreground)] font-medium mb-2">{periodName || t('periodSelectionTitle', lang)}</p>
            <p className="text-[var(--muted)] max-w-lg mx-auto">{t('developmentPlanNotReleased', lang)}</p>
            {evalProgress && evalProgress.total > 0 && (
              <p className="mt-4 text-sm text-[var(--muted)]">
                {t('developmentAwaitingProgress', lang)
                  .replace('{completed}', String(evalProgress.completed))
                  .replace('{total}', String(evalProgress.total))}
              </p>
            )}
          </CardBody>
        </Card>
      ) : planStatus === 'awaiting_evaluations' ? (
        <Card>
          <CardBody className="py-12 text-center">
            <Clock className="w-14 h-14 mx-auto text-[var(--brand)] mb-4 opacity-80" />
            <p className="text-lg text-[var(--foreground)] font-medium mb-2">{periodName || t('periodSelectionTitle', lang)}</p>
            <p className="text-[var(--muted)] max-w-lg mx-auto">{t('developmentAwaitingEvaluations', lang)}</p>
            {evalProgress && evalProgress.total > 0 && (
              <p className="mt-4 text-sm font-medium text-[var(--foreground)]">
                {t('developmentAwaitingProgress', lang)
                  .replace('{completed}', String(evalProgress.completed))
                  .replace('{total}', String(evalProgress.total))}
              </p>
            )}
          </CardBody>
        </Card>
      ) : !plan ? (
        <Card>
          <CardBody className="py-12 text-center text-[var(--muted)]">
            <Target className="w-12 h-12 mx-auto mb-3 text-[var(--muted)] opacity-50" />
            <p>{t('noDevelopmentResultYet', lang)}</p>
            <p className="text-sm mt-2">{t('developmentPlanWillBeCreated', lang)}</p>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Badge variant="info" className="text-sm px-4 py-2">
              {t('periodAnalysisBadge', lang).replace('{period}', String(periodName || ''))}
            </Badge>
            {selectedPeriodId && (
              <Link
                href={`/dashboard/results?period_id=${encodeURIComponent(selectedPeriodId)}`}
                className="text-sm text-[var(--brand)] hover:underline inline-flex items-center gap-1"
              >
                {t('developmentViewResults', lang)}
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          <Card className="mb-6 border-[var(--brand)]/20 bg-[var(--brand-soft)]/40">
            <CardBody className="py-4">
              <div className="flex gap-3">
                <Sparkles className="w-5 h-5 text-[var(--brand)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-[var(--foreground)]">{plan.headline || t('noData', lang)}</p>
                  <p className="text-sm text-[var(--muted)] mt-1">{t('developmentVsResultsNote', lang)}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {chartRows.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-[var(--brand)]" />
                  {t('developmentGapChartTitle', lang)}
                </CardTitle>
                <p className="text-sm text-[var(--muted)]">{t('developmentGapChartHint', lang)}</p>
              </CardHeader>
              <CardBody>
                <GapBar
                  rows={chartRows.map((c) => ({ name: c.name, gap: c.gap }))}
                  label={t('gapLabel', lang)}
                />
              </CardBody>
            </Card>
          )}

          <Card className="mb-6">
            <CardHeader className="bg-[var(--brand-soft)] border-b border-[var(--brand)]/30">
              <CardTitle className="flex items-center gap-2 text-[var(--brand)]">
                <Lightbulb className="w-5 h-5" />
                {t('developmentSuggestions', lang)}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {insightCards.length === 0 ? (
                <p className="text-[var(--muted)] text-center py-4">{t('notEnoughDataForSuggestions', lang)}</p>
              ) : (
                <div className="space-y-4">
                  {insightCards.map((card) => (
                    <div
                      key={card.id}
                      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex gap-3">
                          <div className="w-9 h-9 bg-[var(--brand)]/15 rounded-lg flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-4 h-4 text-[var(--brand)]" />
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--foreground)]">{card.title}</p>
                            <p className="text-sm text-[var(--muted)] mt-0.5">
                              {t('selfShort', lang)} {card.selfScore.toFixed(1)} · {t('teamShort', lang)}{' '}
                              {card.peerScore.toFixed(1)} · {t('gapLabel', lang)}{' '}
                              {card.gap > 0 ? '+' : ''}
                              {card.gap.toFixed(1)}
                            </p>
                          </div>
                        </div>
                        <Badge variant={insightBadgeVariant(card.kind)}>{card.category}</Badge>
                      </div>
                      <p className="text-sm text-[var(--foreground)]">{card.body}</p>
                      {card.trainings.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[var(--muted)] mb-2">
                            {t('developmentSuggestedTrainings', lang)}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {card.trainings.map((tr) => (
                              <Badge key={tr} variant="info">
                                {tr}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {card.microActions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[var(--muted)] mb-2">
                            {t('developmentMicroActions', lang)}
                          </p>
                          <ul className="text-sm text-[var(--foreground)] space-y-1 list-disc list-inside">
                            {card.microActions.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                {t('developmentActionPlansTitle', lang)}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {actionSteps.length === 0 ? (
                <p className="text-[var(--muted)] text-center py-4">{t('allAreasGood', lang)} 🎉</p>
              ) : (
                <div className="space-y-3">
                  {actionSteps.map((step, idx) => (
                    <div key={idx} className="p-4 border border-[var(--border)] rounded-xl space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-[var(--success-soft)] text-[var(--success)] flex items-center justify-center font-semibold text-sm">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-[var(--foreground)]">{step.title}</p>
                            <p className="text-sm text-[var(--muted)]">
                              {t('goalLabel', lang)}: {step.goal}
                            </p>
                            <p className="text-xs text-[var(--muted)] mt-1">{step.hint}</p>
                          </div>
                        </div>
                        <Badge variant="gray">
                          <Clock className="w-3 h-3 mr-1" />
                          {t('months3', lang)}
                        </Badge>
                      </div>
                      <div className="flex items-start gap-2 text-sm text-[var(--foreground)]">
                        <ListChecks className="w-4 h-4 text-[var(--muted)] mt-0.5 flex-shrink-0" />
                        <ul className="space-y-1 list-disc list-inside">
                          {step.microActions.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedPeriodId && (
                <div className="mt-6 pt-4 border-t border-[var(--border)]">
                  <Link
                    href={`/dashboard/action-plans?period_id=${encodeURIComponent(selectedPeriodId)}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--brand)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    {t('developmentGoToActionPlans', lang)}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
