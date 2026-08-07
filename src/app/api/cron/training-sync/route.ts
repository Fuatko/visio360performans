import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncTrainingProgress } from '@/lib/server/inspirasuite'

export const runtime = 'nodejs'

function isAuthorized(req: NextRequest) {
  if (req.headers.get('x-vercel-cron')) return true
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) return false
  const bearer = (req.headers.get('authorization') || '').trim()
  if (bearer.toLowerCase().startsWith('bearer ') && bearer.slice(7).trim() === secret) return true
  if ((new URL(req.url).searchParams.get('secret') || '').trim() === secret) return true
  return false
}

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

// Gece: tüm kurumların training_assignments ilerlemesini InspiraSuite'ten toplu senkronla.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  try {
    // orgId olmadan → tüm atamalar (bulk uçtan tek çağrı, InspiraSuite pasifse no-op)
    const updated = await syncTrainingProgress(supabase, null)
    return NextResponse.json({ success: true, updated })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Senkron başarısız' },
      { status: 502 }
    )
  }
}
