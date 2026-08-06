import crypto from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// InspiraSuite integration (Visio360PDS -> InspiraSuite LMS)
//
// One shared place for talking to the InspiraSuite API so the HTTP routes and
// the automatic gap-based assignment can reuse the exact same behaviour.
//
// Config comes from the `integration_settings` table (admin-managed) and falls
// back to env vars when the row is missing.
// ---------------------------------------------------------------------------

function getSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

export interface InspiraConfig {
  baseUrl: string
  apiKey: string
  webhookSecret: string
  isActive: boolean
  settings: Record<string, unknown>
  /** URL + key mevcut mu */
  configured: boolean
  /** configured && admin tarafından aktifleştirilmiş */
  enabled: boolean
}

let _cfgCache: { cfg: InspiraConfig; at: number } | null = null
const CFG_TTL_MS = 30_000

/** DB (integration_settings) + env fallback ile birleşik yapılandırma. */
export async function getInspiraConfig(force = false): Promise<InspiraConfig> {
  const now = Date.now()
  if (!force && _cfgCache && now - _cfgCache.at < CFG_TTL_MS) return _cfgCache.cfg

  let baseUrl = (process.env.INSPIRASUITE_BASE_URL || '').trim().replace(/\/$/, '')
  let apiKey = (process.env.INSPIRASUITE_API_KEY || '').trim()
  let webhookSecret = (process.env.INSPIRASUITE_WEBHOOK_SECRET || '').trim()
  // Env fallback: anahtar+URL varsa aktif say (DB satırı yoksa geriye dönük uyum)
  let isActive = Boolean(baseUrl && apiKey)
  let settings: Record<string, unknown> = {}

  const supabase = getSupabaseAdmin()
  if (supabase) {
    try {
      const { data } = await supabase
        .from('integration_settings')
        .select('base_url, api_key, webhook_secret, is_active, settings')
        .eq('platform', 'inspirasuite')
        .maybeSingle()
      if (data) {
        if ((data as any).base_url) baseUrl = String((data as any).base_url).trim().replace(/\/$/, '')
        if ((data as any).api_key) apiKey = String((data as any).api_key).trim()
        if ((data as any).webhook_secret) webhookSecret = String((data as any).webhook_secret).trim()
        isActive = Boolean((data as any).is_active)
        settings = ((data as any).settings as Record<string, unknown>) || {}
      }
    } catch {
      // tablo yoksa env değerleriyle devam
    }
  }

  const configured = Boolean(baseUrl && apiKey)
  const cfg: InspiraConfig = { baseUrl, apiKey, webhookSecret, isActive, settings, configured, enabled: configured && isActive }
  _cfgCache = { cfg, at: now }
  return cfg
}

/** Ayarlar değişince (kaydet/test) önbelleği düşür. */
export function clearInspiraConfigCache() {
  _cfgCache = null
}

/**
 * InspiraSuite'ten gelen (inbound) isteğin x-api-key başlığını doğrula.
 * Paylaşılan anahtar iki yönde de aynıdır (config.apiKey). Timing-safe karşılaştırma.
 */
export async function verifyInboundApiKey(headerValue: string | null | undefined): Promise<boolean> {
  const cfg = await getInspiraConfig()
  const key = cfg.apiKey
  const got = String(headerValue || '')
  if (!key || !got || got.length !== key.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key))
  } catch {
    return false
  }
}

async function inspiraFetch(path: string, init: RequestInit = {}) {
  const cfg = await getInspiraConfig()
  if (!cfg.configured) throw new Error('InspiraSuite yapılandırması eksik')
  const url = `${cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const headers: Record<string, string> = {
    'x-api-key': cfg.apiKey,
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...((init.headers as Record<string, string>) || {}),
  }
  // Fail fast instead of hanging forever if InspiraSuite is unreachable.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    return await fetch(url, { ...init, headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export interface InspiraCourse {
  id: string
  title: string
  price?: number | null
  is_free?: boolean
  currency?: string | null
  area?: string | null
  [key: string]: unknown
}

/** Published courses available in InspiraSuite. */
export async function listCourses(): Promise<InspiraCourse[]> {
  const res = await inspiraFetch('/api/integrations/courses/list', { method: 'GET' })
  if (!res.ok) throw new Error(`InspiraSuite kurs listesi alınamadı (${res.status})`)
  const data = await res.json().catch(() => null)
  // Upstream may return a bare array or { courses: [...] }.
  if (Array.isArray(data)) return data as InspiraCourse[]
  if (Array.isArray((data as any)?.courses)) return (data as any).courses as InspiraCourse[]
  return []
}

/** Best-matching course for a competency gap, or null if none. */
export async function matchCourse(input: { competency: string; gap_level: number }): Promise<InspiraCourse | null> {
  const res = await inspiraFetch('/api/integrations/courses/match', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  const course = (data as any)?.course ?? data
  return course && (course as any).id ? (course as InspiraCourse) : null
}

export interface AssignCourseInput {
  user_email: string
  course_id: string
  course_title: string
  assigned_by: string
  reason?: string
  due_date?: string
}

/** Assign a course to a user inside InspiraSuite. Throws on non-2xx. */
export async function assignCourse(input: AssignCourseInput) {
  const res = await inspiraFetch('/api/integrations/visio360pds/assign', {
    method: 'POST',
    body: JSON.stringify({ ...input, source: 'visio360pds' }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`InspiraSuite atama başarısız (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }
  return res.json().catch(() => ({}))
}

