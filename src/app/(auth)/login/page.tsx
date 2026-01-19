'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardBody, Select, toast, ToastContainer } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { maskEmail } from '@/lib/utils'
import { Mail, KeyRound, Loader2, ArrowRight, ArrowLeft } from 'lucide-react'
import { Lang, t } from '@/lib/i18n'

function detectBrowserLang(): Lang {
  try {
    const navLang = (typeof navigator !== 'undefined' ? navigator.language : '') || ''
    const l = navLang.toLowerCase()
    if (l.startsWith('fr')) return 'fr'
    if (l.startsWith('en')) return 'en'
    return 'tr'
  } catch {
    return 'tr'
  }
}

export default function LoginPage() {
  const router = useRouter()
  const { setUser } = useAuthStore()
  
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState('')
  const [headerLogo, setHeaderLogo] = useState<string>(process.env.NEXT_PUBLIC_BRAND_LOGO_URL || '')
  const [lang, setLang] = useState<Lang>('tr')

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('visio360_prelogin_lang')
      if (saved === 'tr' || saved === 'en' || saved === 'fr') {
        setLang(saved)
        return
      }
    } catch {}
    setLang(detectBrowserLang())
  }, [])

  const saveLang = (next: Lang) => {
    setLang(next)
    try {
      window.localStorage.setItem('visio360_prelogin_lang', next)
    } catch {}
  }

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const normalizedEmail = email.toLowerCase().trim()

    if (!normalizedEmail) {
      toast(lang === 'fr' ? 'Saisissez une adresse e-mail' : lang === 'en' ? 'Enter an email address' : 'Email adresi girin', 'error')
      return
    }

    setLoading(true)

    try {
      // Send OTP via server route (preferred)
      const resp = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const payload = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        warning?: string
        provider?: string
        detail?: string
        error?: string
        message_id?: string | null
        logo_src?: string | null
        organization_name?: string | null
        code?: string
        details?: string
        hint?: string
      }
      if (!resp.ok || payload.success === false || payload.error) {
        const msg =
          payload.error ||
          (lang === 'fr' ? 'Le code de vérification n’a pas pu être envoyé' : lang === 'en' ? 'Verification code could not be sent' : 'Doğrulama kodu gönderilemedi')
        const detail = payload.detail || payload.details
        toast(detail ? `${msg} (${detail})` : msg, 'error')
        setLoading(false)
        return
      }

      setMaskedEmail(maskEmail(normalizedEmail))
      setStep('otp')
      if (payload && payload.logo_src) setHeaderLogo(payload.logo_src)

      if (payload && payload.warning) {
        toast(payload.detail ? `${payload.warning} (${payload.detail})` : payload.warning, 'warning')
      } else {
        if (payload && payload.message_id) {
          console.log('Resend message_id:', payload.message_id)
        }
        toast(lang === 'fr' ? 'Code envoyé' : lang === 'en' ? 'Verification code sent' : 'Doğrulama kodu gönderildi', 'success')
      }
    } catch (error) {
      console.error('OTP Error:', error)
      toast(lang === 'fr' ? 'Une erreur est survenue' : lang === 'en' ? 'An error occurred' : 'Bir hata oluştu', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (otp.length !== 6) {
      toast(lang === 'fr' ? 'Saisissez le code à 6 chiffres' : lang === 'en' ? 'Enter the 6-digit code' : '6 haneli kodu girin', 'error')
      return
    }

    setLoading(true)

    try {
      // Verify OTP via server route (preferred; KVKK/RLS friendly) and set httpOnly session cookie.
      let user: any = null
      try {
        const resp = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.toLowerCase().trim(), code: otp }),
        })
        const payload = (await resp.json().catch(() => ({}))) as { success?: boolean; user?: any; error?: string; detail?: string }
        if (resp.ok && payload.success && payload.user) {
          user = payload.user
        } else if (!resp.ok && resp.status === 401) {
          toast(lang === 'fr' ? 'Code invalide ou expiré' : lang === 'en' ? 'Invalid or expired code' : 'Geçersiz veya süresi dolmuş kod', 'error')
          setLoading(false)
          return
        }
      } catch {
        // ignore -> fallback to old client flow below
      }

      if (!user) {
        // Fallback: legacy client-side verification
        const { data: otpData, error: otpError } = await supabase
          .from('otp_codes')
          .select('*')
          .eq('email', email.toLowerCase().trim())
          .eq('code', otp)
          .eq('used', false)
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (otpError || !otpData) {
          toast(
            lang === 'fr' ? 'Code invalide ou expiré' : lang === 'en' ? 'Invalid or expired code' : 'Geçersiz veya süresi dolmuş kod',
            'error'
          )
          setLoading(false)
          return
        }

        await supabase.from('otp_codes').update({ used: true }).eq('id', otpData.id)

        const { data: u, error: userError } = await supabase
          .from('users')
          .select('*, organizations(*)')
          .ilike('email', email.toLowerCase().trim())
          .single()

        if (userError || !u) {
          toast(lang === 'fr' ? 'Utilisateur introuvable' : lang === 'en' ? 'User not found' : 'Kullanıcı bulunamadı', 'error')
          setLoading(false)
          return
        }
        user = u
      }

      // If user's preferred language is not set, default it from pre-login selection/browser locale.
      if (!(user as any).preferred_language) {
        try {
          await supabase.from('users').update({ preferred_language: lang }).eq('id', (user as any).id)
          ;(user as any).preferred_language = lang
        } catch {
          // ignore
        }
      }

      // Set user in store
      setUser(user)
      toast(lang === 'fr' ? 'Connexion réussie !' : lang === 'en' ? 'Signed in successfully!' : 'Giriş başarılı!', 'success')

      // Redirect based on role
      if (user.role === 'super_admin') {
        router.push('/admin')
      } else if (user.role === 'org_admin') {
        router.push('/admin')
      } else {
        router.push('/dashboard')
      }
    } catch (error) {
      console.error('Verify Error:', error)
      toast(lang === 'fr' ? 'Erreur de vérification' : lang === 'en' ? 'Verification error' : 'Doğrulama hatası', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <ToastContainer />
      
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--brand)] rounded-2xl shadow-lg shadow-black/5 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {headerLogo ? (
              <img
                src={headerLogo}
                alt="VISIO 360°"
                className="w-full h-full object-contain bg-white rounded-2xl"
              />
            ) : (
              <span className="text-2xl font-bold text-white">V</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">VISIO 360°</h1>
          <p className="text-slate-600 mt-1">{t('performanceSystem', lang)}</p>
          <div className="mt-3 flex justify-center">
            <div className="w-44">
              <Select
                options={[
                  { value: 'tr', label: `🇹🇷 ${t('tr', lang)}` },
                  { value: 'fr', label: `🇫🇷 ${t('fr', lang)}` },
                  { value: 'en', label: `🇬🇧 ${t('en', lang)}` },
                ]}
                value={lang}
                onChange={(e) => saveLang(e.target.value as Lang)}
                placeholder={t('language', lang)}
              />
            </div>
          </div>
        </div>

        {/* Login Card */}
        <Card className="bg-[var(--surface)]">
          <CardBody className="p-8">
            {step === 'email' ? (
              <form onSubmit={handleSendOTP}>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('loginWelcomeTitle', lang)}</h2>
                <p className="text-gray-500 text-sm mb-6">
                  {t('loginWelcomeSubtitle', lang)}
                </p>

                <div className="mb-6">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ornek@sirket.com"
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-900 bg-white"
                      disabled={loading}
                      autoComplete="email"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {t('loginSendCode', lang)}
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOTP}>
                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('loginBack', lang)}
                </button>

                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('loginOtpTitle', lang)}</h2>
                <p className="text-gray-500 text-sm mb-6">
                  {lang === 'en' ? (
                    <>
                      {t('loginOtpSubtitle', lang)}{' '}
                      <span className="font-medium text-blue-600">{maskedEmail}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-blue-600">{maskedEmail}</span> {t('loginOtpSubtitle', lang)}
                    </>
                  )}
                </p>

                <div className="mb-6">
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center text-2xl tracking-[0.5em] font-mono"
                      maxLength={6}
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    {t('loginCodeExpires', lang)}
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {t('loginSubmit', lang)}
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={handleSendOTP}
                  className="w-full mt-4 text-sm text-gray-500 hover:text-blue-600"
                  disabled={loading}
                >
                  {t('loginResend', lang)}
                </button>
              </form>
            )}
          </CardBody>
        </Card>

        {/* Footer */}
        <p className="text-center text-slate-500 text-sm mt-6">
          © 2026 MFK Danışmanlık - VISIO 360°
        </p>
      </div>
    </div>
  )
}
