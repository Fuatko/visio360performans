'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button, Input, Select, toast } from '@/components/ui'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { useAdminContextStore } from '@/store/admin-context'
import { ClipboardCheck, Loader2, Plus, Trash2, RefreshCw, ExternalLink, BarChart3 } from 'lucide-react'

type SurveyRow = {
  id: string
  slug: string
  title: string
  status: 'draft' | 'active' | 'closed'
  access_type: 'internal' | 'public' | 'both'
  is_anonymous: boolean
  response_count: number
  created_at: string
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'gray'> = {
  active: 'success',
  draft: 'warning',
  closed: 'gray',
}

export default function SurveysPage() {
  const lang = useLang()
  const { organizationId } = useAdminContextStore()

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<SurveyRow[]>([])
  const [form, setForm] = useState({
    title: '',
    status: 'draft',
    access_type: 'both',
    is_anonymous: 'false',
  })

  const load = useCallback(async () => {
    if (!organizationId) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const resp = await fetch(`/api/admin/surveys?org_id=${encodeURIComponent(organizationId)}`)
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('surveyLoadFailed', lang))
      setItems(payload.items || [])
    } catch (e: any) {
      toast(e?.message || t('surveyLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [organizationId, lang])

  useEffect(() => {
    load()
  }, [load])

  const createSurvey = useCallback(async () => {
    if (!organizationId) {
      toast(t('selectOrganizationFirst', lang), 'error')
      return
    }
    const title = form.title.trim()
    if (!title) {
      toast(t('missingFields', lang), 'error')
      return
    }
    setLoading(true)
    try {
      const resp = await fetch('/api/admin/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: organizationId,
          title,
          status: form.status,
          access_type: form.access_type,
          is_anonymous: form.is_anonymous === 'true',
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('saveFailed', lang))
      toast(t('saved', lang), 'success')
      setForm({ title: '', status: 'draft', access_type: 'both', is_anonymous: 'false' })
      await load()
    } catch (e: any) {
      toast(e?.message || t('saveFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [organizationId, form, load, lang])

  const deleteSurvey = useCallback(
    async (id: string, title: string) => {
      if (!id) return
      if (!window.confirm(t('surveyDeleteConfirm', lang).replace('{title}', title))) return
      setLoading(true)
      try {
        const resp = await fetch(`/api/admin/surveys?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('deleteFailed', lang))
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

  const accessLabel = (a: string) =>
    a === 'internal' ? t('surveyAccessInternal', lang) : a === 'public' ? t('surveyAccessPublic', lang) : t('surveyAccessBoth', lang)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[var(--brand-soft)] flex items-center justify-center">
          <ClipboardCheck className="w-6 h-6 text-[var(--brand)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">{t('surveyManagement', lang)}</h1>
          <p className="text-sm text-[var(--muted)]">{t('surveyManagementSubtitle', lang)}</p>
        </div>
      </div>

      {!organizationId && (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--muted)]">{t('selectOrganizationFirst', lang)}</p>
          </CardBody>
        </Card>
      )}

      {/* Yeni anket oluştur */}
      <Card>
        <CardHeader>
          <CardTitle>{t('surveyCreateNew', lang)}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs text-[var(--muted)] mb-1">{t('surveyTitle', lang)}</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('surveyTitlePlaceholder', lang)}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">{t('surveyStatus', lang)}</label>
              <Select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                options={[
                  { value: 'draft', label: t('surveyStatusDraft', lang) },
                  { value: 'active', label: t('surveyStatusActive', lang) },
                  { value: 'closed', label: t('surveyStatusClosed', lang) },
                ]}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">{t('surveyAccess', lang)}</label>
              <Select
                value={form.access_type}
                onChange={(e) => setForm((f) => ({ ...f, access_type: e.target.value }))}
                options={[
                  { value: 'both', label: t('surveyAccessBoth', lang) },
                  { value: 'internal', label: t('surveyAccessInternal', lang) },
                  { value: 'public', label: t('surveyAccessPublic', lang) },
                ]}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">{t('surveyAnonymous', lang)}</label>
              <Select
                value={form.is_anonymous}
                onChange={(e) => setForm((f) => ({ ...f, is_anonymous: e.target.value }))}
                options={[
                  { value: 'false', label: t('no', lang) },
                  { value: 'true', label: t('yes', lang) },
                ]}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={createSurvey} disabled={loading || !organizationId}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t('surveyCreate', lang)}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Liste */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{t('surveyList', lang)}</CardTitle>
          <Button variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('refresh', lang)}
          </Button>
        </CardHeader>
        <CardBody>
          {items.length === 0 ? (
            <p className="text-sm text-[var(--muted)] py-6 text-center">{t('surveyEmpty', lang)}</p>
          ) : (
            <div className="space-y-2">
              {items.map((sv) => (
                <div
                  key={sv.id}
                  className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[var(--foreground)] truncate">{sv.title}</span>
                      <Badge variant={STATUS_TONE[sv.status] || 'gray'}>{t(`surveyStatus${cap(sv.status)}` as any, lang)}</Badge>
                      <Badge variant="gray">{accessLabel(sv.access_type)}</Badge>
                      {sv.is_anonymous && <Badge variant="gray">{t('surveyAnonymousBadge', lang)}</Badge>}
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {t('surveyResponsesCount', lang).replace('{n}', String(sv.response_count))} · /survey/{sv.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/survey/${sv.slug}`} target="_blank">
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="w-4 h-4" />
                        {t('surveyOpenLink', lang)}
                      </Button>
                    </Link>
                    <Link href={`/admin/surveys/${sv.id}`}>
                      <Button variant="secondary" size="sm">
                        <BarChart3 className="w-4 h-4" />
                        {t('surveyManage', lang)}
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => deleteSurvey(sv.id, sv.title)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
