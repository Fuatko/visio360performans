'use client'

import { Card, CardBody, CardHeader, CardTitle, toast, ToastContainer, Button } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { Loader2, RefreshCw, Upload } from 'lucide-react'
import { useAdminContextStore } from '@/store/admin-context'

export default function AdminSettingsPage() {

  const lang = useLang()
  const { user } = useAuthStore()
  const { organizationId } = useAdminContextStore()
  const [loading, setLoading] = useState(false)
  const [brandLogo, setBrandLogo] = useState<string>('') // organizations.logo_base64
  const [savingLogo, setSavingLogo] = useState(false)
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securityEnv, setSecurityEnv] = useState<any>(null)

  useEffect(() => {
    const run = async () => {
      if (!organizationId) {
        setBrandLogo('')
        return
      }
      // Some DB schemas only have `logo_base64` (no `logo_url`). Selecting a missing column causes PostgREST 400.
      const { data, error } = await supabase.from('organizations').select('logo_base64').eq('id', organizationId).maybeSingle()
      if (error) return
      const logo = (data as any)?.logo_base64 || ''
      setBrandLogo(typeof logo === 'string' ? logo : '')
    }
    run()
  }, [organizationId])

  const loadSecurityStatus = async () => {
    setSecurityLoading(true)
    try {
      const resp = await fetch('/api/health/security')
      const data = await resp.json().catch(() => ({}))
      setSecurityEnv(data)
    } catch (e: any) {
      setSecurityEnv({ ok: false, error: e?.message || 'unknown' })
    } finally {
      setSecurityLoading(false)
    }
  }

  const testConnection = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.from('organizations').select('id').limit(1)
      if (error) throw error
      toast(t('connectionSuccess', lang), 'success')
    } catch (e: any) {
      toast(e?.message || t('connectionError', lang), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleLogoFile = (file?: File | null) => {
    if (!file) return
    if (file.size > 500_000) {
      toast(t('logoTooLarge', lang), 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      setBrandLogo(value)
    }
    reader.readAsDataURL(file)
  }

  const saveBrandLogo = async () => {
    if (!organizationId) {
      toast('Önce üst bardan kurum seçin', 'error')
      return
    }
    setSavingLogo(true)
    try {
      const resp = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: organizationId, logo_base64: brandLogo || null }),
      })
      if (!resp.ok) {
        const api = await resp.json().catch(() => ({}))
        if (resp.status === 401 || resp.status === 403) {
          toast('Güvenlik oturumu bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.', 'warning')
        } else if ((api as any)?.error) {
          toast(String((api as any).error), 'error')
        }
        // Fallback
        const { error } = await supabase.from('organizations').update({ logo_base64: brandLogo || null }).eq('id', organizationId)
        if (error) throw error
      }
      toast(t('logoSaved', lang), 'success')
    } catch (e: any) {
      toast(e?.message || t('logoSaveFailed', lang), 'error')
    } finally {
      setSavingLogo(false)
    }
  }

  return (
    <div className="space-y-6">
      <ToastContainer />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">⚙️ {t('settings', lang)}</h1>
        <p className="text-gray-500 mt-1">{t('systemSettingsSubtitle', lang)}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>🔗 {t('supabaseConnectionTest', lang)}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-gray-600">
            {t('currentSession', lang)}: <span className="font-medium">{user?.email || '-'}</span>
          </p>
          <Button onClick={testConnection} disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {t('testConnectionBtn', lang)}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🛡️ {t('securityStatusKvkk', lang)}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-gray-600">
            {t('securityStatusHint', lang)}
          </p>
          <Button onClick={loadSecurityStatus} disabled={securityLoading}>
            {securityLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {t('refreshStatus', lang)}
          </Button>

          {securityEnv && (
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-2">
              <div className="text-xs text-gray-500">API: /api/health/security</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span>OTP_PEPPER</span>
                  <span className={securityEnv?.env?.otp_pepper_set ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                    {securityEnv?.env?.otp_pepper_set ? 'OK' : t('missing', lang)}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span>AUDIT_PEPPER</span>
                  <span className={securityEnv?.env?.audit_pepper_set ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    {securityEnv?.env?.audit_pepper_set ? 'OK' : t('recommended', lang)}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span>OTP_HASH_ONLY</span>
                  <span className={securityEnv?.env?.otp_hash_only ? 'text-emerald-700 font-semibold' : 'text-gray-700 font-semibold'}>
                    {securityEnv?.env?.otp_hash_only ? t('enabled', lang) : t('disabled', lang)}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span>SUPABASE_URL</span>
                  <span className={securityEnv?.env?.supabase_url_set ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                    {securityEnv?.env?.supabase_url_set ? 'OK' : t('missing', lang)}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span>NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
                  <span className={securityEnv?.env?.supabase_anon_set ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                    {securityEnv?.env?.supabase_anon_set ? 'OK' : t('missing', lang)}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span>SUPABASE_SERVICE_ROLE_KEY</span>
                  <span className={securityEnv?.env?.supabase_service_role_set ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                    {securityEnv?.env?.supabase_service_role_set ? 'OK' : t('missing', lang)}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span>Fallback (Server)</span>
                  <span className={securityEnv?.env?.supabase_fallback_disabled_server ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    {securityEnv?.env?.supabase_fallback_disabled_server ? t('disabled', lang) : t('enabled', lang)}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span>Fallback (Client)</span>
                  <span className={securityEnv?.env?.supabase_fallback_disabled_client ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    {securityEnv?.env?.supabase_fallback_disabled_client ? t('disabled', lang) : t('enabled', lang)}
                  </span>
                </div>
              </div>

              {Array.isArray(securityEnv?.next_steps) && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-gray-500 mb-1">{t('recommendedSteps', lang)}</div>
                  <ul className="list-disc pl-5 text-xs text-gray-600 space-y-1">
                    {securityEnv.next_steps.map((s: string, idx: number) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🖼️ {t('brandLogoTitle', lang)}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-gray-600">
            {t('brandLogoHint', lang)}
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-20 h-20 rounded-2xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden">
              {brandLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brandLogo} alt="Logo" className="w-full h-full object-contain bg-white" />
              ) : (
                <span className="text-xs text-gray-400">{t('noLogo', lang)}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="px-3 py-2 rounded-lg bg-gray-100 text-sm text-gray-700 cursor-pointer hover:bg-gray-200 inline-flex items-center gap-2">
                <Upload className="w-4 h-4" />
                {t('chooseLogo', lang)}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleLogoFile(e.target.files?.[0] || null)}
                />
              </label>
              <Button variant="secondary" onClick={() => setBrandLogo('')} disabled={!brandLogo}>
                {t('remove', lang)}
              </Button>
              <Button onClick={saveBrandLogo} disabled={savingLogo || !organizationId}>
                {savingLogo ? <Loader2 className="w-5 h-5 animate-spin" /> : t('saveBtn', lang)}
              </Button>
            </div>
            <div className="text-xs text-gray-400">PNG/JPG – max 500KB</div>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

