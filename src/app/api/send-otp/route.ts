import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { isPgEnabled, query as pgQuery } from '@/lib/db'
import { pgReadOne } from '@/lib/server/pg-read'
import { withActor, type Actor } from '@/lib/server/secure-query'
import { normalizeLogoSrc } from '@/lib/organization-logo'

// Anonim (login öncesi) → SİSTEM AKTÖRÜ. otp_codes/security_audit_logs org'suz sistem tabloları;
// güvenlik YAPISAL (email+rate-limit) + service-role paritesi. RLS bypass (izole edilecek katılımcı-org'u yok).
const OTP_SYSTEM_ACTOR: Actor = { role: 'super_admin', orgId: null, userId: '00000000-0000-0000-0000-000000000000' }

export const runtime = 'nodejs'

type Body = { email?: string }

// NOTE: This is a best-effort, instance-level rate limiter.
// It won't be perfect on serverless (cold starts / multiple instances),
// but it meaningfully reduces brute-force/spam without any DB changes.
type RateState = { count: number; resetAt: number }
const rateMap = new Map<string, RateState>()

function getIp(req: NextRequest) {
  const xff = req.headers.get('x-forwarded-for') || ''
  const first = xff.split(',')[0]?.trim()
  const xrip = req.headers.get('x-real-ip')?.trim()
  return first || xrip || 'unknown'
}

function rateLimitHit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const cur = rateMap.get(key)
  if (!cur || cur.resetAt <= now) {
    rateMap.set(key, { count: 1, resetAt: now + windowMs })
    return { blocked: false, remaining: max - 1, resetAt: now + windowMs }
  }
  if (cur.count >= max) {
    return { blocked: true, remaining: 0, resetAt: cur.resetAt }
  }
  cur.count += 1
  rateMap.set(key, cur)
  return { blocked: false, remaining: Math.max(0, max - cur.count), resetAt: cur.resetAt }
}

function getOrigin(req: NextRequest) {
  // Prefer explicit origin (proxy safe enough for our use case)
  const headerOrigin = req.headers.get('origin')
  if (headerOrigin) return headerOrigin
  const url = new URL(req.url)
  return url.origin
}

