import { normalizeMatchKey } from '@/lib/duty-title-match'

export type EvaluatorDutyMode = 'full' | 'categories' | 'none'

export type EvaluatorScopeConfig = {
  periodId: string
  evaluatorId: string
  restrictPeriod: boolean
  dutyMode: EvaluatorDutyMode
  periodCategoryIds: Set<string>
  dutyCategoryIds: Set<string>
  /** Kayıt varsa true; yoksa filtre uygulanmaz */
  isConfigured: boolean
}

export type PeriodCategoryOption = {
  id: string
  name: string
  name_en?: string | null
  name_fr?: string | null
  main_category_name?: string | null
  question_count?: number
  /** Görev paketleri (Formatör, Zümre…) — görev kategorisi seçicide */
  duty_package_names?: string[]
}

export type DutyPackageOption = {
  id: string
  name: string
  category_ids: string[]
}

type SupabaseLike = {
  from: (table: string) => any
}

function isMissingTable(err: any) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')
}

export function questionCategoryId(q: any): string {
  return String(q?.category_id || q?.question_categories?.id || q?.categories?.id || '').trim()
}

export async function periodUsesSnapshot(supabase: SupabaseLike, periodId: string): Promise<boolean> {
  if (!periodId) return false
  try {
    const probe = await supabase.from('evaluation_period_questions_snapshot').select('id').eq('period_id', periodId).limit(1)
    return !probe.error && (probe.data || []).length > 0
  } catch {
    return false
  }
}

