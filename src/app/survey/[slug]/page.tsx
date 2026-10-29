'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Card, CardBody, CardHeader, CardTitle, Button, toast, ToastContainer } from '@/components/ui'
import { Loader2, Check, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Lang, pickLangText, t } from '@/lib/i18n'
import { useLang } from '@/components/i18n/language-context'
import { readSurveyOptions, surveyOptionLabels } from '@/lib/survey-options'

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
  /** Alt tema; havuzdan eklenen sorularda dolu. Bölümleme buna göre yapılır. */
  category?: string | null
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

// Seçenek biçimi tek yerden okunur (eski düz metin + yeni puanlı biçim).
// Katılımcıya yalnız etiket gösterilir; puan asla ekranda görünmez.
function asOptions(raw: unknown): string[] {
  return surveyOptionLabels(raw)
}

// --- Taslak koruma -------------------------------------------------------
// Uzun ankette sayfa kapanırsa cevaplar kaybolmasın. Taslak YALNIZ
// katılımcının kendi tarayıcısında durur; sunucuya gitmez, anonimliği
// etkilemez. Özel sekmede depo erişimi hata verebilir → her çağrı korumalı.

const draftKey = (slug: string, channel?: string) =>
  channel ? `svy_draft_${slug}_${channel}` : `svy_draft_${slug}`

function loadDraft(slug: string, channel?: string): { values: Record<string, any>; step: number } | null {
  try {
    const raw = localStorage.getItem(draftKey(slug, channel))
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object' || !p.values || typeof p.values !== 'object') return null
    return { values: p.values as Record<string, any>, step: Number(p.step) || 0 }
  } catch {
    return null
  }
}

function saveDraft(slug: string, channel: string | undefined, values: Record<string, any>, step: number) {
  try {
    localStorage.setItem(draftKey(slug, channel), JSON.stringify({ values, step, at: Date.now() }))
  } catch {
    // Depo kapalı veya dolu — taslak zorunlu değil, form çalışmaya devam eder.
  }
}

function clearDraft(slug: string, channel?: string) {
  try {
    localStorage.removeItem(draftKey(slug, channel))
  } catch {
    // yoksay
  }
}

type QGroup = { key: string; title: string; questions: SQuestion[] }

/**
 * Seçenek satırı MODÜL seviyesinde tanımlı olmalı. Render içinde bileşen
 * tanımlanırsa her tuşta yeniden kurulur ve radyo odağı kaybolur.
 */
