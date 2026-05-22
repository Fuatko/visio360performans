'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardBody, Button, Select, toast } from '@/components/ui'
import { Loader2, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import { normalizeMatchKey } from '@/lib/duty-title-match'

type CategoryOpt = {
  id: string
  name: string
  main_category_name?: string | null
  question_count?: number
}

type EvaluatorOpt = { id: string; name: string; title?: string | null }

type DutyMode = 'full' | 'categories' | 'none'

function filterCats(query: string, options: CategoryOpt[], limit = 80) {
  const key = normalizeMatchKey(query)
  if (!key) return options.slice(0, limit)
  return options
    .filter((c) => {
      const blob = normalizeMatchKey([c.name, c.main_category_name].filter(Boolean).join(' '))
      return blob.includes(key)
    })
    .slice(0, limit)
}

function CategoryPicker({
  label,
  hint,
  options,
  selected,
  onToggle,
  disabled,
}: {
  label: string
  hint: string
  options: CategoryOpt[]
  selected: Set<string>
  onToggle: (id: string) => void
  disabled?: boolean
}) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => filterCats(q, options), [q, options])
  const selectedList = options.filter((c) => selected.has(c.id))

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-900">{label}</div>
      <p className="text-xs text-gray-500">{hint}</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="search"
          disabled={disabled}
          placeholder="Alt kategori ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20"
        />
      </div>
      {selectedList.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedList.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(c.id)}
              className="text-xs px-2 py-1 rounded-lg bg-violet-100 text-violet-900 hover:bg-violet-200"
            >
              {c.name} ×
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white text-sm divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="p-3 text-gray-500 text-xs">Sonuç yok — aramayı değiştirin</div>
        ) : (
          filtered.map((c) => (
            <label
              key={c.id}
              className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                disabled={disabled}
                checked={selected.has(c.id)}
                onChange={() => onToggle(c.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-gray-900 block truncate">{c.name}</span>
                <span className="text-xs text-gray-500">
                  {c.main_category_name ? `${c.main_category_name} · ` : ''}
                  {c.question_count ?? 0} soru
                </span>
              </span>
            </label>
          ))
        )}
      </div>
      <div className="text-xs text-gray-500">{selected.size} kategori seçili</div>
    </div>
  )
}

