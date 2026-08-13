import { dutyLabelFallback, pickDutyDisplayName, type DutyLike } from '@/lib/duty-title-match'
import { isPgEnabled, query as pgQuery } from '@/lib/db'
import type { Lang } from '@/lib/i18n'
import { isCategoryMatrixContext, isDutyMatrixContext, normalizeMatrixContext } from '@/lib/matrix-evaluation-context'

type SupabaseLike = {
  from: (table: string) => any
}

export type DutyScopeMode = 'additive' | 'duty_only'

export async function fetchDutyScopeMode(supabase: SupabaseLike, periodId: string): Promise<DutyScopeMode> {
  if (!periodId) return 'additive'
  try {
    if (isPgEnabled()) {
      const { rows } = await pgQuery<any>(
        'select duty_scope_mode from evaluation_periods where id = $1 limit 1',
        [periodId]
      )
      return String((rows[0] as any)?.duty_scope_mode || '') === 'duty_only' ? 'duty_only' : 'additive'
    }
    const { data, error } = await supabase
      .from('evaluation_periods')
      .select('duty_scope_mode')
      .eq('id', periodId)
      .maybeSingle()
    if (error) return 'additive'
    return String((data as any)?.duty_scope_mode || '') === 'duty_only' ? 'duty_only' : 'additive'
  } catch {
    return 'additive'
  }
}

export type DutyScopeMeta = {
  dutyQuestionIds: Set<string>
  dutyOnlyQuestionIds: Set<string>
  questionDutyMap: Map<string, { dutyId: string; dutyName: string }>
}

function isMissingTable(error: any) {
  const code = String(error?.code || '')
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')
}

export async function fetchBasePeriodQuestionIds(supabase: SupabaseLike, periodId: string) {
  const base = new Set<string>()
  if (!periodId) return base

  if (isPgEnabled()) {
    try {
      const probe = await pgQuery<any>(
        'select id from evaluation_period_questions_snapshot where period_id = $1 limit 1',
        [periodId]
      )
      if (probe.rows.length > 0) {
        const { rows } = await pgQuery<any>(
          'select id from evaluation_period_questions_snapshot where period_id = $1',
          [periodId]
        )
        rows.forEach((r) => {
          if (r?.id) base.add(String(r.id))
        })
        return base
      }
    } catch {
      // ignore (snapshot tablosu yok → canlı tabloya düş)
    }

    try {
      const { rows } = await pgQuery<any>(
        'select question_id from evaluation_period_questions where period_id = $1 and is_active = true',
        [periodId]
      )
      rows.forEach((r) => {
        if (r?.question_id) base.add(String(r.question_id))
      })
    } catch {
      // ignore
    }

    return base
  }

  try {
    const probe = await supabase
      .from('evaluation_period_questions_snapshot')
      .select('id')
      .eq('period_id', periodId)
      .limit(1)
    if (!probe.error && (probe.data || []).length > 0) {
      const { data, error } = await supabase
        .from('evaluation_period_questions_snapshot')
        .select('id')
        .eq('period_id', periodId)
      if (!error) {
        ;((data || []) as any[]).forEach((r) => {
          if (r?.id) base.add(String(r.id))
        })
        return base
      }
    }
  } catch {
    // ignore
  }

  try {
    const { data, error } = await supabase
      .from('evaluation_period_questions')
      .select('question_id')
      .eq('period_id', periodId)
      .eq('is_active', true)
    if (!error) {
      ;((data || []) as any[]).forEach((r) => {
        if (r?.question_id) base.add(String(r.question_id))
      })
    }
  } catch {
    // ignore
  }

  return base
}

/** Dönemde yan görev paketlerine bağlı alt kategori id'leri (genel kartta gösterilmez). */
export async function fetchDutyLinkedCategoryIdsForPeriod(
  supabase: SupabaseLike,
  periodId: string
): Promise<Set<string>> {
  const out = new Set<string>()
  if (!periodId) return out
  if (isPgEnabled()) {
    try {
      const { rows } = await pgQuery<any>(
        'select category_id from evaluation_period_duty_categories where period_id = $1 and is_active = true',
        [periodId]
      )
      rows.forEach((r) => {
        const cid = String(r?.category_id || '').trim()
        if (cid) out.add(cid)
      })
    } catch {
      // ignore (tablo yok vb.)
    }
    return out
  }
  try {
    const { data, error } = await supabase
      .from('evaluation_period_duty_categories')
      .select('category_id')
      .eq('period_id', periodId)
      .eq('is_active', true)
    if (error) {
      if (isMissingTable(error)) return out
      throw error
    }
    ;((data || []) as any[]).forEach((r) => {
      const cid = String(r?.category_id || '').trim()
      if (cid) out.add(cid)
    })
  } catch {
    // ignore
  }
  return out
}

