import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  canonicalAssignmentId,
  canonicalUserId,
  userIdsEqualForSelfEval,
} from '@/lib/server/evaluation-identity'
import {
  buildDutyScopeIndexForPeriod,
  fetchDutyScopeMetaForReporting,
  enrichResponsesWithDutyMeta,
} from '@/lib/server/evaluation-duty-questions'
import {
  aggregateAssignmentResponses,
  buildCategoryCompareForScope,
  buildTargetDutyPackageSummaries,
  finalizeTargetScopeAverages,
  splitResponsesByScope,
} from '@/lib/server/evaluation-response-scope'
import {
  buildCategoryQuestionsMap,
  buildScopeScoreSummary,
  buildTrimByQuestionMap,
  mean,
} from '@/lib/server/evaluation-score-metrics'
import {
  buildMatrixReportPeriodGroups,
  consolidateCoreGeneralEvaluations,
  flattenMatrixReportSlices,
} from '@/lib/server/matrix-report-slices'
import {
  isCoreGeneralReportMatrixContext,
  isPeriodSummaryMatrixContext,
  normalizeMatrixContext,
} from '@/lib/matrix-evaluation-context'
import { buildPeerEvaluatorCoverage } from '@/lib/server/evaluation-evaluator-coverage'
import {
  computeGenelOkulYasamCombinedScores,
  computeOkulYasamPeerSummary,
} from '@/lib/server/genel-okul-yasam-combined-score'
import {
  buildQuestionTextMap,
  canonicalUuid,
  looksLikeUuid,
  pickQuestionTextByLang,
  questionTextMapToRecord,
  questionTextUnavailable,
  resolveQuestionDisplayText,
  uuidWithoutDashes,
  type QuestionTextLang,
} from '@/lib/server/question-text-resolve'

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
/** PostgREST tek sorguda varsayılan üst sınır (~1000); aşmamak için range ile sayfala */
const POSTGREST_MAX_ROWS = 1000
const USERS_IN_CHUNK = 200

/**
 * Departman eşlemesi: boşluk, Türkçe büyük/küçük harf, Unicode NFKC,
 * dotless ı (U+0131) vs i — aynı bölüm farklı yazımla (MATEMATIK vs MATEMATİK) kaybolmasın.
 */
function normDeptKey(s: string) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
    .replace(/\u0131/g, 'i')
}

/** Embed'deki target.department yanlış/eski olabiliyor; users.department ile ayrı kontrol et. */
function deptMatchesFilter(deptKey: string, targetDept: unknown, userDept: unknown) {
  if (!deptKey) return true
  const dT = normDeptKey(String(targetDept ?? ''))
  const dU = normDeptKey(String(userDept ?? ''))
  return dT === deptKey || dU === deptKey
}

/** Bazı eski satırlarda skor farklı kolon adıyla olabilir */
function responseNumericScore(r: any): number {
  const n = Number(
    r?.reel_score ?? r?.std_score ?? r?.score ?? (r as any)?.numeric_score ?? (r as any)?.likert_value ?? 0
  )
  return Number.isFinite(n) ? n : 0
}

