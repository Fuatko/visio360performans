export type SurveyOption = { label: string; score: number | null }

/**
 * Anket seçenekleri iki biçimde saklanabilir:
 *   eski  → ["Seçenek A", "Seçenek B"]
 *   yeni  → [{ label: "Seçenek A", score: 1 }, { label: "Fikrim yok", score: null }]
 * Okuyan her yer ikisini de tanımalı; eski anketler bozulmamalı.
 */
export function readSurveyOptions(raw: unknown): SurveyOption[] {
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { options?: unknown[] }).options)
      ? ((raw as { options: unknown[] }).options as unknown[])
      : []

  const out: SurveyOption[] = []
  for (const x of arr) {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      const o = x as { label?: unknown; text?: unknown; score?: unknown }
      const label = String(o.label ?? o.text ?? '').trim()
      if (!label) continue
      const score = typeof o.score === 'number' && Number.isFinite(o.score) ? o.score : null
      out.push({ label, score })
      continue
    }
    const label = String(x ?? '').trim()
    if (label) out.push({ label, score: null })
  }
  return out
}

/** Yalnız etiketler — katılımcı ekranı ve dağılım tabloları için. */
export function surveyOptionLabels(raw: unknown): string[] {
  return readSurveyOptions(raw).map((o) => o.label)
}

/** En az bir seçenekte puan varsa true. */
export function hasScoredOptions(raw: unknown): boolean {
  return readSurveyOptions(raw).some((o) => typeof o.score === 'number')
}
