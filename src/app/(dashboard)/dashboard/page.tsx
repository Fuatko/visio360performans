'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button, StatTile } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { AssignmentWithRelations } from '@/types/database'
import { ClipboardList, CheckCircle, Clock, ArrowRight, Target, TrendingUp, X } from 'lucide-react'

export default function UserDashboard() {
  const lang = useLang()
  const { user } = useAuthStore()
  const [pendingEvaluations, setPendingEvaluations] = useState<AssignmentWithRelations[]>([])
  const [completedEvaluations, setCompletedEvaluations] = useState<AssignmentWithRelations[]>([])
  const [myResults, setMyResults] = useState<AssignmentWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [activeReport, setActiveReport] = useState<'pending' | 'completed' | 'about_me' | null>(null)

  const periodLabel = (p: any) => {
    if (!p) return ''
    if (lang === 'fr') return String(p.name_fr || p.name || '')
    if (lang === 'en') return String(p.name_en || p.name || '')
    return String(p.name || '')
  }

  useEffect(() => {
    if (user) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const loadData = useCallback(async () => {
    if (!user) return

    try {
      // KVKK: evaluation tables are RLS deny-all for client. Fetch dashboard summary server-side.
      const resp = await fetch('/api/dashboard/summary', { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')

      setPendingEvaluations((payload?.lists?.pending || []) as AssignmentWithRelations[])
      setCompletedEvaluations((payload?.lists?.completed || []) as AssignmentWithRelations[])
      setMyResults((payload?.lists?.about_me || []) as AssignmentWithRelations[])
    } catch (error) {
      console.error('Load error:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  const totalAssignments = pendingEvaluations.length + completedEvaluations.length
  const completionRate = totalAssignments > 0 
    ? Math.round((completedEvaluations.length / totalAssignments) * 100) 
    : 0

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
      const name = isSelf ? t('selfEvaluation', lang) : (a.target?.name || '-')
      return {
        id: a.id,
        name,
        period: periodLabel(a.evaluation_periods) || '-',
        department: (a.target as any)?.department || '',
        isPending: String((a as any)?.status || '') === 'pending',
      }
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {t('welcome', lang)}, {user?.name?.split(' ')[0]}! 👋
        </h1>
        <p className="text-[var(--muted)] mt-1">
          {t('welcomeSubtitle', lang)}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <button type="button" className="text-left" onClick={() => setActiveReport('pending')}>
          <StatTile
            title={t('pendingEvaluations', lang)}
            value={pendingEvaluations.length}
            icon={ClipboardList}
            tone="warning"
            className="cursor-pointer"
          />
        </button>
        <button type="button" className="text-left" onClick={() => setActiveReport('completed')}>
          <StatTile
            title={t('completedShort', lang)}
            value={completedEvaluations.length}
            icon={CheckCircle}
            tone="success"
            className="cursor-pointer"
          />
        </button>
        <button type="button" className="text-left" onClick={() => setActiveReport('about_me')}>
          <StatTile
            title={t('aboutMeEvaluations', lang)}
            value={myResults.length}
            icon={Target}
            tone="brand"
            className="cursor-pointer"
          />
        </button>
        <StatTile
          title={t('completionRate', lang)}
          value={`${completionRate}%`}
          icon={TrendingUp}
          tone={completionRate >= 70 ? 'success' : completionRate >= 40 ? 'warning' : 'danger'}
        />
      </div>

      {/* Drill-down report */}
      {activeReport && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-4">
              <span>📄 {reportTitle(activeReport)}</span>
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
                      <th className="text-left py-3 px-6 font-semibold text-[var(--muted)] text-sm">{t('evaluatedPerson', lang)}</th>
                      <th className="text-left py-3 px-6 font-semibold text-[var(--muted)] text-sm">{t('periods', lang)}</th>
                      <th className="text-left py-3 px-6 font-semibold text-[var(--muted)] text-sm">{t('statusLabel', lang)}</th>
                      <th className="text-right py-3 px-6 font-semibold text-[var(--muted)] text-sm">{t('actionLabel', lang)}</th>
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
        {/* Pending Evaluations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[var(--warning)]" />
              {t('pendingListTitle', lang)}
            </CardTitle>
            {pendingEvaluations.length > 0 && (
              <Badge variant="warning">{pendingEvaluations.length} {t('waitingLower', lang)}</Badge>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-6 text-center text-[var(--muted)]">{t('loading', lang)}</div>
            ) : pendingEvaluations.length === 0 ? (
              <div className="p-6 text-center text-[var(--muted)]">
                <CheckCircle className="w-12 h-12 text-[var(--success)] mx-auto mb-3" />
                <p>{t('allDone', lang)} 🎉</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {pendingEvaluations.slice(0, 5).map((assignment) => {
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
              </div>
            )}
          </CardBody>
        </Card>

        {/* Completed Evaluations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[var(--success)]" />
              {t('completedEvaluationsTitle', lang)}
            </CardTitle>
            <Badge variant="success">{completedEvaluations.length} {t('completedLower2', lang)}</Badge>
          </CardHeader>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-6 text-center text-[var(--muted)]">{t('loading', lang)}</div>
            ) : completedEvaluations.length === 0 ? (
              <div className="p-6 text-center text-[var(--muted)]">
                <p>{t('noCompletedEvaluations', lang)}</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {completedEvaluations.slice(0, 5).map((assignment) => {
                  const isSelf = assignment.evaluator_id === assignment.target_id
                  return (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between px-6 py-4"
                    >
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
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Quick Actions */}
      {pendingEvaluations.length > 0 && (
        <Card className="mt-6">
          <CardBody>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-[var(--foreground)]">{t('quickAccess', lang)}</h3>
                <p className="text-sm text-[var(--muted)]">
                  {pendingEvaluations.length} değerlendirme bekliyor
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
