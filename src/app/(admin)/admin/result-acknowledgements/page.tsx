'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardBody, Badge, Button, toast, ToastContainer } from '@/components/ui'
import { ReportExportButtons } from '@/components/admin/report-export-buttons'
import { useLang } from '@/components/i18n/language-context'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { t } from '@/lib/i18n'
import { buildCsv, downloadCsv, openPrintableReportDocument } from '@/lib/admin-report-export'
import type { AckAdminRow } from '@/lib/my-result'
import { FileCheck2, Loader2, Trash2 } from 'lucide-react'

type Lang = 'tr' | 'en' | 'fr'
type Period = { id: string; name: string }
type Summary = { canSee: number; acknowledged: number; meetings: number; total: number }

const L = (lang: Lang, tr: string, en: string, fr: string) => (lang === 'en' ? en : lang === 'fr' ? fr : tr)

function reasonText(reason: AckAdminRow['reason'], lang: Lang) {
  if (reason === 'org_disabled') return L(lang, 'kurum ayarı kapalı', 'disabled by organisation', 'désactivé par l’organisation')
  if (reason === 'not_released') return L(lang, 'dönem yayınlanmadı', 'period not released', 'période non publiée')
  if (reason === 'too_few_evaluators') return L(lang, 'değerlendirici < 3', 'evaluators < 3', 'évaluateurs < 3')
  if (reason === 'no_result') return L(lang, 'sonuç yok', 'no result', 'pas de résultat')
  return ''
}

