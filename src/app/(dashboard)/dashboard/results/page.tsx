'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { BarChart3, TrendingUp, Users, Target, Award, Loader2 } from 'lucide-react'

interface EvaluationResult {
  evaluatorName: string
  isSelf: boolean
  avgScore: number
  categories: { name: string; score: number }[]
  completedAt: string
}

interface PeriodResult {
  periodId: string
  periodName: string
  overallAvg: number
  selfScore: number
  peerAvg: number
  evaluations: EvaluationResult[]
  categoryAverages: { name: string; score: number }[]
  categoryCompare: { name: string; self: number; peer: number; diff: number }[]
  swot: {
    self: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
    peer: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
  }
}

export default function UserResultsPage() {
  const { user } = useAuthStore()
  const [results, setResults] = useState<PeriodResult[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)

  useEffect(() => {
    if (user) loadResults()
  }, [user])

  const loadResults = async () => {
    if (!user) return

    try {
      // Benim için yapılan tamamlanmış değerlendirmeleri getir
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
        setResults([])
        setLoading(false)
        return
      }

      // Yanıtları getir
      const assignmentIds = assignments.map(a => a.id)
      const { data: responses } = await supabase
        .from('evaluation_responses')
        .select('*')
        .in('assignment_id', assignmentIds)

      // Dönem bazlı grupla
      const periodMap: Record<string, PeriodResult> = {}

      assignments.forEach((assignment: any) => {
        const periodId = assignment.evaluation_periods?.id
        const periodName = assignment.evaluation_periods?.name || '-'
        
        if (!periodId) return

        if (!periodMap[periodId]) {
          periodMap[periodId] = {
            periodId,
            periodName,
            overallAvg: 0,
            selfScore: 0,
            peerAvg: 0,
            evaluations: [],
            categoryAverages: [],
            categoryCompare: [],
            swot: {
              self: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
              peer: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
            }
          }
        }

        // Bu atamaya ait yanıtları bul
        const assignmentResponses = (responses || []).filter(r => r.assignment_id === assignment.id)
        
        // Kategori bazlı skorları hesapla
        const categoryScores: Record<string, { total: number; count: number }> = {}
        let totalScore = 0
        let totalCount = 0

        assignmentResponses.forEach((resp: any) => {
          const catName = resp.category_name || 'Genel'
          if (!categoryScores[catName]) {
            categoryScores[catName] = { total: 0, count: 0 }
          }
          categoryScores[catName].total += resp.reel_score || resp.std_score || 0
          categoryScores[catName].count++
          totalScore += resp.reel_score || resp.std_score || 0
          totalCount++
        })

        const categories = Object.entries(categoryScores).map(([name, data]) => ({
          name,
          score: data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0
        }))

        const avgScore = totalCount > 0 ? Math.round((totalScore / totalCount) * 10) / 10 : 0
        const isSelf = assignment.evaluator_id === assignment.target_id

        periodMap[periodId].evaluations.push({
          evaluatorName: assignment.evaluator?.name || '-',
          isSelf,
          avgScore,
          categories,
          completedAt: assignment.completed_at
        })
      })

      // Her dönem için genel ortalamaları hesapla
      Object.values(periodMap).forEach(period => {
        const selfEval = period.evaluations.find(e => e.isSelf)
        const peerEvals = period.evaluations.filter(e => !e.isSelf)
        
        period.selfScore = selfEval?.avgScore || 0
        period.peerAvg = peerEvals.length > 0 
          ? Math.round((peerEvals.reduce((sum, e) => sum + e.avgScore, 0) / peerEvals.length) * 10) / 10 
          : 0
        period.overallAvg = Math.round(
          ((period.selfScore * 0.3) + (period.peerAvg * 0.7)) * 10
        ) / 10 || period.peerAvg || period.selfScore

        // Kategori ortalamalarını hesapla
        const allCategories: Record<string, { total: number; count: number }> = {}
        period.evaluations.forEach(e => {
          e.categories.forEach(cat => {
            if (!allCategories[cat.name]) {
              allCategories[cat.name] = { total: 0, count: 0 }
            }
            allCategories[cat.name].total += cat.score
            allCategories[cat.name].count++
          })
        })

        period.categoryAverages = Object.entries(allCategories)
          .map(([name, data]) => ({
            name,
            score: Math.round((data.total / data.count) * 10) / 10
          }))
          .sort((a, b) => b.score - a.score)

        // Öz vs Ekip kategori karşılaştırması + SWOT (eski HTML mantığı)
        const selfAgg: Record<string, { total: number; count: number }> = {}
        const peerAgg: Record<string, { total: number; count: number }> = {}

        period.evaluations.forEach(e => {
          e.categories.forEach(cat => {
            if (e.isSelf) {
              if (!selfAgg[cat.name]) selfAgg[cat.name] = { total: 0, count: 0 }
              selfAgg[cat.name].total += cat.score
              selfAgg[cat.name].count++
            } else {
              if (!peerAgg[cat.name]) peerAgg[cat.name] = { total: 0, count: 0 }
              peerAgg[cat.name].total += cat.score
              peerAgg[cat.name].count++
            }
          })
        })

        const catNames = new Set([...Object.keys(selfAgg), ...Object.keys(peerAgg)])
        period.categoryCompare = Array.from(catNames).map((name) => {
          const self = selfAgg[name] ? Math.round((selfAgg[name].total / selfAgg[name].count) * 10) / 10 : 0
          const peer = peerAgg[name] ? Math.round((peerAgg[name].total / peerAgg[name].count) * 10) / 10 : 0
          const diff = Math.round((self - peer) * 10) / 10
          return { name, self, peer, diff }
        }).sort((a, b) => b.peer - a.peer)

        const mkSwot = (items: { name: string; score: number }[]) => {
          const strengths = items.filter(i => i.score >= 3.5).sort((a, b) => b.score - a.score)
          const weaknesses = items.filter(i => i.score > 0 && i.score < 2.5).sort((a, b) => a.score - b.score)
          const opportunities = items.filter(i => i.score >= 2.5 && i.score < 3.5).sort((a, b) => b.score - a.score)
          const recommendations: string[] = []
          if (weaknesses[0]) recommendations.push(`"${weaknesses[0].name}" alanı için eğitim/mentorluk planlanmalı.`)
          if (weaknesses[1]) recommendations.push(`"${weaknesses[1].name}" alanında düzenli pratik/geri bildirim döngüsü oluşturulmalı.`)
          if (!weaknesses.length && opportunities[0]) recommendations.push(`"${opportunities[0].name}" alanı geliştirilebilir (hedef: 3.5+).`)
          return { strengths, weaknesses, opportunities, recommendations }
        }

        const selfItems = period.categoryCompare.map(c => ({ name: c.name, score: c.self }))
        const peerItems = period.categoryCompare.map(c => ({ name: c.name, score: c.peer }))
        period.swot = {
          self: mkSwot(selfItems),
          peer: mkSwot(peerItems),
        }
      })

      setResults(Object.values(periodMap))
      if (Object.values(periodMap).length > 0) {
        setSelectedPeriod(Object.values(periodMap)[0].periodId)
      }

    } catch (error) {
      console.error('Results error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-emerald-600'
    if (score >= 3) return 'text-blue-600'
    if (score >= 2) return 'text-amber-600'
    return 'text-red-600'
  }

  const getScoreBadge = (score: number): 'success' | 'info' | 'warning' | 'danger' => {
    if (score >= 4) return 'success'
    if (score >= 3) return 'info'
    if (score >= 2) return 'warning'
    return 'danger'
  }

  const selectedResult = results.find(r => r.periodId === selectedPeriod)

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📊 Sonuçlarım</h1>
        <p className="text-gray-500 mt-1">Performans değerlendirme sonuçlarınız</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : results.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Henüz tamamlanmış değerlendirme sonucu yok</p>
            <p className="text-sm mt-2">Değerlendirmeler tamamlandığında sonuçlarınız burada görünecek</p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Period Selector */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {results.map(period => (
              <button
                key={period.periodId}
                onClick={() => setSelectedPeriod(period.periodId)}
                className={`px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${
                  selectedPeriod === period.periodId
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {period.periodName}
              </button>
            ))}
          </div>

          {selectedResult && (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-5 rounded-2xl text-white">
                  <Award className="w-6 h-6 opacity-80 mb-2" />
                  <div className="text-3xl font-bold">{selectedResult.overallAvg}</div>
                  <div className="text-sm opacity-80">Genel Ortalama</div>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-2xl text-white">
                  <Target className="w-6 h-6 opacity-80 mb-2" />
                  <div className="text-3xl font-bold">{selectedResult.selfScore || '-'}</div>
                  <div className="text-sm opacity-80">Öz Değerlendirme</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-2xl text-white">
                  <Users className="w-6 h-6 opacity-80 mb-2" />
                  <div className="text-3xl font-bold">{selectedResult.peerAvg || '-'}</div>
                  <div className="text-sm opacity-80">Peer Ortalama</div>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-2xl text-white">
                  <TrendingUp className="w-6 h-6 opacity-80 mb-2" />
                  <div className="text-3xl font-bold">{selectedResult.evaluations.length}</div>
                  <div className="text-sm opacity-80">Değerlendirme Sayısı</div>
                </div>
              </div>

              {/* Category Scores */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>📈 Kategori Bazlı Sonuçlar</CardTitle>
                </CardHeader>
                <CardBody>
                  <div className="space-y-4">
                    {selectedResult.categoryAverages.map((cat, idx) => (
                      <div key={idx}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-700">{cat.name}</span>
                          <Badge variant={getScoreBadge(cat.score)}>{cat.score}</Badge>
                        </div>
                        <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              cat.score >= 4 ? 'bg-emerald-500' :
                              cat.score >= 3 ? 'bg-blue-500' :
                              cat.score >= 2 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${(cat.score / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              {/* SWOT + Detaylı Karşılaştırma */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>🎯 SWOT Analizi & Detaylı Karşılaştırma</CardTitle>
                </CardHeader>
                <CardBody className="space-y-6">
                  {/* Detaylı tablo */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">📋 Kategori Bazlı Detaylı Karşılaştırma</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="text-left py-3 px-4 font-semibold text-gray-600">Kategori</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-600">🔵 Öz (5)</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-600">🔵 Öz (%)</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-600">🟢 Ekip (5)</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-600">🟢 Ekip (%)</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-600">Fark</th>
                            <th className="text-center py-3 px-4 font-semibold text-gray-600">Durum</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedResult.categoryCompare.map((c) => {
                            const status =
                              c.self === 0 ? { label: 'Öz yok', variant: 'gray' as const } :
                              c.peer === 0 ? { label: 'Ekip yok', variant: 'gray' as const } :
                              c.diff > 0.5 ? { label: 'Yüksek görüyor', variant: 'warning' as const } :
                              c.diff < -0.5 ? { label: 'Düşük görüyor', variant: 'danger' as const } :
                              { label: 'Tutarlı', variant: 'success' as const }
                            return (
                              <tr key={c.name}>
                                <td className="py-3 px-4 font-medium text-gray-900">{c.name}</td>
                                <td className="py-3 px-4 text-center">{c.self ? c.self.toFixed(1) : '-'}</td>
                                <td className="py-3 px-4 text-center text-blue-600 font-semibold">{c.self ? `${Math.round((c.self / 5) * 100)}%` : '-'}</td>
                                <td className="py-3 px-4 text-center">{c.peer ? c.peer.toFixed(1) : '-'}</td>
                                <td className="py-3 px-4 text-center text-emerald-600 font-semibold">{c.peer ? `${Math.round((c.peer / 5) * 100)}%` : '-'}</td>
                                <td className="py-3 px-4 text-center font-semibold">{(c.self && c.peer) ? `${c.diff > 0 ? '+' : ''}${c.diff.toFixed(1)}` : '-'}</td>
                                <td className="py-3 px-4 text-center">
                                  <Badge variant={status.variant}>{status.label}</Badge>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SWOT */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="border border-blue-200 rounded-2xl p-4">
                      <h3 className="font-semibold text-blue-700 mb-4 text-center">🔵 ÖZ DEĞERLENDİRME SWOT</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                          <div className="font-semibold text-emerald-700 mb-2">💪 Güçlü Yönler</div>
                          {selectedResult.swot.self.strengths.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.self.strengths.slice(0, 6).map(s => (
                                <div key={s.name}>✓ {s.name} <span className="font-semibold">({s.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-gray-500 italic">Belirgin güçlü yön tespit edilmedi</div>}
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                          <div className="font-semibold text-red-700 mb-2">⚠️ Gelişim Alanları</div>
                          {selectedResult.swot.self.weaknesses.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.self.weaknesses.slice(0, 6).map(w => (
                                <div key={w.name}>• {w.name} <span className="font-semibold">({w.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-gray-500 italic">Belirgin gelişim alanı tespit edilmedi</div>}
                        </div>
                        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                          <div className="font-semibold text-sky-700 mb-2">🚀 Fırsatlar</div>
                          {selectedResult.swot.self.opportunities.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.self.opportunities.slice(0, 6).map(o => (
                                <div key={o.name}>→ {o.name} <span className="font-semibold">({o.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-gray-500 italic">Orta seviye alan bulunmuyor</div>}
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <div className="font-semibold text-amber-700 mb-2">📝 Öneriler</div>
                          {selectedResult.swot.self.recommendations.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.self.recommendations.slice(0, 4).map((r, idx) => (
                                <div key={idx}>• {r}</div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-gray-500 italic">Öneri yok</div>}
                        </div>
                      </div>
                    </div>

                    <div className="border border-emerald-200 rounded-2xl p-4">
                      <h3 className="font-semibold text-emerald-700 mb-4 text-center">🟢 EKİP DEĞERLENDİRME SWOT</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                          <div className="font-semibold text-emerald-700 mb-2">💪 Güçlü Yönler</div>
                          {selectedResult.swot.peer.strengths.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.peer.strengths.slice(0, 6).map(s => (
                                <div key={s.name}>✓ {s.name} <span className="font-semibold">({s.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-gray-500 italic">Belirgin güçlü yön tespit edilmedi</div>}
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                          <div className="font-semibold text-red-700 mb-2">⚠️ Gelişim Alanları</div>
                          {selectedResult.swot.peer.weaknesses.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.peer.weaknesses.slice(0, 6).map(w => (
                                <div key={w.name}>• {w.name} <span className="font-semibold">({w.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-gray-500 italic">Belirgin gelişim alanı tespit edilmedi</div>}
                        </div>
                        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                          <div className="font-semibold text-sky-700 mb-2">🚀 Fırsatlar</div>
                          {selectedResult.swot.peer.opportunities.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.peer.opportunities.slice(0, 6).map(o => (
                                <div key={o.name}>→ {o.name} <span className="font-semibold">({o.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-gray-500 italic">Orta seviye alan bulunmuyor</div>}
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <div className="font-semibold text-amber-700 mb-2">📝 Öneriler</div>
                          {selectedResult.swot.peer.recommendations.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.peer.recommendations.slice(0, 4).map((r, idx) => (
                                <div key={idx}>• {r}</div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-gray-500 italic">Öneri yok</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* Individual Evaluations */}
              <Card>
                <CardHeader>
                  <CardTitle>👥 Değerlendirme Detayları</CardTitle>
                  <Badge variant="info">{selectedResult.evaluations.length} değerlendirme</Badge>
                </CardHeader>
                <CardBody className="p-0">
                  <div className="divide-y divide-gray-100">
                    {selectedResult.evaluations.map((eval_, idx) => (
                      <div key={idx} className="px-6 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              eval_.isSelf ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {eval_.isSelf ? '🔵' : '👤'}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {eval_.isSelf ? 'Öz Değerlendirme' : eval_.evaluatorName}
                              </p>
                              <p className="text-sm text-gray-500">
                                {new Date(eval_.completedAt).toLocaleDateString('tr-TR')}
                              </p>
                            </div>
                          </div>
                          <Badge variant={getScoreBadge(eval_.avgScore)} className="text-lg px-4 py-1">
                            {eval_.avgScore}
                          </Badge>
                        </div>
                        
                        {eval_.categories.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                            {eval_.categories.map((cat, catIdx) => (
                              <div 
                                key={catIdx} 
                                className="bg-gray-50 px-3 py-2 rounded-lg flex items-center justify-between"
                              >
                                <span className="text-xs text-gray-600 truncate">{cat.name}</span>
                                <span className={`text-sm font-semibold ${getScoreColor(cat.score)}`}>
                                  {cat.score}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
