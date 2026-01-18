'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { BarChart3, TrendingUp, Users, Target, Award, Loader2, Printer } from 'lucide-react'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { RadarCompare } from '@/components/charts/radar-compare'
import { BarCompare } from '@/components/charts/bar-compare'
import { buildAiInsightsFromSwotPeer } from '@/lib/ai-insights'

interface EvaluationResult {
  evaluatorName: string
  isSelf: boolean
  evaluatorLevel?: 'executive' | 'manager' | 'peer' | 'subordinate' | 'self' | string
  avgScore: number
  categories: { name: string; score: number }[]
  standardsAvg: number
  completedAt: string
}

interface PeriodResult {
  periodId: string
  periodName: string
  overallAvg: number
  selfScore: number
  peerAvg: number
  peerExpectedCount: number
  peerCompletedCount: number
  standardsScore: number
  standardsSelfAvg: number
  standardsPeerAvg: number
  confidenceCoeff: number
  confidenceLabel: 'Yüksek' | 'Orta' | 'Düşük'
  evaluations: EvaluationResult[]
  categoryAverages: { name: string; score: number }[]
  categoryCompare: { name: string; self: number; peer: number; diff: number }[]
  swot: {
    self: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
    peer: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
  }
  standardAvg: number
  standardCount: number
  standardByTitle: { title: string; avg: number; count: number }[]
  standardsFramework: { code: string | null; title: string; description: string | null }[]
}

type AssignmentRow = {
  id: string
  evaluator_id: string
  target_id: string
  completed_at: string
  evaluator?: { name?: string | null; position_level?: 'executive' | 'manager' | 'peer' | 'subordinate' | null } | null
  evaluation_periods?: { id?: string | null; name?: string | null; organization_id?: string | null } | null
}

type ResponseRow = {
  assignment_id: string
  category_name?: string | null
  reel_score?: number | null
  std_score?: number | null
}

type StandardScoreRow = {
  assignment_id: string
  score: number
  rationale?: string | null
  standard?: { title?: string | null; code?: string | null } | null
}

