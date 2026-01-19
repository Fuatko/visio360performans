import { NextResponse } from 'next/server'

export async function GET() {
  const envUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const envAnon = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  const otpPepper = (process.env.OTP_PEPPER || '').trim()
  const auditPepper = (process.env.AUDIT_PEPPER || '').trim()
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

  const nextSteps: string[] = []
  if (!envUrl) nextSteps.push('Vercel Production env: SUPABASE_URL (server) ve NEXT_PUBLIC_SUPABASE_URL (client) girin')
  if (!envAnon) nextSteps.push('Vercel Production env: NEXT_PUBLIC_SUPABASE_ANON_KEY girin')
  if (!serviceRole) nextSteps.push('Vercel Production env: SUPABASE_SERVICE_ROLE_KEY girin (OTP RLS için zorunlu)')
  if (!otpPepper) nextSteps.push('OTP_PEPPER girin (hash doğrulama için)')
  if (!auditPepper) nextSteps.push('AUDIT_PEPPER girin (ops loglarda email_hash üretmek için; OTP_PEPPER ile aynı da olabilir)')
  if (process.env.OTP_HASH_ONLY !== '1') nextSteps.push('OTP_HASH_ONLY=1 (hash-only OTP için önerilir)')

  return NextResponse.json({
    ok: true,
    route: '/api/health/security',
    env: {
      // OTP hardening
      otp_pepper_set: Boolean(otpPepper),
      audit_pepper_set: Boolean(auditPepper),
      otp_hash_only: process.env.OTP_HASH_ONLY === '1',

      // Supabase env vs fallback
      supabase_url_set: Boolean(envUrl),
      supabase_anon_set: Boolean(envAnon),
      supabase_service_role_set: Boolean(serviceRole),
      supabase_fallback_disabled_server: process.env.DISABLE_SUPABASE_FALLBACK === '1',
      supabase_fallback_disabled_client: process.env.NEXT_PUBLIC_DISABLE_SUPABASE_FALLBACK === '1',
    },
    next_steps:
      nextSteps.length > 0
        ? nextSteps
        : ['Her şey OK ✅ (Fallback anahtarları artık repoda yok; sadece env ile çalışıyoruz)'],
  })
}

