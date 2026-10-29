import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByIp, getIp } from '@/lib/server/rate-limit'
import { getAssignedQuestionIds } from '@/lib/server/survey-assignments'
import type { SurveyQuestionType } from '@/types/database'
import { isPgEnabled } from '@/lib/db'
import { pgRead, pgReadOne } from '@/lib/server/pg-read'
import { withActor, type Actor } from '@/lib/server/secure-query'
import { createHash } from 'node:crypto'

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

/**
 * Katılım kaydı anahtarı. Kimlik ↔ cevap bağı KURULMAZ: bu değer yalnız
 * survey_participation tablosunda durur, cevap satırlarında karşılığı yoktur.
 * Bu yüzden anonim ankette de güvenle kullanılabilir.
 */
function subjectHash(surveyId: string, userId: string) {
  const salt = process.env.SURVEY_HASH_SALT || 'visio360-survey'
  return createHash('sha256').update(`${surveyId}:${userId}:${salt}`).digest('hex')
}

function hashIp(ip: string) {
  // Basit FNV-1a — ham IP saklamamak için (KVKK)
  let h = 0x811c9dc5
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/**
 * Linkteki kanal jetonunu kanala çevirir. Katılımcı channel_id ENJEKTE
 * EDEMEZ: yalnız jeton gönderir, kanal sunucuda çözülür ve kanalın bu
 * ankete ait + aktif olduğu doğrulanır. Tablo henüz yoksa null döner.
 */
async function resolveChannelId(surveyId: string, token: unknown): Promise<string | null> {
  const tk = String(token || '').trim()
  if (!tk || tk.length > 64 || !isPgEnabled()) return null
  try {
    const { data } = await pgReadOne<{ id: string }>(
      'select id from survey_channels where token = $1 and survey_id = $2 and is_active = true limit 1',
      [tk, surveyId]
    )
    return data?.id ? String(data.id) : null
  } catch {
    return null
  }
}

function isOpen(survey: any): boolean {
  if (survey.status !== 'active') return false
  const today = new Date().toISOString().slice(0, 10)
  if (survey.start_date && today < String(survey.start_date)) return false
  if (survey.end_date && today > String(survey.end_date)) return false
  return true
}

// ---------------------------------------------------------------------------
// GET: yayındaki anket formunu döner (public — login gerektirmeyebilir)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const rl = await rateLimitByIp(req, 'survey:load', 120, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Yapılandırma eksik' }, { status: 503 })

  const { data: survey, error } = isPgEnabled()
    ? await pgReadOne<any>('select * from surveys where slug = $1 limit 1', [slug])
    : await supabase.from('surveys').select('*').eq('slug', slug).maybeSingle()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  if (!survey) return NextResponse.json({ success: false, error: 'Anket bulunamadı' }, { status: 404 })

  if (!isOpen(survey)) {
    return NextResponse.json({ success: false, error: 'closed', message: 'Bu anket şu anda yanıtlamaya kapalı.' }, { status: 403 })
  }

  // Sadece iç kullanıcıya açıksa oturum şart
  const s = sessionFromReq(req)
  if (survey.access_type === 'internal' && !s?.uid) {
    return NextResponse.json({ success: false, error: 'auth_required', message: 'Bu anket yalnızca giriş yapan kullanıcılara açık.' }, { status: 401 })
  }

  const { data: questions } = isPgEnabled()
    ? await pgRead<any>(
        'select id, question_type, text, text_en, text_fr, options, scale_min, scale_max, is_required, sort_order, category from survey_questions where survey_id = $1 order by sort_order asc',
        [survey.id]
      )
    : await supabase
        .from('survey_questions')
        .select('id, question_type, text, text_en, text_fr, options, scale_min, scale_max, is_required, sort_order, category')
        .eq('survey_id', survey.id)
        .order('sort_order', { ascending: true })

  // Kişiye özel atama varsa yalnızca atanmış soruları göster.
  const assigned = await getAssignedQuestionIds(supabase, String(survey.id), s?.uid ? String(s.uid) : null)
  const visibleQuestions = assigned.restricted
    ? (questions || []).filter((q: any) => assigned.questionIds.has(String(q.id)))
    : questions || []

  return NextResponse.json({
    success: true,
    assigned: assigned.restricted,
    survey: {
      id: survey.id,
      slug: survey.slug,
      title: survey.title,
      title_en: survey.title_en,
      title_fr: survey.title_fr,
      description: survey.description,
      description_en: survey.description_en,
      description_fr: survey.description_fr,
      is_anonymous: survey.is_anonymous,
      access_type: survey.access_type,
      organization_id: survey.organization_id,
    },
    questions: visibleQuestions,
    identified: !!s?.uid,
  })
}

