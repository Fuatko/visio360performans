import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'

import { signSession } from '@/lib/server/session'

type Body = { email?: string; code?: string }

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

function getIp(req: NextRequest) {
  const xff = req.headers.get('x-forwarded-for') || ''
  const first = xff.split(',')[0]?.trim()
  const xrip = req.headers.get('x-real-ip')?.trim()
  return first || xrip || 'unknown'
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const email = (body.email || '').trim().toLowerCase()
    const code = (body.code || '').trim()
    if (!email) return NextResponse.json({ success: false, error: 'Email gerekli' }, { status: 400 })
    if (!code || code.length !== 6) return NextResponse.json({ success: false, error: 'Kod gerekli' }, { status: 400 })

    const ip = getIp(request)

    const disableFallback = process.env.DISABLE_SUPABASE_FALLBACK === '1'
    const fallbackUrl = 'https://bwvvuyqaowbwlodxbbrl.supabase.co'
    const fallbackAnon =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dnZ1eXFhb3did2xvZHhiYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjA5NzAsImV4cCI6MjA4MzY5Njk3MH0.BGl1qFzFsKWmr-rHRqahpIZdmds56d-KeqZ-WkJ_nwM'

    const envUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
    const envAnon = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
    const supabaseUrl = envUrl && envUrl.startsWith('http') ? envUrl.replace(/\/$/, '') : (disableFallback ? '' : fallbackUrl)
    const supabaseAnon = envAnon || (disableFallback ? '' : fallbackAnon)
    const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (disableFallback && (!supabaseUrl || !(supabaseService || supabaseAnon))) {
      return NextResponse.json({ success: false, error: 'Supabase env eksik' }, { status: 503 })
    }

    const supabase = createClient(supabaseUrl, supabaseService || supabaseAnon)

    // Optional DB verify-rate-limit (if installed). If it signals rate-limit, return 429.
    try {
      await supabase.rpc('check_otp_verify_rate_limit', { p_email: email, p_ip: ip })
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.toLowerCase().includes('rate limit')) {
        return NextResponse.json({ success: false, error: 'Çok fazla deneme yapıldı' }, { status: 429 })
      }
    }

    const nowIso = new Date().toISOString()
    const codeHash = otpHash(email, code)

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
      // Optional audit log (best-effort; do not block login)
      try {
        const emailHash = piiHash(email)
        const payload: any = { event_type: 'otp_verify_failed', ip, meta: { reason: 'invalid_or_expired' } }
        if (emailHash) payload.email_hash = emailHash
        else payload.email = email
        const { error } = await supabase.from('security_audit_logs').insert(payload)
        if (error && String(error.message || '').includes("'email_hash'")) {
          await supabase.from('security_audit_logs').insert({
            event_type: 'otp_verify_failed',
            email,
            ip,
            meta: { reason: 'invalid_or_expired' },
          })
        }
      } catch {}
      return NextResponse.json({ success: false, error: 'Geçersiz veya süresi dolmuş kod' }, { status: 401 })
    }

    await supabase.from('otp_codes').update({ used: true }).eq('id', (otpRow as any).id)

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*, organizations(*)')
      .ilike('email', email)
      .single()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })
    }

    // Optional audit log success
    try {
      const emailHash = piiHash(email)
      const payload: any = { event_type: 'otp_verify_success', ip, meta: { user_id: (user as any).id } }
      if (emailHash) payload.email_hash = emailHash
      else payload.email = email
      const { error } = await supabase.from('security_audit_logs').insert(payload)
      if (error && String(error.message || '').includes("'email_hash'")) {
        await supabase.from('security_audit_logs').insert({
          event_type: 'otp_verify_success',
          email,
          ip,
          meta: { user_id: (user as any).id },
        })
      }
    } catch {}

    const resp = NextResponse.json({ success: true, user })
    const token = signSession(
      {
        uid: String((user as any).id),
        role: String((user as any).role || 'user'),
        org_id: (user as any).organization_id ? String((user as any).organization_id) : null,
      },
      7 * 24 * 60 * 60
    )
    if (token) {
      resp.cookies.set({
        name: 'visio360_session',
        value: token,
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      })
    }
    return resp
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Sunucu hatası', detail: String(err?.message || err).slice(0, 200) }, { status: 500 })
  }
}

