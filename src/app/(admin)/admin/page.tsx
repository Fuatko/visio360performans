'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge, StatTile, Select } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { matrixEvaluationContextLabel } from '@/lib/matrix-evaluation-context'
import {
  ADMIN_DASHBOARD_PENDING_LIST_LIMIT,
  ADMIN_DASHBOARD_RECENT_COMPLETED_LIMIT,
} from '@/lib/admin-dashboard-limits'
import type {
  AdminDashboardStats,
  EvaluatorDashboardSummary,
  MatrixBreakdownRow,
} from '@/lib/admin-dashboard-stats'
import {
  CheckCircle,
  Clock,
  TrendingUp,
  BarChart3,
  X,
  Printer,
  Users,
  ChevronDown,
} from 'lucide-react'

type PeriodOption = {
  id: string
  name: string
  name_en: string | null
  name_fr: string | null
  status: string | null
}

type ExpandedPanel = 'progress' | 'pending' | 'completed' | 'people' | null

interface RecentAssignment {
  id: string
  status: string
  matrix_context?: string | null
  evaluator?: { name?: string | null; department?: string | null } | null
  target?: { name?: string | null; department?: string | null } | null
  evaluation_periods?: { name?: string | null; name_en?: string | null; name_fr?: string | null } | null
}

const PERIOD_STORAGE_KEY = 'visio360_admin_dashboard_period_id'

