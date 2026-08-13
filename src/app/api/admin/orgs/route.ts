import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { resolveBackend, buildActor } from '@/lib/server/admin-db'
import { withActor, type Actor } from '@/lib/server/secure-query'

export const runtime = 'nodejs'

// =====================================================================
// /api/admin/orgs (GET) — org listesi (switcher + admin/organizations)
// Faz 1 (pg göçü / Yol B): getSupabaseAdmin() → merkezi resolveBackend().
//   PG_DATABASE_URL YOK → Supabase yolu AYNEN (deploy güvenli).
// GÜVENLİK (her iki yolda AYNI):
//   - 401 guard (session yok / rol dışı → reddet)
//   - org-scope: org_admin → SADECE kendi kurumu; super_admin → tümü
//   - ?basic=1 → hafif mod (id,name; switcher, logo taşımadan)
//   - default → id,name,logo_base64,settings,created_at + org-başı user_count
// =====================================================================

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:orgs:get', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const backend = resolveBackend()
  if (!backend) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  // ---- pg yolu ----
  if (backend.mode === 'pg') {
    const actor = buildActor(s)
    // org-scope guard: org_admin org_id'siz erişemez (KVKK) — Supabase yoluyla aynı
    if (actor.role === 'org_admin' && !actor.orgId) {
      return NextResponse.json({ success: false, error: 'KVKK: org_id eksik' }, { status: 403 })
    }
    const basic = new URL(req.url).searchParams.get('basic') === '1'
    try {
      return await orgsGetPg(actor, basic)
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Kurumlar okunamadı' }, { status: 400 })
    }
  }

  // ---- Supabase yolu (MEVCUT — değiştirilmedi) ----
  const supabase = backend.supabase

  // basic=1 → yalnızca id,name (yüksek frekanslı dropdown/switcher; ağır logo taşınmaz).
  // default → düzenleme için gereken kolonlar + org-başına kullanıcı sayısı.
  const basic = new URL(req.url).searchParams.get('basic') === '1'
  const selectCols = basic ? 'id,name' : 'id,name,logo_base64,settings,created_at'

  // Org listesi (org_admin → yalnızca kendi kurumu; super_admin → tümü)
  let orgs: any[] = []
  if (s.role === 'org_admin') {
    const orgId = String(s.org_id || '').trim()
    if (!orgId) return NextResponse.json({ success: false, error: 'KVKK: org_id eksik' }, { status: 403 })
    const { data, error } = await supabase.from('organizations').select(selectCols).eq('id', orgId).limit(1)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    orgs = data || []
  } else {
    const { data, error } = await supabase.from('organizations').select(selectCols).order('name')
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    orgs = data || []
  }

  // Org-başına kullanıcı sayısı (basic modda atlanır). Tek sorgu + bellekte grupla (N+1 yok).
  if (!basic && orgs.length > 0) {
    const orgIds = orgs.map((o) => String(o.id))
    const { data: urows } = await supabase.from('users').select('organization_id').in('organization_id', orgIds)
    const counts = new Map<string, number>()
    for (const u of (urows || []) as any[]) {
      const oid = String(u.organization_id || '')
      if (oid) counts.set(oid, (counts.get(oid) || 0) + 1)
    }
    orgs = orgs.map((o) => ({ ...o, user_count: counts.get(String(o.id)) || 0 }))
  }

  return NextResponse.json({ success: true, organizations: orgs })
}

// =====================================================================
// pg yolu (yeni Türkiye DB) — withActor + parametreli SQL.
// organizations tablosunun kendi organization_id'si YOK (kendisi kurum) →
// org-scope EXPLICIT: org_admin → WHERE id=$1. users sayımı org_id'li (RLS de kapsar).
// Kolon listesi sabit whitelist (kullanıcı girdisi değil) → injection yok.
// Yalnızca PG_DATABASE_URL set iken çalışır → prod'da DEVREDE DEĞİL.
// =====================================================================
async function orgsGetPg(actor: Actor, basic: boolean): Promise<NextResponse> {
  const cols = basic ? 'id, name' : 'id, name, logo_base64, settings, created_at'
  return await withActor(actor, async (c) => {
    let orgs: Array<Record<string, unknown>>
    if (actor.role === 'org_admin') {
      const r = await c.query(`select ${cols} from organizations where id = $1 limit 1`, [actor.orgId])
      orgs = r.rows as Array<Record<string, unknown>>
    } else {
      const r = await c.query(`select ${cols} from organizations order by name`)
      orgs = r.rows as Array<Record<string, unknown>>
    }

    if (!basic && orgs.length > 0) {
      const orgIds = orgs.map((o) => String(o.id))
      const urows = await c.query('select organization_id from users where organization_id = any($1::uuid[])', [orgIds])
      const counts = new Map<string, number>()
      for (const u of urows.rows as Array<{ organization_id?: unknown }>) {
        const oid = String(u.organization_id || '')
        if (oid) counts.set(oid, (counts.get(oid) || 0) + 1)
      }
      orgs = orgs.map((o) => ({ ...o, user_count: counts.get(String(o.id)) || 0 }))
    }

    return NextResponse.json({ success: true, organizations: orgs })
  })
}