export default function UserResultsPage() {
  const lang = useLang()
  const { user } = useAuthStore()
  const [results, setResults] = useState<PeriodResult[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const reportElementId = useMemo(() => selectedPeriod ? `user-report-${selectedPeriod}` : null, [selectedPeriod])

  useEffect(() => {
    if (user) loadResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const loadResults = async () => {
    if (!user) return

    try {
      const orgId = user.organization_id || null
      // Framework list (what standards are used) - loaded once per org and injected into period results.
      let standardsFramework: { code: string | null; title: string; description: string | null }[] = []
      if (orgId) {
        try {
          const { data: fw, error: fwErr } = await supabase
            .from('international_standards')
            .select('code,title,description,sort_order,is_active,created_at')
            .eq('organization_id', orgId)
            .eq('is_active', true)
            .order('sort_order')
            .order('created_at')
          if (!fwErr && fw) {
            standardsFramework = (fw as any[]).map((r) => ({
              code: r.code ? String(r.code) : null,
              title: String(r.title || '-'),
              description: r.description ? String(r.description) : null,
            }))
          }
        } catch {
          // ignore if table not installed yet
        }
      }

      // Benim için yapılan tüm değerlendirmeleri getir (tamamlama oranı için)
      const { data: allAssignments } = await supabase
        .from('evaluation_assignments')
        .select(`id, evaluator_id, target_id, status, evaluation_periods(id)`)
        .eq('target_id', user.id)

      const peerProgressByPeriod = new Map<string, { total: number; completed: number }>()
      ;(allAssignments || []).forEach((a: any) => {
        const pid = a?.evaluation_periods?.id
        if (!pid) return
        const isSelf = String(a.evaluator_id) === String(a.target_id)
        if (isSelf) return
        const cur = peerProgressByPeriod.get(pid) || { total: 0, completed: 0 }
        cur.total += 1
        if (a.status === 'completed') cur.completed += 1
        peerProgressByPeriod.set(pid, cur)
      })

      // Benim için yapılan tamamlanmış değerlendirmeleri getir (sonuçları hesaplamak için)
      const { data: assignments } = await supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(name, position_level),
          evaluation_periods(id, name, organization_id)
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

      // Katsayıları getir (org override varsa onu kullan, yoksa default org=null)
      const evaluatorWeightByLevel: Record<string, number> = {}
      const categoryWeightByName: Record<string, number> = {}

      const pickLatestBy = (rows: any[] | null | undefined, key: string) => {
        const out = new Map<string, any>()
        ;(rows || []).forEach((r) => {
          const k = String(r?.[key] ?? '')
          if (!k) return
          if (!out.has(k)) out.set(k, r)
        })
        return out
      }

      // Güven + Sapma ayarları (defaultlar Word'e göre)
      let confidenceMinHighLocal = 5
      let deviationLocal = {
        lenient_diff_threshold: 0.75,
        harsh_diff_threshold: 0.75,
        lenient_multiplier: 0.85,
        harsh_multiplier: 1.15,
      }

      if (orgId) {
        const [orgEval, defEval, orgCatW, defCatW, conf, dev] = await Promise.all([
          supabase.from('evaluator_weights').select('position_level,weight').eq('organization_id', orgId).order('created_at', { ascending: false }),
          supabase.from('evaluator_weights').select('position_level,weight').is('organization_id', null).order('created_at', { ascending: false }),
          supabase.from('category_weights').select('category_name,weight').eq('organization_id', orgId),
          supabase.from('category_weights').select('category_name,weight').is('organization_id', null),
          supabase.from('confidence_settings').select('min_high_confidence_evaluator_count').eq('organization_id', orgId).maybeSingle(),
          supabase.from('deviation_settings').select('lenient_diff_threshold,harsh_diff_threshold,lenient_multiplier,harsh_multiplier').eq('organization_id', orgId).maybeSingle(),
        ])

        const orgEvalMap = pickLatestBy(orgEval.data as any[], 'position_level')
        const defEvalMap = pickLatestBy(defEval.data as any[], 'position_level')
        new Set<string>([...defEvalMap.keys(), ...orgEvalMap.keys()]).forEach((lvl) => {
          const row = orgEvalMap.get(lvl) || defEvalMap.get(lvl)
          evaluatorWeightByLevel[lvl] = Number(row?.weight ?? 1)
        })
        if (!evaluatorWeightByLevel.self) evaluatorWeightByLevel.self = 1

        const orgCatMap = new Map<string, any>(((orgCatW.data || []) as any[]).map((r) => [String(r.category_name), r]))
        const defCatMap = new Map<string, any>(((defCatW.data || []) as any[]).map((r) => [String(r.category_name), r]))
        new Set<string>([...defCatMap.keys(), ...orgCatMap.keys()]).forEach((name) => {
          const row = orgCatMap.get(name) || defCatMap.get(name)
          categoryWeightByName[name] = Number(row?.weight ?? 1)
        })

        if (!conf.error && conf.data) {
          confidenceMinHighLocal = Number((conf.data as any).min_high_confidence_evaluator_count ?? 5) || 5
        }
        if (!dev.error && dev.data) {
          deviationLocal = {
            lenient_diff_threshold: Number((dev.data as any).lenient_diff_threshold ?? 0.75),
            harsh_diff_threshold: Number((dev.data as any).harsh_diff_threshold ?? 0.75),
            lenient_multiplier: Number((dev.data as any).lenient_multiplier ?? 0.85),
            harsh_multiplier: Number((dev.data as any).harsh_multiplier ?? 1.15),
          }
        }
      }

      // Standart skorlarını getir (opsiyonel; tablo yoksa sessiz geç)
      let standardsByAssignment: Record<string, number> = {}
      try {
        const { data: stdScores, error: stdErr } = await supabase
          .from('international_standard_scores')
          .select('assignment_id, score')
          .in('assignment_id', assignmentIds)

        if (!stdErr && stdScores) {
          const agg: Record<string, { sum: number; count: number }> = {}
          ;(stdScores as unknown as StandardScoreRow[]).forEach((r) => {
            if (!agg[r.assignment_id]) agg[r.assignment_id] = { sum: 0, count: 0 }
            agg[r.assignment_id].sum += Number(r.score || 0)
            agg[r.assignment_id].count += 1
          })
          standardsByAssignment = Object.fromEntries(
            Object.entries(agg).map(([k, v]) => [k, v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0])
          )
        }
      } catch {
        // ignore (table may not exist yet)
      }

      // Dönem bazlı grupla
      const periodMap: Record<string, PeriodResult> = {}

      const typedAssignments = (assignments || []) as unknown as AssignmentRow[]
      const typedResponses = (responses || []) as unknown as ResponseRow[]

      const weightForEval = (e: { isSelf: boolean; evaluatorLevel?: string }) => {
        const k = e.isSelf ? 'self' : (e.evaluatorLevel || 'peer')
        return Number(evaluatorWeightByLevel[k] ?? 1)
      }

      const weightedAvg = (rows: Array<{ w: number; v: number }>) => {
        const sumW = rows.reduce((s, r) => s + (r.w || 0), 0)
        if (!sumW) return 0
        return rows.reduce((s, r) => s + (r.v || 0) * (r.w || 0), 0) / sumW
      }

      typedAssignments.forEach((assignment) => {
        const periodId = assignment.evaluation_periods?.id
        const periodName = assignment.evaluation_periods?.name || '-'
        
        if (!periodId) return

        if (!periodMap[periodId]) {
          const peerProg = peerProgressByPeriod.get(periodId) || { total: 0, completed: 0 }
          periodMap[periodId] = {
            periodId,
            periodName,
            overallAvg: 0,
            selfScore: 0,
            peerAvg: 0,
            peerExpectedCount: peerProg.total,
            peerCompletedCount: peerProg.completed,
            standardsScore: 0,
            standardsSelfAvg: 0,
            standardsPeerAvg: 0,
            confidenceCoeff: 1,
            confidenceLabel: 'Yüksek',
            evaluations: [],
            categoryAverages: [],
            categoryCompare: [],
            swot: {
              self: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
              peer: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
            }
            ,
            standardAvg: 0,
            standardCount: 0,
            standardByTitle: [],
            standardsFramework,
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

        // Kategori katsayılarıyla ağırlıklı ortalama (varsayılan weight=1)
        const weighted = categories.reduce(
          (acc, c) => {
            const w = Number(categoryWeightByName[c.name] ?? 1)
            if (!c.score) return acc
            acc.sum += c.score * w
            acc.w += w
            return acc
          },
          { sum: 0, w: 0 }
        )
        const avgScore =
          weighted.w > 0
            ? Math.round((weighted.sum / weighted.w) * 10) / 10
            : totalCount > 0
              ? Math.round((totalScore / totalCount) * 10) / 10
              : 0
        const isSelf = assignment.evaluator_id === assignment.target_id
        const evaluatorLevel = isSelf ? 'self' : (assignment.evaluator?.position_level || 'peer')

        periodMap[periodId].evaluations.push({
          evaluatorName: assignment.evaluator?.name || '-',
          isSelf,
          evaluatorLevel,
          avgScore,
          categories,
          standardsAvg: standardsByAssignment[assignment.id] || 0,
          completedAt: assignment.completed_at
        })
      })

      // Her dönem için genel ortalamaları hesapla
      Object.values(periodMap).forEach(period => {
        const selfEval = period.evaluations.find(e => e.isSelf)
        const peerEvals = period.evaluations.filter(e => !e.isSelf)
        
        period.selfScore = selfEval?.avgScore || 0
        // Confidence coefficient (peer count based)
        const minHigh = Math.max(1, Math.floor(confidenceMinHighLocal || 5))
        const peerCount = peerEvals.length
        period.confidenceCoeff = Math.min(1, peerCount / minHigh)
        period.confidenceLabel = peerCount >= minHigh ? 'Yüksek' : peerCount >= 3 ? 'Orta' : 'Düşük'

        // Deviation correction based on peer mean
        const peerMean = peerEvals.length
          ? peerEvals.reduce((s, e) => s + (e.avgScore || 0), 0) / peerEvals.length
          : 0
        const deviationMult = (e: EvaluationResult) => {
          if (e.isSelf || !peerEvals.length) return 1
          const diff = (e.avgScore || 0) - peerMean
          if (diff > deviationLocal.lenient_diff_threshold) return deviationLocal.lenient_multiplier
          if (-diff > deviationLocal.harsh_diff_threshold) return deviationLocal.harsh_multiplier
          return 1
        }

        period.peerAvg = peerEvals.length > 0
          ? Math.round(
              weightedAvg(peerEvals.map((e) => ({ w: weightForEval(e) * deviationMult(e), v: e.avgScore }))) * 10
            ) / 10
          : 0

        const perfOverall = period.evaluations.length > 0
          ? Math.round(
              weightedAvg(period.evaluations.map((e) => ({ w: weightForEval(e) * deviationMult(e), v: e.avgScore }))) * 10
            ) / 10
          : 0
        const perfFinal = Math.round((perfOverall * period.confidenceCoeff) * 10) / 10

        period.standardsSelfAvg = selfEval?.standardsAvg || 0
        period.standardsPeerAvg = peerEvals.length > 0
          ? Math.round(
              weightedAvg(peerEvals.map((e) => ({ w: weightForEval(e) * deviationMult(e), v: e.standardsAvg || 0 }))) * 10
            ) / 10
          : 0
        period.standardsScore = period.evaluations.length > 0
          ? Math.round(
              weightedAvg(period.evaluations.map((e) => ({ w: weightForEval(e) * deviationMult(e), v: e.standardsAvg || 0 }))) * 10
            ) / 10
          : (period.standardsPeerAvg || period.standardsSelfAvg)

        // Toplam skor: performans + standart (varsayılan %15 standart etkisi)
        const STANDARD_WEIGHT = 0.15
        period.overallAvg = Math.round(((perfFinal * (1 - STANDARD_WEIGHT)) + (period.standardsScore * STANDARD_WEIGHT)) * 10) / 10

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
        const selfAgg: Record<string, { sum: number; w: number }> = {}
        const peerAgg: Record<string, { sum: number; w: number }> = {}

        period.evaluations.forEach(e => {
          const w = weightForEval(e)
          e.categories.forEach(cat => {
            if (e.isSelf) {
              if (!selfAgg[cat.name]) selfAgg[cat.name] = { sum: 0, w: 0 }
              selfAgg[cat.name].sum += cat.score
              selfAgg[cat.name].w += 1
            } else {
              if (!peerAgg[cat.name]) peerAgg[cat.name] = { sum: 0, w: 0 }
              peerAgg[cat.name].sum += cat.score * w
              peerAgg[cat.name].w += w
            }
          })
        })

        const catNames = new Set([...Object.keys(selfAgg), ...Object.keys(peerAgg)])
        period.categoryCompare = Array.from(catNames).map((name) => {
          const self = selfAgg[name] && selfAgg[name].w ? Math.round((selfAgg[name].sum / selfAgg[name].w) * 10) / 10 : 0
          const peer = peerAgg[name] && peerAgg[name].w ? Math.round((peerAgg[name].sum / peerAgg[name].w) * 10) / 10 : 0
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

      // Standart skorlarını getir ve dönemlere yaz (assignment bazlı)
      const { data: stdScores, error: stdErr } = await supabase
        .from('international_standard_scores')
        .select('assignment_id, score, standard:standard_id(title,code)')
        .in('assignment_id', assignmentIds)
      if (!stdErr && stdScores && stdScores.length) {
        const byAssignment = new Map<string, number[]>()
        const perPeriodByTitle = new Map<string, Map<string, { title: string; code: string | null; sum: number; count: number }>>()

        ;(stdScores as unknown as StandardScoreRow[]).forEach((r) => {
          const arr = byAssignment.get(r.assignment_id) || []
          arr.push(Number(r.score || 0))
          byAssignment.set(r.assignment_id, arr)
        })

        // Map assignment_id -> period_id
        const assignmentToPeriod = new Map<string, string>()
        typedAssignments.forEach((a) => {
          const pid = a.evaluation_periods?.id
          if (pid) assignmentToPeriod.set(a.id, pid)
        })

        // Title breakdown (period -> standard title avg)
        ;(stdScores as unknown as StandardScoreRow[]).forEach((r) => {
          const pid = assignmentToPeriod.get(r.assignment_id)
          if (!pid) return
          const title = (r.standard?.title || 'Standart').trim()
          const code = (r.standard?.code || null) as string | null
          const key = `${code || ''}||${title}`
          const map = perPeriodByTitle.get(pid) || new Map()
          const agg = map.get(key) || { title, code, sum: 0, count: 0 }
          const s = Number(r.score || 0)
          if (!s) return
          agg.sum += s
          agg.count += 1
          map.set(key, agg)
          perPeriodByTitle.set(pid, map)
        })

        const periodAgg = new Map<string, { sum: number; count: number }>()
        byAssignment.forEach((scores, aid) => {
          const pid = assignmentToPeriod.get(aid)
          if (!pid) return
          const agg = periodAgg.get(pid) || { sum: 0, count: 0 }
          scores.forEach((s) => {
            if (!s) return
            agg.sum += s
            agg.count += 1
          })
          periodAgg.set(pid, agg)
        })

        periodAgg.forEach((agg, pid) => {
          const p = periodMap[pid]
          if (!p) return
          p.standardCount = agg.count
          p.standardAvg = agg.count ? Math.round((agg.sum / agg.count) * 10) / 10 : 0
        })

        perPeriodByTitle.forEach((m, pid) => {
          const p = periodMap[pid]
          if (!p) return
          p.standardByTitle = Array.from(m.values())
            .map((x) => ({
              title: x.code ? `${x.code} — ${x.title}` : x.title,
              avg: x.count ? Math.round((x.sum / x.count) * 10) / 10 : 0,
              count: x.count,
            }))
            .sort((a, b) => b.avg - a.avg)
        })
      }

      setResults(Object.values(periodMap))
      // KVKK / güvenlik: kullanıcı dönem seçmeden otomatik detay göstermeyelim.

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
  const teamComplete = !!(
    selectedResult &&
    selectedResult.peerExpectedCount > 0 &&
    selectedResult.peerCompletedCount >= selectedResult.peerExpectedCount
  )

  const printReport = () => {
    if (!reportElementId) return
    const report = document.getElementById(reportElementId)
    if (!report) return

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
    w.document.write('.section{margin-top:16px}')
    w.document.write('@media print{button{display:none!important}}')
    w.document.write('</style></head><body>')
    w.document.write(`<h1>VISIO 360° Performans Değerlendirme Raporu</h1>`)
    w.document.write(`<p class="meta">Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}</p>`)
    w.document.write(report.innerHTML)
    w.document.write('</body></html>')
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📊 {t('myResultsTitle', lang)}</h1>
        <p className="text-gray-500 mt-1">{t('myResultsSubtitle', lang)}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : results.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>{t('noCompletedResults', lang)}</p>
            <p className="text-sm mt-2">{t('resultsEmptyHint', lang)}</p>
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
                    ? 'bg-[var(--brand)] text-white shadow-sm'
                    : 'bg-[var(--surface)] text-slate-700 border border-[var(--border)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {period.periodName}
              </button>
            ))}
          </div>

          <RequireSelection
            enabled={!selectedResult}
            title={`KVKK / ${t('security', lang)}`}
            message={t('selectPeriodToView', lang)}
          >
          {selectedResult && (
            <>
              <div className="flex items-center justify-end mb-4">
                <button
                  onClick={printReport}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  <Printer className="w-4 h-4" />
                  {t('printPdf', lang)}
                </button>
              </div>

              <div id={reportElementId || undefined}>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <Award className="w-6 h-6 text-[var(--brand)] mb-2" />
                  <div className="text-3xl font-bold text-slate-900">{selectedResult.overallAvg}</div>
                  <div className="text-sm text-slate-500">{t('overallAverage', lang)}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <Target className="w-6 h-6 text-[var(--brand)] mb-2" />
                  <div className="text-3xl font-bold text-slate-900">{selectedResult.selfScore || '-'}</div>
                  <div className="text-sm text-slate-500">Öz Değerlendirme</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <Users className="w-6 h-6 text-emerald-600 mb-2" />
                  <div className="text-3xl font-bold text-slate-900">{teamComplete ? (selectedResult.peerAvg || '-') : '-'}</div>
                  <div className="text-sm text-slate-500 flex items-center justify-between gap-2">
                    <span>{t('peerAverage', lang)}</span>
                    {selectedResult.peerExpectedCount > 0 && !teamComplete && (
                      <Badge variant="warning">
                        {selectedResult.peerCompletedCount}/{selectedResult.peerExpectedCount} tamamlandı
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <TrendingUp className="w-6 h-6 text-[var(--warning)] mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">{selectedResult.evaluations.length}</div>
                  <div className="text-sm text-[var(--muted)]">{t('evaluationCountLabel', lang)}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
                  <Award className="w-6 h-6 text-[var(--info)] mb-2" />
                  <div className="text-3xl font-bold text-[var(--foreground)]">
                    {selectedResult.standardCount ? selectedResult.standardAvg.toFixed(1) : '-'}
                  </div>
                  <div className="text-sm text-[var(--muted)]">{t('standardCompliance', lang)}</div>
                </div>
              </div>

              {/* Team gating */}
              {!teamComplete && selectedResult.peerExpectedCount > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>🟢 {t('teamEvaluation', lang)}</CardTitle>
                    <Badge variant="warning">Beklemede</Badge>
                  </CardHeader>
                  <CardBody>
                    <div className="text-sm text-[var(--muted)]">
                      Ekip değerlendirmesi tamamlanmadan ekip puanlaması gösterilmez. İlerleme:{' '}
                      <span className="font-semibold text-[var(--foreground)]">
                        {selectedResult.peerCompletedCount}/{selectedResult.peerExpectedCount}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* International standards framework (corporate visibility) */}
              {selectedResult.standardsFramework && selectedResult.standardsFramework.length > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>🌐 {t('internationalStandards', lang)}</CardTitle>
                    <Badge variant="info">{selectedResult.standardsFramework.length} standart</Badge>
                  </CardHeader>
                  <CardBody className="space-y-3">
                    <div className="text-sm text-[var(--muted)]">
                      Bu değerlendirme, kurumunuzun tanımladığı <span className="font-semibold text-[var(--foreground)]">uluslararası standartlar</span> çerçevesinde
                      ölçülür ve raporlanır.
                    </div>
                    <div className="overflow-x-auto border border-[var(--border)] rounded-2xl">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)] w-[160px]">Kod</th>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">Standart</th>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">Açıklama</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {selectedResult.standardsFramework.slice(0, 20).map((s) => (
                            <tr key={`${s.code || ''}||${s.title}`}>
                              <td className="py-3 px-4 text-[var(--muted)] font-mono">{s.code || '-'}</td>
                              <td className="py-3 px-4 text-[var(--foreground)] font-medium">{s.title}</td>
                              <td className="py-3 px-4 text-[var(--muted)]">{s.description || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {selectedResult.standardsFramework.length > 20 && (
                      <div className="text-xs text-[var(--muted)]">
                        İlk 20 standart gösteriliyor.
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* Category Scores */}
              {selectedResult.standardByTitle && selectedResult.standardByTitle.length > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>🌍 {t('standardsDetail', lang)}</CardTitle>
                    <Badge variant="info">{selectedResult.standardByTitle.length} standart</Badge>
                  </CardHeader>
                  <CardBody className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">Standart</th>
                            <th className="text-right py-3 px-4 font-semibold text-[var(--muted)] w-[140px]">Ortalama</th>
                            <th className="text-right py-3 px-4 font-semibold text-[var(--muted)] w-[140px]">Adet</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {selectedResult.standardByTitle.slice(0, 12).map((s) => (
                            <tr key={s.title}>
                              <td className="py-3 px-4 text-[var(--foreground)]">{s.title}</td>
                              <td className="py-3 px-4 text-right">
                                <Badge variant={getScoreBadge(s.avg)}>{s.avg.toFixed(1)}</Badge>
                              </td>
                              <td className="py-3 px-4 text-right text-[var(--muted)]">{s.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {selectedResult.standardByTitle.length > 12 && (
                      <div className="px-4 py-3 text-xs text-[var(--muted)] border-t border-[var(--border)]">
                        İlk 12 standart gösteriliyor.
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}

              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>📈 {t('categoryResults', lang)}</CardTitle>
                </CardHeader>
                <CardBody>
                  <div className="space-y-4">
                    {selectedResult.categoryAverages.map((cat, idx) => (
                      <div key={idx}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-700">{cat.name}</span>
                          <Badge variant={getScoreBadge(cat.score)}>{cat.score}</Badge>
                        </div>
                        <div className="bg-[var(--surface-2)] rounded-full h-3 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              cat.score >= 4 ? 'bg-[var(--success)]' :
                              cat.score >= 3 ? 'bg-[var(--brand)]' :
                              cat.score >= 2 ? 'bg-[var(--warning)]' : 'bg-[var(--danger)]'
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
                  <CardTitle>🎯 {t('swotAndComparison', lang)}</CardTitle>
                </CardHeader>
                <CardBody className="space-y-6">
                  {/* Radar grafik (HTML sürümündeki gibi) */}
                  {teamComplete && selectedResult.categoryCompare.length > 0 && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                        <div className="font-semibold text-[var(--foreground)] mb-3">🕸️ {t('radarCompare', lang)}</div>
                        <RadarCompare
                          rows={selectedResult.categoryCompare.map((c) => ({ name: c.name, self: c.self || 0, peer: c.peer || 0 }))}
                          selfLabel={t('selfShort', lang)}
                          peerLabel={t('teamShort', lang)}
                        />
                      </div>
                      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                        <div className="font-semibold text-[var(--foreground)] mb-3">📊 {t('barCompare', lang)}</div>
                        <BarCompare
                          rows={selectedResult.categoryCompare.map((c) => ({ name: c.name, self: c.self || 0, peer: c.peer || 0 }))}
                          selfLabel={t('selfShort', lang)}
                          peerLabel={t('teamShort', lang)}
                        />
                      </div>
                    </div>
                  )}

                  {/* Detaylı tablo */}
                  {teamComplete && (
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)] mb-3">📋 {t('categoryDetailedCompare', lang)}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">{t('category', lang)}</th>
                            <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🔵 Öz (5)</th>
                            <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🔵 Öz (%)</th>
                            <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🟢 Ekip (5)</th>
                            <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🟢 Ekip (%)</th>
                            <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">{t('difference', lang)}</th>
                            <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">{t('status', lang)}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {selectedResult.categoryCompare.map((c) => {
                            const status =
                              c.self === 0 ? { label: 'Öz yok', variant: 'gray' as const } :
                              c.peer === 0 ? { label: 'Ekip yok', variant: 'gray' as const } :
                              c.diff > 0.5 ? { label: 'Yüksek görüyor', variant: 'warning' as const } :
                              c.diff < -0.5 ? { label: 'Düşük görüyor', variant: 'danger' as const } :
                              { label: 'Tutarlı', variant: 'success' as const }
                            return (
                              <tr key={c.name}>
                                <td className="py-3 px-4 font-medium text-[var(--foreground)]">{c.name}</td>
                                <td className="py-3 px-4 text-center">{c.self ? c.self.toFixed(1) : '-'}</td>
                                <td className="py-3 px-4 text-center text-[var(--brand)] font-semibold">{c.self ? `${Math.round((c.self / 5) * 100)}%` : '-'}</td>
                                <td className="py-3 px-4 text-center">{c.peer ? c.peer.toFixed(1) : '-'}</td>
                                <td className="py-3 px-4 text-center text-[var(--success)] font-semibold">{c.peer ? `${Math.round((c.peer / 5) * 100)}%` : '-'}</td>
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
                  )}

                  {/* SWOT */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="border border-[var(--border)] rounded-2xl p-4 bg-[var(--surface)]">
                      <h3 className="font-semibold text-[var(--brand)] mb-4 text-center">🔵 {t('swotSelfTitle', lang)}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[var(--success-soft)] border border-[var(--success)]/30 rounded-xl p-4">
                          <div className="font-semibold text-[var(--success-text)] mb-2">💪 {t('strengths', lang)}</div>
                          {selectedResult.swot.self.strengths.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.self.strengths.slice(0, 6).map(s => (
                                <div key={s.name}>✓ {s.name} <span className="font-semibold">({s.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-[var(--muted)] italic">{t('noStrengths', lang)}</div>}
                        </div>
                        <div className="bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-xl p-4">
                          <div className="font-semibold text-[var(--danger-text)] mb-2">⚠️ {t('weaknesses', lang)}</div>
                          {selectedResult.swot.self.weaknesses.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.self.weaknesses.slice(0, 6).map(w => (
                                <div key={w.name}>• {w.name} <span className="font-semibold">({w.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-[var(--muted)] italic">{t('noWeaknesses', lang)}</div>}
                        </div>
                        <div className="bg-[var(--info-soft)] border border-[var(--info)]/30 rounded-xl p-4">
                          <div className="font-semibold text-[var(--info-text)] mb-2">🚀 {t('opportunities', lang)}</div>
                          {selectedResult.swot.self.opportunities.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.self.opportunities.slice(0, 6).map(o => (
                                <div key={o.name}>→ {o.name} <span className="font-semibold">({o.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-[var(--muted)] italic">{t('noOpportunities', lang)}</div>}
                        </div>
                        <div className="bg-[var(--warning-soft)] border border-[var(--warning)]/30 rounded-xl p-4">
                          <div className="font-semibold text-[var(--warning-text)] mb-2">📝 {t('recommendations', lang)}</div>
                          {selectedResult.swot.self.recommendations.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.self.recommendations.slice(0, 4).map((r, idx) => (
                                <div key={idx}>• {r}</div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-[var(--muted)] italic">{t('noRecommendations', lang)}</div>}
                        </div>
                      </div>
                    </div>

                    {teamComplete && (
                    <div className="border border-[var(--border)] rounded-2xl p-4 bg-[var(--surface)]">
                      <h3 className="font-semibold text-[var(--success)] mb-4 text-center">🟢 {t('swotTeamTitle', lang)}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[var(--success-soft)] border border-[var(--success)]/30 rounded-xl p-4">
                          <div className="font-semibold text-[var(--success-text)] mb-2">💪 {t('strengths', lang)}</div>
                          {selectedResult.swot.peer.strengths.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.peer.strengths.slice(0, 6).map(s => (
                                <div key={s.name}>✓ {s.name} <span className="font-semibold">({s.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-[var(--muted)] italic">{t('noStrengths', lang)}</div>}
                        </div>
                        <div className="bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-xl p-4">
                          <div className="font-semibold text-[var(--danger-text)] mb-2">⚠️ {t('weaknesses', lang)}</div>
                          {selectedResult.swot.peer.weaknesses.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.peer.weaknesses.slice(0, 6).map(w => (
                                <div key={w.name}>• {w.name} <span className="font-semibold">({w.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-[var(--muted)] italic">{t('noWeaknesses', lang)}</div>}
                        </div>
                        <div className="bg-[var(--info-soft)] border border-[var(--info)]/30 rounded-xl p-4">
                          <div className="font-semibold text-[var(--info-text)] mb-2">🚀 {t('opportunities', lang)}</div>
                          {selectedResult.swot.peer.opportunities.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.peer.opportunities.slice(0, 6).map(o => (
                                <div key={o.name}>→ {o.name} <span className="font-semibold">({o.score.toFixed(1)})</span></div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-[var(--muted)] italic">{t('noOpportunities', lang)}</div>}
                        </div>
                        <div className="bg-[var(--warning-soft)] border border-[var(--warning)]/30 rounded-xl p-4">
                          <div className="font-semibold text-[var(--warning-text)] mb-2">📝 {t('recommendations', lang)}</div>
                          {selectedResult.swot.peer.recommendations.length ? (
                            <div className="space-y-1 text-sm">
                              {selectedResult.swot.peer.recommendations.slice(0, 4).map((r, idx) => (
                                <div key={idx}>• {r}</div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-[var(--muted)] italic">{t('noRecommendations', lang)}</div>}
                        </div>
                      </div>
                    </div>
                    )}
                  </div>

                  {/* AI önerileri */}
                  {teamComplete && (() => {
                    const ai = buildAiInsightsFromSwotPeer(selectedResult.swot.peer)
                    return (
                      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
                        <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between">
                          <div className="font-semibold text-[var(--foreground)]">🤖 {t('aiDev', lang)}</div>
                          <Badge variant="info">{t('summary', lang)}</Badge>
                        </div>
                        <div className="p-5 space-y-4">
                          <div>
                            <div className="text-xs font-semibold text-[var(--muted)] mb-1">{t('briefSwot', lang)}</div>
                            <div className="text-sm text-[var(--foreground)]">{ai.summary}</div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold text-[var(--muted)] mb-2">{t('recommendedTrainings', lang)}</div>
                            {ai.trainings.length ? (
                              <div className="flex flex-wrap gap-2">
                                {ai.trainings.map((t) => (
                                  <Badge key={t} variant="info">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-[var(--muted)]">{t('noData', lang)}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </CardBody>
              </Card>

              {/* Individual Evaluations */}
              <Card>
                <CardHeader>
                  <CardTitle>👥 {t('evaluationDetails', lang)}</CardTitle>
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
                                {eval_.isSelf ? t('selfEvaluation', lang) : t('teamEvaluation', lang)}
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
              </div>
            </>
          )}
          </RequireSelection>
        </>
      )}
    </div>
  )
}
