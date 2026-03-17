import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

type Body = { period_id?: string; overwrite?: boolean; snapshot_type?: 'raw' | 'results' | 'development' }

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

function isMissingRelation(err: any) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return code === '42P01' || msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('relation')
}

function chunk<T>(arr: T[], size = 200) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:period-reports-snapshot:post', String(s.uid || ''), 5, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const periodId = String(body.period_id || '').trim()
  const overwrite = body.overwrite !== false
  const snapshotType = (body.snapshot_type || 'raw') as Body['snapshot_type']
  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  // KVKK defense: org_admin can only snapshot their org's period
  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  const orgId = String((period as any).organization_id || '').trim()
  if (s.role === 'org_admin' && s.org_id && orgId && String(s.org_id) !== orgId) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  // Ensure snapshot table exists
  try {
    const probe = await supabase.from('evaluation_period_user_report_snapshots').select('id').limit(1)
    if (probe.error && isMissingRelation(probe.error)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Snapshot tablosu bulunamadı',
          hint: 'Supabase SQL Editor’da sql/period-reports-backup-snapshot.sql dosyasını çalıştırın.',
          detail: probe.error.message || String(probe.error),
        },
        { status: 400 }
      )
    }
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'Snapshot tablosu kontrol edilemedi',
        hint: 'Supabase SQL Editor’da sql/period-reports-backup-snapshot.sql dosyasını çalıştırın.',
        detail: e?.message || String(e),
      },
      { status: 400 }
    )
  }

  // Identify all targets in this period (including those with no completed rows yet)
  const { data: targets, error: tErr } = await supabase
    .from('evaluation_assignments')
    .select('target_id')
    .eq('period_id', periodId)
  if (tErr) return NextResponse.json({ success: false, error: tErr.message || 'Atamalar alınamadı' }, { status: 400 })
  const targetIds = Array.from(new Set((targets || []).map((r: any) => String(r?.target_id || '')).filter(Boolean)))
  if (!targetIds.length) {
    return NextResponse.json({ success: true, period_id: periodId, counts: { targets: 0, snapshots: 0 } })
  }

  if (overwrite) {
    const { error: dErr } = await supabase
      .from('evaluation_period_user_report_snapshots')
      .delete()
      .eq('period_id', periodId)
      .eq('snapshot_type', snapshotType as any)
    if (dErr) return NextResponse.json({ success: false, error: 'Mevcut snapshot temizlenemedi', detail: dErr.message || String(dErr) }, { status: 400 })
  }

  // Fetch raw data in chunks to keep memory bounded.
  // Payload includes enough data to re-generate "karneler" later even if scoring rules change.
  let written = 0
  for (const part of chunk(targetIds, 50)) {
    const { data: asg, error: aErr } = await supabase
      .from('evaluation_assignments')
      .select(
        `
          id, period_id, evaluator_id, target_id, status, slug, token, completed_at, created_at,
          evaluator:evaluator_id(id, name, position_level),
          target:target_id(id, name, department, title, position_level),
          evaluation_periods:period_id(id, name, organization_id, results_released)
        `
      )
      .eq('period_id', periodId)
      .in('target_id', part)
      .order('created_at', { ascending: true })
    if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atamalar alınamadı' }, { status: 400 })

    const assignmentIds = Array.from(new Set((asg || []).map((x: any) => String(x?.id || '')).filter(Boolean)))

    const { data: respRows, error: rErr } = assignmentIds.length
      ? await supabase.from('evaluation_responses').select('*').in('assignment_id', assignmentIds)
      : { data: [], error: null as any }
    if (rErr) return NextResponse.json({ success: false, error: rErr.message || 'Yanıtlar alınamadı' }, { status: 400 })

    // Optional tables (best-effort)
    const { data: stdRows } = assignmentIds.length
      ? await supabase.from('international_standard_scores').select('*').in('assignment_id', assignmentIds)
      : { data: [] as any[] }

    // Build per-target payload
    const byTarget = new Map<string, any>()
    ;(asg || []).forEach((a: any) => {
      const tid = String(a?.target_id || '')
      if (!tid) return
      const cur = byTarget.get(tid) || {
        period_id: periodId,
        target_id: tid,
        organization_id: orgId || null,
        assignments: [] as any[],
        responses: [] as any[],
        standard_scores: [] as any[],
        meta: { generated_at: new Date().toISOString(), app: 'visio360performans' },
      }
      cur.assignments.push(a)
      byTarget.set(tid, cur)
    })
    ;(respRows || []).forEach((r: any) => {
      const aid = String(r?.assignment_id || '')
      if (!aid) return
      const a = (asg || []).find((x: any) => String(x?.id || '') === aid)
      const tid = String(a?.target_id || '')
      if (!tid) return
      const cur = byTarget.get(tid)
      if (cur) cur.responses.push(r)
    })
    ;((stdRows || []) as any[]).forEach((r: any) => {
      const aid = String(r?.assignment_id || '')
      if (!aid) return
      const a = (asg || []).find((x: any) => String(x?.id || '') === aid)
      const tid = String(a?.target_id || '')
      if (!tid) return
      const cur = byTarget.get(tid)
      if (cur) cur.standard_scores.push(r)
    })

    const rows = Array.from(byTarget.values()).map((p) => ({
      period_id: periodId,
      target_id: p.target_id,
      organization_id: p.organization_id,
      snapshot_type: snapshotType,
      payload: p,
      created_by: s.uid || null,
    }))

    for (const insertPart of chunk(rows, 200)) {
      const { error: iErr } = await supabase.from('evaluation_period_user_report_snapshots').insert(insertPart as any)
      if (iErr) {
        return NextResponse.json(
          {
            success: false,
            error: 'Snapshot yazılamadı',
            detail: iErr.message || String(iErr),
          },
          { status: 400 }
        )
      }
      written += insertPart.length
    }
  }

  return NextResponse.json({
    success: true,
    period_id: periodId,
    counts: { targets: targetIds.length, snapshots: written },
  })
}

