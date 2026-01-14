'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
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
  const [stats, setStats] = useState<DashboardStats>({
    organizations: 0,
    users: 0,
    periods: 0,
    assignments: 0,
    completed: 0,
    pending: 0,
  })
  const [recentAssignments, setRecentAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // Load stats
      const [orgsRes, usersRes, periodsRes, assignmentsRes] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact' }),
        supabase.from('users').select('id', { count: 'exact' }).eq('status', 'active'),
        supabase.from('evaluation_periods').select('id', { count: 'exact' }),
        supabase.from('evaluation_assignments').select('id, status', { count: 'exact' }),
      ])

      const assignments = assignmentsRes.data || []
      const completed = assignments.filter(a => a.status === 'completed').length
      const pending = assignments.filter(a => a.status === 'pending').length

      setStats({
        organizations: orgsRes.count || 0,
        users: usersRes.count || 0,
        periods: periodsRes.count || 0,
        assignments: assignmentsRes.count || 0,
        completed,
        pending,
      })

      // Load recent assignments
      const { data: recent } = await supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(name, department),
          target:target_id(name, department),
          evaluation_periods(name)
        `)
        .order('created_at', { ascending: false })
        .limit(10)

      setRecentAssignments(recent || [])
    } catch (error) {
      console.error('Dashboard error:', error)
    } finally {
      setLoading(false)
    }
  }

  const completionRate = stats.assignments > 0 
    ? Math.round((stats.completed / stats.assignments) * 100) 
    : 0

  const statCards = [
    {
      title: 'Kurumlar',
      value: stats.organizations,
      icon: Building2,
      color: 'from-blue-500 to-blue-600',
      shadow: 'shadow-blue-500/25',
    },
    {
      title: 'Kullanıcılar',
      value: stats.users,
      icon: Users,
      color: 'from-emerald-500 to-emerald-600',
      shadow: 'shadow-emerald-500/25',
    },
    {
      title: 'Aktif Dönemler',
      value: stats.periods,
      icon: Calendar,
      color: 'from-purple-500 to-purple-600',
      shadow: 'shadow-purple-500/25',
    },
    {
      title: 'Toplam Atama',
      value: stats.assignments,
      icon: Target,
      color: 'from-amber-500 to-amber-600',
      shadow: 'shadow-amber-500/25',
    },
    {
      title: 'Tamamlanan',
      value: stats.completed,
      icon: CheckCircle,
      color: 'from-green-500 to-green-600',
      shadow: 'shadow-green-500/25',
    },
    {
      title: 'Bekleyen',
      value: stats.pending,
      icon: Clock,
      color: 'from-orange-500 to-orange-600',
      shadow: 'shadow-orange-500/25',
    },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Hoş geldiniz, {user?.name}! Sistem durumuna genel bakış.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div
              key={index}
              className={`bg-gradient-to-br ${stat.color} p-5 rounded-2xl text-white shadow-lg ${stat.shadow}`}
            >
              <div className="flex items-center justify-between mb-3">
                <Icon className="w-6 h-6 opacity-80" />
                <TrendingUp className="w-4 h-4 opacity-60" />
              </div>
              <div className="text-3xl font-bold">{stat.value}</div>
              <div className="text-sm opacity-80 mt-1">{stat.title}</div>
            </div>
          )
        })}
      </div>

      {/* Completion Rate & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Completion Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
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
                    stroke="#e5e7eb"
                    strokeWidth="12"
                    fill="none"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke={completionRate >= 70 ? '#10b981' : completionRate >= 40 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="12"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${completionRate * 3.52} 352`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900">{completionRate}%</span>
                </div>
              </div>
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-500">
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
              <Clock className="w-5 h-5 text-blue-600" />
              Son Değerlendirmeler
            </CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-gray-100">
              {recentAssignments.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  Henüz değerlendirme yok
                </div>
              ) : (
                recentAssignments.slice(0, 5).map((assignment) => (
                  <div
                    key={assignment.id}
                    className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Target className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {assignment.evaluator?.name || '-'}
                          <span className="text-gray-400 mx-2">→</span>
                          {assignment.target?.name || '-'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {assignment.evaluation_periods?.name || '-'}
                        </p>
                      </div>
                    </div>
                    <Badge variant={assignment.status === 'completed' ? 'success' : 'warning'}>
                      {assignment.status === 'completed' ? '✅ Tamamlandı' : '⏳ Bekliyor'}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
