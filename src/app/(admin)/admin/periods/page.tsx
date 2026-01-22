'use client'

import { useCallback, useEffect, useState } from 'react'
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
    name_en: '' as string,
    name_fr: '' as string,
    organization_id: '',
    start_date: '',
    end_date: '',
    status: 'active' as EvaluationPeriod['status'],
  })
  const [saving, setSaving] = useState(false)

  const lang = useLang()

  const periodLabel = (p: any) => {
    if (!p) return ''
    if (lang === 'fr') return String(p.name_fr || p.name || '')
    if (lang === 'en') return String(p.name_en || p.name || '')
    return String(p.name || '')
  }

  const [showQModal, setShowQModal] = useState(false)
  const [qModalPeriod, setQModalPeriod] = useState<EvaluationPeriod | null>(null)
  const [allQuestions, setAllQuestions] = useState<any[]>([])
  const [selectedQ, setSelectedQ] = useState<Set<string>>(new Set())
  const [selectedQOrder, setSelectedQOrder] = useState<string[]>([])
  const [qSearch, setQSearch] = useState('')
  const [loadingQ, setLoadingQ] = useState(false)
  const [savingQ, setSavingQ] = useState(false)
  const [expandedMain, setExpandedMain] = useState<Set<string>>(new Set())
  const [expandedCat, setExpandedCat] = useState<Set<string>>(new Set())
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const [selectedFirst, setSelectedFirst] = useState(true)


  const loadData = useCallback(async (orgId: string) => {
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
  }, [lang])

  useEffect(() => {
    if (!organizationId) {
      setPeriods([])
      setOrganizations([])
      setLoading(false)
      return
    }
    loadData(organizationId)
  }, [organizationId, loadData])

  const openModal = (period?: EvaluationPeriod) => {
    if (period) {
      setEditingPeriod(period)
      setFormData({
        name: period.name,
        name_en: String((period as any).name_en || ''),
        name_fr: String((period as any).name_fr || ''),
        organization_id: period.organization_id,
        start_date: period.start_date,
        end_date: period.end_date,
        status: period.status,
      })
    } else {
      setEditingPeriod(null)
      setFormData({
        name: '',
        name_en: '',
        name_fr: '',
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
      const resp = await fetch('/api/admin/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(formData as any), id: editingPeriod?.id }),
      })
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}))
        if (resp.status === 401 || resp.status === 403) {
          toast(t('sessionMissingReLogin', lang), 'warning')
        } else if ((payload as any)?.error) {
          toast(String((payload as any).error), 'error')
        }
        // Fallback
        if (editingPeriod) {
          const { error } = await supabase.from('evaluation_periods').update(formData).eq('id', editingPeriod.id)
          if (error) throw error
          toast(t('periodUpdated', lang), 'success')
        } else {
          const { error } = await supabase.from('evaluation_periods').insert(formData)
          if (error) throw error
          toast(t('periodAdded', lang), 'success')
        }
      } else {
        toast(editingPeriod ? t('periodUpdated', lang) : t('periodAdded', lang), 'success')
      }
      setShowModal(false)
      if (organizationId) loadData(organizationId)
    } catch (error: any) {
      toast(error.message || t('saveError', lang), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (period: EvaluationPeriod) => {
    // Keep confirm text simple (browser confirm isn't styled). Use displayed label (already localized) for clarity.
    if (!confirm(`${periodLabel(period)}: ${t('deleteLabel', lang)}?`)) return

    try {
      const resp = await fetch('/api/admin/periods', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: period.id }),
      })
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}))
        if (resp.status === 401 || resp.status === 403) {
          toast(t('sessionMissingReLogin', lang), 'warning')
        } else if ((payload as any)?.error) {
          toast(String((payload as any).error), 'error')
        }
        const { error } = await supabase.from('evaluation_periods').delete().eq('id', period.id)
        if (error) throw error
      }
      toast(t('periodDeleted', lang), 'success')
      if (organizationId) loadData(organizationId)
    } catch (error: any) {
      toast(error.message || t('deleteError', lang), 'error')
    }
  }

  const statusColors: Record<string, 'success' | 'warning' | 'gray'> = {
    active: 'success',
    inactive: 'gray',
    completed: 'warning',
  }

  const statusLabels: Record<string, string> = {
    active: `🟢 ${t('activeLabel', lang)}`,
    inactive: `⚪ ${t('inactiveLabel', lang)}`,
    completed: `✅ ${t('doneLabel', lang)}`,
  }



  const snapshotCoefficients = async (period: EvaluationPeriod) => {
    if (
      !confirm(
        `"${period.name}" dönemi için katsayıları kilitlemek (snapshot almak) istiyor musunuz?\n\nNot: Bu işlem, bu dönem için sonuç hesaplarının katsayı değişikliklerinden etkilenmemesini sağlar.`
      )
    ) {
      return
    }
    try {
      const resp = await fetch('/api/admin/period-coefficients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: period.id, overwrite: true }),
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        toast(String((payload as any)?.error || 'Snapshot hatası'), 'error')
        if ((payload as any)?.detail) toast(String((payload as any)?.detail), 'warning')
        if ((payload as any)?.hint) toast(String((payload as any)?.hint), 'info')
        return
      }
      toast('Katsayı snapshot alındı (dönem bazlı kilitlendi)', 'success')
    } catch (e: any) {
      toast(e?.message || 'Snapshot hatası', 'error')
    }
  }

  const openQuestionsModal = async (period: EvaluationPeriod) => {
    setQModalPeriod(period)
    setShowQModal(true)
    setLoadingQ(true)
    try {
      // Load existing selection via server API (KVKK/RLS safe)
      const selected = new Set<string>()
      const selectedOrder: string[] = []
      const selResp = await fetch(`/api/admin/period-questions?period_id=${encodeURIComponent(period.id)}`)
      const selPayload = await selResp.json().catch(() => ({}))
      if (selResp.ok && (selPayload as any)?.success) {
        const pq = ((selPayload as any).questions || []) as any[]
        pq.forEach((r) => {
          const id = String(r.question_id || '')
          if (!id) return
          selected.add(id)
          selectedOrder.push(id)
        })
      } else if (selResp.status === 401 || selResp.status === 403) {
        toast(t('sessionMissingReLogin', lang), 'warning')
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
      setSelectedQOrder(selectedOrder)
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
      const ids = selectedQOrder.filter((id) => selectedQ.has(id))
      // keep any selected ids that may not be in order array (safety)
      Array.from(selectedQ).forEach((id) => {
        if (!ids.includes(id)) ids.push(id)
      })
      const resp = await fetch('/api/admin/period-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: qModalPeriod.id, question_ids: ids }),
      })
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}))
        if (resp.status === 401 || resp.status === 403) {
          toast(t('sessionMissingReLogin', lang), 'warning')
          return
        }
        if ((payload as any)?.error) toast(String((payload as any).error), 'error')
        else toast(t('saveFailed', lang), 'error')
        return
      }

      toast(t('periodQuestionsSaved', lang), 'success')
      setShowQModal(false)
    } catch (e: any) {
      toast(e?.message || t('saveFailed', lang), 'error')
    } finally {
      setSavingQ(false)
    }
  }
  return (
    <RequireSelection enabled={!organizationId} message={t('kvkkSelectOrgToContinue', lang)}>
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 {t('periods', lang)}</h1>
          <p className="text-gray-500 mt-1">{t('periodsSubtitle', lang)}</p>
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
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('periodNameLabel', lang)}</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('organization', lang)}</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('startDate', lang)}</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('endDate', lang)}</th>
                    <th className="text-left py-4 px-6 font-semibold text-gray-600 text-sm">{t('statusLabel', lang)}</th>
                    <th className="text-right py-4 px-6 font-semibold text-gray-600 text-sm">{t('actionLabel', lang)}</th>
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
                          <span className="font-medium text-gray-900">{periodLabel(period)}</span>
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
                            onClick={() => snapshotCoefficients(period)}
                            className="px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                            title={t('lockCoefficientsTitle', lang)}
                          >
                            {t('lockCoefficients', lang)}
                          </button>
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
                {editingPeriod ? t('editPeriodTitle', lang) : t('newPeriod', lang)}
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
                label={t('periodNameRequired', lang)}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('periodNameExample', lang)}
              />
              <Input
                label="Period Name (EN)"
                value={formData.name_en}
                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                placeholder="Example: 2026 Q1 Evaluation"
              />
              <Input
                label="Nom de la période (FR)"
                value={formData.name_fr}
                onChange={(e) => setFormData({ ...formData, name_fr: e.target.value })}
                placeholder="Exemple : Évaluation T1 2026"
              />
              <Select
                label={`${t('organization', lang)} *`}
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                value={formData.organization_id}
                onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                placeholder={t('selectOrganization', lang)}
              />
              <Input
                label={t('startDateRequired', lang)}
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
              <Input
                label={t('endDateRequired', lang)}
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
              <Select
                label={t('statusLabel', lang)}
                options={[
                  { value: 'active', label: `🟢 ${t('activeLabel', lang)}` },
                  { value: 'inactive', label: `⚪ ${t('inactiveLabel', lang)}` },
                  { value: 'completed', label: `✅ ${t('doneLabel', lang)}` },
                ]}
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as EvaluationPeriod['status'] })}
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


      {showQModal && qModalPeriod ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {t('periodQuestions', lang)} — {periodLabel(qModalPeriod)}
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
                <div>
                {(() => {
                  const search = qSearch.trim().toLowerCase()

                  const upsertOne = (id: string, checked: boolean) => {
                    const sid = String(id)
                    setSelectedQ((prev) => {
                      const next = new Set(prev)
                      if (checked) next.add(sid)
                      else next.delete(sid)
                      return next
                    })
                    setSelectedQOrder((prev) => {
                      const next = prev.filter((x) => x !== sid)
                      if (checked) next.push(sid) // append new selections to end
                      return next
                    })
                  }

                  const setMany = (ids: string[], checked: boolean) => {
                    const uniq = ids.map(String)
                    setSelectedQ((prev) => {
                      const next = new Set(prev)
                      uniq.forEach((id) => {
                        if (checked) next.add(id)
                        else next.delete(id)
                      })
                      return next
                    })
                    setSelectedQOrder((prev) => {
                      if (checked) {
                        const next = [...prev]
                        uniq.forEach((id) => {
                          if (!next.includes(id)) next.push(id)
                        })
                        return next
                      }
                      return prev.filter((id) => !uniq.includes(id))
                    })
                  }

                  const moveSelected = (id: string, dir: -1 | 1) => {
                    const sid = String(id)
                    setSelectedQOrder((prev) => {
                      const idx = prev.indexOf(sid)
                      if (idx < 0) return prev
                      const nidx = idx + dir
                      if (nidx < 0 || nidx >= prev.length) return prev
                      const next = [...prev]
                      const tmp = next[nidx]
                      next[nidx] = next[idx]
                      next[idx] = tmp
                      return next
                    })
                  }

                  const selectedList = selectedQOrder
                    .filter((id) => selectedQ.has(id))
                    .map((id) => {
                      const q = (allQuestions || []).find((x) => String(x.id) === id)
                      return { id, q }
                    })

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

                  const renderQuestion = (q: any) => {
                    const checked = selectedQ.has(q.id)
                    return (
                      <label key={q.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => upsertOne(q.id, e.target.checked)}
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
                    <div className="space-y-4">
                      {/* Selected list panel (order) */}
                      {selectedList.length > 0 && (
                        <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                          <div className="px-4 py-3 bg-[var(--surface-2)] flex items-center justify-between">
                            <div className="font-semibold text-gray-900">✅ Seçilen Sorular (Sıra)</div>
                            <div className="text-xs text-gray-500">
                              Kaydederken bu sıra kullanılır
                            </div>
                          </div>
                          <div className="max-h-[220px] overflow-y-auto divide-y divide-gray-100">
                            {selectedList.map(({ id, q }, idx) => {
                              const cat = (q?.question_categories || q?.categories) as any
                              const mc = cat?.main_categories
                              return (
                                <div key={id} className="px-4 py-3 flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-xs text-gray-500">
                                      {idx + 1}. {mc?.name || '-'} › {cat?.name || '-'}
                                    </div>
                                    <div className="font-medium text-gray-900 truncate">
                                      {q?.text || id}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => moveSelected(id, -1)}
                                      className="px-2 py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
                                      disabled={idx === 0}
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveSelected(id, 1)}
                                      className="px-2 py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
                                      disabled={idx === selectedList.length - 1}
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => upsertOne(id, false)}
                                      className="px-2 py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50"
                                    >
                                      Kaldır
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

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
                    </div>
                  )
                })()}
                </div>
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
