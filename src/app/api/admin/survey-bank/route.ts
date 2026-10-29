import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { isPgEnabled } from '@/lib/db'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

const AUDIENCES = ['ogrenci', 'veli', 'personel', 'genel']

type IncomingQuestion = {
  question_code?: string | null
  sub_theme?: string | null
  text_tr?: string
  text_en?: string | null
  text_fr?: string | null
  respondent_note?: string | null
  question_type?: string
  options?: Array<{ label?: string; label_en?: string | null; label_fr?: string | null; score?: number | null }>
}

/** Kapsam çözümü: org_admin kendi kurumuna kilitli; global yalnız super_admin. */
function resolveScope(s: any, raw: string) {
  const asked = String(raw || '').trim()
  if (s.role === 'org_admin') return { orgId: String(s.org_id || ''), error: asked && asked !== String(s.org_id || '') ? 'Yetkisiz' : null }
  if (!asked || asked === 'global') return { orgId: null as string | null, error: null }
  return { orgId: asked, error: null }
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  const rl = await rateLimitByUser(req, 'admin:survey-bank:get', String(s.uid || ''), 60, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })
  if (!isPgEnabled()) return NextResponse.json({ success: false, error: 'Bu uç yalnızca PostgreSQL arka ucuyla çalışır' }, { status: 503 })

  const url = new URL(req.url)
  const scope = resolveScope(s, url.searchParams.get('org_id') || '')
  if (scope.error) return NextResponse.json({ success: false, error: scope.error }, { status: 403 })

  const params: unknown[] = []
  let where = ''
  if (scope.orgId) {
    params.push(scope.orgId)
    where = 'where (organization_id = $1 or organization_id is null)'
  } else {
    where = 'where organization_id is null'
  }

  try {
    const r = await withActor(buildActor(s), (c) =>
      c.query(
        `select id, organization_id, main_theme, sub_theme, question_code, audience,
                question_type, text_tr, text_en, text_fr, respondent_note, options, is_active
         from survey_question_bank ${where}
         order by main_theme, audience, question_code nulls last, sub_theme`,
        params
      )
    )
    return NextResponse.json({ success: true, items: r.rows || [] })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error)?.message || 'Liste alınamadı' }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  const rl = await rateLimitByUser(req, 'admin:survey-bank:post', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })
  if (!isPgEnabled()) return NextResponse.json({ success: false, error: 'Bu uç yalnızca PostgreSQL arka ucuyla çalışır' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as {
    org_id?: string
    main_theme?: string
    audience?: string
    questions?: IncomingQuestion[]
  }

  const scope = resolveScope(s, body.org_id || '')
  if (scope.error) return NextResponse.json({ success: false, error: scope.error }, { status: 403 })

  const mainTheme = String(body.main_theme || '').trim()
  const audience = AUDIENCES.includes(String(body.audience || '')) ? String(body.audience) : 'genel'
  const list = Array.isArray(body.questions) ? body.questions : []
  if (!mainTheme) return NextResponse.json({ success: false, error: 'Ana tema gerekli' }, { status: 400 })
  if (!list.length) return NextResponse.json({ success: false, error: 'Soru listesi boş' }, { status: 400 })

  let inserted = 0
  let updated = 0
  try {
    await withActor(buildActor(s), async (c) => {
      for (const q of list) {
        const text = String(q.text_tr || '').trim()
        if (!text) continue
        const opts = (Array.isArray(q.options) ? q.options : [])
          .map((o) => ({
            label: String(o?.label || '').trim(),
            label_en: o?.label_en ? String(o.label_en) : null,
            label_fr: o?.label_fr ? String(o.label_fr) : null,
            score: typeof o?.score === 'number' && Number.isFinite(o.score) ? o.score : null,
          }))
          .filter((o) => o.label)
        const code = q.question_code ? String(q.question_code).trim() : null

        // Soru kodu varsa tekil anahtara göre güncelle, yoksa her zaman ekle.
        const res = await c.query<{ is_insert: boolean }>(
          `insert into survey_question_bank
             (organization_id, main_theme, sub_theme, question_code, audience,
              question_type, text_tr, text_en, text_fr, respondent_note, options)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
           on conflict (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        main_theme, audience, question_code)
             where question_code is not null
           do update set
             sub_theme = excluded.sub_theme,
             question_type = excluded.question_type,
             text_tr = excluded.text_tr,
             text_en = coalesce(excluded.text_en, survey_question_bank.text_en),
             text_fr = coalesce(excluded.text_fr, survey_question_bank.text_fr),
             respondent_note = excluded.respondent_note,
             options = excluded.options,
             updated_at = now()
           returning (xmax = 0) as is_insert`,
          [
            scope.orgId,
            mainTheme,
            q.sub_theme ? String(q.sub_theme).trim() : null,
            code,
            audience,
            q.question_type === 'text' ? 'text' : 'single',
            text,
            q.text_en ?? null,
            q.text_fr ?? null,
            q.respondent_note ? String(q.respondent_note).trim() : null,
            JSON.stringify(opts),
          ]
        )
        if (res.rows[0]?.is_insert) inserted += 1
        else updated += 1
      }
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error)?.message || 'Kaydedilemedi' }, { status: 400 })
  }

  return NextResponse.json({ success: true, inserted, updated })
}

export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  if (!isPgEnabled()) return NextResponse.json({ success: false, error: 'Bu uç yalnızca PostgreSQL arka ucuyla çalışır' }, { status: 503 })

  const url = new URL(req.url)
  const id = String(url.searchParams.get('id') || '').trim()
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  try {
    await withActor(buildActor(s), async (c) => {
      const own = await c.query('select organization_id from survey_question_bank where id = $1 limit 1', [id])
      const row = own.rows[0] as { organization_id: string | null } | undefined
      if (!row) throw new Error('Kayıt bulunamadı')
      if (s.role === 'org_admin' && String(row.organization_id || '') !== String(s.org_id || '')) {
        throw new Error('Yetkisiz')
      }
      if (s.role !== 'super_admin' && row.organization_id == null) throw new Error('Yetkisiz')
      await c.query('delete from survey_question_bank where id = $1', [id])
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error)?.message || 'Silinemedi' }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}