/** Verilen görev paket id'leri için dönemdeki tüm bağlı soru id'leri */
export async function collectQuestionIdsForDutyIds(
  supabase: SupabaseLike,
  periodId: string,
  dutyIds: string[]
): Promise<Set<string>> {
  const uniqueDutyIds = Array.from(new Set(dutyIds.map(String).filter(Boolean)))
  if (!periodId || !uniqueDutyIds.length) return new Set<string>()

  if (isPgEnabled()) {
    try {
      const [categoryRes, questionRes] = await Promise.all([
        pgQuery<any>(
          'select duty_id, category_id from evaluation_period_duty_categories where period_id = $1 and duty_id = any($2::uuid[]) and is_active = true',
          [periodId, uniqueDutyIds]
        ),
        pgQuery<any>(
          'select duty_id, question_id from evaluation_period_duty_questions where period_id = $1 and duty_id = any($2::uuid[]) and is_active = true',
          [periodId, uniqueDutyIds]
        ),
      ])
      const questionIds = new Set<string>()
      const categoryIds = Array.from(
        new Set(categoryRes.rows.map((r) => String(r.category_id || '')).filter(Boolean))
      )
      questionRes.rows.forEach((r) => {
        const qid = String(r.question_id || '')
        if (qid) questionIds.add(qid)
      })
      if (categoryIds.length) {
        const { rows } = await pgQuery<any>(
          'select id from questions where category_id = any($1::uuid[])',
          [categoryIds]
        )
        rows.forEach((q) => {
          if (q?.id) questionIds.add(String(q.id))
        })
      }
      return questionIds
    } catch (e) {
      if (isMissingTable(e)) return new Set<string>()
      throw e
    }
  }

  const [categoryRes, questionRes] = await Promise.all([
    supabase
      .from('evaluation_period_duty_categories')
      .select('duty_id, category_id')
      .eq('period_id', periodId)
      .in('duty_id', uniqueDutyIds)
      .eq('is_active', true),
    supabase
      .from('evaluation_period_duty_questions')
      .select('duty_id, question_id')
      .eq('period_id', periodId)
      .in('duty_id', uniqueDutyIds)
      .eq('is_active', true),
  ])

  if (categoryRes.error) {
    if (isMissingTable(categoryRes.error)) return new Set<string>()
    throw categoryRes.error
  }
  if (questionRes.error) {
    if (isMissingTable(questionRes.error)) return new Set<string>()
    throw questionRes.error
  }

  const questionIds = new Set<string>()
  const categoryIds = Array.from(
    new Set(((categoryRes.data || []) as any[]).map((r) => String(r.category_id || '')).filter(Boolean))
  )

  ;((questionRes.data || []) as any[]).forEach((r) => {
    const qid = String(r.question_id || '')
    if (qid) questionIds.add(qid)
  })

  if (categoryIds.length) {
    const { data: categoryQuestions, error: qErr } = await supabase
      .from('questions')
      .select('id')
      .in('category_id', categoryIds)
    if (qErr) throw qErr
    ;((categoryQuestions || []) as any[]).forEach((q) => {
      if (q?.id) questionIds.add(String(q.id))
    })
  }

  return questionIds
}

export async function fetchDutyQuestionIds(supabase: SupabaseLike, periodId: string, targetId: string) {
  if (!periodId || !targetId) return new Set<string>()

  let dutyRows: any[]
  if (isPgEnabled()) {
    try {
      dutyRows = (
        await pgQuery<any>(
          'select duty_id from evaluation_period_user_duties where period_id = $1 and user_id = $2 and is_active = true',
          [periodId, targetId]
        )
      ).rows
    } catch (e) {
      if (isMissingTable(e)) return new Set<string>()
      throw e
    }
  } else {
    const { data, error: dutyErr } = await supabase
      .from('evaluation_period_user_duties')
      .select('duty_id')
      .eq('period_id', periodId)
      .eq('user_id', targetId)
      .eq('is_active', true)

    if (dutyErr) {
      if (isMissingTable(dutyErr)) return new Set<string>()
      throw dutyErr
    }
    dutyRows = (data || []) as any[]
  }

  const dutyIds = Array.from(new Set((dutyRows as any[]).map((r) => String(r.duty_id || '')).filter(Boolean)))
  if (!dutyIds.length) return new Set<string>()
  return collectQuestionIdsForDutyIds(supabase, periodId, dutyIds)
}

