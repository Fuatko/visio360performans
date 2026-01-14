'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, toast, ToastContainer, Button, Badge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { Loader2, Save } from 'lucide-react'

export default function CoefficientsPage() {
  const { organizationId } = useAdminContextStore()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [evaluatorRows, setEvaluatorRows] = useState<
    { position_level: string; weight: number; description: string | null }[]
  >([])

  const [categoryRows, setCategoryRows] = useState<
    { category_name: string; weight: number; is_critical: boolean }[]
  >([])

  const canLoad = Boolean(organizationId)

  const positionLabels: Record<string, string> = useMemo(
    () => ({
      executive: '👔 Üst Yönetici (executive)',
      manager: '👨‍💼 Yönetici (manager)',
      peer: '👥 Eş Düzey (peer)',
      subordinate: '👤 Ast (subordinate)',
      self: '🔵 Öz Değerlendirme (self)',
    }),
    []
  )

  useEffect(() => {
    if (!canLoad) {
      setEvaluatorRows([])
      setCategoryRows([])
      return
    }
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  const loadAll = async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      // evaluator weights: org override varsa onu kullan, yoksa default (org=null)
      const [orgEval, defEval, cats, orgCatW, defCatW] = await Promise.all([
        supabase.from('evaluator_weights').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
        supabase.from('evaluator_weights').select('*').is('organization_id', null).order('created_at', { ascending: false }),
        supabase.from('question_categories').select('name').eq('is_active', true).order('sort_order'),
        supabase.from('category_weights').select('*').eq('organization_id', organizationId),
        supabase.from('category_weights').select('*').is('organization_id', null),
      ])

      const pickLatestBy = <T extends Record<string, any>>(rows: T[] | null | undefined, key: string) => {
        const out = new Map<string, T>()
        ;(rows || []).forEach((r) => {
          const k = String(r[key] ?? '')
          if (!k) return
          if (!out.has(k)) out.set(k, r)
        })
        return out
      }

      const orgEvalMap = pickLatestBy(orgEval.data, 'position_level')
      const defEvalMap = pickLatestBy(defEval.data, 'position_level')
      const mergedLevels = new Set<string>([...defEvalMap.keys(), ...orgEvalMap.keys()])
      const mergedEvaluator = Array.from(mergedLevels).map((lvl) => {
        const row = orgEvalMap.get(lvl) || defEvalMap.get(lvl)
        return {
          position_level: lvl,
          weight: Number(row?.weight ?? 1),
          description: (row?.description ?? null) as string | null,
        }
      }).sort((a, b) => a.position_level.localeCompare(b.position_level))

      setEvaluatorRows(mergedEvaluator)

      const orgCatMap = new Map<string, any>((orgCatW.data || []).map((r: any) => [r.category_name, r]))
      const defCatMap = new Map<string, any>((defCatW.data || []).map((r: any) => [r.category_name, r]))
      const categoryNames = (cats.data || []).map((c: any) => c.name).filter(Boolean) as string[]

      const mergedCategories = categoryNames.map((name) => {
        const row = orgCatMap.get(name) || defCatMap.get(name)
        return {
          category_name: name,
          weight: Number(row?.weight ?? 1),
          is_critical: Boolean(row?.is_critical ?? false),
        }
      })

      setCategoryRows(mergedCategories)
    } catch (e: any) {
      toast(e?.message || 'Katsayılar yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  const saveEvaluatorWeights = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      // KVKK/Güvenlik: org bazında override yazarız. Önce mevcut override'ları temizle.
      const levels = evaluatorRows.map(r => r.position_level)
      await supabase.from('evaluator_weights').delete().eq('organization_id', organizationId).in('position_level', levels)

      const payload = evaluatorRows.map((r) => ({
        organization_id: organizationId,
        position_level: r.position_level,
        weight: Number(r.weight),
        description: r.description || null,
      }))

      const { error } = await supabase.from('evaluator_weights').insert(payload)
      if (error) throw error
      toast('Değerlendirici ağırlıkları kaydedildi', 'success')
      await loadAll()
    } catch (e: any) {
      toast(e?.message || 'Kaydetme hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveCategoryWeights = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      await supabase.from('category_weights').delete().eq('organization_id', organizationId)

      const payload = categoryRows.map((r) => ({
        organization_id: organizationId,
        category_name: r.category_name,
        weight: Number(r.weight),
        is_critical: Boolean(r.is_critical),
      }))

      const { error } = await supabase.from('category_weights').insert(payload)
      if (error) throw error
      toast('Kategori ağırlıkları kaydedildi', 'success')
      await loadAll()
    } catch (e: any) {
      toast(e?.message || 'Kaydetme hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <RequireSelection enabled={!organizationId} message="KVKK için: önce üst bardan kurum seçmelisiniz.">
      <div className="space-y-6">
        <ToastContainer />

        <div>
          <h1 className="text-2xl font-bold text-gray-900">🎛️ Katsayı Ayarları</h1>
          <p className="text-gray-500 mt-1">
            Kurum seçimine göre katsayıları yönetebilirsiniz.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>👥 Değerlendirici Ağırlıkları</CardTitle>
                <Badge variant="gray">evaluator_weights</Badge>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-gray-600">
                  Değerlendiricinin pozisyon seviyesine göre ağırlık katsayısı.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Pozisyon Seviyesi</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Açıklama</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600">Ağırlık</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {evaluatorRows.map((r) => (
                        <tr key={r.position_level}>
                          <td className="py-3 px-4 font-medium text-gray-900">
                            {positionLabels[r.position_level] || r.position_level}
                          </td>
                          <td className="py-3 px-4 text-gray-600">{r.description || '-'}</td>
                          <td className="py-3 px-4 text-right">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="2.0"
                              value={r.weight}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value || '0')
                                setEvaluatorRows((prev) =>
                                  prev.map((x) => (x.position_level === r.position_level ? { ...x, weight: v } : x))
                                )
                              }}
                              className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-right"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveEvaluatorWeights} disabled={saving || !canLoad}>
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Kaydet
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>📊 Kategori Ağırlıkları</CardTitle>
                <Badge variant="gray">category_weights</Badge>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-gray-600">
                  Her kategori için ağırlık ve “kritik” işaretini belirleyin.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Kategori</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600">Ağırlık</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-600">Kritik?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {categoryRows.map((r) => (
                        <tr key={r.category_name}>
                          <td className="py-3 px-4 font-medium text-gray-900">{r.category_name}</td>
                          <td className="py-3 px-4 text-right">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="3.0"
                              value={r.weight}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value || '0')
                                setCategoryRows((prev) =>
                                  prev.map((x) => (x.category_name === r.category_name ? { ...x, weight: v } : x))
                                )
                              }}
                              className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-right"
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={r.is_critical}
                              onChange={(e) => {
                                const v = e.target.checked
                                setCategoryRows((prev) =>
                                  prev.map((x) => (x.category_name === r.category_name ? { ...x, is_critical: v } : x))
                                )
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <Button onClick={saveCategoryWeights} disabled={saving || !canLoad}>
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Kaydet
                  </Button>
                </div>
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </RequireSelection>
  )
}

