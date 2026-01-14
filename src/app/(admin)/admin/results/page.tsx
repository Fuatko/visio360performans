'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Button, Select, Badge, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { 
  Search, Download, FileText, User, BarChart3, TrendingUp, 
  ChevronDown, ChevronUp, Loader2, Eye 
} from 'lucide-react'

interface ResultData {
  targetId: string
  targetName: string
  targetDept: string
  evaluations: {
    evaluatorId: string
    evaluatorName: string
    isSelf: boolean
    avgScore: number
    categories: { name: string; score: number }[]
  }[]
  overallAvg: number
  selfScore: number
  peerAvg: number
}

export default function ResultsPage() {
  const [periods, setPeriods] = useState<any[]>([])
  const [organizations, setOrganizations] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedOrg, setSelectedOrg] = useState('')
  const [selectedPerson, setSelectedPerson] = useState('')
  
  const [results, setResults] = useState<ResultData[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedPeriod) {
      loadUsers()
    }
  }, [selectedPeriod, selectedOrg])

  const loadInitialData = async () => {
    const [periodsRes, orgsRes] = await Promise.all([
      supabase.from('evaluation_periods').select('*').order('created_at', { ascending: false }),
      supabase.from('organizations').select('*').order('name'),
    ])
    setPeriods(periodsRes.data || [])
    setOrganizations(orgsRes.data || [])
  }

  const loadUsers = async () => {
    let query = supabase.from('users').select('*').eq('status', 'active')
    if (selectedOrg) query = query.eq('organization_id', selectedOrg)
    const { data } = await query.order('name')
    setUsers(data || [])
  }

  const loadResults = async () => {
    if (!selectedPeriod) {
      toast('Dönem seçin', 'error')
      return
    }

    setLoading(true)
    try {
      // Tamamlanmış atamaları getir
      let assignQuery = supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(id, name, department),
          target:target_id(id, name, department)
        `)
        .eq('period_id', selectedPeriod)
        .eq('status', 'completed')

      const { data: assignments } = await assignQuery

      if (!assignments || assignments.length === 0) {
        setResults([])
        toast('Tamamlanmış değerlendirme bulunamadı', 'info')
        setLoading(false)
        return
      }

      // Tüm yanıtları getir
      const assignmentIds = assignments.map(a => a.id)
      const { data: responses } = await supabase
        .from('evaluation_responses')
        .select('*')
        .in('assignment_id', assignmentIds)

      // Kişi bazlı grupla
      const resultMap: Record<string, ResultData> = {}

      assignments.forEach((assignment: any) => {
        const targetId = assignment.target_id
        const targetName = assignment.target?.name || '-'
        const targetDept = assignment.target?.department || '-'
        const evaluatorId = assignment.evaluator_id
        const evaluatorName = assignment.evaluator?.name || '-'
        const isSelf = evaluatorId === targetId

        // Filtre kontrolü
        if (selectedPerson && targetId !== selectedPerson) return
        if (selectedOrg && assignment.target?.organization_id !== selectedOrg) return

        if (!resultMap[targetId]) {
          resultMap[targetId] = {
            targetId,
            targetName,
            targetDept,
            evaluations: [],
            overallAvg: 0,
            selfScore: 0,
            peerAvg: 0
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

        resultMap[targetId].evaluations.push({
          evaluatorId,
          evaluatorName,
          isSelf,
          avgScore,
          categories
        })
      })

      // Genel ortalamaları hesapla
      Object.values(resultMap).forEach(result => {
        const selfEval = result.evaluations.find(e => e.isSelf)
        const peerEvals = result.evaluations.filter(e => !e.isSelf)
        
        result.selfScore = selfEval?.avgScore || 0
        result.peerAvg = peerEvals.length > 0 
          ? Math.round((peerEvals.reduce((sum, e) => sum + e.avgScore, 0) / peerEvals.length) * 10) / 10 
          : 0
        result.overallAvg = Math.round(
          ((result.selfScore * 0.3) + (result.peerAvg * 0.7)) * 10
        ) / 10 || result.peerAvg || result.selfScore
      })

      // Sonuçları sırala
      const sortedResults = Object.values(resultMap).sort((a, b) => b.overallAvg - a.overallAvg)
      setResults(sortedResults)

    } catch (error) {
      console.error('Results error:', error)
      toast('Sonuçlar yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  const exportToExcel = () => {
    if (results.length === 0) {
      toast('Dışa aktarılacak veri yok', 'error')
      return
    }

    // CSV formatında export
    let csv = 'Kişi,Departman,Öz Değerlendirme,Peer Ortalama,Genel Ortalama,Değerlendiren Sayısı\n'
    
    results.forEach(r => {
      csv += `"${r.targetName}","${r.targetDept}",${r.selfScore},${r.peerAvg},${r.overallAvg},${r.evaluations.length}\n`
    })

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sonuclar_${selectedPeriod}.csv`
    a.click()
    URL.revokeObjectURL(url)
    
    toast('Excel dosyası indirildi', 'success')
  }

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-emerald-600'
    if (score >= 3) return 'text-blue-600'
    if (score >= 2) return 'text-amber-600'
    return 'text-red-600'
  }

  const getScoreBadge = (score: number) => {
    if (score >= 4) return 'success'
    if (score >= 3) return 'info'
    if (score >= 2) return 'warning'
    return 'danger'
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📈 Sonuçlar & Raporlar</h1>
        <p className="text-gray-500 mt-1">Değerlendirme sonuçlarını görüntüleyin ve analiz edin</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🔍 Filtreler</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-64">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Dönem</label>
              <Select
                options={periods.map(p => ({ value: p.id, label: p.name }))}
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                placeholder="Dönem Seçin"
              />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Kurum</label>
              <Select
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                placeholder="Tüm Kurumlar"
              />
            </div>
            <div className="w-56">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Kişi</label>
              <Select
                options={users.map(u => ({ value: u.id, label: u.name }))}
                value={selectedPerson}
                onChange={(e) => setSelectedPerson(e.target.value)}
                placeholder="Tüm Kişiler"
              />
            </div>
            <Button onClick={loadResults}>
              <Search className="w-4 h-4" />
              Filtrele
            </Button>
            <Button variant="success" onClick={exportToExcel}>
              <Download className="w-4 h-4" />
              Excel
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : results.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Sonuç görmek için filtreleri uygulayın</p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-2xl text-white">
              <User className="w-6 h-6 opacity-80 mb-2" />
              <div className="text-3xl font-bold">{results.length}</div>
              <div className="text-sm opacity-80">Kişi</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-2xl text-white">
              <TrendingUp className="w-6 h-6 opacity-80 mb-2" />
              <div className="text-3xl font-bold">
                {(results.reduce((sum, r) => sum + r.overallAvg, 0) / results.length).toFixed(1)}
              </div>
              <div className="text-sm opacity-80">Ortalama Skor</div>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-5 rounded-2xl text-white">
              <BarChart3 className="w-6 h-6 opacity-80 mb-2" />
              <div className="text-3xl font-bold">
                {results.reduce((sum, r) => sum + r.evaluations.length, 0)}
              </div>
              <div className="text-sm opacity-80">Toplam Değerlendirme</div>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-2xl text-white">
              <FileText className="w-6 h-6 opacity-80 mb-2" />
              <div className="text-3xl font-bold">
                {Math.max(...results.map(r => r.overallAvg)).toFixed(1)}
              </div>
              <div className="text-sm opacity-80">En Yüksek Skor</div>
            </div>
          </div>

          {/* Results Table */}
          <Card>
            <CardHeader>
              <CardTitle>📊 Kişi Bazlı Sonuçlar</CardTitle>
              <Badge variant="info">{results.length} kişi</Badge>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-gray-100">
                {results.map((result, index) => (
                  <div key={result.targetId}>
                    {/* Main Row */}
                    <div 
                      className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedPerson(expandedPerson === result.targetId ? null : result.targetId)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-semibold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{result.targetName}</p>
                          <p className="text-sm text-gray-500">{result.targetDept}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Öz</p>
                          <p className={`font-semibold ${getScoreColor(result.selfScore)}`}>
                            {result.selfScore || '-'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Peer</p>
                          <p className={`font-semibold ${getScoreColor(result.peerAvg)}`}>
                            {result.peerAvg || '-'}
                          </p>
                        </div>
                        <div className="text-center min-w-[60px]">
                          <p className="text-xs text-gray-500">Genel</p>
                          <Badge variant={getScoreBadge(result.overallAvg) as any}>
                            {result.overallAvg}
                          </Badge>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Değerlendiren</p>
                          <p className="font-medium text-gray-700">{result.evaluations.length}</p>
                        </div>
                        {expandedPerson === result.targetId ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedPerson === result.targetId && (
                      <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                        <h4 className="font-medium text-gray-700 mb-3">Değerlendirme Detayları</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {result.evaluations.map((eval_, idx) => (
                            <div 
                              key={idx} 
                              className={`bg-white p-3 rounded-xl border ${
                                eval_.isSelf ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-900">
                                  {eval_.isSelf ? '🔵 Öz Değerlendirme' : eval_.evaluatorName}
                                </span>
                                <Badge variant={getScoreBadge(eval_.avgScore) as any}>
                                  {eval_.avgScore}
                                </Badge>
                              </div>
                              {eval_.categories.length > 0 && (
                                <div className="space-y-1">
                                  {eval_.categories.slice(0, 3).map((cat, catIdx) => (
                                    <div key={catIdx} className="flex items-center justify-between text-xs">
                                      <span className="text-gray-500 truncate">{cat.name}</span>
                                      <span className={getScoreColor(cat.score)}>{cat.score}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
