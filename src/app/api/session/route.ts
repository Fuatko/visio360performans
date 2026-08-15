import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { isPgEnabled, query as pgQuery } from '@/lib/db'
import { pgReadOne } from '@/lib/server/pg-read'
import { withActor, type Actor } from '@/lib/server/secure-query'

export const runtime = 'nodejs'

import { isAdminRole, normalizeRole, signSession, verifySession } from '@/lib/server/session'

// Anonim (login öncesi) → SİSTEM AKTÖRÜ. otp_codes/security_audit_logs org'suz sistem tabloları;
// güvenlik YAPISAL (code_hash + rate-limit) + service-role paritesi. RLS bypass.
const OTP_SYSTEM_ACTOR: Actor = { role: 'super_admin', orgId: null, userId: '00000000-0000-0000-0000-000000000000' }

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

/** Oturum çerezi geçerli mi? (Admin API'ler visio360_session kullanır.) */
export async function GET(request: NextRequest) {
  const token = request.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s) {
    return NextResponse.json(
      {
        success: false,
        error: 'Oturum yok veya süresi doldu',
        hint: 'Çıkış yapıp tekrar giriş yapın. Vercel’de ADMIN_SESSION_SECRET veya OTP_PEPPER tanımlı olmalı.',
      },
      { status: 401 }
    )
  }
  return NextResponse.json({
    success: true,
    uid: s.uid,
    role: s.role,
    org_id: s.org_id ?? null,
    is_admin: isAdminRole(s.role),
  })
}

