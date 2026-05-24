'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { Card, CardBody, CardHeader, CardTitle, Button, toast, ToastContainer } from '@/components/ui'
import { Activity, Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react'
import type { OpsCheck, OpsCheckStatus, OpsHealthReport } from '@/lib/server/ops-health'

const STATUS_META: Record<
  OpsCheckStatus,
  { label: string; icon: typeof CheckCircle2; className: string; badge: string }
> = {
  ok: {
    label: 'OK',
    icon: CheckCircle2,
    className: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  },
  warn: {
    label: 'Uyarı',
    icon: AlertTriangle,
    className: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-950 border-amber-200',
  },
  error: {
    label: 'Hata',
    icon: XCircle,
    className: 'text-red-700',
    badge: 'bg-red-100 text-red-950 border-red-200',
  },
  unknown: {
    label: '—',
    icon: HelpCircle,
    className: 'text-gray-600',
    badge: 'bg-gray-100 text-gray-800 border-gray-200',
  },
}

function OverallBanner({ overall }: { overall: OpsCheckStatus }) {
  const m = STATUS_META[overall]
  const Icon = m.icon
  const titles: Record<OpsCheckStatus, string> = {
    ok: 'Sistem genel olarak sağlıklı',
    warn: 'Dikkat gerektiren uyarılar var',
    error: 'Kritik sorunlar tespit edildi',
    unknown: 'Durum belirlenemedi',
  }
  return (
    <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${m.badge}`}>
      <Icon className={`w-6 h-6 shrink-0 mt-0.5 ${m.className}`} />
      <div>
        <div className="font-semibold text-lg">{titles[overall]}</div>
        <p className="text-sm opacity-90 mt-0.5">
          Ortam değişkenleri, veritabanı, yedekleme, güvenlik tabloları ve modül şemaları kontrol edilir.
        </p>
      </div>
    </div>
  )
}

function CheckRow({ check }: { check: OpsCheck }) {
  const m = STATUS_META[check.status]
  const Icon = m.icon
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${m.className}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900 text-sm">{check.label}</span>
          <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${m.badge}`}>
            {m.label}
          </span>
        </div>
        {check.detail ? <p className="text-sm text-gray-600 mt-0.5">{check.detail}</p> : null}
        {check.hint ? <p className="text-xs text-amber-800 mt-1">{check.hint}</p> : null}
      </div>
    </div>
  )
}

export default function AdminOpsHealthPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<OpsHealthReport | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/admin/ops-health', { credentials: 'include', cache: 'no-store' })
      const data = (await resp.json().catch(() => ({}))) as OpsHealthReport & { success?: boolean; error?: string }
      if (!resp.ok || !data.success) {
        toast(data.error || 'Sağlık raporu alınamadı', 'error')
        return
      }
      setReport(data)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Bağlantı hatası', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      router.replace('/admin')
      return
    }
    if (user?.role === 'super_admin') load()
  }, [user, router, load])

  const grouped = useMemo(() => {
    if (!report?.checks) return []
    const map = new Map<string, OpsCheck[]>()
    report.checks.forEach((c) => {
      const list = map.get(c.group) || []
      list.push(c)
      map.set(c.group, list)
    })
    return Array.from(map.entries())
  }, [report])

  if (user && user.role !== 'super_admin') {
    return null
  }

  return (
    <div className="space-y-6">
      <ToastContainer />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-7 h-7 text-violet-600" />
            Sistem Sağlığı
          </h1>
          <p className="text-gray-500 mt-1 text-sm max-w-2xl">
            Süper admin operasyon paneli — modüller, ara katmanlar (OTP, oturum, rate limit), veritabanı ve yedekleme
            durumu. Gizli anahtar değerleri gösterilmez.
          </p>
        </div>
        <Button onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
          Yenile
        </Button>
      </div>

      {report ? (
        <>
          <OverallBanner overall={report.overall} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(
              [
                ['ok', 'Sağlıklı', report.summary.ok],
                ['warn', 'Uyarı', report.summary.warn],
                ['error', 'Hata', report.summary.error],
                ['unknown', 'Belirsiz', report.summary.unknown],
              ] as const
            ).map(([key, label, n]) => {
              const m = STATUS_META[key]
              return (
                <div key={key} className={`rounded-xl border px-4 py-3 ${m.badge}`}>
                  <div className="text-2xl font-bold">{n}</div>
                  <div className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</div>
                </div>
              )
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Dağıtım</CardTitle>
            </CardHeader>
            <CardBody className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="text-gray-500">Ortam:</span>{' '}
                <strong>{report.build.vercel_env || '—'}</strong>
              </p>
              <p>
                <span className="text-gray-500">URL:</span> {report.build.vercel_url || '—'}
              </p>
              <p>
                <span className="text-gray-500">Commit:</span>{' '}
                <code className="text-xs bg-gray-100 px-1 rounded">
                  {(report.build.vercel_git_commit_sha || '—').slice(0, 12)}
                </code>{' '}
                ({report.build.vercel_git_commit_ref || '—'})
              </p>
              <p>
                <span className="text-gray-500">Kontrol:</span>{' '}
                {new Date(report.checked_at).toLocaleString('tr-TR')}
              </p>
            </CardBody>
          </Card>

          {grouped.map(([group, checks]) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle>{group}</CardTitle>
              </CardHeader>
              <CardBody className="pt-0">{checks.map((c) => <CheckRow key={c.id} check={c} />)}</CardBody>
            </Card>
          ))}

          {report.next_steps?.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Önerilen adımlar</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
                  {report.next_steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </>
      ) : loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Rapor yükleniyor…
        </div>
      ) : (
        <p className="text-gray-500 text-sm">Rapor alınamadı. Yenile’ye basın.</p>
      )}
    </div>
  )
}
