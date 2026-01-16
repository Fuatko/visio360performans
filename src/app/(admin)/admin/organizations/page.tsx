'use client'

import { useEffect, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { Card, CardBody, Button, Input, Badge, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Organization } from '@/types/database'
import { Plus, Edit2, Trash2, X, Loader2, Building2 } from 'lucide-react'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'

export default function OrganizationsPage() {

  const lang = useLang()
  const { organizationId } = useAdminContextStore()
  const [organizations, setOrganizations] = useState<(Organization & { user_count?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!organizationId) {
      setOrganizations([])
      setLoading(false)
      return
    }
    loadOrganizations(organizationId)
  }, [organizationId])

  const loadOrganizations = async (orgId: string) => {
    setLoading(true)
    try {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .order('name')

      // Get user counts
      const orgsWithCounts = await Promise.all(
        (orgs || []).map(async (org) => {
          const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', org.id)
          return { ...org, user_count: count || 0 }
        })
      )

      setOrganizations(orgsWithCounts)
    } catch (error) {
      console.error('Load error:', error)
      toast(t('dataLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }

  const openModal = (org?: Organization) => {
    if (org) {
      setEditingOrg(org)
      setFormName(org.name)
    } else {
      setEditingOrg(null)
      setFormName('')
    }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast(t('orgNameRequired', lang), 'error')
      return
    }

    setSaving(true)
    try {
      if (editingOrg) {
        const { error } = await supabase
          .from('organizations')
          .update({ name: formName.trim() })
          .eq('id', editingOrg.id)
        if (error) throw error
        toast(t('orgUpdated', lang), 'success')
      } else {
        const { error } = await supabase
          .from('organizations')
          .insert({ name: formName.trim() })
        if (error) throw error
        toast(t('orgAdded', lang), 'success')
      }
      setShowModal(false)
      if (organizationId) loadOrganizations(organizationId)
    } catch (error: any) {
      toast(error.message || 'Kayıt hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (org: Organization) => {
    if (!confirm(`${org.name} kurumunu silmek istediğinize emin misiniz?`)) return

    try {
      const { error } = await supabase.from('organizations').delete().eq('id', org.id)
      if (error) throw error
      toast(t('orgDeleted', lang), 'success')
      if (organizationId) loadOrganizations(organizationId)
    } catch (error: any) {
      toast(error.message || t('deleteError', lang), 'error')
    }
  }

  return (
    <RequireSelection enabled={!organizationId} message="KVKK için: önce üst bardan kurum seçmelisiniz.">
      <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏢 {t('organizations', lang)}</h1>
          <p className="text-gray-500 mt-1">Sistem kurumlarını yönetin</p>
        </div>
        <Button onClick={() => openModal()} disabled>
          <Plus className="w-5 h-5" />
          {t('newOrg', lang)} (KVKK)
        </Button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : organizations.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-gray-500">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Henüz kurum eklenmemiş</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {organizations.map((org) => (
            <Card key={org.id} className="hover:shadow-md transition-shadow">
              <CardBody>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{org.name}</h3>
                      <p className="text-sm text-gray-500">{org.user_count} kullanıcı</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openModal(org)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(org)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingOrg ? 'Kurum Düzenle' : t('newOrg', lang)}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <Input
                label="Kurum Adı *"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Örn: ABC Şirketi"
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
