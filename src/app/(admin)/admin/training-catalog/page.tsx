'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button, Input, Select, toast } from '@/components/ui'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { BookOpen, Loader2, Plus, Trash2, RefreshCw } from 'lucide-react'

type Row = any

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
    tags: '',
    is_active: 'true',
  })

  const canUseGlobal = user?.role === 'super_admin'

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
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')
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
          tags: form.tags
            ? form.tags
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : null,
          is_active: form.is_active === 'true',
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Ekleme hatası')
      toast(t('saved', lang), 'success')
      setForm({ area: '', title: '', provider: '', url: '', program_weeks: '', training_hours: '', level: '', tags: '', is_active: 'true' })
      await load()
    } catch (e: any) {
      toast(e?.message || t('saveFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [scope, organizationId, form, load, lang])

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
        if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Silme hatası')
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
            {loading ? (
              <div className="p-6 text-center text-[var(--muted)]">
                <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                {t('loading', lang)}
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-[var(--muted)]">{t('noData', lang)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <tr className="text-left text-[var(--foreground)]">
                      <th className="px-4 py-3">{t('areaLabel', lang)}</th>
                      <th className="px-4 py-3">{t('trainingTitle', lang)}</th>
                      <th className="px-4 py-3">{t('provider', lang)}</th>
                      <th className="px-4 py-3">{t('trainingHours', lang)}</th>
                      <th className="px-4 py-3">{t('programWeeks', lang)}</th>
                      <th className="px-4 py-3">{t('status', lang)}</th>
                      <th className="px-4 py-3">{t('actions', lang)}</th>
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                    {items.map((r) => (
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
                        <td className="px-4 py-3">
                          {typeof r.training_hours === 'number' ? r.training_hours : typeof r.hours === 'number' ? r.hours : '-'}
                        </td>
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