async function buildDutyScopeMetaCore(
  supabase: SupabaseLike,
  periodId: string,
  targetId: string,
  displayLang: Lang = 'tr'
): Promise<DutyScopeMeta> {
  const [baseIds, dutyQuestionIds] = await Promise.all([
    fetchBasePeriodQuestionIds(supabase, periodId),
    fetchDutyQuestionIds(supabase, periodId, targetId),
  ])

  const dutyOnlyQuestionIds = new Set<string>()
  dutyQuestionIds.forEach((id) => {
    if (!baseIds.has(id)) dutyOnlyQuestionIds.add(id)
  })

  const questionDutyMap = new Map<string, { dutyId: string; dutyName: string }>()
  if (!dutyQuestionIds.size) {
    return { dutyQuestionIds, dutyOnlyQuestionIds, questionDutyMap }
  }

  const dutyRows = isPgEnabled()
    ? (
        await pgQuery<any>(
          'select duty_id from evaluation_period_user_duties where period_id = $1 and user_id = $2 and is_active = true',
          [periodId, targetId]
        )
      ).rows
    : (
        (
          await supabase
            .from('evaluation_period_user_duties')
            .select('duty_id')
            .eq('period_id', periodId)
            .eq('user_id', targetId)
            .eq('is_active', true)
        ).data || []
      )
  const dutyIds = Array.from(new Set(((dutyRows || []) as any[]).map((r) => String(r.duty_id || '')).filter(Boolean)))
  if (!dutyIds.length) {
    return { dutyQuestionIds, dutyOnlyQuestionIds, questionDutyMap }
  }

  const [dutiesRes, qLinks, catLinks] = isPgEnabled()
    ? await Promise.all([
        pgQuery<any>(
          'select id, name, name_fr from evaluation_duties where period_id = $1 and id = any($2::uuid[])',
          [periodId, dutyIds]
        ).then((r) => ({ data: r.rows })),
        pgQuery<any>(
          'select duty_id, question_id from evaluation_period_duty_questions where period_id = $1 and duty_id = any($2::uuid[]) and is_active = true',
          [periodId, dutyIds]
        ).then((r) => ({ data: r.rows })),
        pgQuery<any>(
          'select duty_id, category_id from evaluation_period_duty_categories where period_id = $1 and duty_id = any($2::uuid[]) and is_active = true',
          [periodId, dutyIds]
        ).then((r) => ({ data: r.rows })),
      ])
    : await Promise.all([
        supabase.from('evaluation_duties').select('id, name, name_fr').eq('period_id', periodId).in('id', dutyIds),
        supabase
          .from('evaluation_period_duty_questions')
          .select('duty_id, question_id')
          .eq('period_id', periodId)
          .in('duty_id', dutyIds)
          .eq('is_active', true),
        supabase
          .from('evaluation_period_duty_categories')
          .select('duty_id, category_id')
          .eq('period_id', periodId)
          .in('duty_id', dutyIds)
          .eq('is_active', true),
      ])

  const dutyFallback = dutyLabelFallback(displayLang)
  const dutyNameById = new Map<string, string>()
  ;((dutiesRes.data || []) as any[]).forEach((d) => {
    if (d?.id) dutyNameById.set(String(d.id), pickDutyDisplayName(d as DutyLike, displayLang))
  })

  ;((qLinks.data || []) as any[]).forEach((r) => {
    const qid = String(r.question_id || '')
    const did = String(r.duty_id || '')
    if (!qid || !did) return
    questionDutyMap.set(qid, { dutyId: did, dutyName: dutyNameById.get(did) || dutyFallback })
  })

  const catByDuty = new Map<string, string[]>()
  ;((catLinks.data || []) as any[]).forEach((r) => {
    const did = String(r.duty_id || '')
    const cid = String(r.category_id || '')
    if (!did || !cid) return
    const cur = catByDuty.get(did) || []
    cur.push(cid)
    catByDuty.set(did, cur)
  })

  for (const [did, cids] of catByDuty) {
    if (!cids.length) continue
    const qs = isPgEnabled()
      ? (await pgQuery<any>('select id from questions where category_id = any($1::uuid[])', [cids])).rows
      : ((await supabase.from('questions').select('id').in('category_id', cids)).data || [])
    ;((qs || []) as any[]).forEach((q) => {
      const qid = String(q.id || '')
      if (!qid || questionDutyMap.has(qid)) return
      questionDutyMap.set(qid, { dutyId: did, dutyName: dutyNameById.get(did) || dutyFallback })
    })
  }

  return { dutyQuestionIds, dutyOnlyQuestionIds, questionDutyMap }
}

