import { NextResponse } from 'next/server'
import { rateLimitBackend } from '@/lib/server/rate-limit'

export async function GET() {
  const envUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const envAnon = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  const otpPepper = (process.env.OTP_PEPPER || '').trim()
  const auditPepper = (process.env.AUDIT_PEPPER || '').trim()
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const upstashUrl = (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.STORAGE_REDIS_REST_URL ||
    process.env.STORAGE_URL ||
    process.env.KV_REST_API_URL ||
    process.env.KV_URL ||
    ''
  ).trim()
  const upstashToken = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.STORAGE_REDIS_REST_TOKEN ||
    process.env.STORAGE_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.KV_REST_API_READ_ONLY_TOKEN ||
    ''
  ).trim()
  const rlBackend = rateLimitBackend()

  const nextSteps: string[] = []
  if (!envUrl) nextSteps.push('Vercel Production env: SUPABASE_URL (server) ve NEXT_PUBLIC_SUPABASE_URL (client) girin')
  if (!envAnon) nextSteps.push('Vercel Production env: NEXT_PUBLIC_SUPABASE_ANON_KEY girin')
  if (!serviceRole) nextSteps.push('Vercel Production env: SUPABASE_SERVICE_ROLE_KEY girin (OTP RLS için zorunlu)')
  if (!otpPepper) nextSteps.push('OTP_PEPPER girin (hash doğrulama için)')
  if (!auditPepper) nextSteps.push('AUDIT_PEPPER önerilir (ops loglarda email_hash için; OTP_PEPPER ile aynı da olabilir)')
  if (process.env.OTP_HASH_ONLY !== '1') nextSteps.push('OTP_HASH_ONLY=1 (hash-only OTP için önerilir)')

  return NextResponse.json({
    ok: true,
    route: '/api/health/security',
    build: {
      vercel_env: process.env.VERCEL_ENV || null,
      vercel_url: process.env.VERCEL_URL || null,
      vercel_git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      vercel_git_commit_ref: process.env.VERCEL_GIT_COMMIT_REF || null,
    },
    env: {
      // OTP hardening
      otp_pepper_set: Boolean(otpPepper),
      audit_pepper_set: Boolean(auditPepper),
      audit_hashing_enabled: Boolean(auditPepper || otpPepper),
      otp_hash_only: process.env.OTP_HASH_ONLY === '1',

      // Supabase env vs fallback
      supabase_url_set: Boolean(envUrl),
      supabase_anon_set: Boolean(envAnon),
      supabase_service_role_set: Boolean(serviceRole),
      supabase_fallback_disabled_server: process.env.DISABLE_SUPABASE_FALLBACK === '1',
      supabase_fallback_disabled_client: process.env.NEXT_PUBLIC_DISABLE_SUPABASE_FALLBACK === '1',

      // Rate limit backend (recommended for 500+ users)
      rate_limit_backend: rlBackend.backend,
      upstash_redis_configured: Boolean(upstashUrl && upstashToken),
    },
    next_steps:
      nextSteps.length > 0
        ? nextSteps
        : ['Her şey OK ✅ (Fallback anahtarları artık repoda yok; sadece env ile çalışıyoruz)'],
  }, {
    headers: {
      // Ensure Turkish characters render correctly in all clients/tools.
      'Content-Type': 'application/json; charset=utf-8',
      // Avoid stale caching while debugging deployments.
      'Cache-Control': 'no-store',
    },
  })
}

