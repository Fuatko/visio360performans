import { NextRequest } from 'next/server'

// Best-effort, instance-level (in-memory) rate limiter.
// Works as a low-risk protection on serverless; not perfect across instances/cold starts.

type RateState = { count: number; resetAt: number }

declare global {
  var __visio360_rate_map: Map<string, RateState> | undefined
}

const rateMap: Map<string, RateState> = globalThis.__visio360_rate_map || new Map<string, RateState>()
globalThis.__visio360_rate_map = rateMap

export function getIp(req: NextRequest) {
  const xff = req.headers.get('x-forwarded-for') || ''
  const first = xff.split(',')[0]?.trim()
  const xrip = req.headers.get('x-real-ip')?.trim()
  return first || xrip || 'unknown'
}

function rateLimitHit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const cur = rateMap.get(key)
  if (!cur || cur.resetAt <= now) {
    const resetAt = now + windowMs
    rateMap.set(key, { count: 1, resetAt })
    return { blocked: false, remaining: Math.max(0, max - 1), resetAt }
  }
  if (cur.count >= max) {
    return { blocked: true, remaining: 0, resetAt: cur.resetAt }
  }
  cur.count += 1
  rateMap.set(key, cur)
  return { blocked: false, remaining: Math.max(0, max - cur.count), resetAt: cur.resetAt }
}

export function rateLimitByIp(req: NextRequest, bucket: string, max: number, windowMs: number) {
  const ip = getIp(req)
  const hit = rateLimitHit(`${bucket}:ip:${ip}`, max, windowMs)
  const retryAfterSec = Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000))
  return {
    ...hit,
    ip,
    retryAfterSec,
    headers: {
      'Retry-After': String(retryAfterSec),
      'X-RateLimit-Limit': String(max),
      'X-RateLimit-Remaining': String(hit.remaining),
      'X-RateLimit-Reset': String(Math.floor(hit.resetAt / 1000)),
    } as Record<string, string>,
  }
}


// User-based limiter for authenticated endpoints.
// This avoids false positives when many users share the same corporate NAT IP.
export function rateLimitByUser(req: NextRequest, bucket: string, uid: string, max: number, windowMs: number) {
  const ip = getIp(req)
  const safeUid = String(uid || '').trim() || 'unknown'
  const hit = rateLimitHit(`${bucket}:uid:${safeUid}`, max, windowMs)
  const retryAfterSec = Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000))
  return {
    ...hit,
    ip,
    uid: safeUid,
    retryAfterSec,
    headers: {
      'Retry-After': String(retryAfterSec),
      'X-RateLimit-Limit': String(max),
      'X-RateLimit-Remaining': String(hit.remaining),
      'X-RateLimit-Reset': String(Math.floor(hit.resetAt / 1000)),
    } as Record<string, string>,
  }
}
