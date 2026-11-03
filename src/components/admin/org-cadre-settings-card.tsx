'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardBody, Button, Input, Badge, toast } from '@/components/ui'
import { t } from '@/lib/i18n'
import { normalizeDepartmentName, parseCadres } from '@/lib/admin-department-ranking'
import { Loader2, Plus, Trash2, Users } from 'lucide-react'

type Lang = 'tr' | 'en' | 'fr'

type DraftCadre = {
  /** Yalnız React anahtarı; kayıtta `key` etiketten türetilir. */
  uid: string
  label: string
  departments: string[]
  catch_all: boolean
}

let uidSeq = 0
const nextUid = () => `c${++uidSeq}`

/** Etiketten kalıcı anahtar: küçük harf, Türkçe karakterler sadeleşir, boşluksuz. */
function slugify(label: string): string {
  return (
    label
      .trim()
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .replace(/ş/g, 's')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'kadro'
  )
}

/**
 * Kurum kadro tanımları (organizations.settings.cadres). Birim listesi kurumun
 * FİİLİ kullanıcı kayıtlarından gelir (elle yazım yok). Kaydetme mevcut kurum
 * güncelleme yolunu kullanır; settings sunucuda birleştirilir.
 */
export function OrgCadreSettingsCard({ orgId, lang }: { orgId: string; lang: Lang }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cadres, setCadres] = useState<DraftCadre[]>([])
  const [orgDepartments, setOrgDepartments] = useState<string[]>([])
  const [peopleByDept, setPeopleByDept] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const resp = await fetch(`/api/admin/matrix-data?org_id=${encodeURIComponent(orgId)}`, { cache: 'no-store' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('tcLoadFailed', lang))
      const users = Array.isArray(payload.users) ? payload.users : []
      const counts: Record<string, number> = {}
      for (const u of users) {
        const d = String(u?.department || '').trim()
        if (d) counts[d] = (counts[d] || 0) + 1
      }
      setPeopleByDept(counts)
      setOrgDepartments(Array.isArray(payload.departments) ? payload.departments.map((d: unknown) => String(d)) : [])
      setCadres(
        parseCadres(payload.org_settings?.cadres).map((c) => ({
          uid: nextUid(),
          label: c.label,
          departments: c.departments,
          catch_all: c.catch_all === true,
        }))
      )
    } catch (e: any) {
      toast(e?.message || t('tcLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [orgId, lang])

  useEffect(() => {
    void load()
  }, [load])

  // Gösterilecek birimler: kurumda kullanılanlar + tanımda kalmış eskiler.
  const allDepartments = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of orgDepartments) seen.set(normalizeDepartmentName(d), d)
    for (const c of cadres) for (const d of c.departments) {
      const k = normalizeDepartmentName(d)
      if (!seen.has(k)) seen.set(k, d)
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [orgDepartments, cadres])

  const ownerOf = useCallback(
    (dept: string): number => {
      const k = normalizeDepartmentName(dept)
      return cadres.findIndex((c) => c.departments.some((d) => normalizeDepartmentName(d) === k))
    },
    [cadres]
  )

  const catchAllCount = cadres.filter((c) => c.catch_all).length
  const firstCatchAll = cadres.findIndex((c) => c.catch_all)

  const update = (i: number, patch: Partial<DraftCadre>) =>
    setCadres((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  const toggleDept = (i: number, dept: string) => {
    const owner = ownerOf(dept)
    if (owner >= 0 && owner !== i) {
      // Bir birim yalnız tek kadroda olabilir.
      toast(t('cadreDeptTaken', lang), 'error')
      return
    }
    const k = normalizeDepartmentName(dept)
    const cur = cadres[i]
    const has = cur.departments.some((d) => normalizeDepartmentName(d) === k)
    update(i, {
      departments: has ? cur.departments.filter((d) => normalizeDepartmentName(d) !== k) : [...cur.departments, dept],
    })
  }

  // Canlı önizleme — raporla aynı kural: ilk eşleşen kadro, yoksa catch_all, yoksa tanımsız.
  const preview = useMemo(() => {
    const perCadre = cadres.map(() => ({ depts: 0, people: 0 }))
    const unassigned: string[] = []
    for (const dept of orgDepartments) {
      let idx = ownerOf(dept)
      if (idx < 0) idx = firstCatchAll
      if (idx >= 0) {
        perCadre[idx].depts += 1
        perCadre[idx].people += peopleByDept[dept] || 0
      } else unassigned.push(dept)
    }
    return { perCadre, unassigned }
  }, [cadres, orgDepartments, peopleByDept, ownerOf, firstCatchAll])

  const save = useCallback(async () => {
    if (cadres.some((c) => !c.label.trim())) {
      toast(t('cadreLabelPlaceholder', lang), 'error')
      return
    }
    // Anahtar etiketten türetilir, kurum içinde tekil; catch_all yalnız ilkinde.
    const used = new Set<string>()
    let catchTaken = false
    const payload = cadres.map((c) => {
      const base = slugify(c.label)
      let key = base
      let n = 2
      while (used.has(key)) key = `${base}_${n++}`
      used.add(key)
      const catchAll = c.catch_all && !catchTaken
      if (catchAll) catchTaken = true
      return {
        key,
        label: c.label.trim(),
        departments: c.departments,
        ...(catchAll ? { catch_all: true } : {}),
      }
    })
    setSaving(true)
    try {
      const resp = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orgId, settings: { cadres: payload } }),
      })
      const api = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !api?.success) throw new Error(api?.error || t('saveError', lang))
      toast(t('saved', lang), 'success')
      await load()
    } catch (e: any) {
      toast(e?.message || t('saveError', lang), 'error')
    } finally {
      setSaving(false)
    }
  }, [cadres, orgId, lang, load])

  return (
    <Card className="mb-6">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
            <Users className="w-5 h-5 text-[var(--brand)]" />
            {t('cadreSectionTitle', lang)}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setCadres((p) => [...p, { uid: nextUid(), label: '', departments: [], catch_all: false }])}
              disabled={loading || saving}
            >
              <Plus className="w-4 h-4" />
              {t('cadreAdd', lang)}
            </Button>
            <Button onClick={() => void save()} disabled={loading || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t('save', lang)}
            </Button>
          </div>
        </div>

        {catchAllCount > 1 ? <p className="text-xs text-amber-600">{t('cadreCatchAllOnlyOne', lang)}</p> : null}

        {loading ? (
          <div className="py-6 text-center text-[var(--muted)]">
            <Loader2 className="w-5 h-5 animate-spin inline-block" />
          </div>
        ) : (
          <div className="space-y-3">
            {cadres.map((c, i) => (
              <div key={c.uid} className="rounded-xl border border-[var(--border)] p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[220px] flex-1">
                    <Input
                      value={c.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                      placeholder={t('cadreLabelPlaceholder', lang)}
                    />
                  </div>
                  <Badge variant="info">
                    {t('cadrePreview', lang)
                      .replace('{d}', String(preview.perCadre[i]?.depts ?? 0))
                      .replace('{n}', String(preview.perCadre[i]?.people ?? 0))}
                  </Badge>
                  <Button
                    variant="ghost"
                    onClick={() => setCadres((p) => p.filter((_, j) => j !== i))}
                    disabled={saving}
                    aria-label={t('delete', lang)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={c.catch_all}
                    // Bir kadroda işaretliyse diğerleri pasif.
                    disabled={saving || (!c.catch_all && catchAllCount > 0)}
                    onChange={(e) => update(i, { catch_all: e.target.checked })}
                  />
                  {t('cadreCatchAll', lang)}
                </label>
                <div>
                  <div className="text-xs text-[var(--muted)] mb-1.5">{t('cadreDepartments', lang)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {allDepartments.map((d) => {
                      const owner = ownerOf(d)
                      const mine = owner === i
                      const taken = owner >= 0 && !mine
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDept(i, d)}
                          disabled={saving}
                          title={taken ? t('cadreDeptTaken', lang) : undefined}
                          className={`rounded-full border px-2.5 py-1 text-xs ${
                            mine
                              ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--foreground)]'
                              : taken
                                ? 'border-[var(--border)] text-[var(--muted)] opacity-50 cursor-not-allowed'
                                : 'border-[var(--border)] text-[var(--foreground)] hover:border-[var(--brand)]/50'
                          }`}
                        >
                          {d}
                          {peopleByDept[d] ? <span className="text-[var(--muted)]"> · {peopleByDept[d]}</span> : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}

            {cadres.length > 0 && preview.unassigned.length > 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-sm font-medium text-[var(--foreground)]">
                  {t('cadreUnassigned', lang)} ·{' '}
                  {t('cadrePreview', lang)
                    .replace('{d}', String(preview.unassigned.length))
                    .replace('{n}', String(preview.unassigned.reduce((s, d) => s + (peopleByDept[d] || 0), 0)))}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">{preview.unassigned.join(' · ')}</div>
              </div>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
