import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import type { SurveyQuestionType } from '@/types/database'
import { isPgEnabled } from '@/lib/db'
import { pgRead, pgReadOne } from '@/lib/server/pg-read'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function slugify(input: string) {
  const base = String(input || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'anket'
}

const QUESTION_TYPES: SurveyQuestionType[] = ['likert', 'single', 'multi', 'text', 'nps', 'yesno', 'date', 'rank']

type QuestionInput = {
  id?: string
  question_type?: string
  text?: string
  text_en?: string | null
  text_fr?: string | null
  options?: unknown
  scale_min?: number | null
  scale_max?: number | null
  is_required?: boolean
  sort_order?: number
  category?: string | null
}

type SaveBody = {
  id?: string
  org_id?: string | null
  title?: string
  title_en?: string | null
  title_fr?: string | null
  description?: string | null
  description_en?: string | null
  description_fr?: string | null
  status?: string
  access_type?: string
  is_anonymous?: boolean
  start_date?: string | null
  end_date?: string | null
  questions?: QuestionInput[]
}

// ---------------------------------------------------------------------------
// GET: liste (?org_id=) veya tek anket + soruları (?id=)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:surveys:get', String(s.uid || ''), 90, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const id = String(url.searchParams.get('id') || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : String(url.searchParams.get('org_id') || '').trim()

  // Tek anket detayı (builder için soruları da getir)
  if (id) {
    const { data: survey, error } = isPgEnabled()
      ? await pgReadOne<any>('select * from surveys where id = $1 limit 1', [id])
      : await supabase.from('surveys').select('*').eq('id', id).maybeSingle()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    if (!survey) return NextResponse.json({ success: false, error: 'Anket bulunamadı' }, { status: 404 })
    if (s.role === 'org_admin' && String(survey.organization_id || '') !== orgId) {
      return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
    }
    const { data: questions } = isPgEnabled()
      ? await pgRead<any>('select * from survey_questions where survey_id = $1 order by sort_order asc', [id])
      : await supabase
          .from('survey_questions')
          .select('*')
          .eq('survey_id', id)
          .order('sort_order', { ascending: true })
    let count = 0
    if (isPgEnabled()) {
      const cr = await pgReadOne<{ n: number }>('select count(*)::int as n from survey_responses where survey_id = $1', [id])
      count = Number(cr.data?.n || 0)
    } else {
      const cRes = await supabase
        .from('survey_responses')
        .select('id', { count: 'exact', head: true })
        .eq('survey_id', id)
      count = cRes.count || 0
    }
    return NextResponse.json({ success: true, survey, questions: questions || [], response_count: count || 0 })
  }

  // Liste
  let surveys: any[] | null
  let error: any
  if (isPgEnabled()) {
    const params: unknown[] = []
    let sql = 'select * from surveys'
    if (s.role === 'org_admin') {
      if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })
      params.push(orgId)
      sql += ' where organization_id = $1'
    } else if (orgId) {
      params.push(orgId)
      sql += ' where organization_id = $1'
    }
    sql += ' order by created_at desc limit 500'
    const r = await pgRead<any>(sql, params)
    surveys = r.data
    error = r.error
  } else {
    let q = supabase.from('surveys').select('*').order('created_at', { ascending: false }).limit(500)
    if (s.role === 'org_admin') {
      if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })
      q = q.eq('organization_id', orgId)
    } else if (orgId) {
      q = q.eq('organization_id', orgId)
    }
    const r = await q
    surveys = r.data
    error = r.error
  }
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })

  // Yanıt sayıları
  const ids = (surveys || []).map((x: any) => x.id)
  const counts: Record<string, number> = {}
  if (ids.length) {
    const { data: resp } = isPgEnabled()
      ? await pgRead<{ survey_id: string }>('select survey_id from survey_responses where survey_id = any($1::uuid[])', [ids])
      : await supabase.from('survey_responses').select('survey_id').in('survey_id', ids)
    for (const r of resp || []) counts[(r as any).survey_id] = (counts[(r as any).survey_id] || 0) + 1
  }
  const items = (surveys || []).map((x: any) => ({ ...x, response_count: counts[x.id] || 0 }))
  return NextResponse.json({ success: true, items })
}

