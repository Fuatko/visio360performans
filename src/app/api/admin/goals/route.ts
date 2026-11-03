import { NextRequest, NextResponse } from 'next/server'
import { isPgEnabled } from '@/lib/db'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { withActor, type Actor } from '@/lib/server/secure-query'
import { buildActor, getSupabaseAdmin } from '@/lib/server/admin-db'
import {
  canScoreGoals,
  checkGoalDelete,
  checkGoalUpdate,
  goalErrorStatus,
  isGoalStatus,
  isValidGoalScore,
  weightTotal,
  GOAL_TEXT_FIELDS,
} from '@/lib/goals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Hedef yönetimi — yazma yalnız super_admin / org_admin (diğer roller 401).
 * org_admin yalnız kendi kurumunda; hedefin kurumu çözülen kurumla
 * eşleşmezse 404 (varlığını sızdırmamak için). Kurallar src/lib/goals.ts'te.
 * Hedef puanı performans puanına karışmaz; bu uç hiçbir performans hesabına bağlı değil.
 */

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

type Session = NonNullable<ReturnType<typeof verifySession>>

function adminOnly(s: Session | null): s is Session {
  return !!s && (s.role === 'super_admin' || s.role === 'org_admin')
}

function resolveOrg(s: Session, orgParam: string): string {
  return s.role === 'org_admin' ? String(s.org_id || '') : orgParam
}

const GOAL_COLS =
  'id, organization_id, period_id, user_id, title, description, weight, target_text, due_date, status, score, score_rationale, scored_by, scored_at, created_by, created_at, updated_at'

type GoalRow = Record<string, unknown> & { id: string; organization_id: string; period_id: string; user_id: string }
type PeriodRow = { id: string; name: string; status: string | null; end_date: string | null; organization_id: string }

// ---------------------------------------------------------------------------
// Veri erişimi — iki dal: pg (withActor) ve Supabase.
// ---------------------------------------------------------------------------

