import { NextResponse } from 'next/server'

export async function GET() {
  const envUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const envAnon = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

  return NextResponse.json({
    ok: true,
    route: '/api/health/security',
    env: {
      // OTP hardening
      otp_pepper_set: Boolean((process.env.OTP_PEPPER || '').trim()),
      otp_hash_only: process.env.OTP_HASH_ONLY === '1',

      // Supabase env vs fallback
      supabase_url_set: Boolean(envUrl),
      supabase_anon_set: Boolean(envAnon),
      supabase_service_role_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      supabase_fallback_disabled_server: process.env.DISABLE_SUPABASE_FALLBACK === '1',
      supabase_fallback_disabled_client: process.env.NEXT_PUBLIC_DISABLE_SUPABASE_FALLBACK === '1',
    },
    next_steps: [
      'Vercel Production env: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY girin',
      'Vercel Production env: DISABLE_SUPABASE_FALLBACK=1 ve NEXT_PUBLIC_DISABLE_SUPABASE_FALLBACK=1 (env’ler doğruysa)',
      'OTP_PEPPER girin (hash doğrulama için)',
      'OTP_HASH_ONLY=1 (test sonrası, plaintext code alanını null’lamak için)',
    ],
  })
}

