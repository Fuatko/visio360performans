import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

export async function GET() {
  const start = Date.now()
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json(
      { ok: false, route: '/api/health/db', error: 'Supabase yapılandırması eksik (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } }
    )
  }

  // Lightweight connectivity check (service role via PostgREST)
  try {
    const { error } = await supabase.from('organizations').select('id').limit(1)
    if (error) {
      return NextResponse.json(
        { ok: false, route: '/api/health/db', latency_ms: Date.now() - start, error: error.message || 'DB query failed' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } }
      )
    }
    return NextResponse.json(
      { ok: true, route: '/api/health/db', latency_ms: Date.now() - start },
      { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } }
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, route: '/api/health/db', latency_ms: Date.now() - start, error: String(e?.message || e) },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } }
    )
  }
}

