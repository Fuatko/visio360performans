'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Button, Input, Select, Badge, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Plus, Edit2, Trash2, X, Loader2, ChevronRight, BookOpen, Folder, HelpCircle, CheckSquare } from 'lucide-react'

interface MainCategory {
  id: string
  name: string
  description: string | null
  status: 'active' | 'inactive'
}

interface Category {
  id: string
  main_category_id: string
  name: string
  main_categories?: MainCategory
}

interface Question {
  id: string
  category_id: string
  text: string
  order_num: number
  categories?: Category
}

interface Answer {
  id: string
  question_id: string
  text: string
  std_score: number
  reel_score: number
  order_num: number
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
        supabase.from('main_categories').select('*').order('name'),
        supabase.from('categories').select('*, main_categories(*)').order('name'),
        supabase.from('questions').select('*, categories(*, main_categories(*))').order('order_num'),
        supabase.from('answers').select('*').order('order_num'),
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
          setFormData({ name: '', description: '', status: 'active' })
          break
        case 'categories':
          setFormData({ name: '', main_category_id: filterMainCategory || '' })
          break
        case 'questions':
          setFormData({ text: '', category_id: filterCategory || '', order_num: questions.length + 1 })
          break
        case 'answers':
          setFormData({ text: '', question_id: filterQuestion || '', std_score: 1, reel_score: 1, order_num: 1 })
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
          payload = { name: formData.name, description: formData.description || null, status: formData.status }
          break
        case 'categories':
          table = 'categories'
          if (!formData.main_category_id) { toast('Ana başlık seçin', 'error'); setSaving(false); return }
          payload = { name: formData.name, main_category_id: formData.main_category_id }
          break
        case 'questions':
          table = 'questions'
          if (!formData.category_id) { toast('Kategori seçin', 'error'); setSaving(false); return }
          payload = { text: formData.text, category_id: formData.category_id, order_num: formData.order_num || 1 }
          break
        case 'answers':
          table = 'answers'
          if (!formData.question_id) { toast('Soru seçin', 'error'); setSaving(false); return }
          payload = { 
            text: formData.text, 
            question_id: formData.question_id, 
            std_score: Number(formData.std_score) || 1,
            reel_score: Number(formData.reel_score) || 1,
            order_num: Number(formData.order_num) || 1
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
      categories: 'categories',
      questions: 'questions',
      answers: 'answers'
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
                          <td className="py-3 px-6 font-medium text-gray-900">{item.name}</td>
                          <td className="py-3 px-6 text-gray-500 text-sm">{item.description || '-'}</td>
                          <td className="py-3 px-6">
                            <Badge variant="info">{catCount} kategori</Badge>
                          </td>
                          <td className="py-3 px-6">
                            <Badge variant={item.status === 'active' ? 'success' : 'gray'}>
                              {item.status === 'active' ? '✅ Aktif' : '❌ Pasif'}
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
                          <td className="py-3 px-6 font-medium text-gray-900">{item.name}</td>
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
                    options={categories.map(c => ({ value: c.id, label: `${c.main_categories?.name} > ${c.name}` }))}
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
                          <td className="py-3 px-6 text-gray-500">{item.order_num || index + 1}</td>
                          <td className="py-3 px-6">
                            <Badge variant="gray">{item.categories?.name || '-'}</Badge>
                          </td>
                          <td className="py-3 px-6 font-medium text-gray-900 max-w-md truncate">{item.text}</td>
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
                          <td className="py-3 px-6 text-gray-500">{item.order_num || index + 1}</td>
                          <td className="py-3 px-6 font-medium text-gray-900">{item.text}</td>
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
                    label="Durum"
                    options={[
                      { value: 'active', label: '✅ Aktif' },
                      { value: 'inactive', label: '❌ Pasif' },
                    ]}
                    value={formData.status || 'active'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
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
                </>
              )}
              
              {modalType === 'questions' && (
                <>
                  <Select
                    label="Kategori *"
                    options={categories.map(c => ({ value: c.id, label: `${c.main_categories?.name} > ${c.name}` }))}
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
                    value={formData.order_num || 1}
                    onChange={(e) => setFormData({ ...formData, order_num: parseInt(e.target.value) })}
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
                      onChange={(e) => setFormData({ ...formData, reel_score: parseInt(e.target.value) })}
                    />
                    <Input
                      label="Sıra No"
                      type="number"
                      value={formData.order_num || 1}
                      onChange={(e) => setFormData({ ...formData, order_num: parseInt(e.target.value) })}
                    />
                  </div>
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
