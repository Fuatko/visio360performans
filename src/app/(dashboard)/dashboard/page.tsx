'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button, StatTile } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { AssignmentWithRelations } from '@/types/database'
import { ClipboardList, CheckCircle, Clock, ArrowRight, Target, TrendingUp } from 'lucide-react'

export default function UserDashboard() {
  const { user } = useAuthStore()
  const [pendingEvaluations, setPendingEvaluations] = useState<AssignmentWithRelations[]>([])
  const [completedEvaluations, setCompletedEvaluations] = useState<AssignmentWithRelations[]>([])
  const [myResults, setMyResults] = useState<AssignmentWithRelations[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const loadData = async () => {
    if (!user) return

    try {
      // Benim yapacağım değerlendirmeler
      const { data: myAssignments } = await supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(name),
          target:target_id(name, department),
          evaluation_periods(name, status)
        `)
        .eq('evaluator_id', user.id)
        .order('created_at', { ascending: false })

      const pending = (myAssignments || []).filter(a => 
        a.status === 'pending' && a.evaluation_periods?.status === 'active'
      ) as AssignmentWithRelations[]
      
      const completed = (myAssignments || []).filter(a => 
        a.status === 'completed'
      ) as AssignmentWithRelations[]

      setPendingEvaluations(pending)
      setCompletedEvaluations(completed)

      // Benim sonuçlarım (benim için yapılan değerlendirmeler)
      const { data: resultsData } = await supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(name),
          evaluation_periods(name)
        `)
        .eq('target_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })

      setMyResults((resultsData || []) as AssignmentWithRelations[])
    } catch (error) {
      console.error('Load error:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalAssignments = pendingEvaluations.length + completedEvaluations.length
  const completionRate = totalAssignments > 0 
    ? Math.round((completedEvaluations.length / totalAssignments) * 100) 
    : 0

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          Hoş Geldiniz, {user?.name?.split(' ')[0]}! 👋
        </h1>
        <p className="text-[var(--muted)] mt-1">
          Değerlendirmelerinizi buradan takip edebilirsiniz.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatTile title="Bekleyen Değerlendirme" value={pendingEvaluations.length} icon={ClipboardList} tone="warning" />
        <StatTile title="Tamamlanan" value={completedEvaluations.length} icon={CheckCircle} tone="success" />
        <StatTile title="Hakkımdaki Değerlendirme" value={myResults.length} icon={Target} tone="brand" />
        <StatTile title="Tamamlanma Oranı" value={`${completionRate}%`} icon={TrendingUp} tone={completionRate >= 70 ? 'success' : completionRate >= 40 ? 'warning' : 'danger'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Evaluations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[var(--warning)]" />
              Bekleyen Değerlendirmeler
            </CardTitle>
            {pendingEvaluations.length > 0 && (
              <Badge variant="warning">{pendingEvaluations.length} bekliyor</Badge>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-6 text-center text-[var(--muted)]">Yükleniyor...</div>
            ) : pendingEvaluations.length === 0 ? (
              <div className="p-6 text-center text-[var(--muted)]">
                <CheckCircle className="w-12 h-12 text-[var(--success)] mx-auto mb-3" />
                <p>Tüm değerlendirmeleriniz tamamlandı! 🎉</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {pendingEvaluations.slice(0, 5).map((assignment) => {
                  const isSelf = assignment.evaluator_id === assignment.target_id
                  return (
                    <Link
                      key={assignment.id}
                      href={`/evaluation/${assignment.slug || assignment.id}`}
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
                            {isSelf ? 'Öz Değerlendirme' : assignment.target?.name}
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
              Tamamlanan Değerlendirmeler
            </CardTitle>
            <Badge variant="success">{completedEvaluations.length} tamamlandı</Badge>
          </CardHeader>
          <CardBody className="p-0">
            {loading ? (
              <div className="p-6 text-center text-[var(--muted)]">Yükleniyor...</div>
            ) : completedEvaluations.length === 0 ? (
              <div className="p-6 text-center text-[var(--muted)]">
                <p>Henüz tamamlanan değerlendirme yok</p>
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
                            {isSelf ? 'Öz Değerlendirme' : assignment.target?.name}
                          </p>
                          <p className="text-sm text-[var(--muted)]">
                            {assignment.evaluation_periods?.name}
                          </p>
                        </div>
                      </div>
                      <Badge variant="success">Tamamlandı</Badge>
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
                <h3 className="font-semibold text-[var(--foreground)]">Hızlı Erişim</h3>
                <p className="text-sm text-[var(--muted)]">
                  {pendingEvaluations.length} değerlendirme bekliyor
                </p>
              </div>
              <Link href="/dashboard/evaluations">
                <Button>
                  Değerlendirmelere Git
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
