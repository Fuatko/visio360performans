// SAF (client-safe) modül — DB YOK. Bu dosya client component'ler tarafından import edilir
// (ör. admin/results/page.tsx → resolveQuestionLabel, questionIdsMatch). @/lib/db EKLENMEZ.
// DB-yapan buildQuestionTextMap ve iç helper'ları @/lib/server/question-text-map.ts'e taşındı.

export type QuestionTextLang = 'tr' | 'en' | 'fr'

export function canonicalUuid(v: unknown): string {
  const raw = String(v ?? '').trim()
  if (!raw) return ''
  const s = raw.toLowerCase()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return s
  if (/^[0-9a-f]{32}$/.test(s)) {
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
  }
  return s
}

export function uuidWithoutDashes(v: unknown): string {
  const s = canonicalUuid(v)
  return s ? s.replace(/-/g, '') : ''
}

export function looksLikeUuid(s: string): boolean {
  const t = String(s || '').trim()
  if (!t) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return true
  if (/^[0-9a-f]{32}$/i.test(t)) return true
  return false
}

export function questionTextUnavailable(lang: QuestionTextLang): string {
  if (lang === 'en') return 'Question text unavailable'
  if (lang === 'fr') return 'Texte de question indisponible'
  return 'Soru metni bulunamadı'
}

export function pickQuestionTextByLang(row: Record<string, unknown> | null | undefined, lang: QuestionTextLang): string {
  if (!row) return ''
  const read = (k: string) => {
    const v = row[k]
    return typeof v === 'string' ? v : ''
  }
  const candidates =
    lang === 'fr'
      ? [
          read('text_fr'),
          read('question_text_fr'),
          read('prompt_fr'),
          read('label_fr'),
          read('text_en'),
          read('question_text_en'),
          read('text'),
          read('question_text'),
        ]
      : lang === 'en'
        ? [
            read('text_en'),
            read('question_text_en'),
            read('prompt_en'),
            read('label_en'),
            read('text'),
            read('question_text'),
            read('text_fr'),
          ]
        : [
            read('text'),
            read('question_text'),
            read('prompt'),
            read('label'),
            read('name'),
            read('text_en'),
            read('question_text_en'),
          ]
  const out = candidates.map((s) => String(s || '').trim()).find(Boolean) || ''
  if (looksLikeUuid(out)) return ''
  return out
}

export type QuestionTextEntry = { text: string; order: number }

export function setQuestionTextEntry(
  map: Map<string, QuestionTextEntry>,
  id: unknown,
  entry: QuestionTextEntry
) {
  const cid = canonicalUuid(id)
  if (!cid) return
  const text = String(entry.text || '').trim()
  if (!text || looksLikeUuid(text)) return
  map.set(cid, { text, order: Number(entry.order ?? 0) || 0 })
  const noDash = uuidWithoutDashes(cid)
  if (noDash) map.set(noDash, { text, order: Number(entry.order ?? 0) || 0 })
}

export function resolveQuestionDisplayText(
  map: Map<string, QuestionTextEntry>,
  rawId: string,
  lang: QuestionTextLang
): QuestionTextEntry {
  const qid = canonicalUuid(rawId) || String(rawId || '').trim()
  const qt = map.get(qid) || map.get(uuidWithoutDashes(qid))
  const raw = String(qt?.text || '').trim()
  if (raw && !looksLikeUuid(raw)) {
    return { text: raw, order: Number(qt?.order ?? 0) || 0 }
  }
  return { text: questionTextUnavailable(lang), order: Number(qt?.order ?? 0) || 0 }
}

export function questionIdsMatch(a: string, b: string): boolean {
  const ca = canonicalUuid(a) || String(a || '').trim()
  const cb = canonicalUuid(b) || String(b || '').trim()
  if (!ca || !cb) return ca === cb
  if (ca === cb) return true
  const na = uuidWithoutDashes(ca)
  const nb = uuidWithoutDashes(cb)
  return Boolean(na && nb && na === nb)
}

/** Client + server: never show raw question UUID in UI or exports. */
export function resolveQuestionLabel(
  questionId: string,
  questionTexts: Record<string, string> | undefined,
  inlineText: string | undefined,
  lang: QuestionTextLang
): string {
  const fromInline = String(inlineText || '').trim()
  if (fromInline && !looksLikeUuid(fromInline)) return fromInline
  const qid = String(questionId || '').trim()
  if (qid) {
    const fromMap =
      questionTexts?.[qid] ||
      questionTexts?.[canonicalUuid(qid)] ||
      questionTexts?.[uuidWithoutDashes(qid)] ||
      questionTexts?.[qid.toLowerCase()]
    if (fromMap && !looksLikeUuid(fromMap)) return fromMap
  }
  return questionTextUnavailable(lang)
}

export function questionTextMapToRecord(map: Map<string, QuestionTextEntry>): Record<string, string> {
  const out: Record<string, string> = {}
  map.forEach((v, k) => {
    const text = String(v?.text || '').trim()
    if (text && !looksLikeUuid(text)) out[k] = text
  })
  return out
}

export type OrphanQuestionCategoryHint = {
  questionId: string
  categoryName: string
  /** Stable ordering key (e.g. evaluation_responses.id). */
  orderKey?: string
}

