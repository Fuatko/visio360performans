'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Loader2, Trash2, Upload } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, Select, toast } from '@/components/ui'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { parseSurveyBankWorkbook, type BankSheetParse } from '@/lib/survey-bank-import'

type BankRow = {
  id: string
  organization_id: string | null
  main_theme: string
  sub_theme: string | null
  question_code: string | null
  audience: string
  question_type?: string
  text_tr: string
  respondent_note: string | null
  options: Array<{ label: string; score: number | null }>
}

export default function SurveyBankPage() {
  const lang = useLang()
  const { user } = useAuthStore()
  const { organizationId } = useAdminContextStore()
  const orgToUse = user?.role === 'org_admin' ? String(user.organization_id || '') : organizationId

  const [items, setItems] = useState<BankRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sheets, setSheets] = useState<BankSheetParse[]>([])
  const [meta, setMeta] = useState<Record<string, { mainTheme: string; audience: string }>>({})
  const [q, setQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const audienceLabel = useCallback(
    (a: string) =>
      a === 'ogrenci'
        ? t('surveyBankAudStudent', lang)
        : a === 'veli'
          ? t('surveyBankAudParent', lang)
          : a === 'personel'
            ? t('surveyBankAudStaff', lang)
            : t('surveyBankAudGeneral', lang),
    [lang]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (orgToUse) params.set('org_id', orgToUse)
      const resp = await fetch(`/api/admin/survey-bank?${params.toString()}`, { cache: 'no-store' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('tcLoadFailed', lang))
      setItems(payload.items || [])
    } catch (e: any) {
      toast(e?.message || t('tcLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [orgToUse, lang])

  useEffect(() => {
    void load()
  }, [load])

  const onFile = useCallback(async (f: File) => {
    try {
      const parsed = parseSurveyBankWorkbook(await f.arrayBuffer())
      setSheets(parsed)
      const m: Record<string, { mainTheme: string; audience: string }> = {}
      for (const s of parsed) m[s.sheet] = { mainTheme: s.mainThemeGuess, audience: s.audienceGuess }
      setMeta(m)
      for (const s of parsed) for (const err of s.errors) toast(err, 'error')
    } catch (e: any) {
      toast(e?.message || 'Dosya okunamadı', 'error')
    }
  }, [])

  const saveSheet = useCallback(
    async (sheet: BankSheetParse) => {
      const m = meta[sheet.sheet]
      if (!m?.mainTheme?.trim()) {
        toast(t('surveyBankMainTheme', lang), 'error')
        return
      }
      setSaving(true)
      try {
        const resp = await fetch('/api/admin/survey-bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: orgToUse || '',
            main_theme: m.mainTheme.trim(),
            audience: m.audience,
            questions: sheet.questions,
          }),
        })
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('saveFailed', lang))
        toast(
          t('surveyBankResult', lang)
            .replace('{inserted}', String(payload.inserted ?? 0))
            .replace('{updated}', String(payload.updated ?? 0)),
          'success'
        )
        setSheets((prev) => prev.filter((x) => x.sheet !== sheet.sheet))
        await load()
      } catch (e: any) {
        toast(e?.message || t('saveFailed', lang), 'error')
      } finally {
        setSaving(false)
      }
    },
    [meta, orgToUse, lang, load]
  )

  const removeRow = useCallback(
    async (id: string) => {
      if (!window.confirm('Silinsin mi?')) return
      try {
        const resp = await fetch(`/api/admin/survey-bank?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('deleteFailed', lang))
        await load()
      } catch (e: any) {
        toast(e?.message || t('deleteFailed', lang), 'error')
      }
    },
    [lang, load]
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr')
    if (!needle) return items
    return items.filter((r) =>
      `${r.main_theme} ${r.sub_theme || ''} ${r.question_code || ''} ${r.text_tr}`
        .toLocaleLowerCase('tr')
        .includes(needle)
    )
  }, [items, q])

  const grouped = useMemo(() => {
    const map = new Map<string, BankRow[]>()
    for (const r of filtered) {
      const key = `${r.main_theme}|||${r.audience}`
      const list = map.get(key) || []
      list.push(r)
      map.set(key, list)
    }
    return Array.from(map.entries()).map(([key, rows]) => {
      const [mainTheme, audience] = key.split('|||')
      return { mainTheme, audience, rows }
    })
  }, [filtered])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-[var(--brand)]" />
          {t('surveyBank', lang)}
        </h1>
        <p className="text-[var(--muted)] mt-1">{t('surveyBankSubtitle', lang)}</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('surveyBankUpload', lang)}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
              e.target.value = ''
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {t('surveyBankUpload', lang)}
          </Button>

          {sheets.map((s) => (
            <div key={s.sheet} className="rounded-xl border border-[var(--border)] p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--foreground)]">{s.sheet}</span>
                <Badge>{t('surveyBankQuestionCount', lang).replace('{n}', String(s.questions.length))}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  value={meta[s.sheet]?.mainTheme || ''}
                  onChange={(e) =>
                    setMeta((p) => ({ ...p, [s.sheet]: { ...p[s.sheet], mainTheme: e.target.value } }))
                  }
                  placeholder={t('surveyBankMainTheme', lang)}
                />
                <Select
                  options={[
                    { value: 'ogrenci', label: t('surveyBankAudStudent', lang) },
                    { value: 'veli', label: t('surveyBankAudParent', lang) },
                    { value: 'personel', label: t('surveyBankAudStaff', lang) },
                    { value: 'genel', label: t('surveyBankAudGeneral', lang) },
                  ]}
                  value={meta[s.sheet]?.audience || 'genel'}
                  onChange={(e) =>
                    setMeta((p) => ({ ...p, [s.sheet]: { ...p[s.sheet], audience: e.target.value } }))
                  }
                  placeholder={t('surveyBankAudience', lang)}
                />
                {s.questions.length ? (
                  <Button onClick={() => void saveSheet(s)} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {t('surveyBankSave', lang)}
                  </Button>
                ) : null}
              </div>
              {s.warnings.length ? (
                <div className="text-xs text-amber-600">{s.warnings.join(' · ')}</div>
              ) : null}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>
              {t('surveyBank', lang)}{' '}
              <Badge variant="gray">{t('total', lang)}: {items.length}</Badge>
            </span>
            <div className="w-64">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search', lang)} />
            </div>
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {loading ? (
            <div className="py-8 text-center text-[var(--muted)]">
              <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
              {t('loading', lang)}
            </div>
          ) : !grouped.length ? (
            <div className="py-8 text-center text-[var(--muted)]">{t('surveyBankEmpty', lang)}</div>
          ) : (
            grouped.map((g) => (
              <div key={`${g.mainTheme}|${g.audience}`} className="rounded-xl border border-[var(--border)]">
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                  <span className="font-medium text-[var(--foreground)]">{g.mainTheme}</span>
                  <Badge>{audienceLabel(g.audience)}</Badge>
                  <span className="text-xs text-[var(--muted)]">
                    {t('surveyBankQuestionCount', lang).replace('{n}', String(g.rows.length))}
                  </span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {g.rows.map((r) => {
                    const isOpen = r.question_type === 'text'
                    const scored = r.options.filter((o) => typeof o.score === 'number').length
                    const unscored = r.options.length - scored
                    return (
                      <div key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm text-[var(--foreground)]">
                            {r.question_code ? <span className="text-[var(--muted)]">{r.question_code} · </span> : null}
                            {r.text_tr}
                          </div>
                          <div className="text-xs text-[var(--muted)] mt-0.5">
                            {r.sub_theme || '-'} ·{' '}
                            {isOpen
                              ? t('surveyBankOpenEnded', lang)
                              : `${t('surveyBankScored', lang).replace('{n}', String(scored))}${
                                  unscored ? ` · ${unscored} ${t('surveyBankNoScore', lang)}` : ''
                                }`}
                          </div>
                        </div>
                        <Button variant="secondary" onClick={() => void removeRow(r.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  )
}