// ---------------------------------------------------------------------------
// POST: anket oluştur/güncelle (+ opsiyonel soru listesi = builder kaydı)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:surveys:post', String(s.uid || ''), 40, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as SaveBody
  const id = String(body.id || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : String(body.org_id || '').trim()
  if (!orgId) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({ success: false, error: 'Başlık gerekli' }, { status: 400 })

  const status = ['draft', 'active', 'closed'].includes(String(body.status)) ? String(body.status) : 'draft'
  const accessType = ['internal', 'public', 'both'].includes(String(body.access_type)) ? String(body.access_type) : 'both'

  const meta: any = {
    organization_id: orgId,
    title,
    title_en: body.title_en ? String(body.title_en) : null,
    title_fr: body.title_fr ? String(body.title_fr) : null,
    description: body.description ? String(body.description) : null,
    description_en: body.description_en ? String(body.description_en) : null,
    description_fr: body.description_fr ? String(body.description_fr) : null,
    status,
    access_type: accessType,
    is_anonymous: typeof body.is_anonymous === 'boolean' ? body.is_anonymous : false,
    start_date: body.start_date ? String(body.start_date) : null,
    end_date: body.end_date ? String(body.end_date) : null,
    updated_at: new Date().toISOString(),
  }

  let surveyId = id

  // ---- pg yolu (YAZMA → withActor + parametreli SQL, RLS org bağlamı) ----
  if (isPgEnabled()) {
    // org_admin update guard (JS katmanı — RLS ile çift koruma)
    if (id && s.role === 'org_admin') {
      const { data: existing } = await pgReadOne<{ organization_id: unknown }>(
        'select organization_id from surveys where id = $1 limit 1',
        [id]
      )
      if (!existing || String(existing.organization_id || '') !== orgId) {
        return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
      }
    }

    // Yeni kayıt için benzersiz slug (okuma) — mevcut mantık birebir
    if (!id) {
      let slug = slugify(title)
      const { data: clash } = await pgReadOne<{ id: string }>('select id from surveys where slug = $1 limit 1', [slug])
      if (clash) slug = `${slug}-${Math.abs(hashStr(title + status + accessType)) % 100000}`
      meta.slug = slug
      meta.created_by = s.uid ? String(s.uid) : null
    }

    // Soru satırlarını önceden hazırla (delete+insert replace, atomik)
    const questionRows = Array.isArray(body.questions)
      ? body.questions
          .map((qn, idx) => normalizeQuestion(qn, '__PLACEHOLDER__', idx))
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : null

    try {
      await withActor(buildActor(s), async (c) => {
        // 1) survey create/update (sabit kolon whitelist — meta anahtarları koddan)
        const cols = Object.keys(meta)
        const vals = cols.map((k) => (meta as any)[k])
        if (id) {
          const setClause = cols.map((col, i) => `${col} = $${i + 1}`).join(', ')
          await c.query(`update surveys set ${setClause} where id = $${cols.length + 1}`, [...vals, id])
        } else {
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
          const r = await c.query<{ id: string }>(
            `insert into surveys (${cols.join(', ')}) values (${placeholders}) returning id`,
            vals
          )
          surveyId = String(r.rows[0]?.id || '')
        }

        // 2) Sorular gönderildiyse tam senkron (sil-yeniden ekle) — atomik
        if (questionRows) {
          await c.query('delete from survey_questions where survey_id = $1', [surveyId])
          if (questionRows.length) {
            const rows = questionRows.map((r) => ({ ...r, survey_id: surveyId }))
            const insertQuestions = async (withCategory: boolean) => {
              const qcols = withCategory
                ? Object.keys(rows[0])
                : Object.keys(rows[0]).filter((k) => k !== 'category')
              const params: unknown[] = []
              const tuples = rows.map((row) => {
                const ph = qcols.map((col) => {
                  const v = (row as any)[col]
                  // options → jsonb. null ise SQL NULL (supabase davranışı); değilse jsonb cast.
                  if (col === 'options') {
                    if (v == null) {
                      params.push(null)
                      return `$${params.length}`
                    }
                    params.push(JSON.stringify(v))
                    return `$${params.length}::jsonb`
                  }
                  params.push(v)
                  return `$${params.length}`
                })
                return `(${ph.join(', ')})`
              })
              await c.query(`insert into survey_questions (${qcols.join(', ')}) values ${tuples.join(', ')}`, params)
            }
            // SAVEPOINT: 42703 (category yok) durumunda transaction abort olmadan
            // kategorisiz yeniden dene (aynı tx içinde rollback to savepoint).
            await c.query('savepoint sp_q')
            try {
              await insertQuestions(true)
            } catch (qErr: any) {
              const missingCategory =
                qErr?.code === '42703' || /category/i.test(String(qErr?.message || ''))
              if (!missingCategory) throw qErr
              await c.query('rollback to savepoint sp_q')
              await insertQuestions(false)
            }
          }
        }
      })
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Kayıt hatası' }, { status: 400 })
    }

    return NextResponse.json({ success: true, id: surveyId })
  }

  // ---- Supabase yolu (MEVCUT — değiştirilmedi) ----
  if (id) {
    // Güncelleme — org_admin yalnızca kendi kurumunu düzenleyebilir
    if (s.role === 'org_admin') {
      const { data: existing } = await supabase.from('surveys').select('organization_id').eq('id', id).maybeSingle()
      if (!existing || String((existing as any).organization_id || '') !== orgId) {
        return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
      }
    }
    const { error } = await supabase.from('surveys').update(meta).eq('id', id)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  } else {
    // Yeni — benzersiz slug üret
    let slug = slugify(title)
    const { data: clash } = await supabase.from('surveys').select('id').eq('slug', slug).maybeSingle()
    if (clash) slug = `${slug}-${Math.abs(hashStr(title + status + accessType)) % 100000}`
    meta.slug = slug
    meta.created_by = s.uid ? String(s.uid) : null
    const { data: created, error } = await supabase.from('surveys').insert(meta).select('id').single()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    surveyId = (created as any).id
  }

  // Sorular gönderildiyse tam senkron (sil-yeniden ekle: builder basitliği)
  if (Array.isArray(body.questions)) {
    await supabase.from('survey_questions').delete().eq('survey_id', surveyId)
    const rows = body.questions
      .map((qn, idx) => normalizeQuestion(qn, surveyId, idx))
      .filter((x): x is NonNullable<typeof x> => x !== null)
    if (rows.length) {
      const { error: qErr } = await supabase.from('survey_questions').insert(rows)
      if (qErr) {
        // `category` sütunu henüz migrate edilmemişse (42703) kategorisiz tekrar dene.
        const missingCategory =
          (qErr as any)?.code === '42703' || /category/i.test(String((qErr as any)?.message || ''))
        if (missingCategory) {
          const rowsNoCat = rows.map(({ category: _category, ...rest }) => rest)
          const { error: retryErr } = await supabase.from('survey_questions').insert(rowsNoCat)
          if (retryErr) return NextResponse.json({ success: false, error: retryErr.message }, { status: 400 })
        } else {
          return NextResponse.json({ success: false, error: qErr.message }, { status: 400 })
        }
      }
    }
  }

  return NextResponse.json({ success: true, id: surveyId })
}