/** Form / scope: duty_only modunda da dutyOnlyQuestionIds korunur (scope etiketleme ve filtre için). */
export async function fetchDutyScopeMetaForTarget(
  supabase: SupabaseLike,
  periodId: string,
  targetId: string,
  displayLang: Lang = 'tr'
): Promise<DutyScopeMeta> {
  return buildDutyScopeMetaCore(supabase, periodId, targetId, displayLang)
}

/** Raporlama / kayıt: duty_id ve görev paketi ayrımı tam meta */
export async function fetchDutyScopeMetaForReporting(
  supabase: SupabaseLike,
  periodId: string,
  targetId: string
): Promise<DutyScopeMeta> {
  return buildDutyScopeMetaCore(supabase, periodId, targetId)
}

export function enrichResponsesWithDutyMeta(
  responses: any[],
  meta: DutyScopeMeta
): any[] {
  if (!meta.questionDutyMap.size) return responses
  return (responses || []).map((r) => {
    const qid = String(r?.question_id || '').trim()
    if (!qid) return r
    const duty = meta.questionDutyMap.get(qid)
    if (!duty) return r
    const scope = meta.dutyOnlyQuestionIds.has(qid) ? 'duty' : String(r?.question_scope || 'period')
    return {
      ...r,
      duty_id: r.duty_id || duty.dutyId,
      question_scope: r.question_scope || scope,
    }
  })
}

/** Hedef kullanıcı → yalnızca ek görev kapsamındaki soru id'leri */
export async function buildDutyScopeIndexForPeriod(supabase: SupabaseLike, periodId: string) {
  const index = new Map<string, Set<string>>()
  if (!periodId) return index

  const baseIds = await fetchBasePeriodQuestionIds(supabase, periodId)

  let userDuties: any[]
  if (isPgEnabled()) {
    try {
      userDuties = (
        await pgQuery<any>(
          'select user_id from evaluation_period_user_duties where period_id = $1 and is_active = true',
          [periodId]
        )
      ).rows
    } catch (e) {
      if (isMissingTable(e)) return index
      throw e
    }
  } else {
    const { data, error } = await supabase
      .from('evaluation_period_user_duties')
      .select('user_id')
      .eq('period_id', periodId)
      .eq('is_active', true)

    if (error) {
      if (isMissingTable(error)) return index
      throw error
    }
    userDuties = (data || []) as any[]
  }

  const targetIds = Array.from(new Set((userDuties as any[]).map((r) => String(r.user_id || '')).filter(Boolean)))
  await Promise.all(
    targetIds.map(async (targetId) => {
      const dutyIds = await fetchDutyQuestionIds(supabase, periodId, targetId)
      const only = new Set<string>()
      dutyIds.forEach((id) => {
        if (!baseIds.has(id)) only.add(id)
      })
      if (only.size) index.set(targetId, only)
    })
  )

  return index
}

export function questionScopeForId(
  questionId: string,
  meta: DutyScopeMeta
): { scope: 'period' | 'duty'; dutyId: string | null } {
  const qid = String(questionId || '')
  if (meta.dutyOnlyQuestionIds.has(qid)) {
    const d = meta.questionDutyMap.get(qid)
    return { scope: 'duty', dutyId: d?.dutyId || null }
  }
  return { scope: 'period', dutyId: null }
}

/**
 * duty_only dönemde yan görev / okul yaşam matrislerinde hedefin TÜM görev sorularını
 * period havuzuna eklemeyin — aksi halde filtre/fail-open ile karışır.
 * okul_yasam: yalnızca seçili genel (G) kategori soruları gelir.
 */
