'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, toast, ToastContainer } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ChevronRight, ChevronLeft, Check, Loader2, User, Target } from 'lucide-react'
import { Lang, pickLangText, t } from '@/lib/i18n'

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

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({})
  const [responses, setResponses] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const lang: Lang = (assignment?.evaluator?.preferred_language as Lang) || 'tr'

  const [standards, setStandards] = useState<
    Array<{ id: string; code?: string | null; title: string; description: string | null; sort_order: number }>
  >([])
  const [standardScores, setStandardScores] = useState<Record<string, { score: number; rationale: string }>>({})
  const [standardStepDone, setStandardStepDone] = useState(false)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const loadData = async () => {
    try {
      // Atamayı bul (slug veya id ile)
      // Not: `.single()` 0 satır dönerse PostgREST 406 fırlatır. Bu yüzden `.maybeSingle()` kullanıyoruz.
      const selectAssign = `
          *,
          evaluator:evaluator_id(name, preferred_language),
          target:target_id(name, department),
          evaluation_periods(id, name, status, organization_id)
        `

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)

      // Not: Admin atama eklerken çoğu zaman `slug` alanı boş kalıyor; URL'ye genelde assignment.id gelir.
      // UUID geldiyse önce id ile ararız, sonra slug fallback.
      let assignData: any = null

      if (isUuid) {
        const { data, error } = await supabase
          .from('evaluation_assignments')
          .select(selectAssign)
          .eq('id', slug)
          .maybeSingle()
        if (error) throw error
        assignData = data
      }

      // Slug ile dene
      if (!assignData) {
        const { data, error } = await supabase
          .from('evaluation_assignments')
          .select(selectAssign)
          .eq('slug', slug)
          .maybeSingle()
        if (error) throw error
        assignData = data
      }

      if (!assignData) {
        toast('Değerlendirme bulunamadı', 'error')
        router.push('/dashboard/evaluations')
        return
      }

      if (assignData.status === 'completed') {
        toast('Bu değerlendirme zaten tamamlanmış', 'info')
        router.push('/dashboard/evaluations')
        return
      }

      if (assignData.evaluation_periods?.status !== 'active') {
        toast('Bu değerlendirme dönemi aktif değil', 'error')
        router.push('/dashboard/evaluations')
        return
      }

      setAssignment(assignData as Assignment)

      // Uluslararası standartları getir (org bazlı)
      const orgId = (assignData as any)?.evaluation_periods?.organization_id as string | null | undefined
      if (orgId) {
        const { data: stds, error: stdErr } = await supabase
          .from('international_standards')
          .select('id,code,title,description,sort_order,is_active,created_at')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('sort_order')
          .order('created_at')

        if (stdErr) {
          if ((stdErr as any).code === '42P01') {
            toast('Uluslararası standart tabloları yok. Admin önce SQL dosyasını çalıştırmalı.', 'warning')
          } else {
            toast((stdErr as any).message || 'Uluslararası standartlar yüklenemedi', 'warning')
          }
        }

        const rows = (stds || []).map((s: any) => ({
          id: s.id,
          code: s.code || null,
          title: s.title || '-',
          description: s.description || null,
          sort_order: Number(s.sort_order ?? 0),
        }))
        setStandards(rows)
        setStandardStepDone(rows.length === 0)
      } else {
        setStandards([])
        setStandardStepDone(true)
      }

      // Soruları getir (aktif ana kategorilerden)
      // Not: Bazı DB şemalarında questions.category_id -> categories, bazılarında -> question_categories FK'idir.
      // Ayrıca sıralama kolonu order_num veya sort_order olabilir.
      const orderCols = ['sort_order', 'order_num'] as const

      const fetchQuestions = async (mode: 'question_categories' | 'categories') => {
        const select =
          mode === 'question_categories'
            ? `
            *,
            question_categories:category_id(
              name, name_en, name_fr,
              main_categories(*)
            )
          `
            : `
            *,
            categories:category_id(
              name, name_en, name_fr,
              main_categories(*)
            )
          `

        let lastErr: any = null
        for (const col of orderCols) {
          const res = await supabase.from('questions').select(select).order(col)
          if (!res.error) return (res.data || []) as any[]
          const code = (res.error as any)?.code
          const msg = String((res.error as any)?.message || '')
          // 42703: undefined_column -> try the next ordering column
          if (code === '42703' && (msg.includes('order_num') || msg.includes('sort_order'))) {
            lastErr = res.error
            continue
          }
          throw res.error
        }
        if (lastErr) throw lastErr
        return []
      }

      let questionsData: any[] = []
      try {
        questionsData = await fetchQuestions('question_categories')
      } catch {
        questionsData = await fetchQuestions('categories')
      }

      // Sadece aktif ana kategorilerdeki soruları filtrele
      const activeQuestions = (questionsData || []).filter((q: any) => {
        const cat = q.question_categories || q.categories
        const mc: any = cat?.main_categories
        if (!mc) return true
        if (typeof mc.is_active === 'boolean') return mc.is_active
        if (typeof mc.status === 'string') return mc.status === 'active'
        return true
      }) as any[]

      setQuestions(activeQuestions as any)

      // Her soru için cevapları getir
      const questionIds = activeQuestions.map((q) => q.id)

      const fetchAnswers = async () => {
        let lastErr: any = null
        for (const col of ['order_num', 'sort_order'] as const) {
          const res = await supabase
            .from('answers')
            .select('*')
            .in('question_id', questionIds)
            .order(col)
          if (!res.error) return (res.data || []) as any[]
          const code = (res.error as any)?.code
          const msg = String((res.error as any)?.message || '')
          if (code === '42703' && (msg.includes('order_num') || msg.includes('sort_order'))) {
            lastErr = res.error
            continue
          }
          throw res.error
        }
        if (lastErr) throw lastErr
        return []
      }

      const answersData = await fetchAnswers()

      // Cevapları soru bazında grupla
      const answersByQuestion: Record<string, Answer[]> = {}
      ;(answersData || []).forEach((ans: Answer) => {
        if (!answersByQuestion[ans.question_id]) {
          answersByQuestion[ans.question_id] = []
        }
        answersByQuestion[ans.question_id].push(ans)
      })

      setAnswers(answersByQuestion)

    } catch (error) {
      console.error('Load error:', error)
      toast('Veri yüklenirken hata oluştu', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAnswerSelect = (questionId: string, answerId: string) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: [answerId] // Tek cevap
    }))
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
      // Standart skorlarını kaydet (önce)
      if (standards.length > 0) {
        const missing = standards.filter((s) => !standardScores[s.id] || !standardScores[s.id].score)
        if (missing.length > 0) {
          toast('Tüm standartları puanlamalısınız.', 'error')
          setSubmitting(false)
          return
        }

        const payload = standards.map((s) => ({
          assignment_id: assignment.id,
          standard_id: s.id,
          score: Number(standardScores[s.id]?.score || 0),
          justification: (standardScores[s.id]?.rationale || '').trim() || null,
        }))
        const { error: stdSaveErr } = await supabase
          .from('international_standard_scores')
          .upsert(payload, { onConflict: 'assignment_id,standard_id' })
        if (stdSaveErr) {
          if ((stdSaveErr as any).code === '42P01') {
            toast('Uluslararası standart tabloları yok. Admin önce SQL dosyasını çalıştırmalı.', 'error')
          } else {
            toast((stdSaveErr as any).message || 'Uluslararası standartlar kaydedilemedi', 'error')
          }
          return
        }
      }

      // Yanıtları kaydet
      const responsesToInsert = questions.map(q => {
        const selectedAnswerIds = responses[q.id] || []
        const selectedAnswers = (answers[q.id] || []).filter(a => selectedAnswerIds.includes(a.id))
        const avgStd = selectedAnswers.reduce((sum, a) => sum + a.std_score, 0) / selectedAnswers.length || 0
        const avgReel = selectedAnswers.reduce((sum, a) => sum + a.reel_score, 0) / selectedAnswers.length || 0

        return {
          assignment_id: assignment.id,
          question_id: q.id,
          answer_ids: selectedAnswerIds,
          std_score: avgStd,
          reel_score: avgReel,
          category_name: (q as any).question_categories?.name || (q as any).categories?.name || null
        }
      })

      const { error: respError } = await supabase
        .from('evaluation_responses')
        .insert(responsesToInsert)

      if (respError) throw respError

      // Atamayı {t('completedLower', lang)} olarak işaretle
      const { error: assignError } = await supabase
        .from('evaluation_assignments')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', assignment.id)

      if (assignError) throw assignError

      toast('Değerlendirme başarıyla kaydedildi! 🎉', 'success')
      
      setTimeout(() => {
        router.push('/dashboard/evaluations')
      }, 1500)

    } catch (error: unknown) {
      console.error('Submit error:', error)
      const message = error instanceof Error ? error.message : null
      toast(message || 'Kayıt hatası', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const currentQ = questions[currentQuestion]
  const currentCat: any = (currentQ as any)?.question_categories || (currentQ as any)?.categories
  const currentMain: any = currentCat?.main_categories
  const currentAnswers = currentQ ? answers[currentQ.id] || [] : []
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
    <div className="min-h-screen py-8 px-4">
      <ToastContainer />
      
      <div className="max-w-3xl mx-auto">
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
                <Badge variant="gray" className="mb-2">
                  {pickLangText(
                    lang,
                    currentMain?.name,
                    currentMain?.name_en,
                    currentMain?.name_fr
                  )}{' '}
                  ›{' '}
                  {pickLangText(
                    lang,
                    currentCat?.name,
                    currentCat?.name_en,
                    currentCat?.name_fr
                  )}
                </Badge>
                <CardTitle className="text-lg">{t('question', lang)} {currentQuestion + 1}</CardTitle>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-gray-900 text-lg mb-6">
                {pickLangText(lang, currentQ?.text, currentQ?.text_en, currentQ?.text_fr)}
              </p>
              
              <div className="space-y-3">
                {currentAnswers.map((answer) => {
                  const isSelected = selectedAnswers.includes(answer.id)
                  return (
                    <button
                      key={answer.id}
                      onClick={() => handleAnswerSelect(currentQ.id, answer.id)}
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

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
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
            <Button
              variant="success"
              onClick={handleSubmit}
              disabled={submitting}
            >
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
            <Button
              onClick={() => setCurrentQuestion(prev => Math.min(questions.length - 1, prev + 1))}
            >
              {t('next', lang)}
              <ChevronRight className="w-5 h-5" />
            </Button>
          )}
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
