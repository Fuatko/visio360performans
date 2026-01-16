'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { ClipboardList, CheckCircle, Clock, ArrowRight, Loader2 } from 'lucide-react'

interface Assignment {
  id: string
  evaluator_id: string
  target_id: string
  status: string
  slug: string | null
  completed_at: string | null
  target: { name: string; department: string } | null
  evaluation_periods: { name: string; status: string } | null
}

export default function EvaluationsPage() {
  const { user } = useAuthStore()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')

  useEffect(() => {
    if (user) loadAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const loadAssignments = async () => {
    if (!user) return

    try {
      const { data } = await supabase
        .from('evaluation_assignments')
        .select(`
          *,
          target:target_id(name, department),
          evaluation_periods(name, status)
        `)
        .eq('evaluator_id', user.id)
        .order('created_at', { ascending: false })

      setAssignments((data || []) as Assignment[])
    } catch (error) {
      console.error('Load error:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAssignments = assignments.filter(a => {
    if (filter === 'pending') return a.status === 'pending' && a.evaluation_periods?.status === 'active'
    if (filter === 'completed') return a.status === 'completed'
    return true
  })

  const pendingCount = assignments.filter(a => a.status === 'pending' && a.evaluation_periods?.status === 'active').length
  const completedCount = assignments.filter(a => a.status === 'completed').length

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">📋 Değerlendirmelerim</h1>
        <p className="text-[var(--muted)] mt-1">Yapmanız gereken değerlendirmeler</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`text-left transition-all bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md ${
            filter === 'all' ? 'ring-2 ring-[var(--brand)]/20' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center border bg-[var(--brand-soft)] border-[var(--brand)]/25">
              <ClipboardList className="w-6 h-6 text-[var(--brand)]" />
            </div>
          </div>
          <div className="mt-4 text-3xl font-bold text-[var(--foreground)]">{assignments.length}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Toplam</div>
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`text-left transition-all bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md ${
            filter === 'pending' ? 'ring-2 ring-[var(--warning)]/20' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center border bg-[var(--warning-soft)] border-[var(--warning)]/25">
              <Clock className="w-6 h-6 text-[var(--warning)]" />
            </div>
          </div>
          <div className="mt-4 text-3xl font-bold text-[var(--foreground)]">{pendingCount}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Bekleyen</div>
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`text-left transition-all bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md ${
            filter === 'completed' ? 'ring-2 ring-[var(--success)]/20' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center border bg-[var(--success-soft)] border-[var(--success)]/25">
              <CheckCircle className="w-6 h-6 text-[var(--success)]" />
            </div>
          </div>
          <div className="mt-4 text-3xl font-bold text-[var(--foreground)]">{completedCount}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">Tamamlanan</div>
        </button>
      </div>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filter === 'all' && 'Tüm Değerlendirmeler'}
            {filter === 'pending' && 'Bekleyen Değerlendirmeler'}
            {filter === 'completed' && 'Tamamlanan Değerlendirmeler'}
          </CardTitle>
          <Badge variant={filter === 'pending' ? 'warning' : filter === 'completed' ? 'success' : 'info'}>
            {filteredAssignments.length} değerlendirme
          </Badge>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="py-12 text-center text-[var(--muted)]">
              {filter === 'pending' ? (
                <>
                  <CheckCircle className="w-12 h-12 text-[var(--success)] mx-auto mb-3" />
                  <p>Tebrikler! Tüm değerlendirmeleriniz tamamlandı 🎉</p>
                </>
              ) : (
                <>
                  <ClipboardList className="w-12 h-12 text-[var(--muted)]/40 mx-auto mb-3" />
                  <p>Henüz değerlendirme yok</p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {filteredAssignments.map((assignment) => {
                const isSelf = assignment.evaluator_id === assignment.target_id
                const isPending = assignment.status === 'pending'
                const isActive = assignment.evaluation_periods?.status === 'active'
                
                return (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between px-6 py-4 hover:bg-[var(--surface-2)] transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        assignment.status === 'completed' 
                          ? 'bg-[var(--success-soft)] text-[var(--success)]' 
                          : isSelf 
                            ? 'bg-[var(--brand-soft)] text-[var(--brand)]' 
                            : 'bg-[var(--warning-soft)] text-[var(--warning)]'
                      }`}>
                        {assignment.status === 'completed' ? '✅' : isSelf ? '🔵' : '👤'}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--foreground)]">
                          {isSelf ? 'Öz Değerlendirme' : assignment.target?.name || '-'}
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {assignment.target?.department || '-'} • {assignment.evaluation_periods?.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <Badge variant={assignment.status === 'completed' ? 'success' : isActive ? 'warning' : 'gray'}>
                        {assignment.status === 'completed' 
                          ? '✅ Tamamlandı' 
                          : isActive 
                            ? '⏳ Bekliyor' 
                            : '🔒 Dönem Kapalı'}
                      </Badge>
                      
                      {isPending && isActive ? (
                        <Link
                          href={`/evaluation/${assignment.id}`}
                          className="flex items-center gap-2 px-4 py-2 bg-[var(--brand)] text-white rounded-xl hover:bg-[var(--brand-hover)] transition-colors font-medium text-sm"
                        >
                          Değerlendir
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      ) : assignment.status === 'completed' ? (
                        <span className="text-sm text-[var(--muted)]/70">
                          {assignment.completed_at 
                            ? new Date(assignment.completed_at).toLocaleDateString('tr-TR')
                            : '-'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
