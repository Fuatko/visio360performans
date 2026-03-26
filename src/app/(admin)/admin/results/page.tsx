'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { Card, CardHeader, CardBody, CardTitle, Button, Select, Badge, toast } from '@/components/ui'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { t } from '@/lib/i18n'
import { 
  Search, Download, FileText, User, BarChart3, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, Loader2, Printer, Award, Building2, History,
  ArrowUpRight, ArrowDownRight, AlertTriangle, ShieldAlert, HeartPulse, SlidersHorizontal,
} from 'lucide-react'
import { SecurityStandardsSummary } from '@/components/security/security-standards-summary'
import { RadarCompare } from '@/components/charts/radar-compare'
import { BarCompare } from '@/components/charts/bar-compare'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

function escapeHtmlForPrint(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function trainingForCategory(categoryName: string): string[] {
  const n = (categoryName || '').toLowerCase()
  const out: string[] = []

  const push = (s: string) => {
    if (!out.includes(s)) out.push(s)
  }

  if (/(iletişim|iletisim|dinleme|empati)/.test(n)) push('Etkili İletişim ve Aktif Dinleme')
  if (/(geri bildirim|geribildirim|feedback)/.test(n)) push('Geri Bildirim Verme ve Alma (Koçluk Yaklaşımı)')
  if (/(takım|takim|işbirliği|isbirligi|ekip)/.test(n)) push('Takım Çalışması ve İşbirliği')
  if (/(çatış|catis|müzakere|muzakere)/.test(n)) push('Çatışma Yönetimi ve Müzakere')
  if (/(zaman|öncelik|oncelik|planlama|organizasyon)/.test(n)) push('Zaman Yönetimi ve Önceliklendirme')
  if (/(lider|koç|koc|yönet|yonet)/.test(n)) push('Liderlik ve Koçluk Becerileri')
  if (/(problem|analitik|veri|karar)/.test(n)) push('Problem Çözme ve Analitik Düşünme')
  if (/(strateji|vizyon)/.test(n)) push('Stratejik Düşünme ve Hedef Yönetimi')
  if (/(değişim|degisim|esneklik|uyum)/.test(n)) push('Değişim Yönetimi ve Adaptasyon')

  if (out.length === 0 && categoryName) {
    push(`Yetkinlik Gelişimi: ${categoryName}`)
  }
  return out
}

function buildAiInsights(result: ResultData) {
  const strong = result.swot.peer.strengths.slice(0, 2).map((s) => s.name).filter(Boolean)
  const weak = result.swot.peer.weaknesses.slice(0, 3).map((w) => w.name).filter(Boolean)

  const trainings = weak
    .flatMap((c) => trainingForCategory(c))
    .slice(0, 6)

  const summaryParts: string[] = []
  if (strong.length) summaryParts.push(`Ekip güçlü gördüğü alanlar: ${strong.join(', ')}`)
  if (weak.length) summaryParts.push(`Gelişim alanları: ${weak.join(', ')}`)
  const summary = summaryParts.length ? `${summaryParts.join('. ')}.` : 'Yeterli veri yok.'

  return { summary, trainings }
}

interface ResultData {
  targetId: string
  targetName: string
  targetDept: string
  hasSelfEvaluationAssignment?: boolean
  /** Öz ataması var ve evaluation_responses ile skor üretilebiliyorsa true */
  selfHasScorableResponses?: boolean
  evaluations: {
    evaluatorId: string
    evaluatorName: string
    isSelf: boolean
    evaluatorLevel?: 'executive' | 'manager' | 'peer' | 'subordinate' | 'self' | string
    avgScore: number
    hasScorableResponses?: boolean
    assignmentId?: string
    responseCount?: number
    distinctQuestionCount?: number
    distinctCategoryCount?: number
    zeroScoreCount?: number
    missingCategoryCount?: number
    categories: { name: string; score: number }[]
    questionScores?: { questionId: string; category: string; score: number }[]
  }[]
  overallAvg: number
  selfScore: number
  peerAvg: number
  standardAvg: number
  standardCount: number
  standardByTitle: { title: string; avg: number; count: number }[]
  categoryCompare: { name: string; self: number; peer: number; diff: number }[]
  categoryQuestions?: Record<
    string,
    Array<{
      questionId: string
      questionText: string
      self: number
      peer: number
      diff: number
      selfCount?: number
      peerCount?: number
      categoryKey?: string
      categoryLabel?: string
    }>
  >
  responseStats?: {
    totalQuestionsWithAnyResponse: number
    selfAnsweredQuestions: number
    peerAnsweredQuestions: number
    bothAnsweredQuestions: number
    totalCategoriesWithAnyResponse: number
    selfAnsweredCategories: number
    peerAnsweredCategories: number
    questionTextLookup?: {
      requested: number
      resolved: number
      usedSnapshot: boolean
      snapshotErrors: Array<{ code: string; message: string }>
      questionsErrors: Array<{ code: string; message: string }>
    }
  }
  swot: {
    self: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
    peer: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
  }
}


type AnalyticsWeights = {
  riskOverall: number
  riskTrend: number
  riskGap: number
  riskCoverage: number
  healthPerformance: number
  healthParticipation: number
  healthCoverage: number
  healthTrend: number
  warningDropThreshold: number
  warningLowScoreThreshold: number
}

const DEFAULT_ANALYTICS_WEIGHTS: AnalyticsWeights = {
  riskOverall: 0.35,
  riskTrend: 0.25,
  riskGap: 0.2,
  riskCoverage: 0.2,
  healthPerformance: 0.35,
  healthParticipation: 0.2,
  healthCoverage: 0.2,
  healthTrend: 0.25,
  warningDropThreshold: -0.4,
  warningLowScoreThreshold: 2.9,
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const normalizeWeights = (w: AnalyticsWeights): AnalyticsWeights => {
  const riskSum = w.riskOverall + w.riskTrend + w.riskGap + w.riskCoverage || 1
  const healthSum = w.healthPerformance + w.healthParticipation + w.healthCoverage + w.healthTrend || 1
  return {
    ...w,
    riskOverall: w.riskOverall / riskSum,
    riskTrend: w.riskTrend / riskSum,
    riskGap: w.riskGap / riskSum,
    riskCoverage: w.riskCoverage / riskSum,
    healthPerformance: w.healthPerformance / healthSum,
    healthParticipation: w.healthParticipation / healthSum,
    healthCoverage: w.healthCoverage / healthSum,
    healthTrend: w.healthTrend / healthSum,
  }
}

export default function ResultsPage() {

  const lang = useLang()
  const { user } = useAuthStore()
  const { organizationId } = useAdminContextStore()
  const periodName = useCallback((p: any) => {
    if (!p) return ''
    if (lang === 'fr') return String(p.name_fr || p.name || '')
    if (lang === 'en') return String(p.name_en || p.name || '')
    return String(p.name || '')
  }, [lang])
  const userRole = user?.role
  const userOrgId = (user as any)?.organization_id ? String((user as any).organization_id) : ''
  const [periods, setPeriods] = useState<Array<{ id: string; name: string }>>([])
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string; department?: string | null }>>([])
  const [departments, setDepartments] = useState<string[]>([])
  
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedOrg, setSelectedOrg] = useState('')
  const [selectedDept, setSelectedDept] = useState('')
  const [selectedPerson, setSelectedPerson] = useState('')
  
  const [results, setResults] = useState<ResultData[]>([])
  /** Önceki dönem (liste sırasına göre) sonuçları — trend için */
  const [prevResults, setPrevResults] = useState<ResultData[]>([])
  const [analyticsWeights, setAnalyticsWeights] = useState<AnalyticsWeights>(DEFAULT_ANALYTICS_WEIGHTS)
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics'>('overview')
  const [expandedRiskTargetId, setExpandedRiskTargetId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)
  const [expandedCategoryByTarget, setExpandedCategoryByTarget] = useState<Record<string, string | null>>({})
  const [reopeningAssignmentId, setReopeningAssignmentId] = useState<string | null>(null)
  const [participation, setParticipation] = useState<{
    totals: { total: number; completed: number; pending: number }
    departments: Array<{ department: string; total: number; completed: number; pending: number }>
  } | null>(null)
  const [coverage, setCoverage] = useState<Array<{
    targetId: string
    targetName: string
    targetDept: string
    completedTotal: number
    pendingTotal: number
    selfCompleted: number
    managerCompleted: number
    peerCompleted: number
    subordinateCompleted: number
    executiveCompleted: number
  }> | null>(null)
  /** API yanıtı: şu anki sonuçta ekip değerlendiricileri isim isim mi */
  const [peerEvaluatorsVisible, setPeerEvaluatorsVisible] = useState(false)
  /** Filtre: sonraki istekte include_peer_detail — toplantıda varsayılan kapalı */
  const [showPeerDetail, setShowPeerDetail] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem('adminResultsIncludePeerDetail') === '1') setShowPeerDetail(true)
    } catch {
      /* ignore */
    }
  }, [])


  useEffect(() => {
    try {
      const raw = localStorage.getItem('adminResultsAnalyticsWeights')
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<AnalyticsWeights>
      setAnalyticsWeights((prev) => normalizeWeights({ ...prev, ...parsed }))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('adminResultsAnalyticsWeights', JSON.stringify(analyticsWeights))
    } catch {
      /* ignore */
    }
  }, [analyticsWeights])

  const filteredUsers = useMemo(() => {
    if (!selectedDept) return users
    return users.filter((u) => String(u.department || '') === String(selectedDept))
  }, [users, selectedDept])

  const openPersonFromRisk = useCallback((targetId: string) => {
    setActiveTab('overview')
    setExpandedPerson(String(targetId))
    setTimeout(() => {
      const el = document.getElementById(`person-row-${targetId}`) || document.getElementById(`admin-report-${targetId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [])

  const overallDistribution = useMemo(() => {
    const buckets = [
      { label: '0-2', from: 0, to: 2, count: 0 },
      { label: '2-3', from: 2, to: 3, count: 0 },
      { label: '3-4', from: 3, to: 4, count: 0 },
      { label: '4-5', from: 4, to: 5.01, count: 0 },
    ]
    results.forEach((r) => {
      const v = r.overallAvg || 0
      const b = buckets.find((x) => v >= x.from && v < x.to)
      if (b) b.count += 1
    })
    return buckets.map(({ label, count }) => ({ label, count }))
  }, [results])

  const categorySummary = useMemo(() => {
    const map: Record<string, { sum: number; count: number }> = {}
    results.forEach((r) => {
      r.categoryCompare.forEach((c) => {
        if (!c.name) return
        if (!map[c.name]) map[c.name] = { sum: 0, count: 0 }
        map[c.name].sum += c.peer || 0
        map[c.name].count += 1
      })
    })
    const rows = Object.entries(map)
      .map(([name, v]) => ({
        name,
        avg: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.avg - a.avg)
    return {
      top: rows.slice(0, 5),
      bottom: rows.slice(-5).reverse(),
    }
  }, [results])

  const gapReports = useMemo(() => {
    const categoryRows: Array<{ person: string; dept: string; category: string; self: number; peer: number; diff: number }> = []
    const questionRows: Array<{ person: string; dept: string; category: string; question: string; self: number; peer: number; diff: number }> = []

    results.forEach((r) => {
      ;(r.categoryCompare || []).forEach((c: any) => {
        const self = Number(c?.self || 0)
        const peer = Number(c?.peer || 0)
        if (!(self > 0 && peer > 0)) return
        const diff = Number(c?.diff ?? (self - peer))
        categoryRows.push({ person: r.targetName, dept: r.targetDept, category: String(c?.name || ''), self, peer, diff })
      })
      const qMap = r.categoryQuestions || {}
      Object.values(qMap).forEach((qs) => {
        ;(qs || []).forEach((q: any) => {
          const selfCount = Number(q?.selfCount || 0)
          const peerCount = Number(q?.peerCount || 0)
          if (!(selfCount > 0 && peerCount > 0)) return
          const self = Number(q?.self || 0)
          const peer = Number(q?.peer || 0)
          const diff = Number(q?.diff ?? (self - peer))
          const catLabel = String(q?.categoryLabel || q?.categoryKey || '')
          questionRows.push({
            person: r.targetName,
            dept: r.targetDept,
            category: catLabel,
            question: String(q?.questionText || ''),
            self,
            peer,
            diff,
          })
        })
      })
    })

    const byAbsDesc = <T extends { diff: number }>(a: T, b: T) => Math.abs(b.diff) - Math.abs(a.diff)
    categoryRows.sort(byAbsDesc)
    questionRows.sort(byAbsDesc)

    return {
      topCategoryGaps: categoryRows.slice(0, 25),
      topQuestionGaps: questionRows.slice(0, 25),
    }
  }, [results])

  const deptHeatmap = useMemo(() => {
    // Team avg (peer) heatmap by department × category
    const deptMap = new Map<string, Map<string, { sum: number; count: number }>>()
    const categoriesSet = new Set<string>()
    results.forEach((r) => {
      const dept = String(r.targetDept || '-').trim() || '-'
      ;(r.categoryCompare || []).forEach((c: any) => {
        const cat = String(c?.name || '').trim()
        if (!cat) return
        const peer = Number(c?.peer || 0)
        if (!Number.isFinite(peer) || peer <= 0) return
        categoriesSet.add(cat)
        const d = deptMap.get(dept) || new Map<string, { sum: number; count: number }>()
        const cur = d.get(cat) || { sum: 0, count: 0 }
        cur.sum += peer
        cur.count += 1
        d.set(cat, cur)
        deptMap.set(dept, d)
      })
    })
    const categories = Array.from(categoriesSet.values()).sort((a, b) => a.localeCompare(b))
    const departments = Array.from(deptMap.keys()).sort((a, b) => a.localeCompare(b))
    const value = (dept: string, cat: string) => {
      const cur = deptMap.get(dept)?.get(cat)
      if (!cur?.count) return null
      return Math.round((cur.sum / cur.count) * 10) / 10
    }
    const color = (v: number | null) => {
      if (v === null) return 'bg-[var(--surface-2)]'
      if (v >= 4) return 'bg-emerald-100 text-emerald-900'
      if (v >= 3) return 'bg-blue-100 text-blue-900'
      if (v >= 2) return 'bg-amber-100 text-amber-900'
      return 'bg-rose-100 text-rose-900'
    }
    return { categories, departments, value, color }
  }, [results])

  const LEADERBOARD_N = 10
  const peopleLeaderboard = useMemo(() => {
    if (!results.length) return { top: [] as Array<{ name: string; dept: string; score: number }>, bottom: [] as Array<{ name: string; dept: string; score: number }> }
    const sortedDesc = [...results].sort((a, b) => Number(b.overallAvg || 0) - Number(a.overallAvg || 0))
    const sortedAsc = [...results].sort((a, b) => Number(a.overallAvg || 0) - Number(b.overallAvg || 0))
    const mapRow = (r: ResultData) => ({
      name: r.targetName,
      dept: r.targetDept,
      score: Math.round(Number(r.overallAvg || 0) * 10) / 10,
    })
    return {
      top: sortedDesc.slice(0, LEADERBOARD_N).map(mapRow),
      bottom: sortedAsc.slice(0, LEADERBOARD_N).map(mapRow),
    }
  }, [results])

  const departmentRankings = useMemo(() => {
    type Agg = { sum: number; count: number; people: Array<{ name: string; score: number }> }
    const map = new Map<string, Agg>()
    results.forEach((r) => {
      const dept = String(r.targetDept || '-').trim() || '-'
      const score = Number(r.overallAvg || 0)
      const cur = map.get(dept) || { sum: 0, count: 0, people: [] }
      cur.sum += score
      cur.count += 1
      cur.people.push({ name: r.targetName, score: Math.round(score * 10) / 10 })
      map.set(dept, cur)
    })
    const rows = Array.from(map.entries()).map(([department, v]) => {
      const avgOverall = v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0
      const sortedP = [...v.people].sort((a, b) => b.score - a.score)
      const best = sortedP[0]
      const worst = sortedP[sortedP.length - 1]
      return {
        department,
        peopleCount: v.count,
        avgOverall,
        bestPerson: best?.name || '—',
        bestScore: best?.score ?? 0,
        worstPerson: worst?.name || '—',
        worstScore: worst?.score ?? 0,
      }
    })
    rows.sort((a, b) => b.avgOverall - a.avgOverall)
    return rows.map((r, idx) => ({ ...r, rank: idx + 1 }))
  }, [results])

  /** matrix-data: dönemler created_at desc → seçilenden bir sonraki = daha eski önceki dönem */
  const previousPeriodMeta = useMemo(() => {
    const idx = periods.findIndex((p) => String(p.id) === String(selectedPeriod))
    if (idx < 0 || idx >= periods.length - 1) return null
    const p = periods[idx + 1]
    return { id: p.id, name: p.name }
  }, [periods, selectedPeriod])

  const periodComparisonTrend = useMemo(() => {
    if (!results.length || !prevResults.length) {
      return {
        peopleUp: [] as Array<{ name: string; dept: string; cur: number; prev: number; delta: number }>,
        peopleDown: [] as Array<{ name: string; dept: string; cur: number; prev: number; delta: number }>,
        deptMoves: [] as Array<{ department: string; cur: number; prev: number; delta: number; nCur: number; nPrev: number }>,
      }
    }
    const prevByTarget = new Map<string, number>()
    prevResults.forEach((r) => {
      prevByTarget.set(String(r.targetId), Number(r.overallAvg || 0))
    })
    const people: Array<{ name: string; dept: string; cur: number; prev: number; delta: number }> = []
    results.forEach((r) => {
      const pid = String(r.targetId)
      if (!prevByTarget.has(pid)) return
      const prev = prevByTarget.get(pid)!
      const cur = Number(r.overallAvg || 0)
      const delta = Math.round((cur - prev) * 10) / 10
      people.push({
        name: r.targetName,
        dept: r.targetDept,
        cur: Math.round(cur * 10) / 10,
        prev: Math.round(prev * 10) / 10,
        delta,
      })
    })
    const byDeltaDesc = [...people].sort((a, b) => b.delta - a.delta)
    const byDeltaAsc = [...people].sort((a, b) => a.delta - b.delta)
    const TREND_N = 8
    const peopleUp = byDeltaDesc.filter((x) => x.delta > 0).slice(0, TREND_N)
    const peopleDown = byDeltaAsc.filter((x) => x.delta < 0).slice(0, TREND_N)

    const deptAgg = (rows: ResultData[]) => {
      const m = new Map<string, { sum: number; count: number }>()
      rows.forEach((r) => {
        const d = String(r.targetDept || '-').trim() || '-'
        const cur = m.get(d) || { sum: 0, count: 0 }
        cur.sum += Number(r.overallAvg || 0)
        cur.count += 1
        m.set(d, cur)
      })
      return m
    }
    const curD = deptAgg(results)
    const prevD = deptAgg(prevResults)
    const deptKeys = new Set<string>([...curD.keys(), ...prevD.keys()])
    const deptMoves: Array<{ department: string; cur: number; prev: number; delta: number; nCur: number; nPrev: number }> = []
    deptKeys.forEach((department) => {
      const c = curD.get(department)
      const p = prevD.get(department)
      const nCur = c?.count ?? 0
      const nPrev = p?.count ?? 0
      if (!nCur || !nPrev) return
      const curAvg = Math.round((c!.sum / nCur) * 10) / 10
      const prevAvg = Math.round((p!.sum / nPrev) * 10) / 10
      deptMoves.push({
        department,
        cur: curAvg,
        prev: prevAvg,
        delta: Math.round((curAvg - prevAvg) * 10) / 10,
        nCur,
        nPrev,
      })
    })
    deptMoves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    return { peopleUp, peopleDown, deptMoves }
  }, [results, prevResults])

  /** Kategori bazında ekip (peer) puanına göre en iyi / en düşük kişiler — mini kartlar */
  const categoryPeerHighlights = useMemo(() => {
    const catNames = new Set<string>()
    results.forEach((r) => {
      ;(r.categoryCompare || []).forEach((c: any) => {
        const name = String(c?.name || '').trim()
        if (name) catNames.add(name)
      })
    })
    const names = Array.from(catNames)
    const blocks = names
      .map((cat) => {
        const rows: Array<{ name: string; dept: string; peer: number }> = []
        results.forEach((r) => {
          const cc = (r.categoryCompare || []).find((c: any) => String(c?.name || '') === cat)
          const peer = Number(cc?.peer || 0)
          if (peer > 0) rows.push({ name: r.targetName, dept: r.targetDept, peer: Math.round(peer * 10) / 10 })
        })
        rows.sort((a, b) => b.peer - a.peer)
        return { cat, rows, count: rows.length }
      })
      .filter((b) => b.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
    return blocks.map(({ cat, rows }) => ({
      cat,
      top: rows.slice(0, 3),
      bottom: [...rows].sort((a, b) => a.peer - b.peer).slice(0, 3),
    }))
  }, [results])
  

  const riskScorecard = useMemo(() => {
    const prevByTarget = new Map<string, number>()
    prevResults.forEach((r) => prevByTarget.set(String(r.targetId), Number(r.overallAvg || 0)))

    const rows = results.map((r) => {
      const overall = Number(r.overallAvg || 0)
      const lowScoreRisk = clamp01((3.5 - overall) / 2.5)
      const prev = prevByTarget.get(String(r.targetId))
      const delta = prev === undefined ? 0 : Number((overall - prev).toFixed(1))
      const trendRisk = prev === undefined ? 0.5 : clamp01((0 - delta) / 1.2)

      const peerGaps = (r.categoryCompare || [])
        .map((c) => Math.abs(Number(c?.diff || 0)))
        .filter((n) => Number.isFinite(n))
      const avgGap = peerGaps.length ? peerGaps.reduce((a, b) => a + b, 0) / peerGaps.length : 0
      const gapRisk = clamp01(avgGap / 1.5)

      const peerEvalCount = (r.evaluations || []).filter((e) => !e.isSelf && Number(e.avgScore || 0) > 0).length
      const coverageRisk = clamp01((4 - Math.min(4, peerEvalCount)) / 4)

      const weighted = normalizeWeights(analyticsWeights)
      const riskScore = Math.round(
        100 * (
          weighted.riskOverall * lowScoreRisk +
          weighted.riskTrend * trendRisk +
          weighted.riskGap * gapRisk +
          weighted.riskCoverage * coverageRisk
        )
      )

      return {
        targetId: r.targetId,
        name: r.targetName,
        dept: r.targetDept,
        overall: Math.round(overall * 10) / 10,
        delta,
        avgGap: Math.round(avgGap * 10) / 10,
        peerEvalCount,
        riskScore,
        explain: {
          lowScore: Math.round(lowScoreRisk * 100),
          trend: Math.round(trendRisk * 100),
          gap: Math.round(gapRisk * 100),
          coverage: Math.round(coverageRisk * 100),
        },
      }
    })

    rows.sort((a, b) => b.riskScore - a.riskScore)
    return rows
  }, [results, prevResults, analyticsWeights])

  const organizationHealth = useMemo(() => {
    if (!results.length) {
      return { score: 0, parts: { performance: 0, participation: 0, coverage: 0, trend: 0 } }
    }

    const avgOverall = results.reduce((s, r) => s + Number(r.overallAvg || 0), 0) / results.length
    const perfScore = clamp01(avgOverall / 5)

    const participationRate = participation?.totals?.total
      ? Number(participation.totals.completed || 0) / Number(participation.totals.total || 1)
      : 0.75

    const coverageRows = coverage || []
    const coverageScore = coverageRows.length
      ? coverageRows.reduce((acc, r) => {
          const nonSelf = Number(r.managerCompleted || 0) + Number(r.peerCompleted || 0) + Number(r.subordinateCompleted || 0) + Number(r.executiveCompleted || 0)
          return acc + clamp01(nonSelf / 5)
        }, 0) / coverageRows.length
      : 0.7

    const trendRows = periodComparisonTrend.deptMoves
    const trendScore = trendRows.length
      ? trendRows.reduce((acc, r) => acc + clamp01((r.delta + 1) / 2), 0) / trendRows.length
      : 0.6

    const w = normalizeWeights(analyticsWeights)
    const overall = Math.round(100 * (
      w.healthPerformance * perfScore +
      w.healthParticipation * participationRate +
      w.healthCoverage * coverageScore +
      w.healthTrend * trendScore
    ))

    return {
      score: overall,
      parts: {
        performance: Math.round(perfScore * 100),
        participation: Math.round(participationRate * 100),
        coverage: Math.round(coverageScore * 100),
        trend: Math.round(trendScore * 100),
      },
    }
  }, [results, participation, coverage, periodComparisonTrend.deptMoves, analyticsWeights])

  const earlyWarnings = useMemo(() => {
    const out: Array<{ level: 'high' | 'medium'; title: string; detail: string }> = []
    const highRisk = riskScorecard.filter((r) => r.riskScore >= 70).slice(0, 5)
    highRisk.forEach((r) => {
      out.push({
        level: 'high',
        title: `${r.name} (${r.dept})`,
        detail: `Risk ${r.riskScore}/100 | Skor ${r.overall.toFixed(1)} | Δ ${r.delta.toFixed(1)} | Gap ${r.avgGap.toFixed(1)}`
      })
    })

    riskScorecard
      .filter((r) => r.overall <= analyticsWeights.warningLowScoreThreshold)
      .slice(0, 3)
      .forEach((r) => {
        out.push({
          level: 'medium',
          title: `Düşük skor eşiği: ${r.name}` ,
          detail: `Genel skor ${r.overall.toFixed(1)} (eşik ${analyticsWeights.warningLowScoreThreshold.toFixed(1)})`,
        })
      })

    periodComparisonTrend.deptMoves
      .filter((d) => d.delta <= analyticsWeights.warningDropThreshold)
      .slice(0, 5)
      .forEach((d) => {
        out.push({
          level: 'medium',
          title: `Birim düşüşü: ${d.department}`,
          detail: `Önceki ${d.prev.toFixed(1)} → Şimdi ${d.cur.toFixed(1)} (Δ ${d.delta.toFixed(1)})`,
        })
      })

    if (organizationHealth.score < 60) {
      out.push({
        level: 'high',
        title: 'Organizasyon sağlık indeksi kritik seviyede',
        detail: `Genel skor ${organizationHealth.score}/100`,
      })
    }

    if (!out.length) {
      out.push({
        level: 'medium',
        title: 'Acil uyarı yok',
        detail: 'Mevcut eşiklerde kritik bir durum gözlenmedi.',
      })
    }

    return out.slice(0, 10)
  }, [riskScorecard, periodComparisonTrend.deptMoves, organizationHealth.score, analyticsWeights.warningDropThreshold])

  const printPerson = (targetId: string) => {
    const el = document.getElementById(`admin-report-${targetId}`)
    if (!el) return
    const row = results.find((r) => String(r.targetId) === String(targetId))
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    const namePlain = row?.targetName?.trim() || ''
    const titleText = namePlain ? `VISIO 360° — ${namePlain.slice(0, 120)}` : 'VISIO 360° Rapor'
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<html><head><title>${escapeHtmlForPrint(titleText)}</title>`)
    w.document.write('<style>')
    w.document.write('body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:24px;color:#111;line-height:1.4}')
    w.document.write('h1{margin:0 0 8px 0;font-size:20px}')
    w.document.write('.print-identity{margin:0 0 16px 0;padding:12px 16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;line-height:1.6}')
    w.document.write('.print-identity div{margin:2px 0}')
    w.document.write('.print-identity strong{display:inline-block;min-width:150px;color:#374151;font-weight:600}')
    w.document.write('p.meta{margin:0 0 24px 0;color:#666;font-size:12px}')
    w.document.write('table{width:100%;border-collapse:collapse;margin:16px 0 24px 0}')
    w.document.write('th,td{border:1px solid #e5e7eb;padding:10px;text-align:left;font-size:12px}')
    w.document.write('th{background:#f9fafb}')
    w.document.write('.badge{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid #e5e7eb;font-size:11px;color:#111}')
    w.document.write('.print-report-body>*{margin-bottom:28px;page-break-inside:avoid}')
    w.document.write('.print-report-body table{margin:16px 0 24px 0}')
    w.document.write('@media print{body{padding:16px}.print-report-body>*{margin-bottom:24px}button{display:none!important}}')
    w.document.write('</style></head><body>')
    w.document.write(`<h1>VISIO 360° Performans Değerlendirme Raporu</h1>`)
    w.document.write('<div class="print-identity">')
    w.document.write(`<div><strong>Değerlendirilen</strong> ${escapeHtmlForPrint(row?.targetName || '—')}</div>`)
    w.document.write(`<div><strong>Birim / Departman</strong> ${escapeHtmlForPrint(row?.targetDept || '—')}</div>`)
    w.document.write(`<div><strong>Dönem</strong> ${escapeHtmlForPrint(periodLabel || '—')}</div>`)
    w.document.write('</div>')
    w.document.write(`<p class="meta">Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}</p>`)
    w.document.write('<div class="print-report-body">')
    w.document.write(el.innerHTML)
    w.document.write('</div>')
    w.document.write('</body></html>')
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  const loadOrgScopedData = useCallback(async (orgId: string) => {
    try {
      const qs = new URLSearchParams({ org_id: String(orgId || '') })
      const resp = await fetch(`/api/admin/matrix-data?${qs.toString()}`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Kurum verisi alınamadı')

    setPeriods(((payload.periods || []) as any[]).map((p) => ({ id: String(p.id), name: periodName(p) })))
      setUsers(((payload.users || []) as any[]).map((u) => ({ id: String(u.id), name: String(u.name || ''), department: (u as any)?.department ?? null })))
      setDepartments(Array.isArray(payload.departments) ? payload.departments.map((d: any) => String(d)) : [])
    } catch (e: any) {
      // Navigation away / tab change can abort fetch; don't show noisy errors.
      const msg = String(e?.message || '')
      if (e?.name === 'AbortError' || msg.toLowerCase().includes('aborted')) return
      toast(msg || 'Kurum verisi alınamadı', 'error')
    }
  }, [periodName])

  const loadInitialData = useCallback(async () => {
    try {
      // KVKK: Do not expose cross-org organization list on the client for org_admin users.
      // Always fetch org list server-side (session-aware).
      const orgResp = await fetch('/api/admin/orgs', { method: 'GET' })
      const orgPayload = (await orgResp.json().catch(() => ({}))) as any
      if (!orgResp.ok || !orgPayload?.success) throw new Error(orgPayload?.error || 'Kurumlar alınamadı')
      const orgs = (orgPayload.organizations || []) as Array<{ id: string; name: string }>
      setOrganizations(orgs)

      // Keep selection consistent with user's fixed org context (org_admin) or layout selection (super_admin).
      const fixedOrg = String(userOrgId || '').trim()
      if (userRole === 'org_admin' && fixedOrg) {
        setSelectedOrg(fixedOrg)
      } else if (organizationId && !selectedOrg) {
        setSelectedOrg(organizationId)
      }

      const orgToUse = (userRole === 'org_admin' ? fixedOrg : (selectedOrg || organizationId)) || ''
      if (orgToUse) await loadOrgScopedData(orgToUse)
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (e?.name === 'AbortError' || msg.toLowerCase().includes('aborted')) return
      toast(msg || 'Veri alınamadı', 'error')
    }
  }, [loadOrgScopedData, organizationId, selectedOrg, userOrgId, userRole])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  useEffect(() => {
    // Org scoped data (periods + users) should follow selected org.
    const orgToUse = selectedOrg || organizationId
    if (!orgToUse) {
      setPeriods([])
      setUsers([])
      return
    }
    loadOrgScopedData(orgToUse)
  }, [selectedOrg, organizationId, loadOrgScopedData])

  const loadResults = async (opts?: { includePeerDetail?: boolean }) => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }

    const includePeer = opts?.includePeerDetail !== undefined ? opts.includePeerDetail : showPeerDetail

    const bodyBase = {
      org_id: orgToUse,
      person_id: selectedPerson || null,
      department: selectedDept || null,
      include_peer_detail: includePeer,
    }

    setLoading(true)
    try {
      const idx = periods.findIndex((p) => String(p.id) === String(selectedPeriod))
      const prevPeriodId =
        idx >= 0 && idx < periods.length - 1 ? String(periods[idx + 1].id) : null

      const fetchResults = (period_id: string) =>
        fetch(`/api/admin/results?lang=${encodeURIComponent(lang)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...bodyBase, period_id }),
        }).then(async (resp) => {
          const payload = (await resp.json().catch(() => ({}))) as any
          return { resp, payload }
        })

      // KVKK: results are now fetched server-side (service role) so we can apply strict RLS on evaluation tables.
      const [main, prev] = await Promise.all([
        fetchResults(selectedPeriod),
        prevPeriodId ? fetchResults(prevPeriodId) : Promise.resolve({ resp: null as any, payload: null as any }),
      ])

      if (!main.resp.ok || !main.payload?.success) {
        throw new Error(main.payload?.error || 'Rapor alınamadı')
      }
      const rows = (main.payload.results || []) as ResultData[]
      setResults(rows)
      setPeerEvaluatorsVisible(main.payload.peerEvaluatorsVisible === true)
      setExpandedPerson(rows[0]?.targetId || null)
      setParticipation(null)

      if (prevPeriodId && prev?.payload) {
        if (prev.resp.ok && prev.payload?.success) {
          setPrevResults((prev.payload.results || []) as ResultData[])
        } else {
          setPrevResults([])
        }
      } else {
        setPrevResults([])
      }
      return

      /*
      Legacy client-side results computation (disabled for KVKK/RLS hardening).
      Kept temporarily for reference.
      
      // Tamamlanmış atamaları getir
      const assignQuery = supabase
        .from('evaluation_assignments')
        .select(`
          *,
          evaluator:evaluator_id(id, name, department, organization_id, position_level),
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

      // Uluslararası standart skorları (opsiyonel)
      type StdScoreRow = {
        assignment_id: string
        score: number
        standard?: { title?: string | null; code?: string | null } | null
      }
      const { data: stdScores } = await supabase
        .from('international_standard_scores')
        .select('assignment_id, score, standard:standard_id(title,code)')
        .in('assignment_id', assignmentIds)

      // Katsayılar (org override varsa onu kullan, yoksa default org=null)
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

      const [orgEval, defEval, orgCatW, defCatW] = await Promise.all([
        supabase.from('evaluator_weights').select('position_level,weight').eq('organization_id', orgToUse).order('created_at', { ascending: false }),
        supabase.from('evaluator_weights').select('position_level,weight').is('organization_id', null).order('created_at', { ascending: false }),
        supabase.from('category_weights').select('category_name,weight').eq('organization_id', orgToUse),
        supabase.from('category_weights').select('category_name,weight').is('organization_id', null),
      ])

      // Güven + Sapma ayarları (defaultlar Word'e göre)
      let confidenceMinHigh = 5
      let deviation = {
        lenient_diff_threshold: 0.75,
        harsh_diff_threshold: 0.75,
        lenient_multiplier: 0.85,
        harsh_multiplier: 1.15,
      }

      const [conf, dev] = await Promise.all([
        supabase.from('confidence_settings').select('min_high_confidence_evaluator_count').eq('organization_id', orgToUse).maybeSingle(),
        supabase.from('deviation_settings').select('lenient_diff_threshold,harsh_diff_threshold,lenient_multiplier,harsh_multiplier').eq('organization_id', orgToUse).maybeSingle(),
      ])

      if (!conf.error && conf.data) {
        confidenceMinHigh = Number((conf.data as any).min_high_confidence_evaluator_count ?? 5) || 5
      }
      if (!dev.error && dev.data) {
        deviation = {
          lenient_diff_threshold: Number((dev.data as any).lenient_diff_threshold ?? 0.75),
          harsh_diff_threshold: Number((dev.data as any).harsh_diff_threshold ?? 0.75),
          lenient_multiplier: Number((dev.data as any).lenient_multiplier ?? 0.85),
          harsh_multiplier: Number((dev.data as any).harsh_multiplier ?? 1.15),
        }
      }

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

      const weightForEval = (e: { isSelf: boolean; evaluatorLevel?: string }) => {
        const k = e.isSelf ? 'self' : (e.evaluatorLevel || 'peer')
        return Number(evaluatorWeightByLevel[k] ?? 1)
      }

      const weightedAvg = (rows: Array<{ w: number; v: number }>) => {
        const sumW = rows.reduce((s, r) => s + (r.w || 0), 0)
        if (!sumW) return 0
        return rows.reduce((s, r) => s + (r.v || 0) * (r.w || 0), 0) / sumW
      }

      // Kişi bazlı grupla
      const resultMap: Record<string, ResultData> = {}

      type AssignmentRow = {
        id: string
        evaluator_id: string
        target_id: string
        evaluator?: { id: string; name: string; department?: string | null; organization_id?: string | null; position_level?: 'executive' | 'manager' | 'peer' | 'subordinate' | null } | null
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
      const typedStdScores = (stdScores || []) as unknown as StdScoreRow[]

      const assignmentToTarget = new Map<string, string>()
      typedAssignments.forEach((a) => assignmentToTarget.set(a.id, a.target_id))

      const stdAggByTarget = new Map<string, { sum: number; count: number }>()
      const stdByTitleByTarget = new Map<string, Map<string, { title: string; code: string | null; sum: number; count: number }>>()

      typedStdScores.forEach((r) => {
        const tid = assignmentToTarget.get(r.assignment_id)
        if (!tid) return
        const s = Number(r.score || 0)
        if (!s) return
        const agg = stdAggByTarget.get(tid) || { sum: 0, count: 0 }
        agg.sum += s
        agg.count += 1
        stdAggByTarget.set(tid, agg)

        const title = String(r.standard?.title || 'Standart').trim()
        const code = (r.standard?.code || null) as string | null
        const key = `${code || ''}||${title}`
        const map = stdByTitleByTarget.get(tid) || new Map()
        const a2 = map.get(key) || { title, code, sum: 0, count: 0 }
        a2.sum += s
        a2.count += 1
        map.set(key, a2)
        stdByTitleByTarget.set(tid, map)
      })

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
            standardAvg: 0,
            standardCount: 0,
            standardByTitle: [],
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

        const evaluatorLevel = isSelf ? 'self' : (assignment.evaluator?.position_level || 'peer')

        resultMap[targetId].evaluations.push({
          evaluatorId,
          evaluatorName,
          isSelf,
          evaluatorLevel,
          avgScore,
          categories
        })
      })

      // Standart özetlerini kişi bazına yaz
      stdAggByTarget.forEach((agg, tid) => {
        const r = resultMap[tid]
        if (!r) return
        r.standardCount = agg.count
        r.standardAvg = agg.count ? Math.round((agg.sum / agg.count) * 10) / 10 : 0
      })
      stdByTitleByTarget.forEach((m, tid) => {
        const r = resultMap[tid]
        if (!r) return
        r.standardByTitle = Array.from(m.values())
          .map((x) => ({
            title: x.code ? `${x.code} — ${x.title}` : x.title,
            avg: x.count ? Math.round((x.sum / x.count) * 10) / 10 : 0,
            count: x.count,
          }))
          .sort((a, b) => b.avg - a.avg)
      })

      // Genel ortalamaları hesapla
      Object.values(resultMap).forEach(result => {
        const selfEval = result.evaluations.find(e => e.isSelf)
        const peerEvals = result.evaluations.filter(e => !e.isSelf)
        
        result.selfScore = selfEval?.avgScore || 0
        result.peerAvg = peerEvals.length > 0
          ? Math.round(
              weightedAvg(peerEvals.map((e) => ({ w: weightForEval(e), v: e.avgScore }))) * 10
            ) / 10
          : 0

        // Confidence coefficient (peer count)
        const minHigh = Math.max(1, Math.floor(confidenceMinHigh || 5))
        const peerCount = peerEvals.length
        const confidenceCoeff = Math.min(1, peerCount / minHigh)

        // Deviation correction based on peer mean
        const peerMean = peerEvals.length
          ? peerEvals.reduce((s, e) => s + (e.avgScore || 0), 0) / peerEvals.length
          : 0
        const deviationMult = (e: { isSelf: boolean; avgScore: number }) => {
          if (e.isSelf || !peerEvals.length) return 1
          const diff = (e.avgScore || 0) - peerMean
          if (diff > deviation.lenient_diff_threshold) return deviation.lenient_multiplier
          if (-diff > deviation.harsh_diff_threshold) return deviation.harsh_multiplier
          return 1
        }

        const perfOverall = result.evaluations.length > 0
          ? Math.round(
              weightedAvg(result.evaluations.map((e) => ({ w: weightForEval(e) * deviationMult(e as any), v: e.avgScore }))) * 10
            ) / 10
          : 0

        result.overallAvg = Math.round((perfOverall * confidenceCoeff) * 10) / 10 || result.peerAvg || result.selfScore

        // Kategori bazlı öz vs ekip karşılaştırması + SWOT
        const selfAgg: Record<string, { sum: number; w: number }> = {}
        const peerAgg: Record<string, { sum: number; w: number }> = {}

        result.evaluations.forEach(e => {
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
        result.categoryCompare = Array.from(catNames).map((name) => {
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

        const selfItems = result.categoryCompare.map(c => ({ name: c.name, score: c.self }))
        const peerItems = result.categoryCompare.map(c => ({ name: c.name, score: c.peer }))
        result.swot = { self: mkSwot(selfItems), peer: mkSwot(peerItems) }
      })

      // Sonuçları sırala
      const sortedResults = Object.values(resultMap).sort((a, b) => b.overallAvg - a.overallAvg)
      setResults(sortedResults)

      */
    } catch (error) {
      console.error('Results error:', error)
      toast('Sonuçlar yüklenemedi', 'error')
      setPrevResults([])
    } finally {
      setLoading(false)
    }
  }

  const loadParticipation = async () => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }
    try {
      const resp = await fetch('/api/admin/participation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriod, org_id: orgToUse }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Katılım raporu alınamadı')
      setParticipation({
        totals: payload.totals || { total: 0, completed: 0, pending: 0 },
        departments: Array.isArray(payload.departments) ? payload.departments : [],
      })
    } catch (e: any) {
      toast(String(e?.message || 'Katılım raporu alınamadı'), 'error')
    }
  }

  const loadCoverage = async () => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }
    try {
      const resp = await fetch('/api/admin/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriod, org_id: orgToUse }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Kapsama raporu alınamadı')
      setCoverage(Array.isArray(payload.rows) ? payload.rows : [])
    } catch (e: any) {
      toast(String(e?.message || 'Kapsama raporu alınamadı'), 'error')
    }
  }

  const reopenAssignment = async (assignmentId?: string) => {
    const id = String(assignmentId || '').trim()
    if (!id) {
      toast(lang === 'en' ? 'Assignment id missing' : lang === 'fr' ? "ID d'affectation manquant" : 'Atama ID eksik', 'error')
      return
    }
    const ok = window.confirm(
      lang === 'en'
        ? 'Reopen this evaluation? This will clear previously saved answers and set the assignment back to pending.'
        : lang === 'fr'
          ? "Rouvrir cette évaluation ? Cela effacera les réponses enregistrées et remettra l'affectation en attente."
          : 'Bu değerlendirme yeniden açılsın mı? Kaydedilmiş yanıtlar silinir ve atama tekrar beklemede durumuna alınır.'
    )
    if (!ok) return
    setReopeningAssignmentId(id)
    try {
      const resp = await fetch('/api/admin/assignments/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: id, clear_data: true }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        throw new Error(payload?.error || 'Reopen failed')
      }
      toast(lang === 'en' ? 'Reopened' : lang === 'fr' ? 'Réouvert' : 'Yeniden açıldı', 'success')
      // Refresh results to reflect pending status / removed rows
      await loadResults()
    } catch (e: any) {
      toast(String(e?.message || 'İşlem başarısız'), 'error')
    } finally {
      setReopeningAssignmentId(null)
    }
  }

  const exportToExcel = () => {
    if (results.length === 0) {
      toast(t('exportNoData', lang), 'error')
      return
    }

    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    // CSV formatında export
    let csv = `"Dönem","${String(periodLabel).replace(/"/g, '""')}"\n`
    csv += 'Kişi,Departman,Öz Değerlendirme,Peer Ortalama,Genel Ortalama,Değerlendiren Sayısı\n'
    
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
    
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportCategoryCompareToExcel = (result: ResultData) => {
    const rows = (result?.categoryCompare || []) as Array<{ name: string; self: number; peer: number; diff: number }>
    if (!rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }

    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    const safe = (v: any) => String(v ?? '')
    const esc = (v: any) => `"${safe(v).replace(/"/g, '""')}"`
    const sep = ';'

    let csv = ''
    csv += `Kişi${sep}${esc(result.targetName)}\n`
    csv += `Birim${sep}${esc(result.targetDept)}\n`
    csv += `Dönem${sep}${esc(periodLabel)}\n`
    csv += '\n'
    csv +=
      [
        'Period',
        'Person',
        'Department',
        'Category',
        'Self (5)',
        'Self (%)',
        'Team (5)',
        'Team (%)',
        'Diff',
        'Status',
      ].join(sep) + '\n'

    rows.forEach((c) => {
      const status =
        c.self === 0 ? t('selfMissing', lang) :
        c.peer === 0 ? t('teamMissing', lang) :
        c.diff > 0.5 ? (lang === 'fr' ? 'Se surestime' : lang === 'en' ? 'Overestimates' : 'Yüksek görüyor') :
        c.diff < -0.5 ? (lang === 'fr' ? 'Se sous-estime' : lang === 'en' ? 'Underestimates' : 'Düşük görüyor') :
        (lang === 'fr' ? 'Cohérent' : lang === 'en' ? 'Consistent' : 'Tutarlı')

      const self5 = c.self ? Number(c.self) : 0
      const peer5 = c.peer ? Number(c.peer) : 0
      const selfPct = self5 ? Math.round((self5 / 5) * 100) : 0
      const peerPct = peer5 ? Math.round((peer5 / 5) * 100) : 0
      const diff = self5 && peer5 ? Number(c.diff) : 0

      csv +=
        [
          esc(periodLabel),
          esc(result.targetName),
          esc(result.targetDept),
          esc(c.name),
          self5 ? String(self5.toFixed(1)) : '',
          self5 ? String(selfPct) : '',
          peer5 ? String(peer5.toFixed(1)) : '',
          peer5 ? String(peerPct) : '',
          self5 && peer5 ? String(diff.toFixed(1)) : '',
          esc(status),
        ].join(sep) + '\n'
    })

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = String(result.targetName || 'person')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 120) || 'person'
    a.download = `kategori_karsilastirma_${selectedPeriod || 'period'}_${safeName}.csv`
    a.click()
    URL.revokeObjectURL(url)

    toast(t('excelDownloaded', lang), 'success')
  }

  const exportAllCategoryCompareToExcel = () => {
    if (results.length === 0) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const periodLabel = periods.find((p) => String(p.id) === String(selectedPeriod))?.name || selectedPeriod || ''
    const safe = (v: any) => String(v ?? '')
    const esc = (v: any) => `"${safe(v).replace(/"/g, '""')}"`
    const sep = ';'

    let csv = ''
    csv += `Dönem${sep}${esc(periodLabel)}\n`
    csv += '\n'
    csv +=
      [
        'Period',
        'Person',
        'Department',
        'Category',
        'Self (5)',
        'Self (%)',
        'Team (5)',
        'Team (%)',
        'Diff',
        'Status',
      ].join(sep) + '\n'

    results.forEach((r) => {
      const rows = (r?.categoryCompare || []) as Array<{ name: string; self: number; peer: number; diff: number }>
      rows.forEach((c) => {
        const status =
          c.self === 0 ? t('selfMissing', lang) :
          c.peer === 0 ? t('teamMissing', lang) :
          c.diff > 0.5 ? (lang === 'fr' ? 'Se surestime' : lang === 'en' ? 'Overestimates' : 'Yüksek görüyor') :
          c.diff < -0.5 ? (lang === 'fr' ? 'Se sous-estime' : lang === 'en' ? 'Underestimates' : 'Düşük görüyor') :
          (lang === 'fr' ? 'Cohérent' : lang === 'en' ? 'Consistent' : 'Tutarlı')

        const self5 = c.self ? Number(c.self) : 0
        const peer5 = c.peer ? Number(c.peer) : 0
        const selfPct = self5 ? Math.round((self5 / 5) * 100) : 0
        const peerPct = peer5 ? Math.round((peer5 / 5) * 100) : 0
        const diff = self5 && peer5 ? Number(c.diff) : 0

        csv +=
          [
            esc(periodLabel),
            esc(r.targetName),
            esc(r.targetDept),
            esc(c.name),
            self5 ? String(self5.toFixed(1)) : '',
            self5 ? String(selfPct) : '',
            peer5 ? String(peer5.toFixed(1)) : '',
            peer5 ? String(peerPct) : '',
            self5 && peer5 ? String(diff.toFixed(1)) : '',
            esc(status),
          ].join(sep) + '\n'
      })
    })

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kategori_karsilastirma_tumu_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)

    toast(t('excelDownloaded', lang), 'success')
  }

  const exportParticipationCsv = () => {
    if (!participation) {
      toast(lang === 'en' ? 'No participation data' : lang === 'fr' ? 'Aucune donnée' : 'Katılım verisi yok', 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += ['Total', participation.totals.total, 'Completed', participation.totals.completed, 'Pending', participation.totals.pending].join(sep) + '\n'
    csv += '\n'
    csv += ['Department', 'Total', 'Completed', 'Pending', 'Completion %'].join(sep) + '\n'
    participation.departments.forEach((d) => {
      const rate = d.total ? Math.round((d.completed / d.total) * 100) : 0
      csv += [esc(d.department), String(d.total), String(d.completed), String(d.pending), String(rate)].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `katilim_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportGapCsv = (kind: 'category' | 'question') => {
    const rows = kind === 'category' ? gapReports.topCategoryGaps : gapReports.topQuestionGaps
    if (!rows.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    if (kind === 'category') {
      csv += ['Person', 'Department', 'Category', 'Self', 'Team', 'Diff'].join(sep) + '\n'
      ;(rows as any[]).forEach((r) => {
        csv += [esc(r.person), esc(r.dept), esc(r.category), String(r.self), String(r.peer), String(r.diff)].join(sep) + '\n'
      })
    } else {
      csv += ['Person', 'Department', 'Category', 'Question', 'Self', 'Team', 'Diff'].join(sep) + '\n'
      ;(rows as any[]).forEach((r) => {
        csv += [esc(r.person), esc(r.dept), esc(r.category), esc(r.question), String(r.self), String(r.peer), String(r.diff)].join(sep) + '\n'
      })
    }
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${kind === 'category' ? 'gap_kategori' : 'gap_soru'}_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportCoverageCsv = () => {
    if (!coverage) {
      toast(lang === 'en' ? 'No coverage data' : lang === 'fr' ? 'Aucune donnée' : 'Kapsama verisi yok', 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += ['Person', 'Department', 'Completed', 'Pending', 'Self', 'Manager', 'Peer', 'Subordinate', 'Executive'].join(sep) + '\n'
    coverage.forEach((r) => {
      csv += [
        esc(r.targetName),
        esc(r.targetDept),
        String(r.completedTotal),
        String(r.pendingTotal),
        String(r.selfCompleted),
        String(r.managerCompleted),
        String(r.peerCompleted),
        String(r.subordinateCompleted),
        String(r.executiveCompleted),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kapsama_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportHeatmapCsv = () => {
    if (!deptHeatmap.departments.length || !deptHeatmap.categories.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'), ...deptHeatmap.categories.map(esc)].join(sep) + '\n'
    deptHeatmap.departments.forEach((d) => {
      const row = [esc(d)]
      deptHeatmap.categories.forEach((c) => {
        const v = deptHeatmap.value(d, c)
        row.push(v === null ? '' : String(v))
      })
      csv += row.join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `heatmap_departman_kategori_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportLeaderboardCsv = () => {
    if (!peopleLeaderboard.top.length && !peopleLeaderboard.bottom.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [esc(lang === 'en' ? 'Type' : lang === 'fr' ? 'Type' : 'Tip'), esc(lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'), esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'), esc(lang === 'en' ? 'Overall' : lang === 'fr' ? 'Global' : 'Genel')].join(sep) + '\n'
    peopleLeaderboard.top.forEach((r) => {
      csv += [esc(lang === 'en' ? 'Top' : lang === 'fr' ? 'Haut' : 'Üst'), esc(r.name), esc(r.dept), String(r.score)].join(sep) + '\n'
    })
    peopleLeaderboard.bottom.forEach((r) => {
      csv += [esc(lang === 'en' ? 'Bottom' : lang === 'fr' ? 'Bas' : 'Alt'), esc(r.name), esc(r.dept), String(r.score)].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `siralama_kisiler_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportDeptRankingCsv = () => {
    if (!departmentRankings.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [
      esc(lang === 'en' ? 'Rank' : lang === 'fr' ? 'Rang' : 'Sıra'),
      esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'),
      esc(lang === 'en' ? 'People' : lang === 'fr' ? 'Personnes' : 'Kişi sayısı'),
      esc(lang === 'en' ? 'Avg overall' : lang === 'fr' ? 'Moy. globale' : 'Ort. genel'),
      esc(lang === 'en' ? 'Best person' : lang === 'fr' ? 'Meilleur' : 'Birimde en yüksek'),
      esc(lang === 'en' ? 'Best score' : lang === 'fr' ? 'Score' : 'Puan'),
      esc(lang === 'en' ? 'Lowest person' : lang === 'fr' ? 'Plus bas' : 'Birimde en düşük'),
      esc(lang === 'en' ? 'Lowest score' : lang === 'fr' ? 'Score' : 'Puan'),
    ].join(sep) + '\n'
    departmentRankings.forEach((r) => {
      csv += [
        String(r.rank),
        esc(r.department),
        String(r.peopleCount),
        String(r.avgOverall),
        esc(r.bestPerson),
        String(r.bestScore),
        esc(r.worstPerson),
        String(r.worstScore),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `siralama_birimler_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportTrendCsv = () => {
    if (!previousPeriodMeta) {
      toast(lang === 'en' ? 'No previous period in list' : lang === 'fr' ? 'Pas de période précédente' : 'Önceki dönem yok', 'error')
      return
    }
    if (!periodComparisonTrend.peopleUp.length && !periodComparisonTrend.peopleDown.length && !periodComparisonTrend.deptMoves.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    const pLabel = esc(
      lang === 'en' ? 'Previous period' : lang === 'fr' ? 'Période précédente' : 'Önceki dönem',
    )
    csv += `${pLabel};${esc(previousPeriodMeta.name)}\n\n`
    csv += [
      esc(lang === 'en' ? 'People — biggest gains' : lang === 'fr' ? 'Personnes — plus fortes hausses' : 'Kişiler — en çok artan'),
      esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'),
      esc(lang === 'en' ? 'Current' : lang === 'fr' ? 'Actuel' : 'Şu an'),
      esc(lang === 'en' ? 'Previous' : lang === 'fr' ? 'Précédent' : 'Önceki'),
      esc(lang === 'en' ? 'Delta' : lang === 'fr' ? 'Delta' : 'Fark'),
    ].join(sep) + '\n'
    periodComparisonTrend.peopleUp.forEach((r) => {
      csv += [esc(r.name), esc(r.dept), String(r.cur), String(r.prev), String(r.delta)].join(sep) + '\n'
    })
    csv += '\n'
    csv += [
      esc(lang === 'en' ? 'People — biggest drops' : lang === 'fr' ? 'Personnes — plus fortes baisses' : 'Kişiler — en çok düşen'),
      esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'),
      esc(lang === 'en' ? 'Current' : lang === 'fr' ? 'Actuel' : 'Şu an'),
      esc(lang === 'en' ? 'Previous' : lang === 'fr' ? 'Précédent' : 'Önceki'),
      esc(lang === 'en' ? 'Delta' : lang === 'fr' ? 'Delta' : 'Fark'),
    ].join(sep) + '\n'
    periodComparisonTrend.peopleDown.forEach((r) => {
      csv += [esc(r.name), esc(r.dept), String(r.cur), String(r.prev), String(r.delta)].join(sep) + '\n'
    })
    csv += '\n'
    csv += [
      esc(lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'),
      esc(lang === 'en' ? 'Current avg' : lang === 'fr' ? 'Moy. actuelle' : 'Ort. şu an'),
      esc(lang === 'en' ? 'Previous avg' : lang === 'fr' ? 'Moy. précédente' : 'Ort. önceki'),
      esc(lang === 'en' ? 'Delta' : lang === 'fr' ? 'Delta' : 'Fark'),
      esc(lang === 'en' ? 'N current' : lang === 'fr' ? 'N actuel' : 'N şu an'),
      esc(lang === 'en' ? 'N previous' : lang === 'fr' ? 'N précédent' : 'N önceki'),
    ].join(sep) + '\n'
    periodComparisonTrend.deptMoves.forEach((r) => {
      csv += [
        esc(r.department),
        String(r.cur),
        String(r.prev),
        String(r.delta),
        String(r.nCur),
        String(r.nPrev),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `donem_karsilastirma_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportCategoryHighlightsCsv = () => {
    if (!categoryPeerHighlights.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    categoryPeerHighlights.forEach((block) => {
      csv += esc(block.cat) + '\n'
      csv += [esc(lang === 'en' ? 'Type' : lang === 'fr' ? 'Type' : 'Tip'), esc(lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'), esc(lang === 'en' ? 'Dept' : lang === 'fr' ? 'Dépt.' : 'Birim'), esc(lang === 'en' ? 'Team avg' : lang === 'fr' ? 'Moy. équipe' : 'Ekip ort.')].join(sep) + '\n'
      block.top.forEach((r) => {
        csv += [esc(lang === 'en' ? 'Top' : lang === 'fr' ? 'Haut' : 'Üst'), esc(r.name), esc(r.dept), String(r.peer)].join(sep) + '\n'
      })
      block.bottom.forEach((r) => {
        csv += [esc(lang === 'en' ? 'Bottom' : lang === 'fr' ? 'Bas' : 'Alt'), esc(r.name), esc(r.dept), String(r.peer)].join(sep) + '\n'
      })
      csv += '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kategori_kisiler_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportRiskScorecardCsv = () => {
    if (!riskScorecard.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [
      esc('Kişi'), esc('Birim'), esc('Risk'), esc('Genel Skor'), esc('Delta'), esc('Gap Ort.'), esc('Kapsama'),
      esc('Risk-Performans'), esc('Risk-Trend'), esc('Risk-Gap'), esc('Risk-Kapsama'),
    ].join(sep) + '\n'
    riskScorecard.forEach((r) => {
      csv += [
        esc(r.name), esc(r.dept), String(r.riskScore), String(r.overall), String(r.delta), String(r.avgGap), String(r.peerEvalCount),
        String(r.explain.lowScore), String(r.explain.trend), String(r.explain.gap), String(r.explain.coverage),
      ].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `risk_scorecard_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportEarlyWarningsCsv = () => {
    if (!earlyWarnings.length) {
      toast(t('exportNoData', lang), 'error')
      return
    }
    const sep = ';'
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    let csv = ''
    csv += [esc('Seviye'), esc('Başlık'), esc('Detay')].join(sep) + '\n'
    earlyWarnings.forEach((w) => {
      csv += [esc(w.level), esc(w.title), esc(w.detail)].join(sep) + '\n'
    })
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `erken_uyari_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const exportHealthCsv = () => {
    const sep = ';'
    let csv = `Metric${sep}Score\n`
    csv += `Organization Health Index${sep}${organizationHealth.score}\n`
    csv += `Performance${sep}${organizationHealth.parts.performance}\n`
    csv += `Participation${sep}${organizationHealth.parts.participation}\n`
    csv += `Coverage${sep}${organizationHealth.parts.coverage}\n`
    csv += `Trend${sep}${organizationHealth.parts.trend}\n`
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `org_health_${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('excelDownloaded', lang), 'success')
  }

  const updateAnalyticsWeight = (key: keyof AnalyticsWeights, value: number) => {
    setAnalyticsWeights((prev) => {
      const next: AnalyticsWeights = {
        ...prev,
        [key]: value,
      }
      return normalizeWeights(next)
    })
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
        <h1 className="text-2xl font-bold text-[var(--foreground)]">📈 {t('resultsReports', lang)}</h1>
        <p className="text-[var(--muted)] mt-1">{t('resultsReportsSubtitle', lang)}</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🔍 {t('filters', lang)}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-64">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{t('period', lang)}</label>
              <Select
                options={periods.map(p => ({ value: p.id, label: p.name }))}
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                placeholder={t('selectPeriodPlaceholder', lang)}
              />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{t('organization', lang)}</label>
              <Select
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                placeholder={t('allOrganizations', lang)}
                disabled={user?.role === 'org_admin'}
              />
            </div>
            <div className="w-56">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{t('departmentLabel', lang)}</label>
              <Select
                options={[{ value: '', label: t('allDepartments', lang) }, ...departments.map((d) => ({ value: d, label: d }))]}
                value={selectedDept}
                onChange={(e) => {
                  const next = e.target.value
                  setSelectedDept(next)
                  // If current person doesn't belong to the selected dept, clear person filter
                  if (next && selectedPerson) {
                    const u = users.find((x) => x.id === selectedPerson)
                    if (!u || String(u.department || '') !== String(next)) setSelectedPerson('')
                  }
                }}
                placeholder={t('allDepartments', lang)}
              />
            </div>
            <div className="w-56">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{t('person', lang)}</label>
              <Select
                options={filteredUsers.map(u => ({ value: u.id, label: u.name }))}
                value={selectedPerson}
                onChange={(e) => setSelectedPerson(e.target.value)}
                placeholder={t('allPeople', lang)}
              />
            </div>
            <Button onClick={() => void loadResults()}>
              <Search className="w-4 h-4" />
              {t('applyFilters', lang)}
            </Button>
            <Button variant="success" onClick={exportToExcel}>
              <Download className="w-4 h-4" />
              {t('exportExcel', lang)}
            </Button>
            <Button variant="secondary" onClick={exportAllCategoryCompareToExcel}>
              <Download className="w-4 h-4" />
              {t('exportCategoryCompareExcel', lang)}
            </Button>
            <Button variant="secondary" onClick={() => void loadParticipation()}>
              <BarChart3 className="w-4 h-4" />
              {lang === 'en' ? 'Participation' : lang === 'fr' ? 'Participation' : 'Katılım'}
            </Button>
            <Button variant="secondary" onClick={() => void loadCoverage()}>
              <User className="w-4 h-4" />
              {lang === 'en' ? 'Coverage' : lang === 'fr' ? 'Couverture' : 'Kapsama'}
            </Button>
          </div>
          <div className="flex flex-wrap items-start gap-3 pt-1 border-t border-[var(--border)]">
            <label className="inline-flex items-start gap-2.5 cursor-pointer text-sm text-[var(--foreground)] max-w-xl">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[var(--border)] w-4 h-4 shrink-0 accent-[var(--brand)]"
                checked={showPeerDetail}
                onChange={(e) => {
                  const checked = e.target.checked
                  setShowPeerDetail(checked)
                  try {
                    localStorage.setItem('adminResultsIncludePeerDetail', checked ? '1' : '0')
                  } catch {
                    /* ignore */
                  }
                  if (selectedPeriod && (selectedOrg || organizationId)) {
                    void loadResults({ includePeerDetail: checked })
                  }
                }}
              />
              <span>
                <span className="font-medium">{t('adminResultsPeerDetailToggleLabel', lang)}</span>
                <span className="block text-xs text-[var(--muted)] mt-1">{t('adminResultsPeerDetailToggleHint', lang)}</span>
              </span>
            </label>
          </div>
          </div>
        </CardBody>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      ) : results.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-[var(--muted)]">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-[var(--muted)]/40" />
            <p>{t('applyFiltersToSeeResults', lang)}</p>
          </CardBody>
        </Card>
      ) : (
        <>
          {participation ? (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{lang === 'en' ? 'Participation report' : lang === 'fr' ? 'Rapport de participation' : 'Katılım raporu'}</CardTitle>
                  <Button variant="secondary" size="sm" onClick={exportParticipationCsv}>
                    <Download className="w-4 h-4" />
                    {t('exportExcel', lang)}
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="text-sm text-[var(--muted)]">{lang === 'en' ? 'Total assignments' : lang === 'fr' ? 'Total des affectations' : 'Toplam atama'}</div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{participation.totals.total}</div>
                  </div>
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="text-sm text-[var(--muted)]">{lang === 'en' ? 'Completed' : lang === 'fr' ? 'Terminées' : 'Tamamlanan'}</div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{participation.totals.completed}</div>
                  </div>
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
                    <div className="text-sm text-[var(--muted)]">{lang === 'en' ? 'Pending' : lang === 'fr' ? 'En attente' : 'Bekleyen'}</div>
                    <div className="text-2xl font-bold text-[var(--foreground)]">{participation.totals.pending}</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Total' : lang === 'fr' ? 'Total' : 'Toplam'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Completed' : lang === 'fr' ? 'Terminées' : 'Tamamlanan'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Pending' : lang === 'fr' ? 'En attente' : 'Bekleyen'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Completion' : lang === 'fr' ? 'Taux' : 'Oran'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {participation.departments.map((d) => {
                        const rate = d.total ? Math.round((d.completed / d.total) * 100) : 0
                        return (
                          <tr key={d.department}>
                            <td className="py-2 px-3 text-[var(--foreground)]">{d.department}</td>
                            <td className="py-2 px-3 text-right text-[var(--foreground)]">{d.total}</td>
                            <td className="py-2 px-3 text-right text-[var(--foreground)]">{d.completed}</td>
                            <td className="py-2 px-3 text-right text-[var(--foreground)]">{d.pending}</td>
                            <td className="py-2 px-3 text-right">
                              <Badge variant={rate >= 80 ? 'success' : rate >= 50 ? 'warning' : 'danger'}>{rate}%</Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {coverage ? (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{lang === 'en' ? 'Evaluator coverage' : lang === 'fr' ? "Couverture des évaluateurs" : 'Değerlendirici kapsaması'}</CardTitle>
                  <Button variant="secondary" size="sm" onClick={exportCoverageCsv}>
                    <Download className="w-4 h-4" />
                    {t('exportExcel', lang)}
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'}</th>
                        <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Completed' : lang === 'fr' ? 'Terminées' : 'Tamamlanan'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Pending' : lang === 'fr' ? 'En attente' : 'Bekleyen'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Self' : lang === 'fr' ? 'Auto' : 'Öz'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Manager' : lang === 'fr' ? 'Manager' : 'Yönetici'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Peer' : lang === 'fr' ? 'Pair' : 'Ekip'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Sub.' : lang === 'fr' ? 'Sub.' : 'Ast'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Exec.' : lang === 'fr' ? 'Dir.' : 'Üst'}</th>
                        <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Confidence' : lang === 'fr' ? 'Confiance' : 'Güven'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {coverage.map((r) => {
                        const nPeer = Number(r.managerCompleted || 0) + Number(r.peerCompleted || 0) + Number(r.subordinateCompleted || 0) + Number(r.executiveCompleted || 0)
                        const conf =
                          nPeer >= 5 ? { label: lang === 'en' ? 'High' : lang === 'fr' ? 'Élevée' : 'Yüksek', v: 'success' as const } :
                          nPeer >= 3 ? { label: lang === 'en' ? 'Medium' : lang === 'fr' ? 'Moyenne' : 'Orta', v: 'warning' as const } :
                          { label: lang === 'en' ? 'Low' : lang === 'fr' ? 'Faible' : 'Düşük', v: 'danger' as const }
                        return (
                          <tr key={r.targetId}>
                            <td className="py-2 px-3 text-[var(--foreground)]">{r.targetName}</td>
                            <td className="py-2 px-3 text-[var(--muted)]">{r.targetDept}</td>
                            <td className="py-2 px-3 text-right">{r.completedTotal}</td>
                            <td className="py-2 px-3 text-right">{r.pendingTotal}</td>
                            <td className="py-2 px-3 text-right">{r.selfCompleted}</td>
                            <td className="py-2 px-3 text-right">{r.managerCompleted}</td>
                            <td className="py-2 px-3 text-right">{r.peerCompleted}</td>
                            <td className="py-2 px-3 text-right">{r.subordinateCompleted}</td>
                            <td className="py-2 px-3 text-right">{r.executiveCompleted}</td>
                            <td className="py-2 px-3 text-right">
                              <Badge variant={conf.v}>{conf.label}</Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  {lang === 'en'
                    ? 'Confidence is based on non-self completed evaluator count.'
                    : lang === 'fr'
                      ? "La confiance est basée sur le nombre d'évaluateurs (hors auto) terminés."
                      : 'Güven, öz hariç tamamlanan değerlendirici sayısına göre hesaplanır.'}
                </div>
              </CardBody>
            </Card>
          ) : null}

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
              <User className="w-6 h-6 text-[var(--brand)] mb-2" />
              <div className="text-3xl font-bold text-[var(--foreground)]">{results.length}</div>
              <div className="text-sm text-[var(--muted)]">{t('peopleCount', lang)}</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
              <TrendingUp className="w-6 h-6 text-[var(--success)] mb-2" />
              <div className="text-3xl font-bold text-[var(--foreground)]">
                {(results.reduce((sum, r) => sum + r.overallAvg, 0) / results.length).toFixed(1)}
              </div>
              <div className="text-sm text-[var(--muted)]">{t('averageScore', lang)}</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
              <BarChart3 className="w-6 h-6 text-[var(--brand)] mb-2" />
              <div className="text-3xl font-bold text-[var(--foreground)]">
                {results.reduce((sum, r) => sum + r.evaluations.length, 0)}
              </div>
              <div className="text-sm text-[var(--muted)]">{t('totalEvaluations', lang)}</div>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
              <FileText className="w-6 h-6 text-[var(--warning)] mb-2" />
              <div className="text-3xl font-bold text-[var(--foreground)]">
                {Math.max(...results.map(r => r.overallAvg)).toFixed(1)}
              </div>
              <div className="text-sm text-[var(--muted)]">{t('highestScore', lang)}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-6">
            <Button
              variant={activeTab === 'overview' ? 'success' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('overview')}
            >
              {lang === 'en' ? 'Overview' : lang === 'fr' ? "Vue d'ensemble" : 'Genel görünüm'}
            </Button>
            <Button
              variant={activeTab === 'analytics' ? 'success' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('analytics')}
            >
              {lang === 'en' ? 'Analytics' : lang === 'fr' ? 'Analytique' : 'Analitik'}
            </Button>
            <span className="text-xs text-[var(--muted)] ml-1">
              {lang === 'en'
                ? 'Modules are computed from existing results (no DB changes).'
                : lang === 'fr'
                  ? "Modules calculés depuis les résultats existants (sans changer la base)."
                  : 'Modüller mevcut sonuçlardan hesaplanır (DB değişikliği yok).'}
            </span>
          </div>

          {activeTab === 'analytics' ? (
            <>
              {/* Faz-1 Analitik Modüller: Trend+Risk+Health */}
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-5 h-5 text-[var(--brand)]" />
                      <CardTitle>
                        {lang === 'en' ? 'Analytics weight management' : lang === 'fr' ? 'Gestion des poids analytiques' : 'Analitik ağırlık yönetimi'}
                      </CardTitle>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setAnalyticsWeights(DEFAULT_ANALYTICS_WEIGHTS)}
                    >
                      {lang === 'en' ? 'Reset defaults' : lang === 'fr' ? 'Réinitialiser' : 'Varsayılanlar'}
                    </Button>
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    {([
                      ['riskOverall', 'Risk / Düşük performans'],
                      ['riskTrend', 'Risk / Trend düşüşü'],
                      ['riskGap', 'Risk / Gap'],
                      ['riskCoverage', 'Risk / Kapsama'],
                      ['healthPerformance', 'Health / Performans'],
                      ['healthParticipation', 'Health / Katılım'],
                      ['healthCoverage', 'Health / Kapsama'],
                      ['healthTrend', 'Health / Trend'],
                    ] as Array<[keyof AnalyticsWeights, string]>).map(([key, label]) => (
                      <label key={key} className="rounded-xl border border-[var(--border)] p-3 bg-[var(--surface-2)]/40">
                        <div className="text-xs text-[var(--muted)] mb-2">{label}</div>
                        <input
                          type="range"
                          min={0.05}
                          max={0.8}
                          step={0.01}
                          value={analyticsWeights[key]}
                          onChange={(e) => updateAnalyticsWeight(key, Number(e.target.value))}
                          className="w-full"
                        />
                        <div className="text-right text-xs text-[var(--foreground)] mt-1">{(analyticsWeights[key] * 100).toFixed(0)}%</div>
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <label className="rounded-xl border border-[var(--border)] p-3 bg-[var(--surface-2)]/40 text-sm">
                      <div className="text-xs text-[var(--muted)] mb-2">Erken uyarı / Birim düşüş eşiği (Δ)</div>
                      <input
                        type="number"
                        step={0.1}
                        value={analyticsWeights.warningDropThreshold}
                        onChange={(e) => setAnalyticsWeights((prev) => ({ ...prev, warningDropThreshold: Number(e.target.value) || 0 }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                      />
                    </label>
                    <label className="rounded-xl border border-[var(--border)] p-3 bg-[var(--surface-2)]/40 text-sm">
                      <div className="text-xs text-[var(--muted)] mb-2">Erken uyarı / Düşük skor eşiği</div>
                      <input
                        type="number"
                        step={0.1}
                        value={analyticsWeights.warningLowScoreThreshold}
                        onChange={(e) => setAnalyticsWeights((prev) => ({ ...prev, warningLowScoreThreshold: Number(e.target.value) || 0 }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                      />
                    </label>
                  </div>
                </CardBody>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <Card className="lg:col-span-1">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <HeartPulse className="w-5 h-5 text-emerald-600" />
                        <CardTitle>Organization Health Index</CardTitle>
                      </div>
                      <Button variant="secondary" size="sm" onClick={exportHealthCsv}>
                        <Download className="w-4 h-4" /> CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <div className="text-4xl font-bold text-[var(--foreground)] mb-2">{organizationHealth.score}</div>
                    <div className="text-xs text-[var(--muted)] mb-4">/100</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span>Performance</span><span>{organizationHealth.parts.performance}</span></div>
                      <div className="flex justify-between"><span>Participation</span><span>{organizationHealth.parts.participation}</span></div>
                      <div className="flex justify-between"><span>Coverage</span><span>{organizationHealth.parts.coverage}</span></div>
                      <div className="flex justify-between"><span>Trend</span><span>{organizationHealth.parts.trend}</span></div>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-3">ISO 30414 uyumu için KPI yapısı: katılım, kapsama, performans, trend.</p>
                  </CardBody>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-rose-600" />
                        <CardTitle>Risk Scorecard (Top 15)</CardTitle>
                      </div>
                      <Button variant="secondary" size="sm" onClick={exportRiskScorecardCsv}>
                        <Download className="w-4 h-4" /> CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-2 px-3">Kişi</th>
                            <th className="text-left py-2 px-3">Birim</th>
                            <th className="text-right py-2 px-3">Risk</th>
                            <th className="text-right py-2 px-3">Skor</th>
                            <th className="text-right py-2 px-3">Δ</th>
                            <th className="text-right py-2 px-3">Gap</th>
                            <th className="text-right py-2 px-3">Kaps.</th>
                            <th className="text-right py-2 px-3 w-20">{lang === 'en' ? 'Detail' : lang === 'fr' ? 'Détail' : 'Detay'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {riskScorecard.slice(0, 15).map((r) => (
                            <>
                              <tr key={r.targetId} className="hover:bg-[var(--surface-2)]/40">
                                <td className="py-2 px-3">
                                  <button
                                    type="button"
                                    className="font-medium text-[var(--foreground)] hover:underline"
                                    onClick={() => openPersonFromRisk(r.targetId)}
                                    title={lang === 'en' ? 'Open person report' : lang === 'fr' ? 'Ouvrir le rapport' : 'Kişi raporunu aç'}
                                  >
                                    {r.name}
                                  </button>
                                </td>
                                <td className="py-2 px-3 text-[var(--muted)]">{r.dept}</td>
                                <td className="py-2 px-3 text-right">
                                  <Badge variant={r.riskScore >= 70 ? 'danger' : r.riskScore >= 40 ? 'warning' : 'success'}>{r.riskScore}</Badge>
                                </td>
                                <td className="py-2 px-3 text-right">{r.overall.toFixed(1)}</td>
                                <td className="py-2 px-3 text-right">{r.delta.toFixed(1)}</td>
                                <td className="py-2 px-3 text-right">{r.avgGap.toFixed(1)}</td>
                                <td className="py-2 px-3 text-right">{r.peerEvalCount}</td>
                                <td className="py-2 px-3 text-right">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setExpandedRiskTargetId(expandedRiskTargetId === r.targetId ? null : r.targetId)}
                                  >
                                    {expandedRiskTargetId === r.targetId ? (lang === 'en' ? 'Hide' : 'Kapat') : (lang === 'en' ? 'Show' : 'Aç')}
                                  </Button>
                                </td>
                              </tr>
                              {expandedRiskTargetId === r.targetId ? (
                                <tr key={`${r.targetId}-detail`}>
                                  <td className="py-3 px-3" colSpan={8}>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                                        <div className="text-xs text-[var(--muted)]">Düşük performans</div>
                                        <div className="text-lg font-bold text-[var(--foreground)]">{r.explain.lowScore}%</div>
                                      </div>
                                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                                        <div className="text-xs text-[var(--muted)]">Trend</div>
                                        <div className="text-lg font-bold text-[var(--foreground)]">{r.explain.trend}%</div>
                                      </div>
                                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                                        <div className="text-xs text-[var(--muted)]">Gap</div>
                                        <div className="text-lg font-bold text-[var(--foreground)]">{r.explain.gap}%</div>
                                      </div>
                                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                                        <div className="text-xs text-[var(--muted)]">Kapsama</div>
                                        <div className="text-lg font-bold text-[var(--foreground)]">{r.explain.coverage}%</div>
                                      </div>
                                    </div>
                                    <div className="text-xs text-[var(--muted)] mt-2">
                                      {lang === 'en'
                                        ? 'This breakdown explains why the risk score is high/low.'
                                        : lang === 'fr'
                                          ? 'Cette ventilation explique le score de risque.'
                                          : 'Bu kırılım risk puanının neden yüksek/düşük olduğunu açıklar.'}
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-[var(--muted)] px-3 py-2 border-t border-[var(--border)]">Skor açıklanabilirlik: düşük performans + negatif trend + gap + kapsama bileşenlerinin ağırlıklı toplamı.</p>
                  </CardBody>
                </Card>
              </div>

              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      <CardTitle>Trend & Early Warning Panel</CardTitle>
                    </div>
                    <Button variant="secondary" size="sm" onClick={exportEarlyWarningsCsv}>
                      <Download className="w-4 h-4" /> CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="space-y-2">
                    {earlyWarnings.map((w, idx) => (
                      <div key={`${w.title}-${idx}`} className={`rounded-xl border px-3 py-2 ${w.level === 'high' ? 'border-rose-300 bg-rose-500/5' : 'border-amber-300 bg-amber-500/5'}`}>
                        <div className="text-sm font-semibold text-[var(--foreground)]">{w.title}</div>
                        <div className="text-xs text-[var(--muted)] mt-0.5">{w.detail}</div>
                        <div className="text-xs mt-1">
                          <Badge variant={w.level === 'high' ? 'danger' : 'warning'}>{w.level === 'high' ? 'High' : 'Medium'}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-3">Yönetici yorumu: Uyarı alan ekiplerde önce kapsama (değerlendirici sayısı), sonra düşük skor ve gap kök neden analizi önerilir.</p>
                </CardBody>
              </Card>
            </>
          ) : null}

          {/* Kişi & birim sıralama analizi */}
          {(peopleLeaderboard.top.length > 0 || departmentRankings.length > 0) ? (
            <div className="mb-6 space-y-6">
              <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[var(--brand)]/5 p-1 shadow-sm">
                <div className="rounded-[14px] bg-[var(--surface)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Award className="w-6 h-6 text-amber-500" />
                      <h3 className="text-lg font-semibold text-[var(--foreground)]">
                        {lang === 'en' ? 'People & department highlights' : lang === 'fr' ? 'Temps forts (personnes & départements)' : 'Kişi ve birim öne çıkanlar'}
                      </h3>
                    </div>
                    <Button variant="secondary" size="sm" onClick={exportLeaderboardCsv}>
                      <Download className="w-4 h-4" />
                      {lang === 'en' ? 'Export people' : lang === 'fr' ? 'Exporter personnes' : 'Kişi CSV'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                        <TrendingUp className="w-5 h-5" />
                        <span className="font-semibold">{lang === 'en' ? 'Highest overall scores' : lang === 'fr' ? 'Scores globaux les plus élevés' : 'En yüksek genel puanlar'}</span>
                      </div>
                      <ul className="space-y-2 text-sm">
                        {peopleLeaderboard.top.map((row, i) => (
                          <li key={`top-${row.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700">{i + 1}</span>
                              <span className="truncate font-medium text-[var(--foreground)]" title={row.name}>{row.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.dept}>{row.dept}</span>
                            <Badge variant="success">{row.score.toFixed(1)}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                      <div className="flex items-center gap-2 mb-3 text-rose-700 dark:text-rose-400">
                        <TrendingDown className="w-5 h-5" />
                        <span className="font-semibold">{lang === 'en' ? 'Lowest overall scores' : lang === 'fr' ? 'Scores globaux les plus bas' : 'En düşük genel puanlar'}</span>
                      </div>
                      <ul className="space-y-2 text-sm">
                        {peopleLeaderboard.bottom.map((row, i) => (
                          <li key={`bot-${row.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)]/80 px-3 py-2 border border-[var(--border)]/60">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-xs font-bold text-rose-700">{i + 1}</span>
                              <span className="truncate font-medium text-[var(--foreground)]" title={row.name}>{row.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-[var(--muted)] truncate max-w-[40%]" title={row.dept}>{row.dept}</span>
                            <Badge variant="danger">{row.score.toFixed(1)}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {departmentRankings.length > 0 ? (
                <Card className="overflow-hidden border-[var(--border)] shadow-sm">
                  <CardHeader className="bg-[var(--surface-2)]/50 border-b border-[var(--border)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-[var(--brand)]" />
                        <CardTitle>
                          {lang === 'en' ? 'Department ranking (avg overall score)' : lang === 'fr' ? 'Classement des départements (moyenne globale)' : 'Birim sıralaması (ortalama genel puan)'}
                        </CardTitle>
                      </div>
                      <Button variant="secondary" size="sm" onClick={exportDeptRankingCsv}>
                        <Download className="w-4 h-4" />
                        {lang === 'en' ? 'Export departments' : lang === 'fr' ? 'Exporter départements' : 'Birim CSV'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)] w-14">{lang === 'en' ? '#' : lang === 'fr' ? '#' : '#'}</th>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                            <th className="text-right py-3 px-4 font-semibold text-[var(--muted)]">{lang === 'en' ? 'People' : lang === 'fr' ? 'Personnes' : 'Kişi'}</th>
                            <th className="text-right py-3 px-4 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Avg' : lang === 'fr' ? 'Moy.' : 'Ort.'}</th>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Best in dept.' : lang === 'fr' ? 'Meilleur' : 'Birimde en yüksek'}</th>
                            <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Lowest in dept.' : lang === 'fr' ? 'Plus bas' : 'Birimde en düşük'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {departmentRankings.map((r) => {
                            const isTop = r.rank === 1
                            const isLast = r.rank === departmentRankings.length && departmentRankings.length > 1
                            return (
                              <tr
                                key={r.department}
                                className={
                                  isTop
                                    ? 'bg-emerald-500/5'
                                    : isLast
                                      ? 'bg-rose-500/5'
                                      : 'hover:bg-[var(--surface-2)]/40'
                                }
                              >
                                <td className="py-3 px-4 font-bold text-[var(--foreground)]">{r.rank}</td>
                                <td className="py-3 px-4 font-medium text-[var(--foreground)]">{r.department}</td>
                                <td className="py-3 px-4 text-right text-[var(--muted)]">{r.peopleCount}</td>
                                <td className="py-3 px-4 text-right">
                                  <Badge variant={getScoreBadge(r.avgOverall)}>{r.avgOverall.toFixed(1)}</Badge>
                                </td>
                                <td className="py-3 px-4 text-[var(--foreground)]">
                                  <span className="font-medium">{r.bestPerson}</span>
                                  <span className="text-[var(--muted)]"> ({r.bestScore.toFixed(1)})</span>
                                </td>
                                <td className="py-3 px-4 text-[var(--foreground)]">
                                  <span className="font-medium">{r.worstPerson}</span>
                                  <span className="text-[var(--muted)]"> ({r.worstScore.toFixed(1)})</span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-[var(--muted)] px-4 py-3 border-t border-[var(--border)]">
                      {lang === 'en'
                        ? 'Departments are sorted by average overall score (highest first). Single-person departments show the same person as best and lowest.'
                        : lang === 'fr'
                          ? 'Les départements sont triés par moyenne globale (décroissant). Avec une seule personne, meilleur et plus bas sont identiques.'
                          : 'Birimler ortalama genel puana göre (yüksekten düşüğe) sıralanır. Tek kişilik birimlerde en yüksek ve en düşük aynı kişi olabilir.'}
                    </p>
                  </CardBody>
                </Card>
              ) : null}
            </div>
          ) : null}

          {/* Önceki döneme göre trend (liste sırası: yeni → eski) */}
          {previousPeriodMeta ? (
            <Card className="mb-6 overflow-hidden border-[var(--border)] shadow-sm">
              <CardHeader className="bg-gradient-to-r from-violet-500/10 to-transparent border-b border-[var(--border)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600">
                      <History className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle>
                        {lang === 'en'
                          ? 'Period-over-period change'
                          : lang === 'fr'
                            ? 'Évolution vs période précédente'
                            : 'Önceki döneme göre değişim'}
                      </CardTitle>
                      <p className="text-sm text-[var(--muted)] mt-1 font-normal">
                        {lang === 'en'
                          ? `Compared to: ${previousPeriodMeta.name} (same filters).`
                          : lang === 'fr'
                            ? `Par rapport à : ${previousPeriodMeta.name} (mêmes filtres).`
                            : `Karşılaştırma: ${previousPeriodMeta.name} (aynı filtreler).`}
                      </p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={exportTrendCsv}>
                    <Download className="w-4 h-4" />
                    {lang === 'en' ? 'Export trend' : lang === 'fr' ? 'Exporter tendance' : 'Trend CSV'}
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                {!prevResults.length ? (
                  <p className="text-sm text-[var(--muted)]">
                    {lang === 'en'
                      ? 'No results for the previous period with the current filters — trend needs data in both periods.'
                      : lang === 'fr'
                        ? "Aucun résultat pour la période précédente avec ces filtres — la tendance nécessite des données sur les deux périodes."
                        : 'Önceki dönemde bu filtrelerle sonuç yok; trend için her iki dönemde de veri gerekir.'}
                  </p>
                ) : !periodComparisonTrend.peopleUp.length &&
                  !periodComparisonTrend.peopleDown.length &&
                  !periodComparisonTrend.deptMoves.length ? (
                  <p className="text-sm text-[var(--muted)]">
                    {lang === 'en'
                      ? 'No overlapping people or departments to compare between periods.'
                      : lang === 'fr'
                        ? 'Pas de personnes ou départements comparables entre les périodes.'
                        : 'Dönemler arasında karşılaştırılabilir kişi veya birim yok.'}
                  </p>
                ) : (
                  <div className="space-y-8">
                    {(periodComparisonTrend.peopleUp.length > 0 || periodComparisonTrend.peopleDown.length > 0) ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {periodComparisonTrend.peopleUp.length > 0 ? (
                          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                            <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                              <ArrowUpRight className="w-5 h-5" />
                              <span className="font-semibold text-sm">
                                {lang === 'en'
                                  ? 'Largest gains (overall score)'
                                  : lang === 'fr'
                                    ? 'Plus fortes hausses (score global)'
                                    : 'En çok artanlar (genel puan)'}
                              </span>
                            </div>
                            <ul className="space-y-2 text-sm">
                              {periodComparisonTrend.peopleUp.map((r, i) => (
                                <li
                                  key={`up-${r.name}-${i}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)]/60 bg-[var(--surface-2)]/60 px-3 py-2"
                                >
                                  <span className="font-medium text-[var(--foreground)] truncate min-w-0">{r.name}</span>
                                  <span className="text-xs text-[var(--muted)] truncate">{r.dept}</span>
                                  <span className="text-xs text-[var(--muted)]">
                                    {r.prev.toFixed(1)} → {r.cur.toFixed(1)}
                                  </span>
                                  <Badge variant="success">+{r.delta.toFixed(1)}</Badge>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {periodComparisonTrend.peopleDown.length > 0 ? (
                          <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4">
                            <div className="flex items-center gap-2 mb-3 text-rose-700 dark:text-rose-400">
                              <ArrowDownRight className="w-5 h-5" />
                              <span className="font-semibold text-sm">
                                {lang === 'en'
                                  ? 'Largest drops (overall score)'
                                  : lang === 'fr'
                                    ? 'Plus fortes baisses (score global)'
                                    : 'En çok düşenler (genel puan)'}
                              </span>
                            </div>
                            <ul className="space-y-2 text-sm">
                              {periodComparisonTrend.peopleDown.map((r, i) => (
                                <li
                                  key={`dn-${r.name}-${i}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)]/60 bg-[var(--surface-2)]/60 px-3 py-2"
                                >
                                  <span className="font-medium text-[var(--foreground)] truncate min-w-0">{r.name}</span>
                                  <span className="text-xs text-[var(--muted)] truncate">{r.dept}</span>
                                  <span className="text-xs text-[var(--muted)]">
                                    {r.prev.toFixed(1)} → {r.cur.toFixed(1)}
                                  </span>
                                  <Badge variant="danger">{r.delta.toFixed(1)}</Badge>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {periodComparisonTrend.deptMoves.length > 0 ? (
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[var(--brand)]" />
                          {lang === 'en'
                            ? 'Department average change (both periods had people in dept.)'
                            : lang === 'fr'
                              ? 'Évolution de la moyenne par département'
                              : 'Birim ortalaması değişimi (her iki dönemde de birimde kişi varsa)'}
                        </h4>
                        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                          <table className="w-full text-sm">
                            <thead className="bg-[var(--surface-2)]">
                              <tr>
                                <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                                  {lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}
                                </th>
                                <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">
                                  {lang === 'en' ? 'Prev' : lang === 'fr' ? 'Préc.' : 'Önceki'}
                                </th>
                                <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">
                                  {lang === 'en' ? 'Now' : lang === 'fr' ? 'Actuel' : 'Şimdi'}
                                </th>
                                <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">
                                  {lang === 'en' ? 'Δ' : lang === 'fr' ? 'Δ' : 'Fark'}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {periodComparisonTrend.deptMoves.map((r) => (
                                <tr key={r.department} className="hover:bg-[var(--surface-2)]/40">
                                  <td className="py-2 px-3 font-medium text-[var(--foreground)]">{r.department}</td>
                                  <td className="py-2 px-3 text-right text-[var(--muted)]">{r.prev.toFixed(1)}</td>
                                  <td className="py-2 px-3 text-right">{r.cur.toFixed(1)}</td>
                                  <td className="py-2 px-3 text-right">
                                    {r.delta > 0 ? (
                                      <span className="text-emerald-600 font-medium">+{r.delta.toFixed(1)}</span>
                                    ) : r.delta < 0 ? (
                                      <span className="text-rose-600 font-medium">{r.delta.toFixed(1)}</span>
                                    ) : (
                                      <span className="text-[var(--muted)]">0</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-[var(--muted)] mt-2">
                          {lang === 'en'
                            ? 'Rows sorted by absolute change. Only departments with at least one person in both periods are shown.'
                            : lang === 'fr'
                              ? 'Tri par amplitude du changement. Départements présents sur les deux périodes seulement.'
                              : 'Satırlar mutlak değişime göre sıralı; yalnızca her iki dönemde de en az bir kişisi olan birimler.'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </CardBody>
            </Card>
          ) : null}

          {/* Kategori bazında ekip puanı — mini kartlar */}
          {categoryPeerHighlights.length > 0 ? (
            <div className="mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[var(--brand)]" />
                    {lang === 'en'
                      ? 'Category spotlight (team score per person)'
                      : lang === 'fr'
                        ? 'Focus catégorie (score équipe par personne)'
                        : 'Kategori odak (kişi başı ekip puanı)'}
                  </h3>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    {lang === 'en'
                      ? 'Top and bottom people by peer/team average in each category (up to 6 categories).'
                      : lang === 'fr'
                        ? 'Haut / bas par moyenne équipe dans chaque catégorie (6 catégories max).'
                        : 'Her kategoride ekip ortalamasına göre en üst ve en alt kişiler (en fazla 6 kategori).'}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={exportCategoryHighlightsCsv}>
                  <Download className="w-4 h-4" />
                  {lang === 'en' ? 'Export' : lang === 'fr' ? 'Exporter' : 'CSV'}
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {categoryPeerHighlights.map((block) => (
                  <div
                    key={block.cat}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="font-semibold text-[var(--foreground)] mb-3 border-b border-[var(--border)] pb-2">
                      {block.cat}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-emerald-600 font-medium mb-2 flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" />
                          {lang === 'en' ? 'Highest' : lang === 'fr' ? 'Plus haut' : 'En yüksek'}
                        </div>
                        <ul className="space-y-1.5 text-[var(--foreground)]">
                          {block.top.map((r, i) => (
                            <li key={`t-${i}`} className="flex justify-between gap-2">
                              <span className="truncate" title={r.name}>
                                {r.name}
                              </span>
                              <span className="shrink-0 text-[var(--muted)]">{r.peer.toFixed(1)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-rose-600 font-medium mb-2 flex items-center gap-1">
                          <TrendingDown className="w-3.5 h-3.5" />
                          {lang === 'en' ? 'Lowest' : lang === 'fr' ? 'Plus bas' : 'En düşük'}
                        </div>
                        <ul className="space-y-1.5 text-[var(--foreground)]">
                          {block.bottom.map((r, i) => (
                            <li key={`b-${i}`} className="flex justify-between gap-2">
                              <span className="truncate" title={r.name}>
                                {r.name}
                              </span>
                              <span className="shrink-0 text-[var(--muted)]">{r.peer.toFixed(1)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {(gapReports.topCategoryGaps.length > 0 || gapReports.topQuestionGaps.length > 0) ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{lang === 'en' ? 'Top self vs team gaps (categories)' : lang === 'fr' ? "Écarts auto vs équipe (catégories)" : 'Öz vs Ekip farkı (Kategori) — Top'}</CardTitle>
                    <Button variant="secondary" size="sm" onClick={() => exportGapCsv('category')}>
                      <Download className="w-4 h-4" />
                      {t('exportExcel', lang)}
                    </Button>
                  </div>
                </CardHeader>
                <CardBody>
                  {gapReports.topCategoryGaps.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'}</th>
                            <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}</th>
                            <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori'}</th>
                            <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">🔵</th>
                            <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">🟢</th>
                            <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {gapReports.topCategoryGaps.map((row, idx) => (
                            <tr key={`${row.person}-${row.category}-${idx}`}>
                              <td className="py-2 px-3 text-[var(--foreground)]">{row.person}</td>
                              <td className="py-2 px-3 text-[var(--muted)]">{row.dept}</td>
                              <td className="py-2 px-3 text-[var(--foreground)]">{row.category}</td>
                              <td className="py-2 px-3 text-right">{row.self.toFixed(1)}</td>
                              <td className="py-2 px-3 text-right">{row.peer.toFixed(1)}</td>
                              <td className={`py-2 px-3 text-right font-semibold ${row.diff > 0 ? 'text-[var(--brand)]' : 'text-[var(--danger)]'}`}>
                                {row.diff > 0 ? `+${row.diff.toFixed(1)}` : row.diff.toFixed(1)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--muted)]">{lang === 'en' ? 'No category gap data.' : lang === 'fr' ? "Pas de données d'écart." : 'Kategori fark verisi yok.'}</div>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{lang === 'en' ? 'Top self vs team gaps (questions)' : lang === 'fr' ? "Écarts auto vs équipe (questions)" : 'Öz vs Ekip farkı (Soru) — Top'}</CardTitle>
                    <Button variant="secondary" size="sm" onClick={() => exportGapCsv('question')}>
                      <Download className="w-4 h-4" />
                      {t('exportExcel', lang)}
                    </Button>
                  </div>
                </CardHeader>
                <CardBody>
                  {gapReports.topQuestionGaps.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                          <tr>
                            <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Person' : lang === 'fr' ? 'Personne' : 'Kişi'}</th>
                            <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori'}</th>
                            <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru'}</th>
                            <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">🔵</th>
                            <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">🟢</th>
                            <th className="text-right py-2 px-3 font-semibold text-[var(--muted)]">{lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {gapReports.topQuestionGaps.map((row, idx) => (
                            <tr key={`${row.person}-${row.category}-${idx}`}>
                              <td className="py-2 px-3 text-[var(--foreground)]">{row.person}</td>
                              <td className="py-2 px-3 text-[var(--muted)]">{row.category}</td>
                              <td className="py-2 px-3 text-[var(--foreground)]">
                                <div className="max-w-[520px] truncate" title={row.question}>{row.question}</div>
                              </td>
                              <td className="py-2 px-3 text-right">{row.self.toFixed(1)}</td>
                              <td className="py-2 px-3 text-right">{row.peer.toFixed(1)}</td>
                              <td className={`py-2 px-3 text-right font-semibold ${row.diff > 0 ? 'text-[var(--brand)]' : 'text-[var(--danger)]'}`}>
                                {row.diff > 0 ? `+${row.diff.toFixed(1)}` : row.diff.toFixed(1)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--muted)]">{lang === 'en' ? 'No question gap data.' : lang === 'fr' ? "Pas de données d'écart." : 'Soru fark verisi yok.'}</div>
                  )}
                </CardBody>
              </Card>
            </div>
          ) : null}

          {(deptHeatmap.departments.length > 0 && deptHeatmap.categories.length > 0) ? (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{lang === 'en' ? 'Department × Category heatmap (team avg)' : lang === 'fr' ? 'Heatmap Département × Catégorie (moyenne équipe)' : 'Departman × Kategori Isı Haritası (Ekip ort.)'}</CardTitle>
                  <Button variant="secondary" size="sm" onClick={exportHeatmapCsv}>
                    <Download className="w-4 h-4" />
                    {t('exportExcel', lang)}
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-[var(--muted)] sticky left-0 bg-[var(--surface-2)] z-10">
                          {lang === 'en' ? 'Department' : lang === 'fr' ? 'Département' : 'Birim'}
                        </th>
                        {deptHeatmap.categories.map((c) => (
                          <th key={c} className="text-center py-2 px-3 font-semibold text-[var(--muted)] whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {deptHeatmap.departments.map((d) => (
                        <tr key={d}>
                          <td className="py-2 px-3 text-[var(--foreground)] sticky left-0 bg-[var(--surface)] z-10 whitespace-nowrap">
                            {d}
                          </td>
                          {deptHeatmap.categories.map((c) => {
                            const v = deptHeatmap.value(d, c)
                            return (
                              <td
                                key={`${d}-${c}`}
                                className={`py-2 px-3 text-center font-semibold ${deptHeatmap.color(v)}`}
                                title={v === null ? '' : `${d} · ${c}: ${v.toFixed(1)}`}
                              >
                                {v === null ? '—' : v.toFixed(1)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  {lang === 'en'
                    ? 'Cells show team (non-self) category average across people in the department.'
                    : lang === 'fr'
                      ? "Les cellules montrent la moyenne d'équipe (hors auto) par catégorie."
                      : 'Hücreler departmandaki kişiler için kategori bazında ekip (öz hariç) ortalamasını gösterir.'}
                </div>
              </CardBody>
            </Card>
          ) : null}

          {/* Genel Grafikler + Özet */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>📊 {t('overallScoreDistribution', lang)}</CardTitle>
                <Badge variant="info">{t('orgSummary', lang)}</Badge>
              </CardHeader>
              <CardBody>
                <div className="w-full h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overallDistribution} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                      <CartesianGrid stroke="rgba(107,124,147,0.25)" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="var(--brand)" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-xs text-[var(--muted)] mt-2">
                  {t('resultsNoteSummary', lang)}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>🏷️ {t('categorySummaryTeamAvg', lang)}</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
                    <div className="px-4 py-3 bg-[var(--surface-2)] font-semibold text-[var(--foreground)]">{t('top5', lang)}</div>
                    <div className="divide-y divide-[var(--border)]">
                      {categorySummary.top.map((c) => (
                        <div key={c.name} className="px-4 py-3 flex items-center justify-between">
                          <div className="text-sm text-[var(--foreground)]">{c.name}</div>
                          <Badge variant="success">{c.avg}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
                    <div className="px-4 py-3 bg-[var(--surface-2)] font-semibold text-[var(--foreground)]">{t('improvementPriority5', lang)}</div>
                    <div className="divide-y divide-[var(--border)]">
                      {categorySummary.bottom.map((c) => (
                        <div key={c.name} className="px-4 py-3 flex items-center justify-between">
                          <div className="text-sm text-[var(--foreground)]">{c.name}</div>
                          <Badge variant="warning">{c.avg}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {results.length > 0 && !peerEvaluatorsVisible && (
            <Card className="mb-6 border-amber-200 bg-amber-50/80">
              <CardBody className="py-3 text-sm text-amber-950">
                {t('peerEvaluatorsSuperAdminOnlyHint', lang)}
              </CardBody>
            </Card>
          )}

          {/* Results Table */}
          <Card>
            <CardHeader>
              <CardTitle>📊 {t('personBasedResultsTitle', lang)}</CardTitle>
              <Badge variant="info">
                {results.length} {t('peopleCount', lang)}
              </Badge>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-[var(--border)]">
                {results.map((result, index) => (
                  <div key={result.targetId}>
                    {/* Main Row */}
                    <div 
                      className="flex items-center justify-between px-6 py-4 hover:bg-[var(--surface-2)] cursor-pointer"
                      onClick={() => setExpandedPerson(expandedPerson === result.targetId ? null : result.targetId)}
                      id={`person-row-${result.targetId}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-[var(--brand-soft)] border border-[var(--brand)]/25 rounded-lg flex items-center justify-center text-[var(--brand)] font-semibold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-[var(--foreground)]">{result.targetName}</p>
                          <p className="text-sm text-[var(--muted)]">{result.targetDept}</p>
                          {result.hasSelfEvaluationAssignment === false && (
                            <Badge variant="warning" className="mt-1 text-[10px] font-normal" title={t('missingSelfAssignmentHint', lang)}>
                              {t('missingSelfAssignmentBadge', lang)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-xs text-[var(--muted)]">{t('selfShort', lang)}</p>
                          <p className={`font-semibold ${getScoreColor(result.selfScore)}`}>
                            {result.hasSelfEvaluationAssignment === false
                              ? '—'
                              : Number(result.selfScore ?? 0).toFixed(1)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-[var(--muted)]">{t('teamShort', lang)}</p>
                          <p className={`font-semibold ${getScoreColor(result.peerAvg)}`}>
                            {Number.isFinite(Number(result.peerAvg)) ? Number(result.peerAvg).toFixed(1) : '—'}
                          </p>
                        </div>
                        <div className="text-center min-w-[70px]">
                          <p className="text-xs text-[var(--muted)]">{t('standardShort', lang)}</p>
                          <p className={`font-semibold ${getScoreColor(result.standardAvg)}`}>
                            {result.standardCount ? result.standardAvg : '-'}
                          </p>
                        </div>
                        <div className="text-center min-w-[60px]">
                          <p className="text-xs text-[var(--muted)]">{t('overallShort', lang)}</p>
                          <Badge variant={getScoreBadge(result.overallAvg)}>
                            {result.overallAvg}
                          </Badge>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-[var(--muted)]">{t('evaluatorsShort', lang)}</p>
                          <p className="font-medium text-[var(--foreground)]">{result.evaluations.length}</p>
                        </div>
                        {expandedPerson === result.targetId ? (
                          <ChevronUp className="w-5 h-5 text-[var(--muted)]/70" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-[var(--muted)]/70" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedPerson === result.targetId && (
                      <div className="bg-[var(--surface-2)] px-6 py-4 border-t border-[var(--border)]" id={`admin-report-${result.targetId}`}>
                        <h4 className="font-medium text-[var(--foreground)] mb-3">{t('evaluationDetailsTitle', lang)}</h4>

                        {(() => {
                          const risk = riskScorecard.find((x) => String(x.targetId) === String(result.targetId))
                          if (!risk) return null
                          return (
                            <div className="mb-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                                  <div className="font-semibold text-[var(--foreground)]">
                                    {lang === 'en' ? 'Risk score (explainable)' : lang === 'fr' ? 'Score de risque (explicable)' : 'Risk puanı (açıklanabilir)'}
                                  </div>
                                </div>
                                <Badge variant={risk.riskScore >= 70 ? 'danger' : risk.riskScore >= 40 ? 'warning' : 'success'}>
                                  {risk.riskScore}/100
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
                                  <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Low performance' : lang === 'fr' ? 'Performance faible' : 'Düşük performans'}</div>
                                  <div className="text-lg font-bold text-[var(--foreground)]">{risk.explain.lowScore}%</div>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
                                  <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Trend' : lang === 'fr' ? 'Tendance' : 'Trend'}</div>
                                  <div className="text-lg font-bold text-[var(--foreground)]">{risk.explain.trend}%</div>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
                                  <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Gap' : lang === 'fr' ? 'Écart' : 'Gap'}</div>
                                  <div className="text-lg font-bold text-[var(--foreground)]">{risk.explain.gap}%</div>
                                </div>
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 p-3">
                                  <div className="text-xs text-[var(--muted)]">{lang === 'en' ? 'Coverage' : lang === 'fr' ? 'Couverture' : 'Kapsama'}</div>
                                  <div className="text-lg font-bold text-[var(--foreground)]">{risk.explain.coverage}%</div>
                                </div>
                              </div>
                              <div className="text-xs text-[var(--muted)] mt-2">
                                {lang === 'en'
                                  ? 'Action tip: increase evaluator coverage first, then address lowest peer categories.'
                                  : lang === 'fr'
                                    ? "Conseil : augmenter d'abord la couverture, puis travailler les catégories les plus faibles."
                                    : 'Aksiyon: önce kapsama (değerlendirici sayısı), sonra ekipte en düşük kategoriler üzerine çalışma.'}
                              </div>
                            </div>
                          )
                        })()}

                        {result.responseStats ? (
                          <div className="mb-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                            <div className="font-semibold text-[var(--foreground)] mb-2">
                              {lang === 'en' ? 'Response summary' : lang === 'fr' ? 'Résumé des réponses' : 'Yanıt özeti'}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[var(--muted)]">
                                  {lang === 'en' ? 'Questions (any response)' : lang === 'fr' ? 'Questions (toute réponse)' : 'Soru (en az 1 yanıt)'}
                                </span>
                                <span className="font-semibold text-[var(--foreground)]">{result.responseStats.totalQuestionsWithAnyResponse}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[var(--muted)]">
                                  {lang === 'en' ? 'Categories (any response)' : lang === 'fr' ? 'Catégories (toute réponse)' : 'Kategori (en az 1 yanıt)'}
                                </span>
                                <span className="font-semibold text-[var(--foreground)]">{result.responseStats.totalCategoriesWithAnyResponse}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[var(--muted)]">
                                  {lang === 'en' ? 'Self answered (questions)' : lang === 'fr' ? 'Auto répondu (questions)' : 'Öz cevaplanan (soru)'}
                                </span>
                                <span className="font-semibold text-[var(--foreground)]">{result.responseStats.selfAnsweredQuestions}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[var(--muted)]">
                                  {lang === 'en' ? 'Team answered (questions)' : lang === 'fr' ? 'Équipe répondu (questions)' : 'Ekip cevaplanan (soru)'}
                                </span>
                                <span className="font-semibold text-[var(--foreground)]">{result.responseStats.peerAnsweredQuestions}</span>
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-[var(--muted)]">
                              {lang === 'en'
                                ? 'Note: a score of 0 can still mean “answered” (e.g. “I don’t know”).'
                                : lang === 'fr'
                                  ? 'Note : un score 0 peut quand même signifier “répondu” (ex. “Je ne sais pas”).'
                                  : 'Not: 0 puan da “yanıt var” demek olabilir (örn. “Bilgim yok”).'}
                            </div>
                            {result.responseStats?.questionTextLookup ? (
                              <div className="mt-3 text-xs text-[var(--muted)]">
                                <span className="font-semibold text-[var(--foreground)]">
                                  {lang === 'en' ? 'Question text lookup' : lang === 'fr' ? 'Résolution des questions' : 'Soru metni çözümleme'}
                                </span>
                                <div className="mt-1">
                                  {lang === 'en' ? 'Requested' : lang === 'fr' ? 'Demandé' : 'İstenen'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{result.responseStats.questionTextLookup.requested}</span>
                                  {' · '}
                                  {lang === 'en' ? 'Resolved' : lang === 'fr' ? 'Trouvé' : 'Bulunan'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{result.responseStats.questionTextLookup.resolved}</span>
                                  {' · '}
                                  {lang === 'en' ? 'Snapshot' : lang === 'fr' ? 'Snapshot' : 'Snapshot'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">
                                    {result.responseStats.questionTextLookup.usedSnapshot ? (lang === 'en' ? 'yes' : lang === 'fr' ? 'oui' : 'evet') : (lang === 'en' ? 'no' : lang === 'fr' ? 'non' : 'hayır')}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Security/KVKK standards summary (static, explanatory) */}
                        <SecurityStandardsSummary lang={lang} />

                        {(() => {
                          const selfEvals = result.evaluations.filter((e) => e.isSelf)
                          const teamEvals = result.evaluations.filter((e) => !e.isSelf)
                          const renderEvalCard = (eval_: ResultData['evaluations'][number], idx: number, kind: 'self' | 'team') => (
                            <div
                              key={`${result.targetId}-${kind}-${String(eval_.evaluatorId)}-${idx}`}
                              className={`bg-[var(--surface)] p-3 rounded-xl border ${
                                eval_.isSelf ? 'border-[var(--brand)]/40 bg-[var(--brand-soft)]' : 'border-[var(--border)]'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-[var(--foreground)]">
                                  {eval_.isSelf ? t('selfEvaluationLabel', lang) : eval_.evaluatorName}
                                </span>
                                {eval_.hasScorableResponses === false ? (
                                  <Badge variant="gray" className="max-w-[min(100%,11rem)] whitespace-normal text-center leading-tight">
                                    {t('noCompetencyScoreBadge', lang)}
                                  </Badge>
                                ) : (
                                  <Badge variant={getScoreBadge(eval_.avgScore)}>
                                    {typeof eval_.avgScore === 'number' ? eval_.avgScore.toFixed(1) : eval_.avgScore}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-[var(--muted)] flex flex-wrap gap-x-3 gap-y-1">
                                <span>
                                  {lang === 'en' ? 'Responses' : lang === 'fr' ? 'Réponses' : 'Yanıt'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{Number(eval_.responseCount || 0)}</span>
                                </span>
                                <span>
                                  {lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{Number(eval_.distinctQuestionCount || 0)}</span>
                                </span>
                                <span>
                                  {lang === 'en' ? 'Categories' : lang === 'fr' ? 'Catégories' : 'Kategori'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{Number(eval_.distinctCategoryCount || 0)}</span>
                                </span>
                                <span>
                                  {lang === 'en' ? 'Zero score' : lang === 'fr' ? 'Score zéro' : '0 puan'}:{' '}
                                  <span className="font-semibold text-[var(--foreground)]">{Number(eval_.zeroScoreCount || 0)}</span>
                                </span>
                              </div>
                              {eval_?.assignmentId ? (
                                <div className="mt-2 flex items-center justify-end">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={reopeningAssignmentId === eval_.assignmentId}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      reopenAssignment(eval_.assignmentId)
                                    }}
                                  >
                                    {reopeningAssignmentId === eval_.assignmentId
                                      ? (lang === 'en' ? 'Reopening...' : lang === 'fr' ? 'Réouverture...' : 'Açılıyor...')
                                      : (lang === 'en' ? 'Reopen evaluation' : lang === 'fr' ? "Rouvrir l'évaluation" : 'Değerlendirmeyi yeniden aç')}
                                  </Button>
                                </div>
                              ) : null}
                              {eval_.categories.length > 0 && (
                                <div className="mt-2 max-h-64 overflow-y-auto overscroll-contain pr-0.5 space-y-1">
                                  {eval_.categories.map((cat, catIdx) => (
                                    <div key={`${cat.name}-${catIdx}`} className="flex items-center justify-between gap-2 text-xs">
                                      <span className="text-[var(--muted)] min-w-0 truncate" title={cat.name}>
                                        {cat.name}
                                      </span>
                                      <span className={getScoreColor(cat.score)}>{cat.score}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                          return (
                            <div className="space-y-6">
                              {selfEvals.length > 0 && (
                                <div>
                                  <h5 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                                    <span className="text-[var(--brand)]">🔵</span>
                                    {t('evaluationSectionSelf', lang)}
                                  </h5>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {selfEvals.map((ev, idx) => renderEvalCard(ev, idx, 'self'))}
                                  </div>
                                </div>
                              )}
                              {teamEvals.length > 0 && (
                                <div>
                                  <h5 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                                    <span className="text-[var(--success)]">🟢</span>
                                    {t('evaluationSectionTeam', lang)}
                                  </h5>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {teamEvals.map((ev, idx) => renderEvalCard(ev, idx, 'team'))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        {result.standardByTitle && result.standardByTitle.length > 0 && (
                          <div className="mt-6 bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
                            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]">
                              <div className="font-semibold text-[var(--foreground)]">{t('intlStandardsTitle', lang)}</div>
                              <Badge variant="info">
                                {result.standardAvg ? result.standardAvg.toFixed(1) : '-'} / {result.standardCount} kayıt
                              </Badge>
                            </div>
                            <div className="p-4 overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                                  <tr>
                                    <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">{t('standardShort', lang)}</th>
                                    <th className="text-right py-2 px-3 font-semibold text-[var(--muted)] w-[120px]">{t('averageLabel', lang)}</th>
                                    <th className="text-right py-2 px-3 font-semibold text-[var(--muted)] w-[90px]">{t('countLabel', lang)}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {result.standardByTitle.slice(0, 12).map((s) => (
                                    <tr key={s.title}>
                                      <td className="py-2 px-3 text-[var(--foreground)]">{s.title}</td>
                                      <td className="py-2 px-3 text-right">
                                        <Badge variant={getScoreBadge(s.avg)}>{s.avg.toFixed(1)}</Badge>
                                      </td>
                                      <td className="py-2 px-3 text-right text-[var(--muted)]">{s.count}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {result.standardByTitle.length > 12 && (
                                <div className="mt-2 text-xs text-[var(--muted)]">{t('first12StandardsShown', lang)}</div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 flex items-center justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); printPerson(result.targetId) }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                          >
                            <Printer className="w-4 h-4" />
                            Yazdır / PDF
                          </button>
                        </div>

                        {/* SWOT + Detaylı Karşılaştırma */}
                        {result.categoryCompare.length > 0 && (
                          <div className="mt-6 space-y-6">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                                <div className="font-semibold text-[var(--foreground)] mb-3">🕸️ Radar Karşılaştırma (Öz vs Ekip)</div>
                                <RadarCompare
                                  rows={result.categoryCompare.map((c) => ({ name: c.name, self: c.self || 0, peer: c.peer || 0 }))}
                                  selfLabel="Öz"
                                  peerLabel="Ekip"
                                />
                              </div>
                              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                                <div className="font-semibold text-[var(--foreground)] mb-3">📊 Bar Grafik (Öz vs Ekip)</div>
                                <BarCompare
                                  rows={result.categoryCompare.map((c) => ({ name: c.name, self: c.self || 0, peer: c.peer || 0 }))}
                                  selfLabel="Öz"
                                  peerLabel="Ekip"
                                />
                              </div>
                            </div>

                            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
                              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-2)]">
                                <div className="font-semibold text-[var(--foreground)]">📋 Kategori Bazlı Detaylı Karşılaştırma</div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      exportCategoryCompareToExcel(result)
                                    }}
                                  >
                                    <Download className="w-4 h-4" />
                                    {t('exportExcel', lang)}
                                  </Button>
                                  <Badge variant="info">{result.categoryCompare.length} kategori</Badge>
                                </div>
                              </div>
                              <div className="p-4 overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                                    <tr>
                                      <th className="text-left py-3 px-4 font-semibold text-[var(--muted)]">Kategori</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🔵 Öz (5)</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🔵 Öz (%)</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🟢 Ekip (5)</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">🟢 Ekip (%)</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">Fark</th>
                                      <th className="text-center py-3 px-4 font-semibold text-[var(--muted)]">Durum</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--border)]">
                                    {result.categoryCompare.map((c) => {
                                      const catKey = (c as any)?.key ? String((c as any).key) : String(c.name || '')
                                      const expandedKey = expandedCategoryByTarget[result.targetId] || null
                                      const isExpanded = expandedKey === catKey
                                      const qRows = result.categoryQuestions?.[catKey] || []
                                      const selfAnswered = qRows.some((q) => Number(q?.selfCount || 0) > 0) || c.self > 0
                                      const peerAnswered = qRows.some((q) => Number(q?.peerCount || 0) > 0) || c.peer > 0
                                      const status =
                                        !selfAnswered ? { label: 'Öz yok', variant: 'gray' as const } :
                                        !peerAnswered ? { label: 'Ekip yok', variant: 'gray' as const } :
                                        c.diff > 0.5 ? { label: 'Yüksek görüyor', variant: 'warning' as const } :
                                        c.diff < -0.5 ? { label: 'Düşük görüyor', variant: 'danger' as const } :
                                        { label: 'Tutarlı', variant: 'success' as const }
                                      return (
                                        <>
                                          <tr
                                            key={catKey}
                                            className="hover:bg-[var(--surface-2)]/60 cursor-pointer"
                                            onClick={() => {
                                              setExpandedCategoryByTarget((prev) => ({
                                                ...prev,
                                                [result.targetId]: prev[result.targetId] === catKey ? null : catKey,
                                              }))
                                            }}
                                            title={
                                              qRows.length
                                                ? (lang === 'en'
                                                  ? 'Click to show questions'
                                                  : lang === 'fr'
                                                    ? 'Cliquer pour afficher les questions'
                                                    : 'Soruları görmek için tıklayın')
                                                : ''
                                            }
                                          >
                                            <td className="py-3 px-4 font-medium text-[var(--foreground)]">
                                              <div className="flex items-center gap-2">
                                                <span className="min-w-0 truncate" title={c.name}>{c.name}</span>
                                                {qRows.length ? (
                                                  <Badge variant="gray" className="shrink-0">
                                                    {qRows.length} {lang === 'en' ? 'Q' : lang === 'fr' ? 'Q' : 'Soru'}
                                                  </Badge>
                                                ) : null}
                                              </div>
                                            </td>
                                            <td className="py-3 px-4 text-center">{c.self ? c.self.toFixed(1) : '-'}</td>
                                            <td className="py-3 px-4 text-center text-[var(--brand)] font-semibold">{c.self ? `${Math.round((c.self / 5) * 100)}%` : '-'}</td>
                                            <td className="py-3 px-4 text-center">{c.peer ? c.peer.toFixed(1) : '-'}</td>
                                            <td className="py-3 px-4 text-center text-[var(--success)] font-semibold">{c.peer ? `${Math.round((c.peer / 5) * 100)}%` : '-'}</td>
                                            <td className="py-3 px-4 text-center font-semibold">{(c.self && c.peer) ? `${c.diff > 0 ? '+' : ''}${c.diff.toFixed(1)}` : '-'}</td>
                                            <td className="py-3 px-4 text-center">
                                              <Badge variant={status.variant}>{status.label}</Badge>
                                            </td>
                                          </tr>
                                          {isExpanded && (
                                            <tr key={`${catKey}-details`} className="bg-[var(--surface-2)]/50">
                                              <td colSpan={7} className="py-3 px-4">
                                                {qRows.length ? (
                                                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                                                    <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                                                      <div className="font-semibold text-[var(--foreground)]">
                                                        {lang === 'en' ? 'Question breakdown' : lang === 'fr' ? 'Détail par question' : 'Soru bazlı kırılım'}
                                                      </div>
                                                      <div className="flex items-center gap-3">
                                                        <div className="text-xs text-[var(--muted)]">
                                                          {lang === 'en' ? 'Self vs Team averages' : lang === 'fr' ? 'Moyennes: auto vs équipe' : 'Öz vs Ekip ortalamaları'}
                                                        </div>
                                                        <Button
                                                          variant="secondary"
                                                          size="sm"
                                                          onClick={(e) => {
                                                            e.stopPropagation()
                                                            setExpandedCategoryByTarget((prev) => ({ ...prev, [result.targetId]: null }))
                                                          }}
                                                        >
                                                          {lang === 'en' ? 'Close' : lang === 'fr' ? 'Fermer' : 'Kapat'}
                                                        </Button>
                                                      </div>
                                                    </div>
                                                    <div className="p-3 overflow-x-auto">
                                                      <table className="w-full text-xs">
                                                        <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                                                          <tr>
                                                            <th className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                                                              {lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru'}
                                                            </th>
                                                            <th className="text-center py-2 px-3 font-semibold text-[var(--muted)] w-[80px]">🔵</th>
                                                            <th className="text-center py-2 px-3 font-semibold text-[var(--muted)] w-[80px]">🟢</th>
                                                            <th className="text-center py-2 px-3 font-semibold text-[var(--muted)] w-[70px]">
                                                              {lang === 'en' ? 'Diff' : lang === 'fr' ? 'Écart' : 'Fark'}
                                                            </th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[var(--border)]">
                                                          {qRows.map((q) => {
                                                            const selfCount = Number(q.selfCount || 0)
                                                            const peerCount = Number(q.peerCount || 0)
                                                            const self = Number.isFinite(Number(q.self)) ? Number(q.self) : 0
                                                            const peer = Number.isFinite(Number(q.peer)) ? Number(q.peer) : 0
                                                            const diffQ = (selfCount > 0 && peerCount > 0) ? Number(q.diff) : 0
                                                            return (
                                                              <tr key={q.questionId} className="hover:bg-[var(--surface-2)]/60">
                                                                <td className="py-2 px-3 text-[var(--foreground)]">
                                                                  <div className="truncate" title={q.questionText}>{q.questionText}</div>
                                                                </td>
                                                                <td className="py-2 px-3 text-center">{selfCount > 0 ? self.toFixed(1) : '-'}</td>
                                                                <td className="py-2 px-3 text-center">{peerCount > 0 ? peer.toFixed(1) : '-'}</td>
                                                                <td className={`py-2 px-3 text-center font-semibold ${diffQ > 0 ? 'text-[var(--brand)]' : diffQ < 0 ? 'text-[var(--danger)]' : 'text-[var(--muted)]'}`}>
                                                                  {(selfCount > 0 && peerCount > 0) ? `${diffQ > 0 ? '+' : ''}${diffQ.toFixed(1)}` : '-'}
                                                                </td>
                                                              </tr>
                                                            )
                                                          })}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <div className="text-sm text-[var(--muted)]">
                                                    {lang === 'en'
                                                      ? 'No question details found for this category.'
                                                      : lang === 'fr'
                                                        ? 'Aucun détail de question trouvé pour cette catégorie.'
                                                        : 'Bu kategori için soru detayı bulunamadı.'}
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          )}
                                        </>
                                      )
                                    })}
                                  </tbody>
                                </table>
                                <div className="mt-2 text-xs text-[var(--muted)]">
                                  {lang === 'en'
                                    ? 'Tip: click a category row to see question-level scores.'
                                    : lang === 'fr'
                                      ? 'Astuce : cliquez sur une catégorie pour voir les scores par question.'
                                      : 'İpucu: Soru bazlı puanları görmek için kategori satırına tıklayın.'}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4">
                                <h4 className="font-semibold text-[var(--brand)] mb-4 text-center">🔵 ÖZ DEĞERLENDİRME SWOT</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="bg-[var(--success-soft)] border border-[var(--success)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--success-text)] mb-2">💪 Güçlü Yönler</div>
                                    {result.swot.self.strengths.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.strengths.slice(0, 6).map(s => (
                                          <div key={s.name}>✓ {s.name} <span className="font-semibold">({s.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Belirgin güçlü yön tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--danger-text)] mb-2">⚠️ Gelişim Alanları</div>
                                    {result.swot.self.weaknesses.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.weaknesses.slice(0, 6).map(w => (
                                          <div key={w.name}>• {w.name} <span className="font-semibold">({w.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Belirgin gelişim alanı tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-[var(--info-soft)] border border-[var(--info)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--info-text)] mb-2">🚀 Fırsatlar</div>
                                    {result.swot.self.opportunities.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.opportunities.slice(0, 6).map(o => (
                                          <div key={o.name}>→ {o.name} <span className="font-semibold">({o.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Orta seviye alan bulunmuyor</div>}
                                  </div>
                                  <div className="bg-[var(--warning-soft)] border border-[var(--warning)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--warning-text)] mb-2">📝 Öneriler</div>
                                    {result.swot.self.recommendations.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.self.recommendations.slice(0, 4).map((r, idx) => (
                                          <div key={idx}>• {r}</div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Öneri yok</div>}
                                  </div>
                                </div>
                              </div>

                              <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4">
                                <h4 className="font-semibold text-[var(--success)] mb-4 text-center">🟢 EKİP DEĞERLENDİRME SWOT</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="bg-[var(--success-soft)] border border-[var(--success)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--success-text)] mb-2">💪 Güçlü Yönler</div>
                                    {result.swot.peer.strengths.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.strengths.slice(0, 6).map(s => (
                                          <div key={s.name}>✓ {s.name} <span className="font-semibold">({s.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Belirgin güçlü yön tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-[var(--danger-soft)] border border-[var(--danger)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--danger-text)] mb-2">⚠️ Gelişim Alanları</div>
                                    {result.swot.peer.weaknesses.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.weaknesses.slice(0, 6).map(w => (
                                          <div key={w.name}>• {w.name} <span className="font-semibold">({w.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Belirgin gelişim alanı tespit edilmedi</div>}
                                  </div>
                                  <div className="bg-[var(--info-soft)] border border-[var(--info)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--info-text)] mb-2">🚀 Fırsatlar</div>
                                    {result.swot.peer.opportunities.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.opportunities.slice(0, 6).map(o => (
                                          <div key={o.name}>→ {o.name} <span className="font-semibold">({o.score.toFixed(1)})</span></div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Orta seviye alan bulunmuyor</div>}
                                  </div>
                                  <div className="bg-[var(--warning-soft)] border border-[var(--warning)]/30 rounded-xl p-4">
                                    <div className="font-semibold text-[var(--warning-text)] mb-2">📝 Öneriler</div>
                                    {result.swot.peer.recommendations.length ? (
                                      <div className="space-y-1 text-sm">
                                        {result.swot.peer.recommendations.slice(0, 4).map((r, idx) => (
                                          <div key={idx}>• {r}</div>
                                        ))}
                                      </div>
                                    ) : <div className="text-xs text-[var(--muted)] italic">Öneri yok</div>}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {(() => {
                              const ai = buildAiInsights(result)
                              return (
                                <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
                                  <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between">
                                    <div className="font-semibold text-[var(--foreground)]">🤖 AI Destekli Gelişim Önerileri</div>
                                    <Badge variant="info">Özet</Badge>
                                  </div>
                                  <div className="p-5 space-y-4">
                                    <div>
                                      <div className="text-xs font-semibold text-[var(--muted)] mb-1">Kısa SWOT Özeti</div>
                                      <div className="text-sm text-[var(--foreground)]">{ai.summary}</div>
                                    </div>

                                    <div>
                                      <div className="text-xs font-semibold text-[var(--muted)] mb-2">Önerilen Eğitimler</div>
                                      {ai.trainings.length ? (
                                        <div className="flex flex-wrap gap-2">
                                          {ai.trainings.map((t) => (
                                            <Badge key={t} variant="info">
                                              {t}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-sm text-[var(--muted)]">Yeterli veri yok.</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
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
