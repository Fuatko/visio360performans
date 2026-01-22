'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button, StatTile } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { AssignmentWithRelations } from '@/types/database'
import { ClipboardList, CheckCircle, Clock, ArrowRight, Target, TrendingUp } from 'lucide-react'

export default function UserDashboard() {
  const lang = useLang()
  const { user } = useAuthStore()
  const [pendingEvaluations, setPendingEvaluations] = useState<AssignmentWithRelations[]>([])
  const [completedEvaluations, setCompletedEvaluations] = useState<AssignmentWithRelations[]>([])
  const [myResults, setMyResults] = useState<AssignmentWithRelations[]>([])
  const [loading, setLoading] = useState(true)

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
        <StatTile title={t('pendingEvaluations', lang)} value={pendingEvaluations.length} icon={ClipboardList} tone="warning" />
        <StatTile title={t('completedShort', lang)} value={completedEvaluations.length} icon={CheckCircle} tone="success" />
        <StatTile title={t('aboutMeEvaluations', lang)} value={myResults.length} icon={Target} tone="brand" />
        <StatTile title={t('completionRate', lang)} value={`${completionRate}%`} icon={TrendingUp} tone={completionRate >= 70 ? 'success' : completionRate >= 40 ? 'warning' : 'danger'} />
      </div>

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
                            {assignment.target?.department || assignment.evaluation_periods?.name}
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
                            {assignment.evaluation_periods?.name}
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
