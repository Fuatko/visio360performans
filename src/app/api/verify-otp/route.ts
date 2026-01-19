import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'

type Body = { email?: string; code?: string }

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

function otpHash(email: string, code: string) {
  const pepper = (process.env.OTP_PEPPER || '').trim()
  if (!pepper) return null
  return crypto.createHmac('sha256', pepper).update(`${email}:${code}`).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const email = (body.email || '').trim().toLowerCase()
    const code = (body.code || '').trim()

    if (!email) return NextResponse.json({ error: 'Email gerekli' }, { status: 400 })
    if (!code || code.length !== 6) return NextResponse.json({ error: 'Kod gerekli' }, { status: 400 })

    const ip = getIp(request)
    const windowMs = 10 * 60 * 1000
    const ipGlobal = rateLimitHit(`ip:${ip}`, 300, windowMs)
    const ipEmail = rateLimitHit(`ip_email:${ip}:${email}`, 40, windowMs)
    const emailGlobal = rateLimitHit(`email:${email}`, 20, windowMs)
    if (ipGlobal.blocked || ipEmail.blocked || emailGlobal.blocked) {
      const resetAt = Math.min(ipGlobal.resetAt, ipEmail.resetAt, emailGlobal.resetAt)
      const resetSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { success: false, error: 'Çok fazla deneme yapıldı', detail: `Lütfen ${resetSec} saniye sonra tekrar deneyin.` },
        { status: 429, headers: { 'Retry-After': String(resetSec) } }
      )
    }

    const fallbackUrl = 'https://bwvvuyqaowbwlodxbbrl.supabase.co'
    const fallbackAnon =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dnZ1eXFhb3did2xvZHhiYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjA5NzAsImV4cCI6MjA4MzY5Njk3MH0.BGl1qFzFsKWmr-rHRqahpIZdmds56d-KeqZ-WkJ_nwM'

    const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const envAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    const supabaseUrl = envUrl && envUrl.startsWith('http') ? envUrl.replace(/\/$/, '') : fallbackUrl
    const supabaseAnon = envAnon || fallbackAnon
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabase = createClient(supabaseUrl, supabaseService || supabaseAnon)

    // Validate OTP
    const nowIso = new Date().toISOString()
    const codeHash = otpHash(email, code)

    // Prefer hash validation when available; fallback to plaintext for backward compatibility.
    let otpRow: any = null
    let otpError: any = null

    if (codeHash) {
      try {
        const res = await supabase
          .from('otp_codes')
          .select('*')
          .eq('email', email)
          .eq('code_hash', codeHash)
          .eq('used', false)
          .gte('expires_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        otpRow = res.data
        otpError = res.error
      } catch (e: any) {
        otpError = e
      }

      // If column doesn't exist yet, fall back to plaintext
      if (otpError && String(otpError?.message || '').includes("'code_hash'")) {
        otpRow = null
        otpError = null
      }
    }

    if (!otpRow) {
      const res = await supabase
        .from('otp_codes')
        .select('*')
        .eq('email', email)
        .eq('code', code)
        .eq('used', false)
        .gte('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      otpRow = res.data
      otpError = res.error
    }

    if (otpError || !otpRow) {
      // Optional audit log
      try {
        await supabase.from('security_audit_logs').insert({
          event_type: 'otp_verify_failed',
          email,
          ip,
          meta: { reason: 'invalid_or_expired' },
        })
      } catch {}

      return NextResponse.json({ success: false, error: 'Geçersiz veya süresi dolmuş kod' }, { status: 401 })
    }

    // Mark OTP as used
    await supabase.from('otp_codes').update({ used: true }).eq('id', (otpRow as any).id)

    // Fetch user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*, organizations(*)')
      .ilike('email', email)
      .single()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })
    }

    // Audit log success (optional)
    try {
      await supabase.from('security_audit_logs').insert({
        event_type: 'otp_verify_success',
        email,
        ip,
        meta: { user_id: (user as any).id },
      })
    } catch {}

    return NextResponse.json({ success: true, user })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Sunucu hatası', detail: String(err?.message || err).slice(0, 200) }, { status: 500 })
  }
}

