import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

// =====================================================================
// /api/admin/coefficients — katsayı config tablolarını server-side yönetir
// (C1b: coefficients sayfasının 16 anon .from() çağrısını buraya taşır)
//
// Kapsanan tablolar:
//   evaluator_weights, category_weights, confidence_settings,
//   deviation_settings, international_standards  (+ okuma: question_categories)
//
// GÜVENLİK:
//   - Session: super_admin + org_admin
//   - org-scope: org_admin → SADECE kendi kurumu; super_admin → seçili org
//   - 🔴 YAZMA her zaman bir organization_id'ye bağlı. Global (organization_id NULL)
//     katsayılar SADECE OKUNUR — asla yazılamaz/silinemez (global'i ezme koruması).
//   - service-role ile DB (RLS bypass); yetki kontrolü burada yapılır.
// =====================================================================

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

// org-scope çözümleme: org_admin → kendi kurumu (parametre yok sayılır);
// super_admin → istenen org. Boşsa null döner (çağıran 400 verir).
function resolveOrg(s: { role?: string; org_id?: unknown } | null, requested: string | null): string | null {
  if (!s) return null
  if (s.role === 'org_admin') return s.org_id ? String(s.org_id) : null
  return requested ? String(requested).trim() : null
}

// GET — org + global tüm config'i tek çağrıda dön
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:coefficients:get', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const orgId = resolveOrg(s, new URL(req.url).searchParams.get('org_id'))
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

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

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as PostBody
  const orgId = resolveOrg(s, body.organization_id ? String(body.organization_id) : null)
  if (!orgId) return NextResponse.json({ success: false, error: 'organization_id gerekli' }, { status: 400 })

  switch (body.type) {
    case 'evaluator': {
      const rows = (body.rows || []) as EvaluatorRow[]
      const levels = rows.map((r) => String(r.position_level || '')).filter(Boolean)
      if (levels.length === 0) return NextResponse.json({ success: false, error: 'position_level gerekli' }, { status: 400 })

      // Replace: sadece bu org'un ilgili override'larını sil, sonra ekle
      const { error: delErr } = await supabase.from('evaluator_weights').delete().eq('organization_id', orgId).in('position_level', levels)
      if (delErr) return NextResponse.json({ success: false, error: delErr.message || 'Silme hatası' }, { status: 400 })

      const payload = rows.map((r) => ({
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
      const { error: delErr } = await supabase.from('category_weights').delete().eq('organization_id', orgId)
      if (delErr) return NextResponse.json({ success: false, error: delErr.message || 'Silme hatası' }, { status: 400 })

      const payload = rows
        .filter((r) => String(r.category_name || '').trim())
        .map((r) => ({
          organization_id: orgId,
          category_name: String(r.category_name),
          weight: Number(r.weight),
          is_critical: Boolean(r.is_critical),
        }))
      if (payload.length > 0) {
        const { error } = await supabase.from('category_weights').insert(payload)
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

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as { id?: string; organization_id?: string | null }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  const orgId = resolveOrg(s, body.organization_id ? String(body.organization_id) : null)
  if (!orgId) return NextResponse.json({ success: false, error: 'organization_id gerekli' }, { status: 400 })

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