function isValidFromField(value: string) {
  const s = value.trim()
  if (!s) return false
  // Accept either `email@example.com` or `Name <email@example.com>`
  const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/
  const named = /^.+<\s*[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\s*>$/
  return email.test(s) || named.test(s)
}

function otpHash(email: string, code: string) {
  const pepper = (process.env.OTP_PEPPER || '').trim()
  if (!pepper) return null
  return crypto.createHmac('sha256', pepper).update(`${email}:${code}`).digest('hex')
}

function piiHash(value: string) {
  const pepper = (process.env.AUDIT_PEPPER || process.env.OTP_PEPPER || '').trim()
  if (!pepper) return null
  return crypto.createHmac('sha256', pepper).update(value).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const email = (body.email || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'Email gerekli' }, { status: 400 })

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) return NextResponse.json({ error: 'Geçersiz email formatı' }, { status: 400 })

    // Rate-limit OTP requests (IP + email, plus IP global)
    const ip = getIp(request)
    // Corporate/NAT friendly defaults:
    // - IP global is generous (many employees behind one NAT)
    // - Email based is stricter (prevents brute force / spam)
    const windowMs = 10 * 60 * 1000
    const ipGlobal = rateLimitHit(`ip:${ip}`, 200, windowMs)
    const ipEmail = rateLimitHit(`ip_email:${ip}:${email}`, 25, windowMs)
    const emailGlobal = rateLimitHit(`email:${email}`, 12, windowMs)
    if (ipGlobal.blocked || ipEmail.blocked || emailGlobal.blocked) {
      const resetAt = Math.min(ipGlobal.resetAt, ipEmail.resetAt, emailGlobal.resetAt)
      const resetSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
      return NextResponse.json(
        {
          success: false,
          error: 'Çok fazla deneme yapıldı',
          detail: `Lütfen ${resetSec} saniye sonra tekrar deneyin.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(resetSec),
            'X-RateLimit-Reset': String(resetAt),
            'X-RateLimit-Remaining-IP': String(ipGlobal.remaining),
            'X-RateLimit-Remaining-Email': String(emailGlobal.remaining),
          },
        }
      )
    }

    // KVKK: OTP tables are RLS deny-all. We MUST use service role for OTP issuance.
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
    const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (!supabaseUrl || !supabaseService) {
      return NextResponse.json(
        {
          success: false,
          error: 'Supabase env eksik',
          detail:
            'OTP sunucuda service role ile çalışır (RLS). Vercel → Project → Settings → Environment Variables: ' +
            'SUPABASE_SERVICE_ROLE_KEY zorunlu; Supabase URL için SUPABASE_URL veya NEXT_PUBLIC_SUPABASE_URL yeterli. ' +
            'Production ve (OTP test edecekseniz) Preview/Development ortamlarına aynı anahtarları ekleyin. ' +
            'Not: Açık oturum olan tarayıcıda bu istek çalışmayabilir; yeni tarayıcıda giriş OTP’yi tetikler.',
        },
        { status: 503 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseService)

    // User + org logo — OKUMA fallback. Case-safe eşleşme (ilike). pg'de 0 satır → data=null → aşağıda 404.
    const { data: user, error: userError } = isPgEnabled()
      ? await pgReadOne<any>('select id, name, email, organization_id from users where email ilike $1 and status = $2 limit 1', [email, 'active'])
      : await supabase
          .from('users')
          .select('id, name, email, organization_id')
          .ilike('email', email)
          .eq('status', 'active')
          .single()

    // Important: distinguish "not found" vs "query blocked" (RLS) vs other errors.
    if (userError) {
      // PostgREST returns PGRST116 when `.single()` finds 0 (or >1) rows.
      // Treat 0 rows as "not found" to avoid misleading 500s.
      if ((userError as any)?.code === 'PGRST116' && String((userError as any)?.details || '').includes('0 rows')) {
        return NextResponse.json({ error: 'Bu email ile kayıtlı kullanıcı bulunamadı' }, { status: 404 })
      }
      // Log server-side for Vercel function logs
      console.error('send-otp user lookup error:', {
        message: (userError as any)?.message,
        code: (userError as any)?.code,
        details: (userError as any)?.details,
        hint: (userError as any)?.hint,
      })
      return NextResponse.json(
        {
          error: 'Kullanıcı sorgusu başarısız',
          detail: (userError as any)?.message || 'unknown',
          code: (userError as any)?.code,
          details: (userError as any)?.details,
          hint: (userError as any)?.hint || 'Bu genelde RLS/policy veya yanlış Supabase key (service role yok) kaynaklı olur.',
        },
        { status: 500 }
      )
    }
    if (!user) return NextResponse.json({ error: 'Bu email ile kayıtlı kullanıcı bulunamadı' }, { status: 404 })

    // DB rate-limit (kalici, tum instance'larda gecerli). supabase.rpc DB hatasini
    // THROW etmez, { error } doner — o yuzden donen error'i de kontrol ediyoruz.
    try {
      const rlError = isPgEnabled()
        ? await (async () => {
            // pg: fonksiyon raise ederse throw → aşağıdaki catch 429'a çevirir. Kurulu değilse in-memory korur.
            try {
              await pgQuery('select check_otp_rate_limit($1)', [email])
              return null
            } catch (e) {
              return { message: (e as Error)?.message || '' }
            }
          })()
        : (await supabase.rpc('check_otp_rate_limit', { p_email: email })).error
      if (rlError && /rate limit/i.test(String(rlError.message || ''))) {
        return NextResponse.json(
          { success: false, error: 'Çok fazla deneme yapıldı', detail: 'Lütfen biraz sonra tekrar deneyin.' },
          { status: 429 }
        )
      }
    } catch (e: any) {
      if (/rate limit/i.test(String(e?.message || ''))) {
        return NextResponse.json(
          { success: false, error: 'Çok fazla deneme yapıldı', detail: 'Lütfen biraz sonra tekrar deneyin.' },
          { status: 429 }
        )
      }
      // Fonksiyon kurulu degilse: yukaridaki in-memory limiter zaten korur
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString()
    // User experience: allow for corporate email delays (10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const codeHash = otpHash(email, otpCode)

    // OTP yazma (insert + hash-only wipe + audit). pg: TEK atomik withActor tx (yarım-OTP olmaz);
    // else: MEVCUT supabase akışı AYNEN. code_hash/plaintext ve şema-fallback mantığı BİREBİR.
    const provider = process.env.BREVO_API_KEY ? 'brevo' : process.env.RESEND_API_KEY ? 'resend' : 'none'
    const hashOnly = process.env.OTP_HASH_ONLY === '1'

    if (isPgEnabled()) {
      try {
        await withActor(OTP_SYSTEM_ACTOR, async (c) => {
          // kolon adları KODDAN sabit (row anahtarları) → enjeksiyon yok; değerler $N param.
          const doInsert = async (row: Record<string, unknown>) => {
            const cols = Object.keys(row)
            const ph = cols.map((_, i) => `$${i + 1}`)
            await c.query(`insert into otp_codes (${cols.join(', ')}) values (${ph.join(', ')})`, cols.map((k) => row[k]))
          }
          // W1: birincil (hash tercihli). Şema-fallback'ler SAVEPOINT ile: code_hash kolonu yok / code NOT NULL.
          const primary: Record<string, unknown> = { email, expires_at: expiresAt, used: false }
          if (codeHash) primary.code_hash = codeHash
          if (!hashOnly || !codeHash) primary.code = otpCode
          else primary.code = null
          await c.query('savepoint sp_ins')
          try {
            await doInsert(primary)
          } catch (e1) {
            const m1 = String((e1 as Error)?.message || '')
            await c.query('rollback to savepoint sp_ins')
            if (m1.includes('code_hash')) {
              await doInsert({ email, code: otpCode, expires_at: expiresAt, used: false })
            } else if (hashOnly && codeHash && /null value|not-null|23502/i.test(m1)) {
              await doInsert({ email, code: otpCode, expires_at: expiresAt, used: false, code_hash: codeHash })
            } else {
              throw e1
            }
          }
          // W2: hash-only'de plaintext'i temizle (aynı tx, best-effort SAVEPOINT).
          if (hashOnly && codeHash) {
            await c.query('savepoint sp_wipe')
            try {
              await c.query('update otp_codes set code = null where email = $1 and code = $2 and expires_at = $3 and used = false', [email, otpCode, expiresAt])
            } catch {
              await c.query('rollback to savepoint sp_wipe')
            }
          }
          // W3: denetim (aynı tx, best-effort SAVEPOINT; KVKK: yalnız email_hash).
          const emailHash = piiHash(email)
          if (emailHash) {
            await c.query('savepoint sp_audit')
            try {
              await c.query(
                'insert into security_audit_logs (event_type, email_hash, ip, meta) values ($1, $2, $3, $4::jsonb)',
                ['otp_issued', emailHash, ip, JSON.stringify({ provider })]
              )
            } catch {
              await c.query('rollback to savepoint sp_audit')
            }
          }
        })
      } catch {
        return NextResponse.json({ error: 'OTP oluşturma hatası' }, { status: 500 })
      }
    } else {
      // ---- Supabase yolu (MEVCUT — AYNEN) ----
      let otpInsertError: any = null
      try {
        const payload: any = { email, expires_at: expiresAt, used: false }
        if (codeHash) payload.code_hash = codeHash
        if (!hashOnly || !codeHash) payload.code = otpCode
        else payload.code = null
        const { error } = await supabase.from('otp_codes').insert(payload)
        otpInsertError = error
      } catch (e: any) {
        otpInsertError = e
      }
      if (otpInsertError && String(otpInsertError?.message || '').includes("'code_hash'")) {
        const { error } = await supabase.from('otp_codes').insert({ email, code: otpCode, expires_at: expiresAt, used: false })
        otpInsertError = error
      }
      if (
        otpInsertError &&
        hashOnly &&
        codeHash &&
        (String(otpInsertError?.message || '').toLowerCase().includes('null value') ||
          String(otpInsertError?.message || '').toLowerCase().includes('not-null') ||
          String(otpInsertError?.message || '').includes('23502'))
      ) {
        const payload: any = { email, code: otpCode, expires_at: expiresAt, used: false, code_hash: codeHash }
        const { error } = await supabase.from('otp_codes').insert(payload)
        otpInsertError = error
      }
      if (otpInsertError) return NextResponse.json({ error: 'OTP oluşturma hatası' }, { status: 500 })
      if (hashOnly && codeHash) {
        try {
          await supabase
            .from('otp_codes')
            .update({ code: null })
            .eq('email', email)
            .eq('code', otpCode)
            .eq('expires_at', expiresAt)
            .eq('used', false)
        } catch {
          // ignore if column is not nullable or RLS blocks
        }
      }
      try {
        const emailHash = piiHash(email)
        if (emailHash) {
          await supabase.from('security_audit_logs').insert({
            event_type: 'otp_issued',
            email_hash: emailHash,
            ip,
            meta: { provider },
          })
        }
      } catch {
        // ignore (table not installed / RLS)
      }
    }

    // Best-effort server-side audit log (console; no PII beyond email)
    console.info('send-otp issued', { email, ip, provider })

    let orgLogo = ''
    let orgName = ''
    if (user.organization_id) {
      // NOTE: In some Supabase schemas, the column is `logo_base64` (HTML version).
      const { data: org, error: orgErr } = isPgEnabled()
        ? await pgReadOne<any>('select name, logo_base64 from organizations where id = $1 limit 1', [user.organization_id])
        : await supabase
            .from('organizations')
            .select('name, logo_base64')
            .eq('id', user.organization_id)
            .single()
      if (!orgErr && org) {
        orgName = org.name ? String(org.name) : ''
        orgLogo = (org as { logo_base64?: unknown }).logo_base64 ? String((org as { logo_base64?: unknown }).logo_base64) : ''
      }
    }

    const brandLogo = process.env.NEXT_PUBLIC_BRAND_LOGO_URL || ''
    const logoToUse = orgLogo || brandLogo

    const origin = getOrigin(request)
    const title = 'VISIO 360°'

    const logoSrc = logoToUse ? normalizeLogoSrc(logoToUse, origin) : ''
    const htmlLogo = logoToUse
      ? `<img src="${normalizeLogoSrc(logoToUse, origin)}" alt="${orgName || title}" style="width:84px;height:84px;object-fit:contain;border-radius:16px;display:inline-block;margin-bottom:12px;background:white;" />`
      : `<div style="width:60px;height:60px;background:linear-gradient(135deg,#4a6fa5,#6b8cbe);border-radius:15px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:15px;">
           <span style="color:white;font-size:28px;font-weight:bold;">V</span>
         </div>`

    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <div style="text-align:center;margin-bottom:30px;">
          ${htmlLogo}
          <h1 style="color:#2c3e50;margin:0;font-size:24px;">${title}</h1>
          <p style="color:#6b7c93;margin:5px 0 0 0;">Performans Değerlendirme Sistemi</p>
        </div>
        <div style="background:#f8fafc;border-radius:12px;padding:25px;text-align:center;margin-bottom:25px;">
          <p style="color:#4a5568;margin:0 0 15px 0;">Merhaba <strong>${user.name}</strong>,</p>
          <p style="color:#4a5568;margin:0 0 20px 0;">Giriş kodunuz:</p>
          <div style="background:white;border:2px solid #4a6fa5;border-radius:10px;padding:20px;display:inline-block;">
            <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#4a6fa5;">${otpCode}</span>
          </div>
          <p style="color:#a0aec0;font-size:13px;margin:20px 0 0 0;">Bu kod 10 dakika içinde geçerliliğini yitirecektir.</p>
        </div>
        <div style="background:#fff8e6;border:1px solid #f6e05e;border-radius:8px;padding:15px;margin-bottom:20px;">
          <p style="color:#744210;margin:0;font-size:13px;"><strong>Güvenlik Uyarısı:</strong> Bu kodu kimseyle paylaşmayın.</p>
        </div>
        <p style="color:#a0aec0;font-size:12px;text-align:center;margin:0;">Bu emaili siz talep etmediyseniz, lütfen dikkate almayın.</p>
      </div>
    `

    const brevoApiKey = process.env.BREVO_API_KEY?.trim()
    if (brevoApiKey) {
      const fromEmail = (process.env.BREVO_FROM_EMAIL || '').trim()
      const fromName = (process.env.BREVO_FROM_NAME || 'VISIO 360').trim()
      if (!fromEmail || !emailRegex.test(fromEmail)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Email gönderimi yapılandırması hatalı',
            detail: 'BREVO_FROM_EMAIL eksik veya geçersiz (örn: noreply@mfkdanismanlik.com).',
            provider: 'brevo',
          },
          { status: 503 }
        )
      }

      const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
          accept: 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: fromName || 'VISIO 360', email: fromEmail },
          to: [{ email }],
          subject: 'VISIO 360 Giris Kodunuz',
          htmlContent: html,
      }),
    })

      const raw = await emailResponse.text().catch(() => '')
      if (!emailResponse.ok) {
        return NextResponse.json(
          { success: false, error: 'Email gönderilemedi', provider: 'brevo', detail: raw.slice(0, 300) },
          { status: 502 }
        )
      }

      let messageId: string | null = null
      try {
        const parsed = JSON.parse(raw) as { messageId?: unknown }
        if (parsed && parsed.messageId) messageId = String(parsed.messageId)
      } catch {
        // ignore
      }

      return NextResponse.json({
        success: true,
        provider: 'brevo',
        message_id: messageId,
        logo_src: logoSrc || null,
        organization_name: orgName || null,
      })
    }

    // Fallback: Resend (kept for backward compatibility)
    const resendApiKey = process.env.RESEND_API_KEY
    if (!resendApiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email gönderimi aktif değil',
          detail:
            'BREVO_API_KEY veya RESEND_API_KEY tanımlı değil. Vercel → Settings → Environment Variables → Production alanına ekleyip redeploy edin.',
          provider: 'email',
        },
        { status: 503 }
      )
    }

    const fromEnvRaw = (process.env.RESEND_FROM_EMAIL || '').trim()
    if (fromEnvRaw && !isValidFromField(fromEnvRaw)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email gönderimi yapılandırması hatalı',
          detail:
            'RESEND_FROM_EMAIL geçersiz formatta. Şu formatlardan biri olmalı: `email@example.com` veya `Name <email@example.com>`',
          provider: 'resend',
        },
        { status: 503 }
      )
    }
    const from = fromEnvRaw || 'VISIO 360 <onboarding@resend.dev>'

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: email, subject: 'VISIO 360 Giris Kodunuz', html }),
    })

    const raw = await emailResponse.text().catch(() => '')
    if (!emailResponse.ok) {
      // Attempt to parse Resend error payload for better UX
      try {
        const parsed = JSON.parse(raw) as { statusCode?: number; name?: string; message?: string }
        const statusCode = typeof parsed?.statusCode === 'number' ? parsed.statusCode : null
        const message = parsed?.message ? String(parsed.message) : ''
        if (statusCode === 403 && message.toLowerCase().includes('testing emails')) {
    return NextResponse.json(
      {
        success: false,
              error: 'Email gönderilemedi (Resend test modu)',
              detail:
                'Resend şu an sadece kendi email adresinize test gönderimine izin veriyor. Diğer kullanıcılara göndermek için Resend → Domains bölümünden domain doğrulayın ve RESEND_FROM_EMAIL adresini bu domain’den yapın.',
              provider: 'resend',
            },
            { status: 403 }
          )
        }
      } catch {
        // ignore JSON parse errors
      }
      return NextResponse.json({ success: false, error: 'Email gönderilemedi', provider: 'resend', detail: raw.slice(0, 300) }, { status: 502 })
    }

    let messageId: string | null = null
    try {
      const parsed = JSON.parse(raw) as { id?: unknown }
      if (parsed && parsed.id) messageId = String(parsed.id)
    } catch {
      // ignore
    }
    return NextResponse.json({
      success: true,
      provider: 'resend',
      message_id: messageId,
      logo_src: logoSrc || null,
      organization_name: orgName || null,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('send-otp unhandled error:', msg)
    return NextResponse.json({ success: false, error: 'Sunucu hatası', detail: msg.slice(0, 300) }, { status: 500 })
  }
}

