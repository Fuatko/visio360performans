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
        <h1 className="text-2xl font-bold text-gray-900">📋 Değerlendirmelerim</h1>
        <p className="text-gray-500 mt-1">Yapmanız gereken değerlendirmeler</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`p-5 rounded-2xl text-left transition-all ${
            filter === 'all' 
              ? 'bg-[var(--brand-soft)] border border-indigo-200 text-slate-900 shadow-sm' 
              : 'bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <ClipboardList className={`w-6 h-6 mb-2 ${filter === 'all' ? 'text-indigo-700' : 'text-indigo-600'}`} />
          <div className={`text-3xl font-bold ${filter !== 'all' && 'text-gray-900'}`}>{assignments.length}</div>
          <div className={`text-sm ${filter === 'all' ? 'opacity-80' : 'text-gray-500'}`}>Toplam</div>
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`p-5 rounded-2xl text-left transition-all ${
            filter === 'pending' 
              ? 'bg-[var(--warning-soft)] border border-amber-200 text-slate-900 shadow-sm' 
              : 'bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <Clock className={`w-6 h-6 mb-2 ${filter === 'pending' ? 'text-amber-700' : 'text-amber-600'}`} />
          <div className={`text-3xl font-bold ${filter !== 'pending' && 'text-gray-900'}`}>{pendingCount}</div>
          <div className={`text-sm ${filter === 'pending' ? 'opacity-80' : 'text-gray-500'}`}>Bekleyen</div>
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`p-5 rounded-2xl text-left transition-all ${
            filter === 'completed' 
              ? 'bg-[var(--success-soft)] border border-emerald-200 text-slate-900 shadow-sm' 
              : 'bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <CheckCircle className={`w-6 h-6 mb-2 ${filter === 'completed' ? 'text-emerald-700' : 'text-emerald-600'}`} />
          <div className={`text-3xl font-bold ${filter !== 'completed' && 'text-gray-900'}`}>{completedCount}</div>
          <div className={`text-sm ${filter === 'completed' ? 'opacity-80' : 'text-gray-500'}`}>Tamamlanan</div>
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
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              {filter === 'pending' ? (
                <>
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <p>Tebrikler! Tüm değerlendirmeleriniz tamamlandı 🎉</p>
                </>
              ) : (
                <>
                  <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p>Henüz değerlendirme yok</p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredAssignments.map((assignment) => {
                const isSelf = assignment.evaluator_id === assignment.target_id
                const isPending = assignment.status === 'pending'
                const isActive = assignment.evaluation_periods?.status === 'active'
                
                return (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        assignment.status === 'completed' 
                          ? 'bg-emerald-100 text-emerald-600' 
                          : isSelf 
                            ? 'bg-blue-100 text-blue-600' 
                            : 'bg-amber-100 text-amber-600'
                      }`}>
                        {assignment.status === 'completed' ? '✅' : isSelf ? '🔵' : '👤'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {isSelf ? 'Öz Değerlendirme' : assignment.target?.name || '-'}
                        </p>
                        <p className="text-sm text-gray-500">
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
                          href={`/evaluation/${assignment.slug || assignment.id}`}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
                        >
                          Değerlendir
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      ) : assignment.status === 'completed' ? (
                        <span className="text-sm text-gray-400">
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
