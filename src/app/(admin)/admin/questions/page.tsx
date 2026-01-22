'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
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

  const lang = useLang()
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

  const loadAllData = useCallback(async () => {
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
      toast(t('dataLoadFailedGeneric', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [lang])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

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
          if (!formData.main_category_id) { toast(t('selectMainHeading', lang), 'error'); setSaving(false); return }
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
          if (!formData.category_id) { toast(t('selectCategory', lang), 'error'); setSaving(false); return }
          payload = { 
            text: formData.text, 
            category_id: formData.category_id, 
            sort_order: Number(formData.sort_order) || 0,
            is_active: Boolean(formData.is_active),
          }
          break
        case 'answers':
          table = 'question_answers'
          if (!formData.question_id) { toast(t('selectQuestion', lang), 'error'); setSaving(false); return }
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
        toast(t('updatedDone', lang), 'success')
      } else {
        const { error } = await supabase.from(table).insert(payload)
        if (error) throw error
        toast(t('addedDone', lang), 'success')
      }
      
      setShowModal(false)
      loadAllData()
    } catch (error: any) {
      toast(error.message || t('saveError', lang), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Delete
  const handleDelete = async (type: TabType, id: string) => {
    if (!confirm(t('confirmDeleteGeneric', lang))) return
    
    const tables: Record<TabType, string> = {
      main: 'main_categories',
      categories: 'question_categories',
      questions: 'questions',
      answers: 'question_answers'
    }
    
    try {
      const { error } = await supabase.from(tables[type]).delete().eq('id', id)
      if (error) throw error
      toast(t('deletedDone', lang), 'success')
      loadAllData()
    } catch (error: any) {
      toast(error.message || t('deleteError', lang), 'error')
    }
  }

  const tabs = [
    { id: 'main' as TabType, label: t('mainHeadingsTab', lang), icon: BookOpen, count: mainCategories.length },
    { id: 'categories' as TabType, label: t('categoriesTab', lang), icon: Folder, count: categories.length },
    { id: 'questions' as TabType, label: t('questionsTab', lang), icon: HelpCircle, count: questions.length },
    { id: 'answers' as TabType, label: t('answersTab', lang), icon: CheckSquare, count: answers.length },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">❓ {t('questionsMgmt', lang)}</h1>
        <p className="text-gray-500 mt-1">{t('questionsMgmtSubtitle', lang)}</p>
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
                <CardTitle>📚 {t('mainHeadingsTab', lang)}</CardTitle>
                <Button onClick={() => openModal('main')}>
                  <Plus className="w-4 h-4" />
                  {t('newMainHeading', lang)}
                </Button>
              </CardHeader>
              <CardBody className="p-0">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">#</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('mainHeadingLabel', lang)}</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('descriptionLabel', lang)}</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('categoryCountLabel', lang)}</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('statusLabel', lang)}</th>
                      <th className="text-right py-3 px-6 font-semibold text-gray-600 text-sm">{t('actionLabel', lang)}</th>
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
                            <Badge variant="info">{t('categoriesCountShort', lang).replace('{n}', String(catCount))}</Badge>
                          </td>
                          <td className="py-3 px-6">
                            <Badge variant={item.is_active ? 'success' : 'gray'}>
                              {item.is_active ? `✅ ${t('activeText', lang)}` : `❌ ${t('inactiveText', lang)}`}
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
                <CardTitle>📁 {t('categoriesTab', lang)}</CardTitle>
                <div className="flex items-center gap-3">
                  <Select
                    options={mainCategories.map(m => ({ value: m.id, label: m.name }))}
                    value={filterMainCategory}
                    onChange={(e) => setFilterMainCategory(e.target.value)}
                    placeholder={t('allMainHeadings', lang)}
                    className="w-48"
                  />
                  <Button onClick={() => openModal('categories')}>
                    <Plus className="w-4 h-4" />
                    {t('newCategory', lang)}
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">#</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('mainHeadingLabel', lang)}</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('category', lang)}</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('questionCountLabel', lang)}</th>
                      <th className="text-right py-3 px-6 font-semibold text-gray-600 text-sm">{t('actionLabel', lang)}</th>
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
                            <Badge variant="info">{t('questionsCountShort', lang).replace('{n}', String(qCount))}</Badge>
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
                <CardTitle>📝 {t('questionsTab', lang)}</CardTitle>
                <div className="flex items-center gap-3">
                  <Select
                    options={categories.map(c => ({ value: c.id, label: `${c.main_categories?.name || '-'} > ${c.name}` }))}
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    placeholder={t('allCategories', lang)}
                    className="w-64"
                  />
                  <Button onClick={() => openModal('questions')}>
                    <Plus className="w-4 h-4" />
                    {t('newQuestion', lang)}
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">#</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('category', lang)}</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('questionLabel', lang)}</th>
                      <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('answerCountLabel', lang)}</th>
                      <th className="text-right py-3 px-6 font-semibold text-gray-600 text-sm">{t('actionLabel', lang)}</th>
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
                            <Badge variant={aCount > 0 ? 'success' : 'warning'}>
                              {t('answersCountShort', lang).replace('{n}', String(aCount))}
                            </Badge>
                          </td>
                          <td className="py-3 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => { setFilterQuestion(item.id); setActiveTab('answers'); }}
                                className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                title={t('viewAnswers', lang)}
                              >
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
                <CardTitle>✅ {t('answersTab', lang)}</CardTitle>
                <div className="flex items-center gap-3">
                  <Select
                    options={questions.map(q => ({ value: q.id, label: q.text.substring(0, 50) + '...' }))}
                    value={filterQuestion}
                    onChange={(e) => setFilterQuestion(e.target.value)}
                    placeholder={t('selectQuestionPlaceholder', lang)}
                    className="w-72"
                  />
                  <Button onClick={() => openModal('answers')}>
                    <Plus className="w-4 h-4" />
                    {t('newAnswer', lang)}
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                {!filterQuestion ? (
                  <div className="py-12 text-center text-gray-500">
                    {t('selectQuestionToViewAnswers', lang)}
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">#</th>
                        <th className="text-left py-3 px-6 font-semibold text-gray-600 text-sm">{t('answerTextLabel', lang)}</th>
                        <th className="text-center py-3 px-6 font-semibold text-gray-600 text-sm">{t('stdScoreLabel', lang)}</th>
                        <th className="text-center py-3 px-6 font-semibold text-gray-600 text-sm">{t('realScoreLabel', lang)}</th>
                        <th className="text-right py-3 px-6 font-semibold text-gray-600 text-sm">{t('actionLabel', lang)}</th>
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
                {editingItem ? t('editLabel', lang) : t('addNewLabel', lang)}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {modalType === 'main' && (
                <>
                  <Input
                    label={t('mainHeadingNameRequired', lang)}
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('exampleMainHeading', lang)}
                  />
                  <Input
                    label={t('descriptionLabel', lang)}
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('optionalDescription', lang)}
                  />
                  <Select
                    label={t('statusLabel', lang)}
                    options={[
                      { value: 'true', label: `✅ ${t('activeText', lang)}` },
                      { value: 'false', label: `❌ ${t('inactiveText', lang)}` },
                    ]}
                    value={String(formData.is_active ?? true)}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  />
                  <Input
                    label={t('sortOrderLabel', lang)}
                    type="number"
                    value={formData.sort_order ?? 0}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value || '0', 10) })}
                  />
                  <Select
                    label={t('languageLabel', lang)}
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
                    label={`${t('mainHeadingLabel', lang)} *`}
                    options={mainCategories.map(m => ({ value: m.id, label: m.name }))}
                    value={formData.main_category_id || ''}
                    onChange={(e) => setFormData({ ...formData, main_category_id: e.target.value })}
                    placeholder={t('selectMainHeadingPlaceholder', lang)}
                  />
                  <Input
                    label={t('categoryNameRequired', lang)}
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('exampleCategory', lang)}
                  />
                  <Input
                    label={t('descriptionLabel', lang)}
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('optionalDescription', lang)}
                  />
                  <Input
                    label={t('sortOrderLabel', lang)}
                    type="number"
                    value={formData.sort_order ?? 0}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value || '0', 10) })}
                  />
                  <Select
                    label={t('statusLabel', lang)}
                    options={[
                      { value: 'true', label: `✅ ${t('activeText', lang)}` },
                      { value: 'false', label: `❌ ${t('inactiveText', lang)}` },
                    ]}
                    value={String(formData.is_active ?? true)}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  />
                </>
              )}
              
              {modalType === 'questions' && (
                <>
                  <Select
                    label={`${t('category', lang)} *`}
                    options={categories.map(c => ({ value: c.id, label: `${c.main_categories?.name || '-'} > ${c.name}` }))}
                    value={formData.category_id || ''}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    placeholder={t('selectCategoryPlaceholder', lang)}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('questionLabel', lang)} *</label>
                    <textarea
                      value={formData.text || ''}
                      onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                      placeholder={t('questionTextPlaceholder', lang)}
                      rows={3}
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <Input
                    label={t('orderNoLabel', lang)}
                    type="number"
                    value={formData.sort_order ?? 0}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value || '0', 10) })}
                  />
                  <Select
                    label={t('statusLabel', lang)}
                    options={[
                      { value: 'true', label: `✅ ${t('activeText', lang)}` },
                      { value: 'false', label: `❌ ${t('inactiveText', lang)}` },
                    ]}
                    value={String(formData.is_active ?? true)}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  />
                </>
              )}
              
              {modalType === 'answers' && (
                <>
                  <Select
                    label={`${t('questionLabel', lang)} *`}
                    options={questions.map(q => ({ value: q.id, label: q.text.substring(0, 60) + '...' }))}
                    value={formData.question_id || ''}
                    onChange={(e) => setFormData({ ...formData, question_id: e.target.value })}
                    placeholder={t('selectQuestionPlaceholder', lang)}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('answerTextLabel', lang)} *</label>
                    <textarea
                      value={formData.text || ''}
                      onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                      placeholder={t('answerTextPlaceholder', lang)}
                      rows={3}
                      className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <Input
                    label={t('levelOptionalLabel', lang)}
                    value={formData.level || ''}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    placeholder={t('exampleAnswer', lang)}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      label={t('stdScoreLabel', lang)}
                      type="number"
                      min={1}
                      max={5}
                      value={formData.std_score || 1}
                      onChange={(e) => setFormData({ ...formData, std_score: parseInt(e.target.value) })}
                    />
                    <Input
                      label={t('realScoreLabel', lang)}
                      type="number"
                      min={1}
                      max={5}
                      value={formData.reel_score || 1}
                      onChange={(e) => setFormData({ ...formData, reel_score: parseFloat(e.target.value) })}
                    />
                    <Input
                      label={t('orderNoLabel', lang)}
                      type="number"
                      value={formData.sort_order ?? 0}
                      onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value || '0', 10) })}
                    />
                  </div>
                  <Select
                    label={t('statusLabel', lang)}
                    options={[
                      { value: 'true', label: `✅ ${t('activeText', lang)}` },
                      { value: 'false', label: `❌ ${t('inactiveText', lang)}` },
                    ]}
                    value={String(formData.is_active ?? true)}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  />
                </>
              )}
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
  )
}