export interface InspiraProgressRow {
  course_id?: string
  course_title: string
  progress: number // 0..100
  status: string // e.g. 'in_progress' | 'completed'
  assigned_at?: string
  completed_at?: string | null
  [key: string]: unknown
}

/** A user's assigned-course progress as tracked by InspiraSuite. */
export async function getProgress(email: string): Promise<InspiraProgressRow[]> {
  const res = await inspiraFetch(`/api/integrations/visio360pds/progress?email=${encodeURIComponent(email)}`, {
    method: 'GET',
  })
  if (!res.ok) throw new Error(`InspiraSuite ilerleme alınamadı (${res.status})`)
  const data = await res.json().catch(() => null)
  if (Array.isArray(data)) return data as InspiraProgressRow[]
  if (Array.isArray((data as any)?.courses)) return (data as any).courses as InspiraProgressRow[]
  if (Array.isArray((data as any)?.progress)) return (data as any).progress as InspiraProgressRow[]
  return []
}

/** Resolve an evaluatee's email from their user id (KVKK: scoped to org when provided). */
export async function resolveUserEmail(
  supabase: SupabaseClient,
  userId: string,
  orgId?: string | null
): Promise<{ email: string; name: string; organization_id: string | null } | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id,name,email,organization_id')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data || !(data as any).email) return null
  if (orgId && String((data as any).organization_id || '') !== String(orgId)) return null
  return { email: (data as any).email, name: (data as any).name || '', organization_id: (data as any).organization_id ?? null }
}

/** Best-effort audit log. Never throws: logging must not break the primary action. */
export async function logIntegration(
  supabase: SupabaseClient | null,
  entry: {
    direction: 'outbound' | 'inbound'
    event_type: string
    user_email?: string | null
    organization_id?: string | null
    status?: 'success' | 'error'
    payload?: unknown
    error?: string | null
  }
) {
  if (!supabase) return
  try {
    await supabase.from('integration_logs').insert({
      platform: 'inspirasuite',
      direction: entry.direction,
      event_type: entry.event_type,
      user_email: entry.user_email ?? null,
      organization_id: entry.organization_id ?? null,
      status: entry.status ?? 'success',
      payload: entry.payload ?? null,
      error: entry.error ?? null,
    })
  } catch {
    // swallow — audit logging is best-effort
  }
}

export interface CompetencyGap {
  name: string
  score: number
  required_score: number
}

/**
 * Scenario: after an evaluation is scored, look for meaningful competency gaps
 * and auto-assign a matching InspiraSuite course for each one.
 *
 * Safe to call unconditionally: it no-ops when InspiraSuite is not configured.
 * Returns the courses that were assigned.
 */
export async function autoAssignForGaps(params: {
  supabase: SupabaseClient | null
  evaluatee: { email: string; organization_id?: string | null }
  competencies: CompetencyGap[]
  assignedBy?: string
  minGap?: number
}): Promise<Array<{ competency: string; course: InspiraCourse }>> {
  if (!(await getInspiraConfig()).enabled) return []
  const email = (params.evaluatee.email || '').trim()
  if (!email) return []

  const minGap = params.minGap ?? 0.5
  const assignedBy = params.assignedBy || 'Visio360PDS (Otomatik)'
  const gaps = (params.competencies || []).filter(
    (c) => Number.isFinite(c.score) && Number.isFinite(c.required_score) && c.required_score - c.score >= minGap
  )

  const assigned: Array<{ competency: string; course: InspiraCourse }> = []
  for (const gap of gaps) {
    try {
      const course = await matchCourse({ competency: gap.name, gap_level: gap.required_score - gap.score })
      if (!course) continue
      await assignCourse({
        user_email: email,
        course_id: String(course.id),
        course_title: course.title,
        assigned_by: assignedBy,
        reason: `${gap.name} yetkinlik açığı: ${gap.score}/${gap.required_score}`,
      })
      await logIntegration(params.supabase, {
        direction: 'outbound',
        event_type: 'course_assigned',
        user_email: email,
        organization_id: params.evaluatee.organization_id ?? null,
        payload: { course_id: course.id, course_title: course.title, reason: `${gap.name} açığı`, auto: true },
      })
      assigned.push({ competency: gap.name, course })
    } catch (err) {
      await logIntegration(params.supabase, {
        direction: 'outbound',
        event_type: 'course_assigned',
        user_email: email,
        organization_id: params.evaluatee.organization_id ?? null,
        status: 'error',
        payload: { competency: gap.name, auto: true },
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return assigned
}
