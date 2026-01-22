import { NextRequest } from 'next/server'

// Rate limiting backend:
// - Default: in-memory (best-effort, per-instance)
// - Optional: Upstash Redis REST (recommended for 500+ users / multi-instance consistency)

export type RateState = { count: number; resetAt: number }

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

type Hit = { blocked: boolean; remaining: number; resetAt: number; backend: 'memory' | 'upstash' }

type UpstashPipelineCmd = [string, ...Array<string | number>]

function getUpstashEnv() {
  const pick = (...vals: Array<string | undefined>) => {
    for (const v of vals) {
      const s = (v || '').trim()
      if (s) return s
    }
    return ''
  }

  // Supported env names:
  // - Direct Upstash Redis REST: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
  // - Vercel Storage integration with custom prefix (example prefix: STORAGE): STORAGE_URL / STORAGE_TOKEN
  // - Also accept *_REDIS_REST_* prefixed variants when provided by some integrations.
  const url = pick(
    process.env.UPSTASH_REDIS_REST_URL,
    process.env.UPSTASH_URL,
    process.env.STORAGE_REDIS_REST_URL,
    process.env.STORAGE_URL
  ).replace(/\/$/, '')

  const token = pick(
    process.env.UPSTASH_REDIS_REST_TOKEN,
    process.env.UPSTASH_TOKEN,
    process.env.STORAGE_REDIS_REST_TOKEN,
    process.env.STORAGE_TOKEN
  )

  return { url, token, enabled: Boolean(url && token) }
}

async function upstashPipeline(url: string, token: string, commands: UpstashPipelineCmd[]) {
  const resp = await fetch(url + '/pipeline', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands.map((c) => ({ command: c }))),
  })
  const json = await resp.json().catch(() => null)
  if (!resp.ok || !json) throw new Error('Upstash pipeline failed')
  return json as Array<{ result?: unknown; error?: string }>
}

function rateLimitHitMemory(key: string, max: number, windowMs: number): Hit {
  const now = Date.now()
  const cur = rateMap.get(key)
  if (!cur || cur.resetAt <= now) {
    const resetAt = now + windowMs
    rateMap.set(key, { count: 1, resetAt })
    return { blocked: false, remaining: Math.max(0, max - 1), resetAt, backend: 'memory' }
  }
  if (cur.count >= max) {
    return { blocked: true, remaining: 0, resetAt: cur.resetAt, backend: 'memory' }
  }
  cur.count += 1
  rateMap.set(key, cur)
  return { blocked: false, remaining: Math.max(0, max - cur.count), resetAt: cur.resetAt, backend: 'memory' }
}

async function rateLimitHitUpstash(key: string, max: number, windowMs: number): Promise<Hit> {
  const now = Date.now()
  const { url, token } = getUpstashEnv()

  // Use SET NX PX to initialize TTL once, then INCR for counting, then PTTL to compute reset.
  // This avoids resetting TTL on every request.
  const res = await upstashPipeline(url, token, [
    ['SET', key, 0, 'PX', windowMs, 'NX'],
    ['INCR', key],
    ['PTTL', key],
  ])

  const count = Number((res?.[1] as any)?.result ?? 0)
  const pttl = Number((res?.[2] as any)?.result ?? windowMs)
  const ttlMs = pttl > 0 ? pttl : windowMs
  const resetAt = now + ttlMs

  if (count > max) {
    return { blocked: true, remaining: 0, resetAt, backend: 'upstash' }
  }
  return { blocked: false, remaining: Math.max(0, max - count), resetAt, backend: 'upstash' }
}

async function rateLimitHit(key: string, max: number, windowMs: number): Promise<Hit> {
  const up = getUpstashEnv()
  if (!up.enabled) return rateLimitHitMemory(key, max, windowMs)

  try {
    return await rateLimitHitUpstash(key, max, windowMs)
  } catch {
    // Fail-open to memory to avoid hard outages if Upstash is misconfigured.
    return rateLimitHitMemory(key, max, windowMs)
  }
}

export async function rateLimitByIp(req: NextRequest, bucket: string, max: number, windowMs: number) {
  const ip = getIp(req)
  const hit = await rateLimitHit(bucket + ':ip:' + ip, max, windowMs)
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
      'X-RateLimit-Backend': hit.backend,
    } as Record<string, string>,
  }
}

// User-based limiter for authenticated endpoints.
// This avoids false positives when many users share the same corporate NAT IP.
export async function rateLimitByUser(req: NextRequest, bucket: string, uid: string, max: number, windowMs: number) {
  const ip = getIp(req)
  const safeUid = String(uid || '').trim() || 'unknown'
  const hit = await rateLimitHit(bucket + ':uid:' + safeUid, max, windowMs)
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
      'X-RateLimit-Backend': hit.backend,
    } as Record<string, string>,
  }
}

export function rateLimitBackend() {
  const up = getUpstashEnv()
  return { backend: up.enabled ? 'upstash' : 'memory', upstash_configured: up.enabled }
}
