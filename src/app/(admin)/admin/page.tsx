'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge, StatTile } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'
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

  const { user } = useAuthStore()
  const { organizationId } = useAdminContextStore()
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
      type AssignmentStat = { id: string; status: 'pending' | 'completed' }

      // Load periods for org (used for all other filters)
      const { data: periodRows, count: periodsCount } = await supabase
        .from('evaluation_periods')
        .select('id', { count: 'exact' })
        .eq('organization_id', orgId)

      const periodIds = (periodRows || []).map((p) => p.id)

      const [orgsRes, usersRes] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact' }).eq('id', orgId),
        supabase.from('users').select('id', { count: 'exact' }).eq('status', 'active').eq('organization_id', orgId),
      ])

      const assignmentsRes =
        periodIds.length > 0
          ? await supabase
              .from('evaluation_assignments')
              .select('id, status', { count: 'exact' })
              .in('period_id', periodIds)
          : ({ data: [] as AssignmentStat[], count: 0 } as const)

      const assignments = ((assignmentsRes.data || []) as AssignmentStat[])
      const completed = assignments.filter((a) => a.status === 'completed').length
      const pending = assignments.filter((a) => a.status === 'pending').length

      setStats({
        organizations: orgsRes.count || 0,
        users: usersRes.count || 0,
        periods: periodsCount || 0,
        assignments: assignmentsRes.count || 0,
        completed,
        pending,
      })

      // Load recent assignments
      const { data: recent } = periodIds.length
        ? await supabase
            .from('evaluation_assignments')
            .select(
              `
              *,
              evaluator:evaluator_id(name, department),
              target:target_id(name, department),
              evaluation_periods(name)
            `
            )
            .in('period_id', periodIds)
            // "Son Değerlendirmeler" = son TAMAMLANAN değerlendirmeler
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(5)
        : { data: [] }

      setRecentAssignments(recent || [])
    } catch (error) {
      console.error('Dashboard error:', error)
    }
  }, [])

  useEffect(() => {
    // KVKK: Kurum seçilmeden veri/istatistik göstermiyoruz
    if (!organizationId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboardData(organizationId)
  }, [organizationId, loadDashboardData])

  const completionRate = stats.assignments > 0 
    ? Math.round((stats.completed / stats.assignments) * 100) 
    : 0

  const statCards = [
    {
      title: 'Kurumlar',
      value: stats.organizations,
      icon: Building2,
      tone: 'brand' as const,
    },
    {
      title: 'Kullanıcılar',
      value: stats.users,
      icon: Users,
      tone: 'success' as const,
    },
    {
      title: 'Aktif Dönemler',
      value: stats.periods,
      icon: Calendar,
      tone: 'info' as const,
    },
    {
      title: 'Toplam Atama',
      value: stats.assignments,
      icon: Target,
      tone: 'warning' as const,
    },
    {
      title: 'Tamamlanan',
      value: stats.completed,
      icon: CheckCircle,
      tone: 'success' as const,
    },
    {
      title: 'Bekleyen',
      value: stats.pending,
      icon: Clock,
      tone: 'warning' as const,
    },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Dashboard</h1>
        <p className="text-[var(--muted)] mt-1">
          Hoş geldiniz, {user?.name}! Sistem durumuna genel bakış.
        </p>
      </div>

      <RequireSelection
        enabled={!organizationId}
        title="KVKK / Güvenlik"
        message="Devam etmek için üst menüden kurum seçin."
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
                Tamamlanma Oranı
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
                    {stats.completed} / {stats.assignments} değerlendirme tamamlandı
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
                Son Tamamlanan Değerlendirmeler
              </CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-[var(--border)]">
                {recentAssignments.length === 0 ? (
                  <div className="p-6 text-center text-[var(--muted)]">
                    Henüz değerlendirme yok
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
                            {assignment.evaluation_periods?.name || '-'}
                          </p>
                        </div>
                      </div>
                      <Badge variant="success">✅ Tamamlandı</Badge>
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
