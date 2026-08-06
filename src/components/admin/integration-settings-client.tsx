'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Cable,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, toast } from '@/components/ui'

interface SettingsItem {
  platform: string
  base_url: string
  api_key: string | null
  webhook_secret: string | null
  has_api_key: boolean
  has_webhook_secret: boolean
  is_active: boolean
  last_tested_at: string | null
  last_test_status: string | null
  auto_assign: boolean
  auto_notify: boolean
  require_approval: boolean
}

interface LogRow {
  event_type: string
  direction: string
  status: string
  user_email: string | null
  error: string | null
  created_at: string
}

interface TestResult {
  success: boolean
  message?: string
  course_count?: number
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso).getTime()
  if (!Number.isFinite(d)) return '—'
  const diff = Date.now() - d
  const min = Math.round(diff / 60000)
  if (min < 1) return 'az önce'
  if (min < 60) return `${min} dk önce`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} sa önce`
  const day = Math.round(hr / 24)
  return `${day} gün önce`
}

export function IntegrationSettingsClient() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [webhookUrl, setWebhookUrl] = useState('')
  const [lastTest, setLastTest] = useState<{ at: string | null; status: string | null }>({ at: null, status: null })

  const [form, setForm] = useState({
    base_url: '',
    api_key: '',
    webhook_secret: '',
    is_active: false,
    auto_assign: false,
    auto_notify: false,
    require_approval: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/admin/integration-settings', { cache: 'no-store' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.success) throw new Error(data.error || 'Ayarlar alınamadı')
      const it: SettingsItem = data.item
      setForm({
        base_url: it.base_url || '',
        api_key: it.api_key || '',
        webhook_secret: it.webhook_secret || '',
        is_active: it.is_active,
        auto_assign: it.auto_assign,
        auto_notify: it.auto_notify,
        require_approval: it.require_approval,
      })
      setLastTest({ at: it.last_tested_at, status: it.last_test_status })
      setLogs(Array.isArray(data.logs) ? data.logs : [])
      setWebhookUrl(data.webhook_url || '')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ayarlar alınamadı', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    setSaving(true)
    try {
      const resp = await fetch('/api/admin/integration-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.success) throw new Error(data.error || 'Kaydedilemedi')
      toast('Ayarlar kaydedildi', 'success')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch('/api/admin/integration-settings/test', { method: 'POST' })
      const data = await resp.json().catch(() => ({}))
      setTestResult(data)
      toast(data.message || (data.success ? 'Bağlantı başarılı' : 'Bağlantı başarısız'), data.success ? 'success' : 'error')
      setLastTest({ at: new Date().toISOString(), status: data.success ? 'success' : 'failed' })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Test başarısız', 'error')
    } finally {
      setTesting(false)
    }
  }

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast('Kopyalanamadı', 'error')
    }
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const statusOk = lastTest.status === 'success'

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* InspiraSuite bağlantı kartı */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-[var(--brand-soft)] p-2 text-[var(--brand)]">
              <Cable className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>InspiraSuite Academy</CardTitle>
              <p className="mt-0.5 text-sm text-[var(--muted)]">Eğitim yönetimi platformu entegrasyonu</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastTest.at ? (
              <Badge variant={statusOk ? 'success' : 'danger'}>
                {statusOk ? 'Durum: OK' : 'Durum: Hata'}
              </Badge>
            ) : null}
            <Badge variant={form.is_active ? 'success' : 'default'}>{form.is_active ? 'Aktif' : 'Pasif'}</Badge>
          </div>
        </CardHeader>
        <CardBody className="space-y-5">
          {/* Aktif / Pasif */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Bağlantı Durumu</label>
            <div className="inline-flex overflow-hidden rounded-xl border border-[var(--border)]">
              <button
                type="button"
                onClick={() => set('is_active', true)}
                className={`px-4 py-2 text-sm font-medium ${form.is_active ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface)] text-[var(--muted)]'}`}
              >
                Aktif
              </button>
              <button
                type="button"
                onClick={() => set('is_active', false)}
                className={`px-4 py-2 text-sm font-medium ${!form.is_active ? 'bg-[var(--danger)] text-white' : 'bg-[var(--surface)] text-[var(--muted)]'}`}
              >
                Pasif
              </button>
            </div>
          </div>

          {/* Platform URL */}
          <Input
            label="Platform URL"
            value={form.base_url}
            onChange={(e) => set('base_url', e.target.value)}
            placeholder="https://www.inspirasuite.com"
          />

          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">API Key (InspiraSuite&apos;ten alınır)</label>
            <div className="flex gap-2">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={form.api_key}
                onChange={(e) => set('api_key', e.target.value)}
                placeholder="VISIO360PDS_API_KEY ile aynı değer"
                className="flex-1"
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowApiKey((v) => !v)}>
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showApiKey ? 'Gizle' : 'Göster'}
              </Button>
            </div>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Webhook Secret</label>
            <div className="flex gap-2">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={form.webhook_secret}
                onChange={(e) => set('webhook_secret', e.target.value)}
                placeholder="Opsiyonel — gelen webhook doğrulaması için"
                className="flex-1"
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowSecret((v) => !v)}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showSecret ? 'Gizle' : 'Göster'}
              </Button>
            </div>
          </div>

          {/* Otomatik atama seçenekleri */}
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--foreground)]">Otomatik Atama</label>
            <div className="space-y-2">
              {[
                { key: 'auto_assign' as const, label: 'Yetkinlik açığında kurs otomatik ata' },
                { key: 'auto_notify' as const, label: 'Değerlendirme tamamlandığında bildir' },
                { key: 'require_approval' as const, label: 'Manuel onay gerektir' },
              ].map((opt) => (
                <label key={opt.key} className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--brand)]"
                    checked={form[opt.key]}
                    onChange={(e) => set(opt.key, e.target.checked)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Son test */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm">
            {testResult ? (
              <div className={`flex items-center gap-2 ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {testResult.message}
              </div>
            ) : lastTest.at ? (
              <div className="flex items-center gap-2 text-[var(--muted)]">
                {statusOk ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                Son test: {relativeTime(lastTest.at)} — {statusOk ? 'başarılı' : 'başarısız'}
              </div>
            ) : (
              <span className="text-[var(--muted)]">Henüz test edilmedi.</span>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Bağlantıyı Test Et
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Kaydet
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Webhook URL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-[var(--brand)]" /> Webhook URL&apos;leri (InspiraSuite&apos;e girin)
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-sm text-[var(--muted)]">Eğitim tamamlama bildirimi için InspiraSuite&apos;in çağıracağı adres:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--foreground)]">
              {webhookUrl}
            </code>
            <Button type="button" variant="secondary" size="sm" onClick={copyWebhook}>
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Bu URL&apos;yi InspiraSuite admin panelinde Entegrasyonlar → Visio360PDS bölümüne girin.
          </p>
        </CardBody>
      </Card>

      {/* Son loglar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Son Entegrasyon Logları</CardTitle>
        </CardHeader>
        <CardBody>
          {logs.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Henüz log kaydı yok.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {logs.map((l, i) => {
                const ok = l.status === 'success'
                return (
                  <li key={i} className="flex items-center gap-3 py-2 text-sm">
                    {ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                    )}
                    <span className="font-medium text-[var(--foreground)]">{l.event_type}</span>
                    <span className="truncate text-[var(--muted)]">{l.user_email || (ok ? '' : (l.error || 'FAILED'))}</span>
                    <span className="ml-auto shrink-0 text-xs text-[var(--muted)]">{relativeTime(l.created_at)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
