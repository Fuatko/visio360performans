import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { canonicalAssignmentId, userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

type Body = {
  period_id?: string
  org_id?: string
  person_id?: string | null
  department?: string | null
  /** true: ekip değerlendiricileri isim isim; false/undefined: yalnızca öz + ekip ortalaması özeti (toplantı modu) */
  include_peer_detail?: boolean
}

/** PostgREST varsayılan ~1000 satır; tüm tamamlanan atamaları almak için sayfalama */
const ASSIGNMENTS_PAGE_SIZE = 1000
/** Uzun `.in()` URL limiti */
const RESPONSES_IN_CHUNK = 100
const USERS_IN_CHUNK = 200

function normDeptKey(s: string) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const msg = (tr: string, en: string, fr: string) => (lang === 'fr' ? fr : lang === 'en' ? en : tr)

  // Heavy report endpoint: rate limit by user to avoid corporate NAT false-positives
  const rl = await rateLimitByUser(req, 'admin:results:post', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const includePeerDetail = body.include_peer_detail === true
  const periodId = String(body.period_id || '').trim()
  const orgId = String(body.org_id || '').trim()
  const personId = body.person_id ? String(body.person_id) : ''
  const dept = body.department ? String(body.department) : ''
  const deptKey = dept ? normDeptKey(dept) : ''

  const orgToUse = s.role === 'org_admin' ? String(s.org_id || '') : orgId
  if (!periodId || !orgToUse) {
    return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })
  }

  const assignmentSelect = `
      *,
      evaluator:evaluator_id(id, name, department, organization_id, position_level),
      target:target_id(id, name, department, organization_id)
    `

  const assignments: any[] = []
  let rangeFrom = 0
  while (true) {
    const rangeTo = rangeFrom + ASSIGNMENTS_PAGE_SIZE - 1
    const { data: page, error: aErr } = await supabase
      .from('evaluation_assignments')
      .select(assignmentSelect)
      .eq('period_id', periodId)
      .eq('status', 'completed')
      .order('id', { ascending: true })
      .range(rangeFrom, rangeTo)

    if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atamalar alınamadı' }, { status: 400 })
    const rows = page || []
    assignments.push(...rows)
    if (rows.length < ASSIGNMENTS_PAGE_SIZE) break
    rangeFrom += ASSIGNMENTS_PAGE_SIZE
  }

  // target embed bazen boş döner; kurum filtresi yanlışlıkla tüm satırları eleyebilir. target_id → users ile yedek.
  const targetIds = Array.from(
    new Set(
      (assignments as any[])
        .map((a) => String(a?.target_id ?? '').trim())
        .filter(Boolean)
    )
  )
  const userByTargetId = new Map<string, { organization_id?: string | null; name?: string | null; department?: string | null }>()
  for (let off = 0; off < targetIds.length; off += USERS_IN_CHUNK) {
    const chunk = targetIds.slice(off, off + USERS_IN_CHUNK)
    const { data: urows, error: uErr } = await supabase
      .from('users')
      .select('id, organization_id, name, department')
      .in('id', chunk)
    if (uErr) return NextResponse.json({ success: false, error: uErr.message || 'Kullanıcılar alınamadı' }, { status: 400 })
    ;(urows || []).forEach((u: any) => {
      const id = String(u?.id || '').trim()
      if (id) userByTargetId.set(id, u)
    })
  }

  const filteredAssignments = assignments.filter((a: any) => {
    const tid = String(a?.target_id ?? a?.target?.id ?? '').trim()
    if (!tid) return false
    const u = userByTargetId.get(tid)
    const tOrg = a?.target?.organization_id ?? u?.organization_id
    if (String(tOrg || '') !== String(orgToUse)) return false
    if (personId && tid !== personId) return false
    if (deptKey) {
      const d = normDeptKey(a?.target?.department || u?.department || '')
      if (d !== deptKey) return false
    }
    return true
  })

  if (!filteredAssignments.length) {
    return NextResponse.json({ success: true, results: [] })
  }

  // Category name translations:
  // Stored responses keep `category_name` as plain text (historically TR).
  // For report UI, best-effort map TR name -> EN/FR from categories tables.
  const categoryNameMap = new Map<string, string>()
  const categoryNameNormMap = new Map<string, string>()
  const categoryByQuestionId = new Map<string, { key: string; label: string }>()
  const categoryById = new Map<string, { key: string; label: string }>()
  const normKey = (s: string) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9ğüşıöç\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const pickCatName = (row: any) => {
    if (!row) return ''
    if (lang === 'fr') return String(row.name_fr || row.name || '')
    if (lang === 'en') return String(row.name_en || row.name || '')
    return String(row.name || '')
  }
  const addRowsToMap = (rows: any[] | null | undefined) => {
    ;(rows || []).forEach((r: any) => {
      const key = String(r?.name || '').trim()
      if (!key) return
      const val = (pickCatName(r) || key).trim()
      if (!val) return
      categoryNameMap.set(key, val)
      const nk = normKey(key)
      if (nk && !categoryNameNormMap.has(nk)) categoryNameNormMap.set(nk, val)
    })
  }
  try {
    const [catsRes, qCatsRes] = await Promise.all([
      supabase.from('categories').select('name,name_en,name_fr'),
      supabase.from('question_categories').select('name,name_en,name_fr'),
    ])
    if (!catsRes.error) addRowsToMap(catsRes.data as any[])
    if (!qCatsRes.error) addRowsToMap(qCatsRes.data as any[])
  } catch {
    // ignore (tables may not exist in some deployments)
  }

  // If period content snapshot exists, prefer snapshot category labels for display.
  // This makes historical reports immune to later category translation edits.
  const snapshotCategoryLabelByName = new Map<string, string>()
  const snapshotCategoryLabelNorm = new Map<string, string>()
  try {
    const snapCats = await supabase
      .from('evaluation_period_categories_snapshot')
      .select('name,name_en,name_fr')
      .eq('period_id', periodId)
    if (!snapCats.error) {
      ;((snapCats.data || []) as any[]).forEach((r) => {
        const key = String(r?.name || '').trim()
        if (!key) return
        const label = (pickCatName(r) || key).trim()
        if (!label) return
        snapshotCategoryLabelByName.set(key, label)
        const nk = normKey(key)
        if (nk) snapshotCategoryLabelNorm.set(nk, label)
      })
    }
  } catch {
    // ignore (snapshot tables may not exist)
  }

  const assignmentIds = filteredAssignments.map((a: any) => a.id)
  const responses: any[] = []
  for (let off = 0; off < assignmentIds.length; off += RESPONSES_IN_CHUNK) {
    const chunk = assignmentIds.slice(off, off + RESPONSES_IN_CHUNK)
    const { data: part, error: rErr } = await supabase.from('evaluation_responses').select('*').in('assignment_id', chunk)
    if (rErr) return NextResponse.json({ success: false, error: rErr.message || 'Yanıtlar alınamadı' }, { status: 400 })
    responses.push(...(part || []))
  }

  // PERF: index responses & assignments to avoid O(n^2) filters/finds.
  const responsesByAssignment = new Map<string, any[]>()
  ;(responses || []).forEach((r: any) => {
    const raw = String(r?.assignment_id ?? '').trim()
    if (!raw || raw === 'null' || raw === 'undefined') return
    const ck = canonicalAssignmentId(r?.assignment_id)
    const cur = responsesByAssignment.get(ck) || responsesByAssignment.get(raw) || []
    cur.push(r)
    if (ck) responsesByAssignment.set(ck, cur)
    if (raw !== ck) responsesByAssignment.set(raw, cur)
  })
  const assignmentById = new Map<string, any>()
  ;(filteredAssignments || []).forEach((a: any) => {
    const ck = canonicalAssignmentId(a?.id)
    const raw = String(a?.id ?? '').trim()
    if (ck) assignmentById.set(ck, a)
    if (raw && raw !== ck) assignmentById.set(raw, a)
  })

  // Also build category translations from the actual questions referenced in the report.
  // This is more reliable than loading all categories because names may have been edited later.
  try {
    const qIds = Array.from(new Set((responses || []).map((r: any) => String(r?.question_id || '')).filter(Boolean)))
    if (qIds.length) {
      const fetchQ = async (mode: 'question_categories' | 'categories') => {
        const select =
          mode === 'question_categories'
            ? 'id, question_categories:category_id(name,name_en,name_fr)'
            : 'id, categories:category_id(name,name_en,name_fr)'
        return await supabase.from('questions').select(select).in('id', qIds)
      }
      let qRes: any = await fetchQ('question_categories')
      if (qRes?.error) qRes = await fetchQ('categories')
      if (qRes && !qRes.error) {
        ;((qRes.data || []) as any[]).forEach((q) => {
          const cat = (q as any)?.question_categories || (q as any)?.categories
          const key = String(cat?.name || '').trim()
          if (!key) return
          const val = (pickCatName(cat) || key).trim()
          if (!val) return
          categoryNameMap.set(key, val)
          categoryByQuestionId.set(String((q as any)?.id || ''), { key, label: val })
        })
      }
    }
  } catch {
    // ignore
  }

  // If responses contain older/stale category names, map them to the canonical label as well.
  ;(responses || []).forEach((r: any) => {
    const raw = String(r?.category_name || '').trim()
    const qid = String(r?.question_id || '').trim()
    if (!raw || !qid) return
    const info = categoryByQuestionId.get(qid)
    if (!info?.label) return
    categoryNameMap.set(raw, info.label)
  })

  // Fail-safe: if some rows have missing question_id but have category_id, resolve by id.
  try {
    const ids = Array.from(
      new Set(
        (responses || [])
          .map((r: any) => String(r?.category_id || '').trim())
          .filter(Boolean)
      )
    )
    if (ids.length) {
      const [catsRes, qCatsRes] = await Promise.all([
        supabase.from('categories').select('id,name,name_en,name_fr').in('id', ids),
        supabase.from('question_categories').select('id,name,name_en,name_fr').in('id', ids),
      ])
      ;((catsRes.data || []) as any[]).forEach((r) => {
        const key = String(r?.name || '').trim()
        const label = (pickCatName(r) || key).trim()
        if (!key || !label) return
        categoryById.set(String(r.id), { key, label })
        categoryNameMap.set(key, label)
        const nk = normKey(key)
        if (nk && !categoryNameNormMap.has(nk)) categoryNameNormMap.set(nk, label)
      })
      ;((qCatsRes.data || []) as any[]).forEach((r) => {
        const key = String(r?.name || '').trim()
        const label = (pickCatName(r) || key).trim()
        if (!key || !label) return
        categoryById.set(String(r.id), { key, label })
        categoryNameMap.set(key, label)
        const nk = normKey(key)
        if (nk && !categoryNameNormMap.has(nk)) categoryNameNormMap.set(nk, label)
      })
      ;(responses || []).forEach((r: any) => {
        const raw = String(r?.category_name || '').trim()
        const cid = String(r?.category_id || '').trim()
        if (!raw || !cid) return
        const info = categoryById.get(cid)
        if (!info?.label) return
        categoryNameMap.set(raw, info.label)
      })
    }
  } catch {
    // ignore
  }

  type StdScoreRow = { assignment_id: string; score: number; standard?: { title?: string | null; code?: string | null } | null }
  const stdScores: StdScoreRow[] = []
  for (let off = 0; off < assignmentIds.length; off += RESPONSES_IN_CHUNK) {
    const chunk = assignmentIds.slice(off, off + RESPONSES_IN_CHUNK)
    const { data: stdPart, error: stdErr } = await supabase
      .from('international_standard_scores')
      .select('assignment_id, score, standard:standard_id(title,code)')
      .in('assignment_id', chunk)
    if (stdErr) return NextResponse.json({ success: false, error: stdErr.message || 'Standart skorları alınamadı' }, { status: 400 })
    stdScores.push(...((stdPart || []) as StdScoreRow[]))
  }

  const stdScoresByAssignment = new Map<string, StdScoreRow[]>()
  ;(stdScores as StdScoreRow[]).forEach((r) => {
    const raw = String(r.assignment_id ?? '').trim()
    if (!raw || raw === 'null' || raw === 'undefined') return
    const ck = canonicalAssignmentId(r.assignment_id)
    const cur = stdScoresByAssignment.get(ck) || stdScoresByAssignment.get(raw) || []
    cur.push(r)
    if (ck) stdScoresByAssignment.set(ck, cur)
    if (raw !== ck) stdScoresByAssignment.set(raw, cur)
  })

  // Weights/settings
  const evaluatorWeightByLevel: Record<string, number> = {}
  const categoryWeightByName: Record<string, number> = {}

  const pickLatestBy = (rows: any[] | null | undefined, key: string) => {
    const out = new Map<string, any>()
    ;(rows || []).forEach((r) => {
      const k = String(r?.[key] ?? '')
      if (!k) return
      if (!out.has(k)) out.set(k, r)
    })
    return out
  }

  // Prefer period snapshot coefficients if available, fall back to org/default
  const [pEvalW, pCatW, pScoring, orgEval, defEval, orgCatW, defCatW] = await Promise.all([
    supabase.from('evaluation_period_evaluator_weights').select('position_level,weight').eq('period_id', periodId),
    supabase.from('evaluation_period_category_weights').select('category_name,weight').eq('period_id', periodId),
    supabase
      .from('evaluation_period_scoring_settings')
      .select('min_high_confidence_evaluator_count,lenient_diff_threshold,harsh_diff_threshold,lenient_multiplier,harsh_multiplier,standard_weight')
      .eq('period_id', periodId)
      .maybeSingle(),
    supabase.from('evaluator_weights').select('position_level,weight').eq('organization_id', orgToUse).order('created_at', { ascending: false }),
    supabase.from('evaluator_weights').select('position_level,weight').is('organization_id', null).order('created_at', { ascending: false }),
    supabase.from('category_weights').select('category_name,weight').eq('organization_id', orgToUse),
    supabase.from('category_weights').select('category_name,weight').is('organization_id', null),
  ])

  let confidenceMinHigh = 5
  let deviation = {
    lenient_diff_threshold: 0.75,
    harsh_diff_threshold: 0.75,
    lenient_multiplier: 0.85,
    harsh_multiplier: 1.15,
  }
  let standardWeight = 0.15

  // Scoring settings: snapshot first
  if (!pScoring.error && pScoring.data) {
    confidenceMinHigh = Number((pScoring.data as any).min_high_confidence_evaluator_count ?? 5) || 5
    deviation = {
      lenient_diff_threshold: Number((pScoring.data as any).lenient_diff_threshold ?? 0.75),
      harsh_diff_threshold: Number((pScoring.data as any).harsh_diff_threshold ?? 0.75),
      lenient_multiplier: Number((pScoring.data as any).lenient_multiplier ?? 0.85),
      harsh_multiplier: Number((pScoring.data as any).harsh_multiplier ?? 1.15),
    }
    standardWeight = Number((pScoring.data as any).standard_weight ?? 0.15) || 0.15
  } else {
    const [conf, dev] = await Promise.all([
      supabase.from('confidence_settings').select('min_high_confidence_evaluator_count').eq('organization_id', orgToUse).maybeSingle(),
      supabase.from('deviation_settings')
        .select('lenient_diff_threshold,harsh_diff_threshold,lenient_multiplier,harsh_multiplier')
        .eq('organization_id', orgToUse)
        .maybeSingle(),
    ])
    if (!conf.error && conf.data) confidenceMinHigh = Number((conf.data as any).min_high_confidence_evaluator_count ?? 5) || 5
    if (!dev.error && dev.data) {
      deviation = {
        lenient_diff_threshold: Number((dev.data as any).lenient_diff_threshold ?? 0.75),
        harsh_diff_threshold: Number((dev.data as any).harsh_diff_threshold ?? 0.75),
        lenient_multiplier: Number((dev.data as any).lenient_multiplier ?? 0.85),
        harsh_multiplier: Number((dev.data as any).harsh_multiplier ?? 1.15),
      }
    }
  }

  if (!pEvalW.error && (pEvalW.data || []).length) {
    ;((pEvalW.data || []) as any[]).forEach((r) => {
      const lvl = String(r.position_level || '')
      if (!lvl) return
      evaluatorWeightByLevel[lvl] = Number(r.weight ?? 1)
    })
  } else {
    const orgEvalMap = pickLatestBy(orgEval.data as any[], 'position_level')
    const defEvalMap = pickLatestBy(defEval.data as any[], 'position_level')
    new Set<string>([...defEvalMap.keys(), ...orgEvalMap.keys()]).forEach((lvl) => {
      const row = orgEvalMap.get(lvl) || defEvalMap.get(lvl)
      evaluatorWeightByLevel[lvl] = Number(row?.weight ?? 1)
    })
  }
  if (!evaluatorWeightByLevel.self) evaluatorWeightByLevel.self = 1

  if (!pCatW.error && (pCatW.data || []).length) {
    ;((pCatW.data || []) as any[]).forEach((r) => {
      const name = String(r.category_name || '')
      if (!name) return
      categoryWeightByName[name] = Number(r.weight ?? 1)
    })
  } else {
    const orgCatMap = new Map<string, any>(((orgCatW.data || []) as any[]).map((r) => [String(r.category_name), r]))
    const defCatMap = new Map<string, any>(((defCatW.data || []) as any[]).map((r) => [String(r.category_name), r]))
    new Set<string>([...defCatMap.keys(), ...orgCatMap.keys()]).forEach((name) => {
      const row = orgCatMap.get(name) || defCatMap.get(name)
      categoryWeightByName[name] = Number(row?.weight ?? 1)
    })
  }

  const weightForEval = (e: { isSelf: boolean; evaluatorLevel?: string }) => {
    const k = e.isSelf ? 'self' : (e.evaluatorLevel || 'peer')
    return Number(evaluatorWeightByLevel[k] ?? 1)
  }

  const weightedAvg = (rows: Array<{ w: number; v: number }>) => {
    const sumW = rows.reduce((s, r) => s + (r.w || 0), 0)
    if (!sumW) return 0
    return rows.reduce((s, r) => s + (r.v || 0) * (r.w || 0), 0) / sumW
  }

  // Per target aggregation
  const byTarget: Record<string, any> = {}

  filteredAssignments.forEach((a: any) => {
    const tid = String(a.target_id ?? a?.target?.id ?? '').trim()
    if (!tid) return
    const uRow = userByTargetId.get(tid)
    if (!byTarget[tid]) {
      byTarget[tid] = {
        targetId: tid,
        targetName: a?.target?.name || uRow?.name || '-',
        targetDept: a?.target?.department || uRow?.department || '-',
        evaluations: [],
        overallAvg: 0,
        selfScore: 0,
        peerAvg: 0,
        standardAvg: 0,
        standardCount: 0,
        standardByTitle: [],
        categoryCompare: [],
        swot: {
          self: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
          peer: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
        },
        confidenceMinHigh,
        deviation,
        standardWeight,
      }
    }

    const eid = String(a.evaluator_id ?? a?.evaluator?.id ?? '').trim()
    const isSelf = userIdsEqualForSelfEval(eid, tid)
    const evaluatorLevel = isSelf ? 'self' : (a?.evaluator?.position_level || 'peer')
    const aidCanon = canonicalAssignmentId(a.id)
    const aidRaw = String(a.id ?? '').trim()
    const assignmentResponses =
      responsesByAssignment.get(aidCanon) || responsesByAssignment.get(aidRaw) || []
    const hasScorableResponses = assignmentResponses.length > 0
    const sumResp = assignmentResponses.reduce((sum: number, r: any) => sum + Number(r.reel_score ?? r.std_score ?? 0), 0)
    const denomResp = assignmentResponses.length
    const rawAvg = denomResp ? sumResp / denomResp : 0
    const avgScore = Number.isFinite(rawAvg) ? Math.round(rawAvg * 10) / 10 : 0

    const catAgg: Record<string, { sum: number; count: number }> = {}
    assignmentResponses.forEach((r: any) => {
      const raw = String(r.category_name || '').trim()
      const qid = String(r?.question_id || '').trim()
      const cid = String(r?.category_id || '').trim()
      const info = qid ? categoryByQuestionId.get(qid) : null
      const byId = !info?.key && cid ? categoryById.get(cid) : null
      const name = (info?.key || byId?.key || raw || 'Genel').toString()
      const score = Number(r.reel_score ?? r.std_score ?? 0)
      if (!catAgg[name]) catAgg[name] = { sum: 0, count: 0 }
      catAgg[name].sum += score
      catAgg[name].count += 1
    })
    const categories = Object.entries(catAgg).map(([name, v]) => ({
      name,
      score: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
    }))

    const stdForAssignment =
      stdScoresByAssignment.get(aidCanon) || stdScoresByAssignment.get(aidRaw) || []
    const standardsAvg =
      stdForAssignment.length > 0
        ? Math.round((stdForAssignment.reduce((s, r) => s + Number(r.score || 0), 0) / stdForAssignment.length) * 10) / 10
        : 0

    byTarget[tid].evaluations.push({
      evaluatorId: a?.evaluator?.id || a.evaluator_id,
      evaluatorName: a?.evaluator?.name || '-',
      isSelf,
      evaluatorLevel,
      avgScore,
      hasScorableResponses,
      categories,
      standardsAvg,
    })
  })

  // Öz ataması bazen evaluator/target UUID biçimi yüzünden peer sayılmış olabilir; hedef kişi ile eşleşeni öz yap.
  Object.values(byTarget).forEach((row: any) => {
    const tuid = String(row.targetId || '').trim()
    ;(row.evaluations || []).forEach((e: any) => {
      if (!e.isSelf && userIdsEqualForSelfEval(e.evaluatorId, tuid)) {
        e.isSelf = true
        e.evaluatorLevel = 'self'
      }
    })
  })

  const results = Object.values(byTarget).map((r: any) => {
    const evals = r.evaluations || []
    const selfEval = evals.find((e: any) => e.isSelf)
    if (selfEval && Array.isArray(selfEval.categories) && selfEval.categories.length) {
      const nums = selfEval.categories
        .map((c: any) => Number(c.score ?? 0))
        .filter((x: number) => Number.isFinite(x))
      if (nums.length) {
        const mean = Math.round((nums.reduce((a: number, b: number) => a + b, 0) / nums.length) * 10) / 10
        const prev = Number(selfEval.avgScore ?? 0)
        if (nums.some((n: number) => n > 0) && (!selfEval.hasScorableResponses || prev === 0 || !Number.isFinite(prev))) {
          selfEval.avgScore = mean
          selfEval.hasScorableResponses = true
        }
      }
    }
    const peerEvals = evals.filter((e: any) => !e.isSelf)
    const peerEvalsScorable = peerEvals.filter((e: any) => e.hasScorableResponses)
    const evalsScorableCompetency = evals.filter((e: any) => e.hasScorableResponses)
    r.selfScore = selfEval?.avgScore || 0
    r.peerAvg = peerEvalsScorable.length
      ? Math.round((peerEvalsScorable.reduce((s: number, e: any) => s + (e.avgScore || 0), 0) / peerEvalsScorable.length) * 10) / 10
      : 0
    r.overallAvg = Math.round(weightedAvg(evalsScorableCompetency.map((e: any) => ({ w: weightForEval(e), v: e.avgScore || 0 }))) * 10) / 10

    // category compare
    const catMap: Record<string, { selfSum: number; selfCount: number; peerSum: number; peerCount: number }> = {}
    evals.forEach((e: any) => {
      ;(e.categories || []).forEach((c: any) => {
        const name = String(c.name || 'Genel')
        if (!catMap[name]) catMap[name] = { selfSum: 0, selfCount: 0, peerSum: 0, peerCount: 0 }
        const score = Number(c.score || 0)
        if (e.isSelf) {
          catMap[name].selfSum += score
          catMap[name].selfCount += 1
        } else {
          catMap[name].peerSum += score
          catMap[name].peerCount += 1
        }
      })
    })
    r.categoryCompare = Object.entries(catMap).map(([name, v]) => {
      const self = v.selfCount ? Math.round((v.selfSum / v.selfCount) * 10) / 10 : 0
      const peer = v.peerCount ? Math.round((v.peerSum / v.peerCount) * 10) / 10 : 0
      const diff = Math.round((self - peer) * 10) / 10
      return { name, self, peer, diff, weight: Number(categoryWeightByName[name] ?? 1) }
    })

    // standards summary
    const stdVals = evals.map((e: any) => Number(e.standardsAvg || 0)).filter((x: number) => x > 0)
    r.standardCount = stdVals.length
    r.standardAvg = stdVals.length ? Math.round((stdVals.reduce((s: number, x: number) => s + x, 0) / stdVals.length) * 10) / 10 : 0

    // standard by title
    const byTitle: Record<string, { title: string; sum: number; count: number }> = {}
    ;((stdScores || []) as StdScoreRow[]).forEach((x) => {
      const a =
        assignmentById.get(canonicalAssignmentId(x.assignment_id)) ||
        assignmentById.get(String(x.assignment_id ?? '').trim())
      if (!a) return
      const tid = String(a.target_id ?? a?.target?.id ?? '').trim()
      if (tid !== String(r.targetId)) return
      const title = x.standard?.title ? String(x.standard.title) : '-'
      const code = x.standard?.code ? String(x.standard.code) : ''
      const k = `${code}||${title}`
      if (!byTitle[k]) byTitle[k] = { title: code ? `${code} — ${title}` : title, sum: 0, count: 0 }
      const s = Number(x.score || 0)
      if (!s) return
      byTitle[k].sum += s
      byTitle[k].count += 1
    })
    r.standardByTitle = Object.values(byTitle)
      .map((x) => ({ title: x.title, avg: x.count ? Math.round((x.sum / x.count) * 10) / 10 : 0, count: x.count }))
      .sort((a, b) => b.avg - a.avg)

    // SWOT (peer vs self)
    const sortedPeer = [...r.categoryCompare].sort((a: any, b: any) => (b.peer || 0) - (a.peer || 0))
    r.swot.peer.strengths = sortedPeer.filter((c: any) => (c.peer || 0) >= 3.5).slice(0, 6).map((c: any) => ({ name: c.name, score: c.peer || 0 }))
    r.swot.peer.weaknesses = sortedPeer.filter((c: any) => (c.peer || 0) > 0 && (c.peer || 0) < 3.5).slice(-6).map((c: any) => ({ name: c.name, score: c.peer || 0 }))
    r.swot.peer.opportunities = r.swot.peer.weaknesses.slice(0, 4)
    r.swot.peer.recommendations = []
    if (r.swot.peer.weaknesses[0]) r.swot.peer.recommendations.push(`"${r.swot.peer.weaknesses[0].name}" alanında gelişim planı oluşturulmalı.`)
    if (r.swot.peer.strengths[0]) r.swot.peer.recommendations.push(`"${r.swot.peer.strengths[0].name}" alanındaki güçlü yön yaygınlaştırılmalı.`)

    const sortedSelf = [...r.categoryCompare].sort((a: any, b: any) => (b.self || 0) - (a.self || 0))
    r.swot.self.strengths = sortedSelf.filter((c: any) => (c.self || 0) >= 3.5).slice(0, 6).map((c: any) => ({ name: c.name, score: c.self || 0 }))
    r.swot.self.weaknesses = sortedSelf.filter((c: any) => (c.self || 0) > 0 && (c.self || 0) < 3.5).slice(-6).map((c: any) => ({ name: c.name, score: c.self || 0 }))
    r.swot.self.opportunities = r.swot.self.weaknesses.slice(0, 4)
    r.swot.self.recommendations = []
    if (r.swot.self.weaknesses[0]) r.swot.self.recommendations.push(`"${r.swot.self.weaknesses[0].name}" alanında gelişim planı oluşturulmalı.`)
    if (r.swot.self.strengths[0]) r.swot.self.recommendations.push(`"${r.swot.self.strengths[0].name}" alanındaki güçlü yön yaygınlaştırılmalı.`)

    r.hasSelfEvaluationAssignment = evals.some((e: any) => e.isSelf)
    r.selfHasScorableResponses = Boolean(selfEval?.hasScorableResponses)

    return r
  })

  // Apply category label translations for display (do not affect scoring).
  const translateCategory = (name: string) => {
    const key = String(name || '').trim()
    if (!key) return key
    if (key.toLowerCase() === 'genel') return lang === 'fr' ? 'Général' : lang === 'en' ? 'General' : 'Genel'
    const snap = snapshotCategoryLabelByName.get(key)
    if (snap) return snap
    const direct = categoryNameMap.get(key)
    if (direct) return direct
    const nk = normKey(key)
    const snapNorm = nk ? snapshotCategoryLabelNorm.get(nk) : null
    if (snapNorm) return snapNorm
    return (nk && categoryNameNormMap.get(nk)) || key
  }
  ;(results as any[]).forEach((r: any) => {
    if (Array.isArray(r.categoryCompare)) {
      r.categoryCompare = r.categoryCompare.map((c: any) => {
        const key = String(c?.name || '').trim()
        return { ...c, key, name: translateCategory(key) }
      })
    }
    if (Array.isArray(r.evaluations)) {
      r.evaluations = r.evaluations.map((e: any) => ({
        ...e,
        categories: Array.isArray(e?.categories)
          ? e.categories.map((c: any) => {
              const key = String(c?.name || '').trim()
              return { ...c, key, name: translateCategory(key) }
            })
          : e.categories,
      }))
    }
    if (r?.swot?.peer) {
      r.swot.peer = {
        ...r.swot.peer,
        strengths: (r.swot.peer.strengths || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
        weaknesses: (r.swot.peer.weaknesses || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
        opportunities: (r.swot.peer.opportunities || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
      }
    }
    if (r?.swot?.self) {
      r.swot.self = {
        ...r.swot.self,
        strengths: (r.swot.self.strengths || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
        weaknesses: (r.swot.self.weaknesses || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
        opportunities: (r.swot.self.opportunities || []).map((x: any) => ({ ...x, key: String(x?.name || '').trim(), name: translateCategory(String(x?.name || '').trim()) })),
      }
    }
  })

  // Toplantı / KVKK: include_peer_detail=false iken ekip tek satır ortalama; true iken tüm değerlendiriciler (kurum+süper admin).
  const peerEvaluatorsVisible = includePeerDetail
  if (!includePeerDetail) {
    ;(results as any[]).forEach((r: any) => {
      const evals = r.evaluations || []
      const selfEval = evals.find((e: any) => e.isSelf)
      const peerEvals = evals.filter((e: any) => !e.isSelf)
      const peerScorable = peerEvals.filter((e: any) => e.hasScorableResponses)
      const n = peerScorable.length
      const peerStd =
        peerEvals.length > 0
          ? Math.round((peerEvals.reduce((sum: number, e: any) => sum + Number(e.standardsAvg || 0), 0) / peerEvals.length) * 10) / 10
          : 0

      const selfCategories = (r.categoryCompare || []).map((c: any) => ({
        name: c.name,
        key: c.key,
        score: Number(c.self || 0),
      }))
      const teamCategories = (r.categoryCompare || []).map((c: any) => ({
        name: c.name,
        key: c.key,
        score: Number(c.peer || 0),
      }))

      const next: any[] = []
      if (r.hasSelfEvaluationAssignment || selfEval || Number(r.selfScore || 0) > 0) {
        next.push({
          evaluatorId: selfEval?.evaluatorId || r.targetId,
          evaluatorName: msg('🔵 Öz Değerlendirme', '🔵 Self Evaluation', '🔵 Auto‑évaluation'),
          isSelf: true,
          evaluatorLevel: 'self',
          avgScore: Number(r.selfScore || 0),
          hasScorableResponses: Boolean(selfEval?.hasScorableResponses),
          categories: selfCategories,
          standardsAvg: Number(selfEval?.standardsAvg || 0),
        })
      }
      if (peerEvals.length > 0) {
        next.push({
          evaluatorId: 'aggregate-peer',
          evaluatorName: msg(
            n > 0
              ? `🟢 Ekip değerlendirmesi (${n} kişinin ortalaması)`
              : `🟢 Ekip değerlendirmesi`,
            n > 0 ? `🟢 Team evaluation (average of ${n} people)` : `🟢 Team evaluation`,
            n > 0 ? `🟢 Évaluation d’équipe (moyenne de ${n} personnes)` : `🟢 Évaluation d’équipe`
          ),
          isSelf: false,
          evaluatorLevel: 'peer',
          avgScore: Number(r.peerAvg || 0),
          hasScorableResponses: n > 0,
          categories: teamCategories,
          standardsAvg: peerStd,
        })
      }
      r.evaluations = next
    })
  }

  return NextResponse.json(
    { success: true, results, peerEvaluatorsVisible },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}