/** Oturumu kapat: httpOnly çerezi sil */
export async function DELETE(request: NextRequest) {
  const resp = NextResponse.json({ success: true })
  resp.cookies.set({
    name: 'visio360_session',
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return resp
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const email = (body.email || '').trim().toLowerCase()
    const code = (body.code || '').trim()
    if (!email) return NextResponse.json({ success: false, error: 'Email gerekli' }, { status: 400 })
    if (!code || code.length !== 6) return NextResponse.json({ success: false, error: 'Kod gerekli' }, { status: 400 })

    const ip = getIp(request)

    // KVKK: OTP tables are RLS deny-all. We MUST use service role for OTP verification.
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
    const supabaseService = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (!supabaseUrl || !supabaseService) {
      return NextResponse.json({ success: false, error: 'Supabase env eksik' }, { status: 503 })
    }

    const supabase = createClient(supabaseUrl, supabaseService)

    // DB verify-rate-limit (brute-force korumasi). ONEMLI: supabase.rpc, Postgres
    // RAISE EXCEPTION'i THROW etmez; { error } olarak DONER. Bu yuzden hem donen
    // error'i hem de olasi throw'u kontrol ediyoruz.
    try {
      const rlError = isPgEnabled()
        ? await (async () => {
            try {
              await pgQuery('select check_otp_verify_rate_limit($1, $2)', [email, ip])
              return null
            } catch (e) {
              return { message: (e as Error)?.message || '' }
            }
          })()
        : (await supabase.rpc('check_otp_verify_rate_limit', { p_email: email, p_ip: ip })).error
      if (rlError && /rate limit/i.test(String(rlError.message || ''))) {
        return NextResponse.json({ success: false, error: 'Çok fazla deneme yapıldı' }, { status: 429 })
      }
    } catch (e: any) {
      if (/rate limit/i.test(String(e?.message || ''))) {
        return NextResponse.json({ success: false, error: 'Çok fazla deneme yapıldı' }, { status: 429 })
      }
      // Fonksiyon kurulu degilse veya baska hata → sessiz gec (deny etme)
    }

    const nowIso = new Date().toISOString()
    const codeHash = otpHash(email, code)

    let otpRow: any = null
    let otpError: any = null

    if (isPgEnabled()) {
      // 🔴 TEK-KULLANIM (replay engeli): doğrula + tüket TEK atomik withActor tx.
      // SELECT ... FOR UPDATE satırı kilitler → eşzamanlı ikinci doğrulama, birinci commit edip used=true
      // yazana dek bekler, sonra used=true görür → reddedilir. Yarış kapalı. (Analiz notundaki iyileştirme.)
      // Doğrulama BİREBİR: code_hash (HMAC) eşleşme + used=false + expires_at>=now. code_hash kolonu yoksa plaintext fallback.
      try {
        otpRow = await withActor(OTP_SYSTEM_ACTOR, async (c) => {
          let row: any = null
          if (codeHash) {
            try {
              const r = await c.query<any>(
                'select * from otp_codes where email = $1 and code_hash = $2 and used = false and expires_at >= $3 order by created_at desc limit 1 for update',
                [email, codeHash, nowIso]
              )
              row = r.rows[0] || null
            } catch {
              // code_hash kolonu yok (eski şema) → plaintext fallback'e düş.
              row = null
            }
          }
          if (!row) {
            const r = await c.query<any>(
              'select * from otp_codes where email = $1 and code = $2 and used = false and expires_at >= $3 order by created_at desc limit 1 for update',
              [email, code, nowIso]
            )
            row = r.rows[0] || null
          }
          if (!row) return null
          // Kilitli satırı aynı tx'te tüket → aynı OTP iki kez kullanılamaz.
          await c.query('update otp_codes set used = true where id = $1', [row.id])
          return row
        })
      } catch {
        otpRow = null // beklenmeyen DB hatası → geçersiz say (orijinal: error → 401)
      }
    } else {
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
    }

    if (otpError || !otpRow) {
      // Optional audit log (best-effort; do not block login). KVKK/PII: yalnız email_hash.
      try {
        const emailHash = piiHash(email)
        if (emailHash) {
          if (isPgEnabled()) {
            await withActor(OTP_SYSTEM_ACTOR, async (c) =>
              c.query('insert into security_audit_logs (event_type, email_hash, ip, meta) values ($1, $2, $3, $4::jsonb)', [
                'otp_verify_failed',
                emailHash,
                ip,
                JSON.stringify({ reason: 'invalid_or_expired' }),
              ])
            )
          } else {
            await supabase.from('security_audit_logs').insert({
              event_type: 'otp_verify_failed',
              email_hash: emailHash,
              ip,
              meta: { reason: 'invalid_or_expired' },
            })
          }
        }
      } catch {}
      return NextResponse.json({ success: false, error: 'Geçersiz veya süresi dolmuş kod' }, { status: 401 })
    }

    // pg yolunda used=true doğrulama tx'inde ATOMİK yapıldı (FOR UPDATE). Supabase yolunda burada tüket.
    if (!isPgEnabled()) {
      await supabase.from('otp_codes').update({ used: true }).eq('id', (otpRow as any).id)
    }

    // Login kullanıcısı (org + rol). embed organizations(*) → JOIN.
    const { data: user, error: userError } = isPgEnabled()
      ? await pgReadOne<any>(
          `select u.*,
             case when o.id is not null then to_jsonb(o.*) else null end as organizations
           from users u
           left join organizations o on o.id = u.organization_id
           where u.email ilike $1 limit 1`,
          [email]
        )
      : await supabase
          .from('users')
          .select('*, organizations(*)')
          .ilike('email', email)
          .single()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })
    }

    // Optional audit log success. KVKK/PII: never store raw email; store only email_hash.
    try {
      const emailHash = piiHash(email)
      if (emailHash) {
        if (isPgEnabled()) {
          await withActor(OTP_SYSTEM_ACTOR, async (c) =>
            c.query('insert into security_audit_logs (event_type, email_hash, ip, meta) values ($1, $2, $3, $4::jsonb)', [
              'otp_verify_success',
              emailHash,
              ip,
              JSON.stringify({ user_id: (user as any).id }),
            ])
          )
        } else {
          await supabase.from('security_audit_logs').insert({
            event_type: 'otp_verify_success',
            email_hash: emailHash,
            ip,
            meta: { user_id: (user as any).id },
          })
        }
      }
    } catch {}

    const normalizedRole = normalizeRole((user as any).role)
    const userOut = { ...(user as any), role: normalizedRole }
    const token = signSession(
      {
        uid: String((user as any).id),
        role: normalizedRole,
        org_id: (user as any).organization_id ? String((user as any).organization_id) : null,
      },
      7 * 24 * 60 * 60
    )
    const sessionWarning = token
      ? undefined
      : 'Oturum çerezi oluşturulamadı (ADMIN_SESSION_SECRET veya OTP_PEPPER eksik). Admin API işlemleri Yetkisiz dönebilir.'
    const resp = NextResponse.json({ success: true, user: userOut, session_warning: sessionWarning })
    if (token) {
      resp.cookies.set({
        name: 'visio360_session',
        value: token,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      })
    }
    return resp
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Sunucu hatası', detail: String(err?.message || err).slice(0, 200) }, { status: 500 })
  }
}

