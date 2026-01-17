'use client'

import { useEffect, useState } from 'react'
import { Card, CardBody, Button, Input, Select, Badge, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { EvaluationPeriod, Organization } from '@/types/database'
import { formatDate } from '@/lib/utils'
import { Plus, Edit2, Trash2, X, Loader2, Calendar, ChevronDown, ChevronRight, BookOpen, Folder, CheckSquare } from 'lucide-react'
import { useAdminContextStore } from '@/store/admin-context'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
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

  const lang = useLang()

  const [showQModal, setShowQModal] = useState(false)
  const [qModalPeriod, setQModalPeriod] = useState<EvaluationPeriod | null>(null)
  const [allQuestions, setAllQuestions] = useState<any[]>([])
  const [selectedQ, setSelectedQ] = useState<Set<string>>(new Set())
  const [qSearch, setQSearch] = useState('')
  const [loadingQ, setLoadingQ] = useState(false)
  const [savingQ, setSavingQ] = useState(false)
  const [expandedMain, setExpandedMain] = useState<Set<string>>(new Set())
  const [expandedCat, setExpandedCat] = useState<Set<string>>(new Set())
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const [selectedFirst, setSelectedFirst] = useState(true)


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
      toast(t('dataLoadFailed', lang), 'error')
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
      toast(t('requiredFields', lang), 'error')
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
        toast(t('periodUpdated', lang), 'success')
      } else {
        const { error } = await supabase.from('evaluation_periods').insert(formData)
        if (error) throw error
        toast(t('periodAdded', lang), 'success')
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
      toast(t('periodDeleted', lang), 'success')
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



  const openQuestionsModal = async (period: EvaluationPeriod) => {
    setQModalPeriod(period)
    setShowQModal(true)
    setLoadingQ(true)
    try {
      // Load existing selection (table may not exist yet)
      let selected = new Set<string>()
      try {
        const { data: pq, error: pqErr } = await supabase
          .from('evaluation_period_questions')
          .select('question_id, sort_order')
          .eq('period_id', period.id)
          .eq('is_active', true)
          .order('sort_order')
        if (pqErr) throw pqErr
        ;(pq || []).forEach((r: any) => selected.add(r.question_id))
      } catch (e: any) {
        if ((e as any)?.code === '42P01') {
          toast('Soru seçimi tablosu yok. Önce sql/period-questions.sql çalıştırın.', 'warning')
        }
      }

      // Load questions with best-effort ordering and category join (works across schemas)
      const orderCols = ['sort_order', 'order_num'] as const
      const modes = ['question_categories', 'categories'] as const

      let qs: any[] = []
      let lastErr: any = null
      for (const mode of modes) {
        const select =
          mode === 'question_categories'
            ? `*, question_categories:category_id(name, name_fr, main_categories(name, name_fr))`
            : `*, categories:category_id(name, name_fr, main_categories(name, name_fr))`

        for (const col of orderCols) {
          const res = await supabase.from('questions').select(select).order(col)
          if (!res.error) {
            qs = (res.data || []) as any[]
            lastErr = null
            break
          }
          lastErr = res.error
          const code = (res.error as any)?.code
          if (code === '42703') continue
        }
        if (qs.length) break
      }
      if (!qs.length && lastErr) {
        // still show empty list; error is handled below
      }

      setAllQuestions(qs)
      setSelectedQ(selected)
      setShowSelectedOnly(false)
      setSelectedFirst(true)
      // Expand all groups by default for discoverability
      const mainKeys = new Set<string>()
      const catKeys = new Set<string>()
      ;(qs || []).forEach((q: any) => {
        const cat = (q.question_categories || q.categories) as any
        const mc = cat?.main_categories
        const mainLabel = String(mc?.name || 'Diğer')
        const catLabel = String(cat?.name || 'Diğer')
        const mk = mainLabel
        const ck = `${mainLabel}||${catLabel}`
        mainKeys.add(mk)
        catKeys.add(ck)
      })
      setExpandedMain(mainKeys)
      setExpandedCat(catKeys)
    } catch (e: any) {
      toast(e?.message || 'Sorular yüklenemedi', 'error')
    } finally {
      setLoadingQ(false)
    }
  }

  const saveQuestionsModal = async () => {
    if (!qModalPeriod) return
    setSavingQ(true)
    try {
      // Replace all: delete then insert selected
      const ids = Array.from(selectedQ)
      const { error: delErr } = await supabase
        .from('evaluation_period_questions')
        .delete()
        .eq('period_id', qModalPeriod.id)
      if (delErr) throw delErr

      if (ids.length > 0) {
        const payload = ids.map((qid, idx) => ({
          period_id: qModalPeriod.id,
          question_id: qid,
          sort_order: idx + 1,
          is_active: true,
        }))
        const { error: insErr } = await supabase.from('evaluation_period_questions').insert(payload)
        if (insErr) throw insErr
      }

      toast('Soru seçimi kaydedildi', 'success')
      setShowQModal(false)
    } catch (e: any) {
      toast(e?.message || 'Kaydetme hatası', 'error')
    } finally {
      setSavingQ(false)
    }
  }
  return (
    <RequireSelection enabled={!organizationId} message="KVKK için: önce üst bardan kurum seçmelisiniz.">
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 {t('periods', lang)}</h1>
          <p className="text-gray-500 mt-1">Değerlendirme dönemlerini yönetin</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="w-5 h-5" />
          {t('newPeriod', lang)}
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
              <p>{t('noPeriodsYet', lang)}</p>
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
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('statusLabel', lang)}</th>
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
                            onClick={() => openQuestionsModal(period)}
                            className="px-3 py-2 text-xs font-semibold text-[var(--brand)] bg-[var(--brand-soft)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)]"
                          >
                            {t('periodQuestions', lang)}
                          </button>
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
                {editingPeriod ? 'Dönem Düzenle' : t('newPeriod', lang)}
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
                placeholder={t('selectOrganization', lang)}
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
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : t('saveLabel', lang)}
              </Button>
            </div>
          </div>
        </div>
      )}


      {showQModal && qModalPeriod ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {t('periodQuestions', lang)} — {qModalPeriod.name}
                </div>
                <div className="text-sm text-gray-500 mt-1">{t('periodQuestionsHint', lang)}</div>
              </div>
              <button
                onClick={() => setShowQModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-end gap-3 mb-4">
                <div className="flex-1">
                  <Input
                    label={t('search', lang)}
                    value={qSearch}
                    onChange={(e) => setQSearch(e.target.value)}
                    placeholder={t('search', lang)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const all = new Set(allQuestions.map((q) => q.id))
                      setSelectedQ(all)
                    }}
                  >
                    + Tümü
                  </Button>
                  <Button variant="secondary" onClick={() => setSelectedQ(new Set())}>
                    Temizle
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="text-sm text-gray-600">
                  Seçili: <span className="font-semibold text-gray-900">{selectedQ.size}</span>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={showSelectedOnly}
                      onChange={(e) => setShowSelectedOnly(e.target.checked)}
                    />
                    Sadece seçilenler
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={selectedFirst}
                      onChange={(e) => setSelectedFirst(e.target.checked)}
                    />
                    Seçilenleri üstte göster
                  </label>
                </div>
              </div>

              {loadingQ ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--brand)]" />
                </div>
              ) : (
                (() => {
                  const search = qSearch.trim().toLowerCase()
                  const rows = (allQuestions || []).filter((q) => {
                    if (!search) return true
                    const n = String(q.text || '').toLowerCase()
                    const fr = String(q.text_fr || '').toLowerCase()
                    return n.includes(search) || fr.includes(search)
                  })
                  const effectiveRows = showSelectedOnly ? rows.filter((q) => selectedQ.has(String(q.id))) : rows

                  // Group: Main -> Category -> Questions
                  const grouped = new Map<
                    string,
                    {
                      mainLabel: string
                      categories: Map<
                        string,
                        { catLabel: string; questions: any[] }
                      >
                    }
                  >()

                  effectiveRows.forEach((q: any) => {
                    const cat = (q.question_categories || q.categories) as any
                    const mc = cat?.main_categories
                    const mainLabel = String(mc?.name || 'Diğer')
                    const catLabel = String(cat?.name || 'Diğer')
                    const main = grouped.get(mainLabel) || { mainLabel, categories: new Map() }
                    const c = main.categories.get(catLabel) || { catLabel, questions: [] as any[] }
                    c.questions.push(q)
                    main.categories.set(catLabel, c)
                    grouped.set(mainLabel, main)
                  })

                  const mainList = Array.from(grouped.values()).sort((a, b) => a.mainLabel.localeCompare(b.mainLabel))

                  const toggleMain = (k: string) =>
                    setExpandedMain((prev) => {
                      const next = new Set(prev)
                      if (next.has(k)) next.delete(k)
                      else next.add(k)
                      return next
                    })

                  const toggleCat = (k: string) =>
                    setExpandedCat((prev) => {
                      const next = new Set(prev)
                      if (next.has(k)) next.delete(k)
                      else next.add(k)
                      return next
                    })

                  const setMany = (ids: string[], checked: boolean) =>
                    setSelectedQ((prev) => {
                      const next = new Set(prev)
                      ids.forEach((id) => {
                        if (checked) next.add(id)
                        else next.delete(id)
                      })
                      return next
                    })

                  const renderQuestion = (q: any) => {
                    const checked = selectedQ.has(q.id)
                    return (
                      <label key={q.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setMany([q.id], e.target.checked)}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900">{q.text}</div>
                          {q.text_fr ? <div className="text-xs text-gray-500 mt-1">FR: {q.text_fr}</div> : null}
                        </div>
                      </label>
                    )
                  }

                  if (mainList.length === 0) {
                    return (
                      <div className="border border-gray-100 rounded-xl p-6 text-center text-sm text-gray-500">
                        {showSelectedOnly ? 'Seçili soru yok' : 'Soru bulunamadı'}
                      </div>
                    )
                  }

                  return (
                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="max-h-[55vh] overflow-y-auto divide-y divide-gray-100">
                        {mainList.map((m) => {
                          const mainKey = m.mainLabel
                          const isOpen = expandedMain.has(mainKey)
                          const catList = Array.from(m.categories.values()).sort((a, b) => a.catLabel.localeCompare(b.catLabel))
                          const mainQuestionIds = catList.flatMap((c) => c.questions.map((q) => String(q.id)))
                          const mainSelectedCount = mainQuestionIds.filter((id) => selectedQ.has(id)).length
                          const mainAllSelected = mainQuestionIds.length > 0 && mainSelectedCount === mainQuestionIds.length

                          return (
                            <div key={mainKey} className="bg-white">
                              <div className="px-4 py-3 flex items-center justify-between gap-3 bg-[var(--surface-2)]">
                                <button
                                  type="button"
                                  onClick={() => toggleMain(mainKey)}
                                  className="flex items-center gap-2 min-w-0 text-left"
                                >
                                  {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                  <BookOpen className="w-4 h-4 text-[var(--brand)]" />
                                  <span className="font-semibold text-gray-900 truncate">{m.mainLabel}</span>
                                  <span className="text-xs text-gray-500 whitespace-nowrap">
                                    {mainSelectedCount}/{mainQuestionIds.length}
                                  </span>
                                </button>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setMany(mainQuestionIds, true)}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
                                  >
                                    + Tümü
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setMany(mainQuestionIds, false)}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
                                  >
                                    Temizle
                                  </button>
                                  <label className="flex items-center gap-2 text-xs text-gray-600">
                                    <input
                                      type="checkbox"
                                      checked={mainAllSelected}
                                      onChange={(e) => setMany(mainQuestionIds, e.target.checked)}
                                    />
                                    Seç
                                  </label>
                                </div>
                              </div>

                              {isOpen && (
                                <div className="divide-y divide-gray-100">
                                  {catList.map((c) => {
                                    const catKey = `${m.mainLabel}||${c.catLabel}`
                                    const catOpen = expandedCat.has(catKey)
                                    const sortedQuestions = selectedFirst
                                      ? [...c.questions].sort((a, b) => Number(selectedQ.has(String(b.id))) - Number(selectedQ.has(String(a.id))))
                                      : c.questions
                                    const catIds = sortedQuestions.map((q) => String(q.id))
                                    const catSelected = catIds.filter((id) => selectedQ.has(id)).length
                                    const catAllSelected = catIds.length > 0 && catSelected === catIds.length

                                    return (
                                      <div key={catKey}>
                                        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                                          <button
                                            type="button"
                                            onClick={() => toggleCat(catKey)}
                                            className="flex items-center gap-2 min-w-0 text-left"
                                          >
                                            {catOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                            <Folder className="w-4 h-4 text-emerald-600" />
                                            <span className="font-medium text-gray-900 truncate">{c.catLabel}</span>
                                            <span className="text-xs text-gray-500 whitespace-nowrap">
                                              {catSelected}/{catIds.length}
                                            </span>
                                          </button>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => setMany(catIds, true)}
                                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
                                            >
                                              + Tümü
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setMany(catIds, false)}
                                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
                                            >
                                              Temizle
                                            </button>
                                            <label className="flex items-center gap-2 text-xs text-gray-600">
                                              <input
                                                type="checkbox"
                                                checked={catAllSelected}
                                                onChange={(e) => setMany(catIds, e.target.checked)}
                                              />
                                              Seç
                                            </label>
                                          </div>
                                        </div>

                                        {catOpen && (
                                          <div className="pl-6 border-l border-gray-100">
                                            <div className="px-4 py-2 text-xs text-gray-500 flex items-center gap-2">
                                              <CheckSquare className="w-4 h-4 text-gray-400" />
                                              Sorular
                                            </div>
                                            <div className="divide-y divide-gray-100">
                                              {sortedQuestions.map(renderQuestion)}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()
              )}

              <div className="flex items-center justify-between mt-5">
                <div className="text-sm text-gray-500">Seçili: {selectedQ.size}</div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setShowQModal(false)}>
                    {t('cancel', lang)}
                  </Button>
                  <Button onClick={saveQuestionsModal} disabled={savingQ}>
                    {savingQ ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {t('save', lang)}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </RequireSelection>
  )
}
