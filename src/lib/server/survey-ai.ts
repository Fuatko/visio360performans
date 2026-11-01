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
    // Likert 1-5; puanlı seçmeli sorular kendi aralığına göre 1-5'e çevrilir.
    // Normalleştirme olmadan 1-9 ölçeğinde 4.2 alan bir soru "güçlü yön"
    // sayılırdı — oysa o ortalamanın altındadır.
    .filter(
      (q) =>
        (q.question_type === 'likert' && typeof q.average === 'number') ||
        typeof q.averageNormalized === 'number'
    )
    .map((q) => ({
      name: q.text,
      score:
        typeof q.averageNormalized === 'number' ? q.averageNormalized : (q.average as number),
    }))
    .sort((a, b) => b.score - a.score)

  const strengths = scored.filter((c) => c.score >= 4).slice(0, 5)
  const opportunities = scored.filter((c) => c.score >= 3.5 && c.score < 4).slice(0, 5)
  const weaknesses = scored.filter((c) => c.score < 3.5 && c.score >= 2.5).slice(-5).reverse()
  const threats = scored.filter((c) => c.score < 2.5).slice(-5).reverse()

  return { strengths, weaknesses, opportunities, threats }
}

// ---------------------------------------------------------------------------
// Takma ad (pseudonym) geri yazma — yapay zekâya gerçek grup/departman adı
// gitmez; yanıt geri geldiğinde takma adlar gerçek adlarla değiştirilir.
// Eşleştirme YALNIZ bellekte, istek süresince tutulur; veritabanına yazılmaz.
// ---------------------------------------------------------------------------

const TR_VOWELS = 'aeıioöuüAEIİOÖUÜ'
const TR_VOICELESS = 'çfhkpsştÇFHKPSŞT'

/** Sayının Türkçe okunuşunun son kelimesi (ek uyumu için). */
function trNumberTail(n: number): string {
  const units = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
  const tens = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']
  if (n === 0) return units[0]
  if (n % 10) return units[n % 10]
  if (n % 100) return tens[(n % 100) / 10]
  if (n % 1000) return 'yüz'
  return 'bin'
}

/** Tek harfin okunuşu ("A" → "a", "B" → "be", "K" → "ka"). */
function trLetterName(ch: string): string {
  const c = ch.toLocaleLowerCase('tr')
  if (TR_VOWELS.includes(c)) return c
  if (c === 'k') return 'ka'
  return c + 'e'
}

/** Adın okunuşundaki son parça: ek uyumu buna göre kurulur. */
function trSpokenTail(label: string): string {
  const m = label.trim().match(/([0-9]+|[\p{L}]+)[^\p{L}0-9]*$/u)
  if (!m) return label
  const tok = m[1]
  if (/^[0-9]+$/.test(tok)) return trNumberTail(Number(tok))
  if (tok.length === 1) return trLetterName(tok)
  return tok.toLocaleLowerCase('tr')
}

/**
 * Takma adın ardından gelen kesme işaretli eki, yeni adın ünlü uyumuna göre
 * yeniden kurar ("Grup 1'de" → "9-A'da"). Tanınmayan ek olduğu gibi kalır.
 */
function reharmonizeSuffix(label: string, suffix: string): string {
  const tail = trSpokenTail(label)
  const vowels = [...tail].filter((ch) => TR_VOWELS.includes(ch))
  const v = (vowels[vowels.length - 1] || 'e').toLocaleLowerCase('tr')
  const back = 'aıou'.includes(v)
  const round = 'oöuü'.includes(v)
  const last = tail.slice(-1)
  const endsVowel = TR_VOWELS.includes(last)
  const voiceless = TR_VOICELESS.includes(last)
  const A = back ? 'a' : 'e'
  const I = back ? (round ? 'u' : 'ı') : round ? 'ü' : 'i'
  const D = voiceless ? 't' : 'd'
  const s = suffix.toLocaleLowerCase('tr')
  if (/^[dt][ea]$/.test(s)) return D + A
  if (/^[dt][ea]n$/.test(s)) return D + A + 'n'
  if (/^[dt][ea]ki$/.test(s)) return D + A + 'ki'
  if (/^y?[ea]$/.test(s)) return (endsVowel ? 'y' : '') + A
  if (/^y?[ıiuü]$/.test(s)) return (endsVowel ? 'y' : '') + I
  if (/^n?[ıiuü]n$/.test(s)) return (endsVowel ? 'n' : '') + I + 'n'
  if (/^y?l[ea]$/.test(s)) return (endsVowel ? 'y' : '') + 'l' + A
  return suffix
}