export default function ResultAcknowledgementsPage() {
  const lang = useLang() as Lang
  const { organizationId } = useAdminContextStore()
  const { user } = useAuthStore()
  const orgId = user?.role === 'org_admin' ? String(user.organization_id || '') : String(organizationId || '')

  const [periods, setPeriods] = useState<Period[]>([])
  const [periodId, setPeriodId] = useState('')
  const [rows, setRows] = useState<AckAdminRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ at: string; note: string }>({ at: '', note: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!orgId) return
    ;(async () => {
      try {
        const resp = await fetch(`/api/admin/matrix-data?org_id=${encodeURIComponent(orgId)}`, { cache: 'no-store' })
        const json = (await resp.json().catch(() => ({}))) as { success?: boolean; periods?: Array<{ id: string; name: string }> }
        if (resp.ok && json?.success) setPeriods((json.periods || []).map((p) => ({ id: String(p.id), name: String(p.name || '') })))
      } catch {
        /* ignore */
      }
    })()
  }, [orgId])

  const load = useCallback(
    async (pid: string) => {
      if (!pid || !orgId) return
      setLoading(true)
      try {
        const qs = new URLSearchParams({ period_id: pid, org_id: orgId, lang })
        const resp = await fetch(`/api/admin/result-acknowledgements?${qs.toString()}`, { cache: 'no-store' })
        const json = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string; rows?: AckAdminRow[]; summary?: Summary }
        if (!resp.ok || !json?.success) throw new Error(json?.error || t('exportNoData', lang))
        setRows(json.rows || [])
        setSummary(json.summary || null)
      } catch (e) {
        toast(e instanceof Error ? e.message : t('exportNoData', lang), 'error')
      } finally {
        setLoading(false)
      }
    },
    [orgId, lang]
  )

  const fmt = (iso: string | null) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'fr' ? 'fr-FR' : 'en-GB')
    } catch {
      return iso
    }
  }

  // Çalışan yorumu sütunu YALNIZ yanıtta alan varsa (sunucu rol kontrolüyle ekler).
  const showNotes = rows.some((r) => 'employeeNote' in r)

  const headers = () => [
    L(lang, 'Kişi', 'Person', 'Personne'),
    L(lang, 'Birim', 'Department', 'Département'),
    L(lang, 'Sonucu görebilir mi', 'Can see result', 'Peut voir le résultat'),
    L(lang, 'Onay tarihi', 'Acknowledged on', 'Accusé le'),
    L(lang, 'Görüşme tarihi', 'Meeting date', 'Date d’entretien'),
    ...(showNotes ? [L(lang, 'Çalışan yorumu (yalnız İK)', 'Employee note (HR only)', 'Note employé (RH)')] : []),
    L(lang, 'Görüşme notu', 'Meeting note', 'Note d’entretien'),
  ]
  const rowCells = (r: AckAdminRow) => [
    r.name,
    r.department,
    r.canSee ? L(lang, 'Evet', 'Yes', 'Oui') : `${L(lang, 'Hayır', 'No', 'Non')} (${reasonText(r.reason, lang)})`,
    r.acknowledgedAt ? fmt(r.acknowledgedAt) : t('ackPending', lang),
    fmt(r.meetingAt),
    ...(showNotes ? [r.employeeNote || ''] : []),
    r.meetingNote || '',
  ]

  const periodName = periods.find((p) => p.id === periodId)?.name || ''
  const exportCsv = () => {
    if (!rows.length) return void toast(t('exportNoData', lang), 'error')
    downloadCsv(`sonuc-onaylari_${periodName || 'donem'}.csv`, buildCsv(headers(), rows.map(rowCells)))
  }
  const exportPdf = () => {
    if (!rows.length) return void toast(t('exportNoData', lang), 'error')
    openPrintableReportDocument({
      lang,
      title: `${t('ackPanelTitle', lang)} — ${periodName}`,
      sections: [{ headers: headers(), rows: rows.map((r) => rowCells(r).map(String)) }],
    })
  }

  const saveMeeting = async (userId: string) => {
    setSaving(true)
    try {
      const resp = await fetch('/api/admin/result-acknowledgements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: periodId, user_id: userId, org_id: orgId, meeting_at: draft.at || null, meeting_note: draft.note }),
      })
      const json = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!resp.ok || !json?.success) throw new Error(json?.error || t('saveError', lang))
      toast(t('saved', lang), 'success')
      setEditing(null)
      await load(periodId)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('saveError', lang), 'error')
    } finally {
      setSaving(false)
    }
  }

  const removeAck = async (userId: string) => {
    if (!window.confirm(L(lang, 'Bu kişinin onay kaydı silinsin mi?', 'Delete this acknowledgement?', 'Supprimer cet accusé ?'))) return
    const qs = new URLSearchParams({ period_id: periodId, user_id: userId, org_id: orgId })
    const resp = await fetch(`/api/admin/result-acknowledgements?${qs.toString()}`, { method: 'DELETE' })
    const json = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string }
    if (!resp.ok || !json?.success) return void toast(json?.error || t('saveError', lang), 'error')
    await load(periodId)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <ToastContainer />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-6 h-6 text-[var(--brand)]" aria-hidden />
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">{t('ackPanelTitle', lang)}</h1>
        </div>
        <ReportExportButtons onExcel={exportCsv} onPdf={exportPdf} excelDisabled={!rows.length} pdfDisabled={!rows.length} />
      </div>

      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--muted)]">{t('period', lang)}</label>
            <select
              className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--foreground)]"
              value={periodId}
              onChange={(e) => {
                setPeriodId(e.target.value)
                setRows([])
                setSummary(null)
                void load(e.target.value)
              }}
            >
              <option value="">{t('selectPeriodPlaceholder', lang)}</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" /> : null}
          {summary ? (
            <div className="flex flex-wrap gap-2 ml-auto">
              <Badge variant="info">
                {L(lang, 'Görebilen', 'Can see', 'Peuvent voir')}: {summary.canSee} / {summary.total}
              </Badge>
              <Badge variant="success">
                {L(lang, 'Onaylayan', 'Acknowledged', 'Accusés')}: {summary.acknowledged}
              </Badge>
              <Badge variant="warning">
                {L(lang, 'Görüşme', 'Meetings', 'Entretiens')}: {summary.meetings}
              </Badge>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {rows.length ? (
        <Card>
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                <tr>
                  {headers().map((h) => (
                    <th key={h} className="text-left py-2 px-3 font-semibold text-[var(--muted)]">
                      {h}
                    </th>
                  ))}
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((r) => (
                  <tr key={r.userId} className="align-top">
                    {rowCells(r).map((c, i) => (
                      <td key={i} className="py-2 px-3 text-[var(--foreground)] max-w-[22rem] whitespace-pre-wrap">
                        {c}
                      </td>
                    ))}
                    <td className="py-2 px-3 whitespace-nowrap">
                      {editing === r.userId ? (
                        <div className="flex flex-col gap-1.5 min-w-[16rem]">
                          <input
                            type="date"
                            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                            value={draft.at}
                            onChange={(e) => setDraft((d) => ({ ...d, at: e.target.value }))}
                          />
                          <textarea
                            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
                            rows={3}
                            value={draft.note}
                            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                          />
                          <div className="flex gap-1.5">
                            <Button size="sm" onClick={() => void saveMeeting(r.userId)} disabled={saving}>
                              {t('save', lang)}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              {L(lang, 'Vazgeç', 'Cancel', 'Annuler')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditing(r.userId)
                              setDraft({ at: r.meetingAt ? r.meetingAt.slice(0, 10) : '', note: r.meetingNote || '' })
                            }}
                          >
                            {t('ackMeetingRecord', lang)}
                          </Button>
                          {r.acknowledgedAt ? (
                            <Button size="sm" variant="ghost" onClick={() => void removeAck(r.userId)} aria-label={t('delete', lang)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
