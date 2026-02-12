'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { CheckCircle, Clock, ListChecks, Loader2 } from 'lucide-react'

type Task = {
  id: string
  sort_order: number
  area: string
  description: string
  status: 'pending' | 'started' | 'done'
  planned_at?: string | null
  learning_started_at?: string | null
  baseline_score?: number | null
  target_score?: number | null
  training_id?: string | null
  ai_text?: string | null
  ai_generated_at?: string | null
  ai_model?: string | null
  ai_suggestion?: any
}

type Plan = {
  id: string
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled'
  created_at?: string | null
  started_at?: string | null
  due_at?: string | null
  completed_at?: string | null
} | null

export default function ActionPlansPage() {
  const lang = useLang()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [periods, setPeriods] = useState<Array<{ id: string; name: string; plan?: any }>>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [periodName, setPeriodName] = useState('')
  const [plan, setPlan] = useState<Plan>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [saving, setSaving] = useState(false)

  const statusLabel = useCallback(
    (s: string) => {
      if (s === 'completed') return t('actionPlanStatusCompleted', lang)
      if (s === 'in_progress') return t('actionPlanStatusInProgress', lang)
      if (s === 'cancelled') return t('actionPlanStatusCancelled', lang)
      return t('actionPlanStatusDraft', lang)
    },
    [lang]
  )

  const statusBadge = useCallback(
    (s: string) => {
      if (s === 'completed') return 'success'
      if (s === 'in_progress') return 'info'
      if (s === 'cancelled') return 'gray'
      return 'warning'
    },
    []
  )

  const canStart = plan?.id && plan.status === 'draft'
  const canComplete = plan?.id && plan.status !== 'completed' && tasks.length > 0 && tasks.every((x) => x.status === 'done')

  const loadPeriods = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const resp = await fetch(`/api/dashboard/action-plans?lang=${encodeURIComponent(lang)}`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')
      setPeriods((payload.periods || []) as any)
      setSelectedPeriodId('')
      setPeriodName('')
      setPlan(null)
      setTasks([])
    } catch (e) {
      console.error('action-plans loadPeriods error:', e)
    } finally {
      setLoading(false)
    }
  }, [user, lang])

  const loadForPeriod = useCallback(
    async (periodId: string) => {
      if (!user) return
      setLoading(true)
      try {
        const resp = await fetch(
          `/api/dashboard/action-plans?lang=${encodeURIComponent(lang)}&period_id=${encodeURIComponent(periodId)}`,
          { method: 'GET' }
        )
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')
        setPeriodName(String(payload.periodName || ''))
        setPlan((payload.plan || null) as any)
        setTasks((payload.tasks || []) as any)
      } catch (e) {
        console.error('action-plans loadForPeriod error:', e)
        setPlan(null)
        setTasks([])
      } finally {
        setLoading(false)
      }
    },
    [user, lang]
  )

  useEffect(() => {
    if (user) loadPeriods()
  }, [user, loadPeriods])

  // Allow deep-link: /dashboard/action-plans?period_id=...
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const pid = (url.searchParams.get('period_id') || '').trim()
      if (pid && pid !== selectedPeriodId) {
        setSelectedPeriodId(pid)
        loadForPeriod(pid)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const callTaskAction = async (task: Task, action: string) => {
    if (!plan?.id) return
    setSaving(true)
    try {
      const resp = await fetch(`/api/dashboard/action-plans?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, plan_id: plan.id, task_id: task.id }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Güncelleme hatası')
      const nowIso = new Date().toISOString()
      setTasks((prev) =>
        prev.map((x) => {
          if (x.id !== task.id) return x
          if (action === 'plan_training') return { ...x, planned_at: x.planned_at || nowIso }
          if (action === 'start_learning') return { ...x, status: 'started', learning_started_at: x.learning_started_at || nowIso }
          if (action === 'mark_done') return { ...x, status: 'done' }
          return x
        })
      )
      if (plan.status === 'draft' && action === 'start_learning') {
        setPlan({ ...plan, status: 'in_progress', started_at: plan.started_at || nowIso } as any)
      }
    } catch (e) {
      console.error('task action error:', e)
    } finally {
      setSaving(false)
    }
  }

  const startPlan = async () => {
    if (!plan?.id) return
    setSaving(true)
    try {
      const resp = await fetch(`/api/dashboard/action-plans?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_plan', plan_id: plan.id }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Güncelleme hatası')
      setPlan({ ...plan, status: 'in_progress', started_at: plan.started_at || new Date().toISOString() } as any)
    } catch (e) {
      console.error('startPlan error:', e)
    } finally {
      setSaving(false)
    }
  }

  const completePlan = async () => {
    if (!plan?.id) return
    setSaving(true)
    try {
      const resp = await fetch(`/api/dashboard/action-plans?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_plan', plan_id: plan.id }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Güncelleme hatası')
      setPlan({ ...plan, status: 'completed', completed_at: new Date().toISOString() } as any)
    } catch (e) {
      console.error('completePlan error:', e)
    } finally {
      setSaving(false)
    }
  }

  const headerBadge = useMemo(() => {
    if (!plan?.id) return null
    return (
      <Badge variant={statusBadge(plan.status) as any}>
        {statusLabel(plan.status)}
      </Badge>
    )
  }, [plan, statusBadge, statusLabel])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <ListChecks className="w-6 h-6 text-[var(--brand)]" />
          {t('actionPlanTracking', lang)}
        </h1>
        <p className="text-[var(--muted)] mt-1">{t('actionPlanTrackingSubtitle', lang)}</p>
      </div>

      {/* Period selection */}
      {periods.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>📅 {t('periodSelectionTitle', lang)}</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPeriodId(p.id)
                  loadForPeriod(p.id)
                }}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  selectedPeriodId === p.id
                    ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                    : 'bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{p.name}</span>
                  {p.plan?.status && <Badge variant="gray" className="text-xs">{statusLabel(p.plan.status)}</Badge>}
                </div>
              </button>
            ))}
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      ) : periods.length > 0 && !selectedPeriodId ? (
        <Card>
          <CardBody className="py-10 text-center text-[var(--muted)]">
            <Clock className="w-12 h-12 mx-auto mb-3 text-[var(--muted)] opacity-50" />
            <p>{t('kvkkSelectPeriodToContinue', lang)}</p>
          </CardBody>
        </Card>
      ) : !plan?.id ? (
        <Card>
          <CardBody className="py-10 text-center text-[var(--muted)]">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-[var(--muted)] opacity-50" />
            <p>{t('actionPlanNotReady', lang)}</p>
            <p className="text-sm mt-2">{t('actionPlanNotReadyHint', lang)}</p>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Badge variant="info" className="text-sm px-4 py-2">
                {t('periodAnalysisBadge', lang).replace('{period}', String(periodName || ''))}
              </Badge>
              {headerBadge}
              {plan?.due_at ? (
                <Badge variant="gray" className="text-sm px-4 py-2">
                  {t('actionPlanDue', lang).replace('{date}', new Date(plan.due_at).toLocaleDateString())}
                </Badge>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {canStart && (
                <Button onClick={startPlan} disabled={saving}>
                  {t('actionPlanStart', lang)}
                </Button>
              )}
              {canComplete && (
                <Button onClick={completePlan} disabled={saving}>
                  {t('actionPlanComplete', lang)}
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                {t('actionPlanTasks', lang)}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 p-4 border border-[var(--border)] rounded-xl">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-[var(--foreground)]">{task.area}</p>
                        <Badge variant={task.status === 'done' ? 'success' : task.status === 'started' ? 'info' : 'gray'}>
                          {task.status === 'done'
                            ? t('actionPlanTaskDone', lang)
                            : task.status === 'started'
                              ? t('actionPlanTaskStarted', lang)
                              : t('actionPlanTaskPending', lang)}
                        </Badge>
                        {task.planned_at ? <Badge variant="gray">{t('trainingPlanned', lang)}</Badge> : null}
                        {task.learning_started_at ? <Badge variant="gray">{t('learningStarted', lang)}</Badge> : null}
                      </div>
                      <p className="text-sm text-[var(--muted)] mt-1">{task.description}</p>
                      <div className="text-sm text-[var(--muted)] mt-2">
                        {t('goalLabel', lang)}:{' '}
                        {typeof task.baseline_score === 'number' && typeof task.target_score === 'number'
                          ? `${task.baseline_score.toFixed(1)} → ${task.target_score.toFixed(1)}`
                          : '-'}
                        {' · '}
                        {t('months3', lang)}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          disabled={saving || Boolean(task.planned_at)}
                          onClick={() => callTaskAction(task, 'plan_training')}
                        >
                          {t('planTraining', lang)}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={saving || task.status === 'done'}
                          onClick={() => callTaskAction(task, 'start_learning')}
                        >
                          {t('startLearning', lang)}
                        </Button>
                        <Button
                          disabled={saving || task.status === 'done'}
                          onClick={() => callTaskAction(task, 'mark_done')}
                        >
                          {t('markDone', lang)}
                        </Button>
                      </div>

                      {/* AI / Catalog suggestion (user-visible) */}
                      {task.ai_suggestion?.trainings?.length ? (
                        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                          <div className="text-sm font-semibold text-[var(--foreground)]">
                            {t('aiSuggested', lang)}
                            {task.ai_generated_at ? (
                              <span className="text-xs font-normal text-[var(--muted)]"> · {new Date(task.ai_generated_at).toLocaleDateString()}</span>
                            ) : null}
                          </div>
                          {task.ai_text ? <div className="text-sm text-[var(--foreground)] mt-2">{String(task.ai_text)}</div> : null}

                          <div className="mt-3 space-y-3">
                            {(task.ai_suggestion.trainings as any[]).slice(0, 2).map((trn: any) => (
                              <div key={String(trn.id)} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                                <div className="font-medium text-[var(--foreground)]">{String(trn.title || '-')}</div>
                                {trn.provider ? <div className="text-xs text-[var(--muted)] mt-0.5">{String(trn.provider)}</div> : null}
                                {trn.url ? (
                                  <a className="text-xs text-[var(--brand)] underline mt-1 inline-block" href={String(trn.url)} target="_blank" rel="noreferrer">
                                    {t('openTrainingLink', lang)}
                                  </a>
                                ) : null}
                                {trn.why ? <div className="text-sm text-[var(--foreground)] mt-2">{String(trn.why)}</div> : null}

                                {Array.isArray(trn.weekly_plan) && trn.weekly_plan.length ? (
                                  <div className="mt-2">
                                    <div className="text-xs font-semibold text-[var(--foreground)]">{t('weeklyPlan', lang)}</div>
                                    <ul className="list-disc pl-5 text-xs text-[var(--muted)] mt-1 space-y-1">
                                      {trn.weekly_plan.slice(0, 12).map((x: any, idx: number) => (
                                        <li key={idx}>{String(x)}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {Array.isArray(trn.success_criteria) && trn.success_criteria.length ? (
                                  <div className="mt-2">
                                    <div className="text-xs font-semibold text-[var(--foreground)]">{t('successCriteria', lang)}</div>
                                    <ul className="list-disc pl-5 text-xs text-[var(--muted)] mt-1 space-y-1">
                                      {trn.success_criteria.slice(0, 8).map((x: any, idx: number) => (
                                        <li key={idx}>{String(x)}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}

