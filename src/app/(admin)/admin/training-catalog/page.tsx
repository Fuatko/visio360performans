'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button, Input, Select, toast } from '@/components/ui'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { BookOpen, Loader2, Plus, Trash2, RefreshCw, Sparkles } from 'lucide-react'

type Row = any

// Sunum biçimi ve kaynak dönem için training_catalog tablosunda ayrı kolon yok;
// ikisi de tags dizisinde saklanıyor. Üretim şemasına dokunmamak için okuma ve
// yazma burada yapılır.
const DELIVERY_VALUES = ['yuz_yuze', 'scorm', 'karma'] as const
type Delivery = (typeof DELIVERY_VALUES)[number]
const PERIOD_TAG = 'donem:'

const asTags = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []

const readDelivery = (row: Row): Delivery | '' => {
  const hit = asTags(row?.tags).find((x) => (DELIVERY_VALUES as readonly string[]).includes(x))
  return (hit as Delivery) || ''
}

const readPeriod = (row: Row): string => {
  const hit = asTags(row?.tags).find((x) => x.startsWith(PERIOD_TAG))
  return hit ? hit.slice(PERIOD_TAG.length) : ''
}

const withDelivery = (tags: unknown, value: Delivery): string[] => [
  ...asTags(tags).filter((x) => !(DELIVERY_VALUES as readonly string[]).includes(x)),
  value,
]

const rowHours = (row: Row): number | null =>
  typeof row?.training_hours === 'number'
    ? row.training_hours
    : typeof row?.hours === 'number'
      ? row.hours
      : null

