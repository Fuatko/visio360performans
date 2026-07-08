'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardBody, CardHeader, CardTitle, Button, toast, ToastContainer } from '@/components/ui'
import { Loader2, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { Lang, pickLangText, t } from '@/lib/i18n'
import { useLang } from '@/components/i18n/language-context'

type SQuestion = {
  id: string
  question_type: 'likert' | 'single' | 'multi' | 'text' | 'nps' | 'yesno' | 'date' | 'rank'
  text: string
  text_en: string | null
  text_fr: string | null
  options: unknown
  scale_min: number | null
  scale_max: number | null
  is_required: boolean
}

type SSurvey = {
  id: string
  title: string
  title_en: string | null
  title_fr: string | null
  description: string | null
  description_en: string | null
  description_fr: string | null
  is_anonymous: boolean
}

function asOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x))
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).options)) return (raw as any).options.map((x: any) => String(x))
  return []
}

export default function SurveyFillPage() {
  const params = useParams()
  const slug = String((params as any)?.slug || '')
  const lang = useLang() as Lang

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [survey, setSurvey] = useState<SSurvey | null>(null)
  const [questions, setQuestions] = useState<SQuestion[]>([])
  const [values, setValues] = useState<Record<string, any>>({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const resp = await fetch(`/api/survey/${encodeURIComponent(slug)}`)
        const payload = (await resp.json().catch(() => ({}))) as any
        if (!alive) return
        if (!resp.ok || !payload?.success) {
          setBlocked(payload?.message || t('surveyClosedMsg', lang))
          return
        }
        setSurvey(payload.survey)
        setQuestions(payload.questions || [])
        // rank soruları için başlangıç sırası
        const init: Record<string, any> = {}
        for (const q of payload.questions || []) {
          if (q.question_type === 'rank') init[q.id] = asOptions(q.options)
        }
        setValues(init)
      } catch {
        if (alive) setBlocked(t('surveyClosedMsg', lang))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [slug, lang])

  const setVal = useCallback((qid: string, v: any) => setValues((s) => ({ ...s, [qid]: v })), [])

  const submit = useCallback(async () => {
    // Zorunlu kontrolü (client)
    for (const q of questions) {
      if (!q.is_required) continue
      const v = values[q.id]
      const empty =
        v == null ||
        (typeof v === 'string' && !v.trim()) ||
        (Array.isArray(v) && q.question_type === 'multi' && v.length === 0)
      if (empty) {
        toast(t('surveyRequiredMissing', lang), 'error')
        return
      }
    }
    setSubmitting(true)
    try {
      const answers = questions
        .map((q) => {
          const v = values[q.id]
          if (v == null || (typeof v === 'string' && !v.trim())) {
            if (q.question_type !== 'rank' && q.question_type !== 'multi') return null
          }
          switch (q.question_type) {
            case 'likert':
            case 'nps':
              return v == null ? null : { question_id: q.id, value_num: Number(v) }
            case 'yesno':
              return v == null ? null : { question_id: q.id, value_num: v ? 1 : 0 }
            case 'single':
            case 'text':
            case 'date':
              return { question_id: q.id, value_text: String(v) }
            case 'multi':
              return Array.isArray(v) && v.length ? { question_id: q.id, value_json: v } : null
            case 'rank':
              return Array.isArray(v) && v.length ? { question_id: q.id, value_json: v } : null
            default:
              return null
          }
        })
        .filter(Boolean)

      const resp = await fetch(`/api/survey/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, lang }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('surveySubmitFailed', lang))
      setDone(true)
    } catch (e: any) {
      toast(e?.message || t('surveySubmitFailed', lang), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [questions, values, slug, lang])

  const title = useMemo(
    () => (survey ? pickLangText(lang, survey.title, survey.title_en, survey.title_fr) : ''),
    [survey, lang]
  )
  const description = useMemo(
    () => (survey ? pickLangText(lang, survey.description, survey.description_en, survey.description_fr) : ''),
    [survey, lang]
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
      </div>
    )
  }

  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
        <Card className="max-w-md w-full">
          <CardBody className="text-center py-10">
            <p className="text-[var(--foreground)]">{blocked}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-4">
        <Card className="max-w-md w-full">
          <CardBody className="text-center py-12">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">{t('surveyThanksTitle', lang)}</h2>
            <p className="text-sm text-[var(--muted)] mt-1">{t('surveyThanksMsg', lang)}</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)] py-8 px-4">
      <ToastContainer />
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{title}</h1>
          {description && <p className="text-sm text-[var(--muted)] mt-1 whitespace-pre-line">{description}</p>}
          {survey?.is_anonymous && <p className="text-xs text-[var(--muted)] mt-2">🔒 {t('surveyAnonymousNotice', lang)}</p>}
        </div>

        {questions.map((q, idx) => {
          const qText = pickLangText(lang, q.text, q.text_en, q.text_fr)
          return (
            <Card key={q.id}>
              <CardBody className="space-y-3">
                <div className="font-medium text-[var(--foreground)]">
                  <span className="text-[var(--muted)] mr-1">{idx + 1}.</span>
                  {qText}
                  {q.is_required && <span className="text-red-500 ml-1">*</span>}
                </div>
                <QuestionInput q={q} value={values[q.id]} onChange={(v) => setVal(q.id, v)} lang={lang} />
              </CardBody>
            </Card>
          )
        })}

        <div className="flex justify-end pb-10">
          <Button onClick={submit} disabled={submitting} size="lg">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t('surveySubmit', lang)}
          </Button>
        </div>
      </div>
    </div>
  )
}

function QuestionInput({
  q,
  value,
  onChange,
  lang,
}: {
  q: SQuestion
  value: any
  onChange: (v: any) => void
  lang: Lang
}) {
  const opts = asOptions(q.options)

  if (q.question_type === 'text') {
    return (
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full px-4 py-2.5 text-sm border rounded-xl bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
        placeholder={t('surveyYourAnswer', lang)}
      />
    )
  }

  if (q.question_type === 'date') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="px-4 py-2.5 text-sm border rounded-xl bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
      />
    )
  }

  if (q.question_type === 'likert') {
    const min = q.scale_min ?? 1
    const max = q.scale_max ?? 5
    const scale = Array.from({ length: max - min + 1 }, (_, i) => min + i)
    return (
      <div className="flex flex-wrap gap-2">
        {scale.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-11 h-11 rounded-xl border text-sm font-medium transition-colors ${
              value === n ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)]'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    )
  }

  if (q.question_type === 'nps') {
    const scale = Array.from({ length: 11 }, (_, i) => i)
    return (
      <div className="flex flex-wrap gap-1.5">
        {scale.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-9 h-9 rounded-lg border text-xs font-medium transition-colors ${
              value === n ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)]'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    )
  }

  if (q.question_type === 'yesno') {
    return (
      <div className="flex gap-2">
        {[
          { v: true, label: t('yes', lang) },
          { v: false, label: t('no', lang) },
        ].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={`px-5 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
              value === o.v ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    )
  }

  if (q.question_type === 'single') {
    return (
      <div className="space-y-2">
        {opts.map((o) => (
          <label key={o} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={value === o} onChange={() => onChange(o)} className="accent-[var(--brand)]" />
            <span className="text-sm text-[var(--foreground)]">{o}</span>
          </label>
        ))}
      </div>
    )
  }

  if (q.question_type === 'multi') {
    const arr: string[] = Array.isArray(value) ? value : []
    const toggle = (o: string) => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])
    return (
      <div className="space-y-2">
        {opts.map((o) => (
          <label key={o} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={arr.includes(o)} onChange={() => toggle(o)} className="accent-[var(--brand)]" />
            <span className="text-sm text-[var(--foreground)]">{o}</span>
          </label>
        ))}
      </div>
    )
  }

  if (q.question_type === 'rank') {
    const arr: string[] = Array.isArray(value) ? value : opts
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir
      if (j < 0 || j >= arr.length) return
      const next = [...arr]
      const tmp = next[i]
      next[i] = next[j]
      next[j] = tmp
      onChange(next)
    }
    return (
      <div className="space-y-2">
        {arr.map((o, i) => (
          <div key={o} className="flex items-center gap-2 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
            <span className="w-6 h-6 rounded-full bg-[var(--brand-soft)] text-[var(--brand)] text-xs flex items-center justify-center font-medium">
              {i + 1}
            </span>
            <span className="text-sm text-[var(--foreground)] flex-1">{o}</span>
            <button type="button" onClick={() => move(i, -1)} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)]">
              <ChevronUp className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => move(i, 1)} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)]">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    )
  }

  return null
}
