import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { resolveBackend, buildActor } from '@/lib/server/admin-db'
import { withActor, type Actor } from '@/lib/server/secure-query'

export const runtime = 'nodejs'

// =====================================================================
// /api/admin/organizations (POST kaydet / DELETE sil)
// Faz 1 (pg göçü / Yol B): getSupabaseAdmin() → merkezi resolveBackend().
//   PG_DATABASE_URL YOK → Supabase yolu AYNEN (deploy güvenli).
// GÜVENLİK (her iki yolda AYNI):
//   - 401 guard; org-scope: org_admin sadece KENDİ kurumunu günceller (id === org_id)
//   - kurum OLUŞTURMA / SİLME sadece super_admin
//   - settings merge (mevcut ayarların üstüne)
// =====================================================================

type SaveBody = {
  id?: string
  name?: string
  logo_base64?: string | null
  settings?: { matrix_profile?: 'school_full' | 'standard_360' }
}
type DeleteBody = { id?: string }

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:organizations:post', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const backend = resolveBackend()
  if (!backend) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as SaveBody
  const id = body.id ? String(body.id) : null
  const name = (body.name || '').toString().trim()
  const logo_base64 = typeof body.logo_base64 === 'string' ? body.logo_base64 : null

  // ---- pg yolu ----
  if (backend.mode === 'pg') {
    try {
      return await organizationsPostPg(buildActor(s), body, id, name, logo_base64)
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Kayıt hatası' }, { status: 400 })
    }
  }

  // ---- Supabase yolu (MEVCUT — değiştirilmedi) ----
  const supabase = backend.supabase

  if (id) {
    if (s.role === 'org_admin') {
      if (!s.org_id || String(s.org_id) !== id) return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
    }
    const update: Record<string, unknown> = {}
    if (name) update.name = name
    if (body.logo_base64 !== undefined) update.logo_base64 = logo_base64
    if (body.settings !== undefined) {
      const { data: cur } = await supabase.from('organizations').select('settings').eq('id', id).maybeSingle()
      const prev =
        cur?.settings && typeof cur.settings === 'object' && !Array.isArray(cur.settings)
          ? (cur.settings as Record<string, unknown>)
          : {}
      update.settings = { ...prev, ...body.settings }
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ success: false, error: 'Değişiklik yok' }, { status: 400 })
    const { error } = await supabase.from('organizations').update(update).eq('id', id)
    if (error) return NextResponse.json({ success: false, error: error.message || 'Güncelleme hatası' }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  // Create org only for super_admin (UI already disables, but keep API safe)
  if (s.role !== 'super_admin') return NextResponse.json({ success: false, error: 'KVKK: kurum oluşturulamaz' }, { status: 403 })
  if (!name) return NextResponse.json({ success: false, error: 'Kurum adı zorunlu' }, { status: 400 })
  const createSettings =
    body.settings && typeof body.settings === 'object'
      ? body.settings
      : { matrix_profile: 'school_full' as const }
  const { data: created, error } = await supabase
    .from('organizations')
    .insert({ name, logo_base64, settings: createSettings })
    .select('id,name,settings')
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message || 'Ekleme hatası' }, { status: 400 })
  return NextResponse.json({ success: true, org: created })
}

export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || s.role !== 'super_admin') {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:organizations:delete', String(s.uid || ''), 10, 60 * 1000)
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
      return await organizationsDeletePg(buildActor(s), id)
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Silme hatası' }, { status: 400 })
    }
  }

  // ---- Supabase yolu (MEVCUT — değiştirilmedi) ----
  const supabase = backend.supabase

  const { error } = await supabase.from('organizations').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message || 'Silme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

// =====================================================================
// pg yolu (yeni Türkiye DB) — withActor + parametreli SQL.
// organizations tablosunun organization_id'si yok → org-scope EXPLICIT (id === org_id).
// settings jsonb: $n::jsonb cast + app tarafında merge (mevcut davranış birebir).
// Yalnızca PG_DATABASE_URL set iken çalışır → prod'da DEVREDE DEĞİL.
// =====================================================================
async function organizationsPostPg(
  actor: Actor,
  body: SaveBody,
  id: string | null,
  name: string,
  logo_base64: string | null
): Promise<NextResponse> {
  if (id) {
    // org-scope: org_admin yalnızca kendi kurumunu günceller
    if (actor.role === 'org_admin' && (!actor.orgId || actor.orgId !== id)) {
      return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
    }
    return await withActor(actor, async (c) => {
      const sets: string[] = []
      const params: unknown[] = []
      let i = 1
      if (name) {
        sets.push(`name = $${i++}`)
        params.push(name)
      }
      if (body.logo_base64 !== undefined) {
        sets.push(`logo_base64 = $${i++}`)
        params.push(logo_base64)
      }
      if (body.settings !== undefined) {
        const cur = await c.query('select settings from organizations where id = $1 limit 1', [id])
        const prevRaw = (cur.rows[0] as { settings?: unknown } | undefined)?.settings
        const prev = prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw) ? (prevRaw as Record<string, unknown>) : {}
        const merged = { ...prev, ...body.settings }
        sets.push(`settings = $${i++}::jsonb`)
        params.push(JSON.stringify(merged))
      }
      if (sets.length === 0) return NextResponse.json({ success: false, error: 'Değişiklik yok' }, { status: 400 })
      params.push(id)
      await c.query(`update organizations set ${sets.join(', ')} where id = $${i}`, params)
      return NextResponse.json({ success: true })
    })
  }

  // Create — sadece super_admin
  if (actor.role !== 'super_admin') return NextResponse.json({ success: false, error: 'KVKK: kurum oluşturulamaz' }, { status: 403 })
  if (!name) return NextResponse.json({ success: false, error: 'Kurum adı zorunlu' }, { status: 400 })
  const createSettings = body.settings && typeof body.settings === 'object' ? body.settings : { matrix_profile: 'school_full' as const }
  return await withActor(actor, async (c) => {
    const created = await c.query(
      'insert into organizations (name, logo_base64, settings) values ($1, $2, $3::jsonb) returning id, name, settings',
      [name, logo_base64, JSON.stringify(createSettings)]
    )
    return NextResponse.json({ success: true, org: created.rows[0] })
  })
}

async function organizationsDeletePg(actor: Actor, id: string): Promise<NextResponse> {
  // DELETE handler zaten super_admin guard'ı uyguluyor.
  return await withActor(actor, async (c) => {
    await c.query('delete from organizations where id = $1', [id])
    return NextResponse.json({ success: true })
  })
}
