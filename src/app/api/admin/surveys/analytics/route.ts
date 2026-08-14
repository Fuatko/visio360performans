import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { computeSurveyAnalytics, type SurveyQuestionLite } from '@/lib/server/survey-analytics'
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

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:surveys:analytics', String(s.uid || ''), 60, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Yapılandırma eksik' }, { status: 503 })

  const id = String(new URL(req.url).searchParams.get('id') || '').trim()
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })

  // OKUMA fallback: org-scope id=$1 birebir (org kontrolü sonraki JS'te survey.organization_id ile).
  const { data: survey } = isPgEnabled()
    ? await pgReadOne<{ id: string; organization_id: string; title: string }>('select id, organization_id, title from surveys where id = $1 limit 1', [id])
    : await supabase.from('surveys').select('id, organization_id, title').eq('id', id).maybeSingle()
  if (!survey) return NextResponse.json({ success: false, error: 'Anket bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && String((survey as any).organization_id || '') !== String(s.org_id || '')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
  }

  // OKUMA fallback: org-scope survey_id=$1 birebir (survey org doğrulandı).
  const { data: questions } = isPgEnabled()
    ? await pgRead<SurveyQuestionLite>('select id, question_type, text, text_en, text_fr, options, scale_min, scale_max, sort_order from survey_questions where survey_id = $1 order by sort_order asc', [id])
    : await supabase
        .from('survey_questions')
        .select('id, question_type, text, text_en, text_fr, options, scale_min, scale_max, sort_order')
        .eq('survey_id', id)
        .order('sort_order', { ascending: true })

  const { data: responses } = isPgEnabled()
    ? await pgRead<{ id: string; submitted_at: string | null }>('select id, submitted_at from survey_responses where survey_id = $1', [id])
    : await supabase.from('survey_responses').select('id, submitted_at').eq('survey_id', id)
  const responseIds = (responses || []).map((r: any) => r.id)

  let answers: any[] = []
  if (responseIds.length) {
    // Büyük veri için parça parça çek
    const chunkSize = 500
    for (let i = 0; i < responseIds.length; i += chunkSize) {
      const chunk = responseIds.slice(i, i + chunkSize)
      // OKUMA fallback: .in('response_id',chunk)→= any($1::uuid[]). org-scope: chunk bu anketin yanıt id'leri.
      const { data } = isPgEnabled()
        ? await pgRead('select question_id, value_num, value_text, value_json from survey_answers where response_id = any($1::uuid[])', [chunk])
        : await supabase
            .from('survey_answers')
            .select('question_id, value_num, value_text, value_json')
            .in('response_id', chunk)
      if (data) answers = answers.concat(data)
    }
  }

  const analytics = computeSurveyAnalytics(questions || [], responses || [], answers)
  return NextResponse.json({ success: true, analytics })
}
