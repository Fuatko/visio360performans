'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, toast, ToastContainer, Button, Badge } from '@/components/ui'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'

export default function CoefficientsPage() {

  const lang = useLang()
  const { organizationId } = useAdminContextStore()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error')

  // C1b: config yazma tek server route üzerinden (org-scope + global koruması server'da)
  const postCoefficients = async (payload: Record<string, unknown>) => {
    const resp = await fetch('/api/admin/coefficients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: organizationId, ...payload }),
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok || !json?.success) throw new Error(json?.error || t('saveFailed', lang))
  }

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

  const [confidenceMinHigh, setConfidenceMinHigh] = useState<number>(5)
  const [deviation, setDeviation] = useState<{
    lenient_diff_threshold: number
    harsh_diff_threshold: number
    lenient_multiplier: number
    harsh_multiplier: number
  }>({
    lenient_diff_threshold: 0.75,
    harsh_diff_threshold: 0.75,
    lenient_multiplier: 0.85,
    harsh_multiplier: 1.15,
  })

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
      }

      // C1b: tüm config tek server GET'ten gelir (org + global). org-scope server tarafında.
      const resp = await fetch(`/api/admin/coefficients?org_id=${encodeURIComponent(organizationId)}`, { cache: 'no-store' })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json?.success) {
        throw new Error(json?.error || t('dataLoadFailed', lang))
      }

      if (json.standardsMissing) {
        toast(t('intlStandardsTablesMissing', lang), 'warning')
      }

      const pickLatestBy = <T extends Record<string, unknown>>(rows: T[] | null | undefined, key: string) => {
        const out = new Map<string, T>()
        ;(rows || []).forEach((r) => {
          const k = String((r as Record<string, unknown>)[key] ?? '')
          if (!k) return
          if (!out.has(k)) out.set(k, r)
        })
        return out
      }

      // evaluator weights: org override varsa onu kullan, yoksa default (org=null)
      const orgEvalMap = pickLatestBy((json.evaluatorWeights?.org || []) as unknown as EvaluatorWeightRow[], 'position_level')
      const defEvalMap = pickLatestBy((json.evaluatorWeights?.default || []) as unknown as EvaluatorWeightRow[], 'position_level')
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

      const orgCatRows = (json.categoryWeights?.org || []) as unknown as CategoryWeightRow[]
      const defCatRows = (json.categoryWeights?.default || []) as unknown as CategoryWeightRow[]
      const orgCatMap = new Map<string, CategoryWeightRow>(orgCatRows.map((r) => [r.category_name, r]))
      const defCatMap = new Map<string, CategoryWeightRow>(defCatRows.map((r) => [r.category_name, r]))

      const categoryNames = ((json.categories || []) as unknown as CategoryNameRow[])
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

      setStandards(
        ((json.standards || []) as unknown as InternationalStandardRow[]).map((s) => ({
          id: s.id,
          code: s.code || '',
          title: s.title || '',
          description: s.description || '',
          is_active: Boolean(s.is_active ?? true),
          sort_order: Number(s.sort_order ?? 0),
        }))
      )

      if (json.confidence) {
        setConfidenceMinHigh(Number((json.confidence as any).min_high_confidence_evaluator_count ?? 5))
      } else {
        setConfidenceMinHigh(5)
      }

      if (json.deviation) {
        setDeviation({
          lenient_diff_threshold: Number((json.deviation as any).lenient_diff_threshold ?? 0.75),
          harsh_diff_threshold: Number((json.deviation as any).harsh_diff_threshold ?? 0.75),
          lenient_multiplier: Number((json.deviation as any).lenient_multiplier ?? 0.85),
          harsh_multiplier: Number((json.deviation as any).harsh_multiplier ?? 1.15),
        })
      } else {
        setDeviation({
          lenient_diff_threshold: 0.75,
          harsh_diff_threshold: 0.75,
          lenient_multiplier: 0.85,
          harsh_multiplier: 1.15,
        })
      }
    } catch (e: unknown) {
      toast(errMsg(e) || t('dataLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }

  const saveEvaluatorWeights = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      // KVKK/Güvenlik: org bazında override yazarız (replace server tarafında).
      await postCoefficients({
        type: 'evaluator',
        rows: evaluatorRows.map((r) => ({
          position_level: r.position_level,
          weight: Number(r.weight),
          description: r.description || null,
        })),
      })
      toast(t('savedDoneGeneric', lang), 'success')
      await loadAll()
    } catch (e: unknown) {
      toast(errMsg(e) || t('saveFailed', lang), 'error')
    } finally {
      setSaving(false)
    }
  }

  const applyWordEvaluatorPreset = () => {
    // Word görselindeki çarpanlar (varsayılan eşleşme):
    // executive=1.50, manager=1.30, peer=1.00, subordinate=0.80, self=0.70
    setEvaluatorRows((prev) =>
      prev.map((r) => {
        const w =
          r.position_level === 'executive' ? 1.5 :
          r.position_level === 'manager' ? 1.3 :
          r.position_level === 'peer' ? 1.0 :
          r.position_level === 'subordinate' ? 0.8 :
          r.position_level === 'self' ? 0.7 :
          r.weight
        return { ...r, weight: w }
      })
    )
    toast(t('wordTemplateApplied', lang), 'info')
  }

  const saveConfidenceSettings = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      await postCoefficients({
        type: 'confidence',
        confidence: { min_high_confidence_evaluator_count: Math.max(1, Math.floor(Number(confidenceMinHigh || 5))) },
      })
      toast('Güven katsayısı ayarları kaydedildi', 'success')
      await loadAll()
    } catch (e: unknown) {
      toast(errMsg(e) || t('saveFailed', lang), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveDeviationSettings = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      await postCoefficients({
        type: 'deviation',
        deviation: {
          lenient_diff_threshold: Number(deviation.lenient_diff_threshold || 0.75),
          harsh_diff_threshold: Number(deviation.harsh_diff_threshold || 0.75),
          lenient_multiplier: Number(deviation.lenient_multiplier || 0.85),
          harsh_multiplier: Number(deviation.harsh_multiplier || 1.15),
        },
      })
      toast('Sapma düzeltme ayarları kaydedildi', 'success')
      await loadAll()
    } catch (e: unknown) {
      toast(errMsg(e) || t('saveFailed', lang), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveCategoryWeights = async () => {
    if (!organizationId) return
    setSaving(true)
    try {
      await postCoefficients({
        type: 'category',
        rows: categoryRows.map((r) => ({
          category_name: r.category_name,
          weight: Number(r.weight),
          is_critical: Boolean(r.is_critical),
        })),
      })
      toast('Kategori ağırlıkları kaydedildi', 'success')
      await loadAll()
    } catch (e: unknown) {
      toast(errMsg(e) || t('saveFailed', lang), 'error')
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
      if (standards.some((s) => !s.title.trim())) {
        toast('Standart adı boş olamaz', 'error')
        setSaving(false)
        return
      }

      await postCoefficients({
        type: 'standards',
        rows: standards.map((s) => ({
          id: s.id,
          code: s.code.trim() || null,
          title: s.title.trim(),
          description: s.description.trim() || null,
          is_active: Boolean(s.is_active),
          sort_order: Number(s.sort_order || 0),
        })),
      })
      toast(t('savedDoneGeneric', lang), 'success')
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
      const resp = await fetch('/api/admin/coefficients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, organization_id: organizationId }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json?.success) throw new Error(json?.error || t('deleteError', lang))
      toast('Standart silindi', 'success')
      await loadAll()
    } catch (e: unknown) {
      toast(errMsg(e) || t('deleteError', lang), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <RequireSelection
      enabled={!organizationId}
      title={t('kvkkSecurityTitle', lang)}
      message={t('kvkkSelectOrgToContinue', lang)}
    >
      <div className="space-y-6">
        <ToastContainer />

        <div>
          <h1 className="text-2xl font-bold text-gray-900">🎛️ {t('coefficients', lang)}</h1>
          <p className="text-gray-500 mt-1">{t('coefficientsSubtitle', lang)}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>🌍 {t('intlStandardsSetupTitle', lang)}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="gray">international_standards</Badge>
                  <Button variant="secondary" onClick={addStandard} disabled={saving || !canLoad}>
                    <Plus className="w-4 h-4" />
                    {t('addLabel', lang)}
                  </Button>
                  <Button onClick={saveStandards} disabled={saving || !canLoad}>
                    <Save className="w-4 h-4" />
                    {t('saveLabel', lang)}
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-[var(--muted)]">
                  {t('intlStandardsSetupHint', lang)}
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <tr>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--muted)] w-[90px]">{t('codeLabelShort', lang)}</th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--muted)] w-[320px]">{t('standardLabel', lang)}</th>
                        <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">{t('descriptionLabel', lang)}</th>
                        <th className="text-center py-3 px-4 font-semibold text-[var(--muted)] w-[120px]">{t('sortOrderLabel', lang)}</th>
                        <th className="text-center py-3 px-4 font-semibold text-[var(--muted)] w-[120px]">{t('activeShort', lang)}</th>
                        <th className="text-right py-3 px-4 font-semibold text-[var(--muted)] w-[120px]">{t('actionLabel', lang)}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {standards.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[var(--muted)]">
                            {t('standardEmptyHint', lang)}
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
                                placeholder={t('exampleStandardTitle', lang)}
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
                                placeholder={t('shortDescriptionPlaceholder', lang)}
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
                  <Button
                    variant="secondary"
                    onClick={applyWordEvaluatorPreset}
                    disabled={saving || !canLoad}
                    className="mr-2"
                  >
                    {t('applyWordTemplate', lang)}
                  </Button>
                  <Button onClick={saveEvaluatorWeights} disabled={saving || !canLoad}>
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {t('saveLabel', lang)}
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>✅ Güven Seviyeleri</CardTitle>
                <Badge variant="gray">confidence_settings</Badge>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-gray-600">
                  Formül: <span className="font-mono">Güven = min(1.0, Değerlendirici Sayısı / Minimum Yüksek Güven Eşiği)</span>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-[var(--border)] p-4 bg-[var(--surface)]">
                    <div className="text-sm font-semibold text-[var(--foreground)] mb-2">Minimum Yüksek Güven Eşiği</div>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={confidenceMinHigh}
                      onChange={(e) => setConfidenceMinHigh(Number(e.target.value || 5))}
                      className="w-32 px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)]"
                    />
                    <div className="text-xs text-[var(--muted)] mt-2">Örn: 5 ve üzeri = Yüksek</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] p-4 bg-[var(--surface)]">
                    <div className="text-sm font-semibold text-[var(--foreground)] mb-2">Referans</div>
                    <div className="text-sm text-[var(--muted)]">Yüksek: {confidenceMinHigh}+</div>
                    <div className="text-sm text-[var(--muted)]">Orta: 3–{Math.max(3, confidenceMinHigh - 1)}</div>
                    <div className="text-sm text-[var(--muted)]">Düşük: 1–2</div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveConfidenceSettings} disabled={saving || !canLoad}>
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {t('saveLabel', lang)}
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>📏 Sapma Türü ve Düzeltme Katsayıları</CardTitle>
                <Badge variant="gray">deviation_settings</Badge>
              </CardHeader>
              <CardBody className="space-y-4">
                <p className="text-sm text-gray-600">
                  Basit kural: peer ortalamasına göre çok “yumuşak” veya “sert” kalan değerlendirmeye çarpan uygular.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-[var(--border)] p-4 bg-[var(--surface)] space-y-3">
                    <div className="text-sm font-semibold text-[var(--foreground)]">Yumuşak (Lenient)</div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--muted)] w-28">Eşik</span>
                      <input
                        type="number"
                        step="0.05"
                        value={deviation.lenient_diff_threshold}
                        onChange={(e) => setDeviation((p) => ({ ...p, lenient_diff_threshold: Number(e.target.value || 0) }))}
                        className="w-28 px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-right"
                      />
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--muted)] w-28">Çarpan</span>
                      <input
                        type="number"
                        step="0.05"
                        value={deviation.lenient_multiplier}
                        onChange={(e) => setDeviation((p) => ({ ...p, lenient_multiplier: Number(e.target.value || 0) }))}
                        className="w-28 px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-right"
                      />
                    </div>
                    <div className="text-xs text-[var(--muted)]">eval - peerMean &gt; eşik ⇒ ağırlık × çarpan</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] p-4 bg-[var(--surface)] space-y-3">
                    <div className="text-sm font-semibold text-[var(--foreground)]">Sert (Harsh)</div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--muted)] w-28">Eşik</span>
                      <input
                        type="number"
                        step="0.05"
                        value={deviation.harsh_diff_threshold}
                        onChange={(e) => setDeviation((p) => ({ ...p, harsh_diff_threshold: Number(e.target.value || 0) }))}
                        className="w-28 px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-right"
                      />
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--muted)] w-28">Çarpan</span>
                      <input
                        type="number"
                        step="0.05"
                        value={deviation.harsh_multiplier}
                        onChange={(e) => setDeviation((p) => ({ ...p, harsh_multiplier: Number(e.target.value || 0) }))}
                        className="w-28 px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-right"
                      />
                    </div>
                    <div className="text-xs text-[var(--muted)]">peerMean - eval &gt; eşik ⇒ ağırlık × çarpan</div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveDeviationSettings} disabled={saving || !canLoad}>
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {t('saveLabel', lang)}
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
                    {t('saveLabel', lang)}
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

