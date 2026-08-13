import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { resolveBackend, buildActor } from '@/lib/server/admin-db'
import { withActor, type Actor } from '@/lib/server/secure-query'

export const runtime = 'nodejs'

// =====================================================================
// /api/admin/periods (GET/POST/DELETE) — evaluation_periods (org-scoped)
// Faz 1 (pg göçü / Yol B): getSupabaseAdmin() → merkezi resolveBackend().
//   PG_DATABASE_URL YOK → Supabase yolu AYNEN (deploy güvenli).
// GÜVENLİK (her iki yolda AYNI, C2b):
//   - 401 guard; org-scope: org_admin → kendi kurumu, super_admin → org_id param
//   - POST/DELETE: dönemin org'a ait olduğu doğrulanır (KVKK)
//   - assessment_kind değişimi: atama başlamışsa 409 (değiştirilemez)
// =====================================================================

type SaveBody = {
  id?: string
  name?: string
  name_en?: string | null
  name_fr?: string | null
  organization_id?: string
  start_date?: string
  end_date?: string
  status?: 'active' | 'inactive' | 'completed' | string
  results_released?: boolean
  assessment_kind?: 'development_360' | 'job_evaluation' | 'other' | string
}

type DeleteBody = { id?: string }

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

// GET — dönem listesi (org-scoped). status opsiyonel filtre (questions → active).
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:periods:get', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const backend = resolveBackend()
  if (!backend) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  // ---- pg yolu ----
  if (backend.mode === 'pg') {
    const url = new URL(req.url)
    const orgId = s.role === 'org_admin' ? String(s.org_id || '') : String(url.searchParams.get('org_id') || '').trim()
    if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })
    const status = String(url.searchParams.get('status') || '').trim()
    try {
      return await periodsGetPg(buildActor(s), orgId, status)
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Dönemler alınamadı' }, { status: 400 })
    }
  }

  // ---- Supabase yolu (MEVCUT — değiştirilmedi) ----
  const supabase = backend.supabase

  // KVKK org-scope: org_admin → yalnızca kendi kurumu; super_admin → org_id parametresi
  const url = new URL(req.url)
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : String(url.searchParams.get('org_id') || '').trim()
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  let query = supabase
    .from('evaluation_periods')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  // Opsiyonel status filtresi (ör. questions sayfası ?status=active ister)
  const status = String(url.searchParams.get('status') || '').trim()
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, error: error.message || 'Dönemler alınamadı' }, { status: 400 })

  return NextResponse.json({ success: true, periods: data || [] })
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:periods:post', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const backend = resolveBackend()
  if (!backend) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as SaveBody

  // ---- pg yolu ----
  if (backend.mode === 'pg') {
    try {
      return await periodsPostPg(buildActor(s), body)
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Kayıt hatası' }, { status: 400 })
    }
  }

  // ---- Supabase yolu (MEVCUT — değiştirilmedi) ----
  const supabase = backend.supabase

  const id = body.id ? String(body.id) : null

  const name = String(body.name || '').trim()
  const name_en = typeof body.name_en === 'string' ? body.name_en.trim() : null
  const name_fr = typeof body.name_fr === 'string' ? body.name_fr.trim() : null
  const organization_id = String(body.organization_id || '').trim()
  const start_date = String(body.start_date || '').trim()
  const end_date = String(body.end_date || '').trim()
  const status = (body.status || 'active') as any
  const results_released = typeof body.results_released === 'boolean' ? body.results_released : undefined
  const assessmentKindRaw = String(body.assessment_kind || 'development_360').trim()
  const assessment_kind = ['development_360', 'job_evaluation', 'other'].includes(assessmentKindRaw)
    ? assessmentKindRaw
    : 'development_360'

  if (!name || !organization_id || !start_date || !end_date) {
    return NextResponse.json({ success: false, error: 'Eksik alan' }, { status: 400 })
  }

  if (s.role === 'org_admin' && s.org_id && String(s.org_id) !== organization_id) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  if (id) {
    // Ensure period belongs to org
    const { data: existing, error: eErr } = await supabase
      .from('evaluation_periods')
      .select('id, organization_id, assessment_kind')
      .eq('id', id)
      .single()
    if (eErr || !existing) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
    if (String((existing as any).organization_id) !== organization_id) {
      return NextResponse.json({ success: false, error: 'Dönem/kurum uyuşmuyor' }, { status: 400 })
    }

    const existingKind = String((existing as any).assessment_kind || 'development_360')
    if (assessment_kind !== existingKind) {
      const { count, error: cErr } = await supabase
        .from('evaluation_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('period_id', id)
      if (cErr) return NextResponse.json({ success: false, error: cErr.message || 'Atamalar kontrol edilemedi' }, { status: 400 })
      if ((count || 0) > 0) {
        return NextResponse.json(
          { success: false, error: 'Bu dönemde atama başladığı için değerlendirme türü değiştirilemez.' },
          { status: 409 }
        )
      }
    }

    const updatePayload: Record<string, unknown> = { name, name_en, name_fr, organization_id, start_date, end_date, status, assessment_kind }
    if (results_released !== undefined) updatePayload.results_released = results_released
    const { error } = await supabase
      .from('evaluation_periods')
      .update(updatePayload)
      .eq('id', id)
    if (error) return NextResponse.json({ success: false, error: error.message || 'Güncelleme hatası' }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  const insertPayload: Record<string, unknown> = { name, name_en, name_fr, organization_id, start_date, end_date, status, assessment_kind }
  if (results_released !== undefined) insertPayload.results_released = results_released
  const { error } = await supabase.from('evaluation_periods').insert(insertPayload)
  if (error) return NextResponse.json({ success: false, error: error.message || 'Ekleme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:periods:delete', String(s.uid || ''), 10, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const backend = resolveBackend()
  if (!backend) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as DeleteBody
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  // ---- pg yolu ----
  if (backend.mode === 'pg') {
    try {
      return await periodsDeletePg(buildActor(s), id)
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Silme hatası' }, { status: 400 })
    }
  }

  // ---- Supabase yolu (MEVCUT — değiştirilmedi) ----
  const supabase = backend.supabase

  const { data: existing, error: eErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', id)
    .single()
  if (eErr || !existing) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String((existing as any).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  const { error } = await supabase.from('evaluation_periods').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message || 'Silme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

// =====================================================================
// pg yolu (yeni Türkiye DB) — withActor + parametreli SQL. evaluation_periods
// org_id'li → org-scope EXPLICIT (WHERE organization_id=$1) + RLS bağlamı.
// Kolon adları sabit whitelist (kullanıcı girdisi değil) → injection yok.
// Yalnızca PG_DATABASE_URL set iken çalışır → prod'da DEVREDE DEĞİL.
// =====================================================================

async function periodsGetPg(actor: Actor, orgId: string, status: string): Promise<NextResponse> {
  return await withActor(actor, async (c) => {
    const params: unknown[] = [orgId]
    let sql = 'select * from evaluation_periods where organization_id = $1'
    if (status) {
      params.push(status)
      sql += ' and status = $2'
    }
    sql += ' order by created_at desc'
    const r = await c.query(sql, params)
    return NextResponse.json({ success: true, periods: r.rows })
  })
}

async function periodsPostPg(actor: Actor, body: SaveBody): Promise<NextResponse> {
  const id = body.id ? String(body.id) : null
  const name = String(body.name || '').trim()
  const name_en = typeof body.name_en === 'string' ? body.name_en.trim() : null
  const name_fr = typeof body.name_fr === 'string' ? body.name_fr.trim() : null
  const organization_id = String(body.organization_id || '').trim()
  const start_date = String(body.start_date || '').trim()
  const end_date = String(body.end_date || '').trim()
  const status = (body.status || 'active') as string
  const results_released = typeof body.results_released === 'boolean' ? body.results_released : undefined
  const assessmentKindRaw = String(body.assessment_kind || 'development_360').trim()
  const assessment_kind = ['development_360', 'job_evaluation', 'other'].includes(assessmentKindRaw) ? assessmentKindRaw : 'development_360'

  if (!name || !organization_id || !start_date || !end_date) {
    return NextResponse.json({ success: false, error: 'Eksik alan' }, { status: 400 })
  }
  if (actor.role === 'org_admin' && actor.orgId && actor.orgId !== organization_id) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  return await withActor(actor, async (c) => {
    // Ortak kolon/değer listesi (sabit whitelist)
    const cols = ['name', 'name_en', 'name_fr', 'organization_id', 'start_date', 'end_date', 'status', 'assessment_kind']
    const vals: unknown[] = [name, name_en, name_fr, organization_id, start_date, end_date, status, assessment_kind]
    if (results_released !== undefined) {
      cols.push('results_released')
      vals.push(results_released)
    }

    if (id) {
      const existing = await c.query('select id, organization_id, assessment_kind from evaluation_periods where id = $1 limit 1', [id])
      if (existing.rows.length === 0) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
      const row = existing.rows[0] as { organization_id?: unknown; assessment_kind?: unknown }
      if (String(row.organization_id) !== organization_id) {
        return NextResponse.json({ success: false, error: 'Dönem/kurum uyuşmuyor' }, { status: 400 })
      }
      const existingKind = String(row.assessment_kind || 'development_360')
      if (assessment_kind !== existingKind) {
        const cnt = await c.query('select count(*)::int as n from evaluation_assignments where period_id = $1', [id])
        if (Number((cnt.rows[0] as { n?: number })?.n || 0) > 0) {
          return NextResponse.json(
            { success: false, error: 'Bu dönemde atama başladığı için değerlendirme türü değiştirilemez.' },
            { status: 409 }
          )
        }
      }
      const setClause = cols.map((col, idx) => `${col} = $${idx + 1}`).join(', ')
      const updVals = [...vals, id]
      await c.query(`update evaluation_periods set ${setClause} where id = $${updVals.length}`, updVals)
      return NextResponse.json({ success: true })
    }

    const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ')
    await c.query(`insert into evaluation_periods (${cols.join(', ')}) values (${placeholders})`, vals)
    return NextResponse.json({ success: true })
  })
}

async function periodsDeletePg(actor: Actor, id: string): Promise<NextResponse> {
  return await withActor(actor, async (c) => {
    const existing = await c.query('select id, organization_id from evaluation_periods where id = $1 limit 1', [id])
    if (existing.rows.length === 0) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
    const row = existing.rows[0] as { organization_id?: unknown }
    if (actor.role === 'org_admin' && actor.orgId && String(row.organization_id) !== actor.orgId) {
      return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
    }
    await c.query('delete from evaluation_periods where id = $1', [id])
    return NextResponse.json({ success: true })
  })
}