function escapeRegExp(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Tek bir metinde takma adları gerçek adlarla değiştirir. */
export function restorePseudonymsInText(text: string, map: Map<string, string>): string {
  let out = text
  // Uzun takma ad önce: "Grup 10", "Grup 1"den önce değişsin.
  const keys = Array.from(map.keys()).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    const real = map.get(key) as string
    // Sınır kontrolü: "Grup 1" yalnız "Grup 10" içinde değil, kendi başına eşleşir.
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(key)}(?![\\p{L}\\p{N}])(?:(['’])([\\p{L}]+))?`, 'gu')
    out = out.replace(re, (_m, apos?: string, suffix?: string) =>
      apos && suffix ? `${real}${apos}${reharmonizeSuffix(real, suffix)}` : real
    )
  }
  return out
}

/** Nesnedeki bütün metin alanlarında takma adları gerçek adlarla değiştirir. */
export function restorePseudonyms<T>(value: T, map: Map<string, string>): T {
  if (!map.size) return value
  if (typeof value === 'string') return restorePseudonymsInText(value, map) as unknown as T
  if (Array.isArray(value)) return value.map((v) => restorePseudonyms(v, map)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = restorePseudonyms(v, map)
    return out as T
  }
  return value
}

// Analitiği kompakt, token-dostu bir metne indirger.
// Grup etiketleri takma adla yazılır; eşleştirme `pseudonyms` olarak döner.
function summarizeAnalytics(
  analytics: SurveyAnalytics,
  opts: { includeOpenText: boolean }
): { text: string; pseudonyms: Map<string, string> } {
  const lines: string[] = []
  const pseudonyms = new Map<string, string>()
  lines.push(`Toplam yanıt: ${analytics.responseCount}, Soru sayısı: ${analytics.questionCount}`)
  if (analytics.overallLikertAverage != null) lines.push(`Genel Likert ortalaması: ${analytics.overallLikertAverage}/5`)
  if (analytics.overallScoredAverage != null) {
    lines.push(`Genel puan ortalaması (ölçek kendi aralığında): ${analytics.overallScoredAverage}`)
  }
  if (analytics.npsOverall != null) lines.push(`Genel NPS: ${analytics.npsOverall}`)
  lines.push('')

  for (const q of analytics.questions) {
    let line = `• [${q.question_type}] ${q.text} (n=${q.answered})`
    if (typeof q.average === 'number') line += ` ort=${q.average}`
    if (typeof q.noOpinion === 'number' && q.noOpinion > 0) {
      line += ` fikrim-yok=${q.noOpinion}`
    }
    if (q.category) line += ` [alt tema: ${q.category}]`
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
    // Açık uçlu yanıtlar: ham metin YALNIZ yönetici bilerek seçtiyse gider
    // (KVKK — katılımcı metne isim yazmış olabilir). Varsayılan: yalnız sayı.
    if (q.texts && q.texts.length) {
      if (opts.includeOpenText) {
        const sample = q.texts.slice(0, 40)
        lines.push(`   Açık uçlu (${q.texts.length} yanıt, örneklem):`)
        for (const tx of sample) lines.push(`     - ${tx.replace(/\s+/g, ' ').slice(0, 240)}`)
      } else {
        lines.push(`   Açık uçlu (${q.texts.length} yanıt toplandı; metin paylaşılmadı)`)
      }
    }
  }
  if (analytics.channels && analytics.channels.length) {
    const shown = analytics.channels.filter((c) => !c.suppressed && c.average != null)
    if (shown.length) {
      lines.push('')
      lines.push('SINIF KIRILIMI (yalnız eşiği geçen sınıflar):')
      // Gerçek grup etiketi yapay zekâya GİTMEZ: "Grup 1", "Grup 2" … olarak
      // yazılır; yanıt geri geldiğinde gerçek etiketle değiştirilir.
      shown.forEach((c, i) => {
        const alias = `Grup ${i + 1}`
        pseudonyms.set(alias, String(c.label))
        lines.push(`• ${alias}: ort=${c.average} (n=${c.responses})`)
      })
    }
  }
  if (analytics.categories && analytics.categories.length) {
    lines.push('')
    lines.push('ALT TEMA ORTALAMALARI (düşükten yükseğe):')
    for (const c of analytics.categories) {
      lines.push(
        `• ${c.name}: ort=${c.average ?? '-'} (n=${c.answered}, soru=${c.questionCount}, fikrim-yok=%${c.noOpinionPct})`
      )
    }
  }
  return { text: lines.join('\n'), pseudonyms }
}

export function buildSurveyAiPrompt(input: {
  surveyTitle: string
  analytics: SurveyAnalytics
  lang: 'tr' | 'en' | 'fr'
  /** Açık uçlu cevapların ham metni gönderilsin mi (varsayılan: hayır). */
  includeOpenText?: boolean
}): { system: string; user: string; pseudonyms: Map<string, string> } {
  const { surveyTitle, analytics, lang } = input
  const summary = summarizeAnalytics(analytics, { includeOpenText: input.includeOpenText === true })
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
    summary.text,
    '',
    'Yukarıdaki veriye dayanarak aşağıdaki JSON şemasını doldur:',
    schema,
    '',
    '"fikrim-yok" sayısı yüksek olan sorularda bunu ayrı bir bulgu olarak ele al: uygulama ya yok ya da katılımcılar tarafından bilinmiyor. Bunu düşük puanla karıştırma.',
    'Alt tema ortalamaları verildiyse güçlü ve zayıf alanları öncelikle bunlar üzerinden tarif et; tek tek sorulara örnek olarak başvur.',
    'Açık uçlu yanıtların metni paylaşılmadıysa bu sorular hakkında içerik yorumu yapma; yalnızca yanıt sayısını olgu olarak kullan.',
    'Kurallar: SWOT her kategoride 2-5 madde; recommendations 3-6 madde; keyFindings 3-6 madde; themes 3-8 madde.',
  ].join('\n')

  return { system, user, pseudonyms: summary.pseudonyms }
}
