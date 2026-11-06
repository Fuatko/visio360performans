'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, Button, toast } from '@/components/ui'
import { t } from '@/lib/i18n'
import type { MyResultResponse } from '@/lib/my-result'
import { MY_RESULT_NOTE_MAX } from '@/lib/my-result'
import { CheckCircle2, Loader2, UserCheck } from 'lucide-react'

type Lang = 'tr' | 'en' | 'fr'

const L = (lang: Lang, tr: string, en: string, fr: string) => (lang === 'en' ? en : lang === 'fr' ? fr : tr)
const f2 = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : '—')
const sd = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`

function reasonText(reason: MyResultResponse['status']['reason'], lang: Lang) {
  if (reason === 'org_disabled') return t('myResultDisabledByOrg', lang)
  if (reason === 'too_few_evaluators') return t('myResultTooFewEvaluators', lang)
  if (reason === 'no_result')
    return L(lang, 'Bu dönem için hesaplanmış bir sonucunuz yok.', 'You have no calculated result for this period.', 'Aucun résultat calculé pour cette période.')
  return t('myResultNotReleased', lang)
}

/**
 * "Sonucum" — çalışanın kendi özet sonucu ve onayı. Sunucu (/api/my-result)
 * yalnız izin verilen alanları gönderir; bu bileşen bir şey gizlemez, çünkü
 * gizlenmesi gereken veri zaten gelmez.
 */
export function MyResultCard({ lang }: { lang: Lang }) {
  const [data, setData] = useState<MyResultResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodId, setPeriodId] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(
    async (pid: string) => {
      setLoading(true)
      try {
        const qs = new URLSearchParams({ lang })
        if (pid) qs.set('period_id', pid)
        const resp = await fetch(`/api/my-result?${qs.toString()}`, { cache: 'no-store' })
        const json = (await resp.json().catch(() => null)) as MyResultResponse | null
        if (resp.ok && json?.success) {
          setData(json)
          if (!pid && json.selectedPeriodId) setPeriodId(json.selectedPeriodId)
        } else setData(null)
      } catch {
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    [lang]
  )

  useEffect(() => {
    void load('')
  }, [load])

  const acknowledge = async () => {
    if (!data?.summary) return
    setSending(true)
    try {
      const resp = await fetch('/api/my-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: data.summary.periodId, note }),
      })
      const json = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!resp.ok || !json?.success) {
        if (resp.status !== 409) toast(json?.error || t('saveError', lang), 'error')
      }
      setNote('')
      await load(data.summary.periodId)
    } finally {
      setSending(false)
    }
  }

  if (loading && !data) {
    return (
      <Card className="mb-6">
        <CardBody>
          <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" />
        </CardBody>
      </Card>
    )
  }
  if (!data) return null

  const s = data.summary
  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'fr' ? 'fr-FR' : 'en-GB')
    } catch {
      return iso
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[var(--brand)]" />
            {t('myResultTitle', lang)}
          </CardTitle>
          {data.periods.length > 1 ? (
            <select
              className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)]"
              value={periodId}
              onChange={(e) => {
                setPeriodId(e.target.value)
                void load(e.target.value)
              }}
            >
              {data.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </CardHeader>
      <CardBody>
        {!data.status.visible || !s ? (
          <p className="text-sm text-[var(--muted)]">{reasonText(data.status.reason, lang)}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <div className="text-xs text-[var(--muted)]">{s.periodName}</div>
                <div className="text-3xl font-bold tabular-nums text-[var(--foreground)]">{f2(s.overall)}</div>
                <div className="text-xs text-[var(--muted)]">
                  {s.assessmentKind === 'job_evaluation'
                    ? L(lang, 'Genel puan (MATRIX)', 'Overall score (MATRIX)', 'Score global (MATRIX)')
                    : L(lang, 'Ekip puanı', 'Team score', 'Score équipe')}
                </div>
              </div>
              {s.self != null ? (
                <div>
                  <div className="text-xs text-[var(--muted)]">{L(lang, 'Öz değerlendirme', 'Self-assessment', 'Auto-évaluation')}</div>
                  <div className="text-xl font-semibold tabular-nums">{f2(s.self)}</div>
                  {s.selfGap != null ? (
                    <div className="text-xs text-[var(--muted)]">
                      {L(lang, 'Ekip − öz', 'Team − self', 'Équipe − auto')}: {sd(s.selfGap)}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {s.previous ? (
                <div>
                  <div className="text-xs text-[var(--muted)]">
                    {L(lang, 'Önceki döneme göre', 'vs previous period', 'vs période précédente')} ({s.previous.periodName})
                  </div>
                  <div className={`text-xl font-semibold tabular-nums ${s.previous.delta < 0 ? 'text-rose-600' : s.previous.delta > 0 ? 'text-emerald-600' : ''}`}>
                    {sd(s.previous.delta)}
                  </div>
                </div>
              ) : null}
            </div>

            {s.categories.length ? (
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] text-[var(--muted)]">
                  <tr>
                    <th className="text-left py-1.5">{L(lang, 'Yetkinlik', 'Competency', 'Compétence')}</th>
                    <th className="text-right py-1.5">{L(lang, 'Puan', 'Score', 'Score')}</th>
                    <th className="text-right py-1.5">{L(lang, 'Öz', 'Self', 'Auto')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {s.categories.map((c) => (
                    <tr key={c.name}>
                      <td className="py-1.5">{c.name}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium">{f2(c.score)}</td>
                      <td className="py-1.5 text-right tabular-nums text-[var(--muted)]">{f2(c.self)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {data.acknowledgement ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                {t('myResultAcknowledged', lang).replace('{date}', fmtDate(data.acknowledgement.acknowledgedAt))}
              </p>
            ) : (
              <div className="space-y-2 border-t border-[var(--border)] pt-3">
                <textarea
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                  rows={3}
                  maxLength={MY_RESULT_NOTE_MAX}
                  placeholder={t('myResultNotePlaceholder', lang)}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <p className="text-xs text-[var(--muted)]">{t('myResultNoteHrOnly', lang)}</p>
                <Button onClick={() => void acknowledge()} disabled={sending}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {t('myResultAcknowledge', lang)}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