async function loadPeriod(actor: Actor, periodId: string): Promise<PeriodRow | null> {
  if (isPgEnabled()) {
    const r = await withActor(actor, (c) =>
      c.query<PeriodRow>('select id, name, status, end_date, organization_id from evaluation_periods where id = $1 limit 1', [periodId])
    )
    return r.rows[0] || null
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Veritabanı yapılandırması eksik')
  const { data, error } = await supabase
    .from('evaluation_periods')
    .select('id, name, status, end_date, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as PeriodRow | null) || null
}

async function loadGoal(actor: Actor, id: string): Promise<GoalRow | null> {
  if (isPgEnabled()) {
    const r = await withActor(actor, (c) => c.query<GoalRow>(`select ${GOAL_COLS} from goals where id = $1 limit 1`, [id]))
    return r.rows[0] || null
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('Veritabanı yapılandırması eksik')
  const { data, error } = await supabase.from('goals').select(GOAL_COLS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as GoalRow | null) || null
}

async function userInOrg(actor: Actor, userId: string, orgId: string): Promise<boolean> {
  if (isPgEnabled()) {
    const r = await withActor(actor, (c) =>
      c.query('select id from users where id = $1 and organization_id = $2 limit 1', [userId, orgId])
    )
    return r.rows.length > 0
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return false
  const { data } = await supabase.from('users').select('id').eq('id', userId).eq('organization_id', orgId).maybeSingle()
  return !!data
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const text = (v: unknown, max = 4000): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}
const dateOnly = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v.trim())
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function guard(s: Session | null) {
  if (!adminOnly(s)) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  return null
}

const notFound = () => NextResponse.json({ success: false, error: 'not_found' }, { status: 404 })

// ---------------------------------------------------------------------------
// GET — dönemin aktif kişileri ve hedefleri (hedefi olmayan kişi boş diziyle)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  const denied = guard(s)
  if (denied) return denied
  const sess = s as Session

  const rl = await rateLimitByUser(req, 'goals:get', String(sess.uid || ''), 30, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const url = new URL(req.url)
  const periodId = (url.searchParams.get('period_id') || '').trim()
  const orgId = resolveOrg(sess, (url.searchParams.get('org_id') || '').trim())
  if (!periodId || !orgId) return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })

  const actor = buildActor({ role: sess.role, org_id: orgId, uid: sess.uid })
  try {
    const period = await loadPeriod(actor, periodId)
    if (!period || String(period.organization_id) !== orgId) return notFound()

    let users: Array<{ id: string; name: string | null; title: string | null; department: string | null }> = []
    let goals: GoalRow[] = []
    if (isPgEnabled()) {
      ;[users, goals] = await Promise.all([
        withActor(actor, (c) =>
          c.query<{ id: string; name: string | null; title: string | null; department: string | null }>(
            "select id, name, title, department from users where organization_id = $1 and status = 'active' order by name",
            [orgId]
          )
        ).then((r) => r.rows),
        withActor(actor, (c) =>
          c.query<GoalRow>(
            `select ${GOAL_COLS} from goals where period_id = $1 and organization_id = $2 order by created_at`,
            [periodId, orgId]
          )
        ).then((r) => r.rows),
      ])
    } else {
      const supabase = getSupabaseAdmin()
      if (!supabase) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })
      const [u, g] = await Promise.all([
        supabase.from('users').select('id, name, title, department').eq('organization_id', orgId).eq('status', 'active').order('name'),
        supabase.from('goals').select(GOAL_COLS).eq('period_id', periodId).eq('organization_id', orgId).order('created_at'),
      ])
      if (u.error) throw new Error(u.error.message)
      if (g.error) throw new Error(g.error.message)
      users = (u.data || []) as typeof users
      goals = (g.data || []) as GoalRow[]
    }

    const byUser = new Map<string, GoalRow[]>()
    for (const g of goals) {
      const k = String(g.user_id)
      byUser.set(k, [...(byUser.get(k) || []), g])
    }
    const people = users.map((u) => {
      const list = byUser.get(String(u.id)) || []
      return {
        user_id: String(u.id),
        name: String(u.name || ''),
        title: u.title || '',
        department: u.department || '',
        goals: list,
        weight_total: weightTotal(list.map((g) => ({ weight: num(g.weight) }))),
        scored_count: list.filter((g) => num(g.score) !== null).length,
      }
    })

    return NextResponse.json(
      {
        success: true,
        period: { id: period.id, name: period.name, status: period.status, end_date: period.end_date },
        canScore: canScoreGoals(period.status),
        people,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Liste alınamadı' }, { status: 400 })
  }
}

// ---------------------------------------------------------------------------
// POST — yeni hedef. organization_id sunucuda belirlenir; gövdeden OKUNMAZ.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  const denied = guard(s)
  if (denied) return denied
  const sess = s as Session

  const rl = await rateLimitByUser(req, 'goals:write', String(sess.uid || ''), 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const periodId = typeof body.period_id === 'string' ? body.period_id.trim() : ''
  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  const title = text(body.title, 500)
  const orgId = resolveOrg(sess, typeof body.org_id === 'string' ? body.org_id.trim() : '')
  if (!periodId || !userId || !title || !orgId) {
    return NextResponse.json({ success: false, error: 'period_id, user_id, title ve org_id gerekli' }, { status: 400 })
  }
  if (body.status !== undefined && !isGoalStatus(body.status)) {
    return NextResponse.json({ success: false, error: 'invalid_status' }, { status: 400 })
  }

  const actor = buildActor({ role: sess.role, org_id: orgId, uid: sess.uid })
  try {
    const period = await loadPeriod(actor, periodId)
    if (!period || String(period.organization_id) !== orgId) return notFound()
    if (!(await userInOrg(actor, userId, orgId))) return notFound()

    const row = {
      organization_id: orgId,
      period_id: periodId,
      user_id: userId,
      title,
      description: text(body.description),
      weight: num(body.weight),
      target_text: text(body.target_text),
      due_date: dateOnly(body.due_date),
      status: isGoalStatus(body.status) ? body.status : 'open',
      created_by: String(sess.uid),
    }
    let created: GoalRow | null = null
    if (isPgEnabled()) {
      const r = await withActor(actor, (c) =>
        c.query<GoalRow>(
          `insert into goals (organization_id, period_id, user_id, title, description, weight, target_text, due_date, status, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${GOAL_COLS}`,
          [row.organization_id, row.period_id, row.user_id, row.title, row.description, row.weight, row.target_text, row.due_date, row.status, row.created_by]
        )
      )
      created = r.rows[0] || null
    } else {
      const supabase = getSupabaseAdmin()
      if (!supabase) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })
      const { data, error } = await supabase.from('goals').insert(row).select(GOAL_COLS).maybeSingle()
      if (error) throw new Error(error.message)
      created = (data as GoalRow | null) || null
    }
    return NextResponse.json({ success: true, goal: created }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Kaydedilemedi' }, { status: 400 })
  }
}

