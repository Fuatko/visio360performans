'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardBody, toast, ToastContainer } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { maskEmail } from '@/lib/utils'
import { Mail, KeyRound, Loader2, ArrowRight, ArrowLeft } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { setUser } = useAuthStore()
  
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState('')

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const normalizedEmail = email.toLowerCase().trim()

    if (!normalizedEmail) {
      toast('Email adresi girin', 'error')
      return
    }

    setLoading(true)

    try {
      // Check if user exists
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalizedEmail)
        .eq('status', 'active')
        .single()

      if (userError || !user) {
        toast('Bu email adresi kayıtlı değil', 'error')
        setLoading(false)
        return
      }

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
      }
      if (!resp.ok || payload.success === false || payload.error) {
        const msg = payload.error || 'Doğrulama kodu gönderilemedi'
        toast(msg, 'error')
        setLoading(false)
        return
      }

      setMaskedEmail(maskEmail(normalizedEmail))
      setStep('otp')

      if (payload && payload.warning) {
        toast(payload.detail ? `${payload.warning} (${payload.detail})` : payload.warning, 'warning')
      } else {
        if (payload && payload.message_id) {
          console.log('Resend message_id:', payload.message_id)
        }
        toast('Doğrulama kodu gönderildi', 'success')
      }
    } catch (error) {
      console.error('OTP Error:', error)
      toast('Bir hata oluştu', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (otp.length !== 6) {
      toast('6 haneli kodu girin', 'error')
      return
    }

    setLoading(true)

    try {
      // Verify OTP
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
        toast('Geçersiz veya süresi dolmuş kod', 'error')
        setLoading(false)
        return
      }

      // Mark OTP as used
      await supabase
        .from('otp_codes')
        .update({ used: true })
        .eq('id', otpData.id)

      // Get user
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*, organizations(*)')
        .eq('email', email.toLowerCase().trim())
        .single()

      if (userError || !user) {
        toast('Kullanıcı bulunamadı', 'error')
        setLoading(false)
        return
      }

      // Set user in store
      setUser(user)
      toast('Giriş başarılı!', 'success')

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
      toast('Doğrulama hatası', 'error')
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
            {process.env.NEXT_PUBLIC_BRAND_LOGO_URL ? (
              <img
                src={process.env.NEXT_PUBLIC_BRAND_LOGO_URL}
                alt="VISIO 360°"
                className="w-full h-full object-contain bg-white rounded-2xl"
              />
            ) : (
              <span className="text-2xl font-bold text-white">V</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">VISIO 360°</h1>
          <p className="text-slate-600 mt-1">Performans Değerlendirme Sistemi</p>
        </div>

        {/* Login Card */}
        <Card className="bg-[var(--surface)]">
          <CardBody className="p-8">
            {step === 'email' ? (
              <form onSubmit={handleSendOTP}>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Hoş Geldiniz</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Email adresinize doğrulama kodu göndereceğiz
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
                      Kod Gönder
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
                  Geri
                </button>

                <h2 className="text-xl font-semibold text-gray-900 mb-2">Doğrulama Kodu</h2>
                <p className="text-gray-500 text-sm mb-6">
                  <span className="font-medium text-blue-600">{maskedEmail}</span> adresine gönderilen 6 haneli kodu girin
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
                    Kod 5 dakika içinde geçerliliğini yitirir
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
                      Giriş Yap
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
                  Kodu tekrar gönder
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