function ClickableTile({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left w-full rounded-2xl transition-all ${
        active ? 'ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[var(--background)]' : ''
      }`}
    >
      {children}
    </button>
  )
}

export default function AdminDashboard() {
  const lang = useLang()
  const { user } = useAuthStore()
  const { organizationId } = useAdminContextStore()

  const periodLabel = (p: { name?: string | null; name_en?: string | null; name_fr?: string | null } | null | undefined) => {
    if (!p) return '-'
    if (lang === 'fr') return String(p.name_fr || p.name || '-')
    if (lang === 'en') return String(p.name_en || p.name || '-')
    return String(p.name || '-')
  }

  const [stats, setStats] = useState<AdminDashboardStats>({
    organizations: 0,
    users: 0,
    periods: 0,
    assignments: 0,
    completed: 0,
    pending: 0,
    unique_evaluators: 0,
    evaluators_completed: 0,
    unique_targets: 0,
    completion_rate: 0,
    by_matrix: [],
  })
  const [periods, setPeriods] = useState<PeriodOption[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [byMatrix, setByMatrix] = useState<MatrixBreakdownRow[]>([])
  const [evaluatorSummaries, setEvaluatorSummaries] = useState<EvaluatorDashboardSummary[]>([])
  const [recentAssignments, setRecentAssignments] = useState<RecentAssignment[]>([])
  const [pendingList, setPendingList] = useState<RecentAssignment[]>([])
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadDashboardData = useCallback(async (orgId: string, periodId: string) => {
    setLoading(true)
    setLoadError(null)
    try {
      const qs = new URLSearchParams({ org_id: String(orgId || '') })
      if (periodId) qs.set('period_id', periodId)
      const resp = await fetch(`/api/admin/dashboard?${qs.toString()}`, { method: 'GET', cache: 'no-store' })
      const payload = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        stats?: AdminDashboardStats
        periods?: PeriodOption[]
        by_matrix?: MatrixBreakdownRow[]
        evaluator_summaries?: EvaluatorDashboardSummary[]
        recent_assignments?: RecentAssignment[]
        lists?: { pending?: RecentAssignment[] }
      }
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Dashboard verisi alınamadı')

      setStats(payload.stats || {
        organizations: 0, users: 0, periods: 0, assignments: 0, completed: 0, pending: 0,
        unique_evaluators: 0, evaluators_completed: 0, unique_targets: 0, completion_rate: 0, by_matrix: [],
      })
      setPeriods(payload.periods || [])
      setByMatrix(payload.by_matrix || payload.stats?.by_matrix || [])
      setEvaluatorSummaries(payload.evaluator_summaries || [])
      setRecentAssignments(payload.recent_assignments || [])
      setPendingList(payload.lists?.pending || [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dashboard verisi alınamadı'
      setLoadError(message)
      console.error('Dashboard error:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!organizationId) return
    loadDashboardData(organizationId, selectedPeriodId)
  }, [organizationId, selectedPeriodId, loadDashboardData])

  useEffect(() => {
    if (!periods.length) return
    if (selectedPeriodId && periods.some((p) => p.id === selectedPeriodId)) return
    let saved = ''
    try { saved = window.localStorage.getItem(PERIOD_STORAGE_KEY) || '' } catch { saved = '' }
    const active = periods.find((p) => p.status === 'active')
    const next = (saved && periods.some((p) => p.id === saved) ? saved : '') || active?.id || periods[0]?.id || ''
    if (next) setSelectedPeriodId(next)
  }, [periods, selectedPeriodId])

  useEffect(() => {
    if (!selectedPeriodId) return
    try { window.localStorage.setItem(PERIOD_STORAGE_KEY, selectedPeriodId) } catch { /* ignore */ }
    setExpandedPanel(null)
  }, [selectedPeriodId])

  const completionRate = stats.completion_rate

  const periodOptions = useMemo(
    () => periods.map((p) => ({ value: p.id, label: periodLabel(p) })),
    [periods, lang]
  )

  const selectedPeriodMeta = periods.find((p) => p.id === selectedPeriodId)

  const togglePanel = (panel: ExpandedPanel) => {
    setExpandedPanel((cur) => (cur === panel ? null : panel))
  }

  const printPendingReport = () => {
    const el = document.getElementById('admin-pending-report')
    if (!el) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>${t('pending', lang)}</title></head><body>`)
    w.document.write(el.innerHTML)
    w.document.write('</body></html>')
    w.document.close()
    w.focus()
    w.print()
  }

  const recentLimit = ADMIN_DASHBOARD_RECENT_COMPLETED_LIMIT

  const panelTitle = (p: ExpandedPanel) => {
    if (p === 'progress') return t('adminDashboardProgressTile', lang)
    if (p === 'pending') return t('pending', lang)
    if (p === 'completed') {
      return t('adminDashboardRecentCompletedTitle', lang).replace('{n}', String(recentLimit))
    }
    if (p === 'people') return t('adminDashboardParticipantsTile', lang)
    return ''
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('adminDashboard', lang)}</h1>
        <p className="text-[var(--muted)] mt-1">
          {t('dashboardGreeting', lang)}, {user?.name}! {t('dashboardOverview', lang)}
        </p>
      </div>

      <RequireSelection
        enabled={!organizationId}
        title={t('kvkkSecurityTitle', lang)}
        message={t('kvkkSelectOrgToContinue', lang)}
      >
        {periods.length > 0 ? (
          <div className="mb-6 max-w-xl">
            <label className="block text-sm font-medium text-[var(--muted)] mb-1">
              {t('dashboardSelectPeriod', lang)}
            </label>
            <Select
              options={periodOptions}
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
            />
          </div>
        ) : null}

        {loadError ? (
          <p className="text-sm text-[var(--danger)] mb-4">
            {t('adminDashboardLoadError', lang).replace('{error}', loadError)}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-[var(--muted)] mb-4">{t('loading', lang)}</p>
        ) : null}

        {stats.assignments > 0 ? (
          <p className="text-sm text-[var(--muted)] mb-5">
            {t('adminDashboardSummaryLine', lang)
              .replace('{completed}', String(stats.completed))
              .replace('{total}', String(stats.assignments))
              .replace('{rate}', String(completionRate))}
            {' · '}
            {t('adminDashboardEvaluatorsCompleted', lang)}: {stats.evaluators_completed}
            {selectedPeriodMeta ? (
              <span className="text-[var(--foreground)]"> · {periodLabel(selectedPeriodMeta)}</span>
            ) : null}
          </p>
        ) : !loading && organizationId ? (
          <p className="text-sm text-[var(--muted)] mb-5">{t('noEvaluations', lang)}</p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <ClickableTile active={expandedPanel === 'progress'} onClick={() => togglePanel('progress')}>
            <StatTile
              title={t('adminDashboardProgressTile', lang)}
              value={`${completionRate}%`}
              icon={TrendingUp}
              tone={completionRate >= 70 ? 'success' : completionRate >= 40 ? 'warning' : 'danger'}
              right={<ChevronDown className={`w-4 h-4 text-[var(--muted)] transition-transform ${expandedPanel === 'progress' ? 'rotate-180' : ''}`} />}
              className="w-full"
            />
            <p className="text-xs text-[var(--muted)] mt-1 px-1">{t('adminDashboardClickHint', lang)}</p>
          </ClickableTile>

          <ClickableTile active={expandedPanel === 'pending'} onClick={() => togglePanel('pending')}>
            <StatTile
              title={t('pending', lang)}
              value={stats.pending}
              icon={Clock}
              tone="warning"
              right={<ChevronDown className={`w-4 h-4 text-[var(--muted)] transition-transform ${expandedPanel === 'pending' ? 'rotate-180' : ''}`} />}
              className="w-full"
            />
            <p className="text-xs text-[var(--muted)] mt-1 px-1">{t('adminDashboardClickHint', lang)}</p>
          </ClickableTile>

          <ClickableTile active={expandedPanel === 'completed'} onClick={() => togglePanel('completed')}>
            <StatTile
              title={t('completedShort', lang)}
              value={stats.completed}
              icon={CheckCircle}
              tone="success"
              right={<ChevronDown className={`w-4 h-4 text-[var(--muted)] transition-transform ${expandedPanel === 'completed' ? 'rotate-180' : ''}`} />}
              className="w-full"
            />
            <p className="text-xs text-[var(--muted)] mt-1 px-1">
              {t('adminDashboardRecentCompletedTileHint', lang).replace('{n}', String(recentLimit))}
            </p>
          </ClickableTile>

          <ClickableTile active={expandedPanel === 'people'} onClick={() => togglePanel('people')}>
            <StatTile
              title={t('adminDashboardParticipantsTile', lang)}
              value={`${stats.evaluators_completed}/${stats.unique_evaluators}`}
              icon={Users}
              tone="brand"
              right={<ChevronDown className={`w-4 h-4 text-[var(--muted)] transition-transform ${expandedPanel === 'people' ? 'rotate-180' : ''}`} />}
              className="w-full"
            />
            <p className="text-xs text-[var(--muted)] mt-1 px-1">
              {stats.evaluators_completed} {t('adminDashboardEvaluatorsCompleted', lang).toLowerCase()} ·{' '}
              {stats.unique_evaluators} {t('adminDashboardEvaluators', lang).toLowerCase()} · {stats.unique_targets}{' '}
              {t('adminDashboardTargets', lang).toLowerCase()}
            </p>
          </ClickableTile>
        </div>

        {expandedPanel ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2">
                  {expandedPanel === 'progress' ? <BarChart3 className="w-5 h-5 text-[var(--brand)]" /> : null}
                  {expandedPanel === 'people' ? <Users className="w-5 h-5 text-[var(--brand)]" /> : null}
                  {expandedPanel === 'pending' ? <Clock className="w-5 h-5 text-[var(--warning)]" /> : null}
                  {expandedPanel === 'completed' ? <CheckCircle className="w-5 h-5 text-[var(--success)]" /> : null}
                  {panelTitle(expandedPanel)}
                </span>
                <div className="flex items-center gap-2">
                  {expandedPanel === 'pending' && pendingList.length > 0 ? (
                    <button
                      type="button"
                      onClick={printPendingReport}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--surface-2)]"
                    >
                      <Printer className="w-4 h-4" />
                      {t('printPdf', lang)}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setExpandedPanel(null)}
                    className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center gap-1 px-2 py-1"
                  >
                    <X className="w-4 h-4" />
                    {t('adminDashboardCloseDetail', lang)}
                  </button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              {expandedPanel === 'progress' && (
                <div className="p-6">
                  {byMatrix.length === 0 ? (
                    <p className="text-center text-[var(--muted)]">{t('noEvaluations', lang)}</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {byMatrix.map((row) => {
                        const pct = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0
                        return (
                          <div key={row.matrix_context} className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-2)]/50">
                            <p className="text-sm font-medium text-[var(--foreground)]">{row.label}</p>
                            <p className="text-xl font-bold mt-1">
                              {row.completed}<span className="text-sm font-normal text-[var(--muted)]"> / {row.total}</span>
                            </p>
                            <div className="mt-2 flex gap-2">
                              <Badge variant="success">{pct}%</Badge>
                              {row.pending > 0 ? <Badge variant="warning">{row.pending}</Badge> : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {expandedPanel === 'people' && (
                <div className="divide-y divide-[var(--border)] max-h-[420px] overflow-y-auto">
                  {evaluatorSummaries.length === 0 ? (
                    <p className="p-6 text-center text-[var(--muted)]">{t('noEvaluations', lang)}</p>
                  ) : (
                    evaluatorSummaries.map((ev) => (
                      <div key={ev.evaluator_id} className="px-6 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-[var(--surface-2)]">
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--foreground)]">{ev.name}</p>
                          {ev.department ? <p className="text-xs text-[var(--muted)]">{ev.department}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant={ev.will_evaluate_pending > 0 ? 'warning' : 'success'}>
                            {t('adminDashboardWillEvaluate', lang)}: {ev.will_evaluate_completed}/{ev.will_evaluate_total}
                          </Badge>
                          {ev.will_be_evaluated_total > 0 ? (
                            <Badge variant="info">
                              {t('adminDashboardWillBeEvaluated', lang)}: {ev.will_be_evaluated_completed}/{ev.will_be_evaluated_total}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {expandedPanel === 'pending' && (
                pendingList.length === 0 ? (
                  <p className="p-6 text-center text-[var(--muted)]">{t('noEvaluations', lang)}</p>
                ) : (
                  <>
                    {stats.pending > pendingList.length ? (
                      <p className="px-6 pt-4 pb-0 text-xs text-[var(--muted)]">
                        {t('adminDashboardPendingListNote', lang).replace('{n}', String(ADMIN_DASHBOARD_PENDING_LIST_LIMIT))}
                      </p>
                    ) : null}
                  <div id="admin-pending-report" className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--surface-2)] border-b border-[var(--border)] sticky top-0">
                        <tr>
                          <th className="text-left py-2 px-4 text-[var(--muted)]">{t('evaluatorLabel', lang)}</th>
                          <th className="text-left py-2 px-4 text-[var(--muted)]">{t('evaluatedPerson', lang)}</th>
                          <th className="text-left py-2 px-4 text-[var(--muted)]">{t('periods', lang)}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {pendingList.map((a) => (
                          <tr key={a.id}>
                            <td className="py-2 px-4">{a.evaluator?.name || '-'}</td>
                            <td className="py-2 px-4">{a.target?.name || '-'}</td>
                            <td className="py-2 px-4 text-[var(--muted)]">{periodLabel(a.evaluation_periods)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )
              )}

              {expandedPanel === 'completed' && (
                <div>
                  {stats.completed > recentAssignments.length && recentAssignments.length > 0 ? (
                    <p className="px-6 pt-4 pb-2 text-xs text-[var(--muted)] border-b border-[var(--border)]">
                      {t('adminDashboardRecentCompletedMore', lang)
                        .replace('{total}', String(stats.completed))
                        .replace('{n}', String(recentLimit))}
                    </p>
                  ) : null}
                <div className="divide-y divide-[var(--border)] max-h-[420px] overflow-y-auto">
                  {recentAssignments.length === 0 ? (
                    <p className="p-6 text-center text-[var(--muted)]">{t('noEvaluations', lang)}</p>
                  ) : (
                    recentAssignments.map((a) => (
                      <div key={a.id} className="px-6 py-3 flex justify-between gap-3 hover:bg-[var(--surface-2)]">
                        <div>
                          <p className="font-medium text-sm">
                            {a.evaluator?.name} → {a.target?.name}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            {matrixEvaluationContextLabel(a.matrix_context)}
                          </p>
                        </div>
                        <Badge variant="success">{t('doneLabel', lang)}</Badge>
                      </div>
                    ))
                  )}
                </div>
                </div>
              )}
            </CardBody>
          </Card>
        ) : null}

        <p className="text-xs text-[var(--muted)] flex flex-wrap gap-x-4 gap-y-1">
          <span>{t('users', lang)}: {stats.users}</span>
          <span>{t('activePeriodsShort', lang)}: {stats.periods}</span>
          <span>{t('totalAssignments', lang)}: {stats.assignments}</span>
        </p>
      </RequireSelection>
    </div>
  )
}
