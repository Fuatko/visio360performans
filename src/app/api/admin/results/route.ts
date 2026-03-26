import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  canonicalAssignmentId,
  canonicalUserId,
  userIdsEqualForSelfEval,
} from '@/lib/server/evaluation-identity'

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

function pickTextByLang(row: any, lang: string): string {
  if (!row) return ''
  if (lang === 'fr') return String(row.text_fr || row.text || '')
  if (lang === 'en') return String(row.text_en || row.text || '')
  return String(row.text || '')
}

function pickQuestionTextByLang(row: any, lang: string): string {
  if (!row) return ''
  const read = (k: string) => {
    const v = (row as any)?.[k]
    return typeof v === 'string' ? v : ''
  }
  const candidates =
    lang === 'fr'
      ? [
          read('text_fr'),
          read('question_text_fr'),
          read('prompt_fr'),
          read('label_fr'),
          read('name_fr'),
          read('text'),
          read('question_text'),
          read('prompt'),
          read('label'),
          read('name'),
        ]
      : lang === 'en'
        ? [
            read('text_en'),
            read('question_text_en'),
            read('prompt_en'),
            read('label_en'),
            read('name_en'),
            read('text'),
            read('question_text'),
            read('prompt'),
            read('label'),
            read('name'),
          ]
        : [
            read('text'),
            read('question_text'),
            read('prompt'),
            read('label'),
            read('name'),
          ]
  const out = candidates.map((s) => String(s || '').trim()).find(Boolean) || ''
  // Avoid showing UUID-like strings as "text"
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(out)) return ''
  if (/^[0-9a-f]{32}$/i.test(out)) return ''
  return out
}

function canonicalUuid(v: any): string {
  const raw = String(v ?? '').trim()
  if (!raw) return ''
  const s = raw.toLowerCase()
  // If already looks like UUID with dashes, keep.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return s
  // If stored without dashes (32 hex), format it.
  if (/^[0-9a-f]{32}$/.test(s)) {
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
  }
  return s
}

function uuidWithoutDashes(v: any): string {
  const s = canonicalUuid(v)
  if (!s) return ''
  return s.replace(/-/g, '')
}

function mean(nums: number[]) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Drop min+max (1 each) when n>=3; else fallback to mean. */
function trimmedMean(nums: number[]) {
  const xs = nums.filter((n) => Number.isFinite(n))
  if (xs.length < 3) return mean(xs)
  xs.sort((a, b) => a - b)
  const trimmed = xs.slice(1, xs.length - 1)
  return mean(trimmed)
}

