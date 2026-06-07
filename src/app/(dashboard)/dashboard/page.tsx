'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button, StatTile, Select } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { AssignmentWithRelations } from '@/types/database'
import type { DashboardPeriodSummary } from '@/lib/dashboard-evaluations-filter'
import { ClipboardList, CheckCircle, Clock, ArrowRight, Target, TrendingUp, X, BarChart3 } from 'lucide-react'

const PERIOD_STORAGE_KEY = 'visio360_dashboard_period_id'

export default function UserDashboard() {
  const lang = useLang()
  const { user } = useAuthStore()
  const [allPending, setAllPending] = useState<AssignmentWithRelations[]>([])
  const [allCompleted, setAllCompleted] = useState<AssignmentWithRelations[]>([])
  const [allAboutMe, setAllAboutMe] = useState<AssignmentWithRelations[]>([])
  const [byPeriod, setByPeriod] = useState<DashboardPeriodSummary[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [activeReport, setActiveReport] = useState<'pending' | 'completed' | 'about_me' | null>(null)

  const periodLabel = (p: { name?: string | null; name_en?: string | null; name_fr?: string | null } | null | undefined) => {
    if (!p) return ''
    if (lang === 'fr') return String(p.name_fr || p.name || '')
    if (lang === 'en') return String(p.name_en || p.name || '')
    return String(p.name || '')
  }

  const periodLabelFromSummary = (row: DashboardPeriodSummary) => {
    if (lang === 'fr') return String(row.name_fr || row.name || '')
    if (lang === 'en') return String(row.name_en || row.name || '')
    return String(row.name || '')
  }

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const resp = await fetch('/api/dashboard/summary', { method: 'GET', cache: 'no-store' })
      const payload = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        by_period?: DashboardPeriodSummary[]
        lists?: {
          pending?: AssignmentWithRelations[]
          completed?: AssignmentWithRelations[]
          about_me?: AssignmentWithRelations[]
        }
      }
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')

      setByPeriod(payload.by_period || [])
      setAllPending((payload.lists?.pending || []) as AssignmentWithRelations[])
      setAllCompleted((payload.lists?.completed || []) as AssignmentWithRelations[])
      setAllAboutMe((payload.lists?.about_me || []) as AssignmentWithRelations[])
    } catch (error) {
      console.error('Load error:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user, loadData])

  useEffect(() => {
    if (!byPeriod.length) return
    if (selectedPeriodId && byPeriod.some((p) => p.period_id === selectedPeriodId)) return
    let saved = ''
    try {
      saved = window.localStorage.getItem(PERIOD_STORAGE_KEY) || ''
    } catch {
      saved = ''
    }
    const fromStorage = saved && byPeriod.some((p) => p.period_id === saved) ? saved : ''
    const withPending = byPeriod.find((p) => p.pending > 0 && p.period_status === 'active')
    const active = byPeriod.find((p) => p.period_status === 'active')
    const next = fromStorage || withPending?.period_id || active?.period_id || byPeriod[0]?.period_id || ''
    if (next) setSelectedPeriodId(next)
  }, [byPeriod, selectedPeriodId])

  useEffect(() => {
    if (!selectedPeriodId) return
    try {
      window.localStorage.setItem(PERIOD_STORAGE_KEY, selectedPeriodId)
    } catch {
      /* ignore */
    }
  }, [selectedPeriodId])

  const inPeriod = useCallback(
    (a: { period_id?: string }) => !selectedPeriodId || String(a.period_id) === selectedPeriodId,
    [selectedPeriodId]
  )

  const pendingEvaluations = useMemo(() => allPending.filter(inPeriod), [allPending, inPeriod])
  const completedEvaluations = useMemo(() => allCompleted.filter(inPeriod), [allCompleted, inPeriod])
  const myResults = useMemo(() => allAboutMe.filter(inPeriod), [allAboutMe, inPeriod])

  const counts = useMemo(
    () => ({
      pending: pendingEvaluations.length,
      completed: completedEvaluations.length,
      about_me: myResults.length,
      pending_total: allPending.length,
      completed_total: allCompleted.length,
      about_me_total: allAboutMe.length,
    }),
    [pendingEvaluations, completedEvaluations, myResults, allPending, allCompleted, allAboutMe]
  )

  const periodOptions = useMemo(
    () =>
      byPeriod.map((p) => ({
        value: p.period_id,
        label: periodLabelFromSummary(p),
      })),
    [byPeriod, lang]
  )

  const selectedPeriodSummary = byPeriod.find((p) => p.period_id === selectedPeriodId)

  const totalAssignments = counts.pending + counts.completed
  const completionRate =
    totalAssignments > 0 ? Math.round((counts.completed / totalAssignments) * 100) : 0

  const reportTitle = (k: typeof activeReport) => {
    if (k === 'pending') return t('pendingEvaluations', lang)
    if (k === 'completed') return t('completedEvaluationsTitle', lang)
    if (k === 'about_me') return t('aboutMeEvaluations', lang)
    return ''
  }

  const reportRows = (k: typeof activeReport) => {
    const list =
      k === 'pending' ? pendingEvaluations : k === 'completed' ? completedEvaluations : k === 'about_me' ? myResults : []
    return (list || []).map((a) => {
      const isSelf = String(a.evaluator_id) === String(a.target_id)
      const name = isSelf ? t('selfEvaluation', lang) : (a.target?.name || a.evaluator?.name || '-')
      return {
        id: a.id,
        name,
        period: periodLabel(a.evaluation_periods) || '-',
        department: (a.target as { department?: string } | null)?.department || '',
        isPending: String((a as { status?: string }).status || '') === 'pending',
      }
    })
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {t('welcome', lang)}, {user?.name?.split(' ')[0]}! 👋
        </h1>
        <p className="text-[var(--muted)] mt-1">{t('welcomeSubtitle', lang)}</p>
      </div>

      {byPeriod.length > 0 ? (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 max-w-xl">
            <label className="block text-sm font-medium text-[var(--muted)] mb-1">
              {t('dashboardSelectPeriod', lang)}
            </label>
            <Select
              options={periodOptions}
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              placeholder={t('dashboardSelectPeriod', lang)}
            />
          </div>
          {selectedPeriodSummary ? (
            <p className="text-sm text-[var(--muted)] sm:pb-2">
              {t('dashboardStatsForPeriod', lang)}:{' '}
              <strong className="text-[var(--foreground)]">{periodLabelFromSummary(selectedPeriodSummary)}</strong>
            </p>
          ) : null}
        </div>
      ) : null}

      {byPeriod.length > 1 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('dashboardPeriodOverview', lang)}</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-[var(--border)]">
              {byPeriod.map((p) => {
                const active = p.period_id === selectedPeriodId
                return (
                  <button
                    key={p.period_id}
                    type="button"
                    onClick={() => setSelectedPeriodId(p.period_id)}
                    className={`w-full text-left px-6 py-4 hover:bg-[var(--surface-2)] transition-colors ${
                      active ? 'bg-[var(--brand-soft)]/40' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--foreground)]">{periodLabelFromSummary(p)}</p>
                        {p.period_status !== 'active' ? (
                          <p className="text-xs text-[var(--muted)] mt-0.5">{t('periodClosed', lang)}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={p.pending > 0 ? 'warning' : 'gray'}>
                          {t('dashboardPendingAssignments', lang)}: {p.pending}
                        </Badge>
                        <Badge variant="success">
                          {t('dashboardCompletedAssignments', lang)}: {p.completed}
                        </Badge>
                        {p.about_me_completed > 0 ? (
                          <Badge variant="info">
                            {t('dashboardAboutMeInPeriod', lang)}: {p.about_me_completed}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <button type="button" className="text-left w-full block" onClick={() => setActiveReport('pending')}>
          <StatTile
            title={t('pendingEvaluations', lang)}
            value={counts.pending}
            icon={ClipboardList}
            tone="warning"
            className="cursor-pointer w-full"
            hint={t('dashboardPendingCountHint', lang)}
          />
        </button>
        <button type="button" className="text-left w-full block" onClick={() => setActiveReport('completed')}>
          <StatTile
            title={t('completedShort', lang)}
            value={counts.completed}
            icon={CheckCircle}
            tone="success"
            className="cursor-pointer w-full"
            hint={t('dashboardCompletedCountHint', lang)}
          />
        </button>
        <button type="button" className="text-left w-full block" onClick={() => setActiveReport('about_me')}>
          <StatTile
            title={t('aboutMeEvaluations', lang)}
            value={counts.about_me}
            icon={Target}
            tone="brand"
            className="cursor-pointer w-full"
          />
        </button>
        <StatTile
          title={t('completionRate', lang)}
          value={`${completionRate}%`}
          icon={TrendingUp}
          tone={completionRate >= 70 ? 'success' : completionRate >= 40 ? 'warning' : 'danger'}
          hint={t('dashboardCompletionRateHint', lang)}
        />
      </div>

      {byPeriod.length > 1 && counts.pending_total !== counts.pending ? (
        <p className="text-xs text-[var(--muted)] mb-6 -mt-4">
          {t('dashboardAllPeriods', lang)}: {t('pending', lang)} {counts.pending_total}, {t('completed', lang)}{' '}
          {counts.completed_total}
        </p>
      ) : null}

      {activeReport && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-4">
              <span>
                📄 {reportTitle(activeReport)}
                {selectedPeriodSummary ? (
                  <span className="block text-sm font-normal text-[var(--muted)] mt-1">
                    {periodLabelFromSummary(selectedPeriodSummary)}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => setActiveReport(null)}
                className="p-2 text-[var(--muted)] hover:bg-[var(--surface-2)] rounded-lg"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-6 text-center text-[var(--muted)]">{t('loading', lang)}</div>
            ) : reportRows(activeReport).length === 0 ? (
              <div className="p-6 text-center text-[var(--muted)]">{t('noEvaluationsYet', lang)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                    <tr>
                      <th className="text-left py-3 px-6 font-semibold text-[var(--muted)] text-sm">
                        {t('evaluatedPerson', lang)}
                      </th>
                      <th className="text-left py-3 px-6 font-semibold text-[var(--muted)] text-sm">
                        {t('periods', lang)}
                      </th>
                      <th className="text-left py-3 px-6 font-semibold text-[var(--muted)] text-sm">
                        {t('statusLabel', lang)}
                      </th>
                      <th className="text-right py-3 px-6 font-semibold text-[var(--muted)] text-sm">
                        {t('actionLabel', lang)}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {reportRows(activeReport).map((r) => (
                      <tr key={r.id} className="hover:bg-[var(--surface-2)]">
                        <td className="py-3 px-6">
                          <div className="font-medium text-[var(--foreground)]">{r.name}</div>
                          {r.department ? <div className="text-xs text-[var(--muted)]">{r.department}</div> : null}
                        </td>
                        <td className="py-3 px-6 text-[var(--muted)]">{r.period}</td>
                        <td className="py-3 px-6">
                          {activeReport === 'pending' ? (
                            <Badge variant="warning">{t('waiting', lang)}</Badge>
                          ) : (
                            <Badge variant="success">{t('doneLabel', lang)}</Badge>
                          )}
                        </td>
                        <td className="py-3 px-6 text-right">
                          {activeReport === 'pending' ? (
                            <Link
                              href={`/evaluation/${r.id}`}
                              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-[var(--brand)] bg-[var(--brand-soft)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)]"
                            >
                              {t('evaluate', lang)}
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                          ) : (
                            <span className="text-sm text-[var(--muted)]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[var(--warning)]" />
              {t('pendingListTitle', lang)}
              {selectedPeriodSummary ? (
                <span className="text-sm font-normal text-[var(--muted)]">
                  — {periodLabelFromSummary(selectedPeriodSummary)}
                </span>
              ) : null}
            </CardTitle>
            {counts.pending > 0 && (
              <Badge variant="warning">
                {counts.pending} {t('waitingLower', lang)}
              </Badge>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-6 text-center text-[var(--muted)]">{t('loading', lang)}</div>
            ) : counts.pending === 0 ? (
              <div className="p-6 text-center text-[var(--muted)]">
                <CheckCircle className="w-12 h-12 text-[var(--success)] mx-auto mb-3" />
                <p>{t('allDone', lang)} 🎉</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {pendingEvaluations.slice(0, 10).map((assignment) => {
                  const isSelf = assignment.evaluator_id === assignment.target_id
                  return (
                    <Link
                      key={assignment.id}
                      href={`/evaluation/${assignment.id}`}
                      className="flex items-center justify-between px-6 py-4 hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                            isSelf
                              ? 'bg-[var(--brand-soft)] text-[var(--brand)] border-[var(--brand)]/25'
                              : 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/25'
                          }`}
                        >
                          {isSelf ? '🔵' : '👤'}
                        </div>
                        <div>
                          <p className="font-medium text-[var(--foreground)]">
                            {isSelf ? t('selfEvaluation', lang) : assignment.target?.name}
                          </p>
                          <p className="text-sm text-[var(--muted)]">
                            {assignment.target?.department || periodLabel(assignment.evaluation_periods)}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-[var(--muted)]/70" />
                    </Link>
                  )
                })}
                {counts.pending > 10 ? (
                  <div className="px-6 py-3 text-sm text-[var(--muted)]">
                    +{counts.pending - 10} {t('evaluationsCount', lang)}
                  </div>
                ) : null}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[var(--success)]" />
              {t('completedEvaluationsTitle', lang)}
              {selectedPeriodSummary ? (
                <span className="text-sm font-normal text-[var(--muted)]">
                  — {periodLabelFromSummary(selectedPeriodSummary)}
                </span>
              ) : null}
            </CardTitle>
            <Badge variant="success">
              {counts.completed} {t('completedLower2', lang)}
            </Badge>
          </CardHeader>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-6 text-center text-[var(--muted)]">{t('loading', lang)}</div>
            ) : counts.completed === 0 ? (
              <div className="p-6 text-center text-[var(--muted)]">
                <p>{t('noCompletedEvaluations', lang)}</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {completedEvaluations.slice(0, 10).map((assignment) => {
                  const isSelf = assignment.evaluator_id === assignment.target_id
                  return (
                    <div key={assignment.id} className="flex items-center justify-between px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[var(--success-soft)] border border-[var(--success)]/25 rounded-xl flex items-center justify-center text-[var(--success)]">
                          ✅
                        </div>
                        <div>
                          <p className="font-medium text-[var(--foreground)]">
                            {isSelf ? t('selfEvaluation', lang) : assignment.target?.name}
                          </p>
                          <p className="text-sm text-[var(--muted)]">
                            {periodLabel(assignment.evaluation_periods)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="success">{t('doneLabel', lang)}</Badge>
                    </div>
                  )
                })}
                {counts.completed > 10 ? (
                  <div className="px-6 py-3 text-sm text-[var(--muted)]">
                    +{counts.completed - 10} {t('evaluationsCount', lang)}
                  </div>
                ) : null}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <Link
          href="/dashboard/results"
          className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-[var(--info-soft)] flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-[var(--info)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--foreground)]">{t('myResults', lang)}</p>
            <p className="text-xs text-[var(--muted)]">{t('myResultsSubtitle', lang)}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--muted)] ml-auto" />
        </Link>
        <Link
          href="/dashboard/development"
          className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-[var(--brand-soft)] flex items-center justify-center">
            <Target className="w-5 h-5 text-[var(--brand)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--foreground)]">{t('dashboardQuickDevelopment', lang)}</p>
            <p className="text-xs text-[var(--muted)]">{t('dashboardQuickDevelopmentHint', lang)}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--muted)] ml-auto" />
        </Link>
      </div>

      {counts.pending > 0 && (
        <Card className="mt-6">
          <CardBody>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-[var(--foreground)]">{t('quickAccess', lang)}</h3>
                <p className="text-sm text-[var(--muted)]">
                  {selectedPeriodSummary
                    ? `${periodLabelFromSummary(selectedPeriodSummary)}: ${counts.pending} değerlendirme bekliyor`
                    : `${counts.pending} değerlendirme bekliyor`}
                </p>
              </div>
              <Link href="/dashboard/evaluations">
                <Button>
                  {t('goToEvaluations', lang)}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