type AnswerInput = { question_id?: string; value_num?: unknown; value_text?: unknown; value_json?: unknown }

// ---------------------------------------------------------------------------
// POST: yanıt gönderimi
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const rl = await rateLimitByIp(req, 'survey:submit', 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Yapılandırma eksik' }, { status: 503 })

  const { data: survey } = isPgEnabled()
    ? await pgReadOne<any>('select * from surveys where slug = $1 limit 1', [slug])
    : await supabase.from('surveys').select('*').eq('slug', slug).maybeSingle()
  if (!survey) return NextResponse.json({ success: false, error: 'Anket bulunamadı' }, { status: 404 })
  if (!isOpen(survey)) return NextResponse.json({ success: false, error: 'Bu anket yanıtlamaya kapalı.' }, { status: 403 })

  const s = sessionFromReq(req)
  if (survey.access_type === 'internal' && !s?.uid) {
    return NextResponse.json({ success: false, error: 'Bu anket yalnızca giriş yapan kullanıcılara açık.' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { answers?: AnswerInput[]; lang?: string; channel?: string }
  const answersIn = Array.isArray(body.answers) ? body.answers : []
  const channelId = await resolveChannelId(String(survey.id), body.channel)

  const { data: questions } = isPgEnabled()
    ? await pgRead<any>('select id, question_type, is_required from survey_questions where survey_id = $1', [survey.id])
    : await supabase
        .from('survey_questions')
        .select('id, question_type, is_required')
        .eq('survey_id', survey.id)
  // Kişiye özel atama varsa yalnızca atanmış soruları kabul et (zorunlu kontrolü dahil).
  const assigned = await getAssignedQuestionIds(supabase, String(survey.id), s?.uid ? String(s.uid) : null)
  const qMap = new Map<string, { type: SurveyQuestionType; required: boolean }>()
  for (const q of questions || []) {
    const qid = String((q as any).id)
    if (assigned.restricted && !assigned.questionIds.has(qid)) continue
    qMap.set(qid, { type: (q as any).question_type, required: !!(q as any).is_required })
  }

  const answerByQ = new Map<string, AnswerInput>()
  for (const a of answersIn) if (a?.question_id) answerByQ.set(String(a.question_id), a)

  // Zorunlu soru kontrolü
  for (const [qid, meta] of qMap) {
    if (!meta.required) continue
    const a = answerByQ.get(qid)
    if (!a || (a.value_num == null && !hasText(a.value_text) && isEmptyJson(a.value_json))) {
      return NextResponse.json({ success: false, error: 'Zorunlu sorular yanıtlanmalı.', missing: qid }, { status: 400 })
    }
  }

  // Kanal kolonu var mı? Migration çalışmadan önce de gönderim çalışsın.
  // İşlem (transaction) İÇİNDE denenip hataya düşülemez: başarısız komut
  // işlemi iptal eder ve cevap tamamen kaybolur.
  let hasChannelCol = false
  if (isPgEnabled()) {
    try {
      const { data } = await pgReadOne<any>(
        "select 1 as x from information_schema.columns where table_schema = 'public' and table_name = 'survey_responses' and column_name = 'channel_id' limit 1",
        []
      )
      hasChannelCol = !!data
    } catch {
      hasChannelCol = false
    }
  }

  const isIdentified = !survey.is_anonymous && !!s?.uid
  const meta = {
    ip_hash: hashIp(getIp(req) || ''),
    lang: String(body.lang || 'tr').slice(0, 2),
  }

  // Server-set alanlar (katılımcı ENJEKTE EDEMEZ): survey_id (slug'dan çözüldü),
  // respondent_user_id (isIdentified ? oturum : null), source. Cross-org yapısal engelli.
  const respondentUserId = isIdentified ? String(s!.uid) : null
  const source = s?.uid ? 'internal' : 'public'

  // ── Mükerrer yanıt engeli ────────────────────────────────────────────────
  // Oturumlu kullanıcı: katılım kaydı (anonim ankette bile kimlik↔cevap bağı
  // kurulmaz) ve kimlikli ankette ayrıca doğrudan yanıt kontrolü.
  // Oturumsuz public: yalnız tarayıcı çerezi — zayıftır, kazara tekrarı önler.
  const COOKIE = `svy_${String(survey.id)}`
  const ALREADY = 'Bu anketi zaten yanıtladınız.'
  const subj = s?.uid ? subjectHash(String(survey.id), String(s.uid)) : ''
  const blocked = () =>
    NextResponse.json({ success: false, error: ALREADY, code: 'already_answered' }, { status: 409 })

  if (s?.uid) {
    if (isPgEnabled()) {
      try {
        const p = await pgReadOne<any>(
          'select 1 as x from survey_participation where survey_id = $1 and subject_hash = $2 limit 1',
          [survey.id, subj]
        )
        if (p.data) return blocked()
      } catch {
        /* katılım tablosu okunamazsa aşağıdaki yanıt kontrolü devrede kalır */
      }
    }
    if (respondentUserId) {
      try {
        if (isPgEnabled()) {
          const r = await pgReadOne<any>(
            'select 1 as x from survey_responses where survey_id = $1 and respondent_user_id = $2 limit 1',
            [survey.id, respondentUserId]
          )
          if (r.data) return blocked()
        } else {
          const { data } = await supabase
            .from('survey_responses')
            .select('id')
            .eq('survey_id', survey.id)
            .eq('respondent_user_id', respondentUserId)
            .maybeSingle()
          if (data) return blocked()
        }
      } catch {
        /* yoksay */
      }
    }
  } else if (req.cookies.get(COOKIE)?.value) {
    return blocked()
  }

  // Başarılı yanıtta çerez bırakılır: aynı tarayıcıda tekrar engellenir.
  const okResponse = () => {
    const res = NextResponse.json({ success: true })
    res.cookies.set(COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 180,
    })
    return res
  }

  // Yalnız izinli soruların cevabı; response_id sunucu-üretimli (W1). question_id qMap ile kısıtlı.
  const buildAnswerRows = (respId: string) =>
    answersIn
      .filter((a) => a?.question_id && qMap.has(String(a.question_id)))
      .map((a) => normalizeAnswer(respId, String(a.question_id), qMap.get(String(a.question_id))!.type, a))
      .filter((r): r is NonNullable<typeof r> => r !== null)

  if (isPgEnabled()) {
    // Seçenek A — SİSTEM AKTÖRÜ (public/çok-org endpoint; izole edilecek katılımcı-org'u yok;
    // güvenlik server-set alanlarda YAPISAL, service-role paritesi). withActor ile W1+W2 TEK ATOMİK tx
    // → hata olursa rollback (kırılgan rollback-delete GEREKMEZ, yarım-yanıt imkânsız).
    const SYSTEM_ACTOR: Actor = {
      role: 'super_admin',
      orgId: null,
      userId: s?.uid ? String(s.uid) : '00000000-0000-0000-0000-000000000000',
    }
    try {
      await withActor(SYSTEM_ACTOR, async (c) => {
        // W1: survey_responses (server-set alanlar), returning id
        // channel_id sunucuda çözüldü (server-set); katılımcı enjekte edemez.
        const r1 = hasChannelCol
          ? await c.query<{ id: string }>(
              'insert into survey_responses (survey_id, respondent_user_id, source, meta, channel_id) values ($1, $2, $3, $4::jsonb, $5) returning id',
              [survey.id, respondentUserId, source, JSON.stringify(meta), channelId]
            )
          : await c.query<{ id: string }>(
              'insert into survey_responses (survey_id, respondent_user_id, source, meta) values ($1, $2, $3, $4::jsonb) returning id',
              [survey.id, respondentUserId, source, JSON.stringify(meta)]
            )
        const respId = String(r1.rows[0]?.id || '')
        // W2: survey_answers (response_id = W1'in döndüğü id). value_json jsonb → JSON.stringify + ::jsonb.
        const rows = buildAnswerRows(respId)
        if (rows.length) {
          const cols = ['response_id', 'question_id', 'value_num', 'value_text', 'value_json'] as const
          const params: unknown[] = []
          const tuples = rows.map((row) => {
            const ph = cols.map((col) => {
              const isJson = col === 'value_json'
              params.push(isJson ? (row.value_json == null ? null : JSON.stringify(row.value_json)) : (row as any)[col])
              return isJson ? `$${params.length}::jsonb` : `$${params.length}`
            })
            return `(${ph.join(', ')})`
          })
          await c.query(`insert into survey_answers (${cols.join(', ')}) values ${tuples.join(', ')}`, params)
        }
        // Katılım kaydı: yalnız "doldurdu" bilgisi, cevaba bağlanmaz.
        if (subj) {
          await c.query(
            'insert into survey_participation (survey_id, subject_hash) values ($1, $2) on conflict do nothing',
            [survey.id, subj]
          )
        }
      })
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Yanıt kaydedilemedi' }, { status: 400 })
    }
    return okResponse()
  }

  // Supabase yolu (deploy-güvenli fallback) — MEVCUT akış AYNEN (W1 → W2 → hata: rollback-delete)
  const { data: resp, error: respErr } = await supabase
    .from('survey_responses')
    .insert({
      survey_id: survey.id,
      respondent_user_id: respondentUserId,
      source,
      meta,
      ...(channelId ? { channel_id: channelId } : {}),
    })
    .select('id')
    .single()
  if (respErr || !resp) return NextResponse.json({ success: false, error: respErr?.message || 'Yanıt kaydedilemedi' }, { status: 400 })

  const rows = buildAnswerRows(String(resp.id))

  if (rows.length) {
    const { error: aErr } = await supabase.from('survey_answers').insert(rows)
    if (aErr) {
      // Yarım kayıt kalmasın
      await supabase.from('survey_responses').delete().eq('id', resp.id)
      return NextResponse.json({ success: false, error: aErr.message }, { status: 400 })
    }
  }

  if (subj) {
    try {
      await supabase.from('survey_participation').insert({ survey_id: survey.id, subject_hash: subj })
    } catch {
      /* katılım kaydı yazılamazsa yanıt yine de geçerlidir */
    }
  }

  return okResponse()
}

// ---- helpers ----
function hasText(v: unknown) {
  return typeof v === 'string' && v.trim().length > 0
}
function isEmptyJson(v: unknown) {
  if (v == null) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

function normalizeAnswer(responseId: string, questionId: string, type: SurveyQuestionType, a: AnswerInput) {
  const base = { response_id: responseId, question_id: questionId, value_num: null as number | null, value_text: null as string | null, value_json: null as unknown }
  switch (type) {
    case 'likert':
    case 'nps': {
      const n = Number(a.value_num)
      if (!Number.isFinite(n)) return null
      return { ...base, value_num: n }
    }
    case 'yesno': {
      // 1 = evet, 0 = hayır
      const n = a.value_num != null ? Number(a.value_num) : hasText(a.value_text) ? (String(a.value_text).toLowerCase().startsWith('e') || String(a.value_text).toLowerCase().startsWith('y') ? 1 : 0) : NaN
      if (!Number.isFinite(n)) return null
      return { ...base, value_num: n }
    }
    case 'single': {
      if (!hasText(a.value_text)) return null
      return { ...base, value_text: String(a.value_text).slice(0, 2000) }
    }
    case 'text': {
      if (!hasText(a.value_text)) return null
      return { ...base, value_text: String(a.value_text).slice(0, 5000) }
    }
    case 'date': {
      if (!hasText(a.value_text)) return null
      return { ...base, value_text: String(a.value_text).slice(0, 40) }
    }
    case 'multi':
    case 'rank': {
      if (isEmptyJson(a.value_json)) return null
      return { ...base, value_json: a.value_json }
    }
    default:
      return null
  }
}
