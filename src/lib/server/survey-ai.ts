// Anket sonuçlarından AI destekli analiz üretimi için prompt kurulumu ve
// sayısal skorlardan deterministik SWOT üretimi (openaiJson ile birlikte kullanılır).

import type { SurveyAnalytics } from './survey-analytics'

export type SurveySwotItem = { name: string; detail?: string; score?: number }
export type SurveySwot = {
  strengths: SurveySwotItem[]
  weaknesses: SurveySwotItem[]
  opportunities: SurveySwotItem[]
  threats: SurveySwotItem[]
}

export type SurveyAiReport = {
  executiveSummary: string
  swot: SurveySwot
  sentiment: {
    positivePct: number
    neutralPct: number
    negativePct: number
    themes: Array<{ theme: string; sentiment: 'positive' | 'neutral' | 'negative'; mentions: number }>
  }
  recommendations: Array<{ title: string; priority: 'high' | 'medium' | 'low'; rationale: string; actions: string[] }>
  keyFindings: string[]
}

// Likert ortalamalarından deterministik ön-SWOT (AI'ya ipucu + fallback)
export function buildNumericSwot(analytics: SurveyAnalytics): SurveySwot {
  const scored = analytics.questions
    .filter((q) => q.question_type === 'likert' && typeof q.average === 'number')
    .map((q) => ({ name: q.text, score: q.average as number }))
    .sort((a, b) => b.score - a.score)

  const strengths = scored.filter((c) => c.score >= 4).slice(0, 5)
  const opportunities = scored.filter((c) => c.score >= 3.5 && c.score < 4).slice(0, 5)
  const weaknesses = scored.filter((c) => c.score < 3.5 && c.score >= 2.5).slice(-5).reverse()
  const threats = scored.filter((c) => c.score < 2.5).slice(-5).reverse()

  return { strengths, weaknesses, opportunities, threats }
}

// Analitiği kompakt, token-dostu bir metne indirger
function summarizeAnalytics(analytics: SurveyAnalytics): string {
  const lines: string[] = []
  lines.push(`Toplam yanıt: ${analytics.responseCount}, Soru sayısı: ${analytics.questionCount}`)
  if (analytics.overallLikertAverage != null) lines.push(`Genel Likert ortalaması: ${analytics.overallLikertAverage}/5`)
  if (analytics.npsOverall != null) lines.push(`Genel NPS: ${analytics.npsOverall}`)
  lines.push('')

  for (const q of analytics.questions) {
    let line = `• [${q.question_type}] ${q.text} (n=${q.answered})`
    if (typeof q.average === 'number') line += ` ort=${q.average}`
    if (q.nps) line += ` NPS=${q.nps.score} (promoter=${q.nps.promoters}, detractor=${q.nps.detractors})`
    if (q.distribution && q.distribution.length) {
      const top = q.distribution
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((d) => `${d.label}:${d.count}(${d.pct}%)`)
        .join(', ')
      line += ` dağılım=[${top}]`
    }
    if (q.rankAverages && q.rankAverages.length) {
      line += ` sıralama=[${q.rankAverages.map((r) => `${r.label}:${r.avgPosition}`).join(', ')}]`
    }
    lines.push(line)
    // Açık uçlu yanıtlardan örneklem (token kontrolü için en fazla 40)
    if (q.texts && q.texts.length) {
      const sample = q.texts.slice(0, 40)
      lines.push(`   Açık uçlu (${q.texts.length} yanıt, örneklem):`)
      for (const tx of sample) lines.push(`     - ${tx.replace(/\s+/g, ' ').slice(0, 240)}`)
    }
  }
  return lines.join('\n')
}

export function buildSurveyAiPrompt(input: {
  surveyTitle: string
  analytics: SurveyAnalytics
  lang: 'tr' | 'en' | 'fr'
}): { system: string; user: string } {
  const { surveyTitle, analytics, lang } = input
  const langName = lang === 'en' ? 'English' : lang === 'fr' ? 'French' : 'Turkish'

  const system = [
    'You are a senior survey research analyst and organizational consultant.',
    'You analyze survey results and produce actionable, evidence-based insights.',
    `Write ALL human-readable text strictly in ${langName}.`,
    'Base every statement ONLY on the provided data — never invent numbers.',
    'For sentiment, analyze the open-ended text samples; estimate percentages that sum to ~100.',
    'Return STRICT JSON matching the requested schema. No markdown, no extra keys.',
  ].join(' ')

  const schema = `{
  "executiveSummary": "string (3-5 sentences)",
  "swot": {
    "strengths": [{"name":"string","detail":"string"}],
    "weaknesses": [{"name":"string","detail":"string"}],
    "opportunities": [{"name":"string","detail":"string"}],
    "threats": [{"name":"string","detail":"string"}]
  },
  "sentiment": {
    "positivePct": number, "neutralPct": number, "negativePct": number,
    "themes": [{"theme":"string","sentiment":"positive|neutral|negative","mentions":number}]
  },
  "recommendations": [{"title":"string","priority":"high|medium|low","rationale":"string","actions":["string"]}],
  "keyFindings": ["string"]
}`

  const user = [
    `Anket başlığı: "${surveyTitle}"`,
    '',
    'ANALİZ VERİSİ:',
    summarizeAnalytics(analytics),
    '',
    'Yukarıdaki veriye dayanarak aşağıdaki JSON şemasını doldur:',
    schema,
    '',
    'Kurallar: SWOT her kategoride 2-5 madde; recommendations 3-6 madde; keyFindings 3-6 madde; themes 3-8 madde.',
  ].join('\n')

  return { system, user }
}