// ---------------------------------------------------------------------------
// PUT — güncelleme. Kurallar checkGoalUpdate'te (kilit, puan aralığı, dönem kapalı).
// ---------------------------------------------------------------------------
export async function PUT(req: NextRequest) {
  const s = sessionFromReq(req)
  const denied = guard(s)
  if (denied) return denied
  const sess = s as Session

  const rl = await rateLimitByUser(req, 'goals:write', String(sess.uid || ''), 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const orgId = resolveOrg(sess, typeof body.org_id === 'string' ? body.org_id.trim() : '')
  if (!id || !orgId) return NextResponse.json({ success: false, error: 'id ve org_id gerekli' }, { status: 400 })
  if (Object.prototype.hasOwnProperty.call(body, 'title') && !text(body.title, 500)) {
    return NextResponse.json({ success: false, error: 'title boş olamaz' }, { status: 400 })
  }

  const actor = buildActor({ role: sess.role, org_id: orgId, uid: sess.uid })
  try {
    const existing = await loadGoal(actor, id)
    if (!existing || String(existing.organization_id) !== orgId) return notFound()
    const period = await loadPeriod(actor, String(existing.period_id))
    const err = checkGoalUpdate({ existing, periodStatus: period?.status ?? null, body })
    if (err) return NextResponse.json({ success: false, error: err }, { status: goalErrorStatus(err) })

    // Yazılacak alanlar — yalnız tanınan alanlar; kimlik/kurum/oluşturan alanları gövdeden alınmaz.
    const patch: Record<string, unknown> = {}
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)
    for (const f of GOAL_TEXT_FIELDS) {
      if (!has(f)) continue
      patch[f] = f === 'weight' ? num(body[f]) : f === 'due_date' ? dateOnly(body[f]) : f === 'title' ? text(body[f], 500) : text(body[f])
    }
    if (has('status')) patch.status = body.status
    if (has('score_rationale')) patch.score_rationale = text(body.score_rationale)
    const scoring = has('score') && isValidGoalScore(body.score)
    if (scoring) patch.score = body.score as number | null

    let updated: GoalRow | null = null
    if (isPgEnabled()) {
      const sets: string[] = []
      const params: unknown[] = []
      let i = 1
      for (const [k, v] of Object.entries(patch)) {
        sets.push(`${k} = $${i++}`)
        params.push(v)
      }
      if (scoring) {
        sets.push(`scored_by = $${i++}`, 'scored_at = now()')
        params.push(String(sess.uid))
      }
      sets.push('updated_at = now()')
      params.push(id, orgId)
      const r = await withActor(actor, (c) =>
        c.query<GoalRow>(
          `update goals set ${sets.join(', ')} where id = $${i++} and organization_id = $${i} returning ${GOAL_COLS}`,
          params
        )
      )
      updated = r.rows[0] || null
    } else {
      const supabase = getSupabaseAdmin()
      if (!supabase) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })
      const now = new Date().toISOString()
      const upd: Record<string, unknown> = { ...patch, updated_at: now }
      if (scoring) {
        upd.scored_by = String(sess.uid)
        upd.scored_at = now
      }
      const { data, error } = await supabase.from('goals').update(upd).eq('id', id).eq('organization_id', orgId).select(GOAL_COLS).maybeSingle()
      if (error) throw new Error(error.message)
      updated = (data as GoalRow | null) || null
    }
    if (!updated) return notFound()
    return NextResponse.json({ success: true, goal: updated })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Güncellenemedi' }, { status: 400 })
  }
}

// ---------------------------------------------------------------------------
// DELETE — puanlanmış hedef silinemez (409 goal_scored_no_delete).
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const s = sessionFromReq(req)
  const denied = guard(s)
  if (denied) return denied
  const sess = s as Session

  const rl = await rateLimitByUser(req, 'goals:write', String(sess.uid || ''), 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const url = new URL(req.url)
  const id = (url.searchParams.get('id') || '').trim()
  const orgId = resolveOrg(sess, (url.searchParams.get('org_id') || '').trim())
  if (!id || !orgId) return NextResponse.json({ success: false, error: 'id ve org_id gerekli' }, { status: 400 })

  const actor = buildActor({ role: sess.role, org_id: orgId, uid: sess.uid })
  try {
    const existing = await loadGoal(actor, id)
    if (!existing || String(existing.organization_id) !== orgId) return notFound()
    const err = checkGoalDelete(existing.score)
    if (err) return NextResponse.json({ success: false, error: err }, { status: goalErrorStatus(err) })

    if (isPgEnabled()) {
      // score is null: kontrol ile silme arasında puanlanırsa silmez.
      const r = await withActor(actor, (c) =>
        c.query('delete from goals where id = $1 and organization_id = $2 and score is null', [id, orgId])
      )
      if (!r.rowCount) return NextResponse.json({ success: false, error: 'goal_scored_no_delete' }, { status: 409 })
    } else {
      const supabase = getSupabaseAdmin()
      if (!supabase) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })
      const { error } = await supabase.from('goals').delete().eq('id', id).eq('organization_id', orgId).is('score', null)
      if (error) throw new Error(error.message)
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Silinemedi' }, { status: 400 })
  }
}
