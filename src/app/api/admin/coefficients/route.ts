import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { resolveBackend } from '@/lib/server/admin-db'
import { withActor, type Actor, type ActorRole } from '@/lib/server/secure-query'

export const runtime = 'nodejs'

// =====================================================================
// /api/admin/coefficients — katsayı config tablolarını server-side yönetir
// (C1b: coefficients sayfasının 16 anon .from() çağrısını buraya taşır)
//
// Faz 1 (pg göçü / Yol B): getSupabaseAdmin() → merkezi resolveBackend().
//   - PG_DATABASE_URL YOK (Vercel) → Supabase yolu AYNEN çalışır (deploy güvenli).
//   - PG_DATABASE_URL VAR (dev/kesiş) → pg yolu: withActor + parametreli SQL.
//
// Kapsanan tablolar:
//   evaluator_weights, category_weights, confidence_settings,
//   deviation_settings, international_standards  (+ okuma: question_categories)
//
// GÜVENLİK (her iki yolda AYNI):
//   - Session: super_admin + org_admin
//   - org-scope: org_admin → SADECE kendi kurumu; super_admin → seçili org
//   - 🔴 YAZMA her zaman bir organization_id'ye bağlı. Global (organization_id NULL)
//     katsayılar SADECE OKUNUR — asla yazılamaz/silinemez (global'i ezme koruması).
//   - pg yolunda ek savunma: withActor RLS bağlamı (app.current_org/role).
// =====================================================================

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

// org-scope çözümleme: org_admin → kendi kurumu (parametre yok sayılır);
// super_admin → istenen org. Boşsa null döner (çağıran 400 verir).
function resolveOrg(s: { role?: string; org_id?: unknown } | null, requested: string | null): string | null {
  if (!s) return null
  if (s.role === 'org_admin') return s.org_id ? String(s.org_id) : null
  return requested ? String(requested).trim() : null
}

// pg yolu için Actor: role + orgId + userId. super_admin'de orgId null olabilir
// (RLS super_admin'i kısıtlamaz); explicit WHERE org=$1 zaten kapsamı zorlar.
function buildActor(s: { role?: string; org_id?: unknown; uid?: unknown }): Actor {
  const role: ActorRole = s.role === 'super_admin' ? 'super_admin' : 'org_admin'
  return { role, orgId: s.org_id ? String(s.org_id) : null, userId: String(s.uid || '') }
}

// GET — org + global tüm config'i tek çağrıda dön
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:coefficients:get', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const backend = resolveBackend()
  if (!backend) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const orgId = resolveOrg(s, new URL(req.url).searchParams.get('org_id'))
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  // ---- pg yolu ----
  if (backend.mode === 'pg') {
    try {
      return await coefficientsGetPg(buildActor(s), orgId)
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Katsayılar okunamadı' }, { status: 400 })
    }
  }

  // ---- Supabase yolu (MEVCUT — değiştirilmedi) ----
  const supabase = backend.supabase

  const [orgEval, defEval, cats, orgCatW, defCatW, conf, dev, stds] = await Promise.all([
    supabase.from('evaluator_weights').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
    supabase.from('evaluator_weights').select('*').is('organization_id', null).order('created_at', { ascending: false }),
    supabase.from('question_categories').select('name').eq('is_active', true).order('sort_order'),
    supabase.from('category_weights').select('*').eq('organization_id', orgId),
    supabase.from('category_weights').select('*').is('organization_id', null),
    supabase.from('confidence_settings').select('*').eq('organization_id', orgId).maybeSingle(),
    supabase.from('deviation_settings').select('*').eq('organization_id', orgId).maybeSingle(),
    supabase.from('international_standards').select('*').eq('organization_id', orgId).order('sort_order').order('created_at'),
  ])

  // international_standards tablosu henüz kurulmamış olabilir (42P01) → boş dön, hata sayfayı kırmasın
  const stdErr = stds.error as { code?: string; message?: string } | null
  const standardsMissing = Boolean(stdErr && (stdErr.code === '42P01' ||
    (stdErr.message || '').toLowerCase().includes('schema cache') ||
    (stdErr.message || '').toLowerCase().includes('could not find the table')))

  // Diğer temel tablolarda gerçek hata varsa 400 (kritik config okunamadı)
  const hardErr = orgEval.error || defEval.error || cats.error || orgCatW.error || defCatW.error
  if (hardErr) {
    return NextResponse.json({ success: false, error: hardErr.message || 'Katsayılar okunamadı' }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    evaluatorWeights: { org: orgEval.data || [], default: defEval.data || [] },
    categoryWeights: { org: orgCatW.data || [], default: defCatW.data || [] },
    categories: cats.data || [],
    confidence: conf.error ? null : (conf.data || null),
    deviation: dev.error ? null : (dev.data || null),
    standards: standardsMissing ? [] : (stds.data || []),
    standardsMissing,
  })
}