// Healthcheck: makes it easy to verify the route is deployed (browser GET).
export async function GET() {
  // Do NOT expose secrets; only report presence flags.
  const fromEnvRaw = (process.env.RESEND_FROM_EMAIL || '').trim()
  const brevoFromEmail = (process.env.BREVO_FROM_EMAIL || '').trim()
  return NextResponse.json({
    ok: true,
    route: '/api/send-otp',
    env: {
      email_provider: process.env.BREVO_API_KEY ? 'brevo' : 'resend',
      brevo_api_key_set: Boolean(process.env.BREVO_API_KEY),
      brevo_from_email_set: Boolean(process.env.BREVO_FROM_EMAIL),
      brevo_from_email_valid: brevoFromEmail ? /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(brevoFromEmail) : false,
      brevo_from_name_set: Boolean(process.env.BREVO_FROM_NAME),
      resend_api_key_set: Boolean(process.env.RESEND_API_KEY),
      resend_from_email_set: Boolean(process.env.RESEND_FROM_EMAIL),
      resend_from_email_valid: fromEnvRaw ? isValidFromField(fromEnvRaw) : true,
      brand_logo_set: Boolean(process.env.NEXT_PUBLIC_BRAND_LOGO_URL),
      otp_pepper_set: Boolean(process.env.OTP_PEPPER),
      otp_hash_only: process.env.OTP_HASH_ONLY === '1',
      supabase_fallback_disabled: process.env.DISABLE_SUPABASE_FALLBACK === '1',
      supabase_url_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabase_anon_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabase_service_role_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  })
}
