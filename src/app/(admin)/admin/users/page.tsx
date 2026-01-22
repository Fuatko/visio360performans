'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { Card, CardBody, Button, Input, Select, Badge, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { User, Organization } from '@/types/database'
import { Plus, Search, Edit2, Trash2, X, Loader2 } from 'lucide-react'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'

export default function UsersPage() {

  const lang = useLang()
  const { organizationId } = useAdminContextStore()
  const [users, setUsers] = useState<(User & { organizations?: Organization })[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterOrg, setFilterOrg] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [departments, setDepartments] = useState<string[]>([])
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    organization_id: '',
    title: '',
    department: '',
    manager_id: '',
    position_level: 'peer' as User['position_level'],
    role: 'user' as User['role'],
    status: 'active' as User['status'],
    preferred_language: 'tr' as User['preferred_language'],
  })
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async (orgId: string) => {
    setLoading(true)
    try {
      const [usersRes, orgsRes] = await Promise.all([
        supabase.from('users').select('*, organizations(*)').eq('organization_id', orgId).order('name'),
        supabase.from('organizations').select('*').eq('id', orgId).order('name'),
      ])

      setUsers(usersRes.data || [])
      setOrganizations(orgsRes.data || [])
      
      // Extract unique departments
      const depts = [...new Set((usersRes.data || []).map(u => u.department).filter(Boolean))] as string[]
      setDepartments(depts.sort())
    } catch (error) {
      console.error('Load error:', error)
      toast(t('dataLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [lang])

  useEffect(() => {
    // KVKK: Kurum seçilmeden kullanıcı listesi çekme
    if (!organizationId) {
      setUsers([])
      setDepartments([])
      setLoading(false)
      return
    }
    setFilterOrg(organizationId)
    loadData(organizationId)
  }, [organizationId, loadData])

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesOrg = !filterOrg || user.organization_id === filterOrg
    const matchesDept = !filterDept || user.department === filterDept
    return matchesSearch && matchesOrg && matchesDept
  })

  const openModal = (user?: User) => {
    if (user) {
      setEditingUser(user)
      setFormData({
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        organization_id: user.organization_id || '',
        title: user.title || '',
        department: user.department || '',
        manager_id: (user as any).manager_id ? String((user as any).manager_id) : '',
        position_level: user.position_level,
        role: user.role,
        status: user.status,
        preferred_language: user.preferred_language,
      })
    } else {
      setEditingUser(null)
      setFormData({
        name: '',
        email: '',
        phone: '',
        organization_id: '',
        title: '',
        department: '',
        manager_id: '',
        position_level: 'peer',
        role: 'user',
        status: 'active',
        preferred_language: 'tr',
      })
    }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      toast(t('nameEmailRequired', lang), 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...formData,
        email: formData.email.toLowerCase().trim(),
        organization_id: formData.organization_id || null,
        phone: formData.phone || null,
        title: formData.title || null,
        department: formData.department || null,
        manager_id: formData.manager_id || null,
      }

      const resp = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, id: editingUser?.id }),
      })
      if (!resp.ok) {
        const api = await resp.json().catch(() => ({}))
        if (resp.status === 401 || resp.status === 403) {
          toast(t('sessionMissingReLogin', lang), 'warning')
        } else if ((api as any)?.error) {
          toast(String((api as any).error), 'error')
        }
        // Fallback: keep operational
        if (editingUser) {
          const { error } = await supabase.from('users').update(payload).eq('id', editingUser.id)
          if (error) throw error
          toast(t('userUpdated', lang), 'success')
        } else {
          const { error } = await supabase.from('users').insert(payload)
          if (error) throw error
          toast(t('userAdded', lang), 'success')
        }
      } else {
        toast(editingUser ? t('userUpdated', lang) : t('userAdded', lang), 'success')
      }

      setShowModal(false)
      if (organizationId) loadData(organizationId)
    } catch (error: any) {
      console.error('Save error:', error)
      toast(error.message || t('saveError', lang), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (user: User) => {
    if (!confirm(t('confirmDeleteUser', lang).replace('{name}', user.name))) return

    try {
      const resp = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id }),
      })
      if (!resp.ok) {
        const api = await resp.json().catch(() => ({}))
        if (resp.status === 401 || resp.status === 403) {
          toast(t('sessionMissingReLogin', lang), 'warning')
        } else if ((api as any)?.error) {
          toast(String((api as any).error), 'error')
        }
        // Fallback
        const { error } = await supabase.from('users').delete().eq('id', user.id)
        if (error) throw error
      }
      toast(t('userDeleted', lang), 'success')
      if (organizationId) loadData(organizationId)
    } catch (error: any) {
      toast(error.message || t('deleteError', lang), 'error')
    }
  }

  const positionLabels: Record<string, string> = {
    executive: t('positionExecutive', lang),
    manager: t('positionManager', lang),
    peer: t('positionPeer', lang),
    subordinate: t('positionSubordinate', lang),
  }

  const roleLabels: Record<string, string> = {
    super_admin: t('roleSuperAdmin', lang),
    org_admin: t('roleOrgAdmin', lang),
    user: t('roleUser', lang),
  }

  return (
    <RequireSelection
      enabled={!organizationId}
      title={t('kvkkSecurityTitle', lang)}
      message={t('kvkkSelectOrgToContinue', lang)}
    >
      <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">👥 {t('users', lang)}</h1>
          <p className="text-gray-500 mt-1">{t('usersSubtitle', lang)}</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="w-5 h-5" />
          {t('newUser', lang)}
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('searchNameOrEmail', lang)}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
            <Select
              options={organizations.map(o => ({ value: o.id, label: o.name }))}
              value={filterOrg}
              onChange={(e) => setFilterOrg(e.target.value)}
              placeholder={t('allOrganizations', lang)}
              className="w-48"
            />
            <Select
              options={departments.map(d => ({ value: d, label: d }))}
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              placeholder={t('allDepartments', lang)}
              className="w-48"
            />
          </div>
        </CardBody>
      </Card>

      {/* Users Table */}
      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('nameLabel', lang)}</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('emailLabel', lang)}</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('organization', lang)}</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('departmentLabel', lang)}</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('positionLevelLabel', lang)}</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('roleFieldLabel', lang)}</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('statusLabel', lang)}</th>
                    <th className="text-right py-4 px-6 font-semibold text-gray-600 text-sm">{t('actionLabel', lang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-500">
                        {t('noUsersFound', lang)}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-semibold text-sm">
                              {user.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                            </div>
                            <span className="font-medium text-gray-900">{user.name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-gray-600 text-sm">{user.email}</td>
                        <td className="py-4 px-6 text-gray-600 text-sm">{user.organizations?.name || '-'}</td>
                        <td className="py-4 px-6 text-gray-600 text-sm">{user.department || '-'}</td>
                        <td className="py-4 px-6">
                          <div className="space-y-1">
                            <div className="text-gray-900 text-sm">
                              {user.title || '-'}
                            </div>
                            <div>
                              <Badge variant="gray">{positionLabels[user.position_level]}</Badge>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <Badge variant={user.role === 'super_admin' ? 'danger' : user.role === 'org_admin' ? 'warning' : 'default'}>
                            {roleLabels[user.role]}
                          </Badge>
                        </td>
                        <td className="py-4 px-6">
                          <Badge variant={user.status === 'active' ? 'success' : 'gray'}>
                            {user.status === 'active' ? t('activeText', lang) : t('inactiveText', lang)}
                          </Badge>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openModal(user)}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(user)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Showing count */}
      <p className="text-sm text-gray-500 mt-4">
        {t('totalUsersShown', lang).replace('{n}', String(filteredUsers.length))}
      </p>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingUser ? t('editUserTitle', lang) : t('newUser', lang)}
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
                label={`${t('nameLabel', lang)} *`}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('examplePersonName', lang)}
              />
              
              <Input
                label={`${t('emailLabel', lang)} *`}
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="ornek@email.com"
              />
              
              <Input
                label={t('phoneLabel', lang)}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+90 5XX XXX XX XX"
              />
              
              <Select
                label={t('organization', lang)}
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                value={formData.organization_id}
                onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                placeholder={t('selectOrganization', lang)}
              />

              <Select
                label={t('managerLabel', lang)}
                options={[
                  { value: '', label: '-' },
                  ...users
                    .filter((u) => String(u.id) !== String(editingUser?.id || ''))
                    .map((u) => ({ value: String(u.id), label: `${u.name} • ${u.email} (${u.department || '-'})` })),
                ]}
                value={formData.manager_id}
                onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                placeholder={t('selectManagerPlaceholder', lang)}
              />
              
              <Input
                label={t('titleLabel', lang)}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('exampleTitle', lang)}
              />
              
              <Input
                label={t('departmentLabel', lang)}
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder={t('exampleDepartment', lang)}
              />
              
              <Select
                label={t('positionLevelLabel', lang)}
                options={[
                  { value: 'executive', label: t('positionExecutiveOption', lang) },
                  { value: 'manager', label: t('positionManagerOption', lang) },
                  { value: 'peer', label: t('positionPeerOption', lang) },
                  { value: 'subordinate', label: t('positionSubordinateOption', lang) },
                ]}
                value={formData.position_level}
                onChange={(e) => setFormData({ ...formData, position_level: e.target.value as User['position_level'] })}
              />
              
              <Select
                label={t('roleFieldLabel', lang)}
                options={[
                  { value: 'user', label: t('roleUser', lang) },
                  { value: 'org_admin', label: t('roleOrgAdminOption', lang) },
                  { value: 'super_admin', label: t('roleSuperAdmin', lang) },
                ]}
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as User['role'] })}
              />
              
              <Select
                label={t('statusLabel', lang)}
                options={[
                  { value: 'active', label: `✅ ${t('activeText', lang)}` },
                  { value: 'inactive', label: `❌ ${t('inactiveText', lang)}` },
                ]}
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as User['status'] })}
              />
              
              <Select
                label={t('preferredLanguageLabel', lang)}
                options={[
                  { value: 'tr', label: '🇹🇷 Türkçe' },
                  { value: 'en', label: '🇬🇧 English' },
                  { value: 'fr', label: '🇫🇷 Français' },
                ]}
                value={formData.preferred_language}
                onChange={(e) => setFormData({ ...formData, preferred_language: e.target.value as User['preferred_language'] })}
              />
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                {t('cancel', lang)}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : t('saveLabel', lang)}
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </RequireSelection>
  )
}
