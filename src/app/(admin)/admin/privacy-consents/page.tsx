'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, toast, ToastContainer, Button, Badge } from '@/components/ui'
import { Loader2, Download, ShieldCheck, RefreshCw } from 'lucide-react'
import { useLang } from '@/components/i18n/language-context'

type ConsentRow = {
  user_id: string
  name: string
  email: string
  department: string
  accepted: boolean
  accepted_at: string | null
  ip_address: string | null
  text_version: string | null
  stale: boolean
}

type Period = { id: string; name: string; status: string | null }

const L = {
  tr: {
    title: 'Gizlilik Onayları',
    subtitle: 'Değerlendirme taahhüt metnini kim onayladı / kim onaylamadı',
    period: 'Dönem',
    selectPeriod: 'Dönem seçin',
    load: 'Raporu Getir',
    loading: 'Yükleniyor…',
    csv: 'CSV indir',
    total: 'Toplam',
    accepted: 'Onaylayan',
    pending: 'Bekleyen',
    name: 'Ad Soyad',
    email: 'E-posta',
    dept: 'Birim',
    status: 'Durum',
    when: 'Onay zamanı',
    ip: 'IP',
    version: 'Sürüm',
    ok: 'Onayladı',
    no: 'Onaylamadı',
    staleTag: 'Eski sürüm',
    empty: 'Bu dönemde atanmış değerlendirici bulunamadı.',
    versionNote: 'Geçerli metin sürümü',
  },
  fr: {
    title: 'Approbations de confidentialité',
    subtitle: "Qui a approuvé / n'a pas approuvé le texte d'engagement",
    period: 'Période',
    selectPeriod: 'Choisir une période',
    load: 'Charger le rapport',
    loading: 'Chargement…',
    csv: 'Exporter CSV',
    total: 'Total',
    accepted: 'Approuvé',
    pending: 'En attente',
    name: 'Nom',
    email: 'E-mail',
    dept: 'Service',
    status: 'Statut',
    when: "Date d'approbation",
    ip: 'IP',
    version: 'Version',
    ok: 'Approuvé',
    no: 'Non approuvé',
    staleTag: 'Ancienne version',
    empty: 'Aucun évaluateur affecté pour cette période.',
    versionNote: 'Version du texte en vigueur',
  },
  en: {
    title: 'Privacy Consents',
    subtitle: 'Who approved / did not approve the undertaking text',
    period: 'Period',
    selectPeriod: 'Select a period',
    load: 'Load report',
    loading: 'Loading…',
    csv: 'Export CSV',
    total: 'Total',
    accepted: 'Approved',
    pending: 'Pending',
    name: 'Name',
    email: 'Email',
    dept: 'Department',
    status: 'Status',
    when: 'Approved at',
    ip: 'IP',
    version: 'Version',
    ok: 'Approved',
    no: 'Not approved',
    staleTag: 'Old version',
    empty: 'No evaluators assigned for this period.',
    versionNote: 'Current text version',
  },
}

