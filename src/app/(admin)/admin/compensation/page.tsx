'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { useAdminContextStore } from '@/store/admin-context'
import { Card, CardBody, CardHeader, CardTitle, Select, Input, Button, Badge, toast } from '@/components/ui'
import { isCompensationEnabled } from '@/lib/feature-flags'
import { BadgePercent, Loader2, Wand2 } from 'lucide-react'

type Scope = 'org' | 'department' | 'manager'
type PeriodOption = { id: string; name: string }

type Row = {
  targetId: string
  targetName: string
  targetDept: string
  overallAvg: number
  evaluatorCount: number
  recommendedPct: number
  rationale: string
  actionPlan: string[]
}

export const dynamic = 'force-dynamic'

export default function AdminCompensationPage() {
  const lang = useLang()
  const { organizationId } = useAdminContextStore()

  const enabled = isCompensationEnabled()

  const [periods, setPeriods] = useState<PeriodOption[]>([])
  const [periodId, setPeriodId] = useState('')
  const [scope, setScope] = useState<Scope>('org')
  const [minPct, setMinPct] = useState<number>(20)
  const [maxPct, setMaxPct] = useState<number>(30)

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Row[]>([])

  const scopeOptions = useMemo(
    () => [
      { value: 'org', label: t('poolOrg', lang) },
      { value: 'department', label: t('poolDept', lang) },
      { value: 'manager', label: t('poolManager', lang) },
    ],
    [lang]
  )

  const loadPeriods = useCallback(async (orgId: string) => {
    setLoading(true)
    try {
      const resp = await fetch(`/api/admin/matrix-data?org_id=${encodeURIComponent(orgId)}`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        if (resp.status === 401 || resp.status === 403) toast(t('sessionMissingReLogin', lang), 'warning')
        throw new Error(payload?.error || t('dataLoadFailed', lang))
      }
      const ps = (payload.periods || []) as any[]
      const mapped = ps.map((p) => ({ id: String(p.id), name: String(p.name || '') })).filter((p) => p.id && p.name)
      setPeriods(mapped)
      // Auto-select first period if not selected
      if (!periodId && mapped.length) setPeriodId(mapped[0].id)
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (e?.name === 'AbortError' || msg.toLowerCase().includes('aborted')) return
      toast(msg || t('dataLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [lang, periodId])

  useEffect(() => {
    if (!enabled) return
    if (!organizationId) {
      setPeriods([])
      setRows([])
      return
    }
    loadPeriods(organizationId)
  }, [enabled, organizationId, loadPeriods])

  const generate = async () => {
    if (!enabled) return
    if (!organizationId) return
    if (!periodId) {
      toast(t('selectPeriodPlaceholder', lang), 'warning')
      return
    }
    if (maxPct < minPct) {
      toast(t('requiredFields', lang), 'error')
      return
    }
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        org_id: String(organizationId || ''),
        period_id: String(periodId || ''),
        scope,
        min: String(minPct),
        max: String(maxPct),
        lang,
      })
      const resp = await fetch(`/api/admin/compensation/recommendations?${qs.toString()}`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        if (resp.status === 401 || resp.status === 403) toast(t('sessionMissingReLogin', lang), 'warning')
        throw new Error(payload?.error || t('dataLoadFailed', lang))
      }
      setRows((payload.rows || []) as Row[])
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (e?.name === 'AbortError' || msg.toLowerCase().includes('aborted')) return
      toast(msg || t('dataLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!enabled) {
    return (
      <Card>
        <CardBody className="py-12 text-center text-gray-500">
          <BadgePercent className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <div className="font-semibold text-gray-800 mb-1">{t('compensation', lang)}</div>
          <div>{t('featureDisabled', lang)}</div>
        </CardBody>
      </Card>
    )
  }

  return (
    <RequireSelection
      enabled={!organizationId}
      title={t('kvkkSecurityTitle', lang)}
      message={t('kvkkSelectOrgToContinue', lang)}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💸 {t('compensation', lang)}</h1>
          <p className="text-gray-500 mt-1">{t('compensationSubtitle', lang)}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-[var(--brand)]" />
              {t('filters', lang)}
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-end">
              <div className="xl:col-span-2">
                <Select
                  options={periods.map((p) => ({ value: p.id, label: p.name }))}
                  value={periodId}
                  onChange={(e) => setPeriodId(e.target.value)}
                  placeholder={t('selectPeriodPlaceholder', lang)}
                />
              </div>
              <div>
                <Select
                  options={scopeOptions}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as Scope)}
                  placeholder={t('poolScopeLabel', lang)}
                />
              </div>
              <div>
                <Input
                  label={t('raiseMinLabel', lang)}
                  type="number"
                  value={String(minPct)}
                  onChange={(e) => setMinPct(Number(e.target.value || 0))}
                />
              </div>
              <div>
                <Input
                  label={t('raiseMaxLabel', lang)}
                  type="number"
                  value={String(maxPct)}
                  onChange={(e) => setMaxPct(Number(e.target.value || 0))}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={generate} disabled={loading || !periodId}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <BadgePercent className="w-5 h-5" />}
                {t('generateRecommendations', lang)}
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>📊 {t('recommendations', lang)}</span>
              <Badge variant="info">{rows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-gray-500">{t('noDataRow', lang)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">{t('employee', lang)}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">{t('departmentLabel', lang)}</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">{t('averageScore', lang)}</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">{t('evaluatorsShort', lang)}</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">{t('recommendedRaise', lang)}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">{t('rationale', lang)}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">{t('actionPlanShort', lang)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r) => (
                      <tr key={r.targetId} className="hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900">{r.targetName}</div>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{r.targetDept}</td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant="gray">{r.overallAvg.toFixed(1)}</Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant="info">{r.evaluatorCount}</Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Badge variant="success">%{r.recommendedPct.toFixed(1)}</Badge>
                        </td>
                        <td className="py-3 px-4 text-gray-700">{r.rationale}</td>
                        <td className="py-3 px-4">
                          <ul className="list-disc pl-5 text-gray-700 space-y-1">
                            {(r.actionPlan || []).slice(0, 3).map((x, idx) => (
                              <li key={idx}>{x}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </RequireSelection>
  )
}