export function shouldMergeAllTargetDutyQuestions(matrixContext: string | null | undefined): boolean {
  const ctx = normalizeMatrixContext(matrixContext)
  if (ctx === 'genel') return false
  if (isDutyMatrixContext(ctx)) return false
  if (isCategoryMatrixContext(ctx)) return false
  return true
}

export async function resolvePeriodQuestionIdsForTarget(
  supabase: SupabaseLike,
  periodId: string,
  targetId: string,
  baseQuestionIds: string[] | null
) {
  const [dutyQuestionIds, scopeMode] = await Promise.all([
    fetchDutyQuestionIds(supabase, periodId, targetId),
    fetchDutyScopeMode(supabase, periodId),
  ])

  if (scopeMode === 'duty_only' && dutyQuestionIds.size > 0) {
    return Array.from(dutyQuestionIds)
  }

  const resolved = new Set<string>((baseQuestionIds || []).map(String).filter(Boolean))
  dutyQuestionIds.forEach((id) => resolved.add(id))

  if (!baseQuestionIds && resolved.size === 0) return null
  return Array.from(resolved)
}

/** Snapshot sonrası ek görev sorularını canlı tablodan yükler */
export async function loadDutyQuestionsForEvaluation(
  supabase: SupabaseLike,
  periodId: string,
  targetId: string,
  existingQuestionIds: Set<string>,
  displayLang: Lang = 'tr'
) {
  const meta = await fetchDutyScopeMetaForTarget(supabase, periodId, targetId, displayLang)
  const dutyFallback = dutyLabelFallback(displayLang)
  const extraIds = [...meta.dutyOnlyQuestionIds].filter((id) => !existingQuestionIds.has(id))
  if (!extraIds.length) return { questions: [] as any[], meta }

  const orderCols = ['sort_order', 'order_num'] as const
  const fetchQuestions = async (mode: 'question_categories' | 'categories') => {
    // pg: embed (category → main_categories) JOIN + jsonb_build_object ile aynı iç içe şekil.
    // tbl/col değerleri sabit whitelist (mode / orderCols) → enjeksiyon yok.
    if (isPgEnabled()) {
      const tbl = mode === 'question_categories' ? 'question_categories' : 'categories'
      let lastErr: any = null
      for (const col of orderCols) {
        try {
          const { rows } = await pgQuery<any>(
            `select q.*,
               case when c.id is not null then jsonb_build_object(
                 'name', c.name, 'name_en', c.name_en, 'name_fr', c.name_fr,
                 'main_categories', to_jsonb(mc.*)
               ) else null end as ${tbl}
             from questions q
             left join ${tbl} c on c.id = q.category_id
             left join main_categories mc on mc.id = c.main_category_id
             where q.id = any($1::uuid[])
             order by q.${col}`,
            [extraIds]
          )
          return rows as any[]
        } catch (e) {
          const code = (e as any)?.code
          const msg = String((e as any)?.message || '')
          if (code === '42703' && (msg.includes('order_num') || msg.includes('sort_order'))) {
            lastErr = e
            continue
          }
          throw e
        }
      }
      if (lastErr) throw lastErr
      return []
    }

    const select =
      mode === 'question_categories'
        ? `*, question_categories:category_id(name, name_en, name_fr, main_categories(*))`
        : `*, categories:category_id(name, name_en, name_fr, main_categories(*))`
    let lastErr: any = null
    for (const col of orderCols) {
      const res = await supabase.from('questions').select(select).in('id', extraIds).order(col)
      if (!res.error) return (res.data || []) as any[]
      const code = (res.error as any)?.code
      const msg = String((res.error as any)?.message || '')
      if (code === '42703' && (msg.includes('order_num') || msg.includes('sort_order'))) {
        lastErr = res.error
        continue
      }
      throw res.error
    }
    if (lastErr) throw lastErr
    return []
  }

  let rows: any[] = []
  try {
    rows = await fetchQuestions('question_categories')
  } catch {
    rows = await fetchQuestions('categories')
  }

  const questions = rows.map((q) => {
    const qid = String(q.id)
    const duty = meta.questionDutyMap.get(qid)
    return {
      ...q,
      question_scope: 'duty' as const,
      duty_id: duty?.dutyId || null,
      duty_name: duty?.dutyName || dutyFallback,
    }
  })

  return { questions, meta }
}
