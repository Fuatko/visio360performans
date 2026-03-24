import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { canonicalAssignmentId, canonicalUserId, userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const ASSIGNMENTS_PAGE_SIZE = 1000
const RESPONSES_IN_CHUNK = 100
const USERS_IN_CHUNK = 200
const POSTGREST_MAX_ROWS = 1000

type Body = {
  period_id?: string
  org_id?: string
  department?: string | null
}

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

function normDeptKey(s: string) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
    .replace(/\u0131/g, 'i')
}

function deptMatchesFilter(deptKey: string, targetDept: unknown, userDept: unknown) {
  if (!deptKey) return true
  const dT = normDeptKey(String(targetDept ?? ''))
  const dU = normDeptKey(String(userDept ?? ''))
  return dT === deptKey || dU === deptKey
}

function responseNumericScore(r: any): number {
  const n = Number(
    r?.reel_score ?? r?.std_score ?? r?.score ?? (r as any)?.numeric_score ?? (r as any)?.likert_value ?? 0
  )
  return Number.isFinite(n) ? n : 0
}

function avg(rows: number[]) {
  if (!rows.length) return 0
  return Math.round((rows.reduce((s, n) => s + n, 0) / rows.length) * 10) / 10
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:insights:post', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const body = (await req.json().catch(() => ({}))) as Body
  const periodId = String(body.period_id || '').trim()
  const orgId = String(body.org_id || '').trim()
  const dept = String(body.department || '').trim()
  const deptKey = dept ? normDeptKey(dept) : ''
  const orgToUse = s.role === 'org_admin' ? String(s.org_id || '') : orgId

  if (!periodId || !orgToUse) {
    return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })
  }

  const assignmentSelect = `
    id, period_id, evaluator_id, target_id, status,
    evaluator:evaluator_id(id, name, department, position_level),
    target:target_id(id, name, department, organization_id)
  `

  const assignments: any[] = []
  let from = 0
  while (true) {
    const to = from + ASSIGNMENTS_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('evaluation_assignments')
      .select(assignmentSelect)
      .eq('period_id', periodId)
      .eq('status', 'completed')
      .order('id', { ascending: true })
      .range(from, to)
    if (error) return NextResponse.json({ success: false, error: error.message || 'Atamalar alınamadı' }, { status: 400 })
    const rows = data || []
    assignments.push(...rows)
    if (rows.length < ASSIGNMENTS_PAGE_SIZE) break
    from += ASSIGNMENTS_PAGE_SIZE
  }

  const targetIdRaw = (a: any) => String(a?.target_id ?? a?.target?.id ?? '').trim()
  const targetIds = Array.from(new Set(assignments.map((a) => targetIdRaw(a)).filter(Boolean)))
  const userByTargetId = new Map<string, { id?: string | null; name?: string | null; department?: string | null; organization_id?: string | null }>()
  for (let off = 0; off < targetIds.length; off += USERS_IN_CHUNK) {
    const chunk = targetIds.slice(off, off + USERS_IN_CHUNK)
    const { data, error } = await supabase.from('users').select('id,name,department,organization_id').in('id', chunk)
    if (error) return NextResponse.json({ success: false, error: error.message || 'Kullanıcılar alınamadı' }, { status: 400 })
    ;(data || []).forEach((u: any) => {
      const id = String(u?.id || '').trim()
      if (!id) return
      userByTargetId.set(id, u)
      const ck = canonicalUserId(id)
      if (ck) userByTargetId.set(ck, u)
    })
  }
  const userRowForTarget = (tidRaw: string) => userByTargetId.get(tidRaw) || userByTargetId.get(canonicalUserId(tidRaw))

  const passesOrg = (a: any) => {
    const tid = targetIdRaw(a)
    if (!tid) return false
    const u = userRowForTarget(tid)
    const tOrg = a?.target?.organization_id ?? u?.organization_id
    return String(tOrg || '') === String(orgToUse)
  }
  const strictDeptPass = (a: any) => {
    const tid = targetIdRaw(a)
    const u = userRowForTarget(tid)
    return !deptKey || deptMatchesFilter(deptKey, a?.target?.department, u?.department)
  }

  const strictFiltered = assignments.filter((a) => passesOrg(a) && strictDeptPass(a))
  if (!strictFiltered.length) {
    return NextResponse.json({
      success: true,
      summary: { peopleCount: 0, avgSelf: 0, avgTeam: 0, avgOverall: 0 },
      byDepartment: [],
      categories: [],
      questions: [],
      topCategories: [],
      bottomCategories: [],
      topQuestions: [],
      bottomQuestions: [],
      swot: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
      generatedAt: new Date().toISOString(),
    })
  }

  const targetKeysInReport = new Set(strictFiltered.map((a) => canonicalUserId(targetIdRaw(a))).filter(Boolean))
  const filteredAssignments = assignments.filter((a) => passesOrg(a) && (!deptKey || targetKeysInReport.has(canonicalUserId(targetIdRaw(a))) || strictDeptPass(a)))
  const targetsInReport = new Set(filteredAssignments.map((a) => canonicalUserId(targetIdRaw(a))).filter(Boolean))

  const assignmentIds = Array.from(
    new Set(
      assignments
        .filter((a) => targetsInReport.has(canonicalUserId(targetIdRaw(a))))
        .map((a) => String(a?.id ?? '').trim())
        .filter(Boolean)
    )
  )

  const responses: any[] = []
  for (let off = 0; off < assignmentIds.length; off += RESPONSES_IN_CHUNK) {
    const chunk = assignmentIds.slice(off, off + RESPONSES_IN_CHUNK)
    let rFrom = 0
    while (true) {
      const { data, error } = await supabase
        .from('evaluation_responses')
        .select('*')
        .in('assignment_id', chunk)
        .order('id', { ascending: true })
        .range(rFrom, rFrom + POSTGREST_MAX_ROWS - 1)
      if (error) return NextResponse.json({ success: false, error: error.message || 'Yanıtlar alınamadı' }, { status: 400 })
      const rows = data || []
      responses.push(...rows)
      if (rows.length < POSTGREST_MAX_ROWS) break
      rFrom += POSTGREST_MAX_ROWS
    }
  }

  const responsesByAssignment = new Map<string, any[]>()
  ;(responses || []).forEach((r: any) => {
    const raw = String(r?.assignment_id ?? '').trim()
    if (!raw) return
    const ck = canonicalAssignmentId(raw)
    const cur = responsesByAssignment.get(ck) || responsesByAssignment.get(raw) || []
    cur.push(r)
    if (ck) responsesByAssignment.set(ck, cur)
    if (raw !== ck) responsesByAssignment.set(raw, cur)
  })

  const qIds = Array.from(new Set((responses || []).map((r: any) => String(r?.question_id || '').trim()).filter(Boolean)))
  const qTextById = new Map<string, string>()
  if (qIds.length) {
    const { data: qRows } = await supabase
      .from('questions')
      .select('id,text,text_en,text_fr')
      .in('id', qIds)
    ;(qRows || []).forEach((q: any) => {
      const id = String(q?.id || '').trim()
      if (!id) return
      const text = lang === 'fr' ? String(q?.text_fr || q?.text || '') : lang === 'en' ? String(q?.text_en || q?.text || '') : String(q?.text || '')
      qTextById.set(id, text || id)
    })
  }

  const byTarget: Record<string, { name: string; department: string; selfScores: number[]; teamScores: number[]; allScores: number[] }> = {}
  const catAgg: Record<string, { selfSum: number; selfCount: number; teamSum: number; teamCount: number }> = {}
  const qAgg: Record<string, { selfSum: number; selfCount: number; teamSum: number; teamCount: number }> = {}

  filteredAssignments.forEach((a: any) => {
    const tidRaw = targetIdRaw(a)
    const tidKey = canonicalUserId(tidRaw)
    if (!tidKey) return
    const u = userRowForTarget(tidRaw)
    if (!byTarget[tidKey]) {
      byTarget[tidKey] = {
        name: String(a?.target?.name || u?.name || '-'),
        department: String(a?.target?.department || u?.department || '-'),
        selfScores: [],
        teamScores: [],
        allScores: [],
      }
    }

    const aidRaw = String(a?.id || '').trim()
    const aidCanon = canonicalAssignmentId(aidRaw)
    const rows = responsesByAssignment.get(aidCanon) || responsesByAssignment.get(aidRaw) || []
    if (!rows.length) return

    const isSelf = userIdsEqualForSelfEval(a?.evaluator_id, tidRaw)
    rows.forEach((r: any) => {
      const score = responseNumericScore(r)
      if (!Number.isFinite(score) || score <= 0) return
      byTarget[tidKey].allScores.push(score)
      if (isSelf) byTarget[tidKey].selfScores.push(score)
      else byTarget[tidKey].teamScores.push(score)

      const cat = String(r?.category_name || 'Genel').trim() || 'Genel'
      if (!catAgg[cat]) catAgg[cat] = { selfSum: 0, selfCount: 0, teamSum: 0, teamCount: 0 }
      if (isSelf) {
        catAgg[cat].selfSum += score
        catAgg[cat].selfCount += 1
      } else {
        catAgg[cat].teamSum += score
        catAgg[cat].teamCount += 1
      }

      const qid = String(r?.question_id || '').trim()
      if (!qid) return
      if (!qAgg[qid]) qAgg[qid] = { selfSum: 0, selfCount: 0, teamSum: 0, teamCount: 0 }
      if (isSelf) {
        qAgg[qid].selfSum += score
        qAgg[qid].selfCount += 1
      } else {
        qAgg[qid].teamSum += score
        qAgg[qid].teamCount += 1
      }
    })
  })

  const targetRows = Object.values(byTarget).map((r) => ({
    name: r.name,
    department: r.department,
    selfAvg: avg(r.selfScores),
    teamAvg: avg(r.teamScores),
    overallAvg: avg(r.allScores),
  }))

  const byDepartmentMap: Record<string, { self: number[]; team: number[]; overall: number[]; count: number }> = {}
  targetRows.forEach((r) => {
    const d = String(r.department || '-')
    if (!byDepartmentMap[d]) byDepartmentMap[d] = { self: [], team: [], overall: [], count: 0 }
    byDepartmentMap[d].count += 1
    if (r.selfAvg > 0) byDepartmentMap[d].self.push(r.selfAvg)
    if (r.teamAvg > 0) byDepartmentMap[d].team.push(r.teamAvg)
    if (r.overallAvg > 0) byDepartmentMap[d].overall.push(r.overallAvg)
  })
  const byDepartment = Object.entries(byDepartmentMap)
    .map(([department, v]) => ({
      department,
      peopleCount: v.count,
      avgSelf: avg(v.self),
      avgTeam: avg(v.team),
      avgOverall: avg(v.overall),
    }))
    .sort((a, b) => b.avgOverall - a.avgOverall)

  const categories = Object.entries(catAgg)
    .map(([name, v]) => {
      const selfAvg = v.selfCount ? Math.round((v.selfSum / v.selfCount) * 10) / 10 : 0
      const teamAvg = v.teamCount ? Math.round((v.teamSum / v.teamCount) * 10) / 10 : 0
      return {
        name,
        selfAvg,
        teamAvg,
        diff: Math.round((selfAvg - teamAvg) * 10) / 10,
        totalCount: v.selfCount + v.teamCount,
      }
    })
    .sort((a, b) => b.teamAvg - a.teamAvg)

  const questions = Object.entries(qAgg)
    .map(([questionId, v]) => {
      const selfAvg = v.selfCount ? Math.round((v.selfSum / v.selfCount) * 10) / 10 : 0
      const teamAvg = v.teamCount ? Math.round((v.teamSum / v.teamCount) * 10) / 10 : 0
      return {
        questionId,
        text: qTextById.get(questionId) || questionId,
        selfAvg,
        teamAvg,
        diff: Math.round((selfAvg - teamAvg) * 10) / 10,
        totalCount: v.selfCount + v.teamCount,
      }
    })
    .sort((a, b) => b.teamAvg - a.teamAvg)

  const topCategories = categories.slice(0, 5)
  const bottomCategories = [...categories].slice(-5).reverse()
  const topQuestions = questions.slice(0, 5)
  const bottomQuestions = [...questions].slice(-5).reverse()

  const summary = {
    peopleCount: targetRows.length,
    avgSelf: avg(targetRows.map((r) => r.selfAvg).filter((n) => n > 0)),
    avgTeam: avg(targetRows.map((r) => r.teamAvg).filter((n) => n > 0)),
    avgOverall: avg(targetRows.map((r) => r.overallAvg).filter((n) => n > 0)),
  }

  const swot = {
    strengths: topCategories.map((c) => ({ name: c.name, score: c.teamAvg })),
    weaknesses: bottomCategories.map((c) => ({ name: c.name, score: c.teamAvg })),
    opportunities: bottomCategories.slice(0, 4).map((c) => ({ name: c.name, score: c.teamAvg })),
    recommendations: [
      bottomCategories[0] ? `"${bottomCategories[0].name}" alanında kurum genel gelişim programı önerilir.` : '',
      topCategories[0] ? `"${topCategories[0].name}" alanındaki iyi pratikler kurum geneline yaygınlaştırılmalıdır.` : '',
    ].filter(Boolean),
  }

  return NextResponse.json({
    success: true,
    summary,
    byDepartment,
    categories,
    questions,
    topCategories,
    bottomCategories,
    topQuestions,
    bottomQuestions,
    swot,
    generatedAt: new Date().toISOString(),
  })
}

