'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, toast, ToastContainer, Button, Badge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'

export default function CoefficientsPage() {
  const { organizationId } = useAdminContextStore()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  type PostgrestErrorLike = { code?: string; message?: string }
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Bilinmeyen hata')

  const [evaluatorRows, setEvaluatorRows] = useState<
    { position_level: string; weight: number; description: string | null }[]
  >([])

  const [categoryRows, setCategoryRows] = useState<
    { category_name: string; weight: number; is_critical: boolean }[]
  >([])

  const [standards, setStandards] = useState<
    {
      id?: string
      code: string
      title: string
      description: string
      is_active: boolean
      sort_order: number
    }[]
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
      setStandards([])
      return
    }
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  const loadAll = async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      type EvaluatorWeightRow = { position_level: string; weight: number; description: string | null }
      type CategoryWeightRow = { category_name: string; weight: number; is_critical: boolean }
      type CategoryNameRow = { name: string | null }
      type InternationalStandardRow = {
        id: string
        code: string | null
        title: string
        description: string | null
        is_active: boolean
        sort_order: number
        created_at: string
      }

      // evaluator weights: org override varsa onu kullan, yoksa default (org=null)
      const [orgEval, defEval, cats, orgCatW, defCatW] = await Promise.all([
        supabase.from('evaluator_weights').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
        supabase.from('evaluator_weights').select('*').is('organization_id', null).order('created_at', { ascending: false }),
        supabase.from('question_categories').select('name').eq('is_active', true).order('sort_order'),
        supabase.from('category_weights').select('*').eq('organization_id', organizationId),
        supabase.from('category_weights').select('*').is('organization_id', null),
      ])

      const pickLatestBy = <T extends Record<string, unknown>>(rows: T[] | null | undefined, key: string) => {
        const out = new Map<string, T>()
        ;(rows || []).forEach((r) => {
          const k = String((r as Record<string, unknown>)[key] ?? '')
          if (!k) return
          if (!out.has(k)) out.set(k, r)
        })
        return out
      }

      const orgEvalMap = pickLatestBy((orgEval.data || []) as unknown as EvaluatorWeightRow[], 'position_level')
      const defEvalMap = pickLatestBy((defEval.data || []) as unknown as EvaluatorWeightRow[], 'position_level')
      const mergedLevels = new Set<string>([...defEvalMap.keys(), ...orgEvalMap.keys()])
      const mergedEvaluator = Array.from(mergedLevels).map((lvl) => {
        const row = (orgEvalMap.get(lvl) || defEvalMap.get(lvl)) as unknown as EvaluatorWeightRow | undefined
        return {
          position_level: lvl,
          weight: Number(row?.weight ?? 1),
          description: (row?.description ?? null) as string | null,
        }
      }).sort((a, b) => a.position_level.localeCompare(b.position_level))

      setEvaluatorRows(mergedEvaluator)

      const orgCatRows = (orgCatW.data || []) as unknown as CategoryWeightRow[]
      const defCatRows = (defCatW.data || []) as unknown as CategoryWeightRow[]
      const orgCatMap = new Map<string, CategoryWeightRow>(orgCatRows.map((r) => [r.category_name, r]))
      const defCatMap = new Map<string, CategoryWeightRow>(defCatRows.map((r) => [r.category_name, r]))

      const categoryNames = ((cats.data || []) as unknown as CategoryNameRow[])
        .map((c) => c.name)
        .filter(Boolean) as string[]

      const mergedCategories = categoryNames.map((name) => {
        const row = orgCatMap.get(name) || defCatMap.get(name)
        return {
          category_name: name,
          weight: Number(row?.weight ?? 1),
          is_critical: Boolean(row?.is_critical ?? false),
        }
      })

      setCategoryRows(mergedCategories)

      // International standards (org-specific)
      const { data: stds, error: stdErr } = await supabase
        .from('international_standards')
        .select('*')
        .eq('organization_id', organizationId)
        .order('sort_order')
        .order('created_at')

      if (stdErr) {
        // Table missing (user has not run SQL yet)
        const e = stdErr as unknown as PostgrestErrorLike
        if (e.code === '42P01') {
          toast('Uluslararası standart tabloları bulunamadı. Önce SQL dosyasını Supabase SQL Editor’da çalıştırın.', 'warning')
        } else if ((e.message || '').toLowerCase().includes('schema cache') || (e.message || '').toLowerCase().includes("could not find the table")) {
          toast(
            "Supabase API şema önbelleği (schema cache) güncel değil. Supabase Dashboard → Settings → API → 'Reload schema' (veya Project restart) yapın, 1-2 dk sonra sayfayı yenileyin.",
            'warning'
          )
        } else {
          toast(e.message || 'Uluslararası standartlar yüklenemedi', 'error')
        }
      }

      setStandards(
        ((stds || []) as unknown as InternationalStandardRow[]).map((s) => ({
          id: s.id,
          code: s.code || '',
          title: s.title || '',
          description: s.description || '',
          is_active: Boolean(s.is_active ?? true),
          sort_order: Number(s.sort_order ?? 0),
        }))
      )
    } catch (e: unknown) {
      toast(errMsg(e) || 'Katsayılar yüklenemedi', 'error')
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
    } catch (e: unknown) {
      toast(errMsg(e) || 'Kaydetme hatası', 'error')
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
    } catch (e: unknown) {
      toast(errMsg(e) || 'Kaydetme hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  const addStandard = () => {
    setStandards((prev) => [
      ...prev,
      {
        code: '',
        title: '',
        description: '',
        is_active: true,
        sort_order: prev.length ? Math.max(...prev.map((p) => p.sort_order)) + 1 : 0,
      },
    ])
  }

  const saveStandards = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      const payload = standards.map((s) => ({
        id: s.id,
        organization_id: organizationId,
        code: s.code.trim() || null,
        title: s.title.trim(),
        description: s.description.trim() || null,
        is_active: Boolean(s.is_active),
        sort_order: Number(s.sort_order || 0),
      }))

      if (payload.some((p) => !p.title)) {
        toast('Standart adı boş olamaz', 'error')
        setSaving(false)
        return
      }

      const { error } = await supabase.from('international_standards').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      toast('Uluslararası standartlar kaydedildi', 'success')
      await loadAll()
    } catch (e: unknown) {
      const msg = errMsg(e) || 'Standart kaydetme hatası'
      if (msg.toLowerCase().includes('schema cache') || msg.toLowerCase().includes("could not find the table")) {
        toast(
          "Supabase API şema önbelleği (schema cache) güncel değil. Supabase Dashboard → Settings → API → 'Reload schema' (veya Project restart) yapın, 1-2 dk sonra tekrar deneyin.",
          'error'
        )
      } else {
        toast(msg, 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteStandard = async (id?: string) => {
    if (!id) {
      setStandards((prev) => prev.filter((s) => s.id !== id))
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('international_standards').delete().eq('id', id)
      if (error) throw error
      toast('Standart silindi', 'success')
      await loadAll()
    } catch (e: unknown) {
      toast(errMsg(e) || 'Silme hatası', 'error')
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
            <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>🌍 Giriş ve Uluslararası Standartlar</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="gray">international_standards</Badge>
                  <Button variant="secondary" onClick={addStandard} disabled={saving || !canLoad}>
                    <Plus className="w-4 h-4" />
                    Ekle
                  </Button>
                  <Button onClick={saveStandards} disabled={saving || !canLoad}>
                    <Save className="w-4 h-4" />
                    Kaydet
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-[var(--muted)]">
                  Değerlendirmeler başlamadan önce, bu standartlara göre 1–5 puan ve gerekçe girilir.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--muted)] w-[90px]">Kod</th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--muted)] w-[320px]">Standart</th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">Açıklama</th>
                        <th className="text-center py-3 px-4 font-semibold text-[var(--muted)] w-[120px]">Sıra</th>
                        <th className="text-center py-3 px-4 font-semibold text-[var(--muted)] w-[120px]">Aktif</th>
                        <th className="text-right py-3 px-4 font-semibold text-[var(--muted)] w-[120px]">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {standards.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[var(--muted)]">
                            Standart eklemek için “Ekle”ye basın.
                          </td>
                        </tr>
                      ) : (
                        standards.map((s, idx) => (
                          <tr key={s.id || `new-${idx}`}>
                            <td className="py-3 px-4">
                              <input
                                value={s.code}
                                onChange={(e) =>
                                  setStandards((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, code: e.target.value } : x))
                                  )
                                }
                                className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)]"
                                placeholder="1.1"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <input
                                value={s.title}
                                onChange={(e) =>
                                  setStandards((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                                  )
                                }
                                className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)]"
                                placeholder="Örn: 1.1 Uyumlu Uluslararası Standartlar"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <input
                                value={s.description}
                                onChange={(e) =>
                                  setStandards((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x))
                                  )
                                }
                                className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)]"
                                placeholder="Kısa açıklama"
                              />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <input
                                type="number"
                                value={s.sort_order}
                                onChange={(e) =>
                                  setStandards((prev) =>
                                    prev.map((x, i) =>
                                      i === idx ? { ...x, sort_order: Number(e.target.value || 0) } : x
                                    )
                                  )
                                }
                                className="w-20 px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-center"
                              />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={s.is_active}
                                onChange={(e) =>
                                  setStandards((prev) =>
                                    prev.map((x, i) => (i === idx ? { ...x, is_active: e.target.checked } : x))
                                  )
                                }
                              />
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-2)]"
                                onClick={() => deleteStandard(s.id)}
                                disabled={saving || !canLoad}
                              >
                                <Trash2 className="w-4 h-4 text-[var(--danger)]" />
                                Sil
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>

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