/** Admin seçici: dönemdeki alt kategoriler (snapshot veya canlı) */
export async function loadPeriodCategoryOptions(
  supabase: SupabaseLike,
  periodId: string
): Promise<PeriodCategoryOption[]> {
  if (!periodId) return []

  const useSnap = await periodUsesSnapshot(supabase, periodId)
  if (useSnap) {
    const [catRes, qRes, mainRes] = await Promise.all([
      supabase
        .from('evaluation_period_categories_snapshot')
        .select('id, name, name_en, name_fr, main_category_id, is_active, sort_order')
        .eq('period_id', periodId),
      supabase.from('evaluation_period_questions_snapshot').select('id, category_id').eq('period_id', periodId),
      supabase
        .from('evaluation_period_main_categories_snapshot')
        .select('id, name, name_en, name_fr')
        .eq('period_id', periodId),
    ])
    if (catRes.error && !isMissingTable(catRes.error)) throw catRes.error
    const mainById = new Map<string, string>()
    ;((mainRes.data || []) as any[]).forEach((m) => {
      if (m?.id) mainById.set(String(m.id), String(m.name || ''))
    })
    const countByCat = new Map<string, number>()
    ;((qRes.data || []) as any[]).forEach((q) => {
      const cid = String(q?.category_id || '')
      if (!cid) return
      countByCat.set(cid, (countByCat.get(cid) || 0) + 1)
    })
    return ((catRes.data || []) as any[])
      .filter((c) => (typeof c.is_active === 'boolean' ? c.is_active : true))
      .map((c) => ({
        id: String(c.id),
        name: String(c.name || ''),
        name_en: c.name_en ?? null,
        name_fr: c.name_fr ?? null,
        main_category_name: c.main_category_id ? mainById.get(String(c.main_category_id)) || null : null,
        question_count: countByCat.get(String(c.id)) || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }

  let questionIds: string[] | null = null
  try {
    const { data: pq } = await supabase
      .from('evaluation_period_questions')
      .select('question_id')
      .eq('period_id', periodId)
      .eq('is_active', true)
    const ids = (pq || []).map((r: any) => String(r.question_id || '')).filter(Boolean)
    if (ids.length) questionIds = ids
  } catch {
    // ignore
  }

  const q = supabase.from('questions').select('id, category_id, question_categories:category_id(id, name, name_en, name_fr, main_categories(name))')
  if (questionIds?.length) q.in('id', questionIds)
  const qRes = await q
  if (qRes.error) {
    const legacy = supabase.from('questions').select('id, category_id, categories:category_id(id, name, name_en, name_fr, main_categories(name))')
    if (questionIds?.length) legacy.in('id', questionIds)
    const lRes = await legacy
    if (lRes.error) throw lRes.error
    return aggregateLiveCategories((lRes.data || []) as any[])
  }
  return aggregateLiveCategories((qRes.data || []) as any[])
}

function aggregateLiveCategories(rows: any[]): PeriodCategoryOption[] {
  const byId = new Map<string, PeriodCategoryOption>()
  rows.forEach((q) => {
    const cat = q.question_categories || q.categories
    const cid = String(cat?.id || q.category_id || '')
    if (!cid) return
    if (!byId.has(cid)) {
      byId.set(cid, {
        id: cid,
        name: String(cat?.name || 'Kategori'),
        name_en: cat?.name_en ?? null,
        name_fr: cat?.name_fr ?? null,
        main_category_name: cat?.main_categories?.name ? String(cat.main_categories.name) : null,
        question_count: 0,
      })
    }
    const cur = byId.get(cid)!
    cur.question_count = (cur.question_count || 0) + 1
  })
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

async function fetchCategoryMetaByIds(supabase: SupabaseLike, categoryIds: string[]) {
  const meta = new Map<string, { name: string; name_en?: string | null; name_fr?: string | null; main_category_name?: string | null }>()
  const ids = Array.from(new Set(categoryIds.map(String).filter(Boolean)))
  if (!ids.length) return meta

  const chunkSize = 200
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    let res = await supabase
      .from('question_categories')
      .select('id, name, name_en, name_fr, main_categories(name)')
      .in('id', chunk)
    if (res.error) {
      res = await supabase.from('categories').select('id, name, name_en, name_fr, main_categories(name)').in('id', chunk)
    }
    if (res.error && !isMissingTable(res.error)) throw res.error
    ;((res.data || []) as any[]).forEach((c) => {
      const id = String(c.id || '')
      if (!id) return
      meta.set(id, {
        name: String(c.name || 'Kategori'),
        name_en: c.name_en ?? null,
        name_fr: c.name_fr ?? null,
        main_category_name: c.main_categories?.name ? String(c.main_categories.name) : null,
      })
    })
  }
  return meta
}

/** Görev Soruları paketlerindeki alt kategoriler (genel dönem havuzundan bağımsız) */
export async function loadDutyCategoryOptionsForPeriod(
  supabase: SupabaseLike,
  periodId: string
): Promise<PeriodCategoryOption[]> {
  if (!periodId) return []

  const [dutiesRes, catLinksRes, qLinksRes] = await Promise.all([
    supabase.from('evaluation_duties').select('id, name').eq('period_id', periodId).eq('is_active', true),
    supabase
      .from('evaluation_period_duty_categories')
      .select('duty_id, category_id')
      .eq('period_id', periodId)
      .eq('is_active', true),
    supabase
      .from('evaluation_period_duty_questions')
      .select('duty_id, question_id')
      .eq('period_id', periodId)
      .eq('is_active', true),
  ])

  if (dutiesRes.error && !isMissingTable(dutiesRes.error)) throw dutiesRes.error
  if (catLinksRes.error && !isMissingTable(catLinksRes.error)) throw catLinksRes.error
  if (qLinksRes.error && !isMissingTable(qLinksRes.error)) throw qLinksRes.error

  const dutyNameById = new Map<string, string>()
  ;((dutiesRes.data || []) as any[]).forEach((d) => {
    const id = String(d.id || '')
    if (id) dutyNameById.set(id, String(d.name || 'Görev'))
  })

  const catDutyNames = new Map<string, Set<string>>()
  const countByCat = new Map<string, number>()
  const addCat = (categoryId: string, dutyId: string) => {
    const cid = String(categoryId || '').trim()
    if (!cid) return
    const dutyName = dutyNameById.get(String(dutyId || '')) || ''
    if (dutyName) {
      const set = catDutyNames.get(cid) || new Set<string>()
      set.add(dutyName)
      catDutyNames.set(cid, set)
    }
  }

  ;((catLinksRes.data || []) as any[]).forEach((r) => addCat(String(r.category_id || ''), String(r.duty_id || '')))

  const questionIds = Array.from(
    new Set(((qLinksRes.data || []) as any[]).map((r) => String(r.question_id || '')).filter(Boolean))
  )
  const qDutyById = new Map<string, string>()
  ;((qLinksRes.data || []) as any[]).forEach((r) => {
    const qid = String(r.question_id || '')
    const did = String(r.duty_id || '')
    if (qid && did) qDutyById.set(qid, did)
  })

  if (questionIds.length) {
    const chunkSize = 200
    for (let i = 0; i < questionIds.length; i += chunkSize) {
      const chunk = questionIds.slice(i, i + chunkSize)
      let qRes = await supabase.from('questions').select('id, category_id').in('id', chunk)
      if (qRes.error) continue
      ;((qRes.data || []) as any[]).forEach((q) => {
        const cid = String(q.category_id || '')
        const qid = String(q.id || '')
        if (!cid) return
        countByCat.set(cid, (countByCat.get(cid) || 0) + 1)
        addCat(cid, qDutyById.get(qid) || '')
      })
    }
  }

  const allCatIds = Array.from(new Set([...catDutyNames.keys(), ...countByCat.keys()]))
  if (!allCatIds.length) return []

  const metaById = await fetchCategoryMetaByIds(supabase, allCatIds)

  return allCatIds
    .map((id) => {
      const meta = metaById.get(id)
      const packages = Array.from(catDutyNames.get(id) || []).sort((a, b) => a.localeCompare(b, 'tr'))
      return {
        id,
        name: meta?.name || 'Kategori',
        name_en: meta?.name_en ?? null,
        name_fr: meta?.name_fr ?? null,
        main_category_name: meta?.main_category_name ?? null,
        question_count: countByCat.get(id) || 0,
        duty_package_names: packages.length ? packages : undefined,
      }
    })
    .sort((a, b) => {
      const pa = (a.duty_package_names || [])[0] || ''
      const pb = (b.duty_package_names || [])[0] || ''
      if (pa !== pb) return pa.localeCompare(pb, 'tr')
      return a.name.localeCompare(b.name, 'tr')
    })
}

export async function loadDutyPackagesForPeriod(
  supabase: SupabaseLike,
  periodId: string
): Promise<DutyPackageOption[]> {
  if (!periodId) return []

  const [dutiesRes, catLinksRes, qLinksRes] = await Promise.all([
    supabase.from('evaluation_duties').select('id, name, sort_order').eq('period_id', periodId).eq('is_active', true).order('sort_order'),
    supabase
      .from('evaluation_period_duty_categories')
      .select('duty_id, category_id')
      .eq('period_id', periodId)
      .eq('is_active', true),
    supabase
      .from('evaluation_period_duty_questions')
      .select('duty_id, question_id')
      .eq('period_id', periodId)
      .eq('is_active', true),
  ])

  if (dutiesRes.error && !isMissingTable(dutiesRes.error)) throw dutiesRes.error

  const catIdsByDuty = new Map<string, Set<string>>()
  const add = (dutyId: string, categoryId: string) => {
    const did = String(dutyId || '').trim()
    const cid = String(categoryId || '').trim()
    if (!did || !cid) return
    const set = catIdsByDuty.get(did) || new Set<string>()
    set.add(cid)
    catIdsByDuty.set(did, set)
  }

  ;((catLinksRes.data || []) as any[]).forEach((r) => add(String(r.duty_id), String(r.category_id)))

  const qDutyById = new Map<string, string>()
  const questionIds: string[] = []
  ;((qLinksRes.data || []) as any[]).forEach((r) => {
    const qid = String(r.question_id || '')
    const did = String(r.duty_id || '')
    if (qid && did) {
      qDutyById.set(qid, did)
      questionIds.push(qid)
    }
  })

  if (questionIds.length) {
    const chunkSize = 200
    for (let i = 0; i < questionIds.length; i += chunkSize) {
      const chunk = questionIds.slice(i, i + chunkSize)
      const qRes = await supabase.from('questions').select('id, category_id').in('id', chunk)
      if (qRes.error) continue
      ;((qRes.data || []) as any[]).forEach((q) => {
        add(qDutyById.get(String(q.id || '')) || '', String(q.category_id || ''))
      })
    }
  }

  return ((dutiesRes.data || []) as any[])
    .map((d) => {
      const id = String(d.id || '')
      const name = String(d.name || '')
      return { id, name, category_ids: Array.from(catIdsByDuty.get(id) || []) }
    })
    .filter((d) => d.id && d.name)
}

export function mergeCategoryOptionsForPreview(
  ...lists: PeriodCategoryOption[][]
): PeriodCategoryOption[] {
  const byId = new Map<string, PeriodCategoryOption>()
  for (const list of lists) {
    for (const c of list) {
      if (!byId.has(c.id)) byId.set(c.id, c)
    }
  }
  return Array.from(byId.values())
}

export async function fetchEvaluatorScopeConfig(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string
): Promise<EvaluatorScopeConfig | null> {
  if (!periodId || !evaluatorId) return null

  try {
    const { data: settings, error: sErr } = await supabase
      .from('evaluation_period_evaluator_scope')
      .select('restrict_period, duty_mode')
      .eq('period_id', periodId)
      .eq('evaluator_id', evaluatorId)
      .maybeSingle()

    if (sErr) {
      if (isMissingTable(sErr)) return null
      throw sErr
    }
    if (!settings) return null

    const { data: cats, error: cErr } = await supabase
      .from('evaluation_period_evaluator_categories')
      .select('category_id, scope_kind')
      .eq('period_id', periodId)
      .eq('evaluator_id', evaluatorId)
      .eq('is_active', true)

    if (cErr) {
      if (isMissingTable(cErr)) return null
      throw cErr
    }

    const periodCategoryIds = new Set<string>()
    const dutyCategoryIds = new Set<string>()
    ;((cats || []) as any[]).forEach((r) => {
      const cid = String(r.category_id || '')
      if (!cid) return
      if (String(r.scope_kind) === 'duty') dutyCategoryIds.add(cid)
      else periodCategoryIds.add(cid)
    })

    const restrictPeriod = Boolean((settings as any).restrict_period)
    const dutyMode = String((settings as any).duty_mode || 'full') as EvaluatorDutyMode

    return {
      periodId,
      evaluatorId,
      restrictPeriod,
      dutyMode: dutyMode === 'categories' || dutyMode === 'none' ? dutyMode : 'full',
      periodCategoryIds,
      dutyCategoryIds,
      isConfigured: true,
    }
  } catch {
    return null
  }
}

export function filterQuestionsForEvaluatorScope(questions: any[], config: EvaluatorScopeConfig | null): any[] {
  if (!config?.isConfigured) return questions

  return (questions || []).filter((q) => {
    const scope = String(q?.question_scope || 'period')
    const catId = questionCategoryId(q)

    if (scope === 'duty') {
      if (config.dutyMode === 'none') return false
      if (config.dutyMode === 'full') return true
      if (config.dutyMode === 'categories') {
        if (!config.dutyCategoryIds.size) return false
        return catId ? config.dutyCategoryIds.has(catId) : false
      }
      return true
    }

    if (!config.restrictPeriod) return true
    if (!config.periodCategoryIds.size) return false
    return catId ? config.periodCategoryIds.has(catId) : false
  })
}

export function pruneAnswersByQuestion(answersByQuestion: Record<string, any[]>, questionIds: Set<string>) {
  const next: Record<string, any[]> = {}
  Object.keys(answersByQuestion || {}).forEach((qid) => {
    if (questionIds.has(qid)) next[qid] = answersByQuestion[qid]
  })
  return next
}

export type PreviewCategoryRow = {
  category_id: string
  category_name: string
  question_count: number
  scope_kind: 'period' | 'duty'
}

export function summarizeQuestionsByCategory(
  questions: any[],
  categoryOptions: PeriodCategoryOption[]
): PreviewCategoryRow[] {
  const nameById = new Map(categoryOptions.map((c) => [c.id, c.name]))
  const agg = new Map<string, PreviewCategoryRow>()

  for (const q of questions || []) {
    const cid = questionCategoryId(q) || '_other'
    const scope = String(q?.question_scope || 'period') === 'duty' ? 'duty' : 'period'
    const key = `${scope}::${cid}`
    if (!agg.has(key)) {
      agg.set(key, {
        category_id: cid,
        category_name: nameById.get(cid) || 'Diğer',
        question_count: 0,
        scope_kind: scope,
      })
    }
    const row = agg.get(key)!
    row.question_count += 1
  }

  return Array.from(agg.values()).sort((a, b) => {
    if (a.scope_kind !== b.scope_kind) return a.scope_kind === 'period' ? -1 : 1
    return a.category_name.localeCompare(b.category_name, 'tr')
  })
}

export function filterCategoryOptions(query: string, options: PeriodCategoryOption[], limit = 80): PeriodCategoryOption[] {
  const key = normalizeMatchKey(query)
  if (!key) return options.slice(0, limit)
  return options
    .filter((c) => {
      const blob = normalizeMatchKey([c.name, c.main_category_name, c.name_en, c.name_fr].filter(Boolean).join(' '))
      return blob.includes(key)
    })
    .slice(0, limit)
}
