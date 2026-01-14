'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Button, Select, Badge, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAdminContextStore } from '@/store/admin-context'
import { 
  Search, Download, FileText, User, BarChart3, TrendingUp, 
  ChevronDown, ChevronUp, Loader2, Printer 
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
  categoryCompare: { name: string; self: number; peer: number; diff: number }[]
  swot: {
    self: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
    peer: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
  }
}

export default function ResultsPage() {
  const { organizationId } = useAdminContextStore()
  const [periods, setPeriods] = useState<Array<{ id: string; name: string }>>([])
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([])
  
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedOrg, setSelectedOrg] = useState('')
  const [selectedPerson, setSelectedPerson] = useState('')
  
  const [results, setResults] = useState<ResultData[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)
  
  const printPerson = (targetId: string) => {
    const el = document.getElementById(`admin-report-${targetId}`)
    if (!el) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write('<html><head><title>VISIO 360° Rapor</title>')
    w.document.write('<style>')
    w.document.write('body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:20px;color:#111}')
    w.document.write('h1{margin:0 0 4px 0;font-size:20px}')
    w.document.write('p.meta{margin:0 0 16px 0;color:#666;font-size:12px}')
    w.document.write('table{width:100%;border-collapse:collapse;margin:12px 0}')
    w.document.write('th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:12px}')
    w.document.write('th{background:#f9fafb}')
    w.document.write('.badge{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid #e5e7eb;font-size:11px;color:#111}')
    w.document.write('@media print{button{display:none!important}}')
    w.document.write('</style></head><body>')
    w.document.write(`<h1>VISIO 360° Performans Değerlendirme Raporu</h1>`)
    w.document.write(`<p class="meta">Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}</p>`)
    w.document.write(el.innerHTML)
    w.document.write('</body></html>')
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    // KVKK: org context seçilmeden kullanıcı listesi çekme
    if (selectedPeriod && (selectedOrg || organizationId)) {
      loadUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedOrg, organizationId])

  const loadInitialData = async () => {
    const [periodsRes, orgsRes] = await Promise.all([
      supabase.from('evaluation_periods').select('*').order('created_at', { ascending: false }),
      supabase.from('organizations').select('*').order('name'),
    ])
    setPeriods(periodsRes.data || [])
    setOrganizations(orgsRes.data || [])
  }

  const loadUsers = async () => {
    const orgToUse = selectedOrg || organizationId
    if (!orgToUse) {
      setUsers([])
      return
    }
    const query = supabase.from('users').select('id,name').eq('status', 'active').eq('organization_id', orgToUse)
    const { data } = await query.order('name')
    setUsers((data || []) as Array<{ id: string; name: string }>)
  }

  const loadResults = async () => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }

    setLoading(true)
    try {
      // Tamamlanmış atamaları getir
      const assignQuery = supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(id, name, department, organization_id),
          target:target_id(id, name, department, organization_id)
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

      type AssignmentRow = {
        id: string
        evaluator_id: string
        target_id: string
        evaluator?: { id: string; name: string; department?: string | null; organization_id?: string | null } | null
        target?: { id: string; name: string; department?: string | null; organization_id?: string | null } | null
      }
      type ResponseRow = {
        assignment_id: string
        category_name?: string | null
        reel_score?: number | null
        std_score?: number | null
      }
      const typedAssignments = (assignments || []) as unknown as AssignmentRow[]
      const typedResponses = (responses || []) as unknown as ResponseRow[]

      typedAssignments.forEach((assignment) => {
        const targetId = assignment.target_id
        const targetName = assignment.target?.name || '-'
        const targetDept = assignment.target?.department || '-'
        const evaluatorId = assignment.evaluator_id
        const evaluatorName = assignment.evaluator?.name || '-'
        const isSelf = evaluatorId === targetId

        // Filtre kontrolü
        if (selectedPerson && targetId !== selectedPerson) return
        if (assignment.target?.organization_id !== orgToUse) return

        if (!resultMap[targetId]) {
          resultMap[targetId] = {
            targetId,
            targetName,
            targetDept,
            evaluations: [],
            overallAvg: 0,
            selfScore: 0,
            peerAvg: 0,
            categoryCompare: [],
            swot: {
              self: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
              peer: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
            }
          }
        }

        // Bu atamaya ait yanıtları bul
        const assignmentResponses = typedResponses.filter(r => r.assignment_id === assignment.id)
        
        // Kategori bazlı skorları hesapla
        const categoryScores: Record<string, { total: number; count: number }> = {}
        let totalScore = 0
        let totalCount = 0

        assignmentResponses.forEach((resp) => {
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

        // Kategori bazlı öz vs ekip karşılaştırması + SWOT
        const selfAgg: Record<string, { total: number; count: number }> = {}
        const peerAgg: Record<string, { total: number; count: number }> = {}

        result.evaluations.forEach(e => {
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
        result.categoryCompare = Array.from(catNames).map((name) => {
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

        const selfItems = result.categoryCompare.map(c => ({ name: c.name, score: c.self }))
        const peerItems = result.categoryCompare.map(c => ({ name: c.name, score: c.peer }))
        result.swot = { self: mkSwot(selfItems), peer: mkSwot(peerItems) }
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

  const getScoreBadge = (score: number): 'success' | 'info' | 'warning' | 'danger' => {
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
            <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
              <User className="w-6 h-6 text-[var(--brand)] mb-2" />
              <div className="text-3xl font-bold text-slate-900">{results.length}</div>
              <div className="text-sm text-slate-500">Kişi</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
              <TrendingUp className="w-6 h-6 text-emerald-600 mb-2" />
              <div className="text-3xl font-bold text-slate-900">
                {(results.reduce((sum, r) => sum + r.overallAvg, 0) / results.length).toFixed(1)}
              </div>
              <div className="text-sm text-slate-500">Ortalama Skor</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
              <BarChart3 className="w-6 h-6 text-[var(--brand)] mb-2" />
              <div className="text-3xl font-bold text-slate-900">
                {results.reduce((sum, r) => sum + r.evaluations.length, 0)}
              </div>
              <div className="text-sm text-slate-500">Toplam Değerlendirme</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
              <FileText className="w-6 h-6 text-amber-600 mb-2" />
              <div className="text-3xl font-bold text-slate-900">
                {Math.max(...results.map(r => r.overallAvg)).toFixed(1)}
              </div>
              <div className="text-sm text-slate-500">En Yüksek Skor</div>
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
                          <Badge variant={getScoreBadge(result.overallAvg)}>
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
                      <div className="bg-gray-50 px-6 py-4 border-t border-gray-100" id={`admin-report-${result.targetId}`}>
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
                                <Badge variant={getScoreBadge(eval_.avgScore)}>
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

                        <div className="mt-4 flex items-center justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); printPerson(result.targetId) }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                          >
                            <Printer className="w-4 h-4" />
                            Yazdır / PDF
                          </button>
                        </div>

                        {/* SWOT + Detaylı Karşılaştırma */}
                        {result.categoryCompare.length > 0 && (
                          <div className="mt-6 space-y-6">
                            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                                <div className="font-semibold text-gray-900">📋 Kategori Bazlı Detaylı Karşılaştırma</div>
                                <Badge variant="info">{result.categoryCompare.length} kategori</Badge>
                              </div>
                              <div className="p-4 overflow-x-auto">
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
                                    {result.categoryCompare.map((c) => {
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

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div className="bg-white rounded-2xl border border-blue-200 p-4">
                                <h4 className="font-semibold text-blue-700 mb-4 text-center">🔵 ÖZ DEĞERLENDİRME SWOT</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                                    <div className="font-semibold text-emerald-700 mb-2">💪 Güçlü Yönler</div>
                                    {result.swot.self.strengths.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.strengths.slice(0, 6).map(s => (
                                          <div key={s.name}>✓ {s.name} <span className="font-semibold">({s.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-gray-500 italic">Belirgin güçlü yön tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                    <div className="font-semibold text-red-700 mb-2">⚠️ Gelişim Alanları</div>
                                    {result.swot.self.weaknesses.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.weaknesses.slice(0, 6).map(w => (
                                          <div key={w.name}>• {w.name} <span className="font-semibold">({w.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-gray-500 italic">Belirgin gelişim alanı tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                                    <div className="font-semibold text-sky-700 mb-2">🚀 Fırsatlar</div>
                                    {result.swot.self.opportunities.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.opportunities.slice(0, 6).map(o => (
                                          <div key={o.name}>→ {o.name} <span className="font-semibold">({o.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-gray-500 italic">Orta seviye alan bulunmuyor</div>}
                                  </div>
                                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <div className="font-semibold text-amber-700 mb-2">📝 Öneriler</div>
                                    {result.swot.self.recommendations.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.recommendations.slice(0, 4).map((r, idx) => (
                                          <div key={idx}>• {r}</div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-gray-500 italic">Öneri yok</div>}
                                  </div>
                                </div>
                              </div>

                              <div className="bg-white rounded-2xl border border-emerald-200 p-4">
                                <h4 className="font-semibold text-emerald-700 mb-4 text-center">🟢 EKİP DEĞERLENDİRME SWOT</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                                    <div className="font-semibold text-emerald-700 mb-2">💪 Güçlü Yönler</div>
                                    {result.swot.peer.strengths.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.strengths.slice(0, 6).map(s => (
                                          <div key={s.name}>✓ {s.name} <span className="font-semibold">({s.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-gray-500 italic">Belirgin güçlü yön tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                    <div className="font-semibold text-red-700 mb-2">⚠️ Gelişim Alanları</div>
                                    {result.swot.peer.weaknesses.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.weaknesses.slice(0, 6).map(w => (
                                          <div key={w.name}>• {w.name} <span className="font-semibold">({w.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-gray-500 italic">Belirgin gelişim alanı tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                                    <div className="font-semibold text-sky-700 mb-2">🚀 Fırsatlar</div>
                                    {result.swot.peer.opportunities.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.opportunities.slice(0, 6).map(o => (
                                          <div key={o.name}>→ {o.name} <span className="font-semibold">({o.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-gray-500 italic">Orta seviye alan bulunmuyor</div>}
                                  </div>
                                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <div className="font-semibold text-amber-700 mb-2">📝 Öneriler</div>
                                    {result.swot.peer.recommendations.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.recommendations.slice(0, 4).map((r, idx) => (
                                          <div key={idx}>• {r}</div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-gray-500 italic">Öneri yok</div>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
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
