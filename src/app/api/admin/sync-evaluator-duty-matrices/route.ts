import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { syncDutyMatrixAssignmentsFromGenel } from '@/lib/server/sync-evaluator-duty-matrix-assignments'
import type { MatrixDutyPreset } from '@/lib/matrix-target-duty-assign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_PRESETS: MatrixDutyPreset[] = ['zumre', 'rehberlik_ogretmeni', 'yasam_koordinatoru']

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

/** Genel atama + hedef görevi → eksik zümre / rehberlik / yaşam koordinatörü matris satırları */
export async function POST(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:sync-evaluator-duty-matrices', String(s.uid || ''), 15, 60_000)
  if (rl.blocked) {
    return NextResponse.json({ success: false, error: 'Çok fazla istek' }, { status: 429 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  let body: {
    period_id?: string
    evaluator_id?: string
    evaluator_name?: string
    presets?: string[]
    dry_run?: boolean
    period_wide?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Geçersiz JSON' }, { status: 400 })
  }

  const periodId = String(body.period_id || '').trim()
  const dryRun = Boolean(body.dry_run)
  const periodWide = Boolean(body.period_wide)

  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  const { data: period } = await supabase.from('evaluation_periods').select('organization_id').eq('id', periodId).single()
  if (!period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String((period as { organization_id?: string }).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  let evId = String(body.evaluator_id || '').trim()
  if (!evId && !periodWide && body.evaluator_name) {
    const needle = String(body.evaluator_name).toLowerCase()
    const { data: users } = await supabase.from('users').select('id, name')
    const hit = (users || []).find((u: { name?: string }) => {
      const n = String(u.name || '').toLowerCase()
      return n.includes('paul') && n.includes('georg')
    }) as { id: string } | undefined
    if (needle.includes('paul')) evId = hit?.id || ''
  }

  if (!periodWide && !evId) {
    return NextResponse.json(
      { success: false, error: 'evaluator_id gerekli veya period_wide: true kullanın' },
      { status: 400 }
    )
  }

  const presets = (Array.isArray(body.presets) ? body.presets : ALLOWED_PRESETS).filter((p): p is MatrixDutyPreset =>
    ALLOWED_PRESETS.includes(p as MatrixDutyPreset)
  )

  const result = await syncDutyMatrixAssignmentsFromGenel(supabase, periodId, {
    evaluatorId: periodWide ? undefined : evId,
    presets: presets.length ? presets : ALLOWED_PRESETS,
    dryRun,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  const byContext = result.pairs.reduce<Record<string, number>>((acc, p) => {
    acc[p.matrix_context] = (acc[p.matrix_context] || 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    success: true,
    dry_run: dryRun,
    evaluator_id: result.evaluator_id,
    period_wide: periodWide,
    inserted: result.inserted,
    by_context: byContext,
    sample: result.pairs.slice(0, 20),
    message: dryRun
      ? `${result.pairs.length} yeni matris satırı eklenecek (önizleme)`
      : `${result.inserted} görev matrisi ataması eklendi`,
  })
}
