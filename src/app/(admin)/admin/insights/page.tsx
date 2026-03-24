'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, Select, Button, Badge, toast } from '@/components/ui'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { useLang } from '@/components/i18n/language-context'
import { t, type Lang } from '@/lib/i18n'
import { BarChart3, Brain, Building2, Download, FileText, Lightbulb, Loader2, Search, Sparkles, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type InsightPayload = {
  summary: { peopleCount: number; avgSelf: number; avgTeam: number; avgOverall: number }
  byDepartment: Array<{ department: string; peopleCount: number; avgSelf: number; avgTeam: number; avgOverall: number }>
  byManager: Array<{ managerName: string; peopleCount: number; avgSelf: number; avgTeam: number; avgOverall: number }>
  categories: Array<{ name: string; selfAvg: number; teamAvg: number; diff: number; totalCount: number }>
  questions: Array<{ questionId: string; text: string; selfAvg: number; teamAvg: number; diff: number; totalCount: number }>
  topCategories: Array<{ name: string; selfAvg: number; teamAvg: number; diff: number; totalCount: number }>
  bottomCategories: Array<{ name: string; selfAvg: number; teamAvg: number; diff: number; totalCount: number }>
  topQuestions: Array<{ questionId: string; text: string; selfAvg: number; teamAvg: number; diff: number; totalCount: number }>
  bottomQuestions: Array<{ questionId: string; text: string; selfAvg: number; teamAvg: number; diff: number; totalCount: number }>
  swot: {
    strengths: Array<{ name: string; score: number }>
    weaknesses: Array<{ name: string; score: number }>
    opportunities: Array<{ name: string; score: number }>
    recommendations: string[]
  }
  generatedAt: string
}

const emptyPayload: InsightPayload = {
  summary: { peopleCount: 0, avgSelf: 0, avgTeam: 0, avgOverall: 0 },
  byDepartment: [],
  byManager: [],
  categories: [],
  questions: [],
  topCategories: [],
  bottomCategories: [],
  topQuestions: [],
  bottomQuestions: [],
  swot: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
  generatedAt: '',
}

function fmtInsight(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
}

function aiPriorityLabel(lang: Lang, p: string) {
  if (p === 'high') return t('insightsAiPriorityHigh', lang)
  if (p === 'medium') return t('insightsAiPriorityMed', lang)
  return t('insightsAiPriorityLow', lang)
}

/** 2 satıra böler; satırlar üst üste binmesin diye kısa tutulur, tam metin tooltip’te */
function splitLabelForAxis(text: string, maxChars: number): string[] {
  const s = String(text || '').trim()
  if (!s) return ['']
  if (s.length <= maxChars) return [s]
  const br = s.lastIndexOf(' ', maxChars)
  const cut = br > maxChars / 2 ? br : maxChars
  const a = s.slice(0, cut).trim()
  const b = s.slice(cut).trim()
  if (b.length <= maxChars) return [a, b]
  return [a, `${b.slice(0, maxChars - 1)}…`]
}

function InsightsYAxisTick(props: { x?: number; y?: number; payload?: { value?: string } }) {
  const { x = 0, y = 0, payload } = props
  const lines = splitLabelForAxis(String(payload?.value ?? ''), 26)
  if (lines.length === 1) {
    return (
      <g transform={`translate(${x},${y})`}>
        <text fill="#64748b" fontSize={9} textAnchor="end" x={-6} dy={4}>
          {lines[0]}
        </text>
      </g>
    )
  }
  return (
    <g transform={`translate(${x},${y})`}>
      <text fill="#64748b" fontSize={9} textAnchor="end">
        <tspan x={-6} dy={-5}>
          {lines[0]}
        </tspan>
        <tspan x={-6} dy={11}>
          {lines[1]}
        </tspan>
      </text>
    </g>
  )
}

function chartRowHeight(n: number) {
  return Math.max(300, Math.min(640, n * 52 + 120))
}

function InsightsHorizontalClusterBar({
  data,
  selfLabel,
  teamLabel,
}: {
  data: Array<{ name: string; self: number; team: number }>
  selfLabel: string
  teamLabel: string
}) {
  const h = chartRowHeight(Math.max(1, data.length))
  const yW = 244
  return (
    <div className="w-full min-w-0 min-h-[300px] box-border" style={{ height: h }}>
      {/* Recharts: height="100%" bazen ölçüm -1 veriyor; piksel yükseklik verilir */}
      <ResponsiveContainer width="100%" height={h} debounce={50}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 8, right: 14, left: 2, bottom: 4 }}
          barCategoryGap="36%"
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 10 }} tickCount={6} />
          <YAxis dataKey="name" type="category" width={yW} tick={<InsightsYAxisTick />} interval={0} reversed />
          <Tooltip content={<InsightsClusterTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" verticalAlign="top" />
          <Bar dataKey="self" name={selfLabel} fill="#3b82f6" radius={[0, 3, 3, 0]} maxBarSize={16} />
          <Bar dataKey="team" name={teamLabel} fill="#22c55e" radius={[0, 3, 3, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function InsightsClusterTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  label?: string
  payload?: Array<{ name?: string; value?: number; dataKey?: string; payload?: { name?: string } }>
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as { name?: string; self?: number; team?: number } | undefined
  const title = String(label ?? row?.name ?? '')
  return (
    <div className="rounded-lg border px-2.5 py-2 text-[11px] shadow-md max-w-[min(100vw-2rem,22rem)] bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)]">
      <div className="font-medium mb-1 break-words leading-snug">{title}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="text-[var(--muted)]">
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  )
}

function InsightsGapTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  label?: string
  payload?: Array<{ value?: number; payload?: { name?: string; gap?: number } }>
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  const title = String(label ?? row?.name ?? '')
  return (
    <div className="rounded-lg border px-2.5 py-2 text-[11px] shadow-md max-w-[min(100vw-2rem,22rem)] bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)]">
      <div className="font-medium mb-1 break-words leading-snug">{title}</div>
      <div className="text-[var(--muted)]">Δ = {typeof row?.gap === 'number' ? row.gap.toFixed(1) : '-'}</div>
    </div>
  )
}

export default function AdminInsightsPage() {
  const lang = useLang()
  const { organizationId } = useAdminContextStore()
  const { user } = useAuthStore()
  const userRole = user?.role
  const userOrgId = (user as any)?.organization_id ? String((user as any).organization_id) : ''

  const [periods, setPeriods] = useState<Array<{ id: string; name: string }>>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedDept, setSelectedDept] = useState('')
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState<InsightPayload>(emptyPayload)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<{
    executiveSummary: string
    keyFindings: string[]
    roadmap: Array<{
      title: string
      priority: 'high' | 'medium' | 'low'
      rationale: string
      actions: string[]
      timelineHint: string
      successIndicators: string[]
    }>
    deepDive: {
      alignmentSelfVsTeam: string
      departmentCommentary: string
      categoryFocus: string
      trainingAndDevelopment: string
    }
    quickWins: string[]
    risksAndWatchouts: string[]
    suggestedMetrics: string[]
  } | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  const periodName = useCallback(
    (p: any) => {
      if (!p) return ''
      if (lang === 'fr') return String(p.name_fr || p.name || '')
      if (lang === 'en') return String(p.name_en || p.name || '')
      return String(p.name || '')
    },
    [lang]
  )

  const loadOrgScopedData = useCallback(
    async (orgId: string) => {
      const resp = await fetch(`/api/admin/matrix-data?org_id=${encodeURIComponent(orgId)}`, { method: 'GET' })
      const data = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !data?.success) throw new Error(data?.error || 'Veriler alınamadı')
      setPeriods(((data.periods || []) as any[]).map((p) => ({ id: String(p.id), name: periodName(p) })))
      setDepartments(Array.isArray(data.departments) ? data.departments.map((d: any) => String(d)) : [])
    },
    [periodName]
  )

  useEffect(() => {
    const orgToUse = userRole === 'org_admin' ? userOrgId : organizationId
    if (!orgToUse) return
    loadOrgScopedData(orgToUse).catch((e: any) => toast(String(e?.message || t('insightsOrgDataFailedToast', lang)), 'error'))
  }, [organizationId, userOrgId, userRole, loadOrgScopedData, lang])

  const loadInsights = useCallback(async () => {
    const orgToUse = userRole === 'org_admin' ? userOrgId : organizationId
    if (!orgToUse || !selectedPeriod) {
      toast(t('insightsSelectPeriodOrgToast', lang), 'error')
      return
    }
    setLoading(true)
    try {
      const resp = await fetch(`/api/admin/insights?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: selectedPeriod,
          org_id: orgToUse,
          department: selectedDept || null,
        }),
      })
      const data = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !data?.success) throw new Error(data?.error || t('insightsAnalysisFailedToast', lang))
      setPayload({ ...emptyPayload, ...data })
      setAiResult(null)
      setAiError(null)
    } catch (e: any) {
      toast(String(e?.message || t('insightsAnalysisFailedToast', lang)), 'error')
    } finally {
      setLoading(false)
    }
  }, [organizationId, selectedDept, selectedPeriod, userOrgId, userRole, lang])

  const loadAiInsights = useCallback(async () => {
    const orgToUse = userRole === 'org_admin' ? userOrgId : organizationId
    if (!orgToUse || !selectedPeriod || !payload.generatedAt) {
      toast(t('insightsSelectPeriodOrgToast', lang), 'error')
      return
    }
    setAiLoading(true)
    setAiError(null)
    try {
      const resp = await fetch(`/api/admin/insights-ai?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: selectedPeriod,
          org_id: orgToUse,
          department: selectedDept || null,
        }),
      })
      const data = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !data?.success) throw new Error(data?.detail || data?.error || 'AI analizi alınamadı')
      setAiResult(data.ai)
    } catch (e: any) {
      const msg = String(e?.message || 'AI hatası')
      setAiError(msg)
      toast(msg, 'error')
    } finally {
      setAiLoading(false)
    }
  }, [organizationId, payload.generatedAt, selectedDept, selectedPeriod, userOrgId, userRole, lang])

  const deptChart = useMemo(
    () =>
      (payload.byDepartment || []).slice(0, 10).map((d) => ({
        name: d.department,
        team: d.avgTeam,
        self: d.avgSelf,
      })),
    [payload.byDepartment]
  )

  const categoryChart = useMemo(
    () =>
      (payload.topCategories || []).map((c) => ({
        name: c.name,
        team: c.teamAvg,
        self: c.selfAvg,
      })),
    [payload.topCategories]
  )

  const managerChart = useMemo(
    () =>
      (payload.byManager || []).slice(0, 10).map((m) => ({
        name: m.managerName,
        team: m.avgTeam,
        self: m.avgSelf,
      })),
    [payload.byManager]
  )

  const gapDeptChart = useMemo(() => {
    const rows = (payload.byDepartment || []).map((d) => ({
      name: d.department,
      gap: Math.round((d.avgSelf - d.avgTeam) * 10) / 10,
    }))
    return [...rows].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 10)
  }, [payload.byDepartment])

  const gapDomain = useMemo((): [number, number] => {
    const vals = gapDeptChart.map((d) => Math.abs(d.gap))
    const m = Math.max(0.5, ...vals, 0.1)
    const pad = Math.min(2.5, m + 0.35)
    return [-pad, pad]
  }, [gapDeptChart])

  const avgSelfTeamGap = useMemo(() => {
    const s = payload.summary
    return Math.round((s.avgSelf - s.avgTeam) * 10) / 10
  }, [payload.summary])

  const maxCategoryGap = useMemo(() => {
    const cats = payload.categories || []
    if (!cats.length) return null
    return cats.reduce((a, b) => (Math.abs(a.diff) >= Math.abs(b.diff) ? a : b))
  }, [payload.categories])

  const downloadCsv = useCallback(() => {
    const rows: string[] = []
    rows.push(t('insightsCsvHeaderLine', lang))
    rows.push(`${t('summary', lang)},${t('insightsCsvOrgName', lang)},${payload.summary.peopleCount},${payload.summary.avgSelf},${payload.summary.avgTeam},${payload.summary.avgOverall}`)
    ;(payload.byDepartment || []).forEach((d) => {
      rows.push(`${t('insightsCsvDept', lang)},${String(d.department).replace(/,/g, ' ')},${d.peopleCount},${d.avgSelf},${d.avgTeam},${d.avgOverall}`)
    })
    ;(payload.byManager || []).forEach((m) => {
      rows.push(`${t('insightsCsvManager', lang)},${String(m.managerName).replace(/,/g, ' ')},${m.peopleCount},${m.avgSelf},${m.avgTeam},${m.avgOverall}`)
    })
    ;(payload.topCategories || []).forEach((c) => {
      rows.push(`${t('insightsCsvCatTop', lang)},${String(c.name).replace(/,/g, ' ')},${c.totalCount},${c.selfAvg},${c.teamAvg},${c.diff}`)
    })
    ;(payload.bottomCategories || []).forEach((c) => {
      rows.push(`${t('insightsCsvCatBottom', lang)},${String(c.name).replace(/,/g, ' ')},${c.totalCount},${c.selfAvg},${c.teamAvg},${c.diff}`)
    })
    ;(payload.topQuestions || []).forEach((q) => {
      rows.push(`${t('insightsCsvQTop', lang)},${String(q.text).replace(/,/g, ' ')},${q.totalCount},${q.selfAvg},${q.teamAvg},${q.diff}`)
    })
    ;(payload.bottomQuestions || []).forEach((q) => {
      rows.push(`${t('insightsCsvQBottom', lang)},${String(q.text).replace(/,/g, ' ')},${q.totalCount},${q.selfAvg},${q.teamAvg},${q.diff}`)
    })
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const base =
      lang === 'fr' ? 'insights-organisationnels' : lang === 'en' ? 'organization-insights' : 'kurumsal-icgoruler'
    a.download = `${base}-${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [payload, selectedPeriod, lang])

  const printPdf = useCallback(() => {
    if (!payload.generatedAt) return
    const w = window.open('', '_blank')
    if (!w) return

    const locale = lang === 'tr' ? 'tr-TR' : lang === 'fr' ? 'fr-FR' : 'en-US'
    const escape = (s: string) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

    const row = (label: string, value: string | number) =>
      `<tr><td style="padding:8px 10px;border:1px solid #e5e7eb;">${escape(label)}</td><td style="padding:8px 10px;border:1px solid #e5e7eb;">${escape(String(value))}</td></tr>`

    const topCats = (payload.topCategories || [])
      .map((c) => `<tr><td style="padding:8px;border:1px solid #e5e7eb;">${escape(c.name)}</td><td style="padding:8px;border:1px solid #e5e7eb;">${c.teamAvg.toFixed(1)}</td><td style="padding:8px;border:1px solid #e5e7eb;">${c.selfAvg.toFixed(1)}</td></tr>`)
      .join('')
    const bottomCats = (payload.bottomCategories || [])
      .map((c) => `<tr><td style="padding:8px;border:1px solid #e5e7eb;">${escape(c.name)}</td><td style="padding:8px;border:1px solid #e5e7eb;">${c.teamAvg.toFixed(1)}</td><td style="padding:8px;border:1px solid #e5e7eb;">${c.selfAvg.toFixed(1)}</td></tr>`)
      .join('')
    const deptRows = (payload.byDepartment || [])
      .map((d) => `<tr><td style="padding:8px;border:1px solid #e5e7eb;">${escape(d.department)}</td><td style="padding:8px;border:1px solid #e5e7eb;">${d.peopleCount}</td><td style="padding:8px;border:1px solid #e5e7eb;">${d.avgSelf.toFixed(1)}</td><td style="padding:8px;border:1px solid #e5e7eb;">${d.avgTeam.toFixed(1)}</td><td style="padding:8px;border:1px solid #e5e7eb;">${d.avgOverall.toFixed(1)}</td></tr>`)
      .join('')
    const mgrRows = (payload.byManager || [])
      .map((m) => `<tr><td style="padding:8px;border:1px solid #e5e7eb;">${escape(m.managerName)}</td><td style="padding:8px;border:1px solid #e5e7eb;">${m.peopleCount}</td><td style="padding:8px;border:1px solid #e5e7eb;">${m.avgSelf.toFixed(1)}</td><td style="padding:8px;border:1px solid #e5e7eb;">${m.avgTeam.toFixed(1)}</td><td style="padding:8px;border:1px solid #e5e7eb;">${m.avgOverall.toFixed(1)}</td></tr>`)
      .join('')
    const swotRecs = (payload.swot.recommendations || []).map((r) => `<li>${escape(r)}</li>`).join('')

    const L = {
      title: t('insightsPdfReportTitle', lang),
      gen: t('insightsPdfGenerated', lang),
      period: t('reportMetaPeriod', lang),
      deptMeta: t('insightsPdfMetaDeptLine', lang),
      nodata: t('insightsPdfNoData', lang),
      people: t('insightsPeopleCount', lang),
      overall: t('insightsOverallAvgLabel', lang),
      self: t('insightsSelfAvgLabel', lang),
      team: t('insightsTeamAvgLabel', lang),
      deptSec: t('insightsPdfDeptSection', lang),
      mgrSec: t('insightsPdfManagerSection', lang),
      strong: t('insightsPdfStrongCat', lang),
      weak: t('insightsPdfWeakCat', lang),
      swot: t('insightsPdfSwotSection', lang),
      swS: t('insightsSwotStrengthsH', lang),
      swW: t('insightsSwotWeaknessesH', lang),
      swO: t('insightsSwotOpportunitiesH', lang),
      swR: t('insightsSwotRecommendationsH', lang),
      category: t('category', lang),
      mgr: t('managerLabel', lang),
      deptCol: t('departmentLabel', lang),
      teamS: t('teamShort', lang),
      selfS: t('selfShort', lang),
    }

    const reportHtml = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escape(L.title)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; color: #111827; }
      h1 { margin: 0 0 6px 0; font-size: 22px; }
      h2 { margin: 24px 0 8px 0; font-size: 16px; }
      p.meta { margin: 0; color: #6b7280; font-size: 12px; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 12px; }
      .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
      .card .k { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
      .card .v { font-size: 24px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th { text-align: left; background: #f9fafb; border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; }
      td { font-size: 12px; }
      .muted { color: #6b7280; }
      ul { margin: 8px 0 0 16px; padding: 0; }
      li { margin-bottom: 4px; font-size: 12px; }
      .section { page-break-inside: avoid; }
      @media print { body { padding: 14px; } }
    </style>
  </head>
  <body>
    <h1>${escape(L.title)}</h1>
    <p class="meta">${escape(L.gen)}: ${new Date(payload.generatedAt).toLocaleString(locale)}</p>
    <p class="meta">${escape(L.period)}: ${escape(selectedPeriod || '-')} ${selectedDept ? `• ${escape(L.deptMeta)}: ${escape(selectedDept)}` : ''}</p>

    <div class="grid section">
      <div class="card"><div class="k">${escape(L.people)}</div><div class="v">${payload.summary.peopleCount}</div></div>
      <div class="card"><div class="k">${escape(L.overall)}</div><div class="v">${payload.summary.avgOverall.toFixed(1)}</div></div>
      <div class="card"><div class="k">${escape(L.self)}</div><div class="v">${payload.summary.avgSelf.toFixed(1)}</div></div>
      <div class="card"><div class="k">${escape(L.team)}</div><div class="v">${payload.summary.avgTeam.toFixed(1)}</div></div>
    </div>

    <div class="section">
      <h2>${escape(L.deptSec)}</h2>
      <table>
        <thead><tr><th>${escape(L.deptCol)}</th><th>${escape(L.people)}</th><th>${escape(L.selfS)}</th><th>${escape(L.teamS)}</th><th>${escape(L.overall)}</th></tr></thead>
        <tbody>${deptRows || row(L.nodata, '-')}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>${escape(L.mgrSec)}</h2>
      <table>
        <thead><tr><th>${escape(L.mgr)}</th><th>${escape(L.people)}</th><th>${escape(L.selfS)}</th><th>${escape(L.teamS)}</th><th>${escape(L.overall)}</th></tr></thead>
        <tbody>${mgrRows || row(L.nodata, '-')}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>${escape(L.strong)}</h2>
      <table>
        <thead><tr><th>${escape(L.category)}</th><th>${escape(L.teamS)}</th><th>${escape(L.selfS)}</th></tr></thead>
        <tbody>${topCats || row(L.nodata, '-')}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>${escape(L.weak)}</h2>
      <table>
        <thead><tr><th>${escape(L.category)}</th><th>${escape(L.teamS)}</th><th>${escape(L.selfS)}</th></tr></thead>
        <tbody>${bottomCats || row(L.nodata, '-')}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>${escape(L.swot)}</h2>
      <table>
        <tbody>
          ${row(L.swS, (payload.swot.strengths || []).map((x) => `${x.name} (${x.score.toFixed(1)})`).join(', ') || '-')}
          ${row(L.swW, (payload.swot.weaknesses || []).map((x) => `${x.name} (${x.score.toFixed(1)})`).join(', ') || '-')}
          ${row(L.swO, (payload.swot.opportunities || []).map((x) => `${x.name} (${x.score.toFixed(1)})`).join(', ') || '-')}
        </tbody>
      </table>
      <h2>${escape(L.swR)}</h2>
      <ul>${swotRecs || '<li>-</li>'}</ul>
    </div>
  </body>
</html>`

    w.document.open()
    w.document.write(reportHtml)
    w.document.close()
    setTimeout(() => w.print(), 250)
  }, [payload, selectedDept, selectedPeriod, lang])

  const locale = lang === 'tr' ? 'tr-TR' : lang === 'fr' ? 'fr-FR' : 'en-US'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('orgInsights', lang)}</h1>
        <p className="text-[var(--muted)] mt-1">{t('insightsPageSubtitle', lang)}</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-[var(--brand)]" />
            {t('insightsFilters', lang)}
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Select
              label={t('periodLabel', lang)}
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              options={[{ value: '', label: t('selectPeriod', lang) }, ...periods.map((p) => ({ value: p.id, label: p.name }))]}
            />
            <Select
              label={t('departmentLabel', lang)}
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              options={[{ value: '', label: t('allDepartments', lang) }, ...departments.map((d) => ({ value: d, label: d }))]}
            />
            <div className="flex items-end">
              <Button onClick={loadInsights} disabled={loading || !selectedPeriod} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BarChart3 className="w-4 h-4 mr-2" />}
                {t('insightsRunAnalysis', lang)}
              </Button>
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={downloadCsv} disabled={!payload.generatedAt} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                {t('insightsCsvDownload', lang)}
              </Button>
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={printPdf} disabled={!payload.generatedAt} className="w-full">
                <FileText className="w-4 h-4 mr-2" />
                {t('insightsPrintPdfBtn', lang)}
              </Button>
            </div>
            <div className="flex items-end justify-end text-xs text-[var(--muted)]">
              {payload.generatedAt ? `${t('insightsUpdatedAt', lang)}: ${new Date(payload.generatedAt).toLocaleString(locale)}` : ''}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card><CardBody className="py-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">{t('insightsPeopleCount', lang)}</p><p className="text-2xl font-bold">{payload.summary.peopleCount}</p></div><Users className="w-5 h-5 text-[var(--brand)]" /></div></CardBody></Card>
        <Card><CardBody className="py-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">{t('insightsSelfAvgLabel', lang)}</p><p className="text-2xl font-bold text-[var(--brand)]">{payload.summary.avgSelf.toFixed(1)}</p></div><Brain className="w-5 h-5 text-[var(--brand)]" /></div></CardBody></Card>
        <Card><CardBody className="py-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">{t('insightsTeamAvgLabel', lang)}</p><p className="text-2xl font-bold text-[var(--success)]">{payload.summary.avgTeam.toFixed(1)}</p></div><TrendingUp className="w-5 h-5 text-[var(--success)]" /></div></CardBody></Card>
        <Card><CardBody className="py-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">{t('insightsOverallAvgLabel', lang)}</p><p className="text-2xl font-bold">{payload.summary.avgOverall.toFixed(1)}</p></div><Building2 className="w-5 h-5 text-[var(--muted)]" /></div></CardBody></Card>
      </div>

      {payload.generatedAt ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardBody className="py-4">
              <p className="text-xs text-[var(--muted)]">{t('insightsSelfTeamGapCard', lang)}</p>
              <p className={`text-2xl font-bold ${avgSelfTeamGap > 0 ? 'text-[var(--brand)]' : avgSelfTeamGap < 0 ? 'text-[var(--success)]' : ''}`}>
                {avgSelfTeamGap > 0 ? '+' : ''}
                {avgSelfTeamGap.toFixed(1)}
              </p>
              <p className="text-[10px] text-[var(--muted)] mt-1 leading-snug">{t('insightsSelfTeamGapHint', lang)}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-4">
              <p className="text-xs text-[var(--muted)]">{t('insightsScopeCard', lang)}</p>
              <p className="text-2xl font-bold">
                {(payload.categories || []).length} / {(payload.questions || []).length}
              </p>
              <p className="text-[10px] text-[var(--muted)] mt-1">{t('category', lang)} / {t('question', lang)}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-4">
              <p className="text-xs text-[var(--muted)]">{t('insightsMaxCategoryGapCard', lang)}</p>
              {maxCategoryGap ? (
                <>
                  <p className="text-sm font-medium text-[var(--foreground)] line-clamp-2 mt-1">{maxCategoryGap.name}</p>
                  <p className="text-xl font-bold mt-0.5">
                    {maxCategoryGap.diff > 0 ? '+' : ''}
                    {maxCategoryGap.diff.toFixed(1)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--muted)] mt-1">—</p>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6 min-w-0">
        <Card>
          <CardHeader><CardTitle>{t('insightsDeptCompare10', lang)}</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto min-w-0">
            {deptChart.length ? (
              <InsightsHorizontalClusterBar
                data={deptChart}
                selfLabel={t('selfShort', lang)}
                teamLabel={t('teamShort', lang)}
              />
            ) : (
              <p className="text-sm text-[var(--muted)]">{t('noData', lang)}</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('insightsCategoryTop5', lang)}</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto min-w-0">
            {categoryChart.length ? (
              <InsightsHorizontalClusterBar
                data={categoryChart}
                selfLabel={t('selfShort', lang)}
                teamLabel={t('teamShort', lang)}
              />
            ) : (
              <p className="text-sm text-[var(--muted)]">{t('noData', lang)}</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6 min-w-0">
        <Card>
          <CardHeader><CardTitle>{t('insightsManagerCompare10', lang)}</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto min-w-0">
            {managerChart.length ? (
              <InsightsHorizontalClusterBar
                data={managerChart}
                selfLabel={t('selfShort', lang)}
                teamLabel={t('teamShort', lang)}
              />
            ) : (
              <p className="text-sm text-[var(--muted)]">{t('noData', lang)}</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('insightsManagerTable', lang)}</CardTitle></CardHeader>
          <CardBody className="space-y-2 max-h-80 overflow-auto">
            {(payload.byManager || []).length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-[var(--muted)]">{t('insightsManagerEmpty', lang)}</p>
                <p className="text-xs text-[var(--muted)] leading-relaxed">{t('insightsManagerHint', lang)}</p>
              </div>
            ) : (
              (payload.byManager || []).map((m) => (
                <div key={m.managerName} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2 rounded-lg bg-[var(--surface-2)]">
                  <span className="text-sm text-[var(--foreground)]">{m.managerName}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {fmtInsight(t('insightsManagerRowMeta', lang), {
                      n: String(m.peopleCount),
                      self: m.avgSelf.toFixed(1),
                      team: m.avgTeam.toFixed(1),
                      all: m.avgOverall.toFixed(1),
                    })}
                  </span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('insightsGapByDeptTitle', lang)}</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto min-w-0">
          {gapDeptChart.length ? (
            (() => {
              const gh = chartRowHeight(Math.max(1, gapDeptChart.length))
              return (
                <div className="w-full min-w-0 min-h-[280px] box-border" style={{ height: gh }}>
                  <ResponsiveContainer width="100%" height={gh} debounce={50}>
                    <BarChart
                      layout="vertical"
                      data={gapDeptChart}
                      margin={{ top: 8, right: 20, left: 4, bottom: 8 }}
                      barCategoryGap="36%"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" domain={gapDomain} tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" width={244} tick={<InsightsYAxisTick />} interval={0} reversed />
                      <Tooltip content={<InsightsGapTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                      <ReferenceLine x={0} stroke="#94a3b8" />
                      <Bar dataKey="gap" radius={[0, 4, 4, 0]} barSize={14}>
                        {gapDeptChart.map((entry, i) => (
                          <Cell key={`${entry.name}-${i}`} fill={entry.gap >= 0 ? '#3b82f6' : '#f97316'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            })()
          ) : (
            <p className="text-sm text-[var(--muted)]">{t('noData', lang)}</p>
          )}
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-[var(--brand)]" />
              {t('insightsFutureIdeasTitle', lang)}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={!payload.generatedAt || aiLoading} onClick={loadAiInsights} className="whitespace-nowrap">
                {aiLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {aiResult ? t('insightsAiRegenerate', lang) : t('insightsAiGenerate', lang)}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs text-[var(--muted)] leading-relaxed">{t('insightsAiHint', lang)}</p>
          <p className="text-sm text-[var(--muted)] border-b border-[var(--border)] pb-3">{t('insightsFutureIdeasIntro', lang)}</p>
          <ul className="text-sm text-[var(--foreground)] space-y-1.5 list-disc pl-5 leading-relaxed">
            <li>{t('insightsFutureIdea1', lang)}</li>
            <li>{t('insightsFutureIdea2', lang)}</li>
            <li>{t('insightsFutureIdea3', lang)}</li>
            <li>{t('insightsFutureIdea4', lang)}</li>
            <li>{t('insightsFutureIdea5', lang)}</li>
          </ul>

          {aiError ? (
            <p className="text-sm text-[var(--danger)]">{aiError}</p>
          ) : null}

          {aiResult ? (
            <div className="space-y-6 pt-2 border-t border-[var(--border)]">
              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">{t('insightsAiExecSummary', lang)}</h3>
                <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{aiResult.executiveSummary}</p>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">{t('insightsAiKeyFindings', lang)}</h3>
                <ul className="text-sm space-y-1.5 list-disc pl-5 text-[var(--foreground)]">
                  {(aiResult.keyFindings || []).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">{t('insightsAiRoadmap', lang)}</h3>
                <div className="space-y-4">
                  {(aiResult.roadmap || []).map((r, idx) => (
                    <div key={idx} className="rounded-lg border border-[var(--border)] p-3 bg-[var(--surface-2)]">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-[var(--foreground)]">{r.title}</span>
                        <Badge variant={r.priority === 'high' ? 'danger' : r.priority === 'medium' ? 'warning' : 'gray'}>
                          {aiPriorityLabel(lang, r.priority)}
                        </Badge>
                      </div>
                      <p className="text-xs text-[var(--muted)] mb-2">{t('insightsAiRationale', lang)}: {r.rationale}</p>
                      <p className="text-xs font-medium text-[var(--foreground)] mb-1">{t('insightsAiActions', lang)}</p>
                      <ul className="text-xs list-disc pl-4 mb-2 text-[var(--foreground)] space-y-0.5">
                        {(r.actions || []).map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-[var(--muted)]">
                        <span className="font-medium text-[var(--foreground)]">{t('insightsAiTimeline', lang)}:</span> {r.timelineHint}
                      </p>
                      <p className="text-xs font-medium text-[var(--foreground)] mt-2 mb-0.5">{t('insightsAiIndicators', lang)}</p>
                      <ul className="text-xs list-disc pl-4 text-[var(--muted)] space-y-0.5">
                        {(r.successIndicators || []).map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">{t('insightsAiDeepDive', lang)}</h3>
                <div className="space-y-3 text-sm text-[var(--foreground)] leading-relaxed">
                  <p>
                    <span className="font-medium">{t('difference', lang)} (öz–ekip): </span>
                    {aiResult.deepDive?.alignmentSelfVsTeam}
                  </p>
                  <p>
                    <span className="font-medium">{t('departmentLabel', lang)}: </span>
                    {aiResult.deepDive?.departmentCommentary}
                  </p>
                  <p>
                    <span className="font-medium">{t('category', lang)}: </span>
                    {aiResult.deepDive?.categoryFocus}
                  </p>
                  <p>
                    <span className="font-medium">{t('insightsAiTrainingLabel', lang)}: </span>
                    {aiResult.deepDive?.trainingAndDevelopment}
                  </p>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">{t('insightsAiQuickWins', lang)}</h3>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {(aiResult.quickWins || []).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">{t('insightsAiRisks', lang)}</h3>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {(aiResult.risksAndWatchouts || []).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">{t('insightsAiMetrics', lang)}</h3>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  {(aiResult.suggestedMetrics || []).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[var(--success)]" />{t('insightsStrong5Cat', lang)}</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {(payload.topCategories || []).map((c) => (
              <div key={c.name} className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-2)]">
                <span className="text-sm text-[var(--foreground)]">{c.name}</span>
                <Badge variant="success">{c.teamAvg.toFixed(1)}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-[var(--danger)]" />{t('insightsWeak5Cat', lang)}</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {(payload.bottomCategories || []).map((c) => (
              <div key={c.name} className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-2)]">
                <span className="text-sm text-[var(--foreground)]">{c.name}</span>
                <Badge variant="danger">{c.teamAvg.toFixed(1)}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>{t('insightsStrong5Q', lang)}</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {(payload.topQuestions || []).map((q) => (
              <div key={q.questionId} className="p-2 rounded-lg bg-[var(--surface-2)]">
                <div className="text-sm text-[var(--foreground)]">{q.text}</div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  {fmtInsight(t('insightsQuestionMeta', lang), {
                    self: q.selfAvg.toFixed(1),
                    team: q.teamAvg.toFixed(1),
                    diff: q.diff.toFixed(1),
                  })}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('insightsWeak5Q', lang)}</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {(payload.bottomQuestions || []).map((q) => (
              <div key={q.questionId} className="p-2 rounded-lg bg-[var(--surface-2)]">
                <div className="text-sm text-[var(--foreground)]">{q.text}</div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  {fmtInsight(t('insightsQuestionMeta', lang), {
                    self: q.selfAvg.toFixed(1),
                    team: q.teamAvg.toFixed(1),
                    diff: q.diff.toFixed(1),
                  })}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t('insightsCorporateSwot', lang)}</CardTitle></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">{t('insightsSwotStrengthsH', lang)}</h4>
              <ul className="text-sm text-[var(--foreground)] space-y-1">{payload.swot.strengths.map((s) => <li key={s.name}>• {s.name} ({s.score.toFixed(1)})</li>)}</ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('insightsSwotWeaknessesH', lang)}</h4>
              <ul className="text-sm text-[var(--foreground)] space-y-1">{payload.swot.weaknesses.map((w) => <li key={w.name}>• {w.name} ({w.score.toFixed(1)})</li>)}</ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('insightsSwotOpportunitiesH', lang)}</h4>
              <ul className="text-sm text-[var(--foreground)] space-y-1">{payload.swot.opportunities.map((o) => <li key={o.name}>• {o.name} ({o.score.toFixed(1)})</li>)}</ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('insightsSwotRecommendationsH', lang)}</h4>
              <ul className="text-sm text-[var(--foreground)] space-y-1">{payload.swot.recommendations.map((r, i) => <li key={`${i}-${r}`}>• {r}</li>)}</ul>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

