import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { openaiJson } from '@/lib/server/openai'
import { computeSurveyAnalytics } from '@/lib/server/survey-analytics'
import { buildSurveyAiPrompt, buildNumericSwot, type SurveyAiReport } from '@/lib/server/survey-ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
/** OpenAI uzun JSON yanıtı: Vercel Pro'da 60 sn'ye kadar */
export const maxDuration = 60

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

type Body = { survey_id?: string; refresh?: boolean; lang?: string }

// GET: önbellekteki son analizi döner (varsa)
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Yapılandırma eksik' }, { status: 503 })

  const surveyId = String(new URL(req.url).searchParams.get('survey_id') || '').trim()
  if (!surveyId) return NextResponse.json({ success: false, error: 'survey_id gerekli' }, { status: 400 })

  const guard = await authorizeSurvey(supabase, surveyId, s)
  if (!guard.ok) return guard.res

  const { data: cached } = await supabase
    .from('survey_ai_analyses')
    .select('payload, model, response_count, created_at')
    .eq('survey_id', surveyId)
    .eq('kind', 'summary')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    success: true,
    cached: cached
      ? { report: (cached as any).payload, model: (cached as any).model, response_count: (cached as any).response_count, created_at: (cached as any).created_at }
      : null,
  })
}

// POST: yeni analiz üretir (OpenAI) ve önbelleğe yazar
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:surveys:ai', String(s.uid || ''), 12, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Yapılandırma eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const surveyId = String(body.survey_id || '').trim()
  if (!surveyId) return NextResponse.json({ success: false, error: 'survey_id gerekli' }, { status: 400 })
  const lang = (['tr', 'en', 'fr'].includes(String(body.lang)) ? body.lang : 'tr') as 'tr' | 'en' | 'fr'

  const guard = await authorizeSurvey(supabase, surveyId, s)
  if (!guard.ok) return guard.res
  const survey = guard.survey

  // Analitik topla
  const { data: questions } = await supabase
    .from('survey_questions')
    .select('id, question_type, text, text_en, text_fr, options, scale_min, scale_max, sort_order')
    .eq('survey_id', surveyId)
    .order('sort_order', { ascending: true })
  const { data: responses } = await supabase.from('survey_responses').select('id').eq('survey_id', surveyId)
  const responseIds = (responses || []).map((r: any) => r.id)

  if (responseIds.length === 0) {
    return NextResponse.json({ success: false, error: 'no_responses', message: 'Analiz için en az bir yanıt gerekli.' }, { status: 400 })
  }

  let answers: any[] = []
  const chunkSize = 500
  for (let i = 0; i < responseIds.length; i += chunkSize) {
    const chunk = responseIds.slice(i, i + chunkSize)
    const { data } = await supabase
      .from('survey_answers')
      .select('question_id, value_num, value_text, value_json')
      .in('response_id', chunk)
    if (data) answers = answers.concat(data)
  }

  const analytics = computeSurveyAnalytics(questions || [], responses || [], answers)
  const { system, user } = buildSurveyAiPrompt({ surveyTitle: (survey as any).title || '', analytics, lang })

  const ai = await openaiJson<SurveyAiReport>({ system, user, max_tokens: 2200, temperature: 0.3, timeoutMs: 55000 })

  if (!ai.ok) {
    // AI erişilemezse deterministik SWOT ile kısmi sonuç döndür
    const fallbackSwot = buildNumericSwot(analytics)
    return NextResponse.json(
      { success: false, error: ai.error, detail: ai.detail, fallback: { swot: fallbackSwot } },
      { status: ai.status || 502 }
    )
  }

  // Zayıf/boş SWOT gelirse sayısal SWOT ile güçlendir
  const report = ai.data
  if (!report.swot || (!report.swot.strengths?.length && !report.swot.weaknesses?.length)) {
    report.swot = buildNumericSwot(analytics)
  }

  // Önbelleğe yaz
  await supabase.from('survey_ai_analyses').insert({
    survey_id: surveyId,
    kind: 'summary',
    payload: report as any,
    model: ai.model,
    response_count: analytics.responseCount,
  })

  return NextResponse.json({ success: true, report, model: ai.model, response_count: analytics.responseCount })
}

async function authorizeSurvey(supabase: any, surveyId: string, s: any) {
  const { data: survey } = await supabase.from('surveys').select('id, organization_id, title').eq('id', surveyId).maybeSingle()
  if (!survey) return { ok: false as const, res: NextResponse.json({ success: false, error: 'Anket bulunamadı' }, { status: 404 }) }
  if (s.role === 'org_admin' && String(survey.organization_id || '') !== String(s.org_id || '')) {
    return { ok: false as const, res: NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 }) }
  }
  return { ok: true as const, survey }
}
