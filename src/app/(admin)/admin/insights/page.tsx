'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, Select, Button, Badge, toast } from '@/components/ui'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { BarChart3, Brain, Building2, Download, Loader2, Search, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

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
    loadOrgScopedData(orgToUse).catch((e: any) => toast(String(e?.message || 'Kurum verisi alınamadı'), 'error'))
  }, [organizationId, userOrgId, userRole, loadOrgScopedData])

  const loadInsights = useCallback(async () => {
    const orgToUse = userRole === 'org_admin' ? userOrgId : organizationId
    if (!orgToUse || !selectedPeriod) {
      toast('Önce kurum ve dönem seçin', 'error')
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
      if (!resp.ok || !data?.success) throw new Error(data?.error || 'Analiz verisi alınamadı')
      setPayload({ ...emptyPayload, ...data })
    } catch (e: any) {
      toast(String(e?.message || 'Analiz verisi alınamadı'), 'error')
    } finally {
      setLoading(false)
    }
  }, [organizationId, selectedDept, selectedPeriod, userOrgId, userRole, lang])

  const deptChart = useMemo(
    () =>
      (payload.byDepartment || []).slice(0, 10).map((d) => ({
        name: d.department.length > 18 ? `${d.department.slice(0, 18)}…` : d.department,
        team: d.avgTeam,
        self: d.avgSelf,
      })),
    [payload.byDepartment]
  )

  const categoryChart = useMemo(
    () =>
      (payload.topCategories || []).map((c) => ({
        name: c.name.length > 22 ? `${c.name.slice(0, 22)}…` : c.name,
        team: c.teamAvg,
        self: c.selfAvg,
      })),
    [payload.topCategories]
  )

  const managerChart = useMemo(
    () =>
      (payload.byManager || []).slice(0, 10).map((m) => ({
        name: m.managerName.length > 18 ? `${m.managerName.slice(0, 18)}…` : m.managerName,
        team: m.avgTeam,
        self: m.avgSelf,
      })),
    [payload.byManager]
  )

  const downloadCsv = useCallback(() => {
    const rows: string[] = []
    rows.push('Bölüm,Ad,Sayı,Öz,Ekip,Genel')
    rows.push(`Özet,Kurum,${payload.summary.peopleCount},${payload.summary.avgSelf},${payload.summary.avgTeam},${payload.summary.avgOverall}`)
    ;(payload.byDepartment || []).forEach((d) => {
      rows.push(`Branş,${String(d.department).replace(/,/g, ' ')},${d.peopleCount},${d.avgSelf},${d.avgTeam},${d.avgOverall}`)
    })
    ;(payload.byManager || []).forEach((m) => {
      rows.push(`Yönetici,${String(m.managerName).replace(/,/g, ' ')},${m.peopleCount},${m.avgSelf},${m.avgTeam},${m.avgOverall}`)
    })
    ;(payload.topCategories || []).forEach((c) => {
      rows.push(`KategoriTop5,${String(c.name).replace(/,/g, ' ')},${c.totalCount},${c.selfAvg},${c.teamAvg},${c.diff}`)
    })
    ;(payload.bottomCategories || []).forEach((c) => {
      rows.push(`KategoriBottom5,${String(c.name).replace(/,/g, ' ')},${c.totalCount},${c.selfAvg},${c.teamAvg},${c.diff}`)
    })
    ;(payload.topQuestions || []).forEach((q) => {
      rows.push(`SoruTop5,${String(q.text).replace(/,/g, ' ')},${q.totalCount},${q.selfAvg},${q.teamAvg},${q.diff}`)
    })
    ;(payload.bottomQuestions || []).forEach((q) => {
      rows.push(`SoruBottom5,${String(q.text).replace(/,/g, ' ')},${q.totalCount},${q.selfAvg},${q.teamAvg},${q.diff}`)
    })
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kurumsal-icgoruler-${selectedPeriod || 'period'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [payload, selectedPeriod])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('resultsReports', lang)} — Kurumsal İçgörüler</h1>
        <p className="text-[var(--muted)] mt-1">Kurum genel öz/ekip karşılaştırması, branş kırılımı, SWOT ve top/bottom analizleri.</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-[var(--brand)]" />
            Filtreler
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
                Analizi Getir
              </Button>
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={downloadCsv} disabled={!payload.generatedAt} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                CSV İndir
              </Button>
            </div>
            <div className="flex items-end justify-end text-xs text-[var(--muted)]">
              {payload.generatedAt ? `Güncelleme: ${new Date(payload.generatedAt).toLocaleString('tr-TR')}` : ''}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card><CardBody className="py-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Kişi</p><p className="text-2xl font-bold">{payload.summary.peopleCount}</p></div><Users className="w-5 h-5 text-[var(--brand)]" /></div></CardBody></Card>
        <Card><CardBody className="py-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Öz Ortalama</p><p className="text-2xl font-bold text-[var(--brand)]">{payload.summary.avgSelf.toFixed(1)}</p></div><Brain className="w-5 h-5 text-[var(--brand)]" /></div></CardBody></Card>
        <Card><CardBody className="py-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Ekip Ortalama</p><p className="text-2xl font-bold text-[var(--success)]">{payload.summary.avgTeam.toFixed(1)}</p></div><TrendingUp className="w-5 h-5 text-[var(--success)]" /></div></CardBody></Card>
        <Card><CardBody className="py-4"><div className="flex items-center justify-between"><div><p className="text-xs text-[var(--muted)]">Genel Ortalama</p><p className="text-2xl font-bold">{payload.summary.avgOverall.toFixed(1)}</p></div><Building2 className="w-5 h-5 text-[var(--muted)]" /></div></CardBody></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Branş Bazlı Karşılaştırma (İlk 10)</CardTitle></CardHeader>
          <CardBody className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 5]} />
                <Tooltip />
                <Bar dataKey="self" name="Öz" fill="#3b82f6" />
                <Bar dataKey="team" name="Ekip" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Kategori Top 5 (Öz/Ekip)</CardTitle></CardHeader>
          <CardBody className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 5]} />
                <Tooltip />
                <Bar dataKey="self" name="Öz" fill="#3b82f6" />
                <Bar dataKey="team" name="Ekip" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Yönetici Bazlı Karşılaştırma (İlk 10)</CardTitle></CardHeader>
          <CardBody className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={managerChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 5]} />
                <Tooltip />
                <Bar dataKey="self" name="Öz" fill="#3b82f6" />
                <Bar dataKey="team" name="Ekip" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Yönetici Bazlı Tablo</CardTitle></CardHeader>
          <CardBody className="space-y-2 max-h-80 overflow-auto">
            {(payload.byManager || []).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Yönetici verisi bulunamadı.</p>
            ) : (
              (payload.byManager || []).map((m) => (
                <div key={m.managerName} className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-2)]">
                  <span className="text-sm text-[var(--foreground)]">{m.managerName}</span>
                  <span className="text-xs text-[var(--muted)]">
                    Kişi: {m.peopleCount} • Öz: {m.avgSelf.toFixed(1)} • Ekip: {m.avgTeam.toFixed(1)} • Genel: {m.avgOverall.toFixed(1)}
                  </span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[var(--success)]" />Güçlü 5 Kategori</CardTitle></CardHeader>
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
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-[var(--danger)]" />Geliştirilmesi Gereken 5 Kategori</CardTitle></CardHeader>
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
          <CardHeader><CardTitle>Soru Bazlı En Güçlü 5</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {(payload.topQuestions || []).map((q) => (
              <div key={q.questionId} className="p-2 rounded-lg bg-[var(--surface-2)]">
                <div className="text-sm text-[var(--foreground)]">{q.text}</div>
                <div className="text-xs text-[var(--muted)] mt-1">Öz: {q.selfAvg.toFixed(1)} • Ekip: {q.teamAvg.toFixed(1)} • Fark: {q.diff.toFixed(1)}</div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Soru Bazlı Öncelikli 5 Gelişim Alanı</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {(payload.bottomQuestions || []).map((q) => (
              <div key={q.questionId} className="p-2 rounded-lg bg-[var(--surface-2)]">
                <div className="text-sm text-[var(--foreground)]">{q.text}</div>
                <div className="text-xs text-[var(--muted)] mt-1">Öz: {q.selfAvg.toFixed(1)} • Ekip: {q.teamAvg.toFixed(1)} • Fark: {q.diff.toFixed(1)}</div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Kurumsal SWOT (Kategori Bazlı)</CardTitle></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Strengths</h4>
              <ul className="text-sm text-[var(--foreground)] space-y-1">{payload.swot.strengths.map((s) => <li key={s.name}>• {s.name} ({s.score.toFixed(1)})</li>)}</ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Weaknesses</h4>
              <ul className="text-sm text-[var(--foreground)] space-y-1">{payload.swot.weaknesses.map((w) => <li key={w.name}>• {w.name} ({w.score.toFixed(1)})</li>)}</ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Opportunities</h4>
              <ul className="text-sm text-[var(--foreground)] space-y-1">{payload.swot.opportunities.map((o) => <li key={o.name}>• {o.name} ({o.score.toFixed(1)})</li>)}</ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Recommendations</h4>
              <ul className="text-sm text-[var(--foreground)] space-y-1">{payload.swot.recommendations.map((r, i) => <li key={`${i}-${r}`}>• {r}</li>)}</ul>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

