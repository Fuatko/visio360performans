'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Award, BookOpen, ChevronDown, ChevronRight, GraduationCap, Loader2, RefreshCw, Search, Users } from 'lucide-react'
import { Badge, Button, Card, CardBody, Input, toast } from '@/components/ui'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { AssignTrainingButton } from '@/components/admin/inspirasuite-assign-training'

interface Row {
  id: string
  name: string
  email: string
  department: string | null
  title: string | null
  assigned: number
  avgProgress: number
  completed: number
  inProgress: number
  notStarted: number
  lastSync: string | null
}
interface Totals {
  people: number
  peopleWithTraining: number
  totalAssigned: number
  completed: number
}

type Tab = 'users' | 'catalog' | 'overview'

export default function EgitimMerkeziPage() {
  const { organizationId } = useAdminContextStore()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('users')
  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!organizationId) {
      setRows([])
      setTotals(null)
      return
    }
    setLoading(true)
    try {
      const resp = await fetch(`/api/admin/training-center?org_id=${encodeURIComponent(organizationId)}`, { cache: 'no-store' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.success) throw new Error(data.error || 'Liste alınamadı')
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setTotals(data.totals || null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Liste alınamadı', 'error')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    load()
  }, [load])

  const sync = async () => {
    if (!organizationId) return
    setSyncing(true)
    try {
      const resp = await fetch(`/api/admin/training-center?org_id=${encodeURIComponent(organizationId)}`, { method: 'POST' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.success) throw new Error(data.error || 'Senkron başarısız')
      toast(`İlerleme güncellendi (${data.updated} kayıt)`, 'success')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Senkron başarısız', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))).sort() as string[],
    [rows]
  )
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (dept && (r.department || '') !== dept) return false
      if (q.trim()) {
        const hay = `${r.name} ${r.email} ${r.department || ''}`.toLowerCase()
        if (!hay.includes(q.trim().toLowerCase())) return false
      }
      return true
    })
  }, [rows, q, dept])

  const tabBtn = (id: Tab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTab(id)}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
        tab === id ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)]'
      }`}
    >
      {icon} {label}
    </button>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-[var(--brand-soft)] p-2 text-[var(--brand)]">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--foreground)]">Eğitim Merkezi</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Atamalar, ilerleme takibi ve eğitim kataloğu tek yerde.</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {tabBtn('users', 'Kullanıcılar / Atamalar', <Users className="h-4 w-4" />)}
        {tabBtn('catalog', 'Eğitim Kataloğu', <BookOpen className="h-4 w-4" />)}
        {tabBtn('overview', 'Genel Bakış', <Award className="h-4 w-4" />)}
      </div>

      {!organizationId ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-[var(--muted)]">
            {user?.role === 'super_admin'
              ? 'Lütfen üst menüden bir kurum seçin.'
              : 'Kurum bilgisi bulunamadı.'}
          </CardBody>
        </Card>
      ) : tab === 'users' ? (
        <>
          {/* Özet + araç çubuğu */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <Input placeholder="Kişi ara…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)]"
            >
              <option value="">Tüm departmanlar</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} İlerlemeyi Yenile
            </Button>
          </div>

          {totals ? (
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              <Badge variant="default">{totals.people} kişi</Badge>
              <Badge variant="info">{totals.peopleWithTraining} kişide eğitim</Badge>
              <Badge variant="default">{totals.totalAssigned} atama</Badge>
              <Badge variant="success">{totals.completed} tamamlandı</Badge>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardBody className="py-10 text-center text-sm text-[var(--muted)]">Kayıt bulunamadı.</CardBody>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-2)] text-left text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Kişi</th>
                    <th className="px-4 py-2.5 font-medium">Departman</th>
                    <th className="px-4 py-2.5 font-medium">Atanan</th>
                    <th className="px-4 py-2.5 font-medium">İlerleme</th>
                    <th className="px-4 py-2.5 font-medium">Durum</th>
                    <th className="px-4 py-2.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const open = expanded === r.id
                    return (
                      <Fragment key={r.id}>
                        <tr
                          className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface-2)]"
                          onClick={() => setExpanded(open ? null : r.id)}
                        >
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-[var(--foreground)]">{r.name}</div>
                            <div className="text-xs text-[var(--muted)]">{r.email}</div>
                          </td>
                          <td className="px-4 py-2.5 text-[var(--muted)]">{r.department || '—'}</td>
                          <td className="px-4 py-2.5 text-[var(--foreground)]">{r.assigned}</td>
                          <td className="px-4 py-2.5">
                            {r.assigned > 0 ? (
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--surface-2)]">
                                  <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${r.avgProgress}%` }} />
                                </div>
                                <span className="tabular-nums text-xs text-[var(--muted)]">{r.avgProgress}%</span>
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {r.assigned > 0 ? (
                              <span className="text-xs text-[var(--muted)]">
                                <span className="text-emerald-600">{r.completed}✓</span> · {r.inProgress} devam · {r.notStarted} başlamadı
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--muted)]">Atama yok</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[var(--muted)]">
                            {open ? <ChevronDown className="inline h-4 w-4" /> : <ChevronRight className="inline h-4 w-4" />}
                          </td>
                        </tr>
                        {open ? (
                          <tr className="border-t border-[var(--border)] bg-[var(--surface-2)]/40">
                            <td colSpan={6} className="px-4 py-4">
                              <AssignTrainingButton personId={r.id} personName={r.name} assignedBy={user?.name || 'Visio360PDS'} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === 'catalog' ? (
        <Card>
          <CardBody className="py-8 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-[var(--brand)]" />
            <p className="mb-4 text-sm text-[var(--muted)]">Kurum içi eğitim kataloğu ayrı sayfada yönetiliyor.</p>
            <Link href="/admin/training-catalog">
              <Button>Eğitim Kataloğunu Aç</Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Toplam kişi', value: totals?.people ?? 0 },
            { label: 'Eğitim atanan', value: totals?.peopleWithTraining ?? 0 },
            { label: 'Toplam atama', value: totals?.totalAssigned ?? 0 },
            { label: 'Tamamlanan', value: totals?.completed ?? 0 },
          ].map((c) => (
            <Card key={c.label}>
              <CardBody className="py-6 text-center">
                <div className="text-2xl font-bold text-[var(--brand)]">{c.value}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">{c.label}</div>
              </CardBody>
            </Card>
          ))}
          <p className="col-span-full mt-2 text-xs text-[var(--muted)]">
            Departman bazında tamamlanma oranı ve yetkinlik açığı analizleri sonraki aşamada eklenecek.
          </p>
        </div>
      )}
    </div>
  )
}
