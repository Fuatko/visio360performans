'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Select, toast } from '@/components/ui'
import { Loader2, Search, Trash2 } from 'lucide-react'
import { normalizeMatchKey } from '@/lib/duty-title-match'

type CategoryOpt = {
  id: string
  name: string
  main_category_name?: string | null
  question_count?: number
  duty_package_names?: string[]
}

type DutyPackageOpt = { id: string; name: string; category_ids: string[] }

type EvaluatorOpt = { id: string; name: string; title?: string | null }
type DutyMode = 'full' | 'categories' | 'none'

type PreviewRow = {
  category_id: string
  category_name: string
  question_count: number
  scope_kind: 'period' | 'duty'
}

function filterCats(query: string, options: CategoryOpt[], limit = 80) {
  const key = normalizeMatchKey(query)
  if (!key) return options.slice(0, limit)
  return options
    .filter((c) => {
      const blob = normalizeMatchKey(
        [c.name, c.main_category_name, ...(c.duty_package_names || [])].filter(Boolean).join(' ')
      )
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
      <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white text-sm divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="p-3 text-gray-500 text-xs">Sonuç yok</div>
        ) : (
          filtered.map((c) => (
            <label key={c.id} className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
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
                  {c.duty_package_names?.length ? `${c.duty_package_names.join(', ')} · ` : ''}
                  {c.main_category_name ? `${c.main_category_name} · ` : ''}
                  {c.question_count ?? 0} soru
                  {c.duty_package_names?.length ? ' (görev)' : ' (genel)'}
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

export type EvaluatorScopeEditorProps = {
  periodId: string
  initialEvaluatorId?: string
  initialTargetId?: string
  lockEvaluator?: boolean
  evaluatorLabel?: string
  targetLabel?: string
  compact?: boolean
  onSaved?: () => void
}

export function EvaluatorScopeEditor({
  periodId,
  initialEvaluatorId = '',
  initialTargetId = '',
  lockEvaluator = false,
  evaluatorLabel = '',
  targetLabel = '',
  compact = false,
  onSaved,
}: EvaluatorScopeEditorProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<CategoryOpt[]>([])
  const [dutyCategories, setDutyCategories] = useState<CategoryOpt[]>([])
  const [dutyPackages, setDutyPackages] = useState<DutyPackageOpt[]>([])
  const [evaluators, setEvaluators] = useState<EvaluatorOpt[]>([])
  const [targets, setTargets] = useState<EvaluatorOpt[]>([])
  const [evaluatorId, setEvaluatorId] = useState(initialEvaluatorId)
  const [evaluatorSearch, setEvaluatorSearch] = useState('')
  const [restrictPeriod, setRestrictPeriod] = useState(false)
  const [dutyMode, setDutyMode] = useState<DutyMode>('full')
  const [periodCats, setPeriodCats] = useState<Set<string>>(new Set())
  const [dutyCats, setDutyCats] = useState<Set<string>>(new Set())
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewTargetId, setPreviewTargetId] = useState(initialTargetId)
  const [previewBreakdown, setPreviewBreakdown] = useState<PreviewRow[]>([])
  const [hasScopeConfig, setHasScopeConfig] = useState(false)
  const [bulkTitle, setBulkTitle] = useState('')

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
      setDutyCategories((payload as any).duty_categories || [])
      setDutyPackages((payload as any).duty_packages || [])
      setEvaluators((payload as any).evaluators || [])
      setTargets((payload as any).targets || [])
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
      setHasScopeConfig(Boolean(cur))
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
      } else {
        setPreviewCount(null)
      }
      setPreviewBreakdown((payload as any).preview_breakdown || [])
    },
    [periodId]
  )

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  useEffect(() => {
    setEvaluatorId(initialEvaluatorId)
    setPreviewTargetId(initialTargetId)
  }, [initialEvaluatorId, initialTargetId])

  useEffect(() => {
    if (evaluatorId) loadEvaluator(evaluatorId, previewTargetId || undefined)
  }, [evaluatorId, previewTargetId, loadEvaluator])

  const filteredEvaluators = useMemo(() => {
    const key = normalizeMatchKey(evaluatorSearch)
    if (!key) return evaluators
    return evaluators.filter((e) => normalizeMatchKey([e.name, e.title].filter(Boolean).join(' ')).includes(key))
  }, [evaluators, evaluatorSearch])

  const titleOptions = useMemo(() => {
    const titles = new Map<string, number>()
    evaluators.forEach((e) => {
      const t = String(e.title || '').trim()
      if (!t) return
      titles.set(t, (titles.get(t) || 0) + 1)
    })
    return Array.from(titles.entries())
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => a.title.localeCompare(b.title, 'tr'))
  }, [evaluators])

  const bulkCountByTitle = useMemo(() => {
    if (!bulkTitle) return 0
    const key = normalizeMatchKey(bulkTitle)
    return evaluators.filter((e) => normalizeMatchKey(String(e.title || '')) === key).length
  }, [evaluators, bulkTitle])

  const scopeRequestBody = () => ({
    period_id: periodId,
    restrict_period: restrictPeriod,
    duty_mode: dutyMode,
    period_category_ids: Array.from(periodCats),
    duty_category_ids: Array.from(dutyCats),
  })

  const bulkApply = async (extra: Record<string, unknown>, confirmMsg: string) => {
    if (restrictPeriod && periodCats.size === 0) {
      toast('Genel kısıt için en az bir alt kategori seçin', 'error')
      return
    }
    if (dutyMode === 'categories' && dutyCats.size === 0) {
      toast('Görev kategorisi modu için en az bir alt kategori seçin', 'error')
      return
    }
    if (!confirm(confirmMsg)) return
    setSaving(true)
    try {
      const resp = await fetch('/api/admin/period-evaluator-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...scopeRequestBody(), ...extra }),
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        toast(String((payload as any)?.error || (payload as any)?.hint || 'Toplu kayıt başarısız'), 'error')
        return
      }
      const n = (payload as any).applied_count ?? 0
      toast(`${n} değerlendirene aynı kapsam uygulandı`, 'success')
      if (evaluatorId) await loadEvaluator(evaluatorId, previewTargetId || undefined)
      onSaved?.()
    } catch (e: any) {
      toast(e?.message || 'Toplu kayıt hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

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

  const toggleDutyPackage = (pkg: DutyPackageOpt) => {
    if (!pkg.category_ids.length) {
      toast(`«${pkg.name}» görev paketinde tanımlı alt kategori yok — Görev Soruları ekranından kontrol edin`, 'error')
      return
    }
    setDutyMode('categories')
    setDutyCats((prev) => {
      const n = new Set(prev)
      const allSelected = pkg.category_ids.every((id) => n.has(id))
      if (allSelected) pkg.category_ids.forEach((id) => n.delete(id))
      else pkg.category_ids.forEach((id) => n.add(id))
      return n
    })
  }

  const formatörTargets = useMemo(() => {
    const key = normalizeMatchKey('formatör')
    return targets.filter((t) => normalizeMatchKey(String(t.title || '')).includes(key))
  }, [targets])

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
          ...scopeRequestBody(),
          evaluator_id: evaluatorId,
        }),
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        toast(String((payload as any)?.error || (payload as any)?.hint || 'Kayıt başarısız'), 'error')
        return
      }
      toast('Soru kapsamı kaydedildi', 'success')
      await loadEvaluator(evaluatorId, previewTargetId || undefined)
      onSaved?.()
    } catch (e: any) {
      toast(e?.message || 'Kayıt hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  const clearScope = async () => {
    if (!evaluatorId || !confirm('Kapsam kaldırılsın mı? (Tüm sorular görünür)')) return
    setSaving(true)
    try {
      const resp = await fetch(
        `/api/admin/period-evaluator-scope?period_id=${encodeURIComponent(periodId)}&evaluator_id=${encodeURIComponent(evaluatorId)}`,
        { method: 'DELETE', credentials: 'include' }
      )
      if (!resp.ok) {
        toast('Silinemedi', 'error')
        return
      }
      toast('Kapsam kaldırıldı', 'success')
      setHasScopeConfig(false)
      setRestrictPeriod(false)
      setDutyMode('full')
      setPeriodCats(new Set())
      setDutyCats(new Set())
      setPreviewCount(null)
      setPreviewBreakdown([])
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-950">
        <strong>Tek sefer ayar:</strong> Seçtiğiniz kategoriler bu değerlendirenin{' '}
        <strong>değerlendirdiği tüm kişilerde</strong> aynıdır — her hedef için ayrı ayrı işaretleme gerekmez.
        Önizleme yalnızca örnek bir hedef içindir.
      </div>

      {lockEvaluator && evaluatorLabel ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm">
          <div className="font-semibold text-gray-900">
            {evaluatorLabel}
            {targetLabel ? (
              <>
                {' '}
                <span className="text-gray-400 font-normal">→</span> {targetLabel}
              </>
            ) : null}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Ayarlar <strong>değerlendiren kişi</strong> için geçerlidir (değerlendirdiği tüm hedeflerde aynı kapsam).
            Bu satır için önizleme hedefe göre hesaplanır.
          </p>
        </div>
      ) : null}

      {!lockEvaluator ? (
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
            <label className="text-sm font-medium text-gray-700">Önizleme hedefi</label>
            <Select
              options={[
                { value: '', label: 'Hedef seçin…' },
                ...targets.map((e) => ({
                  value: e.id,
                  label: e.title ? `${e.name} — ${e.title}` : e.name,
                })),
              ]}
              value={previewTargetId}
              onChange={(e) => setPreviewTargetId(e.target.value)}
            />
            {formatörTargets.length > 0 ? (
              <p className="text-xs text-gray-500">
                Formatör görev sorularını görmek için önizlemede formatör unvanlı bir hedef seçin (
                {formatörTargets.length} kişi).
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {previewTargetId && previewCount != null ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
          Bu hedef için formda <strong>{previewCount} soru</strong>
          {hasScopeConfig ? ' (kapsam uygulanmış)' : ' (kapsam yok — tüm sorular)'}
        </div>
      ) : null}

      {previewBreakdown.length > 0 ? (
        <div className="rounded-lg border border-gray-200 overflow-hidden text-xs">
          <div className="bg-gray-100 px-3 py-2 font-medium text-gray-700">Önizleme — kategori / soru</div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 px-3">Kategori</th>
                <th className="py-2 px-3">Tür</th>
                <th className="py-2 px-3 text-right">Soru</th>
              </tr>
            </thead>
            <tbody>
              {previewBreakdown.map((r) => (
                <tr key={`${r.scope_kind}-${r.category_id}`} className="border-t border-gray-100">
                  <td className="py-1.5 px-3 text-gray-900">{r.category_name}</td>
                  <td className="py-1.5 px-3 text-gray-500">{r.scope_kind === 'duty' ? 'Görev' : 'Genel'}</td>
                  <td className="py-1.5 px-3 text-right font-medium">{r.question_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={restrictPeriod}
          disabled={!evaluatorId}
          onChange={(e) => setRestrictPeriod(e.target.checked)}
        />
        <span>
          <span className="font-medium">Genel soruları kısıtla (alt kategori)</span>
          {!compact ? (
            <span className="block text-xs text-gray-500">Kapalıysa tüm genel sorular gelir.</span>
          ) : null}
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
        <div className="text-sm font-medium text-gray-900">Görev paketi</div>
        <div className="flex flex-col gap-2 text-sm">
          {(
            [
              ['full', 'Tüm görev paketi'],
              ['categories', 'Yalnız seçili kategoriler'],
              ['none', 'Görev soruları yok'],
            ] as const
          ).map(([val, lab]) => (
            <label key={val} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name={`duty_mode_${evaluatorId}`}
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
        <div className="space-y-3">
          {dutyPackages.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-900">Görev paketi (hızlı seçim)</div>
              <p className="text-xs text-gray-500">
                Örn. Formatör — paketteki tüm alt kategorileri tek tıkla ekler veya kaldırır.
              </p>
              <div className="flex flex-wrap gap-2">
                {dutyPackages.map((pkg) => {
                  const selected =
                    pkg.category_ids.length > 0 && pkg.category_ids.every((id) => dutyCats.has(id))
                  const empty = !pkg.category_ids.length
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      disabled={!evaluatorId || empty}
                      onClick={() => toggleDutyPackage(pkg)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        selected
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-800 border-gray-200 hover:border-violet-300'
                      } ${empty ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {pkg.name}
                      {pkg.category_ids.length ? ` (${pkg.category_ids.length})` : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Bu dönemde görev paketi tanımlı değil. Formatör vb. için önce Dönemler → Görev Soruları adımını tamamlayın.
            </p>
          )}
          <CategoryPicker
            label="Görev — alt kategoriler"
            hint="Görev Soruları paketlerindeki alt kategoriler (genel soru havuzundan ayrı)"
            options={dutyCategories}
            selected={dutyCats}
            onToggle={toggleDuty}
            disabled={!evaluatorId}
          />
        </div>
      ) : null}

      <div className="rounded-xl border border-amber-200/90 bg-amber-50/50 p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-900">Toplu uygulama (isteğe bağlı)</div>
        <p className="text-xs text-gray-600">
          Liste <strong>değerlendiren</strong> unvanlarını gösterir (ör. İnsan Kaynakları Koordinatörü). Formatör burada
          çıkmaz; formatör hedefleri için yukarıda Görev paketi → Formatör veya görev alt kategorilerini seçin.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-xs font-medium text-gray-700">Unvana göre (iş alanı)</label>
            <Select
              options={[
                { value: '', label: 'Unvan seçin…' },
                ...titleOptions.map((o) => ({
                  value: o.title,
                  label: `${o.title} (${o.count} kişi)`,
                })),
              ]}
              value={bulkTitle}
              onChange={(e) => setBulkTitle(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving || !bulkTitle || bulkCountByTitle === 0}
            onClick={() =>
              bulkApply(
                { apply_by_title: bulkTitle },
                `«${bulkTitle}» unvanındaki ${bulkCountByTitle} değerlendirene bu kapsam uygulanacak. Devam?`
              )
            }
          >
            Unvana uygula ({bulkCountByTitle || 0})
          </Button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={saving || !evaluators.length}
          onClick={() =>
            bulkApply(
              { apply_to_all_evaluators: true },
              `Matristeki tüm ${evaluators.length} değerlendirene bu kapsam uygulanacak. Devam?`
            )
          }
        >
          Tüm değerlendirenlere uygula ({evaluators.length})
        </Button>
      </div>

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
    </div>
  )
}
