import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { isPgEnabled } from '@/lib/db'
import { pgRead, pgReadOne } from '@/lib/server/pg-read'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'
import { randomBytes } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

/** Linkte görünen jeton. Tahmin edilemez olmalı; kısa ve URL-güvenli. */
function newToken() {
  return randomBytes(8).toString('base64url')
}

/** Anketi yükler ve oturumun bu ankete yetkisi olduğunu doğrular. */
async function loadSurvey(id: string, s: any) {
  const { data } = await pgReadOne<{ id: string; organization_id: string; slug: string }>(
    'select id, organization_id, slug from surveys where id = $1 limit 1',
    [id]
  )
  if (!data) return { error: 'Anket bulunamadı', status: 404 as const, survey: null }
  if (s.role === 'org_admin' && String(data.organization_id || '') !== String(s.org_id || '')) {
    return { error: 'Yetkisiz', status: 403 as const, survey: null }
  }
  return { error: null, status: 200 as const, survey: data }
}

function guard(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) return { s: null as any, deny: NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 }) }
  // Kanal tablosu Türkiye PostgreSQL'de; Supabase yolunda bu özellik yok.
  if (!isPgEnabled()) return { s, deny: NextResponse.json({ success: false, error: 'Bu özellik için PostgreSQL bağlantısı gerekli.' }, { status: 503 }) }
  return { s, deny: null }
}

// ---------------------------------------------------------------------------
// GET: bir anketin kanalları + kanal başına cevap sayısı
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { s, deny } = guard(req)
  if (deny) return deny

  const surveyId = String(new URL(req.url).searchParams.get('survey_id') || '').trim()
  if (!surveyId) return NextResponse.json({ success: false, error: 'survey_id gerekli' }, { status: 400 })

  const chk = await loadSurvey(surveyId, s)
  if (chk.error) return NextResponse.json({ success: false, error: chk.error }, { status: chk.status })

  // Tablo henüz oluşturulmadıysa boş liste dönülür; ekran bozulmaz.
  try {
    const { data: channels, error: chErr } = await pgRead<any>(
      'select id, label, group_label, expected_count, token, is_active, created_at from survey_channels where survey_id = $1 order by group_label nulls first, label asc',
      [surveyId]
    )
    // pgRead hata fırlatmaz; tablo yoksa ready:false dönebilmek için catch'e taşı.
    if (chErr) throw chErr
    const { data: counts } = await pgRead<any>(
      'select channel_id, count(*)::int as n from survey_responses where survey_id = $1 and channel_id is not null group by channel_id',
      [surveyId]
    )
    const byId = new Map<string, number>()
    for (const c of counts || []) byId.set(String(c.channel_id), Number(c.n) || 0)

    const { data: unassigned } = await pgReadOne<any>(
      'select count(*)::int as n from survey_responses where survey_id = $1 and channel_id is null',
      [surveyId]
    )

    return NextResponse.json({
      success: true,
      slug: chk.survey!.slug,
      ready: true,
      unassigned: Number(unassigned?.n) || 0,
      channels: (channels || []).map((c: any) => ({ ...c, responses: byId.get(String(c.id)) || 0 })),
    })
  } catch {
    return NextResponse.json({ success: true, slug: chk.survey!.slug, ready: false, unassigned: 0, channels: [] })
  }
}

