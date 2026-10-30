'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardBody, Button, toast } from '@/components/ui'
import { Loader2, Copy, Trash2, Plus, EyeOff, Eye } from 'lucide-react'
import { Lang, t } from '@/lib/i18n'

type Channel = {
  id: string
  label: string
  group_label: string | null
  expected_count: number | null
  token: string
  is_active: boolean
  responses: number
}

export default function SurveyChannelPanel({
  surveyId,
  lang,
}: {
  surveyId: string
  lang: Lang
}) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(true)
  const [slug, setSlug] = useState('')
  const [channels, setChannels] = useState<Channel[]>([])
  const [unassigned, setUnassigned] = useState(0)

  const [labelsText, setLabelsText] = useState('')
  const [groupLabel, setGroupLabel] = useState('')
  const [expected, setExpected] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/surveys/channels?survey_id=${encodeURIComponent(surveyId)}`)
      const p = await r.json().catch(() => ({}))
      if (p?.success) {
        setChannels(p.channels || [])
        setSlug(p.slug || '')
        setReady(!!p.ready)
        setUnassigned(Number(p.unassigned) || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    void load()
  }, [load])

  const baseUrl = useMemo(
    () => (typeof window === 'undefined' ? '' : window.location.origin),
    []
  )
  const linkOf = useCallback(
    (c: Channel) => `${baseUrl}/survey/${slug}?k=${c.token}`,
    [baseUrl, slug]
  )

  const add = useCallback(async () => {
    // Satır veya virgülle ayrılmış grup adları.
    const labels = labelsText
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
    if (!labels.length) {
      toast(t('channelNeedLabels', lang), 'error')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/admin/surveys/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survey_id: surveyId,
          labels,
          group_label: groupLabel || null,
          expected_count: expected ? Number(expected) : null,
        }),
      })
      const p = await r.json().catch(() => ({}))
      if (!r.ok || !p?.success) throw new Error(p?.error || t('saveFailed', lang))
      toast(
        t('channelAdded', lang)
          .replace('{added}', String(p.added || 0))
          .replace('{skipped}', String(p.skipped || 0)),
        'success'
      )
      setLabelsText('')
      await load()
    } catch (e: any) {
      toast(e?.message || t('saveFailed', lang), 'error')
    } finally {
      setBusy(false)
    }
  }, [labelsText, groupLabel, expected, surveyId, lang, load])

  const toggleActive = useCallback(
    async (c: Channel) => {
      setBusy(true)
      try {
        const r = await fetch('/api/admin/surveys/channels', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
        })
        const p = await r.json().catch(() => ({}))
        if (!r.ok || !p?.success) throw new Error(p?.error || t('saveFailed', lang))
        await load()
      } catch (e: any) {
        toast(e?.message || t('saveFailed', lang), 'error')
      } finally {
        setBusy(false)
      }
    },
    [lang, load]
  )

  const remove = useCallback(
    async (c: Channel) => {
      setBusy(true)
      try {
        const r = await fetch(`/api/admin/surveys/channels?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' })
        const p = await r.json().catch(() => ({}))
        if (!r.ok || !p?.success) throw new Error(p?.error || t('saveFailed', lang))
        await load()
      } catch (e: any) {
        toast(e?.message || t('saveFailed', lang), 'error')
      } finally {
        setBusy(false)
      }
    },
    [lang, load]
  )

  const copy = useCallback(
    async (c: Channel) => {
      try {
        await navigator.clipboard.writeText(linkOf(c))
        toast(t('channelCopied', lang), 'success')
      } catch {
        toast(t('channelCopyFailed', lang), 'error')
      }
    },
    [linkOf, lang]
  )

  const copyAll = useCallback(async () => {
    const text = channels.map((c) => `${c.label}\t${linkOf(c)}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast(t('channelCopied', lang), 'success')
    } catch {
      toast(t('channelCopyFailed', lang), 'error')
    }
  }, [channels, linkOf, lang])

  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--brand)]" />
      </div>
    )
  }

  if (!ready) {
    return (
      <Card>
        <CardBody className="py-8 text-center text-sm text-[var(--muted)]">
          {t('channelNotReady', lang)}
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-3">
          <div className="text-sm font-semibold text-[var(--foreground)]">{t('channelAddTitle', lang)}</div>
          <p className="text-xs text-[var(--muted)]">{t('channelAddHint', lang)}</p>
          <textarea
            value={labelsText}
            onChange={(e) => setLabelsText(e.target.value)}
            rows={3}
            placeholder={t('channelLabelsPlaceholder', lang)}
            className="w-full px-3 py-2 text-sm border rounded-xl bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)]"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              value={groupLabel}
              onChange={(e) => setGroupLabel(e.target.value)}
              placeholder={t('channelGroupPlaceholder', lang)}
              className="px-3 py-2 text-sm border rounded-xl bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)]"
            />
            <input
              value={expected}
              onChange={(e) => setExpected(e.target.value.replace(/\D/g, ''))}
              placeholder={t('channelExpectedPlaceholder', lang)}
              inputMode="numeric"
              className="px-3 py-2 text-sm border rounded-xl bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)]"
            />
          </div>
          <div>
            <Button onClick={add} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t('channelAddBtn', lang)}
            </Button>
          </div>
        </CardBody>
      </Card>

      {channels.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center text-sm text-[var(--muted)]">{t('channelEmpty', lang)}</CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[var(--foreground)]">{t('channelListTitle', lang)}</div>
              <Button variant="secondary" onClick={copyAll} disabled={busy}>
                <Copy className="w-4 h-4" />
                {t('channelCopyAll', lang)}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--surface-2)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t('channelLabel', lang)}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('channelGroup', lang)}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('channelResponses', lang)}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('channelRate', lang)}</th>
                    <th className="px-3 py-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {channels.map((c) => {
                    const pct =
                      c.expected_count && c.expected_count > 0
                        ? Math.round((c.responses / c.expected_count) * 1000) / 10
                        : null
                    return (
                      <tr key={c.id} className={c.is_active ? '' : 'opacity-50'}>
                        <td className="px-3 py-2 font-medium text-[var(--foreground)]">{c.label}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">{c.group_label || '—'}</td>
                        <td className="px-3 py-2 text-[var(--foreground)]">{c.responses}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">
                          {pct == null ? '—' : `%${pct} (${c.responses}/${c.expected_count})`}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => void copy(c)}
                              title={t('channelCopyOne', lang)}
                              className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleActive(c)}
                              title={c.is_active ? t('channelDeactivate', lang) : t('channelActivate', lang)}
                              className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)]"
                            >
                              {c.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => void remove(c)}
                              title={t('delete', lang)}
                              className="p-1.5 text-[var(--muted)] hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {unassigned > 0 && (
              <p className="text-xs text-[var(--muted)]">
                {t('channelUnassigned', lang).replace('{n}', String(unassigned))}
              </p>
            )}
            <p className="text-xs text-[var(--muted)]">{t('channelMinNote', lang)}</p>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
