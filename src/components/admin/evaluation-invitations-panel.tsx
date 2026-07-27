'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Button, Badge, toast } from '@/components/ui'
import { Loader2, Mail, Send, CheckCircle, Eye, RefreshCw } from 'lucide-react'

type InviteItem = {
  evaluator_id: string
  name: string
  email: string
  title?: string
  department?: string
  pending_count: number
  total_count: number
  invited_at: string | null
  invited_status: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

/**
 * Değerlendirme davetleri — onay sonrası e-posta gönderimi.
 * E-posta yalnızca "Onayla ve gönder" ile çıkar; öncesinde hiçbir şey gönderilmez.
 */
export function EvaluationInvitationsPanel({ periodId }: { periodId: string }) {
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [items, setItems] = useState<InviteItem[]>([])
  const [periodName, setPeriodName] = useState('')
  const [needsMigration, setNeedsMigration] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showPreview, setShowPreview] = useState(false)

  const load = useCallback(async () => {
    if (!periodId) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const resp = await fetch(`/api/admin/evaluation-invitations?period_id=${encodeURIComponent(periodId)}`, {
        cache: 'no-store',
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Davet listesi alınamadı')
      setItems(payload.items || [])
      setPeriodName(payload.period_name || '')
      setNeedsMigration(payload.needs_migration ? String(payload.hint || '') : null)
      setSelected(new Set())
    } catch (e: any) {
      toast(e?.message || 'Davet listesi alınamadı', 'error')
    } finally {
      setLoading(false)
    }
  }, [periodId])

  useEffect(() => {
    load()
  }, [load])

  const withEmail = items.filter((i) => i.email)
  const selectableIds = withEmail.map((i) => i.evaluator_id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected((prev) => (allSelected ? new Set() : new Set(selectableIds)))

  const send = async () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (!window.confirm(`${ids.length} değerlendirene davet e-postası gönderilecek. Onaylıyor musunuz?`)) return
    setSending(true)
    try {
      const resp = await fetch('/api/admin/evaluation-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: periodId, evaluator_ids: ids }),
      })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Gönderim başarısız')
      const sent = Number(payload.sent || 0)
      const failed = Number(payload.total || 0) - sent
      if (failed > 0) {
        const firstErr = (payload.results || []).find((r: any) => !r.ok)?.error
        toast(`${sent} gönderildi, ${failed} başarısız${firstErr ? ` (örn. ${firstErr})` : ''}`, failed === Number(payload.total) ? 'error' : 'warning')
      } else {
        toast(`${sent} davet e-postası gönderildi`, 'success')
      }
      await load()
    } catch (e: any) {
      toast(e?.message || 'Gönderim başarısız', 'error')
    } finally {
      setSending(false)
    }
  }

  if (!periodId) return null

  const notInvited = withEmail.filter((i) => !i.invited_at).length

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600" />
          Değerlendirme davetleri
          {notInvited > 0 ? <Badge variant="warning">{notInvited} bekliyor</Badge> : null}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowPreview((v) => !v)}>
            <Eye className="w-4 h-4" />
            Önizle
          </Button>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="w-4 h-4" />
            Yenile
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        <p className="text-xs text-gray-500 mb-3">
          E-posta yalnızca <strong>“Onayla ve gönder”</strong> dediğinizde çıkar. Otomatik gönderim yoktur.
        </p>

        {needsMigration ? (
          <p className="text-sm text-amber-700">{needsMigration}</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">Bu dönemde atanmış değerlendiren yok.</p>
        ) : (
          <>
            {showPreview ? (
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 text-sm text-gray-700">
                <div className="font-medium text-gray-900 mb-1">E-posta önizlemesi</div>
                <p className="text-xs text-gray-500 mb-2">Konu: Değerlendirme daveti — {periodName || 'Dönem'}</p>
                <p>Sayın [Ad Soyad],</p>
                <p className="mt-1">
                  <strong>{periodName || 'Dönem'}</strong> döneminde tamamlamanız gereken <strong>[N]</strong> değerlendirme
                  bulunuyor. Değerlendirmeleri yapmak için sisteme giriş yapın; bekleyen değerlendirmeleriniz ana
                  sayfanızda listelenir.
                </p>
                <p className="mt-2 text-blue-700 underline">[Giriş yap ve değerlendir]</p>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!selectableIds.length} />
                Tümünü seç ({selectableIds.length})
              </label>
              <Button size="sm" onClick={send} disabled={sending || selected.size === 0}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Onayla ve gönder ({selected.size})
              </Button>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                {items.map((i) => {
                  const noEmail = !i.email
                  return (
                    <label
                      key={i.evaluator_id}
                      className={`flex items-center gap-3 px-4 py-3 text-sm ${noEmail ? 'opacity-60' : 'hover:bg-gray-50 cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(i.evaluator_id)}
                        onChange={() => toggle(i.evaluator_id)}
                        disabled={noEmail}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-gray-900">{i.name}</span>
                        <span className="block text-xs text-gray-500 truncate">
                          {noEmail ? 'E-posta adresi yok' : i.email}
                          {i.department || i.title ? ` · ${[i.department, i.title].filter(Boolean).join(' • ')}` : ''}
                        </span>
                      </span>
                      <span className="text-xs text-gray-600 whitespace-nowrap">
                        {i.pending_count}/{i.total_count} bekleyen
                      </span>
                      {i.invited_at ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 whitespace-nowrap">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {i.invited_status === 'failed' ? 'Hata' : 'Gönderildi'} · {fmtDate(i.invited_at)}
                        </span>
                      ) : (
                        <Badge variant="warning">Gönderilmedi</Badge>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}