// ---------------------------------------------------------------------------
// POST: toplu kanal ekleme  { survey_id, labels[], group_label?, expected_count? }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const { s, deny } = guard(req)
  if (deny) return deny

  const rl = await rateLimitByUser(req, 'admin:surveys:channels:write', String(s.uid || ''), 60, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const body = (await req.json().catch(() => ({}))) as {
    survey_id?: string
    labels?: unknown
    group_label?: unknown
    expected_count?: unknown
  }
  const surveyId = String(body.survey_id || '').trim()
  if (!surveyId) return NextResponse.json({ success: false, error: 'survey_id gerekli' }, { status: 400 })

  const chk = await loadSurvey(surveyId, s)
  if (chk.error) return NextResponse.json({ success: false, error: chk.error }, { status: chk.status })

  // Etiketler: tekilleştirilir, boşlar atılır, en fazla 200 kanal.
  const raw = Array.isArray(body.labels) ? body.labels : []
  const seen = new Set<string>()
  const labels: string[] = []
  for (const x of raw) {
    const v = String(x ?? '').trim().slice(0, 80)
    if (!v || seen.has(v.toLocaleLowerCase('tr'))) continue
    seen.add(v.toLocaleLowerCase('tr'))
    labels.push(v)
  }
  if (!labels.length) return NextResponse.json({ success: false, error: 'En az bir sınıf adı gerekli' }, { status: 400 })
  if (labels.length > 200) return NextResponse.json({ success: false, error: 'En fazla 200 kanal eklenebilir' }, { status: 400 })

  const groupLabel = String(body.group_label || '').trim().slice(0, 80) || null
  const expectedRaw = Number(body.expected_count)
  const expected = Number.isFinite(expectedRaw) && expectedRaw > 0 ? Math.floor(expectedRaw) : null

  let added = 0
  let skipped = 0
  try {
    await withActor(buildActor(s), async (c) => {
      for (const label of labels) {
        const r = await c.query(
          `insert into survey_channels (survey_id, organization_id, label, group_label, expected_count, token)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (survey_id, label) do nothing
           returning id`,
          [surveyId, chk.survey!.organization_id, label, groupLabel, expected, newToken()]
        )
        if (r.rows.length) added += 1
        else skipped += 1
      }
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error)?.message || 'Kanal eklenemedi' }, { status: 400 })
  }

  return NextResponse.json({ success: true, added, skipped })
}

// ---------------------------------------------------------------------------
// PATCH: tek kanal güncelle  { id, label?, group_label?, expected_count?, is_active? }
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  const { s, deny } = guard(req)
  if (deny) return deny

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  const { data: ch } = await pgReadOne<any>('select id, survey_id from survey_channels where id = $1 limit 1', [id])
  if (!ch) return NextResponse.json({ success: false, error: 'Kanal bulunamadı' }, { status: 404 })

  const chk = await loadSurvey(String(ch.survey_id), s)
  if (chk.error) return NextResponse.json({ success: false, error: chk.error }, { status: chk.status })

  const sets: string[] = []
  const params: unknown[] = []
  const push = (col: string, val: unknown) => {
    params.push(val)
    sets.push(`${col} = $${params.length}`)
  }
  if (typeof body.label === 'string' && body.label.trim()) push('label', body.label.trim().slice(0, 80))
  if (typeof body.group_label === 'string') push('group_label', body.group_label.trim().slice(0, 80) || null)
  if (body.expected_count !== undefined) {
    const n = Number(body.expected_count)
    push('expected_count', Number.isFinite(n) && n > 0 ? Math.floor(n) : null)
  }
  if (typeof body.is_active === 'boolean') push('is_active', body.is_active)
  if (!sets.length) return NextResponse.json({ success: false, error: 'Güncellenecek alan yok' }, { status: 400 })

  params.push(id)
  try {
    await withActor(buildActor(s), async (c) => {
      await c.query(`update survey_channels set ${sets.join(', ')} where id = $${params.length}`, params)
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error)?.message || 'Güncellenemedi' }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}

// ---------------------------------------------------------------------------
// DELETE: ?id=  — cevabı olan kanal SİLİNMEZ (pasife alınır)
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const { s, deny } = guard(req)
  if (deny) return deny

  const id = String(new URL(req.url).searchParams.get('id') || '').trim()
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  const { data: ch } = await pgReadOne<any>('select id, survey_id from survey_channels where id = $1 limit 1', [id])
  if (!ch) return NextResponse.json({ success: false, error: 'Kanal bulunamadı' }, { status: 404 })

  const chk = await loadSurvey(String(ch.survey_id), s)
  if (chk.error) return NextResponse.json({ success: false, error: chk.error }, { status: chk.status })

  // Cevap varsa silme yok: kırılım geçmişi kaybolmasın.
  const { data: used } = await pgReadOne<any>(
    'select count(*)::int as n from survey_responses where channel_id = $1',
    [id]
  )
  if ((Number(used?.n) || 0) > 0) {
    return NextResponse.json({ success: false, error: 'Bu sınıfa ait cevaplar var; silmek yerine pasife alın.', code: 'channel_in_use' }, { status: 409 })
  }

  try {
    await withActor(buildActor(s), async (c) => {
      await c.query('delete from survey_channels where id = $1', [id])
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error)?.message || 'Silinemedi' }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}
