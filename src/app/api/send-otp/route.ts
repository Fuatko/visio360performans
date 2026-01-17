import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type Body = { email?: string }

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

function normalizeLogoSrc(input: string, origin: string) {
  const s = (input || '').trim()
  if (!s) return ''
  if (s.startsWith('data:image/')) return s
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  if (s.startsWith('/')) return `${origin}${s}`

  // Legacy: raw base64 (no data: prefix)
  const b64 = /^[A-Za-z0-9+/=]+$/
  if (s.length > 50 && b64.test(s)) {
    let mime = 'image/png'
    if (s.startsWith('/9j/')) mime = 'image/jpeg'
    else if (s.startsWith('R0lGOD')) mime = 'image/gif'
    else if (s.startsWith('UklGR')) mime = 'image/webp'
    return `data:${mime};base64,${s}`
  }

  // Relative path without leading slash
  if (!s.includes(' ') && (s.includes('.') || s.includes('/'))) {
    return `${origin}/${s.replace(/^\/+/, '')}`
  }

  return s
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const email = (body.email || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'Email gerekli' }, { status: 400 })

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) return NextResponse.json({ error: 'Geçersiz email formatı' }, { status: 400 })

    // Keep parity with src/lib/supabase.ts fallback behavior so Vercel env misconfig doesn't hard-fail OTP.
    const fallbackUrl = 'https://bwvvuyqaowbwlodxbbrl.supabase.co'
    const fallbackAnon =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dnZ1eXFhb3did2xvZHhiYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjA5NzAsImV4cCI6MjA4MzY5Njk3MH0.BGl1qFzFsKWmr-rHRqahpIZdmds56d-KeqZ-WkJ_nwM'

    const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const envAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

    const supabaseUrl = envUrl && envUrl.length > 0 && envUrl.startsWith('http') ? envUrl.replace(/\/$/, '') : fallbackUrl
    const supabaseAnon = envAnon && envAnon.length > 0 ? envAnon : fallbackAnon
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY

    const supabase = createClient(supabaseUrl, supabaseService || supabaseAnon)

    // User + org logo
    const { data: user, error: userError } = await supabase
      .from('users')
      // Avoid join column mismatch across DB variants; fetch org separately.
      .select('id, name, email, organization_id')
      // Case-safe match (some datasets stored mixed-case emails)
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

    // Rate limit (optional RPC)
    try {
      await supabase.rpc('check_otp_rate_limit', { p_email: email })
    } catch {
      // ignore if not installed
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    const { error: otpError } = await supabase.from('otp_codes').insert({
      email,
      code: otpCode,
      expires_at: expiresAt,
      used: false,
    })
    if (otpError) return NextResponse.json({ error: 'OTP oluşturma hatası' }, { status: 500 })

    let orgLogo = ''
    let orgName = ''
    if (user.organization_id) {
      // NOTE: In some Supabase schemas, the column is `logo_base64` (HTML version).
      const { data: org, error: orgErr } = await supabase
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
          <p style="color:#a0aec0;font-size:13px;margin:20px 0 0 0;">Bu kod 5 dakika içinde geçerliliğini yitirecektir.</p>
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
    return NextResponse.json({ success: false, warning: 'Sunucu hatası', detail: msg.slice(0, 300) }, { status: 200 })
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
      supabase_url_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabase_anon_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabase_service_role_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  })
}
