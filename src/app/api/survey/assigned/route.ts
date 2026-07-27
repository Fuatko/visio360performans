import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { getAssignedQuestionIds } from '@/lib/server/survey-assignments'

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

function isOpen(survey: any): boolean {
  if (survey.status !== 'active') return false
  const today = new Date().toISOString().slice(0, 10)
  if (survey.start_date && today < String(survey.start_date)) return false
  if (survey.end_date && today > String(survey.end_date)) return false
  return true
}

// ---------------------------------------------------------------------------
// GET: giriş yapan kullanıcıya atanmış anketler (widget için)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  const rl = await rateLimitByUser(req, 'survey:assigned:get', String(s.uid), 120, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Yapılandırma eksik' }, { status: 503 })

  const userId = String(s.uid)

  // Atamalar (tablo yoksa özellik pasif → boş liste)
  const assignRes = await supabase
    .from('survey_assignments')
    .select('survey_id, status')
    .eq('user_id', userId)
    .neq('status', 'cancelled')
  if (assignRes.error) {
    // Tablo henüz migrate edilmemiş olabilir — sessizce boş dön
    return NextResponse.json({ success: true, items: [] })
  }
  const assignments = (assignRes.data || []) as Array<{ survey_id: string; status: string }>
  if (!assignments.length) return NextResponse.json({ success: true, items: [] })

  const surveyIds = Array.from(new Set(assignments.map((a) => String(a.survey_id))))
  const { data: surveys } = await supabase
    .from('surveys')
    .select('id, slug, title, title_en, title_fr, status, start_date, end_date, is_anonymous')
    .in('id', surveyIds)

  // Kullanıcının daha önce yanıtladığı anketler (anonim olmayanlarda tespit edilebilir)
  const { data: responses } = await supabase
    .from('survey_responses')
    .select('survey_id')
    .eq('respondent_user_id', userId)
    .in('survey_id', surveyIds)
  const respondedSet = new Set<string>(((responses || []) as Array<{ survey_id: string }>).map((r) => String(r.survey_id)))

  const items: any[] = []
  for (const survey of (surveys || []) as any[]) {
    if (!isOpen(survey)) continue // yalnızca yanıtlamaya açık olanlar
    const assigned = await getAssignedQuestionIds(supabase, String(survey.id), userId)
    const questionCount = assigned.restricted ? assigned.questionIds.size : 0
    if (questionCount === 0) continue // etkin soru yoksa gösterme
    items.push({
      survey_id: survey.id,
      slug: survey.slug,
      title: survey.title,
      title_en: survey.title_en,
      title_fr: survey.title_fr,
      question_count: questionCount,
      completed: respondedSet.has(String(survey.id)),
    })
  }

  return NextResponse.json({ success: true, items })
}
