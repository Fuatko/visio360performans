'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Award, Loader2, Search, User } from 'lucide-react'
import { useLang } from '@/components/i18n/language-context'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { t } from '@/lib/i18n'
import { assessmentKindLabel, normalizeAssessmentKind } from '@/lib/evaluation-period-kind'
import { Card, CardBody, CardHeader, CardTitle, Button, Select, toast } from '@/components/ui'
import { MatrixKarnePanel } from '@/components/admin/matrix-karne-panel'
import { PdKarnePanel, type PdKarnePayload, type PdKarnePeriodResult } from '@/components/admin/pd-karne-panel'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'
import { ReportsMaintenanceScreen } from '@/components/admin/reports-maintenance'
import { useAdminReportsMaintenanceGate } from '@/lib/admin-reports-maintenance-client'
import {
  ADMIN_RESULTS_PEER_DETAIL_STORAGE_KEY,
  readAdminResultsPeerDetailPreference,
} from '@/lib/admin-results-peer-detail'
import type { MatrixKarnePayload } from '@/lib/server/matrix-karne-build'

export default function KarnePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      }
    >
      <KarnePageContent />
    </Suspense>
  )
}

function hasPdKarneScores(r: PdKarnePeriodResult) {
  return (
    Number(r.overallAvg || 0) > 0 ||
    Number(r.peerAvg || 0) > 0 ||
    Number(r.selfScore || 0) > 0
  )
}

