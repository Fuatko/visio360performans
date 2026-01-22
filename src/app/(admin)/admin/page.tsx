'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge, StatTile } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import {
  Building2,
  Users,
  Calendar,
  Target,
  CheckCircle,
  Clock,
  TrendingUp,
  BarChart3,
} from 'lucide-react'

interface DashboardStats {
  organizations: number
  users: number
  periods: number
  assignments: number
  completed: number
  pending: number
}

export default function AdminDashboard() {

  const lang = useLang()
  const { user } = useAuthStore()
  const { organizationId } = useAdminContextStore()
  const periodLabel = (p: any) => {
    if (!p) return '-'
    if (lang === 'fr') return String(p.name_fr || p.name || '-')
    if (lang === 'en') return String(p.name_en || p.name || '-')
    return String(p.name || '-')
  }
  const [stats, setStats] = useState<DashboardStats>({
    organizations: 0,
    users: 0,
    periods: 0,
    assignments: 0,
    completed: 0,
    pending: 0,
  })
  type RecentAssignment = {
    id: string
    status: string
    evaluator?: { name?: string | null; department?: string | null } | null
    target?: { name?: string | null; department?: string | null } | null
    evaluation_periods?: { name?: string | null } | null
  }
  const [recentAssignments, setRecentAssignments] = useState<RecentAssignment[]>([])

  const loadDashboardData = useCallback(async (orgId: string) => {
    try {
      // KVKK: evaluation tables are RLS deny-all for client. Fetch admin dashboard summary server-side.
      const qs = new URLSearchParams({ org_id: String(orgId || '') })
      const resp = await fetch(`/api/admin/dashboard?${qs.toString()}`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Dashboard verisi alınamadı')

      setStats(payload.stats || { organizations: 0, users: 0, periods: 0, assignments: 0, completed: 0, pending: 0 })
      setRecentAssignments((payload.recent_assignments || []) as RecentAssignment[])
    } catch (error) {
      console.error('Dashboard error:', error)
    }
  }, [])

  useEffect(() => {
    // KVKK: Kurum seçilmeden veri/istatistik göstermiyoruz
    if (!organizationId) return
    loadDashboardData(organizationId)
  }, [organizationId, loadDashboardData])

  const completionRate = stats.assignments > 0 
    ? Math.round((stats.completed / stats.assignments) * 100) 
    : 0

  const statCards = [
    {
      title: t('organizations', lang),
      value: stats.organizations,
      icon: Building2,
      tone: 'brand' as const,
    },
    {
      title: t('users', lang),
      value: stats.users,
      icon: Users,
      tone: 'success' as const,
    },
    {
      title: t('activePeriodsShort', lang),
      value: stats.periods,
      icon: Calendar,
      tone: 'info' as const,
    },
    {
      title: t('totalAssignments', lang),
      value: stats.assignments,
      icon: Target,
      tone: 'warning' as const,
    },
    {
      title: t('completedShort', lang),
      value: stats.completed,
      icon: CheckCircle,
      tone: 'success' as const,
    },
    {
      title: t('pending', lang),
      value: stats.pending,
      icon: Clock,
      tone: 'warning' as const,
    },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
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
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          {statCards.map((stat, index) => {
            const Icon = stat.icon
            return (
              <StatTile
                key={index}
                title={stat.title}
                value={stat.value}
                icon={Icon}
                tone={stat.tone}
                right={<TrendingUp className="w-4 h-4 text-[var(--muted)] opacity-40" />}
              />
            )
          })}
        </div>

        {/* Completion Rate & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Completion Rate */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[var(--brand)]" />
                {t('completionRate', lang)}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="flex flex-col items-center py-4">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="var(--border)"
                      strokeWidth="12"
                      fill="none"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke={completionRate >= 70 ? 'var(--success)' : completionRate >= 40 ? 'var(--warning)' : 'var(--danger)'}
                      strokeWidth="12"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${completionRate * 3.52} 352`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-bold text-[var(--foreground)]">{completionRate}%</span>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <p className="text-sm text-[var(--muted)]">
                    {t('completedOutOfTotal', lang)
                      .replace('{completed}', String(stats.completed))
                      .replace('{total}', String(stats.assignments))}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Recent Activity */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[var(--brand)]" />
                {t('recentCompletedEvaluations', lang)}
              </CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-[var(--border)]">
                {recentAssignments.length === 0 ? (
                  <div className="p-6 text-center text-[var(--muted)]">
                    {t('noEvaluations', lang)}
                  </div>
                ) : (
                  recentAssignments.slice(0, 5).map((assignment) => (
                    <div
                      key={assignment.id}
                      className="px-6 py-4 flex items-center justify-between hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[var(--brand-soft)] border border-[var(--brand)]/25 rounded-xl flex items-center justify-center">
                          <Target className="w-5 h-5 text-[var(--brand)]" />
                        </div>
                        <div>
                          <p className="font-medium text-[var(--foreground)]">
                            {assignment.evaluator?.name || '-'}
                            <span className="text-[var(--muted)] mx-2">→</span>
                            {assignment.target?.name || '-'}
                          </p>
                          <p className="text-sm text-[var(--muted)]">
                            {periodLabel(assignment.evaluation_periods)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="success">✅ {t('doneLabel', lang)}</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </RequireSelection>
    </div>
  )
}
