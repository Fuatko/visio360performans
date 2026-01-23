import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { openaiJson } from '@/lib/server/openai'

export const runtime = 'nodejs'

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

function pick(lang: string, tr: string, en: string, fr: string) {
  return lang === 'fr' ? fr : lang === 'en' ? en : tr
}

type Suggestion = {
  trainings: Array<{
    id: string
    title: string
    provider?: string | null
    url?: string | null
    duration_weeks?: number | null
    why: string
    weekly_plan: string[]
    success_criteria: string[]
  }>
  summary: string
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:action-plans:ai-suggest', String(s.uid || ''), 10, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as any
  const taskId = String(body.task_id || '').trim()
  const lang = String(body.lang || 'tr').toLowerCase()
  if (!taskId) return NextResponse.json({ success: false, error: 'task_id gerekli' }, { status: 400 })

  // Load task -> plan -> org scope. Avoid PII; do NOT send user name/email to AI.
  const { data: task, error: tErr } = await supabase
    .from('action_plan_tasks')
    .select('id, plan_id, area, baseline_score, target_score, planned_at, learning_started_at, status')
    .eq('id', taskId)
    .maybeSingle()
  if (tErr || !task) return NextResponse.json({ success: false, error: 'Görev bulunamadı' }, { status: 404 })

  const { data: plan, error: pErr } = await supabase
    .from('action_plans')
    .select('id, organization_id, user_id, period_id')
    .eq('id', String((task as any).plan_id))
    .maybeSingle()
  if (pErr || !plan) return NextResponse.json({ success: false, error: 'Plan bulunamadı' }, { status: 404 })

  if (s.role === 'org_admin' && String((plan as any).organization_id || '') !== String(s.org_id || '')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const orgId = String((plan as any).organization_id || '')
  const area = String((task as any).area || '').trim() || 'Genel'
  const baseline = typeof (task as any).baseline_score === 'number' ? Number((task as any).baseline_score) : null
  const target = typeof (task as any).target_score === 'number' ? Number((task as any).target_score) : null

  // Load candidate trainings from catalog (org-specific + global)
  let trainings: any[] = []
  try {
    const { data: rows } = await supabase
      .from('training_catalog')
      .select('id, organization_id, area, title, provider, url, language, duration_weeks, hours, level, tags, is_active')
      .eq('is_active', true)
      .or(`organization_id.eq.${orgId},organization_id.is.null`)
      .limit(60)
    trainings = (rows || [])
      .filter((r: any) => String(r.area || '').toLowerCase().includes(area.toLowerCase()) || (r.tags || []).some((x: any) => String(x).toLowerCase().includes(area.toLowerCase())))
      .slice(0, 25)
  } catch {
    trainings = []
  }

  if (!trainings.length) {
    return NextResponse.json(
      {
        success: false,
        error: pick(
          lang,
          'Eğitim kataloğunda bu alan için kayıt bulunamadı. Önce training_catalog tablosuna eğitim ekleyin.',
          'No matching trainings found in catalog. Please add items to training_catalog first.',
          'Aucune formation correspondante dans le catalogue. Ajoutez d’abord des éléments à training_catalog.'
        ),
      },
      { status: 400 }
    )
  }

  const system = `You are an HR/L&D assistant. Output ONLY valid JSON. No markdown. Do not include personal data.`
  const userPrompt = JSON.stringify(
    {
      language: lang,
      goal: {
        area,
        baseline_score: baseline,
        target_score: target,
        duration_months: 3,
      },
      catalog: trainings.map((t: any) => ({
        id: String(t.id),
        title: String(t.title),
        provider: t.provider ? String(t.provider) : null,
        url: t.url ? String(t.url) : null,
        duration_weeks: typeof t.duration_weeks === 'number' ? t.duration_weeks : null,
        language: t.language ? String(t.language) : null,
        level: t.level ? String(t.level) : null,
        tags: Array.isArray(t.tags) ? t.tags.map((x: any) => String(x)) : [],
      })),
      task: {
        already_planned: Boolean((task as any).planned_at),
        already_learning_started: Boolean((task as any).learning_started_at),
        status: String((task as any).status || 'pending'),
      },
      instructions: [
        'Pick 1-2 trainings from catalog that best match the area and 3-month duration.',
        'Provide a week-by-week plan (max 12 entries).',
        'Provide measurable success criteria (3-6 bullets).',
        'Return JSON with: trainings[], summary.',
      ],
    },
    null,
    2
  )

  const ai = await openaiJson<Suggestion>({ system, user: userPrompt, temperature: 0.2, max_tokens: 1000 })
  if (!ai.ok) {
    return NextResponse.json({ success: false, error: 'AI önerisi üretilemedi', detail: ai.detail || ai.error }, { status: 502 })
  }

  const suggestion = ai.data
  const selectedFirst = suggestion?.trainings?.[0]?.id ? String(suggestion.trainings[0].id) : null

  // Persist to DB
  const now = new Date().toISOString()
  const { error: uErr } = await supabase
    .from('action_plan_tasks')
    .update({
      ai_suggestion: suggestion as any,
      ai_text: suggestion?.summary ? String(suggestion.summary) : null,
      ai_generated_at: now,
      ai_generated_by: String(s.uid || ''),
      ai_model: ai.model,
      training_id: selectedFirst,
      updated_at: now,
    })
    .eq('id', taskId)
  if (uErr) return NextResponse.json({ success: false, error: (uErr as any)?.message || 'Kaydetme hatası' }, { status: 400 })

  return NextResponse.json({ success: true, suggestion, model: ai.model })
}

