'use client'

import { useEffect, useState } from 'react'
import { Card, CardBody, Button, Input, Select, Badge, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { EvaluationPeriod, Organization } from '@/types/database'
import { formatDate } from '@/lib/utils'
import { Plus, Edit2, Trash2, X, Loader2, Calendar } from 'lucide-react'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'

export default function PeriodsPage() {
  const { organizationId } = useAdminContextStore()
  const [periods, setPeriods] = useState<(EvaluationPeriod & { organizations?: Organization })[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState<EvaluationPeriod | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    organization_id: '',
    start_date: '',
    end_date: '',
    status: 'active' as EvaluationPeriod['status'],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!organizationId) {
      setPeriods([])
      setOrganizations([])
      setLoading(false)
      return
    }
    loadData(organizationId)
  }, [organizationId])

  const loadData = async (orgId: string) => {
    setLoading(true)
    try {
      const [periodsRes, orgsRes] = await Promise.all([
        supabase.from('evaluation_periods').select('*, organizations(*)').eq('organization_id', orgId).order('created_at', { ascending: false }),
        supabase.from('organizations').select('*').eq('id', orgId).order('name'),
      ])
      setPeriods(periodsRes.data || [])
      setOrganizations(orgsRes.data || [])
    } catch (error) {
      console.error('Load error:', error)
      toast('Veriler yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  const openModal = (period?: EvaluationPeriod) => {
    if (period) {
      setEditingPeriod(period)
      setFormData({
        name: period.name,
        organization_id: period.organization_id,
        start_date: period.start_date,
        end_date: period.end_date,
        status: period.status,
      })
    } else {
      setEditingPeriod(null)
      setFormData({
        name: '',
        organization_id: organizationId || '',
        start_date: '',
        end_date: '',
        status: 'active',
      })
    }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.organization_id || !formData.start_date || !formData.end_date) {
      toast('Tüm alanları doldurun', 'error')
      return
    }

    setSaving(true)
    try {
      if (editingPeriod) {
        const { error } = await supabase
          .from('evaluation_periods')
          .update(formData)
          .eq('id', editingPeriod.id)
        if (error) throw error
        toast('Dönem güncellendi', 'success')
      } else {
        const { error } = await supabase.from('evaluation_periods').insert(formData)
        if (error) throw error
        toast('Dönem eklendi', 'success')
      }
      setShowModal(false)
      if (organizationId) loadData(organizationId)
    } catch (error: any) {
      toast(error.message || 'Kayıt hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (period: EvaluationPeriod) => {
    if (!confirm(`${period.name} dönemini silmek istediğinize emin misiniz?`)) return

    try {
      const { error } = await supabase.from('evaluation_periods').delete().eq('id', period.id)
      if (error) throw error
      toast('Dönem silindi', 'success')
      if (organizationId) loadData(organizationId)
    } catch (error: any) {
      toast(error.message || 'Silme hatası', 'error')
    }
  }

  const statusColors: Record<string, 'success' | 'warning' | 'gray'> = {
    active: 'success',
    inactive: 'gray',
    completed: 'warning',
  }

  const statusLabels: Record<string, string> = {
    active: '🟢 Aktif',
    inactive: '⚪ Pasif',
    completed: '✅ Tamamlandı',
  }

  return (
    <RequireSelection enabled={!organizationId} message="KVKK için: önce üst bardan kurum seçmelisiniz.">
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 Dönemler</h1>
          <p className="text-gray-500 mt-1">Değerlendirme dönemlerini yönetin</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="w-5 h-5" />
          Yeni Dönem
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : periods.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Henüz dönem eklenmemiş</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Dönem Adı</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Kurum</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Başlangıç</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Bitiş</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Durum</th>
                    <th className="text-right py-4 px-6 font-semibold text-gray-600 text-sm">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {periods.map((period) => (
                    <tr key={period.id} className="hover:bg-gray-50">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-purple-600" />
                          </div>
                          <span className="font-medium text-gray-900">{period.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-gray-600">{period.organizations?.name || '-'}</td>
                      <td className="py-4 px-6 text-gray-600">{formatDate(period.start_date)}</td>
                      <td className="py-4 px-6 text-gray-600">{formatDate(period.end_date)}</td>
                      <td className="py-4 px-6">
                        <Badge variant={statusColors[period.status]}>
                          {statusLabels[period.status]}
                        </Badge>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openModal(period)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(period)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingPeriod ? 'Dönem Düzenle' : 'Yeni Dönem'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Input
                label="Dönem Adı *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Örn: 2026 Q1 Değerlendirmesi"
              />
              <Select
                label="Kurum *"
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                value={formData.organization_id}
                onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                placeholder="Kurum Seçin"
              />
              <Input
                label="Başlangıç Tarihi *"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
              <Input
                label="Bitiş Tarihi *"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
              <Select
                label="Durum"
                options={[
                  { value: 'active', label: '🟢 Aktif' },
                  { value: 'inactive', label: '⚪ Pasif' },
                  { value: 'completed', label: '✅ Tamamlandı' },
                ]}
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as EvaluationPeriod['status'] })}
              />
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                İptal
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Kaydet'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </RequireSelection>
  )
}
