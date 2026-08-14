// ============================================================================
// Soru metni haritası — DB katmanı (server-only). question-text-resolve.ts'in
// SAF (client-safe) kısmından AYRILDI: bu modül @/lib/db (pg) import ettiği için
// yalnız server'da kullanılmalı. Saf helper'lar (resolveQuestionLabel,
// questionIdsMatch, canonicalUuid…) client-safe question-text-resolve.ts'te kalır.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPgEnabled } from '@/lib/db'
import { pgRead } from '@/lib/server/pg-read'
import {
  canonicalUuid,
  looksLikeUuid,
  pickQuestionTextByLang,
  setQuestionTextEntry,
  uuidWithoutDashes,
  type OrphanQuestionCategoryHint,
  type QuestionTextEntry,
  type QuestionTextLang,
} from '@/lib/server/question-text-resolve'

const POSTGREST_MAX_ROWS = 1000
const QID_CHUNK = 50

function hasResolvableQuestionText(map: Map<string, QuestionTextEntry>, qid: string): boolean {
  const c = canonicalUuid(qid) || String(qid || '').trim()
  const qt = map.get(c) || map.get(uuidWithoutDashes(c))
  const raw = String(qt?.text || '').trim()
  return Boolean(raw && !looksLikeUuid(raw))
}

async function loadPeriodQuestionIdSet(
  supabase: SupabaseClient,
  periodId: string
): Promise<Set<string> | null> {
  if (!periodId) return null
  try {
    // org-scope: period_id. Okuma fallback.
    const { data, error } = isPgEnabled()
      ? await pgRead<{ question_id?: string }>('select question_id from evaluation_period_questions where period_id = $1 and is_active = true', [periodId])
      : await supabase
          .from('evaluation_period_questions')
          .select('question_id')
          .eq('period_id', periodId)
          .eq('is_active', true)
    if (error || !(data || []).length) return null
    const ids = new Set<string>()
    ;(data || []).forEach((row: { question_id?: string }) => {
      const id = canonicalUuid(row.question_id)
      if (id) ids.add(id)
    })
    return ids.size ? ids : null
  } catch {
    return null
  }
}

async function loadLiveQuestionsByCategoryName(
  supabase: SupabaseClient,
  lang: QuestionTextLang,
  periodQuestionIds: Set<string> | null
): Promise<Map<string, QuestionTextEntry[]>> {
  // embed (question_categories:category_id(name)) → JOIN. Tüm sorular (supabase ile parite: filtre yok).
  const { data: questions, error } = isPgEnabled()
    ? await pgRead<any>(
        `select q.id, q.text, q.text_en, q.text_fr, q.sort_order,
           case when c.id is not null then jsonb_build_object('name', c.name) else null end as question_categories
         from questions q
         left join question_categories c on c.id = q.category_id`,
        []
      )
    : await supabase
        .from('questions')
        .select('id, text, text_en, text_fr, sort_order, question_categories:category_id(name)')
  if (error) return new Map()

  const byName = new Map<string, Array<{ sortOrder: number; id: string; text: string }>>()
  for (const q of (questions || []) as Array<Record<string, unknown>>) {
    const qid = canonicalUuid(q.id)
    if (!qid) continue
    if (periodQuestionIds && !periodQuestionIds.has(qid)) continue
    const cat = q.question_categories as { name?: string } | null | undefined
    const name = String(cat?.name || '').trim()
    if (!name) continue
    const text = pickQuestionTextByLang(q, lang).trim()
    if (!text || looksLikeUuid(text)) continue
    const list = byName.get(name) || []
    list.push({ sortOrder: Number(q.sort_order ?? 0) || 0, id: qid, text })
    byName.set(name, list)
  }

  const out = new Map<string, QuestionTextEntry[]>()
  for (const [name, list] of byName) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    const seen = new Set<string>()
    const deduped: QuestionTextEntry[] = []
    for (const item of list) {
      const key = item.text.trim()
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push({ text: item.text, order: item.sortOrder })
    }
    if (deduped.length) out.set(name, deduped)
  }
  return out
}

