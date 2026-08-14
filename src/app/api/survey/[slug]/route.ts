import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByIp, getIp } from '@/lib/server/rate-limit'
import { getAssignedQuestionIds } from '@/lib/server/survey-assignments'
import type { SurveyQuestionType } from '@/types/database'
import { isPgEnabled } from '@/lib/db'
import { pgRead, pgReadOne } from '@/lib/server/pg-read'

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

function hashIp(ip: string) {
  // Basit FNV-1a — ham IP saklamamak için (KVKK)
  let h = 0x811c9dc5
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
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
        'select id, question_type, text, text_en, text_fr, options, scale_min, scale_max, is_required, sort_order from survey_questions where survey_id = $1 order by sort_order asc',
        [survey.id]
      )
    : await supabase
        .from('survey_questions')
        .select('id, question_type, text, text_en, text_fr, options, scale_min, scale_max, is_required, sort_order')
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

  const body = (await req.json().catch(() => ({}))) as { answers?: AnswerInput[]; lang?: string }
  const answersIn = Array.isArray(body.answers) ? body.answers : []

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

  const isIdentified = !survey.is_anonymous && !!s?.uid
  const meta = {
    ip_hash: hashIp(getIp(req) || ''),
    lang: String(body.lang || 'tr').slice(0, 2),
  }

  // ⚠️ ERTELENEN YAZMA (pg göçü): Anket yanıtı gönderimi KATILIMCI aksiyonudur —
  // anonim/public olabilir (s null) veya normal 'user'. withActor/buildActor org_admin
  // aktörü kurar; katılımcı için yanlış RLS bağlamı riski taşır. Doğru aktör modeli
  // (public/anon veya user-scoped) netleşene kadar bu 3 yazma (survey_responses insert,
  // survey_answers insert, rollback survey_responses delete) SUPABASE'te bırakıldı.
  // pg-only deploy'da supabase env yoksa POST zaten 503 döner (yukarıda).
  const { data: resp, error: respErr } = await supabase
    .from('survey_responses')
    .insert({
      survey_id: survey.id,
      respondent_user_id: isIdentified ? String(s!.uid) : null,
      source: s?.uid ? 'internal' : 'public',
      meta,
    })
    .select('id')
    .single()
  if (respErr || !resp) return NextResponse.json({ success: false, error: respErr?.message || 'Yanıt kaydedilemedi' }, { status: 400 })

  const rows = answersIn
    .filter((a) => a?.question_id && qMap.has(String(a.question_id)))
    .map((a) => {
      const type = qMap.get(String(a.question_id))!.type
      return normalizeAnswer(String(resp.id), String(a.question_id), type, a)
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (rows.length) {
    const { error: aErr } = await supabase.from('survey_answers').insert(rows)
    if (aErr) {
      // Yarım kayıt kalmasın
      await supabase.from('survey_responses').delete().eq('id', resp.id)
      return NextResponse.json({ success: false, error: aErr.message }, { status: 400 })
    }
  }

  return NextResponse.json({ success: true })
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
