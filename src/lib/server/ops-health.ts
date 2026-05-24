import { rateLimitBackend } from '@/lib/server/rate-limit'

export type OpsCheckStatus = 'ok' | 'warn' | 'error' | 'unknown'

export type OpsCheck = {
  id: string
  group: string
  label: string
  status: OpsCheckStatus
  detail?: string
  hint?: string
  meta?: Record<string, unknown>
}

export type OpsHealthReport = {
  checked_at: string
  overall: OpsCheckStatus
  summary: { ok: number; warn: number; error: number; unknown: number }
  build: {
    vercel_env: string | null
    vercel_url: string | null
    vercel_git_commit_sha: string | null
    vercel_git_commit_ref: string | null
  }
  checks: OpsCheck[]
  next_steps: string[]
}

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string, opts?: { count?: 'exact'; head?: boolean }) => {
      limit: (n: number) => Promise<{ error: { message?: string; code?: string } | null; count?: number | null }>
    }
  }
  rpc: (fn: string) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>
}

function envFlag(name: string) {
  return Boolean((process.env[name] || '').trim())
}

function tableMissing(err: { message?: string; code?: string } | null) {
  if (!err) return false
  const msg = String(err.message || '').toLowerCase()
  const code = String(err.code || '')
  return code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')
}

async function probeTable(supabase: SupabaseLike, table: string): Promise<{ exists: boolean; error?: string }> {
  try {
    const { error } = await supabase.from(table).select('id', { count: 'exact', head: true }).limit(0)
    if (!error) return { exists: true }
    if (tableMissing(error)) return { exists: false }
    return { exists: true, error: error.message }
  } catch (e: any) {
    return { exists: false, error: String(e?.message || e) }
  }
}

function push(checks: OpsCheck[], check: OpsCheck) {
  checks.push(check)
}

function summarize(checks: OpsCheck[]): OpsHealthReport['summary'] {
  const summary = { ok: 0, warn: 0, error: 0, unknown: 0 }
  for (const c of checks) {
    if (c.status === 'ok') summary.ok += 1
    else if (c.status === 'warn') summary.warn += 1
    else if (c.status === 'error') summary.error += 1
    else summary.unknown += 1
  }
  return summary
}

function overallFromSummary(s: OpsHealthReport['summary']): OpsCheckStatus {
  if (s.error > 0) return 'error'
  if (s.warn > 0) return 'warn'
  if (s.ok > 0) return 'ok'
  return 'unknown'
}

function formatIso(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return String(iso)
  }
}

function formatBytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export async function runOpsHealth(supabase: SupabaseLike | null): Promise<OpsHealthReport> {
  const checks: OpsCheck[] = []
  const nextSteps: string[] = []

  const envUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const envAnon = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const otpPepper = (process.env.OTP_PEPPER || '').trim()
  const adminSession = (process.env.ADMIN_SESSION_SECRET || '').trim()
  const auditPepper = (process.env.AUDIT_PEPPER || '').trim()
  const brevoKey = (process.env.BREVO_API_KEY || '').trim()
  const resendKey = (process.env.RESEND_API_KEY || '').trim()
  const brevoFrom = (process.env.BREVO_FROM_EMAIL || '').trim()
  const resendFrom = (process.env.RESEND_FROM_EMAIL || '').trim()
  const rl = rateLimitBackend()
  const upstashOk =
    envFlag('UPSTASH_REDIS_REST_URL') ||
    envFlag('STORAGE_REDIS_REST_URL') ||
    envFlag('KV_REST_API_URL')

  // —— Ortam ——
  push(checks, {
    id: 'env_supabase_url',
    group: 'Ortam',
    label: 'Supabase URL',
    status: envUrl ? 'ok' : 'error',
    detail: envUrl ? 'Tanımlı' : 'Eksik',
    hint: 'SUPABASE_URL veya NEXT_PUBLIC_SUPABASE_URL',
  })
  push(checks, {
    id: 'env_service_role',
    group: 'Ortam',
    label: 'Service role (OTP / admin API)',
    status: serviceRole ? 'ok' : 'error',
    detail: serviceRole ? 'Tanımlı' : 'Eksik',
    hint: 'SUPABASE_SERVICE_ROLE_KEY (Vercel Production)',
  })
  push(checks, {
    id: 'env_anon',
    group: 'Ortam',
    label: 'Anon key (istemci)',
    status: envAnon ? 'ok' : 'error',
    detail: envAnon ? 'Tanımlı' : 'Eksik',
  })
  push(checks, {
    id: 'env_session',
    group: 'Ortam',
    label: 'Admin oturum çerezi',
    status: adminSession || otpPepper ? 'ok' : 'error',
    detail: adminSession ? 'ADMIN_SESSION_SECRET' : otpPepper ? 'OTP_PEPPER (yedek)' : 'Eksik',
    hint: 'ADMIN_SESSION_SECRET önerilir',
  })
  const emailOk = Boolean(brevoKey && brevoFrom) || Boolean(resendKey)
  push(checks, {
    id: 'env_email',
    group: 'Ortam',
    label: 'OTP e-posta (Brevo / Resend)',
    status: emailOk ? 'ok' : brevoKey || resendKey ? 'warn' : 'error',
    detail: brevoKey
      ? `Brevo (${brevoFrom || 'BREVO_FROM_EMAIL eksik'})`
      : resendKey
        ? `Resend (${resendFrom || 'varsayılan gönderen'})`
        : 'Yapılandırılmamış',
  })
  push(checks, {
    id: 'env_audit',
    group: 'Ortam',
    label: 'Audit hash (KVKK log)',
    status: auditPepper || otpPepper ? 'ok' : 'warn',
    detail: auditPepper ? 'AUDIT_PEPPER' : otpPepper ? 'OTP_PEPPER ile' : 'Önerilir',
  })
  push(checks, {
    id: 'env_rate_limit',
    group: 'Ortam',
    label: 'Rate limit backend',
    status: rl.backend === 'upstash' ? 'ok' : 'warn',
    detail: rl.backend === 'upstash' ? 'Upstash Redis' : 'Bellek (tek instance — yüksek trafikte zayıf)',
    meta: { upstash_env_partial: upstashOk },
  })
  push(checks, {
    id: 'env_backup_s3',
    group: 'Ortam',
    label: 'Yedekleme depolama (S3)',
    status: envFlag('BACKUP_S3_BUCKET') && envFlag('BACKUP_ENCRYPTION_PASSWORD') ? 'ok' : 'warn',
    detail:
      envFlag('BACKUP_S3_BUCKET') && envFlag('BACKUP_ENCRYPTION_PASSWORD')
        ? 'S3 + şifreleme env OK'
        : 'BACKUP_S3_* veya BACKUP_ENCRYPTION_PASSWORD eksik olabilir',
  })
  push(checks, {
    id: 'env_cron',
    group: 'Ortam',
    label: 'Cron secret',
    status: envFlag('CRON_SECRET') ? 'ok' : 'warn',
    detail: envFlag('CRON_SECRET') ? 'Tanımlı' : 'Zamanlanmış işler için önerilir',
  })
  push(checks, {
    id: 'env_openai',
    group: 'Ortam',
    label: 'OpenAI (AI öneriler)',
    status: envFlag('OPENAI_API_KEY') ? 'ok' : 'warn',
    detail: envFlag('OPENAI_API_KEY') ? (process.env.OPENAI_MODEL || 'gpt-4o-mini') : 'Kapalı / opsiyonel',
  })

  if (!envUrl || !serviceRole) nextSteps.push('Vercel Production: Supabase URL + SUPABASE_SERVICE_ROLE_KEY')
  if (!adminSession && !otpPepper) nextSteps.push('ADMIN_SESSION_SECRET veya OTP_PEPPER ekleyin')
  if (!emailOk) nextSteps.push('BREVO_API_KEY + BREVO_FROM_EMAIL veya RESEND_API_KEY ekleyin')

  // —— Veritabanı ——
  if (!supabase) {
    push(checks, {
      id: 'db_connect',
      group: 'Veritabanı',
      label: 'Bağlantı',
      status: 'error',
      detail: 'Service role ile bağlantı kurulamadı',
    })
  } else {
    const t0 = Date.now()
    const { error } = await supabase.from('organizations').select('id', { head: true }).limit(1)
    const ms = Date.now() - t0
    push(checks, {
      id: 'db_connect',
      group: 'Veritabanı',
      label: 'Bağlantı (PostgREST)',
      status: error ? 'error' : 'ok',
      detail: error ? error.message || 'Sorgu hatası' : `${ms} ms`,
    })
  }

  // —— Yedekleme ——
  if (supabase) {
    const backupRes = await supabase.rpc('backup_health')
    if (backupRes.error && String(backupRes.error.code || '') === '42883') {
      push(checks, {
        id: 'backup_rpc',
        group: 'Yedekleme',
        label: 'backup_health()',
        status: 'error',
        detail: 'Fonksiyon yok',
        hint: 'sql/backup-ops.sql dosyasını Supabase’de çalıştırın',
      })
      nextSteps.push('sql/backup-ops.sql → backup_runs + backup_health()')
    } else if (backupRes.error) {
      push(checks, {
        id: 'backup_rpc',
        group: 'Yedekleme',
        label: 'backup_health()',
        status: 'error',
        detail: backupRes.error.message || 'RPC hatası',
      })
    } else {
      const b = (backupRes.data || {}) as Record<string, unknown>
      const last24 = Boolean(b.has_success_last_24h)
      const latestStatus = String(b.latest_status || '—')
      push(checks, {
        id: 'backup_recent',
        group: 'Yedekleme',
        label: 'Son 24 saatte başarılı yedek',
        status: last24 ? 'ok' : latestStatus === 'running' ? 'warn' : 'error',
        detail: last24 ? 'Evet' : 'Hayır',
        meta: b,
      })
      push(checks, {
        id: 'backup_last_success',
        group: 'Yedekleme',
        label: 'Son başarılı yedek',
        status: b.latest_success_at ? 'ok' : 'warn',
        detail: formatIso(b.latest_success_at as string),
        meta: {
          path: b.latest_success_path,
          size: formatBytes(b.latest_success_size_bytes as number),
          sha256: b.latest_success_sha256 ? `${String(b.latest_success_sha256).slice(0, 12)}…` : null,
        },
      })
      push(checks, {
        id: 'backup_last_run',
        group: 'Yedekleme',
        label: 'Son çalıştırma',
        status: latestStatus === 'failed' ? 'error' : latestStatus === 'success' ? 'ok' : 'warn',
        detail: `${latestStatus} · ${formatIso(b.latest_finished_at as string)}`,
        hint: b.latest_error ? String(b.latest_error) : undefined,
      })
      if (!last24) nextSteps.push('GitHub Actions / scripts/backup-supabase.sh yedek zamanlamasını kontrol edin')
    }
  }

  // —— Güvenlik tabloları (RPC) ——
  if (supabase) {
    const secRes = await supabase.rpc('security_ops_health')
    if (secRes.error && String(secRes.error.code || '') === '42883') {
      push(checks, {
        id: 'security_rpc',
        group: 'Güvenlik',
        label: 'security_ops_health()',
        status: 'warn',
        detail: 'Fonksiyon yok — sql/backup-ops.sql',
      })
    } else if (!secRes.error && secRes.data) {
      const payload = secRes.data as { tables?: { table: string; exists: boolean; rls_enabled: boolean }[] }
      const tables = Array.isArray(payload.tables) ? payload.tables : []
      const missing = tables.filter((t) => !t.exists)
      const noRls = tables.filter((t) => t.exists && !t.rls_enabled)
      push(checks, {
        id: 'security_tables',
        group: 'Güvenlik',
        label: 'Kritik tablolar',
        status: missing.length ? 'error' : 'ok',
        detail: missing.length ? `Eksik: ${missing.map((t) => t.table).join(', ')}` : `${tables.length} tablo mevcut`,
      })
      push(checks, {
        id: 'security_rls',
        group: 'Güvenlik',
        label: 'RLS (satır güvenliği)',
        status: noRls.length ? 'warn' : 'ok',
        detail: noRls.length ? `RLS kapalı: ${noRls.map((t) => t.table).join(', ')}` : 'Kontrol edilen tablolarda RLS açık',
      })
    }
  }

  // —— Modül şemaları ——
  const moduleTables: { table: string; module: string }[] = [
    { table: 'evaluation_assignments', module: 'Matris' },
    { table: 'evaluation_period_evaluator_scope', module: 'Soru kapsamı (varsayılan)' },
    { table: 'evaluation_period_evaluator_categories', module: 'Soru kapsamı (varsayılan)' },
    { table: 'evaluation_period_evaluator_target_scope', module: 'Soru kapsamı (hedef özel)' },
    { table: 'evaluation_period_evaluator_target_categories', module: 'Soru kapsamı (hedef özel)' },
    { table: 'evaluation_period_questions', module: 'Dönem soruları' },
    { table: 'evaluation_period_questions_snapshot', module: 'İçerik kilidi' },
    { table: 'evaluation_duties', module: 'Görev paketleri' },
    { table: 'evaluation_period_user_duties', module: 'Görev Excel atamaları' },
    { table: 'evaluation_period_duty_questions', module: 'Görev soruları' },
    { table: 'otp_codes', module: 'OTP giriş' },
    { table: 'backup_runs', module: 'Yedekleme kayıtları' },
  ]

  if (supabase) {
    for (const { table, module } of moduleTables) {
      const probe = await probeTable(supabase, table)
      push(checks, {
        id: `schema_${table}`,
        group: 'Modüller',
        label: `${module} · ${table}`,
        status: probe.exists ? (probe.error ? 'warn' : 'ok') : 'error',
        detail: probe.exists ? probe.error || 'Tablo mevcut' : 'Tablo yok',
        hint: !probe.exists
          ? table.includes('evaluator_target')
            ? 'sql/period-evaluator-target-scope.sql'
            : table.includes('evaluator')
              ? 'sql/period-evaluator-question-scope.sql'
              : table === 'backup_runs'
                ? 'sql/backup-ops.sql'
                : 'İlgili sql/*.sql migration dosyasını çalıştırın'
          : undefined,
      })
      if (!probe.exists && table.includes('evaluator_target')) {
        nextSteps.push('sql/period-evaluator-target-scope.sql (matris satırı özel kapsam)')
      }
    }
  }

  const summary = summarize(checks)
  const dedupedSteps = Array.from(new Set(nextSteps))

  return {
    checked_at: new Date().toISOString(),
    overall: overallFromSummary(summary),
    summary,
    build: {
      vercel_env: process.env.VERCEL_ENV || null,
      vercel_url: process.env.VERCEL_URL || null,
      vercel_git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      vercel_git_commit_ref: process.env.VERCEL_GIT_COMMIT_REF || null,
    },
    checks,
    next_steps: dedupedSteps.length ? dedupedSteps : ['Kritik kontroller tamam — düzenli yedek ve env rotasyonunu sürdürün'],
  }
}