async function applyCategoryOrphanQuestionTextFallback(
  supabase: SupabaseClient,
  periodId: string,
  map: Map<string, QuestionTextEntry>,
  hints: OrphanQuestionCategoryHint[],
  lang: QuestionTextLang
) {
  if (!hints.length) return

  const byCategory = new Map<string, Map<string, string>>()
  for (const hint of hints) {
    const qid = canonicalUuid(hint.questionId)
    const categoryName = String(hint.categoryName || '').trim()
    if (!qid || !categoryName || categoryName === '—') continue
    if (hasResolvableQuestionText(map, qid)) continue
    const orderKey = String(hint.orderKey || qid)
    const bucket = byCategory.get(categoryName) || new Map<string, string>()
    const prev = bucket.get(qid)
    if (!prev || orderKey < prev) bucket.set(qid, orderKey)
    byCategory.set(categoryName, bucket)
  }
  if (!byCategory.size) return

  const periodQuestionIds = await loadPeriodQuestionIdSet(supabase, periodId)
  const liveByCategory = await loadLiveQuestionsByCategoryName(supabase, lang, periodQuestionIds)

  for (const [categoryName, orphanBucket] of byCategory) {
    const live = liveByCategory.get(categoryName) || []
    if (!live.length) continue
    const orphanIds = [...orphanBucket.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([qid]) => qid)
    const pool = live.length >= orphanIds.length ? live.slice(0, orphanIds.length) : live
    for (let i = 0; i < Math.min(orphanIds.length, pool.length); i++) {
      setQuestionTextEntry(map, orphanIds[i], pool[i])
    }
  }
}

export async function buildQuestionTextMap(
  supabase: SupabaseClient,
  periodId: string,
  questionIds: string[],
  lang: QuestionTextLang,
  orphanHints: OrphanQuestionCategoryHint[] = []
): Promise<Map<string, QuestionTextEntry>> {
  const map = new Map<string, QuestionTextEntry>()
  const uniqueIds = Array.from(new Set(questionIds.map((id) => canonicalUuid(id) || String(id || '').trim()).filter(Boolean)))

  let usedSnapshot = false
  try {
    const probe = isPgEnabled()
      ? await pgRead<{ id: string }>('select id from evaluation_period_questions_snapshot where period_id = $1 limit 1', [periodId])
      : await supabase.from('evaluation_period_questions_snapshot').select('id').eq('period_id', periodId).limit(1)
    if (!probe.error && (probe.data || []).length > 0) usedSnapshot = true
  } catch {
    /* ignore */
  }

  const fillFromQuestionsTable = async (chunk: string[]) => {
    const expanded = Array.from(new Set([...chunk, ...chunk.map(uuidWithoutDashes)].filter(Boolean)))
    const qRes = isPgEnabled()
      ? await pgRead<any>('select * from questions where id = any($1::uuid[])', [expanded])
      : await supabase.from('questions').select('*').in('id', expanded)
    if (qRes.error) return
    ;((qRes.data || []) as Array<Record<string, unknown>>).forEach((q) => {
      const id = canonicalUuid(q?.id)
      if (!id) return
      const text = pickQuestionTextByLang(q, lang).trim()
      if (!text) return
      setQuestionTextEntry(map, id, {
        text,
        order: Number(q?.sort_order ?? q?.order_num ?? 0) || 0,
      })
    })
  }

  if (usedSnapshot) {
    let from = 0
    while (true) {
      const qSnapRes = isPgEnabled()
        ? await pgRead<any>(
            'select * from evaluation_period_questions_snapshot where period_id = $1 order by sort_order limit $2 offset $3',
            [periodId, POSTGREST_MAX_ROWS, from]
          )
        : await supabase
            .from('evaluation_period_questions_snapshot')
            .select('*')
            .eq('period_id', periodId)
            .order('sort_order')
            .range(from, from + POSTGREST_MAX_ROWS - 1)
      if (qSnapRes.error) break
      const rows = (qSnapRes.data || []) as Array<Record<string, unknown>>
      rows.forEach((q) => {
        if (typeof q?.is_active === 'boolean' && !q.is_active) return
        const id = canonicalUuid(q?.id) || canonicalUuid(q?.question_id)
        if (!id) return
        const text = pickQuestionTextByLang(q, lang).trim()
        if (!text) return
        setQuestionTextEntry(map, id, {
          text,
          order: Number(q?.sort_order ?? q?.order_num ?? 0) || 0,
        })
      })
      if (rows.length < POSTGREST_MAX_ROWS) break
      from += POSTGREST_MAX_ROWS
    }
  }

  const missing = uniqueIds.filter((qid) => {
    const c = canonicalUuid(qid)
    return c && !map.has(c) && !map.has(uuidWithoutDashes(c))
  })

  const toFetch = usedSnapshot ? missing : uniqueIds
  for (let off = 0; off < toFetch.length; off += QID_CHUNK) {
    await fillFromQuestionsTable(toFetch.slice(off, off + QID_CHUNK))
  }

  await applyCategoryOrphanQuestionTextFallback(supabase, periodId, map, orphanHints, lang)

  return map
}