type EvaluatorRow = { position_level?: string; weight?: number; description?: string | null }
type CategoryRow = { category_name?: string; weight?: number; is_critical?: boolean }
type StandardRow = { id?: string | null; code?: string | null; title?: string; description?: string | null; is_active?: boolean; sort_order?: number }

type PostBody = {
  type?: 'evaluator' | 'category' | 'confidence' | 'deviation' | 'standards'
  organization_id?: string | null
  rows?: EvaluatorRow[] | CategoryRow[] | StandardRow[]
  confidence?: { min_high_confidence_evaluator_count?: number }
  deviation?: {
    lenient_diff_threshold?: number
    harsh_diff_threshold?: number
    lenient_multiplier?: number
    harsh_multiplier?: number
  }
}

// POST — kaydetme (type ile ayrışır). Her yazma org-scoped; global asla yazılmaz.
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:coefficients:post', String(s.uid || ''), 40, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const backend = resolveBackend()
  if (!backend) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as PostBody
  const orgId = resolveOrg(s, body.organization_id ? String(body.organization_id) : null)
  if (!orgId) return NextResponse.json({ success: false, error: 'organization_id gerekli' }, { status: 400 })

  // ---- pg yolu ----
  if (backend.mode === 'pg') {
    try {
      return await coefficientsPostPg(buildActor(s), orgId, body)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      if (err?.code === '42P01') return NextResponse.json({ success: false, error: 'Tablo bulunamadı' }, { status: 400 })
      return NextResponse.json({ success: false, error: err?.message || 'Kayıt hatası' }, { status: 400 })
    }
  }

  // ---- Supabase yolu (MEVCUT — değiştirilmedi) ----
  const supabase = backend.supabase

  switch (body.type) {
    case 'evaluator': {
      const rows = (body.rows || []) as EvaluatorRow[]
      // Aynı position_level birden fazla gelirse tek satıra indir (son kayıt kazanır).
      // evaluator_weights'te (org, level) unique kısıtı olmasa da mükerrer satır üretmeyelim.
      const byLevel = new Map<string, EvaluatorRow>()
      rows.forEach((r) => {
        const lvl = String(r.position_level || '')
        if (lvl) byLevel.set(lvl, r)
      })
      const levels = Array.from(byLevel.keys())
      if (levels.length === 0) return NextResponse.json({ success: false, error: 'position_level gerekli' }, { status: 400 })

      // Replace: sadece bu org'un ilgili override'larını sil (await → insert'ten ÖNCE biter), sonra ekle
      const { error: delErr } = await supabase.from('evaluator_weights').delete().eq('organization_id', orgId).in('position_level', levels)
      if (delErr) return NextResponse.json({ success: false, error: delErr.message || 'Silme hatası' }, { status: 400 })

      const payload = Array.from(byLevel.values()).map((r) => ({
        organization_id: orgId, // 🔴 org zorlanır — global (null) yazılamaz
        position_level: String(r.position_level),
        weight: Number(r.weight),
        description: r.description || null,
      }))
      const { error } = await supabase.from('evaluator_weights').insert(payload)
      if (error) return NextResponse.json({ success: false, error: error.message || 'Kayıt hatası' }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    case 'category': {
      const rows = (body.rows || []) as CategoryRow[]

      // 🔴 BUG FIX: category_weights'te unique(organization_id, category_name) var.
      // Bu org'un question_categories'inde MÜKERRER kategori adı olursa payload'da
      // aynı category_name iki kez gelir → insert (veya upsert) unique kısıtı patlatır
      // ("cannot affect row a second time"). Çözüm: ada göre dedupe (son kayıt kazanır).
      const byName = new Map<string, CategoryRow>()
      rows.forEach((r) => {
        const name = String(r.category_name || '').trim()
        if (name) byName.set(name, r)
      })

      // Replace: bu org'un tüm satırlarını sil (await → insert'ten ÖNCE biter, stale temizliği)
      const { error: delErr } = await supabase.from('category_weights').delete().eq('organization_id', orgId)
      if (delErr) return NextResponse.json({ success: false, error: delErr.message || 'Silme hatası' }, { status: 400 })

      const payload = Array.from(byName.values()).map((r) => ({
        organization_id: orgId,
        category_name: String(r.category_name).trim(),
        weight: Number(r.weight),
        is_critical: Boolean(r.is_critical),
      }))
      if (payload.length > 0) {
        // upsert(onConflict) → delete bir şekilde tam temizlemese bile tekrar-güvenli (idempotent)
        const { error } = await supabase
          .from('category_weights')
          .upsert(payload as any, { onConflict: 'organization_id,category_name' })
        if (error) return NextResponse.json({ success: false, error: error.message || 'Kayıt hatası' }, { status: 400 })
      }
      return NextResponse.json({ success: true })
    }

    case 'confidence': {
      const payload = {
        organization_id: orgId,
        min_high_confidence_evaluator_count: Math.max(1, Math.floor(Number(body.confidence?.min_high_confidence_evaluator_count || 5))),
      }
      const { error } = await supabase.from('confidence_settings').upsert(payload as any, { onConflict: 'organization_id' })
      if (error) return NextResponse.json({ success: false, error: error.message || 'Kayıt hatası' }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    case 'deviation': {
      const d = body.deviation || {}
      const payload = {
        organization_id: orgId,
        lenient_diff_threshold: Number(d.lenient_diff_threshold ?? 0.75),
        harsh_diff_threshold: Number(d.harsh_diff_threshold ?? 0.75),
        lenient_multiplier: Number(d.lenient_multiplier ?? 0.85),
        harsh_multiplier: Number(d.harsh_multiplier ?? 1.15),
      }
      const { error } = await supabase.from('deviation_settings').upsert(payload as any, { onConflict: 'organization_id' })
      if (error) return NextResponse.json({ success: false, error: error.message || 'Kayıt hatası' }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    case 'standards': {
      const rows = (body.rows || []) as StandardRow[]
      if (rows.some((r) => !String(r.title || '').trim())) {
        return NextResponse.json({ success: false, error: 'Standart adı boş olamaz' }, { status: 400 })
      }

      // 🔴 org-hijack koruması: id gönderilen satırlar GERÇEKTEN bu org'a mı ait?
      // upsert(onConflict:id) başka org'un satırını ele geçirebilir → önce sahiplik doğrula.
      const ids = rows.map((r) => (r.id ? String(r.id) : '')).filter(Boolean)
      if (ids.length > 0) {
        const { data: owned, error: ownErr } = await supabase
          .from('international_standards')
          .select('id, organization_id')
          .in('id', ids)
        if (ownErr) return NextResponse.json({ success: false, error: ownErr.message || 'Doğrulama hatası' }, { status: 400 })
        const foreign = (owned || []).some((row: any) => String(row.organization_id || '') !== orgId)
        if (foreign) return NextResponse.json({ success: false, error: 'KVKK: başka kuruma ait standart düzenlenemez' }, { status: 403 })
      }

      const payload = rows.map((r) => ({
        ...(r.id ? { id: String(r.id) } : {}),
        organization_id: orgId, // 🔴 org zorlanır
        code: String(r.code || '').trim() || null,
        title: String(r.title || '').trim(),
        description: String(r.description || '').trim() || null,
        is_active: Boolean(r.is_active ?? true),
        sort_order: Number(r.sort_order || 0),
      }))
      const { error } = await supabase.from('international_standards').upsert(payload as any, { onConflict: 'id' })
      if (error) return NextResponse.json({ success: false, error: error.message || 'Kayıt hatası' }, { status: 400 })
      return NextResponse.json({ success: true })
    }

    default:
      return NextResponse.json({ success: false, error: 'Geçersiz kayıt türü' }, { status: 400 })
  }
}

// DELETE — international_standards satır silme (org-scoped)
export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:coefficients:delete', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const backend = resolveBackend()
  if (!backend) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as { id?: string; organization_id?: string | null }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  const orgId = resolveOrg(s, body.organization_id ? String(body.organization_id) : null)
  if (!orgId) return NextResponse.json({ success: false, error: 'organization_id gerekli' }, { status: 400 })

  // ---- pg yolu ----
  if (backend.mode === 'pg') {
    try {
      return await coefficientsDeletePg(buildActor(s), orgId, id)
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Silme hatası' }, { status: 400 })
    }
  }

  // ---- Supabase yolu (MEVCUT — değiştirilmedi) ----
  const supabase = backend.supabase

  // 🔴 org-scope: yalnızca kendi org'una ait standardı sil (başka org'unkine dokunamaz)
  const { data: existing, error: eErr } = await supabase
    .from('international_standards')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (eErr) return NextResponse.json({ success: false, error: eErr.message || 'Doğrulama hatası' }, { status: 400 })
  if (!existing) return NextResponse.json({ success: false, error: 'Standart bulunamadı' }, { status: 404 })
  if (String((existing as any).organization_id || '') !== orgId) {
    return NextResponse.json({ success: false, error: 'KVKK: başka kuruma ait standart silinemez' }, { status: 403 })
  }

  const { error } = await supabase.from('international_standards').delete().eq('id', id).eq('organization_id', orgId)
  if (error) return NextResponse.json({ success: false, error: error.message || 'Silme hatası' }, { status: 400 })
  return NextResponse.json({ success: true })
}

// =====================================================================
// pg yolu (yeni Türkiye DB) — withActor + parametreli SQL. Org-scope EXPLICIT
// (WHERE organization_id=$1) + global koruma (yazmada org zorlanır). withActor
// ayrıca app.current_org/role RLS bağlamını kurar (savunma derinliği).
// Yalnızca PG_DATABASE_URL set iken çalışır → prod'da (env yok) DEVREDE DEĞİL.
// =====================================================================

async function coefficientsGetPg(actor: Actor, orgId: string): Promise<NextResponse> {
  return await withActor(actor, async (c) => {
    const orgEval = await c.query('select * from evaluator_weights where organization_id = $1 order by created_at desc', [orgId])
    const defEval = await c.query('select * from evaluator_weights where organization_id is null order by created_at desc')
    const cats = await c.query('select name from question_categories where is_active = true order by sort_order')
    const orgCatW = await c.query('select * from category_weights where organization_id = $1', [orgId])
    const defCatW = await c.query('select * from category_weights where organization_id is null')
    const conf = await c.query('select * from confidence_settings where organization_id = $1 limit 1', [orgId])
    const dev = await c.query('select * from deviation_settings where organization_id = $1 limit 1', [orgId])

    // international_standards tablosu olmayabilir (42P01) → savepoint ile txn'i abort etme
    let standards: unknown[] = []
    let standardsMissing = false
    await c.query('savepoint sp_std')
    try {
      const stds = await c.query('select * from international_standards where organization_id = $1 order by sort_order, created_at', [orgId])
      standards = stds.rows
    } catch (e) {
      await c.query('rollback to savepoint sp_std')
      if ((e as { code?: string })?.code === '42P01') standardsMissing = true
      else throw e
    }

    return NextResponse.json({
      success: true,
      evaluatorWeights: { org: orgEval.rows, default: defEval.rows },
      categoryWeights: { org: orgCatW.rows, default: defCatW.rows },
      categories: cats.rows,
      confidence: conf.rows[0] || null,
      deviation: dev.rows[0] || null,
      standards: standardsMissing ? [] : standards,
      standardsMissing,
    })
  })
}

async function coefficientsPostPg(actor: Actor, orgId: string, body: PostBody): Promise<NextResponse> {
  switch (body.type) {
    case 'evaluator': {
      const rows = (body.rows || []) as EvaluatorRow[]
      const byLevel = new Map<string, EvaluatorRow>()
      rows.forEach((r) => {
        const lvl = String(r.position_level || '')
        if (lvl) byLevel.set(lvl, r)
      })
      const levels = Array.from(byLevel.keys())
      if (levels.length === 0) return NextResponse.json({ success: false, error: 'position_level gerekli' }, { status: 400 })

      await withActor(actor, async (c) => {
        // Replace: bu org'un ilgili override'larını sil, sonra ekle (txn → atomik)
        await c.query('delete from evaluator_weights where organization_id = $1 and position_level = any($2::text[])', [orgId, levels])
        for (const r of byLevel.values()) {
          await c.query(
            'insert into evaluator_weights (organization_id, position_level, weight, description) values ($1, $2, $3, $4)',
            [orgId, String(r.position_level), Number(r.weight), r.description || null] // 🔴 org zorlanır
          )
        }
      })
      return NextResponse.json({ success: true })
    }

    case 'category': {
      const rows = (body.rows || []) as CategoryRow[]
      const byName = new Map<string, CategoryRow>()
      rows.forEach((r) => {
        const name = String(r.category_name || '').trim()
        if (name) byName.set(name, r)
      })

      await withActor(actor, async (c) => {
        await c.query('delete from category_weights where organization_id = $1', [orgId])
        for (const r of byName.values()) {
          await c.query(
            `insert into category_weights (organization_id, category_name, weight, is_critical)
             values ($1, $2, $3, $4)
             on conflict (organization_id, category_name)
             do update set weight = excluded.weight, is_critical = excluded.is_critical`,
            [orgId, String(r.category_name).trim(), Number(r.weight), Boolean(r.is_critical)]
          )
        }
      })
      return NextResponse.json({ success: true })
    }

    case 'confidence': {
      const v = Math.max(1, Math.floor(Number(body.confidence?.min_high_confidence_evaluator_count || 5)))
      await withActor(actor, async (c) => {
        await c.query(
          `insert into confidence_settings (organization_id, min_high_confidence_evaluator_count)
           values ($1, $2)
           on conflict (organization_id)
           do update set min_high_confidence_evaluator_count = excluded.min_high_confidence_evaluator_count`,
          [orgId, v]
        )
      })
      return NextResponse.json({ success: true })
    }

    case 'deviation': {
      const d = body.deviation || {}
      await withActor(actor, async (c) => {
        await c.query(
          `insert into deviation_settings
             (organization_id, lenient_diff_threshold, harsh_diff_threshold, lenient_multiplier, harsh_multiplier)
           values ($1, $2, $3, $4, $5)
           on conflict (organization_id) do update set
             lenient_diff_threshold = excluded.lenient_diff_threshold,
             harsh_diff_threshold  = excluded.harsh_diff_threshold,
             lenient_multiplier    = excluded.lenient_multiplier,
             harsh_multiplier      = excluded.harsh_multiplier`,
          [
            orgId,
            Number(d.lenient_diff_threshold ?? 0.75),
            Number(d.harsh_diff_threshold ?? 0.75),
            Number(d.lenient_multiplier ?? 0.85),
            Number(d.harsh_multiplier ?? 1.15),
          ]
        )
      })
      return NextResponse.json({ success: true })
    }

    case 'standards': {
      const rows = (body.rows || []) as StandardRow[]
      if (rows.some((r) => !String(r.title || '').trim())) {
        return NextResponse.json({ success: false, error: 'Standart adı boş olamaz' }, { status: 400 })
      }
      const ids = rows.map((r) => (r.id ? String(r.id) : '')).filter(Boolean)

      return await withActor(actor, async (c) => {
        // 🔴 org-hijack koruması: gönderilen id'ler gerçekten bu org'a mı ait?
        if (ids.length > 0) {
          const owned = await c.query('select id, organization_id from international_standards where id = any($1::uuid[])', [ids])
          const foreign = owned.rows.some((row) => String((row as { organization_id?: unknown }).organization_id || '') !== orgId)
          if (foreign) return NextResponse.json({ success: false, error: 'KVKK: başka kuruma ait standart düzenlenemez' }, { status: 403 })
        }
        for (const r of rows) {
          if (r.id) {
            await c.query(
              `insert into international_standards (id, organization_id, code, title, description, is_active, sort_order)
               values ($1, $2, $3, $4, $5, $6, $7)
               on conflict (id) do update set
                 organization_id = excluded.organization_id, code = excluded.code, title = excluded.title,
                 description = excluded.description, is_active = excluded.is_active, sort_order = excluded.sort_order`,
              [String(r.id), orgId, String(r.code || '').trim() || null, String(r.title || '').trim(),
               String(r.description || '').trim() || null, Boolean(r.is_active ?? true), Number(r.sort_order || 0)] // 🔴 org zorlanır
            )
          } else {
            await c.query(
              `insert into international_standards (organization_id, code, title, description, is_active, sort_order)
               values ($1, $2, $3, $4, $5, $6)`,
              [orgId, String(r.code || '').trim() || null, String(r.title || '').trim(),
               String(r.description || '').trim() || null, Boolean(r.is_active ?? true), Number(r.sort_order || 0)] // 🔴 org zorlanır
            )
          }
        }
        return NextResponse.json({ success: true })
      })
    }

    default:
      return NextResponse.json({ success: false, error: 'Geçersiz kayıt türü' }, { status: 400 })
  }
}

async function coefficientsDeletePg(actor: Actor, orgId: string, id: string): Promise<NextResponse> {
  return await withActor(actor, async (c) => {
    // 🔴 org-scope: yalnızca kendi org'una ait standardı sil
    const existing = await c.query('select id, organization_id from international_standards where id = $1 limit 1', [id])
    if (existing.rows.length === 0) return NextResponse.json({ success: false, error: 'Standart bulunamadı' }, { status: 404 })
    if (String((existing.rows[0] as { organization_id?: unknown }).organization_id || '') !== orgId) {
      return NextResponse.json({ success: false, error: 'KVKK: başka kuruma ait standart silinemez' }, { status: 403 })
    }
    await c.query('delete from international_standards where id = $1 and organization_id = $2', [id, orgId])
    return NextResponse.json({ success: true })
  })
}
