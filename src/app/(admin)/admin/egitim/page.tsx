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
interface Overview {
  byDepartment: { department: string; assigned: number; completed: number; completionRate: number; avgProgress: number }[]
  overdueCount: number
  overdueList: { name: string; course_title: string; due_date: string }[]
}

type Tab = 'users' | 'catalog' | 'overview'

export default function EgitimMerkeziPage() {
  const { organizationId } = useAdminContextStore()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('users')
  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [recos, setRecos] = useState<Record<string, { count: number; competencies: string[] }>>({})
  const [recoTopGaps, setRecoTopGaps] = useState<{ competency: string; count: number }[]>([])
  const [recosLoading, setRecosLoading] = useState(false)
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
      setOverview(data.overview || null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Liste alınamadı', 'error')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  const loadRecos = useCallback(async () => {
    if (!organizationId) {
      setRecos({})
      return
    }
    setRecosLoading(true)
    try {
      const resp = await fetch(`/api/admin/training-center/recommendations?org_id=${encodeURIComponent(organizationId)}`, {
        cache: 'no-store',
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.success) {
        setRecos(data.byUser || {})
        setRecoTopGaps(Array.isArray(data.topGaps) ? data.topGaps : [])
      }
    } catch {
      // önerilen sütunu opsiyonel — sessiz geç
    } finally {
      setRecosLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    load()
    loadRecos()
  }, [load, loadRecos])

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
                    <th className="px-4 py-2.5 font-medium" title="Peer değerlendirme ortalaması 3.5 altındaki yetkinlikler (gelişim açığı)">
                      Önerilen
                    </th>
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
                            {(() => {
                              const rec = recos[r.id]
                              if (rec && rec.count > 0)
                                return (
                                  <span
                                    className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                                    title={rec.competencies.join(', ')}
                                  >
                                    {rec.count} açık
                                  </span>
                                )
                              if (recosLoading && !rec) return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted)]" />
                              return <span className="text-xs text-[var(--muted)]">—</span>
                            })()}
                          </td>
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
                            <td colSpan={7} className="px-4 py-4">
                              <AssignTrainingButton
                                personId={r.id}
                                personName={r.name}
                                assignedBy={user?.name || 'Visio360PDS'}
                                gapOptions={recos[r.id]?.competencies || []}
                                onChanged={() => {
                                  load()
                                  loadRecos()
                                }}
                              />
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
        <div className="space-y-5">
          {/* Özet sayaçlar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Toplam kişi', value: totals?.people ?? 0, color: 'text-[var(--brand)]' },
              { label: 'Eğitim atanan', value: totals?.peopleWithTraining ?? 0, color: 'text-[var(--brand)]' },
              { label: 'Toplam atama', value: totals?.totalAssigned ?? 0, color: 'text-[var(--brand)]' },
              { label: 'Geciken', value: overview?.overdueCount ?? 0, color: (overview?.overdueCount ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600' },
            ].map((c) => (
              <Card key={c.label}>
                <CardBody className="py-6 text-center">
                  <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{c.label}</div>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Departman bazında tamamlanma */}
          <Card>
            <CardBody>
              <div className="mb-3 text-sm font-semibold text-[var(--foreground)]">Departman Bazında Tamamlanma</div>
              {overview && overview.byDepartment.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="py-1.5 font-medium">Departman</th>
                      <th className="py-1.5 font-medium">Atama</th>
                      <th className="py-1.5 font-medium">Tamamlanan</th>
                      <th className="py-1.5 font-medium">Tamamlanma</th>
                      <th className="py-1.5 font-medium">Ort. İlerleme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.byDepartment.map((d) => (
                      <tr key={d.department} className="border-t border-[var(--border)]">
                        <td className="py-2 text-[var(--foreground)]">{d.department}</td>
                        <td className="py-2 text-[var(--muted)]">{d.assigned}</td>
                        <td className="py-2 text-emerald-600">{d.completed}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-16 overflow-hidden rounded-full bg-[var(--surface-2)]">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${d.completionRate}%` }} />
                            </div>
                            <span className="tabular-nums text-xs text-[var(--muted)]">%{d.completionRate}</span>
                          </div>
                        </td>
                        <td className="py-2 tabular-nums text-[var(--muted)]">%{d.avgProgress}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-[var(--muted)]">Henüz atama yok.</div>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            {/* En çok açık yetkinlikler */}
            <Card>
              <CardBody>
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                  En Çok Açık Yetkinlikler
                  {recosLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted)]" /> : null}
                </div>
                <p className="mb-3 text-xs text-[var(--muted)]">
                  Peer değerlendirme ortalaması 3.5 altındaki, henüz eğitim atanmamış yetkinlikler (kaç kişide açık).
                </p>
                {recoTopGaps.length > 0 ? (
                  <div className="space-y-2">
                    {recoTopGaps.map((g) => {
                      const max = recoTopGaps[0].count || 1
                      return (
                        <div key={g.competency} className="flex items-center gap-2">
                          <span className="w-40 truncate text-sm text-[var(--foreground)]" title={g.competency}>
                            {g.competency}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.round((g.count / max) * 100)}%` }} />
                          </div>
                          <span className="w-14 text-right tabular-nums text-xs text-[var(--muted)]">{g.count} kişi</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--muted)]">{recosLoading ? 'Hesaplanıyor…' : 'Açık yetkinlik bulunamadı.'}</div>
                )}
              </CardBody>
            </Card>

            {/* Geciken eğitimler */}
            <Card>
              <CardBody>
                <div className="mb-3 text-sm font-semibold text-[var(--foreground)]">Geciken Eğitimler</div>
                {overview && overview.overdueList.length > 0 ? (
                  <ul className="divide-y divide-[var(--border)]">
                    {overview.overdueList.map((o, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate text-[var(--foreground)]">{o.name}</span>
                          <span className="block truncate text-xs text-[var(--muted)]">{o.course_title}</span>
                        </span>
                        <Badge variant="danger">{o.due_date}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-[var(--muted)]">Geciken eğitim yok.</div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
