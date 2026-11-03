'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardBody, Button, toast } from '@/components/ui'
import { t } from '@/lib/i18n'
import { isEmployeeResultsVisibleSetting, EMPLOYEE_RESULTS_SETTING_KEY } from '@/lib/employee-result-visibility'
import { Eye, Loader2 } from 'lucide-react'

type Lang = 'tr' | 'en' | 'fr'

/**
 * Kurum kademesi: çalışanlar kendi sonuçlarını görebilsin mi?
 * Varsayılan KAPALI (ayar yoksa kapalı). Kaydetme mevcut kurum güncelleme
 * ucuyla; settings sunucuda birleştirilir. Kapatmak onay kayıtlarını silmez.
 * Asıl kontrol sunucuda her istekte yapılır; bu kart yalnız ayarı yazar.
 */
export function OrgEmployeeResultsCard({ orgId, lang }: { orgId: string; lang: Lang }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const resp = await fetch(`/api/admin/matrix-data?org_id=${encodeURIComponent(orgId)}`, { cache: 'no-store' })
      const payload = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string; org_settings?: unknown }
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || t('tcLoadFailed', lang))
      const v = isEmployeeResultsVisibleSetting(payload.org_settings)
      setEnabled(v)
      setSaved(v)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('tcLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }, [orgId, lang])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const resp = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orgId, settings: { [EMPLOYEE_RESULTS_SETTING_KEY]: enabled } }),
      })
      const api = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!resp.ok || !api?.success) throw new Error(api?.error || t('saveError', lang))
      toast(t('saved', lang), 'success')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : t('saveError', lang), 'error')
    } finally {
      setSaving(false)
    }
  }, [orgId, enabled, lang, load])

  return (
    <Card className="mb-6">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
            <Eye className="w-5 h-5 text-[var(--brand)]" />
            {t('employeeResultsCardTitle', lang)}
          </div>
          <Button onClick={() => void save()} disabled={loading || saving || enabled === saved}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('save', lang)}
          </Button>
        </div>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" />
        ) : (
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input type="checkbox" checked={enabled} disabled={saving} onChange={(e) => setEnabled(e.target.checked)} />
            {t('employeeResultsToggle', lang)}
          </label>
        )}
        <p className="text-xs text-[var(--muted)]">{t('employeeResultsHint', lang)}</p>
      </CardBody>
    </Card>
  )
}
