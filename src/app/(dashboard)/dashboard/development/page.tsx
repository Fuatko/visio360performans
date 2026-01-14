'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge, Button } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { 
  Target, TrendingUp, TrendingDown, Lightbulb, BookOpen, 
  CheckCircle, Clock, Loader2, ArrowUp, ArrowDown, Minus
} from 'lucide-react'
import { RequireSelection } from '@/components/kvkk/require-selection'

interface CategoryScore {
  name: string
  selfScore: number
  peerScore: number
  gap: number
}

interface DevelopmentPlan {
  strengths: CategoryScore[]
  improvements: CategoryScore[]
  recommendations: string[]
}

export default function DevelopmentPage() {
  const { user } = useAuthStore()
  const [plan, setPlan] = useState<DevelopmentPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodName, setPeriodName] = useState('')
  const [periodOptions, setPeriodOptions] = useState<{ id: string; name: string }[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')

  useEffect(() => {
    if (user) loadPeriods()
  }, [user])

  const loadPeriods = async () => {
    if (!user) return

    try {
      // En son tamamlanmış dönemin sonuçlarını al
      const { data: assignments } = await supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(name),
          evaluation_periods(id, name)
        `)
        .eq('target_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })

      if (!assignments || assignments.length === 0) {
        setPeriodOptions([])
        setSelectedPeriodId('')
        setPeriodName('')
        setPlan(null)
        setLoading(false)
        return
      }

      const uniq: { id: string; name: string }[] = []
      const seen = new Set<string>()
      assignments.forEach((a: any) => {
        const pid = a.evaluation_periods?.id
        const pname = a.evaluation_periods?.name
        if (!pid || !pname) return
        if (seen.has(pid)) return
        seen.add(pid)
        uniq.push({ id: pid, name: pname })
      })
      setPeriodOptions(uniq)
      setSelectedPeriodId('')
      setPeriodName('')
      setPlan(null)
      setLoading(false)
      return

    } catch (error) {
      console.error('Development plan error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadDevelopmentPlanForPeriod = async (periodId: string) => {
    if (!user) return
    setLoading(true)
    try {
      const { data: assignments } = await supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(name),
          evaluation_periods(id, name)
        `)
        .eq('target_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })

      const periodAssignments = (assignments || []).filter((a: any) => a.evaluation_periods?.id === periodId)
      setPeriodName(periodAssignments[0]?.evaluation_periods?.name || '')

      if (periodAssignments.length === 0) {
        setPlan(null)
        return
      }

      const assignmentIds = periodAssignments.map((a: any) => a.id)
      const { data: responses } = await supabase
        .from('evaluation_responses')
        .select('*')
        .in('assignment_id', assignmentIds)

      const selfScores: Record<string, { total: number; count: number }> = {}
      const peerScores: Record<string, { total: number; count: number }> = {}

      periodAssignments.forEach((assignment: any) => {
        const isSelf = assignment.evaluator_id === assignment.target_id
        const assignmentResponses = (responses || []).filter(r => r.assignment_id === assignment.id)

        assignmentResponses.forEach((resp: any) => {
          const catName = resp.category_name || 'Genel'
          const score = resp.reel_score || resp.std_score || 0

          if (isSelf) {
            if (!selfScores[catName]) selfScores[catName] = { total: 0, count: 0 }
            selfScores[catName].total += score
            selfScores[catName].count++
          } else {
            if (!peerScores[catName]) peerScores[catName] = { total: 0, count: 0 }
            peerScores[catName].total += score
            peerScores[catName].count++
          }
        })
      })

      // Kategori skorlarını birleştir
      const allCategories = new Set([...Object.keys(selfScores), ...Object.keys(peerScores)])
      const categoryScores: CategoryScore[] = []

      allCategories.forEach(catName => {
        const selfAvg = selfScores[catName] 
          ? Math.round((selfScores[catName].total / selfScores[catName].count) * 10) / 10 
          : 0
        const peerAvg = peerScores[catName] 
          ? Math.round((peerScores[catName].total / peerScores[catName].count) * 10) / 10 
          : 0
        
        categoryScores.push({
          name: catName,
          selfScore: selfAvg,
          peerScore: peerAvg,
          gap: Math.round((selfAvg - peerAvg) * 10) / 10
        })
      })

      // Güçlü yönler (peer score >= 3.5)
      const strengths = categoryScores
        .filter(c => c.peerScore >= 3.5)
        .sort((a, b) => b.peerScore - a.peerScore)

      // Gelişim alanları (peer score < 3.5)
      const improvements = categoryScores
        .filter(c => c.peerScore < 3.5)
        .sort((a, b) => a.peerScore - b.peerScore)

      // Önerileri oluştur
      const recommendations: string[] = []
      
      // Gap analizi
      const overconfident = categoryScores.filter(c => c.gap > 0.5)
      const underconfident = categoryScores.filter(c => c.gap < -0.5)

      if (overconfident.length > 0) {
        recommendations.push(
          `"${overconfident[0].name}" alanında kendinizi değerlendirmeniz, diğerlerinin değerlendirmesinden daha yüksek. Bu alanda farkındalığınızı artırmanız önerilir.`
        )
      }

      if (underconfident.length > 0) {
        recommendations.push(
          `"${underconfident[0].name}" alanında potansiyelinizi yeterince fark etmiyorsunuz. Diğerleri sizi daha yüksek değerlendiriyor.`
        )
      }

      if (improvements.length > 0) {
        improvements.slice(0, 2).forEach(imp => {
          recommendations.push(
            `"${imp.name}" alanında gelişim göstermeniz gerekiyor. Bu konuda eğitim veya mentorluk desteği alabilirsiniz.`
          )
        })
      }

      if (strengths.length > 0) {
        recommendations.push(
          `"${strengths[0].name}" alanında güçlüsünüz. Bu yetkinliğinizi takım arkadaşlarınıza aktararak liderlik gösterebilirsiniz.`
        )
      }

      setPlan({
        strengths,
        improvements,
        recommendations
      })

    } catch (error) {
      console.error('Development plan error:', error)
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }

  const getGapIcon = (gap: number) => {
    if (gap > 0.3) return <ArrowUp className="w-4 h-4 text-amber-500" />
    if (gap < -0.3) return <ArrowDown className="w-4 h-4 text-blue-500" />
    return <Minus className="w-4 h-4 text-gray-400" />
  }

  const getGapLabel = (gap: number) => {
    if (gap > 0.5) return 'Aşırı Özgüven'
    if (gap > 0.3) return 'Hafif Yüksek'
    if (gap < -0.5) return 'Düşük Özgüven'
    if (gap < -0.3) return 'Hafif Düşük'
    return 'Uyumlu'
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🎯 Gelişim Planım</h1>
        <p className="text-gray-500 mt-1">Kişisel gelişim önerileri ve eylem planı</p>
      </div>

      {periodOptions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>📅 Dönem Seçimi</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {periodOptions.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedPeriodId(p.id); loadDevelopmentPlanForPeriod(p.id) }}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  selectedPeriodId === p.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p.name}
              </button>
            ))}
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : periodOptions.length > 0 && !selectedPeriodId ? (
        <RequireSelection enabled={true} message="KVKK için: önce dönem seçmelisiniz.">
          <div />
        </RequireSelection>
      ) : !plan ? (
        <Card>
          <CardBody className="py-12 text-center text-gray-500">
            <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Henüz değerlendirme sonucu yok</p>
            <p className="text-sm mt-2">Değerlendirmeler tamamlandığında gelişim planınız oluşturulacak</p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Period Badge */}
          <div className="mb-6">
            <Badge variant="info" className="text-sm px-4 py-2">
              📅 {periodName} Dönemi Analizi
            </Badge>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Strengths */}
            <Card>
              <CardHeader className="bg-emerald-50 border-b border-emerald-100">
                <CardTitle className="flex items-center gap-2 text-emerald-700">
                  <TrendingUp className="w-5 h-5" />
                  Güçlü Yönlerim
                </CardTitle>
                <Badge variant="success">{plan.strengths.length} alan</Badge>
              </CardHeader>
              <CardBody>
                {plan.strengths.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Henüz güçlü alan belirlenmedi</p>
                ) : (
                  <div className="space-y-4">
                    {plan.strengths.map((cat, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 font-semibold text-sm">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{cat.name}</p>
                            <p className="text-xs text-gray-500">
                              Öz: {cat.selfScore} | Peer: {cat.peerScore}
                            </p>
                          </div>
                        </div>
                        <Badge variant="success">{cat.peerScore}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Improvements */}
            <Card>
              <CardHeader className="bg-amber-50 border-b border-amber-100">
                <CardTitle className="flex items-center gap-2 text-amber-700">
                  <TrendingDown className="w-5 h-5" />
                  Gelişim Alanlarım
                </CardTitle>
                <Badge variant="warning">{plan.improvements.length} alan</Badge>
              </CardHeader>
              <CardBody>
                {plan.improvements.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Tüm alanlarda iyi performans gösteriyorsunuz! 🎉</p>
                ) : (
                  <div className="space-y-4">
                    {plan.improvements.map((cat, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 font-semibold text-sm">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{cat.name}</p>
                            <p className="text-xs text-gray-500">
                              Öz: {cat.selfScore} | Peer: {cat.peerScore}
                            </p>
                          </div>
                        </div>
                        <Badge variant="warning">{cat.peerScore}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Gap Analysis */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-600" />
                Öz-Değerlendirme Gap Analizi
              </CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-500 mb-4">
                Kendinizi nasıl gördüğünüz ile başkalarının sizi nasıl gördüğü arasındaki fark
              </p>
              <div className="space-y-3">
                {[...plan.strengths, ...plan.improvements].map((cat, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{cat.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Gap: {cat.gap > 0 ? '+' : ''}{cat.gap}</span>
                      {getGapIcon(cat.gap)}
                    </div>
                    <Badge variant={Math.abs(cat.gap) > 0.5 ? 'warning' : 'gray'}>
                      {getGapLabel(cat.gap)}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader className="bg-blue-50 border-b border-blue-100">
              <CardTitle className="flex items-center gap-2 text-blue-700">
                <Lightbulb className="w-5 h-5" />
                Gelişim Önerileri
              </CardTitle>
            </CardHeader>
            <CardBody>
              {plan.recommendations.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Öneri oluşturulacak yeterli veri yok</p>
              ) : (
                <div className="space-y-4">
                  {plan.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex gap-4 p-4 bg-blue-50 rounded-xl">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-4 h-4 text-blue-600" />
                      </div>
                      <p className="text-gray-700">{rec}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Action Items */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                Eylem Planı
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {plan.improvements.slice(0, 3).map((imp, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl">
                    <div className="w-6 h-6 border-2 border-gray-300 rounded-full flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {imp.name} alanında gelişim sağla
                      </p>
                      <p className="text-sm text-gray-500">
                        Hedef: {imp.peerScore} → {Math.min(5, imp.peerScore + 1).toFixed(1)}
                      </p>
                    </div>
                    <Badge variant="gray">
                      <Clock className="w-3 h-3 mr-1" />
                      3 ay
                    </Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
