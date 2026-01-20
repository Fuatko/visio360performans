'use client'

import { useEffect, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { Card, CardHeader, CardBody, CardTitle, Button, Select, Badge, toast } from '@/components/ui'
import { EvaluationPeriod, Organization, User, AssignmentWithRelations } from '@/types/database'
import { RefreshCw, Search, List, User as UserIcon, Building2, Plus, Trash2, Loader2, Wand2 } from 'lucide-react'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'

type ViewMode = 'list' | 'person' | 'dept'

// Admin sayfaları tamamen client-side çalışıyor; build sırasında prerender denemelerini engelle.
export const dynamic = 'force-dynamic'

export default function MatrixPage() {

  const lang = useLang()
  const { organizationId } = useAdminContextStore()
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [assignments, setAssignments] = useState<AssignmentWithRelations[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedOrg, setSelectedOrg] = useState('')
  const [selectedDept, setSelectedDept] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  
  const [loading, setLoading] = useState(true)
  const [newEvaluator, setNewEvaluator] = useState('')
  const [newTarget, setNewTarget] = useState('')

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    rate: 0,
  })

  useEffect(() => {
    loadInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedPeriod && organizationId) {
      loadAssignments()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedOrg, organizationId])

  // KVKK: org context seçilince sayfa içi filtreyi sabitle
  useEffect(() => {
    if (!organizationId) return
    if (selectedOrg !== organizationId) setSelectedOrg(organizationId)
  }, [organizationId, selectedOrg])

  const loadInitialData = async () => {
    try {
      if (!organizationId) {
        setPeriods([])
        setOrganizations([])
        return
      }
      const resp = await fetch(`/api/admin/matrix-data?org_id=${encodeURIComponent(organizationId)}`)
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        if (resp.status === 401 || resp.status === 403) toast('Güvenlik oturumu bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.', 'warning')
        throw new Error(payload?.error || 'Veriler alınamadı')
      }
      setPeriods((payload.periods || []) as any)
      setOrganizations((payload.organizations || []) as any)
    } catch (error) {
      console.error('Initial load error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAssignments = async () => {
    if (!selectedPeriod || !organizationId) return
    
    setLoading(true)
    try {
      const resp = await fetch(
        `/api/admin/matrix-data?org_id=${encodeURIComponent(organizationId)}&period_id=${encodeURIComponent(selectedPeriod)}`
      )
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        if (resp.status === 401 || resp.status === 403) toast('Güvenlik oturumu bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.', 'warning')
        throw new Error(payload?.error || 'Veriler alınamadı')
      }
      setUsers((payload.users || []) as any)
      setDepartments((payload.departments || []) as any)
      setAssignments((payload.assignments || []) as any)
      setStats(payload.stats || { total: 0, completed: 0, pending: 0, rate: 0 })
    } catch (error: unknown) {
      console.error('Load assignments error:', error)
      toast(t('dataLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }

  const filteredAssignments = assignments.filter(a => {
    const evalName = a.evaluator?.name?.toLowerCase() || ''
    const targetName = a.target?.name?.toLowerCase() || ''
    const evalDept = a.evaluator?.department || ''
    const targetDept = a.target?.department || ''
    
    const matchesDept = !selectedDept || evalDept === selectedDept || targetDept === selectedDept
    const matchesSearch = !searchTerm || 
      evalName.includes(searchTerm.toLowerCase()) || 
      targetName.includes(searchTerm.toLowerCase())
    
    return matchesDept && matchesSearch
  })

  const addAssignment = async () => {
    if (!selectedPeriod || !newEvaluator || !newTarget) {
      toast('Dönem, değerlendiren ve değerlendirilen seçin', 'error')
      return
    }

    // Check if exists
    const exists = assignments.find(a => 
      a.evaluator_id === newEvaluator && a.target_id === newTarget
    )
    if (exists) {
      toast(t('assignmentAlreadyExists', lang), 'error')
      return
    }

    try {
      // Preferred: server-side admin API (KVKK)
      const resp = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriod, evaluator_id: newEvaluator, target_id: newTarget }),
      })
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}))
        if (resp.status === 401 || resp.status === 403) {
          toast('Güvenlik oturumu bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.', 'warning')
          return
        }
        if ((payload as any)?.error) toast(String((payload as any).error), 'error')
        else toast('Ekleme hatası', 'error')
        return
      }

      toast(t('assignmentAdded', lang), 'success')
      loadAssignments()
      setNewEvaluator('')
      setNewTarget('')
    } catch (error: unknown) {
      console.error('Add assignment error:', error)
      toast('Ekleme hatası', 'error')
    }
  }

  const ensureSelfAssignments = async () => {
    if (!selectedPeriod || !organizationId) return
    setLoading(true)
    try {
      const resp = await fetch('/api/admin/ensure-self-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriod, organization_id: organizationId }),
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          toast('Güvenlik oturumu bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.', 'warning')
          return
        }
        if ((payload as any)?.error) toast(String((payload as any).error), 'error')
        else toast('Öz değerlendirme atamaları oluşturulamadı', 'error')
        return
      } else {
        const created = Number((payload as any)?.created || 0)
        if (created > 0) toast(`Öz değerlendirme atamaları oluşturuldu: ${created} kişi`, 'success')
        else toast('Tüm kullanıcılar için öz değerlendirme ataması zaten mevcut', 'info')
        await loadAssignments()
      }
    } catch (err: any) {
      console.error('ensureSelfAssignments error:', err)
      toast(err?.message || 'Öz değerlendirme atamaları oluşturulamadı', 'error')
    } finally {
      setLoading(false)
    }
  }

  const deleteAssignment = async (id: string) => {
    if (!confirm('Bu atamayı silmek istediğinize emin misiniz?')) return

    try {
      const resp = await fetch('/api/admin/assignments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}))
        if (resp.status === 401 || resp.status === 403) {
          toast('Güvenlik oturumu bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.', 'warning')
          return
        }
        if ((payload as any)?.error) toast(String((payload as any).error), 'error')
        else toast('Silme hatası', 'error')
        return
      }
      toast(t('assignmentDeleted', lang), 'success')
      loadAssignments()
    } catch (error: unknown) {
      console.error('Delete assignment error:', error)
      toast('Silme hatası', 'error')
    }
  }

  // Group by person
  const groupByPerson = () => {
    const byPerson: Record<string, { 
      name: string
      dept: string
      willEvaluate: AssignmentWithRelations[]
      willBeEvaluatedBy: AssignmentWithRelations[]
    }> = {}

    filteredAssignments.forEach(a => {
      const evalId = a.evaluator_id
      const evalName = a.evaluator?.name || '-'
      const evalDept = a.evaluator?.department || '-'

      if (!byPerson[evalId]) {
        byPerson[evalId] = { name: evalName, dept: evalDept, willEvaluate: [], willBeEvaluatedBy: [] }
      }
      byPerson[evalId].willEvaluate.push(a)
    })

    filteredAssignments.forEach(a => {
      const targetId = a.target_id
      const targetName = a.target?.name || '-'
      const targetDept = a.target?.department || '-'

      if (!byPerson[targetId]) {
        byPerson[targetId] = { name: targetName, dept: targetDept, willEvaluate: [], willBeEvaluatedBy: [] }
      }
      byPerson[targetId].willBeEvaluatedBy.push(a)
    })

    return byPerson
  }

  // Group by department
  const groupByDept = () => {
    const byDept: Record<string, {
      assignments: AssignmentWithRelations[]
      persons: Set<string>
      completed: number
      pending: number
    }> = {}

    filteredAssignments.forEach(a => {
      const dept = a.evaluator?.department || 'Belirtilmemiş'
      
      if (!byDept[dept]) {
        byDept[dept] = { assignments: [], persons: new Set(), completed: 0, pending: 0 }
      }
      byDept[dept].assignments.push(a)
      byDept[dept].persons.add(a.evaluator_id)
      if (a.status === 'completed') byDept[dept].completed++
      else byDept[dept].pending++
    })

    return byDept
  }

  return (
    <RequireSelection enabled={!organizationId} message="KVKK için: önce üst bardan kurum seçmelisiniz.">
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🎯 {t('matrix', lang)}</h1>
        <p className="text-gray-500 mt-1">Kişi bazlı değerlendirme atamalarını görüntüleyin ve yönetin</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🔍 Filtreler</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-64">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Dönem</label>
              <Select
                options={periods.map(p => ({ value: p.id, label: p.name }))}
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                placeholder="Dönem Seçin"
              />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Kurum</label>
              <Select
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                value={selectedOrg}
                onChange={() => {}}
                placeholder="Kurum sabit (KVKK)"
              />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Departman</label>
              <Select
                options={departments.map(d => ({ value: d, label: d }))}
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                placeholder="Tüm Departmanlar"
              />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Kişi Ara</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="İsim yazın..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
            <Button onClick={loadAssignments} variant="secondary">
              <RefreshCw className="w-4 h-4" />
              Yenile
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Stats */}
      {selectedPeriod && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
            <div className="text-3xl font-bold text-slate-900">{stats.total}</div>
            <div className="text-sm text-slate-500">Toplam Atama</div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
            <div className="text-3xl font-bold text-slate-900">{stats.completed}</div>
            <div className="text-sm text-slate-500">Tamamlanan</div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
            <div className="text-3xl font-bold text-slate-900">{stats.pending}</div>
            <div className="text-sm text-slate-500">Bekleyen</div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
            <div className="text-3xl font-bold text-slate-900">{stats.rate}%</div>
            <div className="text-sm text-slate-500">Tamamlanma Oranı</div>
          </div>
        </div>
      )}

      {/* View Mode Toggle & List */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>📊 Değerlendirme Listesi</CardTitle>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant={viewMode === 'list' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
              Liste
            </Button>
            <Button 
              size="sm" 
              variant={viewMode === 'person' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('person')}
            >
              <UserIcon className="w-4 h-4" />
              Kişi Bazlı
            </Button>
            <Button 
              size="sm" 
              variant={viewMode === 'dept' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('dept')}
            >
              <Building2 className="w-4 h-4" />
              Departman Bazlı
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : !selectedPeriod ? (
            <p className="text-center text-gray-500 py-12">{t('matrixSelectPeriod', lang)}</p>
          ) : viewMode === 'list' ? (
            // List View
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">Değerlendiren</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">Departman</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-600 text-sm">→</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">Değerlendirilecek</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">Departman</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">Tür</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">Durum</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600 text-sm">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-500">{t('assignmentNotFound', lang)}</td>
                    </tr>
                  ) : (
                    filteredAssignments.map((a) => {
                      const isSelf = a.evaluator_id === a.target_id
                      return (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-900">{a.evaluator?.name || '-'}</td>
                          <td className="py-3 px-4 text-sm text-gray-500">{a.evaluator?.department || '-'}</td>
                          <td className="py-3 px-4 text-center text-gray-400">→</td>
                          <td className="py-3 px-4 font-medium text-gray-900">{a.target?.name || '-'}</td>
                          <td className="py-3 px-4 text-sm text-gray-500">{a.target?.department || '-'}</td>
                          <td className="py-3 px-4">
                            <Badge variant={isSelf ? 'info' : 'gray'}>
                              {isSelf ? '🔵 Öz' : '👥 Peer'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={a.status === 'completed' ? 'success' : 'warning'}>
                              {a.status === 'completed' ? '✅ Tamamlandı' : '⏳ Bekliyor'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => deleteAssignment(a.id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
              <p className="text-sm text-gray-500 mt-4">Toplam {filteredAssignments.length} atama gösteriliyor</p>
            </div>
          ) : viewMode === 'person' ? (
            // Person View
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Object.entries(groupByPerson()).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([personId, data]) => {
                const evalCount = data.willEvaluate.length
                const beEvalCount = data.willBeEvaluatedBy.length
                const completedEval = data.willEvaluate.filter(a => a.status === 'completed').length
                
                return (
                  <div key={personId} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-semibold text-gray-900">{data.name}</h4>
                        <p className="text-sm text-gray-500">{data.dept}</p>
                      </div>
                      <Badge variant="info">{completedEval}/{evalCount}</Badge>
                    </div>
                    
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-blue-600 mb-2">📤 Değerlendirecekleri ({evalCount})</p>
                      <div className="flex flex-wrap gap-1">
                        {data.willEvaluate.slice(0, 8).map(a => {
                          const statusColor = a.status === 'completed' ? '#10b981' : '#f59e0b'
                          const isSelf = a.evaluator_id === a.target_id
                          return (
                            <span 
                              key={a.id} 
                              className="text-xs px-2 py-1 rounded-full bg-white border"
                              style={{ borderLeftColor: statusColor, borderLeftWidth: 3 }}
                            >
                              {a.target?.name?.split(' ')[0]}{isSelf ? ' (Öz)' : ''}
                            </span>
                          )
                        })}
                        {evalCount > 8 && <span className="text-xs text-gray-400">+{evalCount - 8}</span>}
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-xs font-semibold text-emerald-600 mb-2">📥 Değerlendirenler ({beEvalCount})</p>
                      <div className="flex flex-wrap gap-1">
                        {data.willBeEvaluatedBy.slice(0, 8).map(a => {
                          const statusColor = a.status === 'completed' ? '#10b981' : '#f59e0b'
                          return (
                            <span 
                              key={a.id} 
                              className="text-xs px-2 py-1 rounded-full bg-white border"
                              style={{ borderLeftColor: statusColor, borderLeftWidth: 3 }}
                            >
                              {a.evaluator?.name?.split(' ')[0]}
                            </span>
                          )
                        })}
                        {beEvalCount > 8 && <span className="text-xs text-gray-400">+{beEvalCount - 8}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Department View
            <div className="space-y-4">
              {Object.entries(groupByDept()).sort((a, b) => a[0].localeCompare(b[0])).map(([dept, data]) => {
                const total = data.assignments.length
                const rate = Math.round((data.completed / total) * 100)
                const barColor = rate >= 70 ? '#10b981' : rate >= 40 ? '#f59e0b' : '#ef4444'
                
                return (
                  <div key={dept} className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h4 className="font-semibold text-gray-900">🏢 {dept}</h4>
                        <p className="text-sm text-gray-500">{data.persons.size} kişi, {total} atama</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold" style={{ color: barColor }}>{rate}%</div>
                        <p className="text-xs text-gray-500">{data.completed}/{total} tamamlandı</p>
                      </div>
                    </div>
                    <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${rate}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Add New Assignment */}
      <Card>
        <CardHeader>
          <CardTitle>➕ {t('addAssignmentTitle', lang)}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-56">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Değerlendiren</label>
              <Select
                options={users.map(u => ({ value: u.id, label: `${u.name} • ${u.email} (${u.department || '-'})` }))}
                value={newEvaluator}
                onChange={(e) => setNewEvaluator(e.target.value)}
                placeholder={t('selectPerson', lang)}
              />
            </div>
            <div className="w-56">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Değerlendirilecek</label>
              <Select
                options={users.map(u => ({ value: u.id, label: `${u.name} • ${u.email} (${u.department || '-'})` }))}
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                placeholder={t('selectPerson', lang)}
              />
            </div>
            <Button onClick={addAssignment} variant="success">
              <Plus className="w-4 h-4" />
              Ekle
            </Button>
            <Button onClick={ensureSelfAssignments} variant="secondary" disabled={!selectedPeriod}>
              <Wand2 className="w-4 h-4" />
              Öz Değerlendirmeleri Otomatik Oluştur
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
    </RequireSelection>
  )
}
