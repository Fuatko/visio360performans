'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Award, Loader2, Search, User } from 'lucide-react'
import { useLang } from '@/components/i18n/language-context'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { t } from '@/lib/i18n'
import { Card, CardBody, CardHeader, CardTitle, Button, Select, toast } from '@/components/ui'
import {
  PersonReportCardPanel,
  type PersonReportCardData,
} from '@/components/admin/person-report-card-panel'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'

export default function KarsiKarnePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      }
    >
      <KarsiKarnePageContent />
    </Suspense>
  )
}

function KarsiKarnePageContent() {
  const lang = useLang()
  const { organizationId } = useAdminContextStore()
  const { user } = useAuthStore()
  const searchParams = useSearchParams()

  const [users, setUsers] = useState<Array<{ id: string; name: string; department?: string | null }>>([])
  const [selectedPerson, setSelectedPerson] = useState('')
  const [personQuery, setPersonQuery] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingCard, setLoadingCard] = useState(false)
  const [card, setCard] = useState<PersonReportCardData | null>(null)

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

  const loadCard = async (personId?: string) => {
    const pid = String(personId || selectedPerson || '').trim()
    if (!pid || !orgToUse) {
      toast(t('karsiKarneSelectPerson', lang), 'error')
      return
    }
    setLoadingCard(true)
    try {
      const qs = new URLSearchParams({ org_id: orgToUse, person_id: pid })
      const resp = await fetch(`/api/admin/person-report-card?${qs.toString()}`)
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('karsiKarneLoadError', lang))
      setCard(payload as PersonReportCardData)
      window.setTimeout(() => {
        document.getElementById('karsi-karne-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    } catch (e: any) {
      toast(String(e?.message || t('karsiKarneLoadError', lang)), 'error')
    } finally {
      setLoadingCard(false)
    }
  }

  useEffect(() => {
    const pid = String(searchParams.get('person_id') || '').trim()
    if (pid && orgToUse && users.some((u) => u.id === pid)) {
      void loadCard(pid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, orgToUse, users.length])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
          <Award className="w-7 h-7 text-[var(--brand)]" />
          {t('karsiKarneMenu', lang)}
        </h1>
        <ReportPurposeNote purposeKey="reportPurpose_karsiKarne" />
      </div>

      {!orgToUse ? (
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  {lang === 'en' ? 'Search by name or department' : lang === 'fr' ? 'Rechercher' : 'İsim veya birim ara'}
                </label>
                <input
                  type="search"
                  value={personQuery}
                  onChange={(e) => setPersonQuery(e.target.value)}
                  placeholder={lang === 'en' ? 'Type to filter…' : 'Filtrelemek için yazın…'}
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
            </div>
            <Button
              onClick={() => void loadCard()}
              disabled={!selectedPerson || loadingCard || loadingUsers}
              className="w-full sm:w-auto"
            >
              {loadingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {t('karsiKarneShowButton', lang)}
            </Button>
          </CardBody>
        </Card>
      )}

      {card ? (
        <div id="karsi-karne-result">
          <PersonReportCardPanel data={card} embedded onClose={() => setCard(null)} />
        </div>
      ) : null}
    </div>
  )
}
