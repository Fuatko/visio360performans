import crypto from 'crypto'

type SessionPayload = {
  uid: string
  role: 'super_admin' | 'org_admin' | 'user' | string
  org_id?: string | null
  exp: number // unix seconds
}

function base64url(input: Buffer | string) {
  const b = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return b
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function unbase64url(input: string) {
  const s = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  return Buffer.from(s + pad, 'base64')
}

function secret() {
  // Prefer a dedicated secret; fall back to OTP_PEPPER to avoid breaking setups.
  return (process.env.ADMIN_SESSION_SECRET || process.env.OTP_PEPPER || '').trim()
}

export function signSession(payload: Omit<SessionPayload, 'exp'>, ttlSeconds: number) {
  const sec = secret()
  if (!sec) return null
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const body = base64url(JSON.stringify(full))
  const sig = crypto.createHmac('sha256', sec).update(body).digest()
  return `${body}.${base64url(sig)}`
}

export function verifySession(token: string | null | undefined): SessionPayload | null {
  const sec = secret()
  if (!sec || !token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = base64url(crypto.createHmac('sha256', sec).update(body).digest())
  // constant time compare
  const a = Buffer.from(expected)
  const b = Buffer.from(sig)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(unbase64url(body).toString('utf8')) as SessionPayload
    if (!payload?.uid || !payload?.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

