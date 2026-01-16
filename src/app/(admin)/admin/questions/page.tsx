'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Button, Input, Select, Badge, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Plus, Edit2, Trash2, X, Loader2, ChevronRight, BookOpen, Folder, HelpCircle, CheckSquare } from 'lucide-react'

interface MainCategory {
  id: string
  name: string
  name_en?: string | null
  name_fr?: string | null
  description: string | null
  description_en?: string | null
  description_fr?: string | null
  sort_order: number
  is_active: boolean
  language: 'tr' | 'en' | 'fr'
}

interface Category {
  id: string
  main_category_id: string
  name: string
  name_en?: string | null
  name_fr?: string | null
  description: string | null
  description_en?: string | null
  description_fr?: string | null
  sort_order: number
  is_active: boolean
  main_categories?: Pick<MainCategory, 'id' | 'name' | 'name_fr'>
}

interface Question {
  id: string
  category_id: string
  text: string
  text_en?: string | null
  text_fr?: string | null
  sort_order: number
  is_active: boolean
  question_categories?: Pick<Category, 'id' | 'name' | 'name_fr' | 'main_category_id'> & { main_categories?: Pick<MainCategory, 'id' | 'name' | 'name_fr'> }
}

interface Answer {
  id: string
  question_id: string
  text: string
  text_en?: string | null
  text_fr?: string | null
  level: string | null
  std_score: number
  reel_score: number
  sort_order: number
  is_active: boolean
}

type TabType = 'main' | 'categories' | 'questions' | 'answers'

