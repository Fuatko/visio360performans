'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, toast, ToastContainer } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ChevronRight, ChevronLeft, Check, Loader2, User, Target } from 'lucide-react'

interface Question {
  id: string
  text: string
  order_num: number
  category_id: string
  categories: {
    name: string
    main_categories: { name: string }
  }
}

interface Answer {
  id: string
  question_id: string
  text: string
  std_score: number
  reel_score: number
  order_num: number
}

interface Assignment {
  id: string
  evaluator_id: string
  target_id: string
  status: string
  evaluator: { name: string }
  target: { name: string; department: string }
  evaluation_periods: { name: string }
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

  useEffect(() => {
    loadData()
  }, [slug])

  const loadData = async () => {
    try {
      // Atamayı bul (slug veya id ile)
      let assignQuery = supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(name),
          target:target_id(name, department),
          evaluation_periods(name, status)
        `)

      // Önce slug ile dene
      let { data: assignData } = await assignQuery.eq('slug', slug).single()
      
      // Slug bulunamazsa ID ile dene
      if (!assignData) {
        const { data } = await assignQuery.eq('id', slug).single()
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

      // Soruları getir (aktif ana kategorilerden)
      const { data: questionsData } = await supabase
        .from('questions')
        .select(`
          *,
          categories(
            name,
            main_categories(name, status)
          )
        `)
        .order('order_num')

      // Sadece aktif kategorilerdeki soruları filtrele
      const activeQuestions = (questionsData || []).filter(
        (q: any) => q.categories?.main_categories?.status === 'active'
      ) as Question[]

      setQuestions(activeQuestions)

      // Her soru için cevapları getir
      const questionIds = activeQuestions.map(q => q.id)
      const { data: answersData } = await supabase
        .from('answers')
        .select('*')
        .in('question_id', questionIds)
        .order('order_num')

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
          category_name: q.categories?.name || null
        }
      })

      const { error: respError } = await supabase
        .from('evaluation_responses')
        .insert(responsesToInsert)

      if (respError) throw respError

      // Atamayı tamamlandı olarak işaretle
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

    } catch (error: any) {
      console.error('Submit error:', error)
      toast(error.message || 'Kayıt hatası', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const currentQ = questions[currentQuestion]
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
            <p className="text-gray-500">Değerlendirme bulunamadı veya soru yok</p>
            <Button className="mt-4" onClick={() => router.push('/dashboard/evaluations')}>
              Geri Dön
            </Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 py-8 px-4">
      <ToastContainer />
      
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl shadow-lg mb-4">
            <span className="text-xl font-bold text-slate-900">V</span>
          </div>
          <h1 className="text-2xl font-bold text-white">VISIO 360°</h1>
          <p className="text-blue-200 mt-1">{assignment.evaluation_periods?.name}</p>
        </div>

        {/* Target Info */}
        <Card className="mb-6">
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                  isSelf ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                }`}>
                  {isSelf ? <User className="w-7 h-7" /> : <Target className="w-7 h-7" />}
                </div>
                <div>
                  <p className="text-sm text-gray-500">
                    {isSelf ? 'Öz Değerlendirme' : 'Değerlendirilen Kişi'}
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
                  {isSelf ? '🔵 Öz Değerlendirme' : '👥 Peer Değerlendirme'}
                </Badge>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-white text-sm mb-2">
            <span>İlerleme: {currentQuestion + 1} / {questions.length}</span>
            <span>%{progress} tamamlandı</span>
          </div>
          <div className="bg-white/20 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-amber-400 to-amber-500 h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <Card className="mb-6">
          <CardHeader className="border-b border-gray-100">
            <div>
              <Badge variant="gray" className="mb-2">
                {currentQ?.categories?.main_categories?.name} › {currentQ?.categories?.name}
              </Badge>
              <CardTitle className="text-lg">Soru {currentQuestion + 1}</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <p className="text-gray-900 text-lg mb-6">{currentQ?.text}</p>
            
            <div className="space-y-3">
              {currentAnswers.map((answer) => {
                const isSelected = selectedAnswers.includes(answer.id)
                return (
                  <button
                    key={answer.id}
                    onClick={() => handleAnswerSelect(currentQ.id, answer.id)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50 text-blue-900' 
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}>
                        {isSelected && <Check className="w-4 h-4 text-white" />}
                      </div>
                      <span className="flex-1">{answer.text}</span>
                      {isSelected && (
                        <Badge variant="info" className="ml-2">Seçildi</Badge>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </CardBody>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
            disabled={currentQuestion === 0}
          >
            <ChevronLeft className="w-5 h-5" />
            Önceki
          </Button>

          {currentQuestion === questions.length - 1 ? (
            <Button
              variant="success"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Gönder
                  <Check className="w-5 h-5" />
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => setCurrentQuestion(prev => Math.min(questions.length - 1, prev + 1))}
            >
              Sonraki
              <ChevronRight className="w-5 h-5" />
            </Button>
          )}
        </div>

        {/* Question Navigator */}
        <div className="mt-8">
          <p className="text-white/60 text-sm text-center mb-3">Hızlı Geçiş</p>
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
      </div>
    </div>
  )
}
