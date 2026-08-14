import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { isPgEnabled } from '@/lib/db'
import { pgRead, pgReadOne } from '@/lib/server/pg-read'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'

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
  // OKUMA fallback: org-scope period→org doğrulaması (id=$1 birebir; maybeSingle karşılığı pgReadOne)
  const { data: period, error: pErr } = isPgEnabled()
    ? await pgReadOne<{ id: string; organization_id: string }>('select id, organization_id from evaluation_periods where id = $1 limit 1', [periodId])
    : await supabase.from('evaluation_periods').select('id, organization_id').eq('id', periodId).maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  const orgId = String((period as any).organization_id || '').trim()
  if (s.role === 'org_admin' && s.org_id && orgId && String(s.org_id) !== orgId) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  // Ensure snapshot table exists
  // OKUMA fallback: tablo varlık probe (relation kontrolü)
  try {
    const probe = isPgEnabled()
      ? await pgRead('select id from evaluation_period_user_report_snapshots limit 1')
      : await supabase.from('evaluation_period_user_report_snapshots').select('id').limit(1)
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
  // OKUMA fallback: org-scope period_id=$1 birebir
  const { data: targets, error: tErr } = isPgEnabled()
    ? await pgRead<any>('select target_id from evaluation_assignments where period_id = $1', [periodId])
    : await supabase.from('evaluation_assignments').select('target_id').eq('period_id', periodId)
  if (tErr) return NextResponse.json({ success: false, error: tErr.message || 'Atamalar alınamadı' }, { status: 400 })
  const targetIds = Array.from(new Set((targets || []).map((r: any) => String(r?.target_id || '')).filter(Boolean)))
  if (!targetIds.length) {
    return NextResponse.json({ success: true, period_id: periodId, counts: { targets: 0, snapshots: 0 } })
  }

  // OKUMA fallback: assignments embed (evaluator/target→users, evaluation_periods) jsonb_build_object ile.
  //   Alias'lar (evaluator/target/evaluation_periods) supabase ile birebir → payload shape değişmez.
  //   org-scope: period_id=$1 birebir + target_id = any($2). RLS gerekmez (parametreli açık WHERE).
  const fetchAssignments = async (part: string[]) => {
    if (isPgEnabled()) {
      return pgRead<any>(
        `select ea.id, ea.period_id, ea.evaluator_id, ea.target_id, ea.status, ea.slug, ea.token, ea.completed_at, ea.created_at,
                case when ev.id is not null then jsonb_build_object('id', ev.id, 'name', ev.name, 'position_level', ev.position_level) else null end as evaluator,
                case when tg.id is not null then jsonb_build_object('id', tg.id, 'name', tg.name, 'department', tg.department, 'title', tg.title, 'position_level', tg.position_level) else null end as target,
                case when ep.id is not null then jsonb_build_object('id', ep.id, 'name', ep.name, 'organization_id', ep.organization_id, 'results_released', ep.results_released) else null end as evaluation_periods
           from evaluation_assignments ea
           left join users ev on ev.id = ea.evaluator_id
           left join users tg on tg.id = ea.target_id
           left join evaluation_periods ep on ep.id = ea.period_id
           where ea.period_id = $1 and ea.target_id = any($2::uuid[])
           order by ea.created_at asc`,
        [periodId, part]
      )
    }
    return supabase
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
  }

  // OKUMA fallback: responses/standard_scores — assignment_id in(ids)
  const fetchResponses = async (assignmentIds: string[]) =>
    isPgEnabled()
      ? await pgRead<any>('select * from evaluation_responses where assignment_id = any($1::uuid[])', [assignmentIds])
      : await supabase.from('evaluation_responses').select('*').in('assignment_id', assignmentIds)
  const fetchStdScores = async (assignmentIds: string[]) =>
    isPgEnabled()
      ? await pgRead<any>('select * from international_standard_scores where assignment_id = any($1::uuid[])', [assignmentIds])
      : await supabase.from('international_standard_scores').select('*').in('assignment_id', assignmentIds)

  // Bir target-chunk'ının snapshot satırlarını üretir (okuma + payload build). Yazma DIŞARIDA.
  const buildRowsForChunk = async (
    part: string[]
  ): Promise<{ rows: any[]; error?: { where: 'asg' | 'resp'; msg: string } }> => {
    const { data: asg, error: aErr } = await fetchAssignments(part)
    if (aErr) return { rows: [], error: { where: 'asg', msg: (aErr as any).message || String(aErr) } }

    const assignmentIds = Array.from(new Set((asg || []).map((x: any) => String(x?.id || '')).filter(Boolean)))

    const { data: respRows, error: rErr } = assignmentIds.length ? await fetchResponses(assignmentIds) : { data: [], error: null as any }
    if (rErr) return { rows: [], error: { where: 'resp', msg: (rErr as any).message || String(rErr) } }

    // Optional tables (best-effort) — hata yut (std scores tablosu opsiyonel)
    const { data: stdRows } = assignmentIds.length ? await fetchStdScores(assignmentIds) : { data: [] as any[] }

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
    return { rows }
  }

  // YAZMA (hibrit): pg açıksa DELETE (overwrite) + tüm INSERT'ler AYNI withActor tx'inde → atomik rebuild.
  //   İKİ KATMAN: (1) yukarıdaki KVKK JS kontrolü (org_admin ≠ period.org → 403),
  //   (2) withActor RLS FORCE — org_admin başka org'un snapshot'ını silemez/yazamaz (DB seviyesi).
  //   DELETE WHERE supabase ile BİREBİR: period_id = $1 AND snapshot_type = $2 (başka period/type DEĞİL).
  //   payload jsonb → JSON.stringify + $N::jsonb. Okumalar memory-bounded: chunk başına pgRead (havuz).
  let written = 0
  if (isPgEnabled()) {
    const INS_COLS = ['period_id', 'target_id', 'organization_id', 'snapshot_type', 'payload', 'created_by']
    try {
      await withActor(buildActor(s), async (c) => {
        if (overwrite) {
          await c.query('delete from evaluation_period_user_report_snapshots where period_id = $1 and snapshot_type = $2', [periodId, snapshotType])
        }
        for (const part of chunk(targetIds, 50)) {
          const built = await buildRowsForChunk(part)
          if (built.error) throw new Error(built.error.msg)
          for (const insertPart of chunk(built.rows, 200)) {
            if (!insertPart.length) continue
            const params: unknown[] = []
            const tuples = insertPart.map((row) => {
              const ph = INS_COLS.map((col) => {
                params.push(col === 'payload' ? JSON.stringify(row.payload) : (row as any)[col] ?? null)
                return col === 'payload' ? `$${params.length}::jsonb` : `$${params.length}`
              })
              return `(${ph.join(',')})`
            })
            await c.query(`insert into evaluation_period_user_report_snapshots (${INS_COLS.join(', ')}) values ${tuples.join(',')}`, params)
            written += insertPart.length
          }
        }
      })
    } catch (e: any) {
      return NextResponse.json({ success: false, error: 'Snapshot yazılamadı', detail: e?.message || String(e) }, { status: 400 })
    }
    return NextResponse.json({ success: true, period_id: periodId, counts: { targets: targetIds.length, snapshots: written } })
  }

  // supabase yolu (AYNEN)
  if (overwrite) {
    const { error: dErr } = await supabase
      .from('evaluation_period_user_report_snapshots')
      .delete()
      .eq('period_id', periodId)
      .eq('snapshot_type', snapshotType as any)
    if (dErr) return NextResponse.json({ success: false, error: 'Mevcut snapshot temizlenemedi', detail: dErr.message || String(dErr) }, { status: 400 })
  }

  // Fetch raw data in chunks to keep memory bounded.
  for (const part of chunk(targetIds, 50)) {
    const built = await buildRowsForChunk(part)
    if (built.error) {
      const label = built.error.where === 'asg' ? 'Atamalar alınamadı' : 'Yanıtlar alınamadı'
      return NextResponse.json({ success: false, error: built.error.msg || label }, { status: 400 })
    }
    for (const insertPart of chunk(built.rows, 200)) {
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

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const periodId = String(url.searchParams.get('period_id') || '').trim()
  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  // KVKK defense: org_admin can only read their org's period snapshots
  // OKUMA fallback: org-scope period→org doğrulaması (id=$1 birebir)
  const { data: period, error: pErr } = isPgEnabled()
    ? await pgReadOne<{ id: string; organization_id: string }>('select id, organization_id from evaluation_periods where id = $1 limit 1', [periodId])
    : await supabase.from('evaluation_periods').select('id, organization_id').eq('id', periodId).maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  const orgId = String((period as any).organization_id || '').trim()
  if (s.role === 'org_admin' && s.org_id && orgId && String(s.org_id) !== orgId) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  // OKUMA fallback: org-scope period_id=$1 birebir, snapshotted_at desc
  const { data, error } = isPgEnabled()
    ? await pgRead<any>('select snapshot_type, snapshotted_at, target_id from evaluation_period_user_report_snapshots where period_id = $1 order by snapshotted_at desc', [periodId])
    : await supabase
        .from('evaluation_period_user_report_snapshots')
        .select('snapshot_type, snapshotted_at, target_id')
        .eq('period_id', periodId)
        .order('snapshotted_at', { ascending: false })

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Yedekler okunamadı',
        detail: error.message || String(error),
        hint: 'Supabase SQL Editor’da sql/period-reports-backup-snapshot.sql dosyasını çalıştırdığınızdan emin olun.',
      },
      { status: 400 }
    )
  }

  const rows = (data || []) as any[]
  const byType: Record<string, { count: number; last_at: string | null }> = {}
  rows.forEach((r) => {
    const t = String(r.snapshot_type || 'raw')
    const cur = byType[t] || { count: 0, last_at: null as string | null }
    cur.count += 1
    if (!cur.last_at && r.snapshotted_at) cur.last_at = String(r.snapshotted_at)
    byType[t] = cur
  })

  return NextResponse.json({
    success: true,
    period_id: periodId,
    total: rows.length,
    byType,
  })
}

