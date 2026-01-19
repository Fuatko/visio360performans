'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, toast, ToastContainer } from '@/components/ui'
import { ChevronRight, ChevronLeft, Check, Loader2, User, Target } from 'lucide-react'
import { Lang, pickLangText, t } from '@/lib/i18n'
import { useAuthStore } from '@/store/auth'

const MAX_SELECTION = 2

function hash32(input: string) {
  // FNV-1a 32bit
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleDeterministic<T>(items: T[], seedKey: string) {
  const rnd = mulberry32(hash32(seedKey))
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}


interface Question {
  id: string
  text: string
  text_en?: string | null
  text_fr?: string | null
  order_num: number
  category_id: string
  question_categories: {
    name: string
    name_en?: string | null
    name_fr?: string | null
    main_categories: { name: string; status?: string | null; is_active?: boolean | null; name_en?: string | null; name_fr?: string | null }
  }
}

interface Answer {
  id: string
  question_id: string
  text: string
  text_en?: string | null
  text_fr?: string | null
  std_score: number
  reel_score: number
  order_num: number
}

interface Assignment {
  id: string
  evaluator_id: string
  target_id: string
  status: string
  evaluator: { name: string; preferred_language?: Lang | null }
  target: { name: string; department: string }
  evaluation_periods: { id?: string; name: string; status?: string; organization_id?: string | null }
}

export default function EvaluationFormPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const { user: currentUser, isLoading: authLoading } = useAuthStore()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({})
  const [responses, setResponses] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const lang: Lang = (assignment?.evaluator?.preferred_language as Lang) || 'tr'

  const isNoInfoAnswer = (a: Answer) => Number(a?.std_score || 0) === 0 && Number(a?.reel_score || 0) === 0


  const [standards, setStandards] = useState<
    Array<{ id: string; code?: string | null; title: string; description: string | null; sort_order: number }>
  >([])
  const [standardScores, setStandardScores] = useState<Record<string, { score: number; rationale: string }>>({})
  const [standardStepDone, setStandardStepDone] = useState(false)

  const localKey = useMemo(() => (assignment?.id ? `visio360_eval_draft::${assignment.id}` : null), [assignment?.id])

  // Restore draft (tablet refresh / submit retry safety)
  useEffect(() => {
    if (!localKey) return
    if (!questions.length) return
    try {
      const raw = window.localStorage.getItem(localKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        responses?: Record<string, string[]>
        currentQuestion?: number
        standardScores?: Record<string, { score: number; rationale: string }>
        standardStepDone?: boolean
      }
      // Only restore if user hasn't started answering in this session
      setResponses((prev) => {
        if (Object.keys(prev || {}).length > 0) return prev
        return parsed.responses && typeof parsed.responses === 'object' ? parsed.responses : prev
      })
      if (typeof parsed.currentQuestion === 'number' && Number.isFinite(parsed.currentQuestion)) {
        setCurrentQuestion(Math.max(0, Math.min(questions.length - 1, Math.floor(parsed.currentQuestion))))
      }
      if (parsed.standardScores && typeof parsed.standardScores === 'object') {
        setStandardScores((prev) => (Object.keys(prev || {}).length > 0 ? prev : parsed.standardScores!))
      }
      if (typeof parsed.standardStepDone === 'boolean') {
        setStandardStepDone(parsed.standardStepDone)
      }
    } catch {
      // ignore
    }
  }, [localKey, questions.length])

  // Persist draft
  useEffect(() => {
    if (!localKey) return
    const tmr = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          localKey,
          JSON.stringify({
            responses,
            currentQuestion,
            standardScores,
            standardStepDone,
          })
        )
      } catch {
        // ignore
      }
    }, 200)
    return () => window.clearTimeout(tmr)
  }, [localKey, responses, currentQuestion, standardScores, standardStepDone])

  useEffect(() => {
    // KVKK: evaluation pages should require login
    if (!authLoading && !currentUser) {
      router.push('/login')
      return
    }
    if (authLoading) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, authLoading, currentUser])

  const loadData = async () => {
    try {
      const resp = await fetch(`/api/evaluation/${encodeURIComponent(slug)}`)
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        toast(payload?.error || 'Veri yüklenirken hata oluştu', 'error')
        router.push('/dashboard/evaluations')
        return
      }

      const assignData = payload.assignment as Assignment
      setAssignment(assignData)

      const stdRows = (payload.standards || []) as any[]
      const rows = stdRows.map((s: any) => ({
        id: s.id,
        code: s.code || null,
        title: s.title || '-',
        description: s.description || null,
        sort_order: Number(s.sort_order ?? 0),
      }))
      setStandards(rows)
      setStandardStepDone(rows.length === 0)

      setQuestions((payload.questions || []) as any)
      setAnswers((payload.answersByQuestion || {}) as any)

      // Prefill from DB (only if current state is empty)
      try {
        const existing = Array.isArray(payload.existingResponses) ? payload.existingResponses : []
        const nextResp: Record<string, string[]> = {}
        existing.forEach((r: any) => {
          const qid = String(r.question_id || '')
          if (!qid) return
          const ids = Array.isArray(r.answer_ids) ? r.answer_ids.map(String) : []
          if (ids.length) nextResp[qid] = ids
        })
        setResponses((prev) => (Object.keys(prev || {}).length > 0 ? prev : nextResp))
      } catch {}

      try {
        const existingStd = Array.isArray(payload.standardScores) ? payload.standardScores : []
        const nextStd: Record<string, { score: number; rationale: string }> = {}
        existingStd.forEach((r: any) => {
          const sid = String(r.standard_id || '')
          if (!sid) return
          nextStd[sid] = { score: Number(r.score || 0), rationale: String(r.justification || '') }
        })
        setStandardScores((prev) => (Object.keys(prev || {}).length > 0 ? prev : nextStd))
      } catch {}

    } catch (error) {
      console.error('Load error:', error)
      toast('Veri yüklenirken hata oluştu', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAnswerSelect = (questionId: string, answer: Answer) => {
    setResponses((prev) => {
      const current = prev[questionId] || []
      const noInfo = isNoInfoAnswer(answer)

      // "Bilgim yok" seçimi her zaman tekil ve diğerlerini temizler
      if (noInfo) {
        return { ...prev, [questionId]: [answer.id] }
      }

      // Diğer seçimlerde, varsa "Bilgim yok"u kaldır
      const cleaned = current.filter((id) => {
        const a = (answers[questionId] || []).find((x) => x.id === id)
        return a ? !isNoInfoAnswer(a) : true
      })

      const exists = cleaned.includes(answer.id)
      let next = exists ? cleaned.filter((id) => id !== answer.id) : [...cleaned, answer.id]

      // max 2 seçenek
      if (next.length > MAX_SELECTION) {
        next = next.slice(next.length - MAX_SELECTION)
      }

      return { ...prev, [questionId]: next }
    })
  }

  const handleSubmit = async () => {
    if (!assignment) return

    // Standart adımı zorunlu (varsa)
    if (standards.length > 0 && !standardStepDone) {
      toast('Uluslararası standartlar puanlanmadan gönderilemez.', 'error')
      return
    }

    // Tüm sorular cevaplandı mı kontrol et
    const unanswered = questions.filter(q => !responses[q.id] || responses[q.id].length === 0)
    if (unanswered.length > 0) {
      toast(`${unanswered.length} soru cevaplanmamış`, 'error')
      // İlk cevaplanmamış soruya git
      const firstUnansweredIndex = questions.findIndex(q => !responses[q.id] || responses[q.id].length === 0)
      setCurrentQuestion(firstUnansweredIndex)
      return
    }

    setSubmitting(true)
    try {
      const resp = await fetch('/api/evaluation/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignment.id, responses, standard_scores: standardScores }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        toast(payload?.error || 'Kayıt hatası', 'error')
        return
      }

      toast('Değerlendirme başarıyla kaydedildi! 🎉', 'success')

      // Clear local draft once the evaluation is completed
      try {
        if (localKey) window.localStorage.removeItem(localKey)
      } catch {}
      
      setTimeout(() => {
        router.push('/dashboard/evaluations')
      }, 1500)

    } catch (error: unknown) {
      console.error('Submit error:', error)
      const anyErr = error as any
      const message =
        (anyErr && (anyErr.message || anyErr.error_description)) ||
        (error instanceof Error ? error.message : null)
      const code = anyErr?.code ? ` [${String(anyErr.code)}]` : ''
      const details = anyErr?.details ? ` — ${String(anyErr.details)}` : ''
      toast((message ? `${message}${code}${details}` : 'Kayıt hatası'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const currentQ = questions[currentQuestion]
  const currentCat: any = (currentQ as any)?.question_categories || (currentQ as any)?.categories
  const currentMain: any = currentCat?.main_categories
  const currentAnswers = useMemo(() => {
    if (!currentQ) return []
    const list = answers[currentQ.id] || []
    // Keep "Bilmiyorum" (0/0) at the end, shuffle the rest deterministically (stable per evaluation)
    const noInfo = list.filter((a) => isNoInfoAnswer(a))
    const rest = list.filter((a) => !isNoInfoAnswer(a))
    const seed = `${assignment?.id || 'no-assign'}::${currentQ.id}`
    return [...shuffleDeterministic(rest, seed), ...noInfo]
  }, [answers, currentQ, assignment?.id])
  const selectedAnswers = currentQ ? responses[currentQ.id] || [] : []
  const progress = questions.length > 0 
    ? Math.round((Object.keys(responses).filter(k => responses[k].length > 0).length / questions.length) * 100) 
    : 0

  const isSelf = assignment?.evaluator_id === assignment?.target_id

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ToastContainer />
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!assignment || questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ToastContainer />
        <Card className="max-w-md">
          <CardBody className="text-center py-12">
            <p className="text-gray-500">{t('notFoundOrNoQuestions', lang)}</p>
            <Button className="mt-4" onClick={() => router.push('/dashboard/evaluations')}>
              {t('goBack', lang)}
            </Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-6 px-4 pb-28">
      <ToastContainer />
      
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[var(--brand)] rounded-2xl shadow-lg shadow-black/5 mb-4">
            <span className="text-xl font-bold text-white">V</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">VISIO 360°</h1>
          <p className="text-slate-600 mt-1">{assignment.evaluation_periods?.name}</p>
          <div className="mt-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
              {t('languageLabelShort', lang)}: {t(lang, lang)}
            </span>
          </div>
        </div>

        {/* Target Info */}
        <Card className="mb-6">
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                  isSelf ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'bg-[var(--warning-soft)] text-amber-700'
                }`}>
                  {isSelf ? <User className="w-7 h-7" /> : <Target className="w-7 h-7" />}
                </div>
                <div>
                  <p className="text-sm text-gray-500">
                    {isSelf ? t('selfEvaluation', lang) : t('evaluatedPerson', lang)}
                  </p>
                  <p className="text-lg font-semibold text-gray-900">
                    {assignment.target?.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {assignment.target?.department}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge variant={isSelf ? 'info' : 'default'}>
                  {isSelf ? `🔵 ${t('selfEvaluation', lang)}` : `👥 ${t('peerEvaluation', lang)}`}
                </Badge>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-slate-700 text-sm mb-2">
            <span>
              {t('progress', lang)}:{' '}
              {standards.length > 0 && !standardStepDone ? 'Standartlar' : `${currentQuestion + 1} / ${questions.length}`}
            </span>
            <span>%{standards.length > 0 && !standardStepDone ? 0 : progress} {t('completedLower', lang)}</span>
          </div>
          <div className="bg-slate-200 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-[var(--brand)] h-full transition-all duration-300"
              style={{ width: `${standards.length > 0 && !standardStepDone ? 0 : progress}%` }}
            />
          </div>
        </div>

        {standards.length > 0 && !standardStepDone ? (
          <Card className="mb-6">
            <CardHeader className="border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <Badge variant="info" className="mb-2">🌍 {t('mandatoryStep', lang)}</Badge>
                  <CardTitle className="text-lg">{t('internationalStandards', lang)}</CardTitle>
                </div>
                <Badge variant="info">{standards.length} standart</Badge>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-[var(--muted)]">
                {t('standardsHelp', lang)}
              </p>

              <div className="text-sm text-[var(--muted)] mb-3">
                {lang === 'tr' ? `En fazla ${MAX_SELECTION} seçenek işaretleyebilirsiniz. (0 puan / Bilgim yok puanlamaya dahil edilmez.)` : lang === 'fr' ? `Vous pouvez sélectionner au maximum ${MAX_SELECTION} choix. (0 point / Je ne sais pas n'est pas inclus dans le score.)` : `You can select up to ${MAX_SELECTION} choices. (0 score / I don't know is excluded from scoring.)`}
              </div>
              <div className="space-y-3">
                {standards.map((s) => {
                  const val = standardScores[s.id]?.score || 0
                  const rationale = standardScores[s.id]?.rationale || ''
                  return (
                    <div key={s.id} className="border border-[var(--border)] rounded-2xl p-4 bg-[var(--surface)]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--foreground)]">
                            {s.code ? `${s.code} — ` : ''}{s.title}
                          </div>
                          {s.description ? (
                            <div className="text-sm text-[var(--muted)] mt-1">{s.description}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() =>
                                setStandardScores((prev) => ({
                                  ...prev,
                                  [s.id]: { score: n, rationale: prev[s.id]?.rationale || '' },
                                }))
                              }
                              className={`w-10 h-10 rounded-xl border text-sm font-semibold transition-colors ${
                                val === n
                                  ? 'bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--foreground)]'
                                  : 'bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-2)]'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3">
                        <textarea
                          value={rationale}
                          onChange={(e) =>
                            setStandardScores((prev) => ({
                              ...prev,
                              [s.id]: { score: prev[s.id]?.score || 0, rationale: e.target.value },
                            }))
                          }
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-xl bg-[var(--surface)] text-sm"
                          rows={2}
                          placeholder={t('optionalRationale', lang)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardBody>
          </Card>
        ) : (
          <Card className="mb-6">
            <CardHeader className="border-b border-gray-100">
              <div>
                <div className="mb-3">
                  <div className="text-base font-extrabold text-slate-900">
                    {pickLangText(lang, currentMain?.name, currentMain?.name_en, currentMain?.name_fr)}
                  </div>
                  <div className="text-sm font-bold text-slate-800 mt-1">
                    {pickLangText(lang, currentCat?.name, currentCat?.name_en, currentCat?.name_fr)}
                  </div>
                </div>
                <CardTitle className="text-lg">{t('question', lang)} {currentQuestion + 1}</CardTitle>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-gray-900 text-lg mb-6">
                {pickLangText(lang, currentQ?.text, currentQ?.text_en, currentQ?.text_fr)}
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentAnswers.map((answer) => {
                  const isSelected = selectedAnswers.includes(answer.id)
                  return (
                    <button
                      key={answer.id}
                      onClick={() => handleAnswerSelect(currentQ.id, answer)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected 
                          ? 'border-[var(--border)] bg-[var(--brand-soft)] text-slate-900' 
                          : 'border-gray-200 hover:border-[var(--border)] hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                        }`}>
                          {isSelected && <Check className="w-4 h-4 text-white" />}
                        </div>
                        <span className="flex-1">
                          {pickLangText(lang, answer.text, answer.text_en, answer.text_fr)}
                        </span>
                        {isSelected && (
                          <Badge variant="info" className="ml-2">{t('selected', lang)}</Badge>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Bottom fixed action bar (prevents losing buttons on long screens) */}
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-white/90 backdrop-blur">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => setCurrentQuestion((prev) => Math.max(0, prev - 1))}
              disabled={currentQuestion === 0 || (standards.length > 0 && !standardStepDone)}
            >
              <ChevronLeft className="w-5 h-5" />
              {t('previous', lang)}
            </Button>

            {standards.length > 0 && !standardStepDone ? (
              <Button
                onClick={() => {
                  const missing = standards.filter((s) => !standardScores[s.id] || !standardScores[s.id].score)
                  if (missing.length > 0) {
                    toast('Tüm standartları puanlamalısınız.', 'error')
                    return
                  }
                  setStandardStepDone(true)
                }}
              >
                {t('continue', lang)}
                <ChevronRight className="w-5 h-5" />
              </Button>
            ) : currentQuestion === questions.length - 1 ? (
              <Button variant="success" onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {t('submit', lang)}
                    <Check className="w-5 h-5" />
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={() => setCurrentQuestion((prev) => Math.min(questions.length - 1, prev + 1))}>
                {t('next', lang)}
                <ChevronRight className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Question Navigator */}
        {standards.length > 0 && !standardStepDone ? null : (
        <div className="mt-8">
          <p className="text-white/60 text-sm text-center mb-3">{t('quickNav', lang)}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {questions.map((q, idx) => {
              const isAnswered = responses[q.id] && responses[q.id].length > 0
              const isCurrent = idx === currentQuestion
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestion(idx)}
                  className={`w-10 h-10 rounded-lg font-medium text-sm transition-all ${
                    isCurrent 
                      ? 'bg-amber-500 text-white' 
                      : isAnswered 
                        ? 'bg-emerald-500 text-white' 
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  {idx + 1}
                </button>
              )
            })}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
