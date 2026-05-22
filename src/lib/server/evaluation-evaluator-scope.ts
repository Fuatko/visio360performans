import { normalizeMatchKey } from '@/lib/duty-title-match'

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
  targetId?: string | null
): Promise<EvaluatorScopeConfig | null> {
  const forTarget = !!targetId
  const scopeTable = forTarget ? 'evaluation_period_evaluator_target_scope' : 'evaluation_period_evaluator_scope'
  const catTable = forTarget ? 'evaluation_period_evaluator_target_categories' : 'evaluation_period_evaluator_categories'

  let settings: any = null
  let sErr: any = null
  let q = supabase
    .from(scopeTable)
    .select('restrict_period, duty_mode, duty_package_ids')
    .eq('period_id', periodId)
    .eq('evaluator_id', evaluatorId)
  if (forTarget) q = q.eq('target_id', String(targetId))
  let res = await q.maybeSingle()

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
  if (forTarget) cq = cq.eq('target_id', String(targetId))
  const { data: cats, error: cErr } = await cq

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

/** Önce hedef istisnası, yoksa değerlendiren varsayılanı + hedef görevine göre otomatik yan görev */
export async function fetchEvaluatorScopeConfig(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string,
  targetId?: string | null
): Promise<EvaluatorScopeConfig | null> {
  if (!periodId || !evaluatorId) return null

  try {
    let config: EvaluatorScopeConfig | null = null
    if (targetId) {
      const targetScope = await fetchScopeRowExact(supabase, periodId, evaluatorId, targetId)
      if (targetScope?.isConfigured) config = targetScope
    }
    if (!config) {
      config = await fetchScopeRowExact(supabase, periodId, evaluatorId, null)
    }
    if (!config || !targetId) return config

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
  targetId?: string | null
) {
  if (!supabase) throw new Error('Supabase yapılandırması eksik')

  const finalized = await finalizeScopePayloadForSave(supabase, periodId, scope)
  const forTarget = !!targetId
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
  if (forTarget) scopeRow.target_id = String(targetId)

  const onConflict = forTarget ? 'period_id,evaluator_id,target_id' : 'period_id,evaluator_id'

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
  if (forTarget) del = del.eq('target_id', String(targetId))
  await del

  const catPayload = [
    ...finalized.period_category_ids.map((category_id) => ({
      period_id: periodId,
      evaluator_id: evaluatorId,
      ...(forTarget ? { target_id: String(targetId) } : {}),
      category_id,
      scope_kind: 'period',
      is_active: true,
    })),
    ...finalized.duty_category_ids.map((category_id) => ({
      period_id: periodId,
      evaluator_id: evaluatorId,
      ...(forTarget ? { target_id: String(targetId) } : {}),
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

export async function deleteEvaluatorScopeConfig(
  supabase: SupabaseLike,
  periodId: string,
  evaluatorId: string,
  targetId?: string | null
) {
  const forTarget = !!targetId
  const scopeTable = forTarget ? 'evaluation_period_evaluator_target_scope' : 'evaluation_period_evaluator_scope'
  const catTable = forTarget ? 'evaluation_period_evaluator_target_categories' : 'evaluation_period_evaluator_categories'

  let delCats = supabase.from(catTable).delete().eq('period_id', periodId).eq('evaluator_id', evaluatorId)
  let delScope = supabase.from(scopeTable).delete().eq('period_id', periodId).eq('evaluator_id', evaluatorId)
  if (forTarget) {
    delCats = delCats.eq('target_id', String(targetId))
    delScope = delScope.eq('target_id', String(targetId))
  }
  await delCats
  await delScope
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

export function filterQuestionsForEvaluatorScope(questions: any[], config: EvaluatorScopeConfig | null): any[] {
  if (!config?.isConfigured) return questions

  return (questions || []).filter((q) => {
    const scope = String(q?.question_scope || 'period')
    const catId = questionCategoryId(q)

    if (scope === 'duty') {
      if (config.dutyMode === 'none') return false
      if (config.dutyMode === 'full') return true
      const dutyId = String(q?.duty_id || '').trim()
      if (config.dutyPackageIds.size && dutyId && config.dutyPackageIds.has(dutyId)) return true
      if (config.dutyMode === 'categories') {
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