function KarnePageContent() {
  const lang = useLang()
  const { organizationId } = useAdminContextStore()
  const { user } = useAuthStore()
  const searchParams = useSearchParams()
  const isSuperAdmin = user?.role === 'super_admin'
  const { blocked: reportsBlocked, loading: maintenanceLoading } = useAdminReportsMaintenanceGate(isSuperAdmin)

  const [users, setUsers] = useState<Array<{ id: string; name: string; department?: string | null }>>([])
  const [periods, setPeriods] = useState<Array<{ id: string; name: string; assessmentKind?: string }>>([])
  const [selectedPerson, setSelectedPerson] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [personQuery, setPersonQuery] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingKarne, setLoadingKarne] = useState(false)
  const [matrixKarne, setMatrixKarne] = useState<MatrixKarnePayload | null>(null)
  const [pdKarne, setPdKarne] = useState<PdKarnePayload | null>(null)
  const [showPeerDetail, setShowPeerDetail] = useState(false)

  useEffect(() => {
    setShowPeerDetail(readAdminResultsPeerDetailPreference())
  }, [])

  const orgToUse = user?.role === 'org_admin' ? String(user.organization_id || '') : organizationId

  const loadUsers = useCallback(async () => {
    if (!orgToUse) return
    setLoadingUsers(true)
    try {
      const qs = new URLSearchParams({ org_id: orgToUse })
      const resp = await fetch(`/api/admin/matrix-data?${qs.toString()}`)
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Kişi listesi alınamadı')
      setUsers(
        ((payload.users || []) as any[]).map((u) => ({
          id: String(u.id),
          name: String(u.name || ''),
          department: (u as any)?.department ?? null,
        }))
      )
      setPeriods(
        ((payload.periods || []) as any[]).map((p) => ({
          id: String(p.id),
          name: String(p.name || ''),
          assessmentKind: String(p.assessment_kind || p.assessmentKind || ''),
        }))
      )
    } catch (e: any) {
      toast(String(e?.message || 'Kişi listesi alınamadı'), 'error')
    } finally {
      setLoadingUsers(false)
    }
  }, [orgToUse])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    const pid = String(searchParams.get('person_id') || '').trim()
    if (pid) setSelectedPerson(pid)
    const periodId = String(searchParams.get('period_id') || '').trim()
    if (periodId) setSelectedPeriod(periodId)
  }, [searchParams])

  const filteredUsers = useMemo(() => {
    const q = personQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        String(u.department || '')
          .toLowerCase()
          .includes(q)
    )
  }, [users, personQuery])

  const selectedPeriodKind = useMemo(() => {
    if (!selectedPeriod) return null
    const p = periods.find((x) => x.id === selectedPeriod)
    return p ? normalizeAssessmentKind(p.assessmentKind) : null
  }, [periods, selectedPeriod])

  const loadMatrixKarne = async (pid: string) => {
    if (selectedPeriodKind === 'development_360') {
      setMatrixKarne(null)
      return
    }
    const qs = new URLSearchParams({ org_id: orgToUse, person_id: pid, lang })
    if (selectedPeriod) qs.set('period_id', selectedPeriod)
    const resp = await fetch(`/api/admin/matrix-karne?${qs.toString()}`, { credentials: 'include', cache: 'no-store' })
    const payload = (await resp.json().catch(() => ({}))) as MatrixKarnePayload & { success?: boolean; error?: string }
    if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('karneLoadError', lang))
    const { success: _s, error: _e, ...data } = payload
    setMatrixKarne(data as MatrixKarnePayload)
  }

  const loadPdKarne = async (pid: string) => {
    if (selectedPeriodKind === 'job_evaluation') {
      setPdKarne(null)
      return
    }

    const personMeta = users.find((u) => u.id === pid)
    const pdPeriodCandidates = periods.filter((p) => {
      if (normalizeAssessmentKind(p.assessmentKind) !== 'development_360') return false
      if (selectedPeriod && p.id !== selectedPeriod) return false
      return true
    })

    const blocks: PdKarnePeriodResult[] = []
    for (const period of pdPeriodCandidates) {
      const resp = await fetch(`/api/admin/results?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          org_id: orgToUse,
          period_id: period.id,
          person_id: pid,
          include_peer_detail: showPeerDetail,
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        results?: PdKarnePeriodResult[]
      }
      if (!resp.ok || !payload?.success) {
        throw new Error(payload?.error || t('karneLoadError', lang))
      }
      const row = (payload.results || [])[0] as PdKarnePeriodResult | undefined
      if (!row || !hasPdKarneScores(row)) continue
      blocks.push({
        ...row,
        periodId: period.id,
        periodName: period.name,
      })
      if (!selectedPeriod) break
    }

    setPdKarne({
      person: {
        name: personMeta?.name || blocks[0]?.targetName || '—',
        department: personMeta?.department ?? undefined,
      },
      periods: blocks,
    })
  }

  const loadKarne = async (personId?: string) => {
    const pid = String(personId || selectedPerson || '').trim()
    if (!pid || !orgToUse) {
      toast(t('karneSelectPerson', lang), 'error')
      return
    }
    setLoadingKarne(true)
    setMatrixKarne(null)
    setPdKarne(null)
    try {
      await Promise.all([loadMatrixKarne(pid), loadPdKarne(pid)])
      window.setTimeout(() => {
        document.getElementById('karne-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    } catch (e: any) {
      toast(String(e?.message || t('karneLoadError', lang)), 'error')
    } finally {
      setLoadingKarne(false)
    }
  }

  useEffect(() => {
    const pid = String(searchParams.get('person_id') || '').trim()
    if (pid && orgToUse && users.some((u) => u.id === pid)) {
      void loadKarne(pid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, orgToUse, users.length])

  const hasAnyKarne = Boolean(matrixKarne || pdKarne)

  return (
    <div className="w-full max-w-[min(100%,1600px)] mx-auto space-y-6 px-1 sm:px-0">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <Award className="w-7 h-7 text-[var(--brand)]" />
          {t('karneMenu', lang)}
        </h1>
        <ReportPurposeNote purposeKey="reportPurpose_karne" />
        <p className="text-sm text-[var(--muted)] mt-2">{t('karnePageHint', lang)}</p>
      </div>

      {maintenanceLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      ) : reportsBlocked ? (
        <ReportsMaintenanceScreen lang={lang} />
      ) : !orgToUse ? (
        <Card>
          <CardBody className="py-10 text-center text-[var(--muted)]">
            {t('organizationSelectionHint', lang)}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {t('person', lang)}
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  {t('karneSearchLabel', lang)}
                </label>
                <input
                  type="search"
                  value={personQuery}
                  onChange={(e) => setPersonQuery(e.target.value)}
                  placeholder={t('karneSearchPlaceholder', lang)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{t('person', lang)}</label>
                <Select
                  options={filteredUsers.map((u) => ({
                    value: u.id,
                    label: u.department ? `${u.name} (${u.department})` : u.name,
                  }))}
                  value={selectedPerson}
                  onChange={(e) => setSelectedPerson(e.target.value)}
                  placeholder={loadingUsers ? '…' : t('selectPersonPlaceholder', lang)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  {t('period', lang)}
                </label>
                <Select
                  options={[
                    { value: '', label: t('karneAllPeriods', lang) },
                    ...periods.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${assessmentKindLabel(p.assessmentKind, lang)})`,
                    })),
                  ]}
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  placeholder={t('selectPeriodPlaceholder', lang)}
                />
              </div>
            </div>
            <Button
              onClick={() => void loadKarne()}
              disabled={!selectedPerson || loadingKarne || loadingUsers}
              className="w-full sm:w-auto"
            >
              {loadingKarne ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {t('karneShowButton', lang)}
            </Button>
            <label className="inline-flex items-start gap-2.5 cursor-pointer text-sm text-[var(--foreground)] max-w-xl w-full sm:w-auto">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-[var(--border)] w-4 h-4 shrink-0 accent-[var(--brand)]"
                checked={showPeerDetail}
                onChange={(e) => {
                  const checked = e.target.checked
                  setShowPeerDetail(checked)
                  try {
                    localStorage.setItem(ADMIN_RESULTS_PEER_DETAIL_STORAGE_KEY, checked ? '1' : '0')
                  } catch {
                    /* ignore */
                  }
                }}
              />
              <span>
                <span className="font-medium">{t('adminResultsPeerDetailToggleLabel', lang)}</span>
                <span className="block text-xs text-[var(--muted)] mt-1">{t('adminResultsPeerDetailToggleHint', lang)}</span>
              </span>
            </label>
          </CardBody>
        </Card>
      )}

      {hasAnyKarne && !reportsBlocked && !maintenanceLoading ? (
        <div id="karne-result" className="space-y-6">
          {pdKarne ? (
            <PdKarnePanel data={pdKarne} embedded showPeerDetail={showPeerDetail} onClose={() => setPdKarne(null)} />
          ) : null}
          {matrixKarne ? (
            <MatrixKarnePanel
              data={matrixKarne}
              embedded
              onClose={() => setMatrixKarne(null)}
              showPeerDetail={showPeerDetail}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