function trimmedMeanDetail(nums: number[]) {
  const xs = nums.filter((n) => Number.isFinite(n))
  if (!xs.length) return { value: 0, applied: false, n: 0 }
  if (xs.length < 3) return { value: mean(xs), applied: false, n: xs.length }
  xs.sort((a, b) => a - b)
  const trimmed = xs.slice(1, xs.length - 1)
  return { value: mean(trimmed), applied: true, n: xs.length }
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
          const text = pickQuestionTextByLang(q, lang).trim()
          const order = Number(q?.sort_order ?? q?.order_num ?? 0) || 0
          const entry = { text: text || id, order }
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
            const id = canonicalUuid(q?.id)
            if (!id) return
            const text = pickQuestionTextByLang(q, lang).trim()
            const order = Number(q?.sort_order ?? q?.order_num ?? 0) || 0
            const entry = { text: text || id, order }
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
    const isSelf = userIdsEqualForSelfEval(eid, tidRaw)
    const evaluatorLevel = isSelf ? 'self' : (a?.evaluator?.position_level || 'peer')
    const aidCanon = canonicalAssignmentId(a.id)
    const aidRaw = String(a.id ?? '').trim()
    const assignmentResponses =
      responsesByAssignment.get(aidCanon) || responsesByAssignment.get(aidRaw) || []
    const scorable = assignmentResponses.filter((r: any) => responseNumericScore(r) > 0)
    const hasScorableResponses = scorable.length > 0
    const sumResp = scorable.reduce((sum: number, r: any) => sum + responseNumericScore(r), 0)
    const denomResp = scorable.length
    const rawAvg = denomResp ? sumResp / denomResp : 0
    const avgScore = Number.isFinite(rawAvg) ? Math.round(rawAvg * 10) / 10 : 0

    const catAgg: Record<string, { sum: number; count: number }> = {}
    const qAgg: Record<string, { sum: number; count: number; category: string }> = {}
    assignmentResponses.forEach((r: any) => {
      const raw = String(r.category_name || '').trim()
      const qid = String(r?.question_id || '').trim()
      const cid = String(r?.category_id || '').trim()
      const info = qid ? categoryByQuestionId.get(qid) : null
      const byId = !info?.key && cid ? categoryById.get(cid) : null
      const name = (info?.key || byId?.key || raw || 'Genel').toString()
      const score = responseNumericScore(r)
      if (score <= 0) {
        // Keep rows for debug counts, but do not let "Bilgim yok (0)" affect scoring averages.
        return
      }
      if (!catAgg[name]) catAgg[name] = { sum: 0, count: 0 }
      catAgg[name].sum += score
      catAgg[name].count += 1

      if (qid) {
        if (!qAgg[qid]) qAgg[qid] = { sum: 0, count: 0, category: name }
        qAgg[qid].sum += score
        qAgg[qid].count += 1
      }
    })
    const categories = Object.entries(catAgg).map(([name, v]) => ({
      name,
      score: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
    }))
    const questionScores = Object.entries(qAgg).map(([questionId, v]) => ({
      questionId,
      category: v.category,
      score: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
    }))

    const stdForAssignment =
      stdScoresByAssignment.get(aidCanon) || stdScoresByAssignment.get(aidRaw) || []
    const standardsAvg =
      stdForAssignment.length > 0
        ? Math.round((stdForAssignment.reduce((s, r) => s + Number(r.score || 0), 0) / stdForAssignment.length) * 10) / 10
        : 0

    const distinctQuestions = new Set(
      assignmentResponses.map((r: any) => String(r?.question_id || '').trim()).filter(Boolean)
    )
    const zeroScoreCount = assignmentResponses.reduce((n: number, r: any) => n + (responseNumericScore(r) === 0 ? 1 : 0), 0)
    const missingCategoryCount = assignmentResponses.reduce((n: number, r: any) => {
      const hasName = String(r?.category_name || '').trim().length > 0
      const hasId = String(r?.category_id || '').trim().length > 0
      return n + (!hasName && !hasId ? 1 : 0)
    }, 0)

    byTarget[tidKey].evaluations.push({
      evaluatorId: a?.evaluator?.id || a.evaluator_id,
      evaluatorName: a?.evaluator?.name || '-',
      isSelf,
      evaluatorLevel,
      avgScore,
      hasScorableResponses,
      categories,
      questionScores,
      standardsAvg,
      assignmentId: String(a?.id || '').trim() || aidCanon || aidRaw,
      responseCount: assignmentResponses.length,
      distinctQuestionCount: distinctQuestions.size,
      distinctCategoryCount: Object.keys(catAgg).length,
      zeroScoreCount,
      missingCategoryCount,
    })
  })

  // İlk döngüde öz satırı yoksa (liste tutarsızlığı), aynı hedef için öz atamasını ekle — yanıtlar yukarıda yüklendi.
  Object.keys(byTarget).forEach((tidKey) => {
    const row = byTarget[tidKey]
    if ((row.evaluations || []).some((e: any) => e.isSelf)) return
    const selfA = (assignments as any[]).find((a) => {
      const t = canonicalUserId(targetIdRaw(a))
      if (t !== tidKey) return false
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
    const scorable = assignmentResponses.filter((r: any) => responseNumericScore(r) > 0)
    const hasScorableResponses = scorable.length > 0
    const sumResp = scorable.reduce((sum: number, r: any) => sum + responseNumericScore(r), 0)
    const denomResp = scorable.length
    const rawAvg = denomResp ? sumResp / denomResp : 0
    const avgScore = Number.isFinite(rawAvg) ? Math.round(rawAvg * 10) / 10 : 0
    const catAgg: Record<string, { sum: number; count: number }> = {}
    const qAgg: Record<string, { sum: number; count: number; category: string }> = {}
    assignmentResponses.forEach((r: any) => {
      const raw = String(r.category_name || '').trim()
      const qid = String(r?.question_id || '').trim()
      const cid = String(r?.category_id || '').trim()
      const info = qid ? categoryByQuestionId.get(qid) : null
      const byId = !info?.key && cid ? categoryById.get(cid) : null
      const name = (info?.key || byId?.key || raw || 'Genel').toString()
      const score = responseNumericScore(r)
      if (score <= 0) return
      if (!catAgg[name]) catAgg[name] = { sum: 0, count: 0 }
      catAgg[name].sum += score
      catAgg[name].count += 1
      if (qid) {
        if (!qAgg[qid]) qAgg[qid] = { sum: 0, count: 0, category: name }
        qAgg[qid].sum += score
        qAgg[qid].count += 1
      }
    })
    const categories = Object.entries(catAgg).map(([name, v]) => ({
      name,
      score: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
    }))
    const questionScores = Object.entries(qAgg).map(([questionId, v]) => ({
      questionId,
      category: v.category,
      score: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
    }))
    const stdForAssignment =
      stdScoresByAssignment.get(aidCanon) || stdScoresByAssignment.get(aidRaw) || []
    const standardsAvg =
      stdForAssignment.length > 0
        ? Math.round((stdForAssignment.reduce((s, r) => s + Number(r.score || 0), 0) / stdForAssignment.length) * 10) / 10
        : 0
    const distinctQuestions = new Set(
      assignmentResponses.map((r: any) => String(r?.question_id || '').trim()).filter(Boolean)
    )
    const zeroScoreCount = assignmentResponses.reduce((n: number, r: any) => n + (responseNumericScore(r) === 0 ? 1 : 0), 0)
    const missingCategoryCount = assignmentResponses.reduce((n: number, r: any) => {
      const hasName = String(r?.category_name || '').trim().length > 0
      const hasId = String(r?.category_id || '').trim().length > 0
      return n + (!hasName && !hasId ? 1 : 0)
    }, 0)
    row.evaluations.push({
      evaluatorId: selfA?.evaluator?.id || selfA.evaluator_id,
      evaluatorName: selfA?.evaluator?.name || '-',
      isSelf,
      evaluatorLevel,
      avgScore,
      hasScorableResponses,
      categories,
      questionScores,
      standardsAvg,
      assignmentId: String(selfA?.id || '').trim() || aidCanon || aidRaw,
      responseCount: assignmentResponses.length,
      distinctQuestionCount: distinctQuestions.size,
      distinctCategoryCount: Object.keys(catAgg).length,
      zeroScoreCount,
      missingCategoryCount,
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
      return { name, self, peer, diff, weight: Number(categoryWeightByName[name] ?? 1), peerTrimmed: 0 }
    })

    // Robust (trimmed) peer scoring: per-question across peer evaluators, drop highest+lowest.
    const peerQuestionScores = new Map<string, { category: string; scores: number[] }>()
    ;(peerEvalsScorable as any[]).forEach((e: any) => {
      ;((e?.questionScores || []) as any[]).forEach((qs: any) => {
        const qid = String(qs?.questionId || '').trim()
        if (!qid) return
        const v = Number(qs?.score || 0)
        if (!Number.isFinite(v) || v <= 0) return
        const cat = String(qs?.category || 'Genel')
        const cur = peerQuestionScores.get(qid) || { category: cat, scores: [] as number[] }
        cur.category = cur.category || cat
        cur.scores.push(v)
        peerQuestionScores.set(qid, cur)
      })
    })
    const trimmedByCategory = new Map<string, number[]>()
    const trimMetaByCategory = new Map<string, { total: number; applied: number }>()
    const trimByQuestion = new Map<string, { value: number; applied: boolean; n: number }>()
    peerQuestionScores.forEach((v) => {
      const t = trimmedMeanDetail(v.scores)
      if (!Number.isFinite(t.value) || t.value <= 0) return
      const cat = String(v.category || 'Genel')
      const cur = trimmedByCategory.get(cat) || []
      cur.push(t.value)
      trimmedByCategory.set(cat, cur)
      const meta = trimMetaByCategory.get(cat) || { total: 0, applied: 0 }
      meta.total += 1
      if (t.applied) meta.applied += 1
      trimMetaByCategory.set(cat, meta)
    })
    peerQuestionScores.forEach((v, qid) => {
      const t = trimmedMeanDetail(v.scores)
      trimByQuestion.set(qid, t)
    })
    const peerTrimmedForCat = (cat: string) => {
      const xs = trimmedByCategory.get(cat) || []
      if (!xs.length) return 0
      return Math.round(mean(xs) * 10) / 10
    }
    r.categoryCompare = (r.categoryCompare || []).map((c: any) => ({
      ...c,
      peerTrimmed: peerTrimmedForCat(String(c.name || 'Genel')),
      peerTrimAppliedCount: trimMetaByCategory.get(String(c.name || 'Genel'))?.applied || 0,
      peerTrimQuestionCount: trimMetaByCategory.get(String(c.name || 'Genel'))?.total || 0,
    }))
    // Overall trimmed: weighted by category weights, based on peerTrimmed
    const rowsForOverall = (r.categoryCompare || [])
      .map((c: any) => ({ w: Number(c.weight ?? 1), v: Number(c.peerTrimmed || 0) }))
      .filter((x: any) => Number.isFinite(x.v) && x.v > 0 && Number.isFinite(x.w) && x.w > 0)
    r.peerAvgTrimmed = rowsForOverall.length ? Math.round(weightedAvg(rowsForOverall) * 10) / 10 : 0
    // Keep overall trimmed alongside the original overallAvg; do not change existing overallAvg.
    r.overallAvgTrimmed = r.peerAvgTrimmed

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
      if (canonicalUserId(targetIdRaw(a)) !== canonicalUserId(r.targetId)) return
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

    // Build per-category question drilldown (self vs team averages)
    const qMap: Record<
      string,
      Record<
        string,
        {
          questionId: string
          questionText: string
          order: number
          selfSum: number
          selfCount: number
          peerSum: number
          peerCount: number
        }
      >
    > = {}
    ;(evals as any[]).forEach((e: any) => {
      ;((e?.questionScores || []) as any[]).forEach((qs: any) => {
        const qid = canonicalUuid(qs?.questionId)
        if (!qid) return
        const cat = String(qs?.category || 'Genel').trim() || 'Genel'
        if (!qMap[cat]) qMap[cat] = {}
        if (!qMap[cat][qid]) {
          const qt = questionTextById.get(qid)
            || questionTextById.get(uuidWithoutDashes(qid))
          qMap[cat][qid] = {
            questionId: qid,
            questionText: (qt?.text || qid).trim(),
            order: Number(qt?.order ?? 0) || 0,
            selfSum: 0,
            selfCount: 0,
            peerSum: 0,
            peerCount: 0,
          }
        }
        const score = Number(qs?.score ?? 0)
        if (!Number.isFinite(score)) return
        if (e.isSelf) {
          qMap[cat][qid].selfSum += score
          qMap[cat][qid].selfCount += 1
        } else {
          qMap[cat][qid].peerSum += score
          qMap[cat][qid].peerCount += 1
        }
      })
    })
    const categoryQuestions: Record<
      string,
      Array<{ questionId: string; questionText: string; self: number; peer: number; peerTrimmed: number; peerTrimApplied: boolean; peerTrimN: number; diff: number; selfCount: number; peerCount: number }>
    > = {}
    Object.entries(qMap).forEach(([cat, qm]) => {
      const rows = Object.values(qm).map((x) => {
        const self = x.selfCount ? Math.round((x.selfSum / x.selfCount) * 10) / 10 : 0
        const peer = x.peerCount ? Math.round((x.peerSum / x.peerCount) * 10) / 10 : 0
        const diff = self && peer ? Math.round((self - peer) * 10) / 10 : 0
        const tm = trimByQuestion.get(x.questionId) || { value: peer, applied: false, n: x.peerCount }
        const peerTrimmed = tm.value ? Math.round(Number(tm.value) * 10) / 10 : 0
        return { ...x, self, peer, peerTrimmed, peerTrimApplied: Boolean(tm.applied), peerTrimN: Number(tm.n || 0), diff }
      })
      rows.sort((a, b) => (a.order || 0) - (b.order || 0) || a.questionText.localeCompare(b.questionText))
      categoryQuestions[cat] = rows.map((x) => ({
        questionId: x.questionId,
        questionText: x.questionText,
        self: x.self,
        peer: x.peer,
        peerTrimmed: x.peerTrimmed,
        peerTrimApplied: x.peerTrimApplied,
        peerTrimN: x.peerTrimN,
        diff: x.diff,
        selfCount: x.selfCount,
        peerCount: x.peerCount,
      }))
    })
    r.categoryQuestions = categoryQuestions

    // Summary stats to help debug "missing data" vs "Bilgim yok (0)"
    const allQuestionIds = new Set<string>()
    let selfAnsweredQuestions = 0
    let peerAnsweredQuestions = 0
    let bothAnsweredQuestions = 0
    let selfAnsweredCategories = 0
    let peerAnsweredCategories = 0
    Object.entries(qMap).forEach(([cat, qm]) => {
      let catSelf = false
      let catPeer = false
      Object.values(qm).forEach((x) => {
        allQuestionIds.add(x.questionId)
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

    // Translate category keys for drill-down while keeping stable original key as map key
    if (r?.categoryQuestions && typeof r.categoryQuestions === 'object') {
      const next: any = {}
      Object.entries(r.categoryQuestions as Record<string, any>).forEach(([k, v]) => {
        const key = String(k || '').trim()
        const label = translateCategory(key)
        // Keep original key for lookup; also attach label on each row for convenience
        next[key] = Array.isArray(v) ? v.map((row: any) => ({ ...row, categoryKey: key, categoryLabel: label })) : v
      })
      r.categoryQuestions = next
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

