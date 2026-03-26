import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { openaiJson } from '@/lib/server/openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

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

function n(v: unknown): number | null {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function fmt(v: number | null, d = 1) {
  if (v === null) return '—'
  return v.toFixed(d)
}

function buildFallback(body: Body, lang: string): AiExplain {
  const p = body.person || ({} as any)
  const self = n(p.selfScore)
  const team = n(p.teamScore)
  const overall = n(p.overallScore)
  const risk = n(p.riskScore)
  const delta = n(p.periodDelta)
  const gap = n(p.avgGap)
  const evalN = n(p.evaluatorCount)
  const isTr = lang !== 'en' && lang !== 'fr'
  const isFr = lang === 'fr'

  const status =
    overall === null
      ? isTr
        ? 'Skor bilgisi eksik.'
        : isFr
          ? 'Score indisponible.'
          : 'Score is missing.'
      : overall >= 4
        ? isTr
          ? 'Genel performans güçlü görünüyor.'
          : isFr
            ? 'La performance globale est solide.'
            : 'Overall performance looks strong.'
        : overall >= 3
          ? isTr
            ? 'Genel performans orta seviyede.'
            : isFr
              ? 'La performance globale est moyenne.'
              : 'Overall performance is moderate.'
          : isTr
            ? 'Genel performans gelişim gerektiriyor.'
            : isFr
              ? 'La performance globale nécessite un développement.'
              : 'Overall performance needs development.'

  const headers = (body.tableHeaders || []).slice(0, 12).map((h) => ({
    header: String(h.label || h.key || ''),
    value: String(h.value || '—'),
    meaning: isTr
      ? `${String(h.label || h.key)} bu kişinin ilgili göstergedeki mevcut değerini ifade eder.`
      : isFr
        ? `${String(h.label || h.key)} indique la valeur actuelle de cette personne pour cet indicateur.`
        : `${String(h.label || h.key)} shows this person's current value for that indicator.`,
    whatToDo: isTr
      ? 'Bu değeri ekip ortalaması ve dönem trendiyle birlikte değerlendirin.'
      : isFr
        ? "Évaluez cette valeur avec la moyenne d'équipe et la tendance de période."
        : 'Evaluate this value together with team average and period trend.',
  }))

  const steps = [
    isTr
      ? `En düşük 1-2 kategori için 30 günlük gelişim aksiyonu planlayın (genel: ${fmt(overall)}).`
      : isFr
        ? `Planifiez des actions de développement sur 30 jours pour 1-2 catégories faibles (global: ${fmt(overall)}).`
        : `Plan 30-day development actions for the weakest 1-2 categories (overall: ${fmt(overall)}).`,
    isTr
      ? `Öz (${fmt(self)}) ve ekip (${fmt(team)}) arasındaki farkı düzenli geri bildirimle hizalayın.`
      : isFr
        ? `Alignez l'écart entre auto (${fmt(self)}) et équipe (${fmt(team)}) via des feedbacks réguliers.`
        : `Align the self (${fmt(self)}) vs team (${fmt(team)}) gap with regular feedback cycles.`,
    isTr
      ? `Kapsamı artırın (değerlendirici: ${fmt(evalN, 0)}); daha güvenilir sonuç için farklı rollerden geri bildirim alın.`
      : isFr
        ? `Augmentez la couverture (évaluateurs: ${fmt(evalN, 0)}) pour une mesure plus fiable.`
        : `Increase coverage (evaluators: ${fmt(evalN, 0)}) for more reliable measurement.`,
  ]

  if (delta !== null && delta < 0) {
    steps.unshift(
      isTr
        ? `Dönemsel düşüş (${fmt(delta)}) olduğu için ilk 2 hafta kısa check-in toplantıları yapın.`
        : isFr
          ? `Vu la baisse périodique (${fmt(delta)}), faites des check-ins hebdomadaires au début.`
          : `Because of period decline (${fmt(delta)}), run short weekly check-ins in the first weeks.`
    )
  }
  if (risk !== null && risk >= 70) {
    steps.unshift(
      isTr
        ? `Risk puanı yüksek (${fmt(risk, 0)}/100); önceliği bu kişiye verin ve yönetici koçluğu ekleyin.`
        : isFr
          ? `Risque élevé (${fmt(risk, 0)}/100) : priorisez cette personne avec coaching manager.`
          : `High risk (${fmt(risk, 0)}/100): prioritize this person with manager coaching.`
    )
  }

  const caveats = [
    isTr
      ? 'Yorumlar, mevcut dönemdeki veri kapsamına bağlıdır.'
      : isFr
        ? 'Les commentaires dépendent de la couverture des données de la période.'
        : 'Interpretation depends on coverage of current-period data.',
    isTr
      ? `Gap (${fmt(gap)}) ve trend (${fmt(delta)}) verisi eksikse aksiyonlar genel tutulur.`
      : isFr
        ? `Si écart (${fmt(gap)}) ou tendance (${fmt(delta)}) manquent, les actions restent générales.`
        : `If gap (${fmt(gap)}) or trend (${fmt(delta)}) is missing, actions are more generic.`,
  ]

  return {
    oneLiner: status,
    headerGlossary: headers,
    summary: isTr
      ? `Bu kişi için skorlar kısa vadede takip edilmesi gereken bir profile işaret ediyor. Genel skor ${fmt(overall)}, risk ${fmt(risk, 0)}/100, dönem farkı ${fmt(delta)}. Öncelik; düşük alanları netleştirip düzenli geri bildirim döngüsü kurmak.`
      : isFr
        ? `Ce profil nécessite un suivi court terme. Score global ${fmt(overall)}, risque ${fmt(risk, 0)}/100, delta période ${fmt(delta)}. Priorité: clarifier les points faibles et installer des feedbacks réguliers.`
        : `This profile needs short-term follow-up. Overall ${fmt(overall)}, risk ${fmt(risk, 0)}/100, period delta ${fmt(delta)}. Priority is to clarify weak areas and run regular feedback cycles.`,
    nextSteps: steps.slice(0, 6),
    caveats: caveats.slice(0, 3),
  }
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
    timeoutMs: Number((process.env.OPENAI_INSIGHTS_TIMEOUT_MS || '').trim()) || 55000,
  })

  if (!ai.ok) {
    // Graceful fallback: do not block user due to transient AI issues.
    return NextResponse.json({
      success: true,
      ai: buildFallback(body, lang),
      model: 'fallback',
      generatedAt: new Date().toISOString(),
      warning: ai.error,
    })
  }

  return NextResponse.json({ success: true, ai: ai.data, model: ai.model, generatedAt: new Date().toISOString() })
}

