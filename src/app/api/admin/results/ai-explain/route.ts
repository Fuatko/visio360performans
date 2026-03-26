import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { openaiJson } from '@/lib/server/openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 30

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

type Body = {
  person: {
    name: string
    department: string
    selfScore?: number
    teamScore?: number
    overallScore?: number
    standardAvg?: number
    evaluatorCount?: number
    periodDelta?: number | null
    avgGap?: number | null
    riskScore?: number | null
    riskBreakdown?: { lowPerformance?: number; trend?: number; gap?: number; coverage?: number } | null
  }
  tableHeaders?: Array<{ key: string; label: string; value: string }>
}

type AiExplain = {
  oneLiner: string
  headerGlossary: Array<{
    header: string
    value: string
    meaning: string
    whatToDo: string
  }>
  summary: string
  nextSteps: string[]
  caveats: string[]
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:results:ai-explain:post', String(s.uid || ''), 10, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla AI isteği', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const body = (await req.json().catch(() => ({}))) as Body

  const person = body?.person || ({} as any)
  const name = String(person?.name || '').trim()
  if (!name) return NextResponse.json({ success: false, error: 'Kişi verisi eksik' }, { status: 400 })

  const langName = lang === 'fr' ? 'French' : lang === 'en' ? 'English' : 'Turkish'

  const system = `You are an HR analytics assistant for a 360° performance reporting module.
You receive ONLY the numeric values provided. Never invent values.
Your job: explain table headers briefly, interpret the person's values, and suggest actionable next steps.
Output MUST be valid JSON and all user-facing strings must be in ${langName}.`

  const user = `Language: ${langName}

Input JSON (person + optional rendered table headers/values):
${JSON.stringify(body)}

Return JSON with this exact shape:
{
  "oneLiner": "1 short sentence: overall status",
  "headerGlossary": [
    { "header": "string", "value": "string", "meaning": "1 sentence", "whatToDo": "1 sentence" }
  ],
  "summary": "2-4 sentences in plain language for managers",
  "nextSteps": ["3-6 bullets, concrete actions"],
  "caveats": ["1-3 bullets about interpretation limits (coverage, period overlap, etc.)"]
}

Rules:
- Keep it short and non-technical.
- If a value is missing/unknown, say so instead of guessing.
- Prefer actions tied to low scores, high risk, large gaps, negative trend, or low evaluator count.
- Do not mention environment variables, API keys, Vercel, or technical deployment details.`

  const ai = await openaiJson<AiExplain>({
    system,
    user,
    temperature: 0.25,
    max_tokens: 900,
    timeoutMs: 25000,
  })

  if (!ai.ok) {
    const status = ai.error === 'OPENAI_API_KEY missing' ? 503 : ai.status && ai.status >= 400 ? ai.status : 502
    return NextResponse.json({ success: false, error: ai.error, detail: ai.detail }, { status })
  }

  return NextResponse.json({ success: true, ai: ai.data, model: ai.model, generatedAt: new Date().toISOString() })
}