export default function TrainingCatalogPage() {
  const lang = useLang()
  const { user } = useAuthStore()
  const { organizationId } = useAdminContextStore()

  const [scope, setScope] = useState<'org' | 'global'>('org')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Row[]>([])

  const [form, setForm] = useState({
    area: '',
    title: '',
    provider: '',
    url: '',
    program_weeks: '',
    training_hours: '',
    level: '',
    delivery: 'yuz_yuze',
    tags: '',
    is_active: 'true',
  })

  const canUseGlobal = user?.role === 'super_admin'

  // Ham biçim değerleri ekranda okunaklı karşılıklarıyla gösterilir.
  const formatText = (v: string) =>
    v === 'egitim'
      ? t('tcAiFormatEgitim', lang)
      : v === 'atolye'
        ? t('tcAiFormatAtolye', lang)
        : v === 'kocluk'
          ? t('tcAiFormatKocluk', lang)
          : v === 'mentorluk'
            ? t('tcAiFormatMentorluk', lang)
            : v

  // Seviye değerleri veritabanında ASCII tutuluyor; ekranda okunaklı karşılığı.
  const levelText = (v: string) =>
    v === 'baslangic'
      ? t('tcAiLevelBaslangic', lang)
      : v === 'orta'
        ? t('tcAiLevelOrta', lang)
        : v === 'ileri'
          ? t('tcAiLevelIleri', lang)
          : v

  const [fDelivery, setFDelivery] = useState('')
  const [fPeriod, setFPeriod] = useState('')
  const [fMinHours, setFMinHours] = useState('')

  const filtered = useMemo(() => {
    const raw = fMinHours.trim().replace(',', '.')
    const min = raw ? Number(raw) : null
    return items.filter((r: Row) => {
      if (fDelivery && (readDelivery(r) || 'yuz_yuze') !== fDelivery) return false
      if (fPeriod && readPeriod(r) !== fPeriod) return false
      if (min !== null && Number.isFinite(min)) {
        const h = rowHours(r)
        if (h === null || h < min) return false
      }
      return true
    })
  }, [items, fDelivery, fPeriod, fMinHours])

  const periodOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of items) {
      const p = readPeriod(r)
      if (p) set.add(p)
    }
    return Array.from(set).sort()
  }, [items])

  // Filtrelenmiş liste üzerinden sayı ve toplam saat: e-öğrenme hacmi buradan.
  const deliverySummary = useMemo(() => {
    const acc: Record<Delivery, { n: number; hours: number }> = {
      yuz_yuze: { n: 0, hours: 0 },
      scorm: { n: 0, hours: 0 },
      karma: { n: 0, hours: 0 },
    }
    for (const r of filtered) {
      const d = (readDelivery(r) || 'yuz_yuze') as Delivery
      acc[d].n += 1
      acc[d].hours += rowHours(r) || 0
    }
    return acc
  }, [filtered])

  useEffect(() => {
    if (!canUseGlobal && scope === 'global') setScope('org')
  }, [canUseGlobal, scope])

  const load = useCallback(async () => {
    if (scope === 'org' && !organizationId) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('scope', scope)
      if (q.trim()) params.set('q', q.trim())
      if (scope === 'org') params.set('org_id', organizationId)

      const resp = await fetch(`/api/admin/training-catalog?${params.toString()}`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('tcLoadFailed', lang))
      setItems(payload.items || [])
    } catch (e: any) {
      toast(e?.message || t('trainingCatalogLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [scope, q, organizationId, lang])

  useEffect(() => {
    load()
  }, [load])

  const createItem = useCallback(async () => {
    if (scope === 'org' && !organizationId) return
    const area = form.area.trim()
    const title = form.title.trim()
    if (!area || !title) {
      toast(t('missingFields', lang), 'error')
      return
    }
    setLoading(true)
    try {
      const resp = await fetch('/api/admin/training-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          org_id: organizationId,
          area,
          title,
          provider: form.provider.trim() || null,
          url: form.url.trim() || null,
          program_weeks: form.program_weeks ? Number(form.program_weeks) : null,
          training_hours: form.training_hours ? Number(form.training_hours) : null,
          level: form.level.trim() || null,
          tags: [
            ...(form.tags
              ? form.tags
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : []),
            form.delivery,
          ].filter(Boolean),
          is_active: form.is_active === 'true',
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('tcAddFailed', lang))
      toast(t('saved', lang), 'success')
      setForm({ area: '', title: '', provider: '', url: '', program_weeks: '', training_hours: '', level: '', delivery: 'yuz_yuze', tags: '', is_active: 'true' })
      await load()
    } catch (e: any) {
      toast(e?.message || t('saveFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [scope, organizationId, form, load, lang])

  // Sunum biçimi değişince satırın tamamı POST ile geri yazılır: uç nokta
  // kısmi güncelleme kabul etmiyor, gönderilmeyen alan null'lanır.
  const updateDelivery = useCallback(
    async (row: Row, value: Delivery) => {
      try {
        const resp = await fetch('/api/admin/training-catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: String(row.id),
            scope: row.organization_id ? 'org' : 'global',
            org_id: organizationId,
            area: row.area,
            title: row.title,
            provider: row.provider ?? null,
            url: row.url ?? null,
            language: row.language ?? null,
            level: row.level ?? null,
            program_weeks:
              typeof row.program_weeks === 'number'
                ? row.program_weeks
                : typeof row.duration_weeks === 'number'
                  ? row.duration_weeks
                  : null,
            training_hours: rowHours(row),
            tags: withDelivery(row.tags, value),
            is_active: row.is_active !== false,
          }),
        })
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('saveFailed', lang))
        setItems((prev) =>
          prev.map((x: Row) =>
            String(x.id) === String(row.id) ? { ...x, tags: withDelivery(x.tags, value) } : x
          )
        )
      } catch (e: any) {
        toast(e?.message || t('saveFailed', lang), 'error')
      }
    },
    [organizationId, lang]
  )

  const deleteItem = useCallback(
    async (id: string) => {
      if (!id) return
      setLoading(true)
      try {
        const resp = await fetch('/api/admin/training-catalog', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('tcDeleteFailed', lang))
        toast(t('deleted', lang), 'success')
        await load()
      } catch (e: any) {
        toast(e?.message || t('deleteFailed', lang), 'error')
      } finally {
        setLoading(false)
      }
    },
    [load, lang]
  )

  // --- Yapay zekâ önerisi ---
  type AiItem = {
    kind: 'group' | 'bundle' | 'perception' | 'baseline'
    key: string
    title: string
    area: string
    format: string
    delivery: string
    level: string
    program_weeks: number
    training_hours: number
    tags: string[]
    rationale: string
    context: string
    aiGenerated: boolean
  }

  const [aiPeriods, setAiPeriods] = useState<Array<{ id: string; name: string }>>([])
  const [aiPeriodId, setAiPeriodId] = useState('')
  const [aiThreshold, setAiThreshold] = useState('3.5')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiItems, setAiItems] = useState<AiItem[]>([])
  const [aiSelected, setAiSelected] = useState<Record<string, boolean>>({})
  const [aiNote, setAiNote] = useState('')
  const [aiStatsNote, setAiStatsNote] = useState('')
  const [aiShowAll, setAiShowAll] = useState(false)

  useEffect(() => {
    if (!organizationId) {
      setAiPeriods([])
      return
    }
    let alive = true
    ;(async () => {
      try {
        const resp = await fetch(`/api/admin/periods?org_id=${encodeURIComponent(organizationId)}`)
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!alive || !payload?.success) return
        const list = (payload.periods || []).map((p: any) => ({
          id: String(p.id),
          name: String(p.name || '-'),
        }))
        setAiPeriods(list)
        setAiPeriodId((cur) => cur || list[0]?.id || '')
      } catch {
        // dönem listesi alınamazsa panel boş kalır
      }
    })()
    return () => {
      alive = false
    }
  }, [organizationId])

  // Dönem seçilince o dönemin dağılımından eşik önerisi al (yapay zekâ çağrısı yok).
  useEffect(() => {
    if (!organizationId || !aiPeriodId) {
      setAiStatsNote('')
      return
    }
    let alive = true
    ;(async () => {
      try {
        const resp = await fetch('/api/admin/training-catalog/ai-seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period_id: aiPeriodId, org_id: organizationId, stats_only: true }),
        })
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!alive || !payload?.success) return
        const sug = Number(payload.suggested_threshold)
        if (Number.isFinite(sug)) setAiThreshold(String(sug))
        const st = payload.stats
        if (st && st.pairs) {
          setAiStatsNote(
            t('tcAiStatsNote', lang)
              .replace('{pairs}', String(st.pairs))
              .replace('{avg}', String(st.ortalama))
              .replace('{thr}', String(sug))
          )
        } else {
          setAiStatsNote('')
        }
      } catch {
        setAiStatsNote('')
      }
    })()
    return () => {
      alive = false
    }
  }, [organizationId, aiPeriodId, lang])

  const generateAi = useCallback(async () => {
    if (!organizationId || !aiPeriodId) {
      toast(t('tcAiSelectPeriodToast', lang), 'error')
      return
    }
    setAiLoading(true)
    setAiItems([])
    setAiSelected({})
    setAiNote('')
    try {
      const resp = await fetch('/api/admin/training-catalog/ai-seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: aiPeriodId,
          org_id: organizationId,
          // Türkçe klavyede virgül doğal: "3,0" → 3.0
          threshold: Number(String(aiThreshold).replace(',', '.')) || 3.5,
          lang,
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('tcAiFetchFailed', lang))

      const groups: AiItem[] = (payload.group_items || []).map((g: any) => ({
        kind: 'group' as const,
        key: `g:${g.category}`,
        title: String(g.title || ''),
        area: String(g.area || ''),
        format: String(g.format || ''),
        delivery: String(g.delivery || ''),
        level: String(g.level || ''),
        program_weeks: Number(g.program_weeks || 0),
        training_hours: Number(g.training_hours || 0),
        tags: Array.isArray(g.tags) ? g.tags.map(String) : [],
        rationale: String(g.rationale || ''),
        context: `${g.category} · ${g.people_count ?? '-'} ${t('tcAiCtxPeople', lang)} · ${t('tcAiCtxLowest', lang)} ${g.lowest_score ?? '-'}`,
        aiGenerated: g.ai_generated !== false,
      }))

      const bundles: AiItem[] = (payload.bundle_items || []).map((b: any) => ({
        kind: 'bundle' as const,
        key: `b:${b.person_ref}`,
        title: String(b.title || ''),
        area: String(b.area || ''),
        format: String(b.format || ''),
        delivery: String(b.delivery || ''),
        level: String(b.level || ''),
        program_weeks: Number(b.program_weeks || 0),
        training_hours: Number(b.training_hours || 0),
        tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
        rationale: String(b.rationale || ''),
        context: `${b.person_name || b.person_ref} · ${(b.covers || []).join(' / ')}`,
        aiGenerated: b.ai_generated !== false,
      }))

      const perception: AiItem[] = (payload.perception_items || []).map((p: any) => ({
        kind: 'perception' as const,
        key: `p:${p.person_ref}`,
        title: String(p.title || ''),
        area: String(p.area || ''),
        format: String(p.format || ''),
        delivery: String(p.delivery || ''),
        level: String(p.level || ''),
        program_weeks: Number(p.program_weeks || 0),
        training_hours: Number(p.training_hours || 0),
        tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
        rationale: String(p.rationale || ''),
        context: `${p.person_name || p.person_ref} · ${t('tcAiCtxSelf', lang)} ${p.self_score} / ${t('tcAiCtxTeam', lang)} ${p.peer_score} · ${t('tcAiCtxGap', lang)} ${
          Number(p.delta) > 0 ? '+' : ''
        }${p.delta}`,
        aiGenerated: p.ai_generated !== false,
      }))

      // Yapay zekâ üretimi olanlar üstte: sunucu en ağır açıkları yapay zekâya
      // gönderdiği için bunlar aynı zamanda en öncelikli olanlar.
      const baseline: AiItem[] = (payload.baseline_items || []).map((b: any) => ({
        kind: 'baseline' as const,
        key: `t:${b.category}`,
        title: String(b.title || ''),
        area: String(b.area || ''),
        format: String(b.format || ''),
        delivery: String(b.delivery || ''),
        level: String(b.level || ''),
        program_weeks: Number(b.program_weeks || 0),
        training_hours: Number(b.training_hours || 0),
        tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
        rationale: String(b.rationale || ''),
        context: `${b.category} · ${b.people_count ?? '-'} ${t('tcAiCtxPeople', lang)} · ${t('tcAiCtxAvg', lang)} ${b.average_score ?? '-'}`,
        aiGenerated: b.ai_generated !== false,
      }))

      const kindRank: Record<AiItem['kind'], number> = {
        group: 0,
        baseline: 1,
        perception: 2,
        bundle: 3,
      }
      const all = [...groups, ...baseline, ...perception, ...bundles].sort((a, b) => {
        if (a.aiGenerated !== b.aiGenerated) return a.aiGenerated ? -1 : 1
        return kindRank[a.kind] - kindRank[b.kind]
      })
      setAiItems(all)
      setAiShowAll(false)
      // Varsayılan olarak yalnız yapay zekâ önerileri işaretli; kural tabanlı
      // olanları yönetici isterse tek tek seçer.
      setAiSelected(Object.fromEntries(all.map((i) => [i.key, i.aiGenerated])))
      if (payload.ai_available === false) {
        setAiNote(t('tcAiNoteUnavailable', lang))
      } else if (payload.note) {
        setAiNote(String(payload.note))
      } else if ((payload.ai_missing || []).length) {
        setAiNote(t('tcAiNoteRuleFilled', lang).replace('{n}', String(payload.ai_missing.length)))
      }
    } catch (e: any) {
      toast(e?.message || t('tcAiFetchFailed', lang), 'error')
    } finally {
      setAiLoading(false)
    }
  }, [organizationId, aiPeriodId, aiThreshold, lang])

  const saveSelectedAi = useCallback(async () => {
    const chosen = aiItems.filter((i) => aiSelected[i.key])
    if (!chosen.length) {
      toast(t('tcAiSelectItemsToast', lang), 'error')
      return
    }
    const aiPeriodName = (aiPeriods.find((p) => p.id === aiPeriodId)?.name || '').trim()
    setAiLoading(true)
    let ok = 0
    let fail = 0
    for (const item of chosen) {
      try {
        const resp = await fetch('/api/admin/training-catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope: 'org',
            org_id: organizationId,
            area: item.area,
            title: item.title,
            provider: null,
            url: null,
            program_weeks: item.program_weeks || null,
            training_hours: item.training_hours || null,
            level: item.level || null,
            // Sunum biçimi ve kaynak dönem şemada ayrı kolon olmadığı için
            // etiket olarak saklanıyor.
            tags: [
              ...item.tags,
              item.delivery,
              aiPeriodName ? `${PERIOD_TAG}${aiPeriodName}` : '',
            ].filter(Boolean),
            is_active: true,
          }),
        })
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'hata')
        ok += 1
      } catch {
        fail += 1
      }
    }
    setAiLoading(false)
    toast(
      fail
        ? t('tcAiAddResultMixed', lang).replace('{ok}', String(ok)).replace('{fail}', String(fail))
        : t('tcAiAddResultOk', lang).replace('{n}', String(ok)),
      fail ? 'error' : 'success'
    )
    if (ok) {
      setAiItems([])
      setAiSelected({})
      await load()
    }
  }, [aiItems, aiSelected, organizationId, load, aiPeriods, aiPeriodId, lang])

  const headerHint = useMemo(() => {
    if (scope === 'global') return t('trainingCatalogGlobalHint', lang)
    return t('trainingCatalogOrgHint', lang)
  }, [scope, lang])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-[var(--brand)]" />
          {t('trainingCatalog', lang)}
        </h1>
        <p className="text-[var(--muted)] mt-1">{headerHint}</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[var(--brand)]" />
              {t('tcAiTitle', lang)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-[var(--muted)]">{t('tcAiHint', lang)}</p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Select
              options={aiPeriods.map((p) => ({ value: p.id, label: p.name }))}
              value={aiPeriodId}
              onChange={(e) => setAiPeriodId(e.target.value)}
              placeholder={t('tcAiPeriod', lang)}
            />
            <Input
              value={aiThreshold}
              onChange={(e) => setAiThreshold(e.target.value)}
              placeholder={t('tcAiThreshold', lang)}
            />
            <Button onClick={generateAi} disabled={aiLoading || !aiPeriodId}>
              {aiLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {t('tcAiGenerate', lang)}
            </Button>
          </div>

          {aiStatsNote ? <div className="text-xs text-[var(--muted)]">{aiStatsNote}</div> : null}
          {aiNote ? <div className="text-xs text-[var(--muted)]">{aiNote}</div> : null}

          {aiItems.length ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">
                  {t('tcAiCount', lang).replace('{n}', String(aiItems.length))}
                  <span className="ml-2 font-normal text-[var(--muted)]">
                    {t('tcAiSelectedCount', lang).replace(
                      '{n}',
                      String(aiItems.filter((i) => aiSelected[i.key]).length)
                    )}
                  </span>
                </div>
                <Button onClick={saveSelectedAi} disabled={aiLoading}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('tcAiAddSelected', lang)}
                </Button>
              </div>

              <div className="space-y-2">
                {(aiShowAll ? aiItems : aiItems.slice(0, 20)).map((item) => (
                  <label
                    key={item.key}
                    className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!aiSelected[item.key]}
                      onChange={(e) =>
                        setAiSelected((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{item.title}</span>
                        <Badge>
                          {item.kind === 'group'
                            ? t('tcAiKindGroup', lang)
                            : item.kind === 'baseline'
                              ? t('tcAiKindBaseline', lang)
                              : item.kind === 'perception'
                                ? t('tcAiKindPerception', lang)
                                : t('tcAiKindPersonal', lang)}
                        </Badge>
                        <Badge>{formatText(item.format)}</Badge>
                        {item.delivery ? (
                          <Badge>
                            {item.delivery === 'scorm'
                              ? t('deliveryScorm', lang)
                              : item.delivery === 'karma'
                                ? t('deliveryBoth', lang)
                                : t('deliveryClass', lang)}
                          </Badge>
                        ) : null}
                        {!item.aiGenerated ? <Badge>{t('tcAiRuleBased', lang)}</Badge> : null}
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-1">{item.context}</div>
                      <div className="text-xs text-[var(--muted)] mt-1">
                        {item.area} · {levelText(item.level)} · {item.program_weeks} {t('weeksShort', lang)} ·{' '}
                        {item.training_hours} {t('hoursShort', lang)}
                      </div>
                      <p className="text-sm mt-2 leading-relaxed">{item.rationale}</p>
                    </div>
                  </label>
                ))}
              </div>

              {!aiShowAll && aiItems.length > 20 ? (
                <Button variant="secondary" onClick={() => setAiShowAll(true)}>
                  {t('tcAiShowAll', lang).replace('{n}', String(aiItems.length))}
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>{t('addTraining', lang)}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={load} disabled={loading}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('refresh', lang)}
              </Button>
              <Button onClick={createItem} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {t('save', lang)}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Select
            options={[
              { value: 'org', label: t('scopeOrg', lang) },
              ...(canUseGlobal ? [{ value: 'global', label: t('scopeGlobal', lang) }] : []),
            ]}
            value={scope}
            onChange={(e) => setScope(e.target.value as any)}
            placeholder={t('scope', lang)}
          />
          <Input value={form.area} onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))} placeholder={t('areaLabel', lang)} />
          <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder={t('trainingTitle', lang)} />
          <Input value={form.provider} onChange={(e) => setForm((p) => ({ ...p, provider: e.target.value }))} placeholder={t('provider', lang)} />
          <Input value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} placeholder={t('url', lang)} />
          <Input value={form.training_hours} onChange={(e) => setForm((p) => ({ ...p, training_hours: e.target.value }))} placeholder={t('trainingHours', lang)} />
          <Input value={form.program_weeks} onChange={(e) => setForm((p) => ({ ...p, program_weeks: e.target.value }))} placeholder={t('programWeeks', lang)} />
          <Input value={form.level} onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))} placeholder={t('level', lang)} />
          <Select
            options={[
              { value: 'yuz_yuze', label: t('deliveryClass', lang) },
              { value: 'scorm', label: t('deliveryScorm', lang) },
              { value: 'karma', label: t('deliveryBoth', lang) },
            ]}
            value={form.delivery}
            onChange={(e) => setForm((p) => ({ ...p, delivery: e.target.value }))}
            placeholder={t('deliveryLabel', lang)}
          />
          <Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder={t('tagsComma', lang)} />
          <Select
            options={[
              { value: 'true', label: t('activeText', lang) },
              { value: 'false', label: t('inactiveText', lang) },
            ]}
            value={form.is_active}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.value }))}
            placeholder={t('status', lang)}
          />
        </CardBody>
      </Card>

      {scope === 'org' && !organizationId ? (
        <Card>
          <CardBody className="py-10 text-center text-[var(--muted)]">{t('selectOrganization', lang)}</CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span>{t('trainingList', lang)}</span>
                <Badge variant="gray">{t('total', lang)}: {items.length}</Badge>
              </div>
              <div className="w-64">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search', lang)} />
              </div>
            </CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
              <div className="w-52">
                <Select
                  options={[
                    { value: '', label: t('deliveryAll', lang) },
                    { value: 'scorm', label: t('deliveryScorm', lang) },
                    { value: 'yuz_yuze', label: t('deliveryClass', lang) },
                    { value: 'karma', label: t('deliveryBoth', lang) },
                  ]}
                  value={fDelivery}
                  onChange={(e) => setFDelivery(e.target.value)}
                  placeholder={t('deliveryLabel', lang)}
                />
              </div>
              <div className="w-64">
                <Select
                  options={[
                    { value: '', label: t('sourcePeriodAll', lang) },
                    ...periodOptions.map((p) => ({ value: p, label: p })),
                  ]}
                  value={fPeriod}
                  onChange={(e) => setFPeriod(e.target.value)}
                  placeholder={t('sourcePeriod', lang)}
                />
              </div>
              <div className="w-36">
                <Input
                  value={fMinHours}
                  onChange={(e) => setFMinHours(e.target.value)}
                  placeholder={t('minHours', lang)}
                />
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <Badge variant="gray">
                  {t('deliveryScorm', lang)}: {deliverySummary.scorm.n} · {deliverySummary.scorm.hours}{' '}
                  {t('hoursShort', lang)}
                </Badge>
                <Badge variant="gray">
                  {t('deliveryBoth', lang)}: {deliverySummary.karma.n} · {deliverySummary.karma.hours}{' '}
                  {t('hoursShort', lang)}
                </Badge>
                <Badge variant="gray">
                  {t('deliveryClass', lang)}: {deliverySummary.yuz_yuze.n} · {deliverySummary.yuz_yuze.hours}{' '}
                  {t('hoursShort', lang)}
                </Badge>
              </div>
            </div>
            {loading ? (
              <div className="p-6 text-center text-[var(--muted)]">
                <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                {t('loading', lang)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-[var(--muted)]">{t('noData', lang)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <tr className="text-left text-[var(--foreground)]">
                      <th className="px-4 py-3">{t('areaLabel', lang)}</th>
                      <th className="px-4 py-3">{t('trainingTitle', lang)}</th>
                      <th className="px-4 py-3">{t('provider', lang)}</th>
                      <th className="px-4 py-3">{t('deliveryLabel', lang)}</th>
                      <th className="px-4 py-3">{t('sourcePeriod', lang)}</th>
                      <th className="px-4 py-3">{t('trainingHours', lang)}</th>
                      <th className="px-4 py-3">{t('programWeeks', lang)}</th>
                      <th className="px-4 py-3">{t('status', lang)}</th>
                      <th className="px-4 py-3">{t('actions', lang)}</th>
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                    {filtered.map((r: Row) => (
                      <tr key={r.id} className="hover:bg-[var(--surface-2)]">
                        <td className="px-4 py-3">{r.area || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--foreground)]">{r.title || '-'}</div>
                          {r.url ? (
                            <a className="text-xs text-[var(--brand)] underline" href={String(r.url)} target="_blank" rel="noreferrer">
                              {t('openTrainingLink', lang)}
                            </a>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{r.provider || '-'}</td>
                        <td className="px-4 py-3 min-w-[160px]">
                          {r.organization_id || canUseGlobal ? (
                            <Select
                              options={[
                                { value: 'yuz_yuze', label: t('deliveryClass', lang) },
                                { value: 'scorm', label: t('deliveryScorm', lang) },
                                { value: 'karma', label: t('deliveryBoth', lang) },
                              ]}
                              value={readDelivery(r) || 'yuz_yuze'}
                              onChange={(e) => updateDelivery(r, e.target.value as Delivery)}
                            />
                          ) : (
                            <span className="text-xs text-[var(--muted)]">
                              {readDelivery(r) === 'scorm'
                                ? t('deliveryScorm', lang)
                                : readDelivery(r) === 'karma'
                                  ? t('deliveryBoth', lang)
                                  : t('deliveryClass', lang)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--muted)]">{readPeriod(r) || '-'}</td>
                        <td className="px-4 py-3">{rowHours(r) ?? '-'}</td>
                        <td className="px-4 py-3">
                          {typeof r.program_weeks === 'number' ? r.program_weeks : typeof r.duration_weeks === 'number' ? r.duration_weeks : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={r.is_active ? 'success' : 'gray'}>{r.is_active ? t('activeText', lang) : t('inactiveText', lang)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="secondary" disabled={loading} onClick={() => deleteItem(String(r.id))}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('delete', lang)}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