export function EvaluatorScopePanel({ periodId }: { periodId: string }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<CategoryOpt[]>([])
  const [evaluators, setEvaluators] = useState<EvaluatorOpt[]>([])
  const [targets, setTargets] = useState<EvaluatorOpt[]>([])
  const [evaluatorId, setEvaluatorId] = useState('')
  const [evaluatorSearch, setEvaluatorSearch] = useState('')
  const [restrictPeriod, setRestrictPeriod] = useState(false)
  const [dutyMode, setDutyMode] = useState<DutyMode>('full')
  const [periodCats, setPeriodCats] = useState<Set<string>>(new Set())
  const [dutyCats, setDutyCats] = useState<Set<string>>(new Set())
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewTargetId, setPreviewTargetId] = useState('')

  const loadMeta = useCallback(async () => {
    if (!periodId) return
    setLoading(true)
    try {
      const resp = await fetch(`/api/admin/period-evaluator-scope?period_id=${encodeURIComponent(periodId)}`, {
        credentials: 'include',
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        toast(String((payload as any)?.error || (payload as any)?.hint || 'Kapsam verisi alınamadı'), 'error')
        return
      }
      setCategories((payload as any).categories || [])
      setEvaluators((payload as any).evaluators || [])
      setTargets((payload as any).targets || [])
    } catch (e: any) {
      toast(e?.message || 'Yükleme hatası', 'error')
    } finally {
      setLoading(false)
    }
  }, [periodId])

  const loadEvaluator = useCallback(
    async (eid: string, targetForPreview?: string) => {
      if (!periodId || !eid) return
      const qs = new URLSearchParams({ period_id: periodId, evaluator_id: eid })
      if (targetForPreview) qs.set('preview_target_id', targetForPreview)
      const resp = await fetch(`/api/admin/period-evaluator-scope?${qs}`, { credentials: 'include' })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) return
      const cur = (payload as any).current
      if (cur) {
        setRestrictPeriod(Boolean(cur.restrict_period))
        setDutyMode((cur.duty_mode || 'full') as DutyMode)
        setPeriodCats(new Set((cur.period_category_ids || []).map(String)))
        setDutyCats(new Set((cur.duty_category_ids || []).map(String)))
      } else {
        setRestrictPeriod(false)
        setDutyMode('full')
        setPeriodCats(new Set())
        setDutyCats(new Set())
      }
      if (typeof (payload as any).preview_question_count === 'number') {
        setPreviewCount((payload as any).preview_question_count)
      }
    },
    [periodId]
  )

  useEffect(() => {
    setEvaluatorId('')
    setPreviewCount(null)
    loadMeta()
  }, [loadMeta])

  useEffect(() => {
    if (evaluatorId) loadEvaluator(evaluatorId, previewTargetId || undefined)
  }, [evaluatorId, previewTargetId, loadEvaluator])

  const filteredEvaluators = useMemo(() => {
    const key = normalizeMatchKey(evaluatorSearch)
    if (!key) return evaluators
    return evaluators.filter((e) => normalizeMatchKey([e.name, e.title].filter(Boolean).join(' ')).includes(key))
  }, [evaluators, evaluatorSearch])

  const togglePeriod = (id: string) => {
    setPeriodCats((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const toggleDuty = (id: string) => {
    setDutyCats((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const save = async () => {
    if (!evaluatorId) {
      toast('Değerlendiren seçin', 'error')
      return
    }
    if (restrictPeriod && periodCats.size === 0) {
      toast('Genel kısıt için en az bir alt kategori seçin', 'error')
      return
    }
    if (dutyMode === 'categories' && dutyCats.size === 0) {
      toast('Görev kategorisi modu için en az bir alt kategori seçin', 'error')
      return
    }
    setSaving(true)
    try {
      const resp = await fetch('/api/admin/period-evaluator-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          period_id: periodId,
          evaluator_id: evaluatorId,
          restrict_period: restrictPeriod,
          duty_mode: dutyMode,
          period_category_ids: Array.from(periodCats),
          duty_category_ids: Array.from(dutyCats),
        }),
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        toast(String((payload as any)?.error || (payload as any)?.hint || 'Kayıt başarısız'), 'error')
        return
      }
      toast('Değerlendiren soru kapsamı kaydedildi', 'success')
      await loadEvaluator(evaluatorId, previewTargetId || undefined)
    } catch (e: any) {
      toast(e?.message || 'Kayıt hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  const clearScope = async () => {
    if (!evaluatorId || !confirm('Bu kişi için kapsam kaldırılsın mı? (Tüm sorular görünür)')) return
    setSaving(true)
    try {
      const resp = await fetch(
        `/api/admin/period-evaluator-scope?period_id=${encodeURIComponent(periodId)}&evaluator_id=${encodeURIComponent(evaluatorId)}`,
        { method: 'DELETE', credentials: 'include' }
      )
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        toast(String((payload as any)?.error || 'Silinemedi'), 'error')
        return
      }
      toast('Kapsam kaldırıldı', 'success')
      setRestrictPeriod(false)
      setDutyMode('full')
      setPeriodCats(new Set())
      setDutyCats(new Set())
      setPreviewCount(null)
    } finally {
      setSaving(false)
    }
  }

  const targetOptions = useMemo(() => {
    return targets.map((e) => ({ value: e.id, label: e.name }))
  }, [targets])

  return (
    <Card className="mb-6 border-violet-200/80 bg-violet-50/25">
      <CardBody className="space-y-4">
        <div>
          <div className="font-semibold text-sm text-gray-900 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-violet-700" />
            Değerlendiren soru kapsamı
          </div>
          <p className="text-xs text-gray-600 mt-1 max-w-3xl">
            Matris kim kimi değerlendirir; burada <strong>hangi alt kategorilerdeki soruları</strong> cevaplayacağını
            tanımlarsınız. Kayıt yoksa tüm sorular gelir. Süper admin ve kurum admin düzenleyebilir.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Değerlendiren</label>
                <input
                  type="search"
                  placeholder="İsim veya unvan ara…"
                  value={evaluatorSearch}
                  onChange={(e) => setEvaluatorSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl"
                />
                <Select
                  options={[
                    { value: '', label: 'Seçin…' },
                    ...filteredEvaluators.slice(0, 200).map((e) => ({
                      value: e.id,
                      label: e.title ? `${e.name} — ${e.title}` : e.name,
                    })),
                  ]}
                  value={evaluatorId}
                  onChange={(e) => setEvaluatorId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Önizleme hedefi (opsiyonel)</label>
                <Select
                  options={[{ value: '', label: 'Hedef seçin…' }, ...targetOptions]}
                  value={previewTargetId}
                  onChange={(e) => setPreviewTargetId(e.target.value)}
                />
                {previewCount != null && evaluatorId ? (
                  <p className="text-xs text-violet-800">
                    Seçili hedef için yaklaşık <strong>{previewCount}</strong> soru görünür.
                  </p>
                ) : null}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={restrictPeriod}
                disabled={!evaluatorId}
                onChange={(e) => setRestrictPeriod(e.target.checked)}
              />
              <span>
                <span className="font-medium">Genel değerlendirme sorularını kısıtla</span>
                <span className="block text-xs text-gray-500">İşaretli değilse tüm genel (dönem) sorular gelir.</span>
              </span>
            </label>

            {restrictPeriod ? (
              <CategoryPicker
                label="Genel — alt kategoriler"
                hint="Örn. Proje, Etkinlik ve Kurumsal Katkı"
                options={categories}
                selected={periodCats}
                onToggle={togglePeriod}
                disabled={!evaluatorId}
              />
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-900">Görev paketi soruları</div>
              <div className="flex flex-wrap gap-3 text-sm">
                {(
                  [
                    ['full', 'Tüm görev paketi (hedefin görevleri)'],
                    ['categories', 'Yalnız seçili alt kategoriler'],
                    ['none', 'Görev soruları yok'],
                  ] as const
                ).map(([val, lab]) => (
                  <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="duty_mode"
                      disabled={!evaluatorId}
                      checked={dutyMode === val}
                      onChange={() => setDutyMode(val)}
                    />
                    {lab}
                  </label>
                ))}
              </div>
            </div>

            {dutyMode === 'categories' ? (
              <CategoryPicker
                label="Görev — alt kategoriler"
                hint="Hedefin görev sorularından yalnızca bu kategoriler"
                options={categories}
                selected={dutyCats}
                onToggle={toggleDuty}
                disabled={!evaluatorId}
              />
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={saving || !evaluatorId} onClick={save}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Kaydet
              </Button>
              <Button variant="secondary" size="sm" disabled={saving || !evaluatorId} onClick={clearScope}>
                <Trash2 className="w-4 h-4" />
                Kapsamı kaldır
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}
