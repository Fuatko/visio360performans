import { normalizeMatchKey } from '@/lib/duty-title-match'
import {
  assignmentPairKey,
  DEFAULT_MATRIX_EVALUATION_CONTEXT,
  MATRIX_CONTEXT_DUTY_PRESET,
  isCategoryMatrixContext,
  isDutyMatrixContext,
  matrixEvaluationContextLabel,
  normalizeMatrixContext,
  type MatrixEvaluationContext,
} from '@/lib/matrix-evaluation-context'
import type { DutyLike } from '@/lib/duty-title-match'
import { findDutyIdForMatrixPreset } from '@/lib/matrix-target-duty-assign'
import {
  collectQuestionIdsForDutyIds,
  fetchDutyScopeMetaForTarget,
  loadDutyQuestionsForEvaluation,
  questionScopeForId,
  resolvePeriodQuestionIdsForTarget,
  type DutyScopeMeta,
} from '@/lib/server/evaluation-duty-questions'

export type EvaluatorDutyMode = 'full' | 'categories' | 'none'

export type EvaluatorScopeConfig = {
  periodId: string
  evaluatorId: string
  targetId?: string | null
  restrictPeriod: boolean
  dutyMode: EvaluatorDutyMode
  periodCategoryIds: Set<string>
  dutyCategoryIds: Set<string>
  /** evaluation_duties.id — Formatör, Zümre vb. paket seçimi */
  dutyPackageIds: Set<string>
  /** Kayıt varsa true; yoksa filtre uygulanmaz */
  isConfigured: boolean
  /** target = matris satırı istisnası; evaluator = varsayılan */
  scopeLevel?: 'evaluator' | 'target'
  /** Form yüklemesinde hedefin görev paketi otomatik eklendi (varsayılan yan görev yokken) */
  usesAutoTargetDuties?: boolean
  /** Kulüp / bilimsel vb. matris satırı — yalnızca bağlama uygun yan görev paketi */
  matrixDutyAuto?: boolean
}

export type ScopeSavePayload = {
  restrict_period: boolean
  duty_mode: EvaluatorDutyMode
  period_category_ids: string[]
  duty_category_ids: string[]
  duty_package_ids: string[]
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

/** Dönemde tüm alt kategoriler aynı ana başlıkta ise (tek kova) kardeş genişletmesi yapılmaz. */
export function periodCategoriesShareSingleMainBucket(
  categories: Array<{ main_category_name?: string | null }>
): boolean {
  const mains = new Set(
    categories.map((c) => normalizeMatchKey(c.main_category_name || '')).filter(Boolean)
  )
  return mains.size <= 1
}

/** Kapsamda bir alt kategori seçiliyse aynı ana kategorideki kardeş alt kategorileri de dahil et. */
export function expandPeriodCategoryIds(
  categories: PeriodCategoryOption[],
  periodCategoryIds: Set<string>
): Set<string> {
  if (!periodCategoryIds.size || !categories.length) return periodCategoryIds
  if (periodCategoriesShareSingleMainBucket(categories)) return periodCategoryIds
  const mainKeys = new Set<string>()
  for (const c of categories) {
    if (periodCategoryIds.has(c.id) && c.main_category_name) {
      mainKeys.add(normalizeMatchKey(c.main_category_name))
    }
  }
  if (!mainKeys.size) return periodCategoryIds
  const expanded = new Set(periodCategoryIds)
  for (const c of categories) {
    const main = normalizeMatchKey(c.main_category_name || '')
    if (main && mainKeys.has(main)) expanded.add(c.id)
  }
  return expanded
}

/** Okul yaşam / kategori matrisi değerlendireninin bu dönemde genel (21 soru) ataması olmamalı — yalnızca kategori kapsamı */
export async function evaluatorHasCategoryMatrixAssignments(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('evaluation_assignments')
      .select('matrix_context')
      .eq('period_id', periodId)
      .eq('evaluator_id', evaluatorId)
    if (error) return false
    return (data || []).some((row: { matrix_context?: string }) =>
      isCategoryMatrixContext(row.matrix_context)
    )
  } catch {
    return false
  }
}

function categoryOnlyScopeShell(
  periodId: string,
  evaluatorId: string,
  targetId: string | null | undefined,
  base: EvaluatorScopeConfig | null
): EvaluatorScopeConfig {
  return {
    periodId,
    evaluatorId,
    targetId,
    restrictPeriod: true,
    dutyMode: 'none',
    periodCategoryIds: new Set(base?.periodCategoryIds || []),
    dutyCategoryIds: new Set(),
    dutyPackageIds: new Set(),
    isConfigured: true,
    scopeLevel: 'target',
    usesAutoTargetDuties: false,
  }
}