function SingleOptionRow({
  label,
  selected,
  onPick,
}: {
  label: string
  selected: boolean
  onPick: () => void
}) {
  return (
    <label
      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
        selected
          ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]/40'
      }`}
    >
      <input
        type="radio"
        checked={selected}
        onChange={onPick}
        className="accent-[var(--brand)] mt-0.5 shrink-0"
      />
      <span className="text-sm leading-snug text-[var(--foreground)]">{label}</span>
    </label>
  )
}

export default function SurveyFillPage() {
  const params = useParams()
  const slug = String((params as any)?.slug || '')
  const search = useSearchParams()
  // Sınıf bazlı link: /survey/<slug>?k=<jeton>. Jeton sunucuda kanala çevrilir.
  const channel = String(search?.get('k') || '')
  const lang = useLang() as Lang

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [already, setAlready] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [survey, setSurvey] = useState<SSurvey | null>(null)
  const [questions, setQuestions] = useState<SQuestion[]>([])
  const [values, setValues] = useState<Record<string, any>>({})
  const [step, setStep] = useState(0)
  const [missingId, setMissingId] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

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
        // Yarıda kalmış taslak varsa kaldığı yerden devam.
        const draft = loadDraft(slug, channel)
        if (draft) {
          setValues({ ...init, ...draft.values })
          setStep(draft.step)
          setRestored(true)
        } else {
          setValues(init)
        }
      } catch {
        if (alive) setBlocked(t('surveyClosedMsg', lang))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [slug, lang, channel])

  const setVal = useCallback((qid: string, v: any) => {
    setMissingId((m) => (m === qid ? null : m))
    setValues((s) => ({ ...s, [qid]: v }))
  }, [])

  // Alt temaya göre bölümler. Alt teması olmayan sorular tek grupta toplanır;
  // grup sayısı 1 kalırsa form eskisi gibi tek sayfa görünür.
  const groups = useMemo<QGroup[]>(() => {
    const out: QGroup[] = []
    const at = new Map<string, number>()
    for (const q of questions) {
      const key = String(q.category || '').trim() || '__none'
      let i = at.get(key)
      if (i == null) {
        i = out.length
        at.set(key, i)
        out.push({ key, title: key === '__none' ? '' : key, questions: [] })
      }
      out[i].questions.push(q)
    }
    return out
  }, [questions])

  const stepped = groups.length > 1
  const safeStep = Math.min(Math.max(step, 0), Math.max(0, groups.length - 1))

  const isEmptyVal = useCallback((q: SQuestion, v: any) => {
    if (v == null) return true
    if (typeof v === 'string') return !v.trim()
    if (Array.isArray(v)) return q.question_type === 'multi' ? v.length === 0 : false
    return false
  }, [])

  const answeredCount = useMemo(
    () => questions.filter((q) => !isEmptyVal(q, values[q.id])).length,
    [questions, values, isEmptyVal]
  )

  // İlk eksik zorunlu sorunun kimliği.
  const firstMissing = useCallback(
    (list: SQuestion[]) => {
      for (const q of list) {
        if (!q.is_required) continue
        if (isEmptyVal(q, values[q.id])) return q.id
      }
      return null
    },
    [values, isEmptyVal]
  )

  // Genel uyarı 29 soruda işe yaramıyor; eksik sorunun kendisine gidilir.
  const focusMissing = useCallback(
    (qid: string) => {
      setMissingId(qid)
      toast(t('surveyRequiredMissing', lang), 'error')
      requestAnimationFrame(() => {
        cardRefs.current[qid]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    },
    [lang]
  )

  const goNext = useCallback(() => {
    const cur = groups[safeStep]
    const miss = cur ? firstMissing(cur.questions) : null
    if (miss) {
      focusMissing(miss)
      return
    }
    setMissingId(null)
    setStep(Math.min(safeStep + 1, groups.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [groups, safeStep, firstMissing, focusMissing])

  const goPrev = useCallback(() => {
    setMissingId(null)
    setStep(Math.max(safeStep - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [safeStep])

  // Cevaplar değiştikçe taslak yazılır (kısa gecikmeyle, her tuşta değil).
  useEffect(() => {
    if (loading || done) return
    if (!Object.keys(values).length) return
    const id = setTimeout(() => saveDraft(slug, channel, values, step), 400)
    return () => clearTimeout(id)
  }, [values, step, slug, channel, loading, done])

  const submit = useCallback(async () => {
    // Zorunlu kontrolü (client). Eksik soru başka bölümdeyse o bölüme geçilir.
    const miss = firstMissing(questions)
    if (miss) {
      const gi = groups.findIndex((g) => g.questions.some((q) => q.id === miss))
      if (gi >= 0) setStep(gi)
      focusMissing(miss)
      return
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
        body: JSON.stringify({ answers, lang, channel }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (resp.status === 409 || payload?.code === 'already_answered') {
        clearDraft(slug, channel)
        setAlready(true)
        setDone(true)
        return
      }
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('surveySubmitFailed', lang))
      // Yalnız başarılı gönderimden sonra silinir; hata olursa cevaplar durur.
      clearDraft(slug, channel)
      setDone(true)
    } catch (e: any) {
      toast(e?.message || t('surveySubmitFailed', lang), 'error')
    } finally {
      setSubmitting(false)
    }
  }, [questions, values, slug, lang, channel, firstMissing, focusMissing, groups])

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
            <h2 className="text-lg font-bold text-[var(--foreground)]">
              {already ? t('surveyAlreadyTitle', lang) : t('surveyThanksTitle', lang)}
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              {already ? t('surveyAlreadyMsg', lang) : t('surveyThanksMsg', lang)}
            </p>
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

        {restored && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-xs text-[var(--muted)]">
            {t('surveyDraftRestored', lang)}
          </div>
        )}

        {questions.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span>
                {stepped
                  ? t('surveySectionOf', lang)
                      .replace('{n}', String(safeStep + 1))
                      .replace('{total}', String(groups.length))
                  : ''}
              </span>
              <span>
                {t('surveyProgress', lang)
                  .replace('{n}', String(answeredCount))
                  .replace('{total}', String(questions.length))}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--brand)] transition-all"
                style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {stepped && groups[safeStep]?.title && (
          <h2 className="text-base font-semibold text-[var(--foreground)] pt-1">
            {groups[safeStep].title}
          </h2>
        )}

        {(stepped ? groups[safeStep]?.questions ?? [] : questions).map((q, i) => {
          const qText = pickLangText(lang, q.text, q.text_en, q.text_fr)
          // Numaralar bölümler arasında kesintisiz devam eder (1…29).
          const offset = stepped
            ? groups.slice(0, safeStep).reduce((s, g) => s + g.questions.length, 0)
            : 0
          return (
            <div
              key={q.id}
              ref={(el) => {
                cardRefs.current[q.id] = el
              }}
            >
              <Card className={missingId === q.id ? 'ring-2 ring-red-500' : undefined}>
                <CardBody className="space-y-3">
                  <div className="font-medium text-[var(--foreground)]">
                    <span className="text-[var(--muted)] mr-1">{offset + i + 1}.</span>
                    {qText}
                    {q.is_required && <span className="text-red-500 ml-1">*</span>}
                  </div>
                  <QuestionInput q={q} value={values[q.id]} onChange={(v) => setVal(q.id, v)} lang={lang} />
                </CardBody>
              </Card>
            </div>
          )
        })}

        <div className="flex items-center justify-between gap-3 pb-10">
          {stepped && safeStep > 0 ? (
            <Button variant="secondary" onClick={goPrev} disabled={submitting}>
              <ChevronLeft className="w-4 h-4" />
              {t('surveyPrev', lang)}
            </Button>
          ) : (
            <span />
          )}

          {stepped && safeStep < groups.length - 1 ? (
            <Button onClick={goNext} size="lg">
              {t('surveyNext', lang)}
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting} size="lg">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t('surveySubmit', lang)}
            </Button>
          )}
        </div>

        <p className="text-xs text-[var(--muted)] -mt-6 pb-8">{t('surveyDraftNotice', lang)}</p>
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
    const all = readSurveyOptions(q.options)
    const scored = all.filter((o) => typeof o.score === 'number')
    // Puanlı seçenek varsa puansızlar ("Fikrim yok") kesik çizgiyle ayrılır:
    // dokuz düzeyin hemen altında sıradaki satır olarak durmasın.
    const plain = scored.length ? all.filter((o) => typeof o.score !== 'number') : []
    const main = scored.length ? scored : all
    return (
      <div className="space-y-2">
        {main.map((o) => (
          <SingleOptionRow
            key={o.label}
            label={o.label}
            selected={value === o.label}
            onPick={() => onChange(o.label)}
          />
        ))}
        {plain.length > 0 && (
          <div className="pt-2 mt-1 border-t border-dashed border-[var(--border)] space-y-2">
            {plain.map((o) => (
              <SingleOptionRow
                key={o.label}
                label={o.label}
                selected={value === o.label}
                onPick={() => onChange(o.label)}
              />
            ))}
          </div>
        )}
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
