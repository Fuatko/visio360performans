import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

function envStatus(name: string) {
  return Boolean((process.env[name] || '').trim())
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || s.role !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:security-health:get', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const [backupHealthRes, securityHealthRes] = await Promise.all([
    supabase.rpc('backup_health'),
    supabase.rpc('security_ops_health'),
  ])

  const backupMissing = backupHealthRes.error && String((backupHealthRes.error as any).code || '') === '42883'
  const securityMissing = securityHealthRes.error && String((securityHealthRes.error as any).code || '') === '42883'

  return NextResponse.json({
    success: true,
    env: {
      SUPABASE_URL: envStatus('SUPABASE_URL') || envStatus('NEXT_PUBLIC_SUPABASE_URL'),
      SUPABASE_SERVICE_ROLE_KEY: envStatus('SUPABASE_SERVICE_ROLE_KEY'),
      CRON_SECRET: envStatus('CRON_SECRET'),
      BACKUP_ENCRYPTION_PASSWORD: envStatus('BACKUP_ENCRYPTION_PASSWORD'),
      BACKUP_S3_BUCKET: envStatus('BACKUP_S3_BUCKET'),
      BACKUP_S3_ENDPOINT: envStatus('BACKUP_S3_ENDPOINT'),
    },
    backup:
      backupHealthRes.error && !backupMissing
        ? { error: backupHealthRes.error.message }
        : backupMissing
          ? { error: 'backup_health fonksiyonu yok. sql/backup-ops.sql çalıştırılmalı.' }
          : backupHealthRes.data,
    security:
      securityHealthRes.error && !securityMissing
        ? { error: securityHealthRes.error.message }
        : securityMissing
          ? { error: 'security_ops_health fonksiyonu yok. sql/backup-ops.sql çalıştırılmalı.' }
          : securityHealthRes.data,
  })
}