export default function QuestionsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('main')
  const [loading, setLoading] = useState(true)
  
  // Data
  const [mainCategories, setMainCategories] = useState<MainCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  
  // Filters
  const [filterMainCategory, setFilterMainCategory] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterQuestion, setFilterQuestion] = useState('')
  
  // Modal
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<TabType>('main')
  const [editingItem, setEditingItem] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  
  // Form data
  const [formData, setFormData] = useState<any>({})

  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    setLoading(true)
    try {
      const [mainRes, catRes, qRes, aRes] = await Promise.all([
        supabase.from('main_categories').select('*').order('sort_order'),
        supabase.from('question_categories').select('*, main_categories(id,name)').order('sort_order'),
        supabase.from('questions').select('*, question_categories(id,name,main_category_id, main_categories(id,name))').order('sort_order'),
        supabase.from('question_answers').select('*').order('sort_order'),
      ])
      
      setMainCategories(mainRes.data || [])
      setCategories(catRes.data || [])
      setQuestions(qRes.data || [])
      setAnswers(aRes.data || [])
    } catch (error) {
      console.error('Load error:', error)
      toast('Veriler yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Filtered data
  const filteredCategories = categories.filter(c => 
    !filterMainCategory || c.main_category_id === filterMainCategory
  )
  
  const filteredQuestions = questions.filter(q => 
    !filterCategory || q.category_id === filterCategory
  )
  
  const filteredAnswers = answers.filter(a => 
    !filterQuestion || a.question_id === filterQuestion
  )

  // Open modal
  const openModal = (type: TabType, item?: any) => {
    setModalType(type)
    setEditingItem(item || null)
    
    if (item) {
      setFormData({ ...item })
    } else {
      switch (type) {
        case 'main':
          setFormData({ name: '', description: '', sort_order: (mainCategories.length || 0) + 1, is_active: true, language: 'tr' })
          break
        case 'categories':
          setFormData({ name: '', main_category_id: filterMainCategory || '', description: '', sort_order: (categories.length || 0) + 1, is_active: true })
          break
        case 'questions':
          setFormData({ text: '', category_id: filterCategory || '', sort_order: (questions.length || 0) + 1, is_active: true })
          break
        case 'answers':
          setFormData({ text: '', question_id: filterQuestion || '', level: '', std_score: 3, reel_score: 3, sort_order: (answers.length || 0) + 1, is_active: true })
          break
      }
    }
    setShowModal(true)
  }

  // Save
  const handleSave = async () => {
    setSaving(true)
    try {
      let table = ''
      let payload: any = {}
      
      switch (modalType) {
        case 'main':
          table = 'main_categories'
          payload = { 
            name: formData.name, 
            description: formData.description || null, 
            sort_order: Number(formData.sort_order) || 0,
            is_active: Boolean(formData.is_active),
            language: (formData.language || 'tr')
          }
          break
        case 'categories':
          table = 'question_categories'
          if (!formData.main_category_id) { toast('Ana başlık seçin', 'error'); setSaving(false); return }
          payload = { 
            name: formData.name, 
            main_category_id: formData.main_category_id,
            description: formData.description || null,
            sort_order: Number(formData.sort_order) || 0,
            is_active: Boolean(formData.is_active),
          }
          break
        case 'questions':
          table = 'questions'
          if (!formData.category_id) { toast('Kategori seçin', 'error'); setSaving(false); return }
          payload = { 
            text: formData.text, 
            category_id: formData.category_id, 
            sort_order: Number(formData.sort_order) || 0,
            is_active: Boolean(formData.is_active),
          }
          break
        case 'answers':
          table = 'question_answers'
          if (!formData.question_id) { toast('Soru seçin', 'error'); setSaving(false); return }
          payload = { 
            text: formData.text, 
            question_id: formData.question_id, 
            level: formData.level || null,
            std_score: Number(formData.std_score) || 1,
            reel_score: Number(formData.reel_score) || 1,
            sort_order: Number(formData.sort_order) || 0,
            is_active: Boolean(formData.is_active),
          }
          break
      }
      
      if (editingItem) {
        const { error } = await supabase.from(table).update(payload).eq('id', editingItem.id)
        if (error) throw error
        toast('Güncellendi', 'success')
      } else {
        const { error } = await supabase.from(table).insert(payload)
        if (error) throw error
        toast('Eklendi', 'success')
      }
      
      setShowModal(false)
      loadAllData()
    } catch (error: any) {
      toast(error.message || 'Kayıt hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Delete
  const handleDelete = async (type: TabType, id: string) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    
    const tables: Record<TabType, string> = {
      main: 'main_categories',
      categories: 'question_categories',
      questions: 'questions',
      answers: 'question_answers'
    }
    
    try {
      const { error } = await supabase.from(tables[type]).delete().eq('id', id)
      if (error) throw error
      toast('Silindi', 'success')
      loadAllData()
    } catch (error: any) {
      toast(error.message || 'Silme hatası', 'error')
    }
  }

  const tabs = [
    { id: 'main' as TabType, label: 'Ana Başlıklar', icon: BookOpen, count: mainCategories.length },
    { id: 'categories' as TabType, label: 'Kategoriler', icon: Folder, count: categories.length },
    { id: 'questions' as TabType, label: 'Sorular', icon: HelpCircle, count: questions.length },
    { id: 'answers' as TabType, label: 'Cevaplar', icon: CheckSquare, count: answers.length },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">❓ Soru Yönetimi</h1>
        <p className="text-gray-500 mt-1">Ana Başlık, Kategori, Soru ve Cevap yönetimi</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          {/* Ana Başlıklar */}
          {activeTab === 'main' && (
            <Card>
              <CardHeader>
                <CardTitle>📚 Ana Başlıklar</CardTitle>
                <Button onClick={() => openModal('main')}>
                  <Plus className="w-4 h-4" />
                  Yeni Ana Başlık
                </Button>
              </CardHeader>
              <CardBody className="p-0">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">#</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Ana Başlık</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Açıklama</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Kategori Sayısı</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Durum</th>
                      <th className="text-right py-3 px-6 font-semibold text-gray-600 text-sm">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mainCategories.map((item, index) => {
                      const catCount = categories.filter(c => c.main_category_id === item.id).length
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="py-3 px-6 text-gray-500">{index + 1}</td>
                          <td className="py-3 px-6">
  <div className="font-medium text-gray-900">{item.name}</div>
  {item.name_fr ? <div className="text-xs text-gray-500 mt-0.5">FR: {item.name_fr}</div> : null}
</td>
                          <td className="py-3 px-6 text-gray-500 text-sm">{item.description || '-'}</td>
                          <td className="py-3 px-6">
                            <Badge variant="info">{catCount} kategori</Badge>
                          </td>
                          <td className="py-3 px-6">
                            <Badge variant={item.is_active ? 'success' : 'gray'}>
                              {item.is_active ? '✅ Aktif' : '❌ Pasif'}
                            </Badge>
                          </td>
                          <td className="py-3 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => openModal('main', item)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete('main', item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}

          {/* Kategoriler */}
          {activeTab === 'categories' && (
            <Card>
              <CardHeader>
                <CardTitle>📁 Kategoriler</CardTitle>
                <div className="flex items-center gap-3">
                  <Select
                    options={mainCategories.map(m => ({ value: m.id, label: m.name }))}
                    value={filterMainCategory}
                    onChange={(e) => setFilterMainCategory(e.target.value)}
                    placeholder="Tüm Ana Başlıklar"
                    className="w-48"
                  />
                  <Button onClick={() => openModal('categories')}>
                    <Plus className="w-4 h-4" />
                    Yeni Kategori
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">#</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Ana Başlık</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Kategori</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Soru Sayısı</th>
                      <th className="text-right py-3 px-6 font-semibold text-gray-600 text-sm">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCategories.map((item, index) => {
                      const qCount = questions.filter(q => q.category_id === item.id).length
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="py-3 px-6 text-gray-500">{index + 1}</td>
                          <td className="py-3 px-6">
                            <Badge variant="gray">{item.main_categories?.name || '-'}</Badge>
                          </td>
                          <td className="py-3 px-6">
  <div className="font-medium text-gray-900">{item.name}</div>
  {item.name_fr ? <div className="text-xs text-gray-500 mt-0.5">FR: {item.name_fr}</div> : null}
</td>
                          <td className="py-3 px-6">
                            <Badge variant="info">{qCount} soru</Badge>
                          </td>
                          <td className="py-3 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => openModal('categories', item)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete('categories', item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}

          {/* Sorular */}
          {activeTab === 'questions' && (
            <Card>
              <CardHeader>
                <CardTitle>📝 Sorular</CardTitle>
                <div className="flex items-center gap-3">
                  <Select
                    options={categories.map(c => ({ value: c.id, label: `${c.main_categories?.name || '-'} > ${c.name}` }))}
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    placeholder="Tüm Kategoriler"
                    className="w-64"
                  />
                  <Button onClick={() => openModal('questions')}>
                    <Plus className="w-4 h-4" />
                    Yeni Soru
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">#</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Kategori</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Soru</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Cevap Sayısı</th>
                      <th className="text-right py-3 px-6 font-semibold text-gray-600 text-sm">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredQuestions.map((item, index) => {
                      const aCount = answers.filter(a => a.question_id === item.id).length
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="py-3 px-6 text-gray-500">{item.sort_order || index + 1}</td>
                          <td className="py-3 px-6">
                            <Badge variant="gray">{item.question_categories?.name || '-'}</Badge>
                          </td>
                          <td className="py-3 px-6 max-w-md">
  <div className="font-medium text-gray-900 truncate">{item.text}</div>
  {item.text_fr ? <div className="text-xs text-gray-500 mt-0.5 truncate">FR: {item.text_fr}</div> : null}
</td>
                          <td className="py-3 px-6">
                            <Badge variant={aCount > 0 ? 'success' : 'warning'}>{aCount} cevap</Badge>
                          </td>
                          <td className="py-3 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => { setFilterQuestion(item.id); setActiveTab('answers'); }} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Cevapları Gör">
                                <ChevronRight className="w-4 h-4" />
                              </button>
                              <button onClick={() => openModal('questions', item)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete('questions', item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}

          {/* Cevaplar */}
          {activeTab === 'answers' && (
            <Card>
              <CardHeader>
                <CardTitle>✅ Cevaplar</CardTitle>
                <div className="flex items-center gap-3">
                  <Select
                    options={questions.map(q => ({ value: q.id, label: q.text.substring(0, 50) + '...' }))}
                    value={filterQuestion}
                    onChange={(e) => setFilterQuestion(e.target.value)}
                    placeholder="Soru Seçin"
                    className="w-72"
                  />
                  <Button onClick={() => openModal('answers')}>
                    <Plus className="w-4 h-4" />
                    Yeni Cevap
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                {!filterQuestion ? (
                  <div className="py-12 text-center text-gray-500">
                    Cevapları görmek için yukarıdan soru seçin
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">#</th>
                        <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">Cevap Metni</th>
                        <th className="text-center py-3 px-6 font-semibold text-gray-600 text-sm">STD Puan</th>
                        <th className="text-center py-3 px-6 font-semibold text-gray-600 text-sm">REEL Puan</th>
                        <th className="text-right py-3 px-6 font-semibold text-gray-600 text-sm">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredAnswers.map((item, index) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="py-3 px-6 text-gray-500">{item.sort_order || index + 1}</td>
                          <td className="py-3 px-6">
                            <div className="font-medium text-gray-900">{item.text}</div>
{item.text_fr ? <div className="text-xs text-gray-500 mt-0.5">FR: {item.text_fr}</div> : null}
                            {item.level ? <div className="text-xs text-gray-500 mt-0.5">{item.level}</div> : null}
                          </td>
                          <td className="py-3 px-6 text-center">
                            <Badge variant="info">{item.std_score}</Badge>
                          </td>
                          <td className="py-3 px-6 text-center">
                            <Badge variant="success">{item.reel_score}</Badge>
                          </td>
                          <td className="py-3 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => openModal('answers', item)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete('answers', item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingItem ? 'Düzenle' : 'Yeni Ekle'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {modalType === 'main' && (
                <>
                  <Input
                    label="Ana Başlık Adı *"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Örn: Kişisel Gelişim Değerlendirmesi"
                  />
                  <Input
                    label="Açıklama"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Opsiyonel açıklama"
                  />
                  <Select
                    label="Aktif mi?"
                    options={[
                      { value: 'true', label: '✅ Aktif' },
                      { value: 'false', label: '❌ Pasif' },
                    ]}
                    value={String(formData.is_active ?? true)}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  />
                  <Input
                    label="Sıralama"
                    type="number"
                    value={formData.sort_order ?? 0}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value || '0', 10) })}
                  />
                  <Select
                    label="Dil"
                    options={[
                      { value: 'tr', label: '🇹🇷 Türkçe' },
                      { value: 'en', label: '🇬🇧 English' },
                      { value: 'fr', label: '🇫🇷 Français' },
                    ]}
                    value={formData.language || 'tr'}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  />
                </>
              )}
              
              {modalType === 'categories' && (
                <>
                  <Select
                    label="Ana Başlık *"
                    options={mainCategories.map(m => ({ value: m.id, label: m.name }))}
                    value={formData.main_category_id || ''}
                    onChange={(e) => setFormData({ ...formData, main_category_id: e.target.value })}
                    placeholder="Ana Başlık Seçin"
                  />
                  <Input
                    label="Kategori Adı *"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Örn: Liderlik ve Yönetim"
                  />
                  <Input
                    label="Açıklama"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Opsiyonel açıklama"
                  />
                  <Input
                    label="Sıralama"
                    type="number"
                    value={formData.sort_order ?? 0}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value || '0', 10) })}
                  />
                  <Select
                    label="Aktif mi?"
                    options={[
                      { value: 'true', label: '✅ Aktif' },
                      { value: 'false', label: '❌ Pasif' },
                    ]}
                    value={String(formData.is_active ?? true)}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  />
                </>
              )}
              
              {modalType === 'questions' && (
                <>
                  <Select
                    label="Kategori *"
                    options={categories.map(c => ({ value: c.id, label: `${c.main_categories?.name || '-'} > ${c.name}` }))}
                    value={formData.category_id || ''}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    placeholder="Kategori Seçin"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Soru Metni *</label>
                    <textarea
                      value={formData.text || ''}
                      onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                      placeholder="Soru metnini yazın..."
                      rows={3}
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <Input
                    label="Sıra No"
                    type="number"
                    value={formData.sort_order ?? 0}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value || '0', 10) })}
                  />
                  <Select
                    label="Aktif mi?"
                    options={[
                      { value: 'true', label: '✅ Aktif' },
                      { value: 'false', label: '❌ Pasif' },
                    ]}
                    value={String(formData.is_active ?? true)}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  />
                </>
              )}
              
              {modalType === 'answers' && (
                <>
                  <Select
                    label="Soru *"
                    options={questions.map(q => ({ value: q.id, label: q.text.substring(0, 60) + '...' }))}
                    value={formData.question_id || ''}
                    onChange={(e) => setFormData({ ...formData, question_id: e.target.value })}
                    placeholder="Soru Seçin"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Cevap Metni *</label>
                    <textarea
                      value={formData.text || ''}
                      onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                      placeholder="Cevap metnini yazın..."
                      rows={3}
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <Input
                    label="Seviye (Opsiyonel)"
                    value={formData.level || ''}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    placeholder="Örn: Orta (Beklentiyi Karşılar)"
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      label="STD Puan"
                      type="number"
                      min={1}
                      max={5}
                      value={formData.std_score || 1}
                      onChange={(e) => setFormData({ ...formData, std_score: parseInt(e.target.value) })}
                    />
                    <Input
                      label="REEL Puan"
                      type="number"
                      min={1}
                      max={5}
                      value={formData.reel_score || 1}
                      onChange={(e) => setFormData({ ...formData, reel_score: parseFloat(e.target.value) })}
                    />
                    <Input
                      label="Sıra No"
                      type="number"
                      value={formData.sort_order ?? 0}
                      onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value || '0', 10) })}
                    />
                  </div>
                  <Select
                    label="Aktif mi?"
                    options={[
                      { value: 'true', label: '✅ Aktif' },
                      { value: 'false', label: '❌ Pasif' },
                    ]}
                    value={String(formData.is_active ?? true)}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  />
                </>
              )}
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