// ---------------------------------------------------------------------------
// DELETE: ?id=  (cascade ile soru/yanıt/analizler de gider)
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:surveys:delete', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const id = String(new URL(req.url).searchParams.get('id') || '').trim()
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  if (s.role === 'org_admin') {
    const { data: existing } = isPgEnabled()
      ? await pgReadOne<{ organization_id: unknown }>('select organization_id from surveys where id = $1 limit 1', [id])
      : await supabase.from('surveys').select('organization_id').eq('id', id).maybeSingle()
    if (!existing || String((existing as any).organization_id || '') !== String(s.org_id || '')) {
      return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
    }
  }

  if (isPgEnabled()) {
    try {
      await withActor(buildActor(s), async (c) => {
        await c.query('delete from surveys where id = $1', [id])
      })
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Silme hatası' }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  }
  const { error } = await supabase.from('surveys').delete().eq('id', id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}

// ---- helpers ----
function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

function normalizeQuestion(qn: QuestionInput, surveyId: string, idx: number) {
  const text = String(qn.text || '').trim()
  if (!text) return null
  const type = QUESTION_TYPES.includes(qn.question_type as SurveyQuestionType)
    ? (qn.question_type as SurveyQuestionType)
    : 'text'
  return {
    survey_id: surveyId,
    question_type: type,
    text,
    text_en: qn.text_en ? String(qn.text_en) : null,
    text_fr: qn.text_fr ? String(qn.text_fr) : null,
    options: qn.options ?? null,
    scale_min: typeof qn.scale_min === 'number' ? qn.scale_min : null,
    scale_max: typeof qn.scale_max === 'number' ? qn.scale_max : null,
    is_required: typeof qn.is_required === 'boolean' ? qn.is_required : false,
    sort_order: typeof qn.sort_order === 'number' ? qn.sort_order : idx,
    category: qn.category != null && String(qn.category).trim() ? String(qn.category).trim() : null,
  }
}
