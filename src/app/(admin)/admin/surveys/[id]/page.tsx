'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
} from 'recharts'
import { Card, CardHeader, CardBody, CardTitle, Button, Input, Select, Badge, StatTile, toast } from '@/components/ui'
import { useLang } from '@/components/i18n/language-context'
import { t, type Lang } from '@/lib/i18n'
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, GripVertical, BarChart3, ListChecks, Users,
  Star, TrendingUp, Download, MessageSquare, Sparkles, Upload, FileSpreadsheet,
} from 'lucide-react'
import type { SurveyQuestionType } from '@/types/database'
import type { SurveyAnalytics, QuestionAnalytics } from '@/lib/server/survey-analytics'
import { SurveyAiPanel } from '@/components/admin/survey-ai-panel'
import { parseSurveyQuestionsWorkbook, downloadSurveyImportTemplate } from '@/lib/survey-questions-import'

type QDraft = {
  id?: string
  question_type: SurveyQuestionType
  text: string
  optionsText: string // satır satır seçenekler (single/multi/rank)
  scale_min: number
  scale_max: number
  is_required: boolean
}

const TYPE_LABEL_KEY: Record<SurveyQuestionType, string> = {
  likert: 'sqTypeLikert',
  single: 'sqTypeSingle',
  multi: 'sqTypeMulti',
  text: 'sqTypeText',
  nps: 'sqTypeNps',
  yesno: 'sqTypeYesno',
  date: 'sqTypeDate',
  rank: 'sqTypeRank',
}

const NEEDS_OPTIONS: SurveyQuestionType[] = ['single', 'multi', 'rank']

function emptyQuestion(): QDraft {
  return { question_type: 'likert', text: '', optionsText: '', scale_min: 1, scale_max: 5, is_required: false }
}

