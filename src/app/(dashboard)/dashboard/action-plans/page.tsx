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

  const updateTask = async (task: Task, next: Task['status']) => {
    if (!plan?.id) return
    setSaving(true)
    try {
      const resp = await fetch(`/api/dashboard/action-plans?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_task', plan_id: plan.id, task_id: task.id, status: next }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Güncelleme hatası')
      setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status: next } : x)))
      // Auto-refresh plan status if needed
      if (plan.status === 'draft' && (next === 'started' || next === 'done')) {
        setPlan({ ...plan, status: 'in_progress', started_at: plan.started_at || new Date().toISOString() } as any)
      }
    } catch (e) {
      console.error('updateTask error:', e)
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
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ListChecks className="w-6 h-6 text-[var(--brand)]" />
          {t('actionPlanTracking', lang)}
        </h1>
        <p className="text-gray-500 mt-1">{t('actionPlanTrackingSubtitle', lang)}</p>
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
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
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
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : periods.length > 0 && !selectedPeriodId ? (
        <Card>
          <CardBody className="py-10 text-center text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>{t('kvkkSelectPeriodToContinue', lang)}</p>
          </CardBody>
        </Card>
      ) : !plan?.id ? (
        <Card>
          <CardBody className="py-10 text-center text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
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
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                {t('actionPlanTasks', lang)}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 p-4 border border-gray-200 rounded-xl">
                    <button
                      className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        task.status === 'done'
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : task.status === 'started'
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-gray-300'
                      }`}
                      onClick={() => {
                        const next = task.status === 'pending' ? 'started' : task.status === 'started' ? 'done' : 'pending'
                        updateTask(task, next)
                      }}
                      disabled={saving}
                      title={t('actionPlanToggleTask', lang)}
                    >
                      {task.status === 'done' ? '✓' : task.status === 'started' ? '•' : ''}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900">{task.area}</p>
                        <Badge variant={task.status === 'done' ? 'success' : task.status === 'started' ? 'info' : 'gray'}>
                          {task.status === 'done'
                            ? t('actionPlanTaskDone', lang)
                            : task.status === 'started'
                              ? t('actionPlanTaskStarted', lang)
                              : t('actionPlanTaskPending', lang)}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{task.description}</p>
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

