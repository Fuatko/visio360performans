// Anket yanıtlarının soru bazında istatistiksel analizi.
// Server-side agregasyon; UI grafikleri ve AI/SWOT bu çıktıyı kullanır.

export type SurveyQuestionLite = {
  id: string
  question_type: 'likert' | 'single' | 'multi' | 'text' | 'nps' | 'yesno' | 'date' | 'rank'
  text: string
  text_en?: string | null
  text_fr?: string | null
  options?: unknown
  scale_min?: number | null
  scale_max?: number | null
  sort_order?: number
}

export type SurveyAnswerLite = {
  question_id: string
  value_num: number | null
  value_text: string | null
  value_json: unknown
}

export type QuestionAnalytics = {
  question_id: string
  question_type: SurveyQuestionLite['question_type']
  text: string
  answered: number
  // sayısal (likert)
  average?: number
  // dağılım: etiket -> adet
  distribution?: Array<{ label: string; count: number; pct: number }>
  // nps
  nps?: { score: number; promoters: number; passives: number; detractors: number }
  // yesno
  yesno?: { yes: number; no: number }
  // rank: seçenek -> ortalama pozisyon (düşük = daha iyi)
  rankAverages?: Array<{ label: string; avgPosition: number }>
  // açık uçlu metinler (AI için) — en fazla 300
  texts?: string[]
}

export type SurveyAnalytics = {
  responseCount: number
  questionCount: number
  questions: QuestionAnalytics[]
  // hızlı SWOT için özet metrikler
  overallLikertAverage: number | null
  npsOverall: number | null
}

function asOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x))
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).options)) return (raw as any).options.map((x: any) => String(x))
  return []
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

export function computeSurveyAnalytics(
  questions: SurveyQuestionLite[],
  responses: Array<{ id: string }>,
  answers: SurveyAnswerLite[]
): SurveyAnalytics {
  const byQ = new Map<string, SurveyAnswerLite[]>()
  for (const a of answers) {
    if (!a?.question_id) continue
    const arr = byQ.get(a.question_id) || []
    arr.push(a)
    byQ.set(a.question_id, arr)
  }

  const likertAverages: number[] = []
  const npsScores: number[] = []

  const out: QuestionAnalytics[] = questions.map((q) => {
    const list = byQ.get(q.id) || []
    const base: QuestionAnalytics = {
      question_id: q.id,
      question_type: q.question_type,
      text: q.text,
      answered: list.length,
    }

    switch (q.question_type) {
      case 'likert': {
        const nums = list.map((a) => Number(a.value_num)).filter((n) => Number.isFinite(n))
        if (nums.length) {
          const avg = nums.reduce((s, n) => s + n, 0) / nums.length
          base.average = round1(avg)
          likertAverages.push(avg)
          const min = q.scale_min ?? 1
          const max = q.scale_max ?? 5
          const counts: Record<number, number> = {}
          for (let v = min; v <= max; v++) counts[v] = 0
          for (const n of nums) counts[n] = (counts[n] || 0) + 1
          base.distribution = Object.keys(counts)
            .map(Number)
            .sort((a, b) => a - b)
            .map((v) => ({ label: String(v), count: counts[v], pct: round1((counts[v] / nums.length) * 100) }))
        }
        break
      }
      case 'nps': {
        const nums = list.map((a) => Number(a.value_num)).filter((n) => Number.isFinite(n))
        if (nums.length) {
          const promoters = nums.filter((n) => n >= 9).length
          const passives = nums.filter((n) => n >= 7 && n <= 8).length
          const detractors = nums.filter((n) => n <= 6).length
          const score = Math.round(((promoters - detractors) / nums.length) * 100)
          base.nps = { score, promoters, passives, detractors }
          npsScores.push(score)
        }
        break
      }
      case 'yesno': {
        const nums = list.map((a) => Number(a.value_num)).filter((n) => Number.isFinite(n))
        const yes = nums.filter((n) => n === 1).length
        const no = nums.filter((n) => n === 0).length
        base.yesno = { yes, no }
        base.distribution = [
          { label: 'Evet', count: yes, pct: nums.length ? round1((yes / nums.length) * 100) : 0 },
          { label: 'Hayır', count: no, pct: nums.length ? round1((no / nums.length) * 100) : 0 },
        ]
        break
      }
      case 'single': {
        const opts = asOptions(q.options)
        const counts: Record<string, number> = {}
        for (const o of opts) counts[o] = 0
        for (const a of list) {
          const v = String(a.value_text || '')
          if (v) counts[v] = (counts[v] || 0) + 1
        }
        const total = Object.values(counts).reduce((s, n) => s + n, 0)
        base.distribution = Object.entries(counts).map(([label, count]) => ({
          label,
          count,
          pct: total ? round1((count / total) * 100) : 0,
        }))
        break
      }
      case 'multi': {
        const opts = asOptions(q.options)
        const counts: Record<string, number> = {}
        for (const o of opts) counts[o] = 0
        for (const a of list) {
          const arr = Array.isArray(a.value_json) ? (a.value_json as any[]) : []
          for (const v of arr) {
            const key = String(v)
            counts[key] = (counts[key] || 0) + 1
          }
        }
        const denom = list.length || 1
        base.distribution = Object.entries(counts).map(([label, count]) => ({
          label,
          count,
          pct: round1((count / denom) * 100),
        }))
        break
      }
      case 'rank': {
        const opts = asOptions(q.options)
        const sums: Record<string, { sum: number; n: number }> = {}
        for (const o of opts) sums[o] = { sum: 0, n: 0 }
        for (const a of list) {
          const arr = Array.isArray(a.value_json) ? (a.value_json as any[]) : []
          arr.forEach((v, idx) => {
            const key = String(v)
            if (!sums[key]) sums[key] = { sum: 0, n: 0 }
            sums[key].sum += idx + 1
            sums[key].n += 1
          })
        }
        base.rankAverages = Object.entries(sums)
          .filter(([, v]) => v.n > 0)
          .map(([label, v]) => ({ label, avgPosition: round1(v.sum / v.n) }))
          .sort((a, b) => a.avgPosition - b.avgPosition)
        break
      }
      case 'text':
      case 'date': {
        base.texts = list
          .map((a) => String(a.value_text || '').trim())
          .filter(Boolean)
          .slice(0, 300)
        break
      }
    }
    return base
  })

  return {
    responseCount: responses.length,
    questionCount: questions.length,
    questions: out,
    overallLikertAverage: likertAverages.length
      ? round1(likertAverages.reduce((s, n) => s + n, 0) / likertAverages.length)
      : null,
    npsOverall: npsScores.length ? Math.round(npsScores.reduce((s, n) => s + n, 0) / npsScores.length) : null,
  }
}
