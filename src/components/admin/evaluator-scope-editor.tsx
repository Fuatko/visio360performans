'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Select, toast } from '@/components/ui'
import { Loader2, Search, Trash2 } from 'lucide-react'
import { normalizeMatchKey } from '@/lib/duty-title-match'
import {
  EVALUATOR_SCOPE_PRESETS,
  matchPeriodCategoriesToPreset,
  scopePayloadFromPreset,
  type ScopePresetId,
} from '@/lib/evaluator-scope-presets'
import { matrixEvaluationContextLabel } from '@/lib/matrix-evaluation-context'

type CategoryOpt = {
  id: string
  name: string
  main_category_name?: string | null
  question_count?: number
  duty_package_names?: string[]
}

type DutyPackageOpt = { id: string; name: string; category_ids: string[] }
type DutySetupStatus = {
  duties_in_db: number
  user_duty_links: number
  duty_category_links: number
  packages_shown: number
}

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

function dutyCatsForPackages(pkgSet: Set<string>, pkgList: DutyPackageOpt[]) {
  const cats = new Set<string>()
  pkgList.forEach((p) => {
    if (!pkgSet.has(p.id)) return
    p.category_ids.forEach((id) => cats.add(id))
  })
  return cats
}

type MatrixContextOpt = { value: string; label: string }