function pickQuestionTextRow(row: any, lang: string): string {
  const l: QuestionTextLang = lang === 'en' || lang === 'fr' ? lang : 'tr'
  return pickQuestionTextByLang(row, l)
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

  let assessmentKind = 'development_360'
  let periodMetaFull: any = null
  try {
    const { data: periodMeta } = await supabase
      .from('evaluation_periods')
      .select('id,name,name_en,name_fr,start_date,end_date,assessment_kind')
      .eq('id', periodId)
      .maybeSingle()
    periodMetaFull = periodMeta
    if (periodMeta?.assessment_kind) assessmentKind = String(periodMeta.assessment_kind)
  } catch {
    // ignore
  }

  const assignmentsByTarget = new Map<string, any[]>()
  const coverageAssignmentsByTarget = new Map<string, any[]>()

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

  const allAssignmentsForCoverage: any[] = []
  let covFrom = 0
  while (true) {
    const covTo = covFrom + ASSIGNMENTS_PAGE_SIZE - 1
    const { data: covPage, error: covErr } = await supabase
      .from('evaluation_assignments')
      .select(assignmentSelect)
      .eq('period_id', periodId)
      .order('id', { ascending: true })
      .range(covFrom, covTo)

    if (covErr) return NextResponse.json({ success: false, error: covErr.message || 'Kapsama atamaları alınamadı' }, { status: 400 })
    const covRows = covPage || []
    allAssignmentsForCoverage.push(...covRows)
    if (covRows.length < ASSIGNMENTS_PAGE_SIZE) break
    covFrom += ASSIGNMENTS_PAGE_SIZE
  }

  // target embed bazen boş döner; kurum filtresi yanlışlıkla tüm satırları eleyebilir. target_id → users ile yedek.
  const targetIdRaw = (a: any) => String(a?.target_id ?? a?.target?.id ?? '').trim()
  const targetIds = Array.from(
    new Set(
      (assignments as any[])
        .map((a) => targetIdRaw(a))
        .filter(Boolean)
    )
  )
  const userByTargetId = new Map<
    string,
    { id?: string | null; organization_id?: string | null; name?: string | null; department?: string | null }
  >()
  for (let off = 0; off < targetIds.length; off += USERS_IN_CHUNK) {
    const chunk = targetIds.slice(off, off + USERS_IN_CHUNK)
    const { data: urows, error: uErr } = await supabase
      .from('users')
      .select('id, organization_id, name, department')
      .in('id', chunk)
    if (uErr) return NextResponse.json({ success: false, error: uErr.message || 'Kullanıcılar alınamadı' }, { status: 400 })
    ;(urows || []).forEach((u: any) => {
      const id = String(u?.id || '').trim()
      if (!id) return
      userByTargetId.set(id, u)
      const ck = canonicalUserId(id)
      if (ck) userByTargetId.set(ck, u)
    })
  }

  const userRowForTarget = (tidRaw: string) => {
    if (!tidRaw) return undefined
    return userByTargetId.get(tidRaw) || userByTargetId.get(canonicalUserId(tidRaw))
  }

  const assignmentPassesOrgPerson = (a: any) => {
    const tid = targetIdRaw(a)
    if (!tid) return false
    const u = userRowForTarget(tid)
    const tOrg = a?.target?.organization_id ?? u?.organization_id
    if (String(tOrg || '') !== String(orgToUse)) return false
    if (personId && canonicalUserId(personId) !== canonicalUserId(tid)) return false
    return true
  }

  const strictDeptPass = (a: any) => {
    const tid = targetIdRaw(a)
    const u = userRowForTarget(tid)
    return !deptKey || deptMatchesFilter(deptKey, a?.target?.department, u?.department)
  }

  // Önce sıkı departman eşleşmesi: raporda olması gereken hedefler.
  const strictFiltered = assignments.filter((a: any) => assignmentPassesOrgPerson(a) && strictDeptPass(a))

  if (!strictFiltered.length) {
    return NextResponse.json({ success: true, results: [] })
  }

  // Aynı hedef için peer satırı departmanı geçip öz satırı embed yüzünden elenmesin:
  // hedef zaten rapordaysa o kişinin TÜM atamalarını (öz+ekip) dahil et.
  const targetKeysInReport = new Set(
    strictFiltered.map((a) => canonicalUserId(targetIdRaw(a))).filter(Boolean)
  )

  const filteredAssignments = assignments.filter((a: any) => {
    if (!assignmentPassesOrgPerson(a)) return false
    if (!deptKey) return true
    const tidKey = canonicalUserId(targetIdRaw(a))
    if (tidKey && targetKeysInReport.has(tidKey)) return true
    return strictDeptPass(a)
  })

  if (!filteredAssignments.length) {
    return NextResponse.json({ success: true, results: [] })
  }

  filteredAssignments.forEach((a: any) => {
    const tidKey = canonicalUserId(targetIdRaw(a))
    if (!tidKey) return
    const list = assignmentsByTarget.get(tidKey) || []
    list.push({ ...a, evaluation_periods: periodMetaFull })
    assignmentsByTarget.set(tidKey, list)
  })

  const coveragePassesFilter = (a: any) => {
    if (!assignmentPassesOrgPerson(a)) return false
    if (!deptKey) return true
    const tidKey = canonicalUserId(targetIdRaw(a))
    if (tidKey && targetKeysInReport.has(tidKey)) return true
    return strictDeptPass(a)
  }

  allAssignmentsForCoverage.filter(coveragePassesFilter).forEach((a: any) => {
    const tidKey = canonicalUserId(targetIdRaw(a))
    if (!tidKey) return
    const list = coverageAssignmentsByTarget.get(tidKey) || []
    list.push({ ...a, evaluation_periods: periodMetaFull })
    coverageAssignmentsByTarget.set(tidKey, list)
  })

  // Rapor hedefleri: canonical hedef kimliği (kolon + embed + UUID tire uyumu).
  const targetsInReport = new Set(
    filteredAssignments.map((a: any) => canonicalUserId(targetIdRaw(a))).filter(Boolean)
  )

  // Yanıtları yükle: rapordaki her hedef için dönemdeki TÜM atamalar (öz + ekip).
  // targetsInReport zaten kurum filtresinden geçti; satır bazında tekrar tOrg isteme —
  // öz satırında target embed boş + users eşleşmezse tOrg '' oluyordu ve assignment_id
  // listeye hiç girmiyordu → evaluation_responses çekilmiyordu (Öz 0.0).
  const assignmentIds = Array.from(
    new Set(
      (assignments as any[])
        .filter((a) => {
          const tidKey = canonicalUserId(targetIdRaw(a))
          return Boolean(tidKey && targetsInReport.has(tidKey))
        })
        .map((a: any) => String(a?.id ?? '').trim())
        .filter(Boolean)
    )
  )

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

  const responses: any[] = []
  for (let off = 0; off < assignmentIds.length; off += RESPONSES_IN_CHUNK) {
    const chunk = assignmentIds.slice(off, off + RESPONSES_IN_CHUNK)
    let rFrom = 0
    while (true) {
      const { data: part, error: rErr } = await supabase
        .from('evaluation_responses')
        .select('*')
        .in('assignment_id', chunk)
        .order('id', { ascending: true })
        .range(rFrom, rFrom + POSTGREST_MAX_ROWS - 1)
      if (rErr) return NextResponse.json({ success: false, error: rErr.message || 'Yanıtlar alınamadı' }, { status: 400 })
      const rows = part || []
      responses.push(...rows)
      if (rows.length < POSTGREST_MAX_ROWS) break
      rFrom += POSTGREST_MAX_ROWS
    }
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
  ;(assignments || []).forEach((a: any) => {
    const tidKey = canonicalUserId(targetIdRaw(a))
    if (!tidKey || !targetsInReport.has(tidKey)) return
    const raw = String(a?.id ?? '').trim()
    if (!raw) return
    const ck = canonicalAssignmentId(a?.id)
    if (ck) assignmentById.set(ck, a)
    if (raw !== ck) assignmentById.set(raw, a)
  })

  // Also build category translations from the actual questions referenced in the report.
  // This is more reliable than loading all categories because names may have been edited later.
  const questionTextById = new Map<string, { text: string; order: number }>()
  const questionTextLookup = {
    requested: 0,
    resolved: 0,
    usedSnapshot: false,
    snapshotErrors: [] as Array<{ code: string; message: string }>,
    questionsErrors: [] as Array<{ code: string; message: string }>,
  }
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

  // Question texts (for drill-down)
  try {
    const qIds = Array.from(
      new Set(
        (responses || [])
          .map((r: any) => canonicalUuid(r?.question_id))
          .filter(Boolean)
      )
    )
    if (qIds.length) {
      questionTextLookup.requested = qIds.length
      // Prefer period snapshots if available (tables may not exist)
      let usedSnapshot = false
      try {
        const probe = await supabase
          .from('evaluation_period_questions_snapshot')
          .select('id')
          .eq('period_id', periodId)
          .limit(1)
        if (!probe.error && (probe.data || []).length > 0) usedSnapshot = true
      } catch {
        // ignore
      }
      questionTextLookup.usedSnapshot = usedSnapshot

      // PostgREST URL limits: keep `.in()` chunks small.
      const QID_CHUNK = 50
      const fillFromQuestionsTable = async (chunk: string[]) => {
        // Some environments may store UUIDs without dashes; include both forms.
        const expanded = Array.from(new Set([...chunk, ...chunk.map(uuidWithoutDashes)].filter(Boolean)))
        // Use select('*') for schema-compat (some DBs use question_text instead of text)
        const qRes = await supabase.from('questions').select('*').in('id', expanded)
        if (qRes.error) {
          if (questionTextLookup.questionsErrors.length < 3) {
            questionTextLookup.questionsErrors.push({
              code: String((qRes.error as any)?.code || ''),
              message: String((qRes.error as any)?.message || ''),
            })
          }
          return
        }
        ;((qRes.data || []) as any[]).forEach((q) => {
          const id = canonicalUuid(q?.id)
          if (!id) return
          const text = pickQuestionTextRow(q, lang).trim()
          const order = Number(q?.sort_order ?? q?.order_num ?? 0) || 0
          const entry = { text: text || questionTextUnavailable(lang as QuestionTextLang), order }
          questionTextById.set(id, entry)
          const noDash = uuidWithoutDashes(id)
          if (noDash) questionTextById.set(noDash, entry)
        })
      }

      if (usedSnapshot) {
        // Most robust: load all questions of the period (no `.in()` URL limit issues).
        let from = 0
        const PAGE = 1000
        while (true) {
          const qSnapRes = await supabase
            .from('evaluation_period_questions_snapshot')
            .select('*')
            .eq('period_id', periodId)
            .order('sort_order')
            .order('snapshotted_at')
            .range(from, from + PAGE - 1)
          if (qSnapRes.error) {
            if (questionTextLookup.snapshotErrors.length < 3) {
              questionTextLookup.snapshotErrors.push({
                code: String((qSnapRes.error as any)?.code || ''),
                message: String((qSnapRes.error as any)?.message || ''),
              })
            }
            // Fallback to global questions table for just requested ids.
            for (let off = 0; off < qIds.length; off += QID_CHUNK) {
              await fillFromQuestionsTable(qIds.slice(off, off + QID_CHUNK))
            }
            break
          }
          const rows = (qSnapRes.data || []) as any[]
          rows.forEach((q) => {
            if (typeof q?.is_active === 'boolean' && !q.is_active) return
            const id = canonicalUuid(q?.id) || canonicalUuid(q?.question_id)
            if (!id) return
            const text = pickQuestionTextRow(q, lang).trim()
            const order = Number(q?.sort_order ?? q?.order_num ?? 0) || 0
            const entry = { text: text || questionTextUnavailable(lang as QuestionTextLang), order }
            questionTextById.set(id, entry)
            const noDash = uuidWithoutDashes(id)
            if (noDash) questionTextById.set(noDash, entry)
          })
          if (rows.length < PAGE) break
          from += PAGE
        }
      } else {
        for (let off = 0; off < qIds.length; off += QID_CHUNK) {
          const chunk = qIds.slice(off, off + QID_CHUNK)
          await fillFromQuestionsTable(chunk)
        }
      }
      const missingQids = qIds.filter((qid) => {
        const c = canonicalUuid(qid)
        return c && !questionTextById.has(c) && !questionTextById.has(uuidWithoutDashes(c))
      })
      for (let off = 0; off < missingQids.length; off += QID_CHUNK) {
        await fillFromQuestionsTable(missingQids.slice(off, off + QID_CHUNK))
      }
    }
  } catch {
    // ignore
  }
  questionTextLookup.resolved = questionTextById.size

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
    let sFrom = 0
    while (true) {
      const { data: stdPart, error: stdErr } = await supabase
        .from('international_standard_scores')
        .select('assignment_id, score, standard:standard_id(title,code)')
        .in('assignment_id', chunk)
        .order('id', { ascending: true })
        .range(sFrom, sFrom + POSTGREST_MAX_ROWS - 1)
      if (stdErr) return NextResponse.json({ success: false, error: stdErr.message || 'Standart skorları alınamadı' }, { status: 400 })
      const rows = (stdPart || []) as StdScoreRow[]
      stdScores.push(...rows)
      if (rows.length < POSTGREST_MAX_ROWS) break
      sFrom += POSTGREST_MAX_ROWS
    }
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

  let dutyScopeByTarget = new Map<string, Set<string>>()
  try {
    dutyScopeByTarget = await buildDutyScopeIndexForPeriod(supabase, periodId)
  } catch {
    dutyScopeByTarget = new Map()
  }

  const dutyNameById = new Map<string, string>()
  const dutiesInPeriod: Array<{ id: string; name: string }> = []
  try {
    const { data: dutyDefs } = await supabase
      .from('evaluation_duties')
      .select('id, name, name_fr, sort_order')
      .eq('period_id', periodId)
      .eq('is_active', true)
      .order('sort_order')
    ;((dutyDefs || []) as any[]).forEach((d) => {
      const id = String(d.id || '')
      const name = String(d.name || d.name_fr || 'Görev')
      if (!id) return
      dutyNameById.set(id, name)
      dutiesInPeriod.push({ id, name })
    })
  } catch {
    // görev tabloları yoksa atla
  }

  const userDutiesByUser = new Map<string, Set<string>>()
  try {
    const { data: udRows } = await supabase
      .from('evaluation_period_user_duties')
      .select('user_id, duty_id')
      .eq('period_id', periodId)
      .eq('is_active', true)
    ;((udRows || []) as any[]).forEach((r) => {
      const uid = canonicalUserId(String(r.user_id || ''))
      const did = String(r.duty_id || '')
      if (!uid || !did) return
      const cur = userDutiesByUser.get(uid) || new Set<string>()
      cur.add(did)
      userDutiesByUser.set(uid, cur)
    })
  } catch {
    // ignore
  }

  const targetIdByKey = new Map<string, string>()
  filteredAssignments.forEach((a: any) => {
    const tidRaw = targetIdRaw(a)
    const tidKey = canonicalUserId(tidRaw)
    if (tidKey) targetIdByKey.set(tidKey, String(tidRaw || tidKey))
  })

  const dutyMetaByTarget = new Map<string, Awaited<ReturnType<typeof fetchDutyScopeMetaForReporting>>>()
  await Promise.all(
    [...targetIdByKey.entries()].map(async ([tidKey, tidRaw]) => {
      const meta = await fetchDutyScopeMetaForReporting(supabase, periodId, tidRaw)
      dutyMetaByTarget.set(tidKey, meta)
    })
  )

  const evaluationFromResponses = (assignmentResponses: any[], tidKey: string, tidRaw: string) => {
    const dutyOnly =
      dutyScopeByTarget.get(tidKey) ||
      dutyScopeByTarget.get(canonicalUserId(tidRaw)) ||
      dutyScopeByTarget.get(String(tidRaw || '').trim()) ||
      new Set<string>()
    const meta = dutyMetaByTarget.get(tidKey) || dutyMetaByTarget.get(canonicalUserId(tidRaw))
    const enriched = meta ? enrichResponsesWithDutyMeta(assignmentResponses, meta) : assignmentResponses
    const bundled = aggregateAssignmentResponses(enriched, {
      dutyOnlyQuestionIds: dutyOnly,
      categoryByQuestionId,
      categoryById,
      dutyNameById,
    })
    const period = bundled.period
    const duty = bundled.duty
    const { period: periodRows, duty: dutyRows } = splitResponsesByScope(enriched, dutyOnly)
    return {
      avgScore: period.avgScore,
      hasScorableResponses: period.hasScorableResponses,
      categories: period.categories,
      questionScores: period.questionScores,
      answeredQuestionIds: period.answeredQuestionIds,
      answeredQuestionIdsDuty: duty.answeredQuestionIds,
      periodRawResponses: periodRows,
      dutyRawResponses: dutyRows,
      responseCount: period.responseCount + duty.responseCount,
      distinctQuestionCount: period.distinctQuestionCount + duty.distinctQuestionCount,
      distinctCategoryCount: period.distinctCategoryCount,
      zeroScoreCount: period.zeroScoreCount + duty.zeroScoreCount,
      missingCategoryCount: period.missingCategoryCount + duty.missingCategoryCount,
      avgScoreDuty: duty.responseCount ? duty.avgScore : null,
      hasDutyScorableResponses: duty.hasScorableResponses,
      categoriesDuty: duty.categories,
      questionScoresDuty: duty.questionScores,
      dutyResponseCount: duty.responseCount,
      dutyPackages: bundled.dutyPackages,
    }
  }

  // Per target aggregation
  const byTarget: Record<string, any> = {}

  filteredAssignments.forEach((a: any) => {
    const tidRaw = targetIdRaw(a)
    const tidKey = canonicalUserId(tidRaw)
    if (!tidKey) return
    const uRow = userRowForTarget(tidRaw)
    const displayId = String(uRow?.id || tidRaw || '').trim()
    if (!byTarget[tidKey]) {
      byTarget[tidKey] = {
        targetId: displayId,
        targetName: a?.target?.name || uRow?.name || '-',
        targetDept: a?.target?.department || uRow?.department || '-',
        evaluations: [],
        overallAvg: 0,
        overallAvgDuty: null as number | null,
        selfScore: 0,
        selfScoreDuty: null as number | null,
        peerAvg: 0,
        peerAvgDuty: null as number | null,
        hasDutyScope: false,
        standardAvg: 0,
        standardCount: 0,
        standardByTitle: [],
        categoryCompare: [],
        categoryCompareDuty: [] as any[],
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
    const isSelf = userIdsEqualForSelfEval(eid, tidRaw)
    const evaluatorLevel = isSelf ? 'self' : (a?.evaluator?.position_level || 'peer')
    const aidCanon = canonicalAssignmentId(a.id)
    const aidRaw = String(a.id ?? '').trim()
    const assignmentResponses =
      responsesByAssignment.get(aidCanon) || responsesByAssignment.get(aidRaw) || []
    const scored = evaluationFromResponses(assignmentResponses, tidKey, tidRaw)

    const stdForAssignment =
      stdScoresByAssignment.get(aidCanon) || stdScoresByAssignment.get(aidRaw) || []
    const standardsAvg =
      stdForAssignment.length > 0
        ? Math.round((stdForAssignment.reduce((s, r) => s + Number(r.score || 0), 0) / stdForAssignment.length) * 100) / 100
        : 0

    byTarget[tidKey].evaluations.push({
      evaluatorId: a?.evaluator?.id || a.evaluator_id,
      evaluatorName: a?.evaluator?.name || '-',
      isSelf,
      evaluatorLevel,
      evaluatorWeight: weightForEval({ isSelf, evaluatorLevel }),
      standardsAvg,
      assignmentId: String(a?.id || '').trim() || aidCanon || aidRaw,
      matrixContext: normalizeMatrixContext(a?.matrix_context),
      ...scored,
    })
  })

  // İlk döngüde öz satırı yoksa (liste tutarsızlığı), aynı hedef için öz atamasını ekle — yanıtlar yukarıda yüklendi.
  Object.keys(byTarget).forEach((tidKey) => {
    const row = byTarget[tidKey]
    if ((row.evaluations || []).some((e: any) => e.isSelf)) return
    const selfA = (assignments as any[]).find((a) => {
      const t = canonicalUserId(targetIdRaw(a))
      if (t !== tidKey) return false
      if (!isPeriodSummaryMatrixContext(a?.matrix_context)) return false
      const eid = String(a?.evaluator_id ?? a?.evaluator?.id ?? '').trim()
      return userIdsEqualForSelfEval(eid, targetIdRaw(a))
    })
    if (!selfA) return
    // Kişi zaten raporda; öz satırında tOrg boş kalabiliyor — tekrar kurum ile reddetme.
    if (personId && canonicalUserId(personId) !== tidKey) return
    // Bu kişi zaten byTarget'ta (en az bir peer ataması departman filtresini geçti).
    // Öz satırı tek başına embed/kullanıcı departmanı yüzünden elenmiş olabilir; tekrar dept ile reddetme.
    const eid = String(selfA.evaluator_id ?? selfA?.evaluator?.id ?? '').trim()
    const isSelf = userIdsEqualForSelfEval(eid, targetIdRaw(selfA))
    const evaluatorLevel = isSelf ? 'self' : (selfA?.evaluator?.position_level || 'peer')
    const aidCanon = canonicalAssignmentId(selfA.id)
    const aidRaw = String(selfA.id ?? '').trim()
    const assignmentResponses =
      responsesByAssignment.get(aidCanon) || responsesByAssignment.get(aidRaw) || []
    const scored = evaluationFromResponses(assignmentResponses, tidKey, String(targetIdRaw(selfA)))
    const stdForAssignment =
      stdScoresByAssignment.get(aidCanon) || stdScoresByAssignment.get(aidRaw) || []
    const standardsAvg =
      stdForAssignment.length > 0
        ? Math.round((stdForAssignment.reduce((s, r) => s + Number(r.score || 0), 0) / stdForAssignment.length) * 100) / 100
        : 0
    row.evaluations.push({
      evaluatorId: selfA?.evaluator?.id || selfA.evaluator_id,
      evaluatorName: selfA?.evaluator?.name || '-',
      isSelf,
      evaluatorLevel,
      evaluatorWeight: weightForEval({ isSelf, evaluatorLevel }),
      standardsAvg,
      assignmentId: String(selfA?.id || '').trim() || aidCanon || aidRaw,
      matrixContext: normalizeMatrixContext(selfA?.matrix_context),
      ...scored,
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
    const evalsAll = r.evaluations || []
    const evals = evalsAll.filter((e: any) => isPeriodSummaryMatrixContext(e?.matrixContext))
    const evalsCoreRaw = evalsAll.filter((e: any) => isCoreGeneralReportMatrixContext(e?.matrixContext))
    const evalsCore = evalsCoreRaw.length
      ? consolidateCoreGeneralEvaluations(
          evalsCoreRaw.map((e: any) => ({
            ...e,
            sourceMatrixContext: e.matrixContext || 'genel',
          })),
          categoryByQuestionId,
          categoryById
        )
      : []
    r.hasCorePeriodEvaluation = evals.some((e: any) => e.hasScorableResponses)
    r.hasCoreGeneralEvaluation = evalsCore.some((e: any) => e.hasScorableResponses)
    r.categoryCompareScope = 'core_general'
    const selfEval = evals.find((e: any) => e.isSelf)
    if (selfEval && Array.isArray(selfEval.categories) && selfEval.categories.length) {
      const nums = selfEval.categories
        .map((c: any) => Number(c.score ?? 0))
        .filter((x: number) => Number.isFinite(x))
      if (nums.length) {
        const mean = Math.round((nums.reduce((a: number, b: number) => a + b, 0) / nums.length) * 100) / 100
        const prev = Number(selfEval.avgScore ?? 0)
        if (nums.some((n: number) => n > 0) && (!selfEval.hasScorableResponses || prev === 0 || !Number.isFinite(prev))) {
          selfEval.avgScore = mean
          selfEval.hasScorableResponses = true
        }
      }
    }
    const peerEvals = evals.filter((e: any) => !e.isSelf)
    const peerEvalsScorable = peerEvals.filter((e: any) => e.hasScorableResponses)
    const scopeAvgs = finalizeTargetScopeAverages(evals, weightForEval)
    r.selfScore = scopeAvgs.selfScorePeriod
    r.selfScoreDuty = scopeAvgs.selfScoreDuty
    r.peerAvg = scopeAvgs.peerAvgPeriod
    r.peerAvgDuty = scopeAvgs.peerAvgDuty
    r.overallAvg = scopeAvgs.overallAvgPeriod
    r.overallAvgDuty = scopeAvgs.overallAvgDuty
    r.hasDutyScope = scopeAvgs.hasDutyScope

    r.categoryCompare = buildCategoryCompareForScope(evalsCore, 'period', categoryWeightByName)
    r.categoryCompareDuty = scopeAvgs.hasDutyScope
      ? buildCategoryCompareForScope(evals, 'duty', categoryWeightByName)
      : []

    const periodMetrics = buildScopeScoreSummary({
      evaluations: evals,
      scope: 'period',
      categoryCompare: buildCategoryCompareForScope(evals, 'period', categoryWeightByName),
      categoryWeightByName,
      assessmentKind,
      overallAvg: r.overallAvg,
    })
    const coreCategoryMetrics = buildScopeScoreSummary({
      evaluations: evalsCore.filter((e: any) => !e.isSelf),
      scope: 'period',
      categoryCompare: r.categoryCompare,
      categoryWeightByName,
      assessmentKind,
      overallAvg: r.overallAvg,
    })
    if (coreCategoryMetrics) {
      r.categoryCompare = coreCategoryMetrics.categoryCompare
    }
    if (periodMetrics) {
      r.peerAvgTrimmed = periodMetrics.peerAvgTrimmed
      r.overallAvgTrimmed = periodMetrics.overallAvgTrimmed
      r.score100 = periodMetrics.score100
      r.score100Trimmed = periodMetrics.score100Trimmed
      r.questionCountPeriod = periodMetrics.questionCount
      r.maxScalePeriod = periodMetrics.maxScale
      r.peerTrimEligible = periodMetrics.peerTrimEligible
      r.peerEvaluatorCountForTrim = periodMetrics.peerEvaluatorCount
    } else {
      r.peerAvgTrimmed = 0
      r.overallAvgTrimmed = 0
      r.score100 = null
      r.score100Trimmed = null
      r.peerTrimEligible = false
      r.peerEvaluatorCountForTrim = peerEvals.length
    }

    const okulYasamSummary = computeOkulYasamPeerSummary(evalsAll, categoryWeightByName, assessmentKind)
    const combined = computeGenelOkulYasamCombinedScores({
      genelOverallAvg: r.overallAvg,
      genelOverallAvgRaw: scopeAvgs.overallAvgPeriodRaw,
      genelOverallAvgTrimmed: r.overallAvgTrimmed ?? 0,
      genelOverallAvgTrimmedRaw: periodMetrics?.overallAvgTrimmed ?? r.overallAvgTrimmed ?? 0,
      genelPeerTrimEligible: r.peerTrimEligible === true,
      okulYasam: okulYasamSummary,
    })
    Object.assign(r, combined)

    if (r.hasDutyScope && r.categoryCompareDuty.length) {
      const dutyMetrics = buildScopeScoreSummary({
        evaluations: evals,
        scope: 'duty',
        categoryCompare: r.categoryCompareDuty,
        categoryWeightByName,
        assessmentKind,
        overallAvg: r.overallAvgDuty,
      })
      if (dutyMetrics) {
        r.categoryCompareDuty = dutyMetrics.categoryCompare
        r.peerAvgTrimmedDuty = dutyMetrics.peerAvgTrimmed
        r.overallAvgTrimmedDuty = dutyMetrics.overallAvgTrimmed
        r.score100Duty = dutyMetrics.score100
        r.score100TrimmedDuty = dutyMetrics.score100Trimmed
        r.questionCountDuty = dutyMetrics.questionCount
        r.maxScaleDuty = dutyMetrics.maxScale
        r.peerTrimEligibleDuty = dutyMetrics.peerTrimEligible
      }
    }

    const normQuestionId = (raw: string) => canonicalUuid(raw) || String(raw || '').trim()
    const trimByQuestion = buildTrimByQuestionMap(peerEvals, 'period', normQuestionId)
    const trimByQuestionDuty = r.hasDutyScope
      ? buildTrimByQuestionMap(peerEvals, 'duty', normQuestionId)
      : new Map()

    // standards summary
    const stdVals = evals.map((e: any) => Number(e.standardsAvg || 0)).filter((x: number) => x > 0)
    r.standardCount = stdVals.length
    r.standardAvg = stdVals.length ? Math.round((stdVals.reduce((s: number, x: number) => s + x, 0) / stdVals.length) * 100) / 100 : 0

    // standard by title
    const byTitle: Record<string, { title: string; sum: number; count: number }> = {}
    ;((stdScores || []) as StdScoreRow[]).forEach((x) => {
      const a =
        assignmentById.get(canonicalAssignmentId(x.assignment_id)) ||
        assignmentById.get(String(x.assignment_id ?? '').trim())
      if (!a) return
      if (canonicalUserId(targetIdRaw(a)) !== canonicalUserId(r.targetId)) return
      if (!isPeriodSummaryMatrixContext(a?.matrix_context)) return
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
      .map((x) => ({ title: x.title, avg: x.count ? Math.round((x.sum / x.count) * 100) / 100 : 0, count: x.count }))
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

    const mapEvalRow = (e: any, withQuestionDetail: boolean) => {
      const row = {
        ...e,
        evaluatorWeight: Number(e.evaluatorWeight ?? weightForEval(e)),
      }
      if (withQuestionDetail) return row
      return {
        ...row,
        questionScores: undefined,
        questionScoresDuty: undefined,
        periodRawResponses: undefined,
        dutyRawResponses: undefined,
        categories: Array.isArray(e.categories)
          ? e.categories.map((c: any) => ({ name: c.name, score: c.score }))
          : [],
      }
    }

    /** Genel + Okul Yaşam — detay kapalıyken de birleşik bölümde listelenir (soru detayı hariç). */
    r.evaluationsCoreGeneral = evalsAll
      .filter((e: any) => isCoreGeneralReportMatrixContext(e?.matrixContext))
      .map((e: any) => mapEvalRow(e, includePeerDetail))

    r.evaluationsAll = includePeerDetail ? evalsAll.map((e: any) => mapEvalRow(e, true)) : []
    r.evaluations = evals

    const resolveQuestionMeta = (rawId: string) =>
      resolveQuestionDisplayText(questionTextById, rawId, lang as QuestionTextLang)

    const trimByQuestionCore = buildTrimByQuestionMap(
      evalsCore.filter((e: any) => !e.isSelf),
      'period',
      normQuestionId
    )
    r.categoryQuestions = buildCategoryQuestionsMap(
      evalsCore,
      'period',
      trimByQuestionCore,
      resolveQuestionMeta,
      normQuestionId
    )
    r.dutyPackageScores = buildTargetDutyPackageSummaries(evals, weightForEval)

    if (r.hasDutyScope) {
      r.categoryQuestionsDuty = buildCategoryQuestionsMap(
        evals,
        'duty',
        trimByQuestionDuty,
        resolveQuestionMeta,
        normQuestionId
      )
    } else {
      r.categoryQuestionsDuty = {}
    }

    const qMap = r.categoryQuestions || {}
    const allQuestionIds = new Set<string>()
    let selfAnsweredQuestions = 0
    let peerAnsweredQuestions = 0
    let bothAnsweredQuestions = 0
    let selfAnsweredCategories = 0
    let peerAnsweredCategories = 0
    Object.values(qMap as Record<string, any[]>).forEach((rows) => {
      let catSelf = false
      let catPeer = false
      ;(rows || []).forEach((x: any) => {
        allQuestionIds.add(String(x.questionId || ''))
        if (x.selfCount > 0) catSelf = true
        if (x.peerCount > 0) catPeer = true
        if (x.selfCount > 0) selfAnsweredQuestions += 1
        if (x.peerCount > 0) peerAnsweredQuestions += 1
        if (x.selfCount > 0 && x.peerCount > 0) bothAnsweredQuestions += 1
      })
      if (catSelf) selfAnsweredCategories += 1
      if (catPeer) peerAnsweredCategories += 1
    })
    r.responseStats = {
      totalQuestionsWithAnyResponse: allQuestionIds.size,
      selfAnsweredQuestions,
      peerAnsweredQuestions,
      bothAnsweredQuestions,
      totalCategoriesWithAnyResponse: Object.keys(qMap).length,
      selfAnsweredCategories,
      peerAnsweredCategories,
      questionTextLookup,
    }

    return r
  })

  ;(results as any[]).forEach((r: any) => {
    const tidKey = canonicalUserId(String(r.targetId || ''))
    const tas = assignmentsByTarget.get(tidKey) || []
    const covTas = coverageAssignmentsByTarget.get(tidKey) || tas
    if (!tas.length && !covTas.length) {
      r.matrixSlices = []
      r.peerEvaluatorAssigned = 0
      r.peerEvaluatorCompletedScorable = 0
      r.peerEvaluatorCompletedNoOpinion = 0
      r.peerEvaluatorPending = 0
      r.peerEvaluatorCountGenel = 0
      r.peerEvaluatorCoverage = { bySlice: [], rows: [] }
      return
    }
    const peerCoverage = buildPeerEvaluatorCoverage(covTas, String(r.targetId || ''), responsesByAssignment)
    r.peerEvaluatorAssigned = peerCoverage.peerEvaluatorAssigned
    r.peerEvaluatorCompletedScorable = peerCoverage.peerEvaluatorCompletedScorable
    r.peerEvaluatorCompletedNoOpinion = peerCoverage.peerEvaluatorCompletedNoOpinion
    r.peerEvaluatorPending = peerCoverage.peerEvaluatorPending
    r.peerEvaluatorCountGenel = peerCoverage.peerEvaluatorCountGenel
    r.peerEvaluatorCoverage = { bySlice: peerCoverage.bySlice, rows: peerCoverage.rows }
    const sliceInput = {
      assignments: tas,
      responsesByAssignment,
      standardsByAssignment: stdScoresByAssignment,
      categoryByQuestionId,
      categoryById,
      categoryWeightByName,
    }
    const peerGroups = buildMatrixReportPeriodGroups({ ...sliceInput, includeSelf: false })
    const selfPeerGroups = buildMatrixReportPeriodGroups({ ...sliceInput, includeSelf: true })
    const peerSlices = flattenMatrixReportSlices(peerGroups)
    const selfPeerByContext = new Map(
      flattenMatrixReportSlices(selfPeerGroups).map((s) => [String(s.matrixContext || ''), s])
    )
    r.matrixSlices = peerSlices.map((slice) => {
      const ctx = String(slice.matrixContext || '')
      if (!isPeriodSummaryMatrixContext(ctx)) return slice
      const withSelf = selfPeerByContext.get(ctx)
      if (!withSelf) return slice
      return {
        ...slice,
        overallAvgSelfPeer: withSelf.overallAvg,
        hasSelfEvaluation: withSelf.hasSelfEvaluation,
      }
    })
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
    if (Array.isArray(r.categoryCompareDuty)) {
      r.categoryCompareDuty = r.categoryCompareDuty.map((c: any) => {
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

    // Translate category keys for drill-down while keeping stable original key as map key
    const translateQuestionMap = (src: Record<string, any> | undefined) => {
      if (!src || typeof src !== 'object') return src
      const next: any = {}
      Object.entries(src).forEach(([k, v]) => {
        const key = String(k || '').trim()
        const label = translateCategory(key)
        next[key] = Array.isArray(v) ? v.map((row: any) => ({ ...row, categoryKey: key, categoryLabel: label })) : v
      })
      return next
    }
    r.categoryQuestions = translateQuestionMap(r.categoryQuestions)
    r.categoryQuestionsDuty = translateQuestionMap(r.categoryQuestionsDuty)
    if (Array.isArray(r.matrixSlices)) {
      r.matrixSlices = r.matrixSlices.map((slice: any) => ({
        ...slice,
        categoryCompare: (slice.categoryCompare || []).map((c: any) => {
          const key = String(c?.name || '').trim()
          return { ...c, key, name: translateCategory(key) }
        }),
      }))
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
          ? Math.round((peerEvals.reduce((sum: number, e: any) => sum + Number(e.standardsAvg || 0), 0) / peerEvals.length) * 100) / 100
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

  const dutyCohorts = dutiesInPeriod.map((duty) => {
    const rankings = results
      .map((r: any) => {
        const uid = canonicalUserId(String(r.targetId || ''))
        if (!userDutiesByUser.get(uid)?.has(duty.id)) return null
        const pkg = (r.dutyPackageScores || []).find((p: any) => String(p.dutyId) === duty.id)
        if (!pkg || (pkg.peerCount === 0 && pkg.selfScore === 0)) return null
        return {
          targetId: r.targetId,
          targetName: r.targetName,
          targetDept: r.targetDept,
          selfScore: pkg.selfScore,
          peerAvg: pkg.peerAvg,
          peerCount: pkg.peerCount,
          teamScore: pkg.overallAvg,
        }
      })
      .filter(Boolean) as Array<{
        targetId: string
        targetName: string
        targetDept: string
        selfScore: number
        peerAvg: number
        peerCount: number
        teamScore: number
      }>
    rankings.sort((a, b) => (b.teamScore || b.peerAvg) - (a.teamScore || a.peerAvg))
    rankings.forEach((row, idx) => ((row as any).rank = idx + 1))
    return { dutyId: duty.id, dutyName: duty.name, rankings }
  })

  return NextResponse.json(
    {
      success: true,
      results,
      peerEvaluatorsVisible: includePeerDetail,
      dutyCohorts,
      questionTexts: questionTextMapToRecord(questionTextById),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}