export default function PrivacyConsentsPage() {
  const lang = useLang()
  const tr = L[lang as keyof typeof L] || L.tr
  const [periods, setPeriods] = useState<Period[]>([])
  const [periodId, setPeriodId] = useState('')
  const [rows, setRows] = useState<ConsentRow[]>([])
  const [summary, setSummary] = useState<{ total: number; accepted: number; pending: number; version: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const resp = await fetch('/api/admin/privacy-consents')
        const json = (await resp.json().catch(() => ({}))) as any
        if (resp.ok && json?.success) setPeriods((json.periods || []) as Period[])
      } catch {
        /* ignore */
      }
    })()
  }, [])

  const loadReport = async (pid: string) => {
    if (!pid) return
    setLoading(true)
    try {
      const resp = await fetch('/api/admin/privacy-consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: pid }),
      })
      const json = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !json?.success) {
        toast(json?.error || 'Rapor alınamadı', 'error')
        return
      }
      setRows((json.rows || []) as ConsentRow[])
      setSummary({ total: json.total || 0, accepted: json.accepted || 0, pending: json.pending || 0, version: json.version || '' })
    } catch {
      toast('Rapor alınamadı', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (iso: string | null) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleString(lang === 'tr' ? 'tr-TR' : lang === 'fr' ? 'fr-FR' : 'en-US')
    } catch {
      return iso
    }
  }

  const exportCsv = () => {
    if (!rows.length) return
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = [tr.name, tr.email, tr.dept, tr.status, tr.when, tr.ip, tr.version]
    const lines = rows.map((r) =>
      [
        r.name,
        r.email,
        r.department,
        r.accepted ? tr.ok : tr.no,
        fmt(r.accepted_at),
        r.ip_address || '',
        r.text_version || '',
      ]
        .map((c) => esc(String(c)))
        .join(',')
    )
    const csv = [header.map(esc).join(','), ...lines].join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const pname = periods.find((p) => p.id === periodId)?.name || 'donem'
    a.download = `gizlilik-onaylari_${pname}.csv`
    a.click()
  }

  const sortedRows = useMemo(() => rows, [rows])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ToastContainer />
      <div className="mb-5 flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-[var(--brand)]" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">{tr.title}</h1>
          <p className="text-sm text-[var(--muted)]">{tr.subtitle}</p>
        </div>
      </div>

      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--muted)]">{tr.period}</label>
            <select
              className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--foreground)]"
              value={periodId}
              onChange={(e) => {
                setPeriodId(e.target.value)
                setRows([])
                setSummary(null)
              }}
            >
              <option value="">{tr.selectPeriod}</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => loadReport(periodId)} disabled={!periodId || loading} className="min-h-11">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" aria-hidden />}
            {loading ? tr.loading : tr.load}
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={!rows.length} className="min-h-11">
            <Download className="w-5 h-5" aria-hidden />
            {tr.csv}
          </Button>
        </CardBody>
      </Card>

      {summary ? (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <Card>
            <CardBody className="text-center">
              <div className="text-2xl font-semibold text-[var(--foreground)]">{summary.total}</div>
              <div className="text-sm text-[var(--muted)]">{tr.total}</div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <div className="text-2xl font-semibold text-green-600">{summary.accepted}</div>
              <div className="text-sm text-[var(--muted)]">{tr.accepted}</div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <div className="text-2xl font-semibold text-amber-600">{summary.pending}</div>
              <div className="text-sm text-[var(--muted)]">{tr.pending}</div>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {summary ? (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>{tr.title}</CardTitle>
            <span className="text-xs text-[var(--muted)]">
              {tr.versionNote}: {summary.version}
            </span>
          </CardHeader>
          <CardBody className="overflow-x-auto">
            {sortedRows.length === 0 ? (
              <p className="py-8 text-center text-[var(--muted)]">{tr.empty}</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-[var(--muted)]">
                    <th className="border-b border-[var(--border)] px-3 py-2">{tr.name}</th>
                    <th className="border-b border-[var(--border)] px-3 py-2">{tr.email}</th>
                    <th className="border-b border-[var(--border)] px-3 py-2">{tr.dept}</th>
                    <th className="border-b border-[var(--border)] px-3 py-2">{tr.status}</th>
                    <th className="border-b border-[var(--border)] px-3 py-2">{tr.when}</th>
                    <th className="border-b border-[var(--border)] px-3 py-2">{tr.ip}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => (
                    <tr key={r.user_id} className="text-[var(--foreground)]">
                      <td className="border-b border-[var(--border)] px-3 py-2">{r.name}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">{r.email}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">{r.department}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">
                        {r.accepted ? (
                          <Badge variant="success">{tr.ok}</Badge>
                        ) : r.stale ? (
                          <Badge variant="warning">{tr.staleTag}</Badge>
                        ) : (
                          <Badge variant="danger">{tr.no}</Badge>
                        )}
                      </td>
                      <td className="border-b border-[var(--border)] px-3 py-2">{fmt(r.accepted_at)}</td>
                      <td className="border-b border-[var(--border)] px-3 py-2">{r.ip_address || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
