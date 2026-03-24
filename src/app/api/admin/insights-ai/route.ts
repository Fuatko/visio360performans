import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { computeOrgInsights } from '@/lib/server/compute-org-insights'
import { openaiJson } from '@/lib/server/openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
/** OpenAI uzun JSON yanıtı + Vercel Pro: 60 sn’ye kadar (Hobby planda üst sınır 10 sn olabilir) */
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

function normDeptKey(s: string) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
    .replace(/\u0131/g, 'i')
}

type Body = {
  period_id?: string
  org_id?: string
  department?: string | null
}

type AiRoadmap = {
  executiveSummary: string
  keyFindings: string[]
  roadmap: Array<{
    title: string
    priority: 'high' | 'medium' | 'low'
    rationale: string
    actions: string[]
    timelineHint: string
    successIndicators: string[]
  }>
  deepDive: {
    alignmentSelfVsTeam: string
    departmentCommentary: string
    categoryFocus: string
    trainingAndDevelopment: string
  }
  quickWins: string[]
  risksAndWatchouts: string[]
  suggestedMetrics: string[]
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:insights-ai:post', String(s.uid || ''), 6, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla AI isteği', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const body = (await req.json().catch(() => ({}))) as Body
  const periodId = String(body.period_id || '').trim()
  const orgId = String(body.org_id || '').trim()
  const dept = String(body.department || '').trim()
  const deptKey = dept ? normDeptKey(dept) : ''
  const orgToUse = s.role === 'org_admin' ? String(s.org_id || '') : orgId

  if (!periodId || !orgToUse) {
    return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })
  }

  let insights
  try {
    insights = await computeOrgInsights(supabase, { periodId, orgId: orgToUse, deptKey, lang })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: String(e?.message || 'Veri hesaplanamadı') }, { status: 400 })
  }

  if (!insights.summary.peopleCount) {
    return NextResponse.json({ success: false, error: 'Bu filtre için analiz verisi yok' }, { status: 400 })
  }

  const trimQ = (rows: typeof insights.topQuestions) =>
    rows.map((q) => ({
      ...q,
      text: String(q.text || '').length > 200 ? `${String(q.text).slice(0, 197)}…` : q.text,
    }))

  const compact = {
    summary: insights.summary,
    byDepartment: insights.byDepartment.slice(0, 12),
    byManager: insights.byManager.slice(0, 12),
    topCategories: insights.topCategories,
    bottomCategories: insights.bottomCategories,
    topQuestions: trimQ(insights.topQuestions),
    bottomQuestions: trimQ(insights.bottomQuestions),
    swot: insights.swot,
    generatedAt: insights.generatedAt,
  }

  const openAiTimeoutMs = Number((process.env.OPENAI_INSIGHTS_TIMEOUT_MS || '').trim()) || 55000

  const langName = lang === 'fr' ? 'French' : lang === 'en' ? 'English' : 'Turkish'

  const system = `You are a senior HR / organizational development analyst for 360° performance data.
You receive ONLY aggregated JSON (self vs team scores, departments, categories, SWOT-style signals). Never invent numeric values; interpret the given numbers.
Output MUST be valid JSON matching the requested schema. All user-facing strings must be in ${langName}.`

  const userPrompt = `Language: ${langName} (all text fields in this language).

Data (JSON):
${JSON.stringify(compact)}

Return JSON with this exact shape:
{
  "executiveSummary": "string, 2-4 sentences for leadership",
  "keyFindings": ["3-6 bullet insights tied to the data"],
  "roadmap": [
    {
      "title": "string",
      "priority": "high" | "medium" | "low",
      "rationale": "string",
      "actions": ["3-5 concrete actions"],
      "timelineHint": "e.g. 0-30 days / 1-2 quarters",
      "successIndicators": ["2-4 measurable indicators"]
    }
  ],
  "deepDive": {
    "alignmentSelfVsTeam": "paragraph on self vs team gap using summary and categories",
    "departmentCommentary": "paragraph referencing byDepartment patterns",
    "categoryFocus": "paragraph on top/bottom categories and what it implies",
    "trainingAndDevelopment": "paragraph with training priorities"
  },
  "quickWins": ["3-5 items"],
  "risksAndWatchouts": ["3-5 items"],
  "suggestedMetrics": ["4-8 KPIs to track next period"]
}

Rules:
- Produce 3-5 roadmap items with mixed priorities (concise).
- Be specific to the provided category and question names when relevant.
- Do not output markdown, only plain strings inside JSON.`

  const ai = await openaiJson<AiRoadmap>({
    system,
    user: userPrompt,
    temperature: 0.35,
    max_tokens: 2800,
    timeoutMs: openAiTimeoutMs,
  })

  if (!ai.ok) {
    const missing = ai.error === 'OPENAI_API_KEY missing'
    const timedOut = (ai.detail || '').includes('timed out') || ai.status === 504
    const status = missing ? 503 : timedOut ? 504 : ai.status && ai.status >= 400 ? ai.status : 502
    return NextResponse.json(
      {
        success: false,
        error: missing
          ? 'OPENAI_API_KEY tanımlı değil (Vercel env)'
          : timedOut
            ? 'OpenAI yanıt süresi aşıldı. OPENAI_INSIGHTS_TIMEOUT_MS artırın veya Vercel Pro + maxDuration kullanın.'
            : ai.error,
        detail: ai.detail,
      },
      { status }
    )
  }

  return NextResponse.json({
    success: true,
    ai: ai.data,
    model: ai.model,
    generatedAt: new Date().toISOString(),
    basedOn: insights.generatedAt,
  })
}
