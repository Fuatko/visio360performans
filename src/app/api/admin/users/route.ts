import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isPgEnabled } from '@/lib/db'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

type SaveBody = {
  id?: string
  name?: string
  email?: string
  phone?: string | null
  organization_id?: string | null
  title?: string | null
  department?: string | null
  manager_id?: string | null
  position_level?: string
  role?: string
  status?: string
  preferred_language?: string
}

type DeleteBody = { id?: string }

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl.replace(/\/$/, ''), service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

/**
 * users.email üzerindeki unique ihlalini constraint ADINDAN BAĞIMSIZ yakalar.
 * DB'de email için iki unique index var: `users_email_key` (UNIQUE constraint) ve
 * `idx_users_email` (partial). PG hangisini raporlarsa raporlasın 409'a çeviririz.
 * (Eskiden yalnız `idx_users_email` aranıyordu → users_email_key kaçıyordu.)
 */
function isEmailUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err || err.code !== '23505') return false
  const m = String(err.message || '').toLowerCase()
  return m.includes('users_email_key') || m.includes('idx_users_email') || m.includes('email')
}

// GET — kullanıcı listesi (org-scoped). KOLON WHITELIST + embed YOK → hafif (Y10 fix).
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:users:get', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  // KVKK org-scope: org_admin → yalnızca kendi kurumu; super_admin → org_id parametresi
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : String(new URL(req.url).searchParams.get('org_id') || '').trim()
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  // Kolon whitelist (Y10 fix) — ağır kolon / embed yok. org-scope: organization_id = orgId.
  const cols = 'id,name,email,phone,organization_id,title,department,manager_id,position_level,role,status,preferred_language,created_at'
  const { data, error } = isPgEnabled()
    ? await withActor(buildActor(s), (c) => c.query(`select ${cols} from users where organization_id = $1 order by name`, [orgId]))
        .then((r) => ({ data: r.rows as any[], error: null as any }))
        .catch((e) => ({ data: [] as any[], error: e }))
    : await supabase.from('users').select(cols).eq('organization_id', orgId).order('name')
  if (error) return NextResponse.json({ success: false, error: error.message || 'Kullanıcılar alınamadı' }, { status: 400 })

  return NextResponse.json({ success: true, users: data || [] })
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:users:post', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as SaveBody
  const id = body.id ? String(body.id) : null

  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  if (!name || !email) return NextResponse.json({ success: false, error: 'Ad ve email zorunlu' }, { status: 400 })

  const requestedOrg = body.organization_id ? String(body.organization_id) : null
  const orgId = s.role === 'org_admin' ? (s.org_id ? String(s.org_id) : null) : requestedOrg
  if (s.role === 'org_admin' && !orgId) return NextResponse.json({ success: false, error: 'Kurum bulunamadı' }, { status: 400 })
  if (!id && !orgId) {
    return NextResponse.json({ success: false, error: 'Kurum seçimi zorunlu — kullanıcı bu kuruma bağlanamaz' }, { status: 400 })
  }

  const role = String(body.role || 'user')
  if (s.role === 'org_admin' && role === 'super_admin') {
    return NextResponse.json({ success: false, error: 'KVKK: super_admin atanamaz' }, { status: 403 })
  }

  const payload: any = {
    name,
    email,
    phone: body.phone || null,
    organization_id: orgId || null,
    title: body.title || null,
    department: body.department || null,
    position_level: body.position_level || 'peer',
    role,
    status: body.status || 'active',
    preferred_language: body.preferred_language || 'tr',
  }

  // Optional manager assignment (for manager-based compensation pools)
  const managerId = body.manager_id ? String(body.manager_id).trim() : ''
  if (managerId) {
    if (id && String(id) === managerId) {
      return NextResponse.json({ success: false, error: 'KVKK: kullanıcı kendi yöneticisi olamaz' }, { status: 400 })
    }
    // Manager must exist and be in the same org (multi-tenant safety)
    const { data: mgr, error: mErr } = isPgEnabled()
      ? await withActor(buildActor(s), (c) => c.query('select id, organization_id from users where id = $1 limit 1', [managerId]))
          .then((r) => ({ data: (r.rows[0] ?? null) as any, error: null as any }))
          .catch((e) => ({ data: null as any, error: e }))
      : await supabase.from('users').select('id, organization_id').eq('id', managerId).maybeSingle()
    if (mErr || !mgr) return NextResponse.json({ success: false, error: 'Yönetici bulunamadı' }, { status: 400 })
    if (String((mgr as any).organization_id || '') !== String(orgId || '')) {
      return NextResponse.json({ success: false, error: 'KVKK: yönetici farklı kurumda olamaz' }, { status: 403 })
    }
    payload.manager_id = managerId
  } else {
    payload.manager_id = null
  }

  if (id) {
    // org_admin can only edit users in its org
    if (s.role === 'org_admin') {
      const { data: existing, error: eErr } = isPgEnabled()
        ? await withActor(buildActor(s), (c) => c.query('select id, organization_id, role from users where id = $1 limit 1', [id]))
            .then((r) => ({ data: (r.rows[0] ?? null) as any, error: null as any }))
            .catch((e) => ({ data: null as any, error: e }))
        : await supabase.from('users').select('id, organization_id, role').eq('id', id).single()
      if (eErr || !existing) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })
      if (String((existing as any).organization_id || '') !== String(orgId || '')) {
        return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
      }
      if (String((existing as any).role) === 'super_admin') {
        return NextResponse.json({ success: false, error: 'KVKK: super_admin düzenlenemez' }, { status: 403 })
      }
      // B-6: org_admin yetki YÜKSELTEMEZ (CREATE'teki role='user' zorlamasının EDIT karşılığı).
      // Yalnız 'user' ya da hedefin mevcut rolü yazılabilir → normal kullanıcıyı org_admin yapamaz,
      // mevcut org_admin'i de yanlışlıkla düşürmez.
      if (role !== 'user' && role !== String((existing as any).role)) {
        payload.role = 'user'
      }
    }

    // YAZMA (hibrit + iki katman): pg açıksa withActor RLS org-context; else supabase.
    // payload anahtarları KODDAN sabit whitelist → enjeksiyon yok; değerler $N param. WHERE id birebir.
    if (isPgEnabled()) {
      let rowCount = 0
      try {
        rowCount = await withActor(buildActor(s), async (c) => {
          const cols = Object.keys(payload)
          const sets = cols.map((col, i) => `${col} = $${i + 1}`)
          const params = cols.map((col) => payload[col])
          params.push(id)
          const r = await c.query(`update users set ${sets.join(', ')} where id = $${params.length}`, params)
          return r.rowCount
        })
      } catch (e) {
        const err = e as { code?: string; message?: string }
        if (isEmailUniqueViolation(err)) {
          return NextResponse.json({ success: false, error: 'Bu e-posta adresi başka bir kullanıcıda kayıtlı.' }, { status: 409 })
        }
        return NextResponse.json({ success: false, error: String(err?.message || 'Güncelleme hatası') }, { status: 400 })
      }
      // FORCE RLS: satır görünmüyor/yetki yoksa update SESSİZCE 0 satır etkiler → başarı sanılmasın.
      if (!rowCount) {
        return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı veya güncelleme yetkiniz yok.' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }
    const { error } = await supabase.from('users').update(payload).eq('id', id)
    if (error) {
      if (isEmailUniqueViolation(error as any)) {
        return NextResponse.json({ success: false, error: 'Bu e-posta adresi başka bir kullanıcıda kayıtlı.' }, { status: 409 })
      }
      return NextResponse.json({ success: false, error: String(error.message || 'Güncelleme hatası') }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  }

  // Create
  if (s.role === 'org_admin' && role !== 'user') {
    // keep org_admin creation simple/least privilege
    payload.role = 'user'
  }

  // YAZMA (hibrit): pg withActor RLS; payload anahtarları koddan sabit → enjeksiyon yok.
  if (isPgEnabled()) {
    try {
      await withActor(buildActor(s), async (c) => {
        const cols = Object.keys(payload)
        const ph = cols.map((_, i) => `$${i + 1}`)
        const params = cols.map((col) => payload[col])
        await c.query(`insert into users (${cols.join(', ')}) values (${ph.join(', ')})`, params)
      })
    } catch (e) {
      const err = e as { code?: string; message?: string }
      if (isEmailUniqueViolation(err)) {
        return NextResponse.json({ success: false, error: 'Bu e-posta adresi zaten kayıtlı. Aynı e-postayla ikinci kullanıcı açılamaz.' }, { status: 409 })
      }
      return NextResponse.json({ success: false, error: String(err?.message || 'Ekleme hatası') }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  }
  const { error } = await supabase.from('users').insert(payload)
  if (error) {
    if (isEmailUniqueViolation(error as any)) {
      return NextResponse.json({ success: false, error: 'Bu e-posta adresi zaten kayıtlı. Aynı e-postayla ikinci kullanıcı açılamaz.' }, { status: 409 })
    }
    return NextResponse.json({ success: false, error: String(error.message || 'Ekleme hatası') }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:users:delete', String(s.uid || ''), 10, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as DeleteBody
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  if (s.role === 'org_admin') {
    // KVKK: org_admin yalnız kendi org'unun 'user'ını silebilir (silmeden önce doğrula).
    const { data: existing, error: eErr } = isPgEnabled()
      ? await withActor(buildActor(s), (c) => c.query('select id, organization_id, role from users where id = $1 limit 1', [id]))
          .then((r) => ({ data: (r.rows[0] ?? null) as any, error: null as any }))
          .catch((e) => ({ data: null as any, error: e }))
      : await supabase.from('users').select('id, organization_id, role').eq('id', id).single()
    if (eErr || !existing) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })
    if (String((existing as any).organization_id || '') !== String(s.org_id || '')) {
      return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
    }
    if (String((existing as any).role) !== 'user') {
      return NextResponse.json({ success: false, error: 'KVKK: sadece user silinebilir' }, { status: 403 })
    }
  }

  // YAZMA (hibrit + iki katman): pg withActor RLS; WHERE id = $1 birebir.
  if (isPgEnabled()) {
    let rowCount = 0
    try {
      rowCount = await withActor(buildActor(s), async (c) => {
        const r = await c.query('delete from users where id = $1', [id])
        return r.rowCount
      })
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Silme hatası' }, { status: 400 })
    }
    // FORCE RLS: satır görünmüyor/yetki yoksa delete SESSİZCE 0 satır etkiler → başarı sanılmasın.
    if (!rowCount) {
      return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı veya silme yetkiniz yok.' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  }
  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message || 'Silme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

