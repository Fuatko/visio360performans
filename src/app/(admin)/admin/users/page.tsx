'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Button, Input, Select, Badge, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { User, Organization } from '@/types/database'
import { Plus, Search, Edit2, Trash2, X, Loader2 } from 'lucide-react'

export default function UsersPage() {
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
    position_level: 'peer' as User['position_level'],
    role: 'user' as User['role'],
    status: 'active' as User['status'],
    preferred_language: 'tr' as User['preferred_language'],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, orgsRes] = await Promise.all([
        supabase.from('users').select('*, organizations(*)').order('name'),
        supabase.from('organizations').select('*').order('name'),
      ])

      setUsers(usersRes.data || [])
      setOrganizations(orgsRes.data || [])
      
      // Extract unique departments
      const depts = [...new Set((usersRes.data || []).map(u => u.department).filter(Boolean))] as string[]
      setDepartments(depts.sort())
    } catch (error) {
      console.error('Load error:', error)
      toast('Veriler yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

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
      toast('Ad ve email zorunludur', 'error')
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
      }

      if (editingUser) {
        const { error } = await supabase
          .from('users')
          .update(payload)
          .eq('id', editingUser.id)
        
        if (error) throw error
        toast('Kullanıcı güncellendi', 'success')
      } else {
        const { error } = await supabase.from('users').insert(payload)
        if (error) throw error
        toast('Kullanıcı eklendi', 'success')
      }

      setShowModal(false)
      loadData()
    } catch (error: any) {
      console.error('Save error:', error)
      toast(error.message || 'Kayıt hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (user: User) => {
    if (!confirm(`${user.name} kullanıcısını silmek istediğinize emin misiniz?`)) return

    try {
      const { error } = await supabase.from('users').delete().eq('id', user.id)
      if (error) throw error
      toast('Kullanıcı silindi', 'success')
      loadData()
    } catch (error: any) {
      toast(error.message || 'Silme hatası', 'error')
    }
  }

  const positionLabels: Record<string, string> = {
    executive: '👔 Üst Yönetici',
    manager: '👨‍💼 Yönetici',
    peer: '👥 Eş Düzey',
    subordinate: '👤 Ast',
  }

  const roleLabels: Record<string, string> = {
    super_admin: '🔴 Super Admin',
    org_admin: '🟠 Kurum Admin',
    user: '🟢 Kullanıcı',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">👥 Kullanıcılar</h1>
          <p className="text-gray-500 mt-1">Sistem kullanıcılarını yönetin</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="w-5 h-5" />
          Yeni Kullanıcı
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
                  placeholder="İsim veya email ara..."
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
              placeholder="Tüm Kurumlar"
              className="w-48"
            />
            <Select
              options={departments.map(d => ({ value: d, label: d }))}
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              placeholder="Tüm Departmanlar"
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
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Ad Soyad</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Email</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Kurum</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Departman</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Pozisyon</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Rol</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">Durum</th>
                    <th className="text-right py-4 px-6 font-semibold text-gray-600 text-sm">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-500">
                        Kullanıcı bulunamadı
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
                            {user.status === 'active' ? 'Aktif' : 'Pasif'}
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
        Toplam {filteredUsers.length} kullanıcı gösteriliyor
      </p>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingUser ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}
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
                label="Ad Soyad *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Örn: Ahmet Yılmaz"
              />
              
              <Input
                label="Email *"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="ornek@email.com"
              />
              
              <Input
                label="Telefon"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+90 5XX XXX XX XX"
              />
              
              <Select
                label="Kurum"
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                value={formData.organization_id}
                onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                placeholder="Kurum Seçin"
              />
              
              <Input
                label="Görev / Unvan"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Örn: Yazılım Mühendisi"
              />
              
              <Input
                label="Departman"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder="Örn: Bilişim Teknolojileri"
              />
              
              <Select
                label="Pozisyon Seviyesi"
                options={[
                  { value: 'executive', label: '👔 Üst Yönetici (C-Level)' },
                  { value: 'manager', label: '👨‍💼 Yönetici / Müdür' },
                  { value: 'peer', label: '👥 Uzman / Eş Düzey' },
                  { value: 'subordinate', label: '👤 Asistan / Stajyer' },
                ]}
                value={formData.position_level}
                onChange={(e) => setFormData({ ...formData, position_level: e.target.value as User['position_level'] })}
              />
              
              <Select
                label="Rol"
                options={[
                  { value: 'user', label: '🟢 Kullanıcı' },
                  { value: 'org_admin', label: '🟠 Kurum Yöneticisi' },
                  { value: 'super_admin', label: '🔴 Super Admin' },
                ]}
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as User['role'] })}
              />
              
              <Select
                label="Durum"
                options={[
                  { value: 'active', label: '✅ Aktif' },
                  { value: 'inactive', label: '❌ Pasif' },
                ]}
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as User['status'] })}
              />
              
              <Select
                label="Tercih Edilen Dil"
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
  )
}