export default function SurveyDetailPage() {
  const params = useParams()
  const id = String((params as any)?.id || '')
  const lang = useLang()

  const [tab, setTab] = useState<'builder' | 'results' | 'ai'>('builder')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [meta, setMeta] = useState({
    title: '',
    description: '',
    status: 'draft',
    access_type: 'both',
    is_anonymous: 'false',
    slug: '',
    organization_id: '',
  })
  const [questions, setQuestions] = useState<QDraft[]>([])
  const [responseCount, setResponseCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch(`/api/admin/surveys?id=${encodeURIComponent(id)}`)
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('surveyLoadFailed', lang))
      const sv = payload.survey
      setMeta({
        title: sv.title || '',
        description: sv.description || '',
        status: sv.status || 'draft',
        access_type: sv.access_type || 'both',
        is_anonymous: sv.is_anonymous ? 'true' : 'false',
        slug: sv.slug || '',
        organization_id: sv.organization_id || '',
      })
      setResponseCount(payload.response_count || 0)
      setQuestions(
        (payload.questions || []).map((q: any) => ({
          id: q.id,
          question_type: q.question_type,
          text: q.text || '',
          optionsText: Array.isArray(q.options) ? q.options.join('\n') : '',
          scale_min: q.scale_min ?? 1,
          scale_max: q.scale_max ?? 5,
          is_required: !!q.is_required,
        }))
      )
    } catch (e: any) {
      toast(e?.message || t('surveyLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [id, lang])

  useEffect(() => {
    if (id) load()
  }, [id, load])

  const save = useCallback(async () => {
    if (!meta.title.trim()) {
      toast(t('missingFields', lang), 'error')
      return
    }
    setSaving(true)
    try {
      const payloadQuestions = questions.map((q, idx) => ({
        question_type: q.question_type,
        text: q.text.trim(),
        options: NEEDS_OPTIONS.includes(q.question_type)
          ? q.optionsText.split('\n').map((s) => s.trim()).filter(Boolean)
          : null,
        scale_min: q.question_type === 'likert' ? Number(q.scale_min) : null,
        scale_max: q.question_type === 'likert' ? Number(q.scale_max) : null,
        is_required: q.is_required,
        sort_order: idx,
      }))
      const resp = await fetch('/api/admin/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          org_id: meta.organization_id,
          title: meta.title.trim(),
          description: meta.description.trim() || null,
          status: meta.status,
          access_type: meta.access_type,
          is_anonymous: meta.is_anonymous === 'true',
          questions: payloadQuestions,
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('saveFailed', lang))
      toast(t('saved', lang), 'success')
      await load()
    } catch (e: any) {
      toast(e?.message || t('saveFailed', lang), 'error')
    } finally {
      setSaving(false)
    }
  }, [id, meta, questions, load, lang])

  const addQuestion = () => setQuestions((qs) => [...qs, emptyQuestion()])
  const importQuestions = (incoming: QDraft[]) =>
    setQuestions((qs) => [...qs, ...incoming.map((q) => ({ ...q }))])
  const removeQuestion = (i: number) => setQuestions((qs) => qs.filter((_, idx) => idx !== i))
  const updateQuestion = (i: number, patch: Partial<QDraft>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  const moveQuestion = (i: number, dir: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + dir
      if (j < 0 || j >= qs.length) return qs
      const next = [...qs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin/surveys">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--foreground)] truncate">{meta.title || t('surveyManage', lang)}</h1>
            <p className="text-xs text-[var(--muted)]">
              /survey/{meta.slug} · {t('surveyResponsesCount', lang).replace('{n}', String(responseCount))}
            </p>
          </div>
        </div>
        {tab === 'builder' && (
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('save', lang)}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {([
          { key: 'builder', label: t('surveyTabBuilder', lang), icon: ListChecks },
          { key: 'results', label: t('surveyTabResults', lang), icon: BarChart3 },
          { key: 'ai', label: t('surveyTabAi', lang), icon: Sparkles },
        ] as const).map((tb) => {
          const Icon = tb.icon
          return (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === tb.key
                  ? 'border-[var(--brand)] text-[var(--brand)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tb.label}
            </button>
          )
        })}
      </div>

      {tab === 'builder' && (
        <BuilderTab
          meta={meta}
          setMeta={setMeta}
          questions={questions}
          lang={lang}
          addQuestion={addQuestion}
          importQuestions={importQuestions}
          removeQuestion={removeQuestion}
          updateQuestion={updateQuestion}
          moveQuestion={moveQuestion}
        />
      )}
      {tab === 'results' && <ResultsTab id={id} lang={lang} responseCount={responseCount} />}
      {tab === 'ai' && <SurveyAiPanel surveyId={id} lang={lang} responseCount={responseCount} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
function BuilderTab({
  meta,
  setMeta,
  questions,
  lang,
  addQuestion,
  importQuestions,
  removeQuestion,
  updateQuestion,
  moveQuestion,
}: any) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const onFilePicked = useCallback(
    async (file: File | null) => {
      if (!file) return
      setImporting(true)
      try {
        const buf = await file.arrayBuffer()
        const { questions: parsed, errors, warnings } = parseSurveyQuestionsWorkbook(buf)
        if (errors.length) {
          toast(errors[0], 'error')
          return
        }
        if (!parsed.length) {
          toast(t('surveyImportEmpty', lang), 'error')
          return
        }
        importQuestions(parsed)
        if (warnings.length) {
          warnings.forEach((w: string) => console.warn('[anket-import]', w))
          toast(t('surveyImportWarnings', lang).replace('{n}', String(warnings.length)), 'info')
        }
        toast(t('surveyImportSuccess', lang).replace('{n}', String(parsed.length)), 'success')
      } catch (e: any) {
        toast(e?.message || t('surveyImportFailed', lang), 'error')
      } finally {
        setImporting(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    },
    [importQuestions, lang]
  )

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t('surveySettings', lang)}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">{t('surveyTitle', lang)}</label>
            <Input value={meta.title} onChange={(e: any) => setMeta((m: any) => ({ ...m, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">{t('surveyDescription', lang)}</label>
            <textarea
              value={meta.description}
              onChange={(e) => setMeta((m: any) => ({ ...m, description: e.target.value }))}
              rows={2}
              className="w-full px-4 py-2.5 text-sm border rounded-xl bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">{t('surveyStatus', lang)}</label>
              <Select
                value={meta.status}
                onChange={(e: any) => setMeta((m: any) => ({ ...m, status: e.target.value }))}
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
                value={meta.access_type}
                onChange={(e: any) => setMeta((m: any) => ({ ...m, access_type: e.target.value }))}
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
                value={meta.is_anonymous}
                onChange={(e: any) => setMeta((m: any) => ({ ...m, is_anonymous: e.target.value }))}
                options={[
                  { value: 'false', label: t('no', lang) },
                  { value: 'true', label: t('yes', lang) },
                ]}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-[var(--foreground)]">{t('surveyQuestions', lang)}</h3>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => onFilePicked(e.target.files?.[0] || null)}
          />
          <Button variant="ghost" size="sm" onClick={() => downloadSurveyImportTemplate()}>
            <FileSpreadsheet className="w-4 h-4" />
            {t('surveyImportTemplate', lang)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t('surveyImportExcel', lang)}
          </Button>
          <Button variant="secondary" size="sm" onClick={addQuestion}>
            <Plus className="w-4 h-4" />
            {t('surveyAddQuestion', lang)}
          </Button>
        </div>
      </div>

      {questions.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--muted)] text-center py-4">{t('surveyNoQuestions', lang)}</p>
          </CardBody>
        </Card>
      )}

      {questions.map((q: QDraft, i: number) => (
        <Card key={i}>
          <CardBody className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex flex-col pt-1">
                <button onClick={() => moveQuestion(i, -1)} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="↑">
                  <GripVertical className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs text-[var(--muted)] mb-1">
                      {t('surveyQuestionText', lang)} #{i + 1}
                    </label>
                    <Input value={q.text} onChange={(e: any) => updateQuestion(i, { text: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">{t('surveyQuestionType', lang)}</label>
                    <Select
                      value={q.question_type}
                      onChange={(e: any) => updateQuestion(i, { question_type: e.target.value })}
                      options={(Object.keys(TYPE_LABEL_KEY) as SurveyQuestionType[]).map((tp) => ({
                        value: tp,
                        label: t(TYPE_LABEL_KEY[tp] as any, lang),
                      }))}
                    />
                  </div>
                </div>

                {NEEDS_OPTIONS.includes(q.question_type) && (
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">{t('surveyOptionsHint', lang)}</label>
                    <textarea
                      value={q.optionsText}
                      onChange={(e) => updateQuestion(i, { optionsText: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2.5 text-sm border rounded-xl bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
                      placeholder={t('surveyOptionsPlaceholder', lang)}
                    />
                  </div>
                )}

                {q.question_type === 'likert' && (
                  <div className="flex items-end gap-3">
                    <div className="w-24">
                      <label className="block text-xs text-[var(--muted)] mb-1">Min</label>
                      <Input
                        type="number"
                        value={String(q.scale_min)}
                        onChange={(e: any) => updateQuestion(i, { scale_min: Number(e.target.value) })}
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-[var(--muted)] mb-1">Max</label>
                      <Input
                        type="number"
                        value={String(q.scale_max)}
                        onChange={(e: any) => updateQuestion(i, { scale_max: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.is_required}
                      onChange={(e) => updateQuestion(i, { is_required: e.target.checked })}
                      className="accent-[var(--brand)]"
                    />
                    {t('surveyRequired', lang)}
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => removeQuestion(i)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
function ResultsTab({ id, lang, responseCount }: { id: string; lang: Lang; responseCount: number }) {
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<SurveyAnalytics | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const resp = await fetch(`/api/admin/surveys/analytics?id=${encodeURIComponent(id)}`)
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!alive) return
        if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('surveyLoadFailed', lang))
        setAnalytics(payload.analytics)
      } catch (e: any) {
        toast(e?.message || t('surveyLoadFailed', lang), 'error')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [id, lang])

  const exportExcel = useCallback(async () => {
    if (!analytics) return
    const XLSX = await import('xlsx')
    const rows: any[] = []
    for (const q of analytics.questions) {
      if (q.distribution) {
        for (const d of q.distribution) rows.push({ Soru: q.text, Seçenek: d.label, Adet: d.count, Yüzde: d.pct })
      } else if (q.rankAverages) {
        for (const r of q.rankAverages) rows.push({ Soru: q.text, Seçenek: r.label, OrtalamaSıra: r.avgPosition })
      } else if (q.texts) {
        for (const tx of q.texts) rows.push({ Soru: q.text, Yanıt: tx })
      }
      if (q.nps) rows.push({ Soru: q.text, NPS: q.nps.score })
      if (typeof q.average === 'number') rows.push({ Soru: q.text, Ortalama: q.average })
    }
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Bilgi: 'Veri yok' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Anket')
    XLSX.writeFile(wb, `anket-${id}.xlsx`)
  }, [analytics, id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--brand)]" />
      </div>
    )
  }

  if (!analytics || responseCount === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-[var(--muted)] text-center py-8">{t('surveyNoResponses', lang)}</p>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile title={t('surveyStatResponses', lang)} value={analytics.responseCount} icon={Users} tone="brand" />
        <StatTile title={t('surveyStatQuestions', lang)} value={analytics.questionCount} icon={ListChecks} tone="info" />
        <StatTile
          title={t('surveyStatAvg', lang)}
          value={analytics.overallLikertAverage ?? '—'}
          icon={Star}
          tone="success"
        />
        <StatTile title={t('surveyStatNps', lang)} value={analytics.npsOverall ?? '—'} icon={TrendingUp} tone="warning" />
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={exportExcel}>
          <Download className="w-4 h-4" />
          {t('surveyExportExcel', lang)}
        </Button>
      </div>

      <div className="space-y-4">
        {analytics.questions.map((q) => (
          <QuestionResult key={q.question_id} q={q} lang={lang} />
        ))}
      </div>
    </div>
  )
}

function QuestionResult({ q, lang }: { q: QuestionAnalytics; lang: Lang }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-medium text-[var(--foreground)]">{q.text}</p>
          <div className="flex items-center gap-2">
            {typeof q.average === 'number' && <Badge variant="success">{t('surveyStatAvg', lang)}: {q.average}</Badge>}
            {q.nps && <Badge variant="warning">NPS: {q.nps.score}</Badge>}
            <Badge variant="gray">{q.answered} {t('surveyAnswerWord', lang)}</Badge>
          </div>
        </div>

        {q.distribution && q.distribution.length > 0 && (
          <div className="w-full h-[220px]" role="img" aria-label={`${q.text} dağılım`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={q.distribution} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}
                  formatter={(v: any, _n: any, p: any) => [`${v} (${p?.payload?.pct ?? 0}%)`, t('surveyAnswerWord', lang)]}
                />
                <Bar dataKey="count" fill="var(--brand)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {q.rankAverages && q.rankAverages.length > 0 && (
          <div className="space-y-1.5">
            {q.rankAverages.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span className="text-[var(--foreground)]">{r.label}</span>
                <Badge variant="gray">{t('surveyAvgRank', lang)}: {r.avgPosition}</Badge>
              </div>
            ))}
          </div>
        )}

        {q.texts && q.texts.length > 0 && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {q.texts.map((tx, i) => (
              <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-lg bg-[var(--surface-2)]">
                <MessageSquare className="w-4 h-4 text-[var(--muted)] mt-0.5 shrink-0" />
                <span className="text-[var(--foreground)]">{tx}</span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
