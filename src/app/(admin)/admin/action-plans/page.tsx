'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button, Select, toast } from '@/components/ui'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { ListChecks, Loader2, RefreshCw, Wand2, Send } from 'lucide-react'

type PlanRow = any

export default function AdminActionPlansPage() {
  const lang = useLang()
  const { user } = useAuthStore()
  const { organizationId } = useAdminContextStore()

  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [periods, setPeriods] = useState<any[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [users, setUsers] = useState<any[]>([])

  const [filterPeriodId, setFilterPeriodId] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterUserId, setFilterUserId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [generating, setGenerating] = useState(false)
  const [sendingReminderFor, setSendingReminderFor] = useState<string>('')

  const periodLabel = useCallback(
    (p: any) => {
      if (!p) return ''
      if (lang === 'fr') return String(p.name_fr || p.name || '')
      if (lang === 'en') return String(p.name_en || p.name || '')
      return String(p.name || '')
    },
    [lang]
  )

  const loadMeta = useCallback(async () => {
    if (!organizationId) return
    setLoadingMeta(true)
    try {
      const resp = await fetch(`/api/admin/matrix-data?org_id=${encodeURIComponent(organizationId)}`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')
      setPeriods(payload.periods || [])
      setDepartments(payload.departments || [])
      setUsers(payload.users || [])
    } catch (e: any) {
      toast(e?.message || 'Veriler alınamadı', 'error')
    } finally {
      setLoadingMeta(false)
    }
  }, [organizationId])

  const loadPlans = useCallback(async () => {
    if (!organizationId) return
    setLoadingPlans(true)
    try {
      const resp = await fetch('/api/admin/action-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: organizationId,
          period_id: filterPeriodId || undefined,
          department: filterDept || undefined,
          user_id: filterUserId || undefined,
          status: filterStatus || undefined,
          limit: 500,
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')
      setPlans(payload.plans || [])
    } catch (e: any) {
      toast(e?.message || 'Eylem planları alınamadı', 'error')
    } finally {
      setLoadingPlans(false)
    }
  }, [organizationId, filterPeriodId, filterDept, filterUserId, filterStatus])

  const generatePlans = useCallback(async () => {
    if (!organizationId) return
    setGenerating(true)
    try {
      const resp = await fetch('/api/admin/action-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: organizationId, period_id: filterPeriodId || undefined, limit: 250 }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Oluşturma hatası')
      toast(t('actionPlansGenerated', lang).replace('{n}', String(payload.created || 0)), 'success')
      await loadPlans()
    } catch (e: any) {
      toast(e?.message || 'Planlar oluşturulamadı', 'error')
    } finally {
      setGenerating(false)
    }
  }, [organizationId, filterPeriodId, loadPlans, lang])

  useEffect(() => {
    if (organizationId) loadMeta()
  }, [organizationId, loadMeta])

  useEffect(() => {
    if (organizationId) loadPlans()
  }, [organizationId, loadPlans])

  const statusBadge = (s: string) => {
    if (s === 'completed') return 'success'
    if (s === 'in_progress') return 'info'
    if (s === 'cancelled') return 'gray'
    return 'warning'
  }

  const statusLabel = (s: string) => {
    if (s === 'completed') return t('actionPlanStatusCompleted', lang)
    if (s === 'in_progress') return t('actionPlanStatusInProgress', lang)
    if (s === 'cancelled') return t('actionPlanStatusCancelled', lang)
    return t('actionPlanStatusDraft', lang)
  }

  const headerHint = useMemo(() => {
    if (!user) return ''
    if (user.role === 'super_admin') return t('actionPlanTrackingAdminHintSuper', lang)
    return t('actionPlanTrackingAdminHintOrg', lang)
  }, [user, lang])

  const sendReminder = useCallback(
    async (planId: string) => {
      if (!planId) return
      setSendingReminderFor(planId)
      try {
        const resp = await fetch('/api/admin/action-plans/remind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_id: planId }),
        })
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!resp.ok || !payload?.success) throw new Error(payload?.error || payload?.detail || 'Gönderim hatası')
        toast(t('reminderSentNow', lang), 'success')
        await loadPlans()
      } catch (e: any) {
        toast(e?.message || t('reminderSendFailed', lang), 'error')
      } finally {
        setSendingReminderFor('')
      }
    },
    [lang, loadPlans]
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ListChecks className="w-6 h-6 text-[var(--brand)]" />
          {t('actionPlanTracking', lang)}
        </h1>
        <p className="text-slate-500 mt-1">{headerHint}</p>
      </div>

      {!organizationId ? (
        <Card>
          <CardBody className="py-10 text-center text-slate-500">{t('selectOrganization', lang)}</CardBody>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{t('filters', lang)}</span>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={generatePlans} disabled={generating || loadingPlans}>
                    {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    {t('generateActionPlans', lang)}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      loadMeta()
                      loadPlans()
                    }}
                    disabled={loadingMeta || loadingPlans}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t('refresh', lang)}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardBody className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <Select
                options={[{ value: '', label: t('allPeriods', lang) }, ...periods.map((p) => ({ value: p.id, label: periodLabel(p) }))]}
                value={filterPeriodId}
                onChange={(e) => setFilterPeriodId(e.target.value)}
                placeholder={t('periods', lang)}
              />
              <Select
                options={[{ value: '', label: t('allDepartments', lang) }, ...departments.map((d) => ({ value: d, label: d }))]}
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                placeholder={t('departmentLabel', lang)}
              />
              <Select
                options={[
                  { value: '', label: t('allUsers', lang) },
                  ...users.map((u) => ({ value: u.id, label: `${u.name || '-'}${u.department ? ` — ${u.department}` : ''}` })),
                ]}
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                placeholder={t('users', lang)}
              />
              <Select
                options={[
                  { value: '', label: t('allStatuses', lang) },
                  { value: 'draft', label: t('actionPlanStatusDraft', lang) },
                  { value: 'in_progress', label: t('actionPlanStatusInProgress', lang) },
                  { value: 'completed', label: t('actionPlanStatusCompleted', lang) },
                  { value: 'cancelled', label: t('actionPlanStatusCancelled', lang) },
                ]}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                placeholder={t('status', lang)}
              />

              <div className="lg:col-span-4 flex items-center justify-end">
                <Button onClick={loadPlans} disabled={loadingPlans}>
                  {loadingPlans ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {t('applyFilters', lang)}
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{t('actionPlanList', lang)}</span>
                <Badge variant="gray">{t('total', lang)}: {plans.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              {loadingPlans ? (
                <div className="p-6 text-center text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                  {t('loading', lang)}
                </div>
              ) : plans.length === 0 ? (
                <div className="p-6 text-center text-slate-500">{t('noData', lang)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left text-slate-600">
                        <th className="px-4 py-3">{t('employee', lang)}</th>
                        <th className="px-4 py-3">{t('departmentLabel', lang)}</th>
                        <th className="px-4 py-3">{t('periods', lang)}</th>
                        <th className="px-4 py-3">{t('status', lang)}</th>
                        <th className="px-4 py-3">{t('createdAt', lang)}</th>
                        <th className="px-4 py-3">{t('dueAt', lang)}</th>
                        <th className="px-4 py-3">{t('reminder', lang)}</th>
                        <th className="px-4 py-3">{t('actions', lang)}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {plans.map((p) => {
                        const u = p.user || {}
                        const per = p.period || null
                        const canRemind = String(p.status || 'draft') === 'draft' && !p.started_at
                        return (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{u.name || '-'}</div>
                              <div className="text-xs text-slate-500">{u.email || ''}</div>
                            </td>
                            <td className="px-4 py-3">{p.department || u.department || '-'}</td>
                            <td className="px-4 py-3">{per ? periodLabel(per) : '-'}</td>
                            <td className="px-4 py-3">
                              <Badge variant={statusBadge(String(p.status || 'draft')) as any}>{statusLabel(String(p.status || 'draft'))}</Badge>
                            </td>
                            <td className="px-4 py-3">{p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}</td>
                            <td className="px-4 py-3">{p.due_at ? new Date(p.due_at).toLocaleDateString() : '-'}</td>
                            <td className="px-4 py-3">
                              {p.reminder_first_sent_at ? (
                                <Badge variant="gray">{t('reminderSent', lang)}</Badge>
                              ) : (
                                <Badge variant="warning">{t('reminderNotSent', lang)}</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Button
                                variant="secondary"
                                disabled={!canRemind || sendingReminderFor === String(p.id)}
                                onClick={() => sendReminder(String(p.id))}
                              >
                                {sendingReminderFor === String(p.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                  <Send className="w-4 h-4 mr-2" />
                                )}
                                {t('sendReminderNow', lang)}
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}