export async function enrichEvaluatorScopePeriodCategories(
  supabase: SupabaseLike,
  periodId: string,
  config: EvaluatorScopeConfig | null,
  matrixContext: string = DEFAULT_MATRIX_EVALUATION_CONTEXT
): Promise<EvaluatorScopeConfig | null> {
  if (isCategoryMatrixContext(matrixContext)) return config
  if (!config?.isConfigured || !config.restrictPeriod || !config.periodCategoryIds.size) return config
  const categories = await loadPeriodCategoryOptions(supabase, periodId)
  const expanded = expandPeriodCategoryIds(categories, config.periodCategoryIds)
  if (expanded.size === config.periodCategoryIds.size) return config
  return { ...config, periodCategoryIds: expanded }
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

  const [dutyRows, catLinksRes, qLinksRes] = await Promise.all([
    queryPeriodDuties(supabase, periodId),
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

  if (catLinksRes.error && !isMissingTable(catLinksRes.error)) throw catLinksRes.error
  if (qLinksRes.error && !isMissingTable(qLinksRes.error)) throw qLinksRes.error

  const dutyNameById = new Map<string, string>()
  ;(dutyRows || []).forEach((d) => {
    if (d.is_active === false) return
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

async function queryPeriodDuties(supabase: SupabaseLike, periodId: string) {
  let res = await supabase
    .from('evaluation_duties')
    .select('id, name, code, sort_order, is_active, created_at')
    .eq('period_id', periodId)
    .order('sort_order')
    .order('created_at')
  if (res.error && String((res.error as any)?.code || '') === '42703') {
    res = await supabase.from('evaluation_duties').select('id, name, code, is_active, created_at').eq('period_id', periodId)
  }
  if (res.error && isMissingTable(res.error)) return [] as any[]
  if (res.error) throw res.error
  return (res.data || []) as any[]
}

/** Yalnızca görev adları — kategori eşlemesi olmasa da Formatör vb. listede görünsün */
export async function loadDutyTitlesForPeriod(supabase: SupabaseLike, periodId: string): Promise<DutyPackageOption[]> {
  const rows = await queryPeriodDuties(supabase, periodId)
  return rows
    .filter((d) => d.is_active !== false && String(d.name || '').trim())
    .map((d) => ({
      id: String(d.id),
      name: String(d.name).trim(),
      category_ids: [] as string[],
    }))
}

export async function loadDutyPackagesForPeriod(
  supabase: SupabaseLike,
  periodId: string
): Promise<DutyPackageOption[]> {
  if (!periodId) return []

  const dutyRows = await queryPeriodDuties(supabase, periodId)

  const [catLinksRes, qLinksRes, userDutiesRes] = await Promise.all([
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
    supabase
      .from('evaluation_period_user_duties')
      .select('duty_id')
      .eq('period_id', periodId)
      .eq('is_active', true),
  ])

  if (catLinksRes.error && !isMissingTable(catLinksRes.error)) throw catLinksRes.error
  if (qLinksRes.error && !isMissingTable(qLinksRes.error)) throw qLinksRes.error
  if (userDutiesRes.error && !isMissingTable(userDutiesRes.error)) throw userDutiesRes.error

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

  const dutyById = new Map<string, { id: string; name: string }>()
  dutyRows
    .filter((d) => d.is_active !== false)
    .forEach((d) => {
      const id = String(d.id || '')
      const name = String(d.name || '').trim()
      if (id && name) dutyById.set(id, { id, name })
    })

  ;((userDutiesRes.data || []) as any[]).forEach((r) => {
    const id = String(r.duty_id || '')
    if (id && !dutyById.has(id)) dutyById.set(id, { id, name: `Görev ${id.slice(0, 8)}` })
  })

  const orphanDutyIds = new Set<string>([...catIdsByDuty.keys(), ...qDutyById.values()])
  orphanDutyIds.forEach((id) => {
    if (!dutyById.has(id)) dutyById.set(id, { id, name: `Görev ${id.slice(0, 8)}` })
  })

  const packages = Array.from(dutyById.values())
    .map((d) => ({
      id: d.id,
      name: d.name,
      category_ids: Array.from(catIdsByDuty.get(d.id) || []),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  return packages
}

/** duty_package_names üzerinden yedek paket listesi */
export function buildDutyPackagesFromCategoryOptions(dutyCategories: PeriodCategoryOption[]): DutyPackageOption[] {
  const byName = new Map<string, Set<string>>()
  for (const c of dutyCategories) {
    for (const name of c.duty_package_names || []) {
      const n = String(name || '').trim()
      if (!n) continue
      const set = byName.get(n) || new Set<string>()
      set.add(c.id)
      byName.set(n, set)
    }
  }
  return Array.from(byName.entries())
    .map(([name, ids]) => ({
      id: `pkg:${normalizeMatchKey(name)}`,
      name,
      category_ids: Array.from(ids),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

export function resolveDutyPackagesForAdmin(
  fromDuties: DutyPackageOption[],
  dutyCategories: PeriodCategoryOption[],
  titleOnly: DutyPackageOption[] = []
): DutyPackageOption[] {
  if (fromDuties.length) return fromDuties
  const fromCats = buildDutyPackagesFromCategoryOptions(dutyCategories)
  if (fromCats.length) return fromCats
  return titleOnly
}

export type DutySetupStatus = {
  duties_in_db: number
  user_duty_links: number
  duty_category_links: number
  packages_shown: number
}

export async function loadDutySetupStatus(
  supabase: SupabaseLike,
  periodId: string,
  packagesShown: number
): Promise<DutySetupStatus> {
  const [duties, userDuties, dutyCats] = await Promise.all([
    queryPeriodDuties(supabase, periodId).catch(() => []),
    supabase
      .from('evaluation_period_user_duties')
      .select('duty_id')
      .eq('period_id', periodId)
      .eq('is_active', true),
    supabase
      .from('evaluation_period_duty_categories')
      .select('duty_id')
      .eq('period_id', periodId)
      .eq('is_active', true),
  ])
  return {
    duties_in_db: (duties || []).filter((d: any) => d.is_active !== false && String(d.name || '').trim()).length,
    user_duty_links: (userDuties.data || []).length,
    duty_category_links: (dutyCats.data || []).length,
    packages_shown: packagesShown,
  }
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string) {
  return UUID_RE.test(String(value || '').trim())
}

/** Kayıt öncesi: paket id → alt kategori; yalnızca geçerli UUID paketler scope satırında kalır */
export async function finalizeScopePayloadForSave(
  supabase: SupabaseLike,
  periodId: string,
  scope: {
    restrict_period: boolean
    duty_mode: EvaluatorDutyMode
    period_category_ids: string[]
    duty_category_ids: string[]
    duty_package_ids: string[]
  }
) {
  const packages = await loadDutyPackagesForPeriod(supabase, periodId)
  const dutyCats = new Set(scope.duty_category_ids.map(String).filter(Boolean))
  const packageIds: string[] = []

  for (const rawId of scope.duty_package_ids) {
    const pid = String(rawId || '').trim()
    if (!pid) continue
    const pkg =
      packages.find((p) => p.id === pid) ||
      (pid.startsWith('pkg:')
        ? packages.find((p) => `pkg:${normalizeMatchKey(p.name)}` === pid)
        : undefined)
    if (!pkg) continue
    if (isUuid(pkg.id)) packageIds.push(pkg.id)
    pkg.category_ids.forEach((cid) => dutyCats.add(cid))
  }

  return {
    ...scope,
    duty_category_ids: Array.from(dutyCats),
    duty_package_ids: Array.from(new Set(packageIds)),
  }
}

export async function fetchScopeRowExact(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string,
  targetId?: string | null,
  matrixContext: string = DEFAULT_MATRIX_EVALUATION_CONTEXT
): Promise<EvaluatorScopeConfig | null> {
  const forTarget = !!targetId
  const ctx = normalizeMatrixContext(matrixContext)
  const scopeTable = forTarget ? 'evaluation_period_evaluator_target_scope' : 'evaluation_period_evaluator_scope'
  const catTable = forTarget ? 'evaluation_period_evaluator_target_categories' : 'evaluation_period_evaluator_categories'

  let settings: any = null
  let sErr: any = null
  let q = supabase
    .from(scopeTable)
    .select('restrict_period, duty_mode, duty_package_ids')
    .eq('period_id', periodId)
    .eq('evaluator_id', evaluatorId)
  if (forTarget) q = q.eq('target_id', String(targetId)).eq('matrix_context', ctx)
  let res = await q.maybeSingle()

  if (res.error && String(res.error?.message || '').includes('matrix_context')) {
    let lq = supabase
      .from(scopeTable)
      .select('restrict_period, duty_mode, duty_package_ids')
      .eq('period_id', periodId)
      .eq('evaluator_id', evaluatorId)
    if (forTarget) lq = lq.eq('target_id', String(targetId))
    res = await lq.maybeSingle()
  }

  if (res.error && String(res.error?.message || '').includes('duty_package_ids')) {
    let lq = supabase.from(scopeTable).select('restrict_period, duty_mode').eq('period_id', periodId).eq('evaluator_id', evaluatorId)
    if (forTarget) lq = lq.eq('target_id', String(targetId))
    res = await lq.maybeSingle()
  }

  settings = res.data
  sErr = res.error

  if (sErr) {
    if (isMissingTable(sErr)) return null
    throw sErr
  }
  if (!settings) return null

  let cq = supabase
    .from(catTable)
    .select('category_id, scope_kind')
    .eq('period_id', periodId)
    .eq('evaluator_id', evaluatorId)
    .eq('is_active', true)
  if (forTarget) cq = cq.eq('target_id', String(targetId)).eq('matrix_context', ctx)
  let { data: cats, error: cErr } = await cq

  if (cErr && String(cErr.message || '').includes('matrix_context')) {
    let legacyCq = supabase
      .from(catTable)
      .select('category_id, scope_kind')
      .eq('period_id', periodId)
      .eq('evaluator_id', evaluatorId)
      .eq('is_active', true)
    if (forTarget) legacyCq = legacyCq.eq('target_id', String(targetId))
    const legacy = await legacyCq
    cats = legacy.data
    cErr = legacy.error
  }

  if (cErr) {
    if (isMissingTable(cErr)) return null
    throw cErr
  }

  const periodCategoryIds = new Set<string>()
  const dutyCategoryIds = new Set<string>()
  const dutyPackageIds = new Set<string>(
    Array.isArray(settings.duty_package_ids) ? (settings.duty_package_ids as any[]).map(String).filter(isUuid) : []
  )
  ;((cats || []) as any[]).forEach((r) => {
    const cid = String(r.category_id || '')
    if (!cid) return
    const kind = String(r.scope_kind || '')
    if (kind === 'duty_id' && isUuid(cid)) dutyPackageIds.add(cid)
    else if (kind === 'duty') dutyCategoryIds.add(cid)
    else if (kind !== 'duty_id') periodCategoryIds.add(cid)
  })

  const restrictPeriod = Boolean(settings.restrict_period)
  const dutyMode = String(settings.duty_mode || 'full') as EvaluatorDutyMode

  return {
    periodId,
    evaluatorId,
    targetId: forTarget ? String(targetId) : null,
    restrictPeriod,
    dutyMode: dutyMode === 'categories' || dutyMode === 'none' ? dutyMode : 'full',
    periodCategoryIds,
    dutyCategoryIds,
    dutyPackageIds,
    isConfigured: true,
    scopeLevel: forTarget ? 'target' : 'evaluator',
  }
}

/** Hedef kişinin dönemde atanmış görev paketi id'leri (Formatör vb.) */
export async function loadTargetDutyPackageIdsForPeriod(
  supabase: SupabaseLike,
  periodId: string,
  targetId: string
): Promise<string[]> {
  if (!periodId || !targetId) return []
  try {
    const { data, error } = await supabase
      .from('evaluation_period_user_duties')
      .select('duty_id')
      .eq('period_id', periodId)
      .eq('user_id', targetId)
      .eq('is_active', true)
    if (error) {
      if (isMissingTable(error)) return []
      throw error
    }
    return Array.from(new Set(((data || []) as any[]).map((r) => String(r.duty_id || '')).filter(isUuid)))
  } catch {
    return []
  }
}

/**
 * Varsayılan «yan görev yok» iken: yalnızca bu hedefin görev Excel’indeki paketini forma ekle.
 * Böylece Formatör seçmeden de sadece formatör atanmış kişilerde formatör soruları gelir.
 */
export function applyAutoTargetDutyPackages(
  config: EvaluatorScopeConfig | null,
  targetDutyPackageIds: string[]
): EvaluatorScopeConfig | null {
  if (!config?.isConfigured || !targetDutyPackageIds.length) return config
  if (config.scopeLevel === 'target') return config

  const targetSet = new Set(targetDutyPackageIds)

  if (config.dutyMode === 'none') {
    return {
      ...config,
      dutyMode: 'categories',
      dutyPackageIds: targetSet,
      dutyCategoryIds: new Set(config.dutyCategoryIds),
      periodCategoryIds: new Set(config.periodCategoryIds),
      usesAutoTargetDuties: true,
    }
  }

  if (
    config.dutyMode === 'categories' &&
    !config.dutyPackageIds.size &&
    !config.dutyCategoryIds.size
  ) {
    return {
      ...config,
      dutyPackageIds: targetSet,
      usesAutoTargetDuties: true,
    }
  }

  return config
}

/** Görev paketine bağlı alt kategori id'leri — önizleme/formda duty_id olmayan soruları eşlemek için */
async function loadDutyCategoryIdsForPackage(
  supabase: SupabaseLike,
  periodId: string,
  dutyPackageId: string
): Promise<Set<string>> {
  const [packagesRaw, dutyCategories, dutyTitlesOnly] = await Promise.all([
    loadDutyPackagesForPeriod(supabase, periodId),
    loadDutyCategoryOptionsForPeriod(supabase, periodId),
    loadDutyTitlesForPeriod(supabase, periodId),
  ])
  const packages = resolveDutyPackagesForAdmin(packagesRaw, dutyCategories, dutyTitlesOnly)
  const pkg = packages.find((p) => p.id === dutyPackageId)
  return new Set(pkg?.category_ids || [])
}

/** Aynı değerlendiren→hedef çiftinde ayrı yan-görev matris satırları var mı (genel forma tüm görevleri eklememek için). */
export async function evaluatorTargetHasDutyMatrixAssignments(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string,
  targetId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('evaluation_assignments')
      .select('matrix_context')
      .eq('period_id', periodId)
      .eq('evaluator_id', evaluatorId)
      .eq('target_id', targetId)
    if (error) return false
    return (data || []).some((row: { matrix_context?: string }) =>
      isDutyMatrixContext(row.matrix_context)
    )
  } catch {
    return false
  }
}

/**
 * Yan görev matrisi atamasında (kulüp, formatör vb.) forma yalnızca o görev paketinin soruları gelir.
 * Genel dönem soruları bu satırda gösterilmez — onlar yalnızca matrix_context=genel atamasında kalır.
 */
export async function prepareEvaluatorScopeForAssignment(
  supabase: SupabaseLike,
  config: EvaluatorScopeConfig | null,
  opts: {
    periodId: string
    evaluatorId: string
    targetId: string
    matrixContext: string
    duties: DutyLike[]
    periodCategoryIdsFromQuestions?: Set<string>
  }
): Promise<EvaluatorScopeConfig | null> {
  const ctx = normalizeMatrixContext(opts.matrixContext)

  if (ctx === 'okul_yasam') {
    if (config?.scopeLevel === 'target' && config.restrictPeriod && config.periodCategoryIds.size) {
      return {
        ...config,
        dutyMode: 'none',
        dutyCategoryIds: new Set(),
        dutyPackageIds: new Set(),
        usesAutoTargetDuties: false,
      }
    }
    return categoryOnlyScopeShell(opts.periodId, opts.evaluatorId, opts.targetId, config)
  }

  const preset = MATRIX_CONTEXT_DUTY_PRESET[ctx as MatrixEvaluationContext]
  if (!preset || ctx === 'genel') return config

  const dutyId = findDutyIdForMatrixPreset(opts.duties, preset)
  if (!dutyId) return config

  const dutyCategoryIds = await loadDutyCategoryIdsForPackage(supabase, opts.periodId, dutyId)

  const dutyOnlyScope: EvaluatorScopeConfig = {
    periodId: opts.periodId,
    evaluatorId: opts.evaluatorId,
    targetId: opts.targetId,
    restrictPeriod: true,
    dutyMode: 'categories',
    periodCategoryIds: new Set<string>(),
    dutyCategoryIds,
    dutyPackageIds: new Set([dutyId]),
    isConfigured: true,
    scopeLevel: config?.scopeLevel === 'target' ? 'target' : 'evaluator',
    usesAutoTargetDuties: false,
    matrixDutyAuto: true,
  }

  if (!config?.isConfigured) return dutyOnlyScope

  // Değerlendiren varsayılan kapsamı genel soruları taşır; görev matrisinde yalnızca bu paket.
  if (config.scopeLevel !== 'target') return dutyOnlyScope

  return {
    ...config,
    restrictPeriod: true,
    periodCategoryIds: new Set<string>(),
    dutyMode: 'categories',
    dutyPackageIds: new Set([dutyId]),
    dutyCategoryIds,
    usesAutoTargetDuties: false,
    matrixDutyAuto: true,
  }
}

export type PeriodScopeCache = {
  evaluatorById: Map<string, EvaluatorScopeConfig>
  targetByPair: Map<string, EvaluatorScopeConfig>
  targetDutyPackageIds: Map<string, string[]>
}

function scopeTargetKey(evaluatorId: string, targetId: string, matrixContext = DEFAULT_MATRIX_EVALUATION_CONTEXT) {
  return assignmentPairKey(evaluatorId, targetId, matrixContext)
}

function buildScopeConfigFromRow(
  periodId: string,
  evaluatorId: string,
  targetId: string | null,
  settings: any,
  catRows: any[],
  scopeLevel: 'evaluator' | 'target'
): EvaluatorScopeConfig | null {
  if (!settings) return null
  const periodCategoryIds = new Set<string>()
  const dutyCategoryIds = new Set<string>()
  const dutyPackageIds = new Set<string>(
    Array.isArray(settings.duty_package_ids) ? (settings.duty_package_ids as any[]).map(String).filter(isUuid) : []
  )
  catRows.forEach((r) => {
    const cid = String(r.category_id || '')
    if (!cid) return
    const kind = String(r.scope_kind || '')
    if (kind === 'duty_id' && isUuid(cid)) dutyPackageIds.add(cid)
    else if (kind === 'duty') dutyCategoryIds.add(cid)
    else if (kind !== 'duty_id') periodCategoryIds.add(cid)
  })
  const dutyMode = String(settings.duty_mode || 'full') as EvaluatorDutyMode
  return {
    periodId,
    evaluatorId,
    targetId,
    restrictPeriod: Boolean(settings.restrict_period),
    dutyMode: dutyMode === 'categories' || dutyMode === 'none' ? dutyMode : 'full',
    periodCategoryIds,
    dutyCategoryIds,
    dutyPackageIds,
    isConfigured: true,
    scopeLevel,
  }
}

/** Toplu kapsam raporu: dönemdeki tüm kapsam satırlarını birkaç sorguda yükler */
export async function loadPeriodEvaluatorScopeCache(
  supabase: SupabaseLike,
  periodId: string
): Promise<PeriodScopeCache> {
  const empty: PeriodScopeCache = {
    evaluatorById: new Map(),
    targetByPair: new Map(),
    targetDutyPackageIds: new Map(),
  }
  if (!periodId) return empty

  const targetDutyPackageIds = new Map<string, string[]>()
  try {
    const { data: duties, error: dErr } = await supabase
      .from('evaluation_period_user_duties')
      .select('user_id, duty_id')
      .eq('period_id', periodId)
      .eq('is_active', true)
    if (!dErr) {
      ;((duties || []) as any[]).forEach((r) => {
        const uid = String(r.user_id || '')
        const did = String(r.duty_id || '')
        if (!uid || !isUuid(did)) return
        const arr = targetDutyPackageIds.get(uid) || []
        if (!arr.includes(did)) arr.push(did)
        targetDutyPackageIds.set(uid, arr)
      })
    }
  } catch {
    /* optional table */
  }

  const evaluatorById = new Map<string, EvaluatorScopeConfig>()
  const targetByPair = new Map<string, EvaluatorScopeConfig>()

  const loadEvaluatorScopes = async () => {
    const { data: scopes, error } = await supabase
      .from('evaluation_period_evaluator_scope')
      .select('restrict_period, duty_mode, duty_package_ids, evaluator_id')
      .eq('period_id', periodId)
    if (error) {
      if (isMissingTable(error)) return
      throw error
    }
    const { data: cats, error: cErr } = await supabase
      .from('evaluation_period_evaluator_categories')
      .select('evaluator_id, category_id, scope_kind')
      .eq('period_id', periodId)
      .eq('is_active', true)
    if (cErr) {
      if (isMissingTable(cErr)) return
      throw cErr
    }
    const catsByEv = new Map<string, any[]>()
    ;((cats || []) as any[]).forEach((r) => {
      const eid = String(r.evaluator_id || '')
      if (!eid) return
      const list = catsByEv.get(eid) || []
      list.push(r)
      catsByEv.set(eid, list)
    })
    ;((scopes || []) as any[]).forEach((row) => {
      const eid = String(row.evaluator_id || '')
      if (!eid) return
      const cfg = buildScopeConfigFromRow(periodId, eid, null, row, catsByEv.get(eid) || [], 'evaluator')
      if (cfg) evaluatorById.set(eid, cfg)
    })
  }

  const loadTargetScopes = async () => {
    let scopeSelect = 'restrict_period, duty_mode, duty_package_ids, evaluator_id, target_id, matrix_context'
    let res = await supabase.from('evaluation_period_evaluator_target_scope').select(scopeSelect).eq('period_id', periodId)
    if (res.error && String(res.error?.message || '').includes('matrix_context')) {
      res = await supabase
        .from('evaluation_period_evaluator_target_scope')
        .select('restrict_period, duty_mode, duty_package_ids, evaluator_id, target_id')
        .eq('period_id', periodId)
    }
    if (res.error && String(res.error?.message || '').includes('duty_package_ids')) {
      res = await supabase
        .from('evaluation_period_evaluator_target_scope')
        .select('restrict_period, duty_mode, evaluator_id, target_id, matrix_context')
        .eq('period_id', periodId)
    }
    if (res.error) {
      if (isMissingTable(res.error)) return
      throw res.error
    }
    let catRes = await supabase
      .from('evaluation_period_evaluator_target_categories')
      .select('evaluator_id, target_id, category_id, scope_kind, matrix_context')
      .eq('period_id', periodId)
      .eq('is_active', true)
    if (catRes.error && String(catRes.error?.message || '').includes('matrix_context')) {
      catRes = await supabase
        .from('evaluation_period_evaluator_target_categories')
        .select('evaluator_id, target_id, category_id, scope_kind')
        .eq('period_id', periodId)
        .eq('is_active', true)
    }
    const { data: cats, error: cErr } = catRes
    if (cErr) {
      if (isMissingTable(cErr)) return
      throw cErr
    }
    const catsByPair = new Map<string, any[]>()
    ;((cats || []) as any[]).forEach((r) => {
      const eid = String(r.evaluator_id || '')
      const tid = String(r.target_id || '')
      if (!eid || !tid) return
      const k = scopeTargetKey(eid, tid, normalizeMatrixContext(r.matrix_context))
      const list = catsByPair.get(k) || []
      list.push(r)
      catsByPair.set(k, list)
    })
    ;((res.data || []) as any[]).forEach((row) => {
      const eid = String(row.evaluator_id || '')
      const tid = String(row.target_id || '')
      if (!eid || !tid) return
      const ctx = normalizeMatrixContext(row.matrix_context)
      const k = scopeTargetKey(eid, tid, ctx)
      const cfg = buildScopeConfigFromRow(periodId, eid, tid, row, catsByPair.get(k) || [], 'target')
      if (cfg) targetByPair.set(k, cfg)
    })
  }

  try {
    await Promise.all([loadEvaluatorScopes(), loadTargetScopes()])
  } catch {
    /* partial cache ok */
  }

  return { evaluatorById, targetByPair, targetDutyPackageIds }
}

export function resolveEvaluatorScopeConfigFromCache(
  cache: PeriodScopeCache,
  periodId: string,
  evaluatorId: string,
  targetId?: string | null,
  matrixContext: string = DEFAULT_MATRIX_EVALUATION_CONTEXT
): EvaluatorScopeConfig | null {
  if (!periodId || !evaluatorId) return null
  let config: EvaluatorScopeConfig | null = null
  const ctx = normalizeMatrixContext(matrixContext)
  if (targetId) {
    config = cache.targetByPair.get(scopeTargetKey(evaluatorId, targetId, ctx)) || null
  }
  if (!config) {
    config = cache.evaluatorById.get(evaluatorId) || null
  }
  if (!config || !targetId) return config
  if (ctx === 'okul_yasam') {
    return config.scopeLevel === 'target'
      ? { ...config, dutyMode: 'none', dutyPackageIds: new Set(), dutyCategoryIds: new Set(), usesAutoTargetDuties: false }
      : categoryOnlyScopeShell(periodId, evaluatorId, targetId, null)
  }
  if (ctx === 'genel') return config
  const targetDutyIds = cache.targetDutyPackageIds.get(targetId) || []
  return applyAutoTargetDutyPackages(config, targetDutyIds)
}

/** Önce hedef istisnası, yoksa değerlendiren varsayılanı + hedef görevine göre otomatik yan görev */
export async function fetchEvaluatorScopeConfig(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string,
  targetId?: string | null,
  matrixContext: string = DEFAULT_MATRIX_EVALUATION_CONTEXT
): Promise<EvaluatorScopeConfig | null> {
  if (!periodId || !evaluatorId) return null

  try {
    let config: EvaluatorScopeConfig | null = null
    const ctx = normalizeMatrixContext(matrixContext)
    if (ctx === 'okul_yasam') {
      if (targetId) {
        const targetScope = await fetchScopeRowExact(supabase, periodId, evaluatorId, targetId, ctx)
        if (targetScope?.isConfigured) {
          return {
            ...targetScope,
            dutyMode: 'none',
            dutyCategoryIds: new Set(),
            dutyPackageIds: new Set(),
            usesAutoTargetDuties: false,
          }
        }
      }
      return categoryOnlyScopeShell(periodId, evaluatorId, targetId, null)
    }

    if (targetId) {
      const targetScope = await fetchScopeRowExact(supabase, periodId, evaluatorId, targetId, ctx)
      if (targetScope?.isConfigured) config = targetScope
    }
    if (!config) {
      config = await fetchScopeRowExact(supabase, periodId, evaluatorId, null)
    }
    if (!config || !targetId) return config

    if (ctx === 'genel') {
      const hasDutyMatrixRows = await evaluatorTargetHasDutyMatrixAssignments(
        supabase,
        periodId,
        evaluatorId,
        targetId
      )
      if (hasDutyMatrixRows) return config
      const hasCategoryMatrix = await evaluatorHasCategoryMatrixAssignments(supabase, periodId, evaluatorId)
      if (hasCategoryMatrix) {
        return categoryOnlyScopeShell(periodId, evaluatorId, targetId, null)
      }
    }

    const targetDutyIds = await loadTargetDutyPackageIdsForPeriod(supabase, periodId, targetId)
    return applyAutoTargetDutyPackages(config, targetDutyIds)
  } catch {
    return null
  }
}

export async function persistEvaluatorScopeConfig(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string,
  scope: ScopeSavePayload,
  targetId?: string | null,
  matrixContext: string = DEFAULT_MATRIX_EVALUATION_CONTEXT
) {
  if (!supabase) throw new Error('Supabase yapılandırması eksik')

  const finalized = await finalizeScopePayloadForSave(supabase, periodId, scope)
  const forTarget = !!targetId
  const ctx = normalizeMatrixContext(matrixContext)
  const scopeTable = forTarget ? 'evaluation_period_evaluator_target_scope' : 'evaluation_period_evaluator_scope'
  const catTable = forTarget ? 'evaluation_period_evaluator_target_categories' : 'evaluation_period_evaluator_categories'

  const scopeRow: Record<string, unknown> = {
    period_id: periodId,
    evaluator_id: evaluatorId,
    restrict_period: finalized.restrict_period,
    duty_mode: finalized.duty_mode,
    updated_at: new Date().toISOString(),
    duty_package_ids: finalized.duty_package_ids,
  }
  if (forTarget) {
    scopeRow.target_id = String(targetId)
    scopeRow.matrix_context = ctx
  }

  const onConflict = forTarget ? 'period_id,evaluator_id,target_id,matrix_context' : 'period_id,evaluator_id'

  let upsertErr: any = null
  const first = await supabase.from(scopeTable).upsert(scopeRow, { onConflict })
  upsertErr = first.error
  if (upsertErr && String(upsertErr.message || '').includes('duty_package_ids')) {
    const { duty_package_ids: _d, ...legacyRow } = scopeRow
    const legacy = await supabase.from(scopeTable).upsert(legacyRow, { onConflict })
    upsertErr = legacy.error
  }
  if (upsertErr) throw upsertErr

  let del = supabase.from(catTable).delete().eq('period_id', periodId).eq('evaluator_id', evaluatorId)
  if (forTarget) {
    del = del.eq('target_id', String(targetId)).eq('matrix_context', ctx)
  }
  await del

  const catPayload = [
    ...finalized.period_category_ids.map((category_id) => ({
      period_id: periodId,
      evaluator_id: evaluatorId,
      ...(forTarget ? { target_id: String(targetId), matrix_context: ctx } : {}),
      category_id,
      scope_kind: 'period',
      is_active: true,
    })),
    ...finalized.duty_category_ids.map((category_id) => ({
      period_id: periodId,
      evaluator_id: evaluatorId,
      ...(forTarget ? { target_id: String(targetId), matrix_context: ctx } : {}),
      category_id,
      scope_kind: 'duty',
      is_active: true,
    })),
  ]

  if (catPayload.length) {
    const { error: insErr } = await supabase.from(catTable).insert(catPayload)
    if (insErr) throw insErr
  }
}

/** Mevcut kapsam kayıtlarında ana kategori altındaki eksik alt kategorileri tamamlar (veri silmez). */
export async function repairPeriodEvaluatorCategoryScopes(
  supabase: SupabaseLike,
  periodId: string,
  opts?: { dryRun?: boolean }
): Promise<{ updated_scopes: number; added_category_links: number }> {
  const categories = await loadPeriodCategoryOptions(supabase, periodId)
  if (periodCategoriesShareSingleMainBucket(categories)) {
    return { updated_scopes: 0, added_category_links: 0 }
  }
  const cache = await loadPeriodEvaluatorScopeCache(supabase, periodId)
  let updatedScopes = 0
  let addedCategoryLinks = 0

  const repairOne = async (config: EvaluatorScopeConfig, evaluatorId: string, targetId: string | null, matrixContext: string) => {
    if (!config.restrictPeriod || !config.periodCategoryIds.size) return
    const expanded = expandPeriodCategoryIds(categories, config.periodCategoryIds)
    if (expanded.size <= config.periodCategoryIds.size) return
    addedCategoryLinks += expanded.size - config.periodCategoryIds.size
    if (!opts?.dryRun) {
      await persistEvaluatorScopeConfig(
        supabase,
        periodId,
        evaluatorId,
        {
          restrict_period: config.restrictPeriod,
          duty_mode: config.dutyMode,
          period_category_ids: Array.from(expanded),
          duty_category_ids: Array.from(config.dutyCategoryIds),
          duty_package_ids: Array.from(config.dutyPackageIds),
        },
        targetId,
        matrixContext
      )
    }
    updatedScopes += 1
  }

  for (const [key, config] of cache.targetByPair) {
    const parts = key.split('::')
    const evaluatorId = parts[0] || ''
    const targetId = parts[1] || ''
    const matrixContext = parts.slice(2).join('::') || DEFAULT_MATRIX_EVALUATION_CONTEXT
    if (!evaluatorId || !targetId) continue
    await repairOne(config, evaluatorId, targetId, matrixContext)
  }

  for (const [evaluatorId, config] of cache.evaluatorById) {
    await repairOne(config, evaluatorId, null, DEFAULT_MATRIX_EVALUATION_CONTEXT)
  }

  return { updated_scopes: updatedScopes, added_category_links: addedCategoryLinks }
}

export async function deleteEvaluatorScopeConfig(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string,
  targetId?: string | null,
  matrixContext: string = DEFAULT_MATRIX_EVALUATION_CONTEXT
) {
  const forTarget = !!targetId
  const ctx = normalizeMatrixContext(matrixContext)
  const scopeTable = forTarget ? 'evaluation_period_evaluator_target_scope' : 'evaluation_period_evaluator_scope'
  const catTable = forTarget ? 'evaluation_period_evaluator_target_categories' : 'evaluation_period_evaluator_categories'

  let delCats = supabase.from(catTable).delete().eq('period_id', periodId).eq('evaluator_id', evaluatorId)
  let delScope = supabase.from(scopeTable).delete().eq('period_id', periodId).eq('evaluator_id', evaluatorId)
  if (forTarget) {
    delCats = delCats.eq('target_id', String(targetId)).eq('matrix_context', ctx)
    delScope = delScope.eq('target_id', String(targetId)).eq('matrix_context', ctx)
  }
  await delCats
  await delScope
}

/** Dönemdeki tüm hedefler → görev paketi adları (toplu rapor) */
export async function loadTargetDutyNamesByUserForPeriod(
  supabase: SupabaseLike,
  periodId: string
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (!periodId) return out
  try {
    const { data: links, error } = await supabase
      .from('evaluation_period_user_duties')
      .select('user_id, duty_id')
      .eq('period_id', periodId)
      .eq('is_active', true)
    if (error) return out
    const dutyIds = new Set<string>()
    const byUser = new Map<string, string[]>()
    for (const r of (links || []) as any[]) {
      const uid = String(r.user_id || '')
      const did = String(r.duty_id || '')
      if (!uid || !did) continue
      dutyIds.add(did)
      const arr = byUser.get(uid) || []
      if (!arr.includes(did)) arr.push(did)
      byUser.set(uid, arr)
    }
    if (!dutyIds.size) return out
    const { data: duties } = await supabase.from('evaluation_duties').select('id, name').in('id', [...dutyIds])
    const nameById = new Map<string, string>()
    ;((duties || []) as any[]).forEach((d) => {
      if (d?.id) nameById.set(String(d.id), String(d.name || '').trim())
    })
    for (const [uid, ids] of byUser) {
      const names = Array.from(new Set(ids.map((id) => nameById.get(id)).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, 'tr')
      )
      if (names.length) out.set(uid, names)
    }
  } catch {
    // ignore
  }
  return out
}

/** Hedefin atanmış görev paketi adları (önizleme / ipucu) */
export async function loadTargetDutyNamesForPeriod(
  supabase: SupabaseLike,
  periodId: string,
  targetId: string
): Promise<string[]> {
  if (!periodId || !targetId) return []
  try {
    const { data: links, error } = await supabase
      .from('evaluation_period_user_duties')
      .select('duty_id')
      .eq('period_id', periodId)
      .eq('user_id', targetId)
      .eq('is_active', true)
    if (error) {
      if (isMissingTable(error)) return []
      throw error
    }
    const dutyIds = Array.from(new Set(((links || []) as any[]).map((r) => String(r.duty_id || '')).filter(Boolean)))
    if (!dutyIds.length) return []
    const { data: duties } = await supabase.from('evaluation_duties').select('id, name').in('id', dutyIds)
    return ((duties || []) as any[]).map((d) => String(d.name || '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

function dutyPackageMatchesQuestion(config: EvaluatorScopeConfig, q: any): boolean {
  const dutyId = String(q?.duty_id || '').trim()
  if (dutyId && config.dutyPackageIds.has(dutyId)) return true
  const catId = questionCategoryId(q)
  if (catId && config.dutyCategoryIds.has(catId)) return true
  const dutyName = String(q?.duty_name || '').trim()
  if (!dutyName) return false
  const nameKey = normalizeMatchKey(dutyName)
  for (const pid of config.dutyPackageIds) {
    if (pid.startsWith('pkg:') && pid.slice(4) === nameKey) return true
  }
  return false
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
        if (dutyPackageMatchesQuestion(config, q)) return true
        if (config.dutyCategoryIds.size && catId && config.dutyCategoryIds.has(catId)) return true
        if (config.dutyPackageIds.size) return false
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

/** Değerlendiren kapsamındaki yan görev paketleri — hedef Excel'inden bağımsız soruları forma ekle */
export async function mergeEvaluatorScopedDutyQuestions(
  supabase: SupabaseLike,
  periodId: string,
  questions: any[],
  answersByQuestion: Record<string, any[]>,
  config: EvaluatorScopeConfig | null,
  dutyScopeMeta: DutyScopeMeta | null,
  preloadedDutyPackages?: DutyPackageOption[]
): Promise<any[]> {
  if (!periodId || !config?.isConfigured || config.dutyMode === 'none') return questions

  const existing = new Set(questions.map((q) => String(q.id)))
  let dutyPackages = preloadedDutyPackages || []
  if (!dutyPackages.length) {
    const [packagesRaw, dutyCategories, dutyTitlesOnly] = await Promise.all([
      loadDutyPackagesForPeriod(supabase, periodId),
      loadDutyCategoryOptionsForPeriod(supabase, periodId),
      loadDutyTitlesForPeriod(supabase, periodId),
    ])
    dutyPackages = resolveDutyPackagesForAdmin(packagesRaw, dutyCategories, dutyTitlesOnly)
  }

  const questionIds = new Set<string>()
  if (config.dutyMode === 'full') {
    const allDutyIds = dutyPackages.map((p) => p.id).filter((id) => isUuid(id))
    const ids = await collectQuestionIdsForDutyIds(supabase, periodId, allDutyIds)
    ids.forEach((id) => questionIds.add(id))
  } else {
    const dutyIds: string[] = []
    for (const pid of config.dutyPackageIds) {
      if (isUuid(pid)) dutyIds.push(pid)
      else if (pid.startsWith('pkg:')) {
        const pkg = dutyPackages.find((p) => `pkg:${normalizeMatchKey(p.name)}` === pid)
        if (pkg && isUuid(pkg.id)) dutyIds.push(pkg.id)
      }
    }
    if (dutyIds.length) {
      const ids = await collectQuestionIdsForDutyIds(supabase, periodId, dutyIds)
      ids.forEach((id) => questionIds.add(id))
    }
    if (config.dutyCategoryIds.size) {
      const { data: catQs } = await supabase
        .from('questions')
        .select('id')
        .in('category_id', [...config.dutyCategoryIds])
      ;((catQs || []) as any[]).forEach((r) => {
        if (r?.id) questionIds.add(String(r.id))
      })
    }
  }

  const extraIds = [...questionIds].filter((id) => !existing.has(id))
  if (!extraIds.length) return questions

  const orderCols = ['sort_order', 'order_num'] as const
  const fetchRows = async (mode: 'question_categories' | 'categories') => {
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
    rows = await fetchRows('question_categories')
  } catch {
    rows = await fetchRows('categories')
  }

  const dutyNameById = new Map(dutyPackages.map((p) => [p.id, p.name]))
  const tagged = rows.map((q) => {
    const qid = String(q.id)
    let dutyId = dutyScopeMeta?.questionDutyMap.get(qid)?.dutyId || null
    let dutyName = dutyScopeMeta?.questionDutyMap.get(qid)?.dutyName || null
    if (!dutyId) {
      for (const pkg of dutyPackages) {
        if (config.dutyPackageIds.has(pkg.id) && pkg.category_ids.includes(String(q.category_id || ''))) {
          dutyId = pkg.id
          dutyName = pkg.name
          break
        }
      }
    }
    if (!dutyName && dutyId) dutyName = dutyNameById.get(dutyId) || 'Ek görev'
    return {
      ...q,
      question_scope: 'duty' as const,
      duty_id: dutyId,
      duty_name: dutyName,
    }
  })

  const aRes = await supabase.from('question_answers').select('*').in('question_id', extraIds)
  const answerRows =
    aRes.error && !aRes.data
      ? ((await supabase.from('answers').select('*').in('question_id', extraIds)).data || [])
      : (aRes.data || [])
  ;(answerRows as any[]).forEach((a: any) => {
    if (typeof a.is_active === 'boolean' && !a.is_active) return
    const qid = String(a.question_id || '')
    if (!qid) return
    if (!answersByQuestion[qid]) answersByQuestion[qid] = []
    answersByQuestion[qid].push(a)
  })

  return [...questions, ...tagged]
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

export type AssignmentScopePreview = {
  question_count: number
  period_question_count: number
  duty_question_count: number
  matrix_context?: MatrixEvaluationContext
  matrix_context_label?: string | null
  scope_kind: 'all_unscoped' | 'evaluator_default' | 'target_override' | 'auto_target_duties' | 'matrix_duty_auto'
  scope_label: string
  restrict_period: boolean
  duty_mode: EvaluatorDutyMode
  period_category_labels: string[]
  duty_package_labels: string[]
  target_duty_names: string[]
  breakdown: PreviewCategoryRow[]
}

export type ScopePreviewPeriodContext = {
  categories: PeriodCategoryOption[]
  dutyCategories: PeriodCategoryOption[]
  dutyPackages: DutyPackageOption[]
  useSnapshot: boolean
  /** Toplu kapsam raporu: dönem soruları bir kez yüklenir */
  periodQuestionsBase?: any[]
  /** Toplu rapor: hedef → önceden yüklenmiş yan görev soruları */
  dutyQuestionsByTarget?: Map<string, any[]>
  scopeCache?: PeriodScopeCache
  /** Matris kapsam raporu: satır başına DB sorgusu yok */
  bulkReport?: boolean
  periodDuties?: DutyLike[]
  targetDutyNamesByTarget?: Map<string, string[]>
}

export async function loadScopePreviewPeriodContext(
  supabase: SupabaseLike,
  periodId: string,
  opts?: { preloadQuestions?: boolean }
): Promise<ScopePreviewPeriodContext> {
  const [categories, dutyCategories, dutyPackagesRaw, dutyTitlesOnly, useSnapshot] = await Promise.all([
    loadPeriodCategoryOptions(supabase, periodId),
    loadDutyCategoryOptionsForPeriod(supabase, periodId),
    loadDutyPackagesForPeriod(supabase, periodId),
    loadDutyTitlesForPeriod(supabase, periodId),
    periodUsesSnapshot(supabase, periodId),
  ])
  const dutyPackages = resolveDutyPackagesForAdmin(dutyPackagesRaw, dutyCategories, dutyTitlesOnly)

  let periodQuestionsBase: any[] | undefined
  if (opts?.preloadQuestions) {
    if (useSnapshot) {
      const { data: qs } = await supabase
        .from('evaluation_period_questions_snapshot')
        .select('id, category_id, is_active')
        .eq('period_id', periodId)
      periodQuestionsBase = ((qs || []) as any[])
        .filter((q) => (typeof q.is_active === 'boolean' ? q.is_active : true))
        .map((q) => ({ ...q, question_scope: 'period' as const }))
    } else {
      const { data: pq } = await supabase
        .from('evaluation_period_questions')
        .select('question_id')
        .eq('period_id', periodId)
        .eq('is_active', true)
      const ids = (pq || []).map((r: any) => r.question_id).filter(Boolean)
      if (ids.length) {
        const { data: qd } = await supabase.from('questions').select('id, category_id').in('id', ids)
        periodQuestionsBase = (qd || []).map((row: any) => ({ ...row, question_scope: 'period' as const }))
      } else {
        periodQuestionsBase = []
      }
    }
  }

  return { categories, dutyCategories, dutyPackages, useSnapshot, periodQuestionsBase }
}

/** Matris kapsam raporu — ortak önbellek (binlerce satır) */
export async function loadBulkScopeReportContext(
  supabase: SupabaseLike,
  periodId: string
): Promise<ScopePreviewPeriodContext> {
  const [scopeCache, ctxBase, targetDutyNamesByTarget, dutiesRes] = await Promise.all([
    loadPeriodEvaluatorScopeCache(supabase, periodId),
    loadScopePreviewPeriodContext(supabase, periodId, { preloadQuestions: true }),
    loadTargetDutyNamesByUserForPeriod(supabase, periodId),
    supabase.from('evaluation_duties').select('id, name, code, name_en, name_fr').eq('period_id', periodId),
  ])
  const periodQIds = new Set((ctxBase.periodQuestionsBase || []).map((q) => String(q.id)))
  const dutyQuestionsByTarget = await preloadDutyQuestionsByTarget(supabase, periodId, periodQIds)
  return {
    ...ctxBase,
    scopeCache,
    dutyQuestionsByTarget,
    bulkReport: true,
    periodDuties: ((dutiesRes.data || []) as DutyLike[]) || [],
    targetDutyNamesByTarget,
  }
}

export function mergeScopeReportStats(
  chunks: Array<{
    total: number
    avg_questions: number
    min_questions: number
    max_questions: number
    unscoped_count: number
    target_override_count: number
  }>
) {
  if (!chunks.length) {
    return { total: 0, avg_questions: 0, min_questions: 0, max_questions: 0, unscoped_count: 0, target_override_count: 0 }
  }
  let sumQ = 0
  let min = Number.POSITIVE_INFINITY
  let max = 0
  let unscoped = 0
  let targetOverride = 0
  let total = 0
  for (const c of chunks) {
    total += c.total
    sumQ += c.avg_questions * c.total
    min = Math.min(min, c.min_questions)
    max = Math.max(max, c.max_questions)
    unscoped += c.unscoped_count
    targetOverride += c.target_override_count || 0
  }
  return {
    total,
    avg_questions: total ? Math.round(sumQ / total) : 0,
    min_questions: total && Number.isFinite(min) ? min : 0,
    max_questions: max,
    unscoped_count: unscoped,
    target_override_count: targetOverride,
  }
}

/** Toplu kapsam raporu: hedef başına yan görev sorularını önceden yükle */
export async function preloadDutyQuestionsByTarget(
  supabase: SupabaseLike,
  periodId: string,
  periodQuestionIds: Set<string>
): Promise<Map<string, any[]>> {
  const { buildDutyScopeIndexForPeriod } = await import('@/lib/server/evaluation-duty-questions')
  const index = await buildDutyScopeIndexForPeriod(supabase, periodId)
  const allExtra = new Set<string>()
  for (const ids of index.values()) {
    for (const id of ids) {
      if (!periodQuestionIds.has(id)) allExtra.add(id)
    }
  }
  const out = new Map<string, any[]>()
  if (!allExtra.size) return out

  const { data: qd } = await supabase.from('questions').select('id, category_id').in('id', [...allExtra])
  const byId = new Map<string, any>()
  ;((qd || []) as any[]).forEach((row) => {
    byId.set(String(row.id), { ...row, question_scope: 'duty' as const })
  })

  for (const [targetId, ids] of index) {
    const qs = [...ids].map((id) => byId.get(id)).filter(Boolean) as any[]
    if (qs.length) out.set(targetId, qs)
  }
  return out
}

function scopeKindAndLabel(
  config: EvaluatorScopeConfig | null,
  matrixContext: string = DEFAULT_MATRIX_EVALUATION_CONTEXT
): {
  scope_kind: AssignmentScopePreview['scope_kind']
  scope_label: string
} {
  const mctx = normalizeMatrixContext(matrixContext)
  const matrixLabel = matrixEvaluationContextLabel(mctx)

  if (config?.matrixDutyAuto || (isDutyMatrixContext(mctx) && config?.isConfigured && config.dutyPackageIds.size > 0)) {
    return {
      scope_kind: 'matrix_duty_auto',
      scope_label: `${matrixLabel} matrisi — yalnızca bu görev paketinin soruları (genel ayrı atamada)`,
    }
  }
  if (!config?.isConfigured) {
    if (isDutyMatrixContext(mctx)) {
      return {
        scope_kind: 'all_unscoped',
        scope_label: `${matrixLabel} matrisi — kapsam tanımsız (yalnızca bu görev paketi önerilir)`,
      }
    }
    return { scope_kind: 'all_unscoped', scope_label: 'Kapsam tanımsız — tüm dönem soruları' }
  }
  if (config.scopeLevel === 'target') {
    return { scope_kind: 'target_override', scope_label: 'Bu hedef için özel kapsam' }
  }
  if (config.usesAutoTargetDuties) {
    return { scope_kind: 'auto_target_duties', scope_label: 'Varsayılan + hedefin görev Excel paketleri' }
  }
  return { scope_kind: 'evaluator_default', scope_label: 'Değerlendiren varsayılan kapsamı' }
}

function categoryNamesFromIds(ids: Set<string>, options: PeriodCategoryOption[]) {
  const byId = new Map(options.map((c) => [c.id, c.name]))
  return Array.from(ids)
    .map((id) => byId.get(id) || id)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'tr'))
}

function dutyPackageNamesFromIds(ids: Set<string>, packages: DutyPackageOption[]) {
  const byId = new Map(packages.map((p) => [p.id, p.name]))
  const names: string[] = []
  for (const id of ids) {
    const n = byId.get(id)
    if (n) names.push(n)
    else if (id.startsWith('pkg:')) {
      const pkg = packages.find((p) => `pkg:${normalizeMatchKey(p.name)}` === id)
      if (pkg) names.push(pkg.name)
    }
  }
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'tr'))
}

/** Admin önizleme: değerlendiren–hedef çifti için matris bağlamı (istek veya atamadan) */
export async function resolvePreviewMatrixContextForPair(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string,
  targetId: string,
  requested?: string | null
): Promise<{ matrix_context: MatrixEvaluationContext; options: MatrixEvaluationContext[] }> {
  const fallback = { matrix_context: DEFAULT_MATRIX_EVALUATION_CONTEXT as MatrixEvaluationContext, options: [DEFAULT_MATRIX_EVALUATION_CONTEXT] }
  if (!periodId || !evaluatorId || !targetId) return fallback

  let rows: { matrix_context?: string | null }[] = []
  const res = await supabase
    .from('evaluation_assignments')
    .select('matrix_context')
    .eq('period_id', periodId)
    .eq('evaluator_id', evaluatorId)
    .eq('target_id', targetId)
  if (!res.error) rows = (res.data || []) as typeof rows

  const options = Array.from(
    new Set(
      rows.length
        ? rows.map((r) => normalizeMatrixContext(r.matrix_context))
        : [DEFAULT_MATRIX_EVALUATION_CONTEXT]
    )
  ).sort((a, b) => a.localeCompare(b, 'tr'))

  if (requested) {
    const ctx = normalizeMatrixContext(requested)
    return { matrix_context: ctx, options: options.includes(ctx) ? options : [...options, ctx] }
  }

  const dutyContexts = options.filter((c) => isDutyMatrixContext(c))
  if (dutyContexts.length === 1) return { matrix_context: dutyContexts[0], options }
  if (options.length === 1) return { matrix_context: options[0], options }

  const nonGenel = options.filter((c) => c !== 'genel' && c !== 'okul_yasam')
  if (nonGenel.length === 1) return { matrix_context: nonGenel[0], options }
  if (nonGenel.length > 1) return { matrix_context: nonGenel[0], options }

  return { matrix_context: DEFAULT_MATRIX_EVALUATION_CONTEXT, options }
}

/** Matris satırı / rapor: bu değerlendiren–hedef için forma girecek sorular */
export async function computeAssignmentScopePreview(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string,
  targetId: string,
  ctx?: ScopePreviewPeriodContext,
  matrixContext: string = DEFAULT_MATRIX_EVALUATION_CONTEXT
): Promise<AssignmentScopePreview> {
  const context = ctx || (await loadScopePreviewPeriodContext(supabase, periodId))
  const mergedCats = mergeCategoryOptionsForPreview(context.categories, context.dutyCategories)
  const mctx = normalizeMatrixContext(matrixContext)

  let config: EvaluatorScopeConfig | null = null
  if (context.scopeCache) {
    config = resolveEvaluatorScopeConfigFromCache(context.scopeCache, periodId, evaluatorId, targetId, mctx)
    if (config?.scopeLevel === 'target') {
      config = { ...config, scopeLevel: 'target' as const }
    }
  } else {
    const rawConfig = await fetchEvaluatorScopeConfig(supabase, periodId, evaluatorId, targetId, mctx)
    config = rawConfig
    if (targetId && rawConfig) {
      const targetRow = await fetchScopeRowExact(supabase, periodId, evaluatorId, targetId, mctx)
      if (targetRow?.isConfigured) config = { ...rawConfig, scopeLevel: 'target' }
    }
  }

  const target_duty_names = context.bulkReport
    ? targetId
      ? context.targetDutyNamesByTarget?.get(targetId) || []
      : []
    : targetId
      ? await loadTargetDutyNamesForPeriod(supabase, periodId, targetId)
      : []

  const dutyMeta = targetId && !context.dutyQuestionsByTarget
    ? await fetchDutyScopeMetaForTarget(supabase, periodId, targetId)
    : null
  let questions: any[] = []

  if (context.periodQuestionsBase) {
    questions = [...context.periodQuestionsBase]
    const preloadedDuty = targetId ? context.dutyQuestionsByTarget?.get(targetId) : undefined
    if (preloadedDuty?.length) {
      questions = [...questions, ...preloadedDuty]
    } else if (dutyMeta?.dutyOnlyQuestionIds.size && targetId) {
      const snapIds = new Set(questions.map((q) => String(q.id)))
      const { questions: dutyQs } = await loadDutyQuestionsForEvaluation(supabase, periodId, targetId, snapIds)
      questions = [...questions, ...dutyQs]
    }
  } else if (context.useSnapshot) {
    const { data: qs } = await supabase
      .from('evaluation_period_questions_snapshot')
      .select('id, category_id, is_active')
      .eq('period_id', periodId)
    questions = ((qs || []) as any[])
      .filter((q) => (typeof q.is_active === 'boolean' ? q.is_active : true))
      .map((q) => ({ ...q, question_scope: 'period' as const }))
    if (dutyMeta?.dutyOnlyQuestionIds.size && targetId) {
      const snapIds = new Set(questions.map((q) => String(q.id)))
      const { questions: dutyQs } = await loadDutyQuestionsForEvaluation(supabase, periodId, targetId, snapIds)
      questions = [...questions, ...dutyQs]
    }
  } else {
    let periodQuestionIds: string[] | null = null
    const { data: pq } = await supabase
      .from('evaluation_period_questions')
      .select('question_id')
      .eq('period_id', periodId)
      .eq('is_active', true)
    const ids = (pq || []).map((r: any) => r.question_id).filter(Boolean)
    if (ids.length) periodQuestionIds = ids
    if (targetId) {
      periodQuestionIds = await resolvePeriodQuestionIdsForTarget(supabase, periodId, targetId, periodQuestionIds)
    }
    const q = supabase.from('questions').select('id, category_id')
    if (periodQuestionIds?.length) q.in('id', periodQuestionIds)
    const { data: qd } = await q
    questions = (qd || []).map((row: any) => {
      const scoped = dutyMeta ? questionScopeForId(String(row.id), dutyMeta) : { scope: 'period' as const }
      return { ...row, question_scope: scoped.scope }
    })
  }

  let effectiveConfig = config
  if ((isDutyMatrixContext(mctx) || isCategoryMatrixContext(mctx)) && targetId) {
    const periodCategoryIdsFromQuestions = new Set<string>()
    questions.forEach((q) => {
      if (String(q?.question_scope || 'period') === 'duty') return
      const cid = questionCategoryId(q)
      if (cid) periodCategoryIdsFromQuestions.add(cid)
    })
    const dutyRows = isDutyMatrixContext(mctx)
      ? context.periodDuties?.length
        ? context.periodDuties
        : (((await supabase
            .from('evaluation_duties')
            .select('id, name, code, name_en, name_fr')
            .eq('period_id', periodId)).data || []) as DutyLike[])
      : []
    effectiveConfig = await prepareEvaluatorScopeForAssignment(supabase, config, {
      periodId,
      evaluatorId,
      targetId,
      matrixContext: mctx,
      duties: dutyRows,
      periodCategoryIdsFromQuestions,
    })
  }

  if (effectiveConfig?.isConfigured && effectiveConfig.dutyMode !== 'none' && targetId) {
    questions = await mergeEvaluatorScopedDutyQuestions(
      supabase,
      periodId,
      questions,
      {},
      effectiveConfig,
      dutyMeta,
      context.dutyPackages
    )
  }

  effectiveConfig = await enrichEvaluatorScopePeriodCategories(supabase, periodId, effectiveConfig, mctx)

  const filtered = filterQuestionsForEvaluatorScope(questions, effectiveConfig)
  const breakdown = context.bulkReport ? [] : summarizeQuestionsByCategory(filtered, mergedCats)
  const period_question_count = filtered.filter((q) => String(q?.question_scope || 'period') !== 'duty').length
  const duty_question_count = filtered.length - period_question_count

  const { scope_kind, scope_label } = scopeKindAndLabel(effectiveConfig, mctx)
  const matrix_context_label = isDutyMatrixContext(mctx) ? matrixEvaluationContextLabel(mctx) : null
  const duty_package_labels =
    context.bulkReport || !effectiveConfig?.isConfigured || !effectiveConfig.dutyPackageIds.size
      ? []
      : dutyPackageNamesFromIds(effectiveConfig.dutyPackageIds, context.dutyPackages)

  return {
    question_count: filtered.length,
    period_question_count,
    duty_question_count,
    matrix_context: mctx,
    matrix_context_label,
    scope_kind,
    scope_label,
    restrict_period: Boolean(effectiveConfig?.restrictPeriod),
    duty_mode: effectiveConfig?.dutyMode || 'full',
    period_category_labels:
      context.bulkReport || !effectiveConfig?.isConfigured
        ? []
        : categoryNamesFromIds(effectiveConfig.periodCategoryIds, mergedCats),
    duty_package_labels,
    target_duty_names: context.bulkReport ? [] : target_duty_names,
    breakdown,
  }
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
