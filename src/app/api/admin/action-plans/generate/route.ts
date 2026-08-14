import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { isPgEnabled } from '@/lib/db'
import { pgRead, pgReadOne } from '@/lib/server/pg-read'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'

export const runtime = 'nodejs'

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

function pick(lang: string, tr: string, en: string, fr: string) {
  return lang === 'fr' ? fr : lang === 'en' ? en : tr
}

async function computeTop3WeakAreas(supabase: any, uid: string, periodId: string) {
  const { data: assignments, error: aErr } = isPgEnabled()
    ? await pgRead(
        `select id, evaluator_id, target_id from evaluation_assignments
          where target_id = $1 and period_id = $2 and status = 'completed'
          order by completed_at desc`,
        [uid, periodId]
      )
    : await supabase
        .from('evaluation_assignments')
        .select('id, evaluator_id, target_id')
        .eq('target_id', uid)
        .eq('period_id', periodId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
  if (aErr) return { ok: false as const, error: (aErr as any)?.message || 'assignments' }
  if (!assignments || assignments.length === 0) return { ok: true as const, areas: [] as Array<{ name: string; avg: number }> }

  const ids = assignments.map((a: any) => a.id)
  const { data: responses, error: rErr } = isPgEnabled()
    ? await pgRead('select * from evaluation_responses where assignment_id = any($1)', [ids])
    : await supabase.from('evaluation_responses').select('*').in('assignment_id', ids)
  if (rErr) return { ok: false as const, error: (rErr as any)?.message || 'responses' }

  const peerScores: Record<string, { total: number; count: number }> = {}
  ;(assignments as any[]).forEach((a) => {
    const isSelf = String(a.evaluator_id) === String(a.target_id)
    if (isSelf) return
    const rs = (responses || []).filter((r: any) => r.assignment_id === a.id)
    rs.forEach((resp: any) => {
      const catName = String(resp.category_name || 'Genel').trim() || 'Genel'
      const score = Number(resp.reel_score || resp.std_score || 0)
      if (!peerScores[catName]) peerScores[catName] = { total: 0, count: 0 }
      peerScores[catName].total += score
      peerScores[catName].count++
    })
  })

  const peerAvgs = Object.entries(peerScores)
    .map(([name, v]) => ({ name, avg: v.count ? Math.round((v.total / v.count) * 100) / 100 : 0 }))
    .filter((x) => x.avg > 0)
    .sort((a, b) => a.avg - b.avg)

  const top3 = peerAvgs.filter((x) => x.avg < 3.5).slice(0, 3)
  return { ok: true as const, areas: top3 }
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:action-plans:generate', String(s.uid || ''), 6, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as any
  const orgToUse = s.role === 'org_admin' ? String(s.org_id || '') : String(body.org_id || '')
  const periodId = String(body.period_id || '').trim()
  const maxPairs = Math.min(400, Math.max(10, Number(body.limit || 200)))

  if (!orgToUse) return NextResponse.json({ success: false, error: 'org_id gerekli' }, { status: 400 })

  // Get completed assignments (join target to enforce org) — OKUMA fallback; embed target→users jsonb.
  let rows: any[] | null
  let error: any
  if (isPgEnabled()) {
    const params: unknown[] = []
    let periodCond = ''
    if (periodId) { params.push(periodId); periodCond = ` and ea.period_id = $${params.length}` }
    const r = await pgRead(
      `select ea.id, ea.period_id, ea.completed_at,
              case when u.id is not null then jsonb_build_object('id', u.id, 'organization_id', u.organization_id, 'department', u.department, 'status', u.status, 'preferred_language', u.preferred_language) else null end as target
         from evaluation_assignments ea
         left join users u on u.id = ea.target_id
        where ea.status = 'completed' and ea.period_id is not null${periodCond}
        order by ea.completed_at desc
        limit 2500`,
      params
    )
    rows = r.data
    error = r.error
  } else {
    const q = supabase
      .from('evaluation_assignments')
      .select('id, period_id, target:target_id(id,organization_id,department,status,preferred_language), completed_at')
      .eq('status', 'completed')
      .not('period_id', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(2500)
    if (periodId) q.eq('period_id', periodId)

    ;({ data: rows, error } = await q)
  }
  if (error) return NextResponse.json({ success: false, error: (error as any)?.message || 'Veri alınamadı' }, { status: 400 })

  const pairs: Array<{ uid: string; pid: string; lang: string; dept: string | null }> = []
  const seen = new Set<string>()
  for (const r of rows || []) {
    const t = (r as any).target
    const uid = String(t?.id || '')
    const pid = String((r as any).period_id || '')
    if (!uid || !pid) continue
    if (String(t?.organization_id || '') !== String(orgToUse)) continue
    if (t?.status === 'inactive') continue
    const k = `${uid}::${pid}`
    if (seen.has(k)) continue
    seen.add(k)
    pairs.push({ uid, pid, lang: String(t?.preferred_language || 'tr').toLowerCase(), dept: t?.department ? String(t.department) : null })
    if (pairs.length >= maxPairs) break
  }

  if (!pairs.length) return NextResponse.json({ success: true, created: 0, skipped: 0 })

  // Fetch existing plans for these pairs to skip duplicates
  const userIds = Array.from(new Set(pairs.map((p) => p.uid)))
  const periodIds = Array.from(new Set(pairs.map((p) => p.pid)))
  const existingKeys = new Set<string>()
  try {
    const { data: existing, error: exErr } = isPgEnabled()
      ? await pgRead(
          `select user_id, period_id, source from action_plans
            where source = 'development' and user_id = any($1) and period_id = any($2)
            limit 2000`,
          [userIds, periodIds]
        )
      : await supabase
          .from('action_plans')
          .select('user_id, period_id, source')
          .eq('source', 'development')
          .in('user_id', userIds)
          .in('period_id', periodIds)
          .limit(2000)
    if (exErr) throw exErr
    ;(existing || []).forEach((p: any) => {
      const uid = String(p.user_id || '')
      const pid = String(p.period_id || '')
      if (uid && pid) existingKeys.add(`${uid}::${pid}`)
    })
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (msg.includes('action_plans')) {
      return NextResponse.json({ success: false, error: 'action_plans tablosu yok. Önce sql/action-plans.sql çalıştırın.' }, { status: 400 })
    }
  }

  let created = 0
  let skipped = 0
  const nowIso = new Date().toISOString()

  for (const p of pairs) {
    const key = `${p.uid}::${p.pid}`
    if (existingKeys.has(key)) {
      skipped += 1
      continue
    }

    const areasRes = await computeTop3WeakAreas(supabase, p.uid, p.pid)
    if (!areasRes.ok || !areasRes.areas.length) {
      skipped += 1
      continue
    }

    // Load user org id (safe) — OKUMA fallback
    const { data: u } = isPgEnabled()
      ? await pgReadOne<{ id: string; organization_id: string; department: string | null }>(
          'select id, organization_id, department from users where id = $1 limit 1',
          [p.uid]
        )
      : await supabase.from('users').select('id,organization_id,department').eq('id', p.uid).maybeSingle()
    if (!u?.organization_id || String(u.organization_id) !== String(orgToUse)) {
      skipped += 1
      continue
    }

    const dueAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    const title = pick(p.lang, 'Eylem Planı', 'Action Plan', 'Plan d’action')
    const orgId = String(u.organization_id)
    const dept = p.dept || (u.department ? String(u.department) : null)

    // YAZMA (hibrit): pg açıksa withActor → RLS org-context içinde parametreli INSERT ... returning id.
    // org izolasyonu 2 katmanlı: (1) yukarıda u.organization_id === orgToUse JS kontrolü + org_admin ise
    // orgToUse=s.org_id → başka org'a insert edilemez; (2) withActor RLS FORCE (app.current_org) DB seviyesi.
    // kolon adları koddan (sabit) → enjeksiyon yok; değerler $N parametreli.
    let planRow: { id: string } | null = null
    let insErr: any = null
    if (isPgEnabled()) {
      try {
        const rr = await withActor(buildActor(s), async (c) => {
          const r = await c.query<{ id: string }>(
            `insert into action_plans (organization_id, period_id, user_id, department, source, title, status, created_at, updated_at, due_at)
             values ($1, $2, $3, $4, 'development', $5, 'draft', $6, $7, $8) returning id`,
            [orgId, p.pid, p.uid, dept, title, nowIso, nowIso, dueAt]
          )
          return r.rows[0] || null
        })
        planRow = rr
      } catch (e) {
        insErr = e
      }
    } else {
      const res = await supabase
        .from('action_plans')
        .insert({
          organization_id: orgId,
          period_id: p.pid,
          user_id: p.uid,
          department: dept,
          source: 'development',
          title,
          status: 'draft',
          created_at: nowIso,
          updated_at: nowIso,
          due_at: dueAt,
        })
        .select('id')
        .single()
      planRow = res.data as any
      insErr = res.error
    }
    if (insErr || !planRow?.id) {
      skipped += 1
      continue
    }

    const tasksPayload = areasRes.areas.map((x, idx) => ({
      plan_id: planRow!.id,
      sort_order: idx + 1,
      area: String(x.name || ''),
      description: pick(
        p.lang,
        `"${x.name}" alanında gelişim planı başlat`,
        `Start a development plan for "${x.name}"`,
        `Démarrer un plan de développement pour « ${x.name} »`
      ),
      status: 'pending',
      baseline_score: Number(x.avg || 0) || null,
      target_score: Number(x.avg || 0) ? Math.min(5, Number(x.avg || 0) + 1) : null,
      created_at: nowIso,
      updated_at: nowIso,
    }))
    // YAZMA (hibrit): tasks çoklu satır insert. plan_id = az önce oluşturulan plan → org zaten izole.
    // best-effort: hata yut (plan yine de var). kolon adları koddan; değerler $N parametreli.
    try {
      if (isPgEnabled()) {
        await withActor(buildActor(s), async (c) => {
          const cols = '(plan_id, sort_order, area, description, status, baseline_score, target_score, created_at, updated_at)'
          const valuesSql: string[] = []
          const params: unknown[] = []
          for (const t of tasksPayload) {
            const base = params.length
            valuesSql.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`)
            params.push(t.plan_id, t.sort_order, t.area, t.description, t.status, t.baseline_score, t.target_score, t.created_at, t.updated_at)
          }
          await c.query(`insert into action_plan_tasks ${cols} values ${valuesSql.join(', ')}`, params)
        })
      } else {
        await supabase.from('action_plan_tasks').insert(tasksPayload)
      }
    } catch {
      // ignore tasks failure; plan still exists
    }

    created += 1
  }

  return NextResponse.json({ success: true, created, skipped })
}