export type EvaluatorScopeEditorProps = {
  periodId: string
  initialEvaluatorId?: string
  initialTargetId?: string
  /** Matris satırından açıldığında (örn. bilimsel_etkinlik_koordinatoru) */
  initialMatrixContext?: string
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
  initialMatrixContext = '',
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
  const [selectedDutyPkgs, setSelectedDutyPkgs] = useState<Set<string>>(new Set())
  const [showDutyCatDetail, setShowDutyCatDetail] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewPeriodCount, setPreviewPeriodCount] = useState<number | null>(null)
  const [previewDutyCount, setPreviewDutyCount] = useState<number | null>(null)
  const [previewTargetId, setPreviewTargetId] = useState(initialTargetId)
  const [previewMatrixContext, setPreviewMatrixContext] = useState(initialMatrixContext)
  const [previewAssignmentContexts, setPreviewAssignmentContexts] = useState<MatrixContextOpt[]>([])
  const [previewBreakdown, setPreviewBreakdown] = useState<PreviewRow[]>([])
  const [previewScopeLabel, setPreviewScopeLabel] = useState<string | null>(null)
  const [hasScopeConfig, setHasScopeConfig] = useState(false)
  const [bulkTitle, setBulkTitle] = useState('')
  const [scopePresetId, setScopePresetId] = useState<ScopePresetId | ''>('')
  const [bulkEvaluatorNames, setBulkEvaluatorNames] = useState('')
  const [dutySetup, setDutySetup] = useState<DutySetupStatus | null>(null)
  const [scopeAppliesTo, setScopeAppliesTo] = useState<
    'evaluator_default' | 'target_override' | 'target_using_default'
  >('evaluator_default')
  const [inheritedEvaluatorScope, setInheritedEvaluatorScope] = useState<{
    restrict_period: boolean
    period_category_ids: string[]
    duty_mode: DutyMode
  } | null>(null)
  const [targetDutyNames, setTargetDutyNames] = useState<string[]>([])
  const [targetScopeReady, setTargetScopeReady] = useState(true)
  /** Aynı kişi için loadEvaluator tekrar formu sıfırlamasın (seçim kaybolması) */
  const formHydratedKeyRef = useRef('')

  const scopeTargetId = lockEvaluator && initialTargetId ? initialTargetId : ''
  /** Matris modalında veya seçili değerlendiren — form kilidi buna göre */
  const scopeActorId = lockEvaluator ? initialEvaluatorId || evaluatorId : evaluatorId
  const canEditScope = Boolean(scopeActorId)

  const applyDutyPackages = (pkgs: DutyPackageOpt[], setup?: DutySetupStatus | null) => {
    setDutyPackages(pkgs)
    if (setup) setDutySetup(setup)
  }

  const fetchDutyPackagesFallback = async (pid: string): Promise<DutyPackageOpt[]> => {
    try {
      const resp = await fetch(`/api/admin/period-duty-questions?period_id=${encodeURIComponent(pid)}`, {
        credentials: 'include',
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) return []
      const duties = ((payload as any).duties || []) as any[]
      const catRows = ((payload as any).duty_categories || []) as any[]
      const catsByDuty = new Map<string, string[]>()
      catRows.forEach((r) => {
        const did = String(r.duty_id || '')
        const cid = String(r.category_id || '')
        if (!did || !cid) return
        const cur = catsByDuty.get(did) || []
        cur.push(cid)
        catsByDuty.set(did, cur)
      })
      return duties
        .filter((d) => String(d.name || '').trim() && d.is_active !== false)
        .map((d) => ({
          id: String(d.id),
          name: String(d.name).trim(),
          category_ids: catsByDuty.get(String(d.id)) || [],
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    } catch {
      return []
    }
  }

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
      setDutySetup((payload as any).duty_setup || null)
      let pkgs = ((payload as any).duty_packages || []) as DutyPackageOpt[]
      if (!pkgs.length) pkgs = await fetchDutyPackagesFallback(periodId)
      applyDutyPackages(pkgs, (payload as any).duty_setup || null)
      setEvaluators((payload as any).evaluators || [])
      setTargets((payload as any).targets || [])
    } finally {
      setLoading(false)
    }
  }, [periodId])

  const applyFormFromServer = useCallback(
    (
      cur: {
        restrict_period?: boolean
        duty_mode?: DutyMode
        period_category_ids?: string[]
        duty_category_ids?: string[]
        duty_package_ids?: string[]
      } | null,
      pkgs: DutyPackageOpt[],
      appliesTo: 'evaluator_default' | 'target_override' | 'target_using_default'
    ) => {
      const blankTargetDraft = Boolean(scopeTargetId) && appliesTo === 'target_using_default'
      if (blankTargetDraft) {
        const inherited =
          cur &&
          (Boolean(cur.restrict_period) ||
            (cur.period_category_ids || []).length > 0 ||
            cur.duty_mode === 'none')
            ? {
                restrict_period: Boolean(cur.restrict_period) || (cur.period_category_ids || []).length > 0,
                period_category_ids: (cur.period_category_ids || []).map(String),
                duty_mode: (cur.duty_mode || 'none') as DutyMode,
              }
            : null
        setInheritedEvaluatorScope(inherited)
        setHasScopeConfig(false)
        setRestrictPeriod(false)
        setDutyMode('none')
        setPeriodCats(new Set())
        setDutyCats(new Set())
        setSelectedDutyPkgs(new Set())
        return
      }

      setInheritedEvaluatorScope(null)

      if (!cur) {
        setHasScopeConfig(false)
        setRestrictPeriod(false)
        setDutyMode('none')
        setPeriodCats(new Set())
        setDutyCats(new Set())
        setSelectedDutyPkgs(new Set())
        return
      }

      setHasScopeConfig(true)
      const periodIds = (cur.period_category_ids || []).map(String)
      setRestrictPeriod(Boolean(cur.restrict_period) || periodIds.length > 0)
      const mode = (cur.duty_mode || 'full') as DutyMode
      setDutyMode(mode)
      setPeriodCats(new Set(periodIds))
      const savedPkgs = new Set<string>((cur.duty_package_ids || []).map(String))
      if (savedPkgs.size) {
        setSelectedDutyPkgs(savedPkgs)
        setDutyCats(dutyCatsForPackages(savedPkgs, pkgs))
      } else if (mode === 'full') {
        const allIds = new Set(pkgs.map((p) => p.id))
        setSelectedDutyPkgs(allIds)
        setDutyCats(dutyCatsForPackages(allIds, pkgs))
      } else if (mode === 'none') {
        setSelectedDutyPkgs(new Set())
        setDutyCats(new Set())
      } else {
        const dutyCatIds = new Set((cur.duty_category_ids || []).map(String))
        const inferred = new Set<string>()
        pkgs.forEach((pkg) => {
          if (pkg.category_ids.length && pkg.category_ids.every((id) => dutyCatIds.has(id))) inferred.add(pkg.id)
        })
        setSelectedDutyPkgs(inferred)
        setDutyCats(dutyCatsForPackages(inferred, pkgs))
      }
    },
    [scopeTargetId]
  )

  const loadEvaluator = useCallback(
    async (eid: string, targetForPreview?: string, opts?: { resetForm?: boolean }) => {
      if (!periodId || !eid) return
      const preview = targetForPreview || scopeTargetId
      const mctx = previewMatrixContext || initialMatrixContext || ''
      const hydrateKey = `${periodId}:${eid}:${scopeTargetId}:${preview}:${mctx}`
      const shouldResetForm = opts?.resetForm === true

      const qs = new URLSearchParams({ period_id: periodId, evaluator_id: eid })
      if (scopeTargetId) qs.set('target_id', scopeTargetId)
      if (preview) qs.set('preview_target_id', preview)
      if (mctx) qs.set('matrix_context', mctx)
      const resp = await fetch(`/api/admin/period-evaluator-scope?${qs}`, { credentials: 'include' })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        const msg = String(
          (payload as any)?.error || (payload as any)?.hint || 'Kapsam yüklenemedi — sayfayı yenileyin veya SQL migration kontrol edin'
        )
        toast(msg, 'error')
        return
      }
      if (scopeTargetId && (payload as any).target_scope_tables_ready === false) {
        setTargetScopeReady(false)
      } else {
        setTargetScopeReady(true)
      }
      let pkgs = ((payload as any).duty_packages || []) as DutyPackageOpt[]
      if (!pkgs.length) pkgs = await fetchDutyPackagesFallback(periodId)
      if (pkgs.length) applyDutyPackages(pkgs, (payload as any).duty_setup || null)
      if ((payload as any).duty_setup) setDutySetup((payload as any).duty_setup)

      const appliesTo = ((payload as any).scope_applies_to || 'evaluator_default') as
        | 'evaluator_default'
        | 'target_override'
        | 'target_using_default'
      setScopeAppliesTo(appliesTo)
      setTargetDutyNames((payload as any).target_duty_names || [])

      if (shouldResetForm || formHydratedKeyRef.current !== hydrateKey) {
        formHydratedKeyRef.current = hydrateKey
        applyFormFromServer((payload as any).current || null, pkgs, appliesTo)
      }

      const ctxOpts = ((payload as any).preview_assignment_contexts || []) as MatrixContextOpt[]
      setPreviewAssignmentContexts(ctxOpts)
      const resolvedCtx = String((payload as any).preview_matrix_context || mctx || '')
      if (resolvedCtx && resolvedCtx !== previewMatrixContext) {
        setPreviewMatrixContext(resolvedCtx)
      }

      if (typeof (payload as any).preview_question_count === 'number') {
        setPreviewCount((payload as any).preview_question_count)
        setPreviewPeriodCount(
          typeof (payload as any).preview_period_question_count === 'number'
            ? (payload as any).preview_period_question_count
            : null
        )
        setPreviewDutyCount(
          typeof (payload as any).preview_duty_question_count === 'number'
            ? (payload as any).preview_duty_question_count
            : null
        )
      } else {
        setPreviewCount(null)
        setPreviewPeriodCount(null)
        setPreviewDutyCount(null)
      }
      setPreviewBreakdown((payload as any).preview_breakdown || [])
      setPreviewScopeLabel((payload as any).preview_scope_label || null)
    },
    [periodId, scopeTargetId, previewMatrixContext, initialMatrixContext, applyFormFromServer]
  )

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  useEffect(() => {
    setEvaluatorId(initialEvaluatorId)
    setPreviewTargetId(initialTargetId)
    setPreviewMatrixContext(initialMatrixContext)
    formHydratedKeyRef.current = ''
  }, [initialEvaluatorId, initialTargetId, initialMatrixContext])

  useEffect(() => {
    if (!scopeActorId) return
    void loadEvaluator(scopeActorId, previewTargetId || undefined, { resetForm: true })
    // Yalnızca değerlendiren/hedef değişince formu sunucudan doldur; seçim sırasında tekrar çağırma
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeActorId, previewTargetId, previewMatrixContext, periodId])

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

  const presetMatch = useMemo(() => {
    if (!scopePresetId || !categories.length) return null
    return matchPeriodCategoriesToPreset(categories, scopePresetId)
  }, [scopePresetId, categories])

  const inheritedPeriodCategoryLabels = useMemo(() => {
    if (!inheritedEvaluatorScope?.period_category_ids.length) return []
    const byId = new Map(categories.map((c) => [c.id, c.name || c.id]))
    return inheritedEvaluatorScope.period_category_ids.map((id) => byId.get(id) || id)
  }, [categories, inheritedEvaluatorScope])

  const buildScopePayload = useCallback(() => {
    const selected = selectedDutyPkgs
    const all = dutyPackages
    const manualCats = new Set(dutyCats)
    const duty_package_ids: string[] = []
    const duty_category_ids = new Set<string>()

    let duty_mode: DutyMode = 'full'

    if (selected.size === 0 && manualCats.size === 0) {
      duty_mode = 'none'
    } else if (all.length > 0 && selected.size === all.length && manualCats.size === 0) {
      duty_mode = 'full'
    } else {
      duty_mode = 'categories'
      for (const pkg of all) {
        if (!selected.has(pkg.id)) continue
        if (!pkg.id.startsWith('pkg:')) duty_package_ids.push(pkg.id)
        pkg.category_ids.forEach((id) => duty_category_ids.add(id))
      }
      // Yalnızca seçili paketlere ait veya paketsiz (ince ayar) kategoriler — eski paket artığı kalmasın
      manualCats.forEach((id) => {
        const owners = all.filter((p) => p.category_ids.includes(id))
        if (owners.length === 0) duty_category_ids.add(id)
        else if (owners.some((p) => selected.has(p.id))) duty_category_ids.add(id)
      })
    }

    const effectiveRestrictPeriod = restrictPeriod || periodCats.size > 0

    return {
      period_id: periodId,
      restrict_period: effectiveRestrictPeriod,
      duty_mode,
      period_category_ids: Array.from(periodCats),
      duty_category_ids: Array.from(duty_category_ids),
      duty_package_ids,
      ...(scopeTargetId ? { target_id: scopeTargetId } : {}),
    }
  }, [periodId, restrictPeriod, periodCats, selectedDutyPkgs, dutyPackages, dutyCats, scopeTargetId])

  const syncDutyModeFromSelection = (pkgSet: Set<string>, manualSize: number) => {
    if (pkgSet.size === 0 && manualSize === 0) setDutyMode('none')
    else if (dutyPackages.length > 0 && pkgSet.size === dutyPackages.length && manualSize === 0) setDutyMode('full')
    else setDutyMode('categories')
  }

  const applyPresetToForm = () => {
    if (!scopePresetId) {
      toast('Önce kapsam şablonu seçin', 'warning')
      return
    }
    const p = scopePayloadFromPreset(categories, scopePresetId)
    if (!p.period_category_ids.length && scopePresetId !== 'yan_gorev_sadece_hedef') {
      toast('Bu şablon için dönemde eşleşen alt kategori yok — Dönemler → soru seçimini kontrol edin', 'error')
      return
    }
    setRestrictPeriod(p.restrict_period)
    setDutyMode(p.duty_mode)
    setPeriodCats(new Set(p.period_category_ids))
    setSelectedDutyPkgs(new Set())
    setDutyCats(new Set())
    setHasScopeConfig(true)
    toast(
      `Şablon yüklendi: ${p.matched_labels.length} alt kategori, yan görev: ${p.duty_mode === 'none' ? 'hedefe göre otomatik' : p.duty_mode}`,
      'success'
    )
  }

  const bulkApply = async (extra: Record<string, unknown>, confirmMsg: string, usePresetOnly = false) => {
    if (usePresetOnly && !scopePresetId) {
      toast('Şablon seçin', 'warning')
      return
    }
    if (!usePresetOnly) {
      const body = buildScopePayload()
      if (body.restrict_period && periodCats.size === 0) {
        toast('Genel kısıt için en az bir alt kategori seçin', 'error')
        return
      }
      if (body.duty_mode === 'categories' && !body.duty_package_ids.length && !body.duty_category_ids.length) {
        toast('En az bir yan görev başlığı (Formatör vb.) seçin', 'error')
        return
      }
    }
    const body = usePresetOnly ? { period_id: periodId } : buildScopePayload()
    if (!confirm(confirmMsg)) return
    setSaving(true)
    try {
      const resp = await fetch('/api/admin/period-evaluator-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...body,
          ...extra,
          ...(usePresetOnly && scopePresetId ? { scope_preset_id: scopePresetId } : {}),
        }),
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        toast(String((payload as any)?.error || (payload as any)?.hint || 'Toplu kayıt başarısız'), 'error')
        return
      }
      const n = (payload as any).applied_count
      if (n != null) toast(`${n} değerlendirene aynı kapsam uygulandı`, 'success')
      else toast('Kapsam kaydedildi', 'success')
      if (scopeActorId) {
        formHydratedKeyRef.current = ''
        await loadEvaluator(scopeActorId, previewTargetId || undefined, { resetForm: true })
      }
      onSaved?.()
    } catch (e: any) {
      toast(e?.message || 'Toplu kayıt hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  const togglePeriod = (id: string) => {
    setRestrictPeriod(true)
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
    const nextPkgs = new Set(selectedDutyPkgs)
    const removing = nextPkgs.has(pkg.id)
    if (removing) nextPkgs.delete(pkg.id)
    else nextPkgs.add(pkg.id)

    const nextCats = new Set(dutyCats)
    if (removing) {
      for (const cid of pkg.category_ids) {
        const stillNeeded = dutyPackages.some(
          (p) => p.id !== pkg.id && nextPkgs.has(p.id) && p.category_ids.includes(cid)
        )
        if (!stillNeeded) nextCats.delete(cid)
      }
    }
    setSelectedDutyPkgs(nextPkgs)
    setDutyCats(nextCats)
    syncDutyModeFromSelection(nextPkgs, nextCats.size)
  }

  const selectAllDutyPackages = () => {
    const all = new Set(dutyPackages.map((p) => p.id))
    setSelectedDutyPkgs(all)
    setDutyCats(dutyCatsForPackages(all, dutyPackages))
    setDutyMode('full')
  }

  const clearDutyPackages = () => {
    setSelectedDutyPkgs(new Set())
    setDutyCats(new Set())
    setDutyMode('none')
  }

  const formatörTargets = useMemo(() => {
    const key = normalizeMatchKey('formatör')
    return targets.filter((t) => normalizeMatchKey(String(t.title || '')).includes(key))
  }, [targets])

  const save = async () => {
    if (!scopeActorId) {
      toast('Değerlendiren seçin', 'error')
      return
    }
    const body = buildScopePayload()
    if (body.restrict_period && periodCats.size === 0) {
      toast('Genel kısıt için en az bir alt kategori seçin veya «Genel soruları kısıtla» kutusunu kapatın', 'error')
      return
    }
    if (body.duty_mode === 'categories' && !body.duty_package_ids.length && !body.duty_category_ids.length) {
      toast('En az bir yan görev başlığı (Formatör vb.) seçin veya «Yan görev sorusu yok» kullanın', 'error')
      return
    }
    if (
      scopeTargetId &&
      !body.restrict_period &&
      body.duty_mode === 'none' &&
      !hasScopeConfig
    ) {
      toast('Bu hedef için en az genel kategori veya yan görev seçin', 'error')
      return
    }
    if (
      !scopeTargetId &&
      body.duty_package_ids.length > 0 &&
      !confirm(
        'Seçtiğiniz yan görevler varsayılan olarak TÜM hedeflere işlenir (soru yalnız o görevi olanlarda çıkar). Formatörleri otomatik ayırmak için «Yan görev sorusu yok» kullanın. Devam edilsin mi?'
      )
    ) {
      return
    }
    setSaving(true)
    try {
      const resp = await fetch('/api/admin/period-evaluator-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...body,
          evaluator_id: scopeActorId,
          target_id: scopeTargetId || undefined,
        }),
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        toast(String((payload as any)?.error || (payload as any)?.hint || 'Kayıt başarısız'), 'error')
        return
      }
      toast(
        scopeTargetId ? 'Bu hedef için özel kapsam kaydedildi' : 'Değerlendiren varsayılan kapsamı kaydedildi',
        'success'
      )
      setScopeAppliesTo(scopeTargetId ? 'target_override' : 'evaluator_default')
      formHydratedKeyRef.current = ''
      await loadEvaluator(scopeActorId, previewTargetId || undefined, { resetForm: true })
      onSaved?.()
    } catch (e: any) {
      toast(e?.message || 'Kayıt hatası', 'error')
    } finally {
      setSaving(false)
    }
  }

  const clearScope = async () => {
    if (
      !scopeActorId ||
      !confirm(
        scopeTargetId
          ? 'Bu hedef için özel kapsam kaldırılsın mı? (Değerlendiren varsayılanı uygulanır)'
          : 'Bu değerlendiren için soru kapsamı kaldırılsın mı? (Tüm sorular görünür)'
      )
    )
      return
    setSaving(true)
    try {
      const delQs = new URLSearchParams({ period_id: periodId, evaluator_id: scopeActorId })
      if (scopeTargetId) delQs.set('target_id', scopeTargetId)
      const resp = await fetch(`/api/admin/period-evaluator-scope?${delQs}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!resp.ok) {
        toast('Silinemedi', 'error')
        return
      }
      toast('Kapsam kaldırıldı', 'success')
      setHasScopeConfig(false)
      setRestrictPeriod(false)
      setDutyMode('none')
      setPeriodCats(new Set())
      setDutyCats(new Set())
      setSelectedDutyPkgs(new Set())
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
      {scopeTargetId && !targetScopeReady ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950">
          <strong>Hedef bazlı kapsam tabloları eksik.</strong> Supabase SQL Editor’da{' '}
          <code className="text-xs bg-red-100 px-1 rounded">sql/period-evaluator-target-scope.sql</code> dosyasını
          çalıştırın, sonra sayfayı yenileyin.
        </div>
      ) : null}

      {scopeTargetId ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-1">
          {scopeAppliesTo === 'target_override' ? (
            <>
              <strong>Kayıtlı: bu hedef için özel kapsam</strong> — yalnızca{' '}
              <strong>{targetLabel || 'seçili kişi'}</strong> için geçerli.
              <span className="block text-xs">Diğer değerlendirdikleri kişilerde varsayılan kapsam kullanılır.</span>
            </>
          ) : (
            <>
              <strong>Önizleme: hedefe özel ayar (henüz kayıtlı değil)</strong> —{' '}
              <strong>{targetLabel || 'seçili kişi'}</strong> için istisna düzenleme modu.
              {inheritedEvaluatorScope ? (
                <span className="block text-xs mt-1">
                  <strong>Değerlendiren varsayılan kapsamı kayıtlı</strong>
                  {inheritedPeriodCategoryLabels.length
                    ? ` (${inheritedPeriodCategoryLabels.length} genel kategori: ${inheritedPeriodCategoryLabels.join(' · ')})`
                    : ''}
                  . Bu pencerede Kaydet’e basmadan hedefe özel kayıt oluşmaz; form boş görünür ama forma
                  uygulanan kapsam yukarıdaki yeşil kutudaki soru sayısıdır.
                </span>
              ) : (
                <span className="block text-xs">
                  Yeşil kutuda <strong>21 soru</strong> veya «kapsam tanımsız» görüyorsanız değerlendiren için henüz
                  kapsam kaydedilmemiştir — matrisi teal kutu ile yeniden yükleyin veya toplu kapsam panelinden tanımlayın.
                </span>
              )}
              <span className="block text-xs">
                Kaydet’e basmadan önce seçimleriniz kaybolmamalı; kayıt oluşunca bu başlık «kayıtlı» olur.
              </span>
            </>
          )}
          {targetDutyNames.length > 0 ? (
            <span className="block text-xs">Hedefin görev paketi: {targetDutyNames.join(', ')}</span>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-950 space-y-1">
          <strong>Varsayılan kapsam</strong> — çoğu kişi için (ör. 2 genel alt kategori).
          <span className="block text-xs">
            <strong>Formatör otomatik:</strong> «Yan görev sorusu yok» seçiliyse, yalnızca görev Excel’inde{' '}
            <strong>Formatör atanmış</strong> kişilerde formatör soruları forma eklenir; diğerlerinde gelmez — karışmaz.
          </span>
          <span className="block text-xs">
            İsterseniz matris satırından «Bu hedef için özel» ile Formatör’ü elle de seçebilirsiniz.
          </span>
        </div>
      )}

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
            {scopeTargetId
              ? 'Kayıt yalnızca bu hedefe özeldir.'
              : 'Kayıt bu değerlendirenin tüm hedefleri için varsayılandır.'}
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
            {previewAssignmentContexts.length > 1 ? (
              <div className="space-y-1 pt-1">
                <label className="text-xs font-medium text-gray-600">Matris türü (önizleme)</label>
                <Select
                  options={previewAssignmentContexts.map((o) => ({ value: o.value, label: o.label }))}
                  value={previewMatrixContext}
                  onChange={(e) => setPreviewMatrixContext(e.target.value)}
                />
              </div>
            ) : previewMatrixContext && previewMatrixContext !== 'genel' ? (
              <p className="text-xs text-violet-800 font-medium">
                Matris: {matrixEvaluationContextLabel(previewMatrixContext)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {previewTargetId && previewCount != null ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
          Bu hedef için formda <strong>{previewCount} soru</strong>
          {previewPeriodCount != null && previewDutyCount != null && previewDutyCount > 0 ? (
            <span className="text-emerald-900/90">
              {' '}
              (genel: {previewPeriodCount}, görev: {previewDutyCount})
            </span>
          ) : null}
          {previewMatrixContext && previewMatrixContext !== 'genel' ? (
            <span className="block text-xs text-emerald-900/80 mt-0.5">
              {matrixEvaluationContextLabel(previewMatrixContext)} matrisi — değerlendiren formda bu satırı açmalı.
            </span>
          ) : null}
          {previewScopeLabel ? (
            <span className="block text-xs text-emerald-900/70 mt-0.5">{previewScopeLabel}</span>
          ) : null}
          {previewScopeLabel || (previewMatrixContext && previewMatrixContext !== 'genel' && (previewDutyCount ?? 0) > 0)
            ? null
            : scopeAppliesTo === 'target_override'
              ? ' (hedefe özel kapsam kayıtlı)'
              : scopeAppliesTo === 'target_using_default'
                ? inheritedEvaluatorScope
                  ? ' (değerlendiren varsayılan kapsamı — forma uygulanan)'
                  : ' (kapsam tanımsız — tüm genel sorular)'
                : hasScopeConfig
                  ? ' (kapsam uygulanmış)'
                  : ' (kapsam yok — tüm sorular)'}
          {scopeAppliesTo === 'target_using_default' && !inheritedEvaluatorScope ? (
            <span className="block text-xs text-emerald-900/80 mt-1">
              Matris yüklerken «Sağ sütun: kategori listesi» kutusunu işaretleyip tekrar yükleyin veya bölüm 4’ten toplu
              kapsam tanımlayın.
            </span>
          ) : scopeAppliesTo === 'target_using_default' ? (
            <span className="block text-xs text-emerald-900/80 mt-1">
              Bu hedef için farklı kategori istiyorsanız «Genel soruları kısıtla»yı işaretleyip Kaydet’e basın.
            </span>
          ) : null}
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
          disabled={!canEditScope}
          onChange={(e) => setRestrictPeriod(e.target.checked)}
        />
        <span>
          <span className="font-medium">Genel soruları kısıtla (alt kategori)</span>
          <span className="block text-xs text-gray-500">
            {scopeTargetId
              ? 'Bu hedef için genel alt kategori seçmek için kutuyu işaretleyin (kategori seçince otomatik açılır).'
              : 'Kapalıysa tüm genel sorular gelir.'}
          </span>
        </span>
      </label>

      {restrictPeriod ? (
        <CategoryPicker
          label="Genel — alt kategoriler"
          hint="Örn. Proje, Etkinlik ve Kurumsal Katkı"
          options={categories}
          selected={periodCats}
          onToggle={togglePeriod}
          disabled={!canEditScope}
        />
      ) : null}

      <div className="space-y-3 rounded-xl border border-violet-200/80 bg-violet-50/30 p-4">
        <div className="text-sm font-semibold text-gray-900">Yan görev başlıkları</div>
        <p className="text-xs text-gray-600">
          <strong>Mor</strong> = seçili görev paketi, <strong>beyaz</strong> = seçili değil. Yeni eklenen değerlendirende
          varsayılan <strong>beyaz</strong> (yan görev yok); 1–2 başlık seçecekseniz dokunun, sonra <strong>Kaydet</strong>.
        </p>
        <p className="text-xs text-gray-600">
          Otomatik ayrım için varsayılanda <strong>Yan görev sorusu yok</strong> bırakın; formatör atanmış kişilerde
          sistem görev Excel’ine göre ekler.
        </p>

        {dutyPackages.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2">
              {dutyPackages.map((pkg) => {
                const selected = selectedDutyPkgs.has(pkg.id)
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    disabled={!canEditScope}
                    onClick={() => toggleDutyPackage(pkg)}
                    className={`text-sm px-4 py-2 rounded-xl border font-medium transition-colors ${
                      selected
                        ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                        : 'bg-white text-gray-900 border-gray-200 hover:border-violet-400'
                    }`}
                  >
                    {pkg.name}
                    {pkg.category_ids.length ? (
                      <span className={selected ? 'text-violet-100' : 'text-gray-500'}>
                        {' '}
                        · {pkg.category_ids.length} alt kategori
                      </span>
                    ) : (
                      <span className={selected ? 'text-violet-100' : 'text-gray-400'}> · tüm paket soruları</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                disabled={!canEditScope}
                className="text-violet-700 hover:underline"
                onClick={selectAllDutyPackages}
              >
                Tüm yan görevleri seç
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                disabled={!canEditScope}
                className="text-gray-600 hover:underline"
                onClick={clearDutyPackages}
              >
                Yan görev sorusu yok
              </button>
            </div>
          </>
        ) : (
          <div className="text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-2">
            <p>
              <strong>Görev başlığı bulunamadı</strong> (Formatör, Zümre…). Soru kapsamında yalnızca genel alt
              kategoriler görünür; bu normal değil.
            </p>
            {dutySetup ? (
              <p className="text-amber-900/90">
                Veritabanı: {dutySetup.duties_in_db} görev tanımı, {dutySetup.user_duty_links} kişi–görev ataması,{' '}
                {dutySetup.duty_category_links} görev–kategori bağlantısı.
              </p>
            ) : null}
            <ol className="list-decimal pl-4 space-y-1 text-amber-900/90">
              <li>
                <strong>Dönemler</strong> → ilgili dönem → <strong>Görev Soruları</strong> → Formatör, Zümre satırlarını
                ekleyin → <strong>Kaydet</strong>
              </li>
              <li>Sayfayı yenileyin (Ctrl+F5). Hâlâ boşsa deploy güncel mi kontrol edin.</li>
            </ol>
          </div>
        )}

        {dutyCategories.length > 0 ? (
          <div className="pt-1">
            <button
              type="button"
              className="text-xs text-violet-700 hover:underline"
              onClick={() => setShowDutyCatDetail((v) => !v)}
            >
              {showDutyCatDetail ? '▾ Alt kategori detayını gizle' : '▸ Alt kategori detayı (isteğe bağlı)'}
            </button>
            {showDutyCatDetail ? (
              <div className="mt-2">
                <CategoryPicker
                  label="Görev — alt kategoriler"
                  hint="İnce ayar; çoğu kurumda yukarıdaki görev başlığı yeterlidir"
                  options={dutyCategories}
                  selected={dutyCats}
                  onToggle={(id) => {
                    setDutyCats((prev) => {
                      const n = new Set(prev)
                      if (n.has(id)) n.delete(id)
                      else n.add(id)
                      syncDutyModeFromSelection(selectedDutyPkgs, n.size)
                      return n
                    })
                  }}
                  disabled={!canEditScope}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {selectedDutyPkgs.size > 0 && dutyMode !== 'none' ? (
          <p className="text-xs text-emerald-800">
            Seçili: {dutyPackages.filter((p) => selectedDutyPkgs.has(p.id)).map((p) => p.name).join(', ')}
          </p>
        ) : dutyMode === 'none' ? (
          <p className="text-xs text-gray-500">Yan görev soruları kapalı — yalnızca genel sorular (kısıt varsa).</p>
        ) : null}
      </div>

      {!scopeTargetId ? (
      <div className="rounded-xl border border-indigo-200/90 bg-indigo-50/40 p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-900">Kapsam şablonu (karışıklığı önler)</div>
        <p className="text-xs text-gray-600">
          Her rol için hangi <strong>genel alt kategoriler</strong> + <strong>yan görev</strong> kuralı olduğunu tek
          seçimle uygulayın. Matris = kim kimi; şablon = hangi sorular.
        </p>
        <Select
          options={[
            { value: '', label: 'Şablon seçin…' },
            ...EVALUATOR_SCOPE_PRESETS.map((p) => ({ value: p.id, label: p.label })),
          ]}
          value={scopePresetId}
          onChange={(e) => setScopePresetId(e.target.value as ScopePresetId | '')}
        />
        {scopePresetId ? (
          <p className="text-xs text-indigo-900/90">
            {EVALUATOR_SCOPE_PRESETS.find((p) => p.id === scopePresetId)?.description}
          </p>
        ) : null}
        {presetMatch && presetMatch.labels.length > 0 ? (
          <div className="text-xs rounded-lg border border-indigo-200 bg-white/80 px-3 py-2">
            <span className="font-medium text-gray-800">Eşleşen alt kategoriler ({presetMatch.labels.length}):</span>{' '}
            {presetMatch.labels.join(' · ')}
          </div>
        ) : scopePresetId ? (
          <p className="text-xs text-red-700">Bu şablon için dönemde alt kategori bulunamadı.</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={!scopePresetId} onClick={applyPresetToForm}>
            Şablonu forma yükle
          </Button>
          <Button
            size="sm"
            disabled={saving || !scopePresetId || !scopeActorId}
            onClick={() => {
              if (!scopeActorId) return
              void bulkApply(
                { evaluator_id: scopeActorId },
                `Seçili değerlendirene «${EVALUATOR_SCOPE_PRESETS.find((p) => p.id === scopePresetId)?.label}» uygulanacak. Devam?`,
                true
              )
            }}
          >
            Şablonu seçili değerlendirene kaydet
          </Button>
        </div>
      </div>
      ) : null}

      {!scopeTargetId ? (
      <div className="rounded-xl border border-amber-200/90 bg-amber-50/50 p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-900">Toplu uygulama</div>
          <p className="text-xs text-gray-600">
            Şablon seçiliyse aşağıdaki toplu düğmeler <strong>şablonu</strong> uygular. İsim listesi = matris üst
            satırındaki değerlendirenler (her satır bir ad).
          </p>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Matris sütunundaki değerlendiren adları (her satır bir ad)</label>
          <textarea
            className="w-full min-h-[88px] text-sm border border-gray-200 rounded-xl px-3 py-2 font-mono"
            placeholder={'Örn. Rehberlik Koordinatörü Ad Soyad\nPaul GEORGES'}
            value={bulkEvaluatorNames}
            onChange={(e) => setBulkEvaluatorNames(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={saving || !scopePresetId || !bulkEvaluatorNames.trim()}
          onClick={() =>
            bulkApply(
              { apply_by_evaluator_names: bulkEvaluatorNames.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) },
              'Listelenen değerlendirenlere seçili şablon uygulanacak. Devam?',
              true
            )
          }
        >
          İsim listesine şablonu uygula
        </Button>
        <div className="border-t border-amber-200/80 pt-3" />
          <p className="text-xs text-gray-600">
            Elle seçim yaptıysanız (forma yükle) unvan veya tümü:
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
                scopePresetId
                  ? `«${bulkTitle}» unvanındaki ${bulkCountByTitle} değerlendirene seçili şablon uygulanacak. Devam?`
                  : `«${bulkTitle}» unvanındaki ${bulkCountByTitle} değerlendirene bu kapsam uygulanacak. Devam?`,
                Boolean(scopePresetId)
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
              scopePresetId
                ? `Matristeki tüm ${evaluators.length} değerlendirene seçili şablon uygulanacak. Devam?`
                : `Matristeki tüm ${evaluators.length} değerlendirene bu kapsam uygulanacak. Devam?`,
              Boolean(scopePresetId)
            )
          }
        >
          Tüm değerlendirenlere uygula ({evaluators.length})
        </Button>
      </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={saving || !canEditScope || (Boolean(scopeTargetId) && !targetScopeReady)}
          onClick={save}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Kaydet
        </Button>
        <Button variant="secondary" size="sm" disabled={saving || !canEditScope} onClick={clearScope}>
          <Trash2 className="w-4 h-4" />
          Kapsamı kaldır
        </Button>
      </div>
    </div>
  )
}
