'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { Card, CardHeader, CardBody, CardTitle, Button, Select, Badge, toast } from '@/components/ui'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { t } from '@/lib/i18n'
import { 
  Search, Download, FileText, User, BarChart3, TrendingUp, 
  ChevronDown, ChevronUp, Loader2, Printer 
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
    categories: { name: string; score: number }[]
  }[]
  overallAvg: number
  selfScore: number
  peerAvg: number
  standardAvg: number
  standardCount: number
  standardByTitle: { title: string; avg: number; count: number }[]
  categoryCompare: { name: string; self: number; peer: number; diff: number }[]
  swot: {
    self: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
    peer: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[]; opportunities: { name: string; score: number }[]; recommendations: string[] }
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
  const [loading, setLoading] = useState(false)
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)
  const [peerEvaluatorsVisible, setPeerEvaluatorsVisible] = useState(true)

  const filteredUsers = useMemo(() => {
    if (!selectedDept) return users
    return users.filter((u) => String(u.department || '') === String(selectedDept))
  }, [users, selectedDept])

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
  
  const printPerson = (targetId: string) => {
    const el = document.getElementById(`admin-report-${targetId}`)
    if (!el) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write('<html><head><title>VISIO 360° Rapor</title>')
    w.document.write('<style>')
    w.document.write('body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:24px;color:#111;line-height:1.4}')
    w.document.write('h1{margin:0 0 8px 0;font-size:20px}')
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

  const loadResults = async () => {
    const orgToUse = selectedOrg || organizationId
    if (!selectedPeriod || !orgToUse) {
      toast('KVKK: Önce kurum ve dönem seçin', 'error')
      return
    }

    setLoading(true)
    try {
      // KVKK: results are now fetched server-side (service role) so we can apply strict RLS on evaluation tables.
      const resp = await fetch(`/api/admin/results?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: selectedPeriod,
          org_id: orgToUse,
          person_id: selectedPerson || null,
          department: selectedDept || null,
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        throw new Error(payload?.error || 'Rapor alınamadı')
      }
      const rows = (payload.results || []) as ResultData[]
      setResults(rows)
      setPeerEvaluatorsVisible(payload.peerEvaluatorsVisible !== false)
      setExpandedPerson(rows[0]?.targetId || null)
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
    } finally {
      setLoading(false)
    }
  }

  const exportToExcel = () => {
    if (results.length === 0) {
      toast(t('exportNoData', lang), 'error')
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

    let csv =
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
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '')
    a.download = `kategori_karsilastirma_${selectedPeriod || 'period'}_${safeName || 'person'}.csv`
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

    let csv =
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
            <Button onClick={loadResults}>
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
                              : result.selfHasScorableResponses === false
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

                        {/* Security/KVKK standards summary (static, explanatory) */}
                        <SecurityStandardsSummary lang={lang} />

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {result.evaluations.map((eval_, idx) => (
                            <div 
                              key={idx} 
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
                                  <Badge variant={getScoreBadge(eval_.avgScore)}>{eval_.avgScore}</Badge>
                                )}
                              </div>
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
                          ))}
                        </div>

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
