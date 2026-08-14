import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { isPersonalDevelopmentPeriod } from '@/lib/evaluation-period-kind'
import { userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'
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

type TaskStatus = 'pending' | 'started' | 'done'
type PlanStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled'

function defaultNowIso() {
  return new Date().toISOString()
}

async function ensurePlanAndTasks(params: {
  supabase: any
  uid: string
  periodId: string
  lang: string
  session: any
}) {
  const { supabase, uid, periodId, session } = params

  // Fetch user to get org & department (OKUMA fallback)
  const { data: u, error: uErr } = isPgEnabled()
    ? await pgReadOne<{ id: string; organization_id: string; department: string | null }>(
        'select id, organization_id, department from users where id = $1 limit 1',
        [uid]
      )
    : await supabase.from('users').select('id, organization_id, department').eq('id', uid).maybeSingle()
  if (uErr || !u?.organization_id) return { ok: false as const, error: 'User/org not found' }

  // Try load existing plan (best-effort; table may not exist yet) — OKUMA fallback
  const { data: existing, error: pErr } = isPgEnabled()
    ? await pgReadOne(
        `select id, status, created_at, started_at, due_at, completed_at from action_plans
          where user_id = $1 and period_id = $2 and source = 'development' limit 1`,
        [uid, periodId]
      )
    : await supabase
        .from('action_plans')
        .select('id,status,created_at,started_at,due_at,completed_at')
        .eq('user_id', uid)
        .eq('period_id', periodId)
        .eq('source', 'development')
        .maybeSingle()

  // If table doesn't exist yet, return a graceful "not configured"
  if (pErr && String((pErr as any)?.message || '').toLowerCase().includes('relation') && String((pErr as any)?.message || '').includes('action_plans')) {
    return { ok: false as const, error: 'action_plans table missing' }
  }
  if (pErr) return { ok: false as const, error: (pErr as any)?.message || 'Failed to load plan' }

  const plan = existing || null
  if (plan?.id) {
    const { data: tasks, error: tErr } = isPgEnabled()
      ? await pgRead(
          `select id, sort_order, area, description, status, planned_at, learning_started_at, baseline_score, target_score, training_id, ai_suggestion, ai_text, ai_generated_at, ai_model, started_at, done_at
             from action_plan_tasks where plan_id = $1 order by sort_order asc`,
          [plan.id]
        )
      : await supabase
          .from('action_plan_tasks')
          .select(
            'id, sort_order, area, description, status, planned_at, learning_started_at, baseline_score, target_score, training_id, ai_suggestion, ai_text, ai_generated_at, ai_model, started_at, done_at'
          )
          .eq('plan_id', plan.id)
          .order('sort_order', { ascending: true })
    if (tErr) return { ok: false as const, error: (tErr as any)?.message || 'Failed to load tasks' }
    return { ok: true as const, plan, tasks: tasks || [] }
  }

  // No plan yet → generate a lightweight default plan with 3 tasks.
  // We derive "areas" from the development endpoint logic (peer < 3.5).
  const { data: assignments, error: aErr } = isPgEnabled()
    ? await pgRead(
        `select ea.id, ea.evaluator_id, ea.target_id, ea.status,
                case when ep.id is not null then jsonb_build_object('id', ep.id, 'name', ep.name, 'name_en', ep.name_en, 'name_fr', ep.name_fr, 'assessment_kind', ep.assessment_kind) else null end as evaluation_periods
           from evaluation_assignments ea
           left join evaluation_periods ep on ep.id = ea.period_id
          where ea.target_id = $1 and ea.status = 'completed'
          order by ea.completed_at desc`,
        [uid]
      )
    : await supabase
        .from('evaluation_assignments')
        .select('id, evaluator_id, target_id, status, evaluation_periods(id, name, name_en, name_fr, assessment_kind)')
        .eq('target_id', uid)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
  if (aErr) return { ok: false as const, error: (aErr as any)?.message || 'Failed to load assignments' }

  const developmentAssignments = (assignments || []).filter((a: any) =>
    isPersonalDevelopmentPeriod(a?.evaluation_periods?.assessment_kind)
  )
  const periodAssignments = developmentAssignments.filter((a: any) => String(a?.evaluation_periods?.id || '') === String(periodId))
  if (!periodAssignments.length) {
    // No completed data for this period; do not create a plan automatically
    return { ok: true as const, plan: null, tasks: [] as any[] }
  }

  const assignmentIds = periodAssignments.map((a: any) => a.id)
  const { data: responses, error: rErr } = isPgEnabled()
    ? await pgRead('select * from evaluation_responses where assignment_id = any($1)', [assignmentIds])
    : await supabase.from('evaluation_responses').select('*').in('assignment_id', assignmentIds)
  if (rErr) return { ok: false as const, error: (rErr as any)?.message || 'Failed to load responses' }

  // Aggregate peer scores per category
  const peerScores: Record<string, { total: number; count: number }> = {}
  periodAssignments.forEach((assignment: any) => {
    const isSelf = userIdsEqualForSelfEval(assignment.evaluator_id, assignment.target_id)
    if (isSelf) return
    const assignmentResponses = (responses || []).filter((r: any) => r.assignment_id === assignment.id)
    assignmentResponses.forEach((resp: any) => {
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
  if (!top3.length) {
    // No weak areas; still create a minimal plan (optional) — here we skip to avoid noise
    return { ok: true as const, plan: null, tasks: [] as any[] }
  }

  const createdAt = defaultNowIso()
  const dueAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const title = params.lang === 'fr' ? 'Plan d’action' : params.lang === 'en' ? 'Action Plan' : 'Eylem Planı'
  const orgId = String(u.organization_id)
  const dept = u.department ? String(u.department) : null
  // YAZMA (hibrit): pg açıksa withActor → RLS org-context içinde parametreli INSERT ... returning.
  // org izolasyonu 2 katmanlı: (1) plan user_id=uid=s.uid (kendi planı) + organization_id=kendi org'u;
  // (2) withActor RLS FORCE (app.current_org). kolon adları koddan (sabit); değerler $N parametreli.
  let inserted: any = null
  let insErr: any = null
  if (isPgEnabled()) {
    try {
      inserted = await withActor(buildActor(session), async (c) => {
        const r = await c.query(
          `insert into action_plans (organization_id, period_id, user_id, department, source, title, status, created_at, updated_at, due_at)
           values ($1, $2, $3, $4, 'development', $5, 'draft', $6, $7, $8)
           returning id, status, created_at, started_at, due_at, completed_at`,
          [orgId, periodId, uid, dept, title, createdAt, createdAt, dueAt]
        )
        return r.rows[0] || null
      })
    } catch (e) {
      insErr = e
    }
  } else {
    const res = await supabase
      .from('action_plans')
      .insert({
        organization_id: orgId,
        period_id: periodId,
        user_id: uid,
        department: dept,
        source: 'development',
        title,
        status: 'draft',
        created_at: createdAt,
        updated_at: createdAt,
        due_at: dueAt,
      })
      .select('id,status,created_at,started_at,due_at,completed_at')
      .single()
    inserted = res.data
    insErr = res.error
  }
  if (insErr || !inserted?.id) return { ok: false as const, error: (insErr as any)?.message || 'Failed to create plan' }

  const tasksPayload = top3.map((x, idx) => ({
    plan_id: inserted.id,
    sort_order: idx + 1,
    area: String(x.name || ''),
    description:
      params.lang === 'fr'
        ? `Démarrer un plan de développement pour « ${x.name} »`
        : params.lang === 'en'
          ? `Start a development plan for "${x.name}"`
          : `"${x.name}" alanında gelişim planı başlat`,
    status: 'pending' as TaskStatus,
    baseline_score: Number(x.avg || 0) || null,
    target_score: Number(x.avg || 0) ? Math.min(5, Number(x.avg || 0) + 1) : null,
    created_at: createdAt,
    updated_at: createdAt,
  }))

  // YAZMA (hibrit): tasks çoklu satır insert. plan_id = az önce oluşturulan plan → org izole.
  // kolon adları koddan (sabit); değerler $N parametreli.
  let tInsErr: any = null
  if (isPgEnabled()) {
    try {
      await withActor(buildActor(session), async (c) => {
        const cols = '(plan_id, sort_order, area, description, status, baseline_score, target_score, created_at, updated_at)'
        const valuesSql: string[] = []
        const qp: unknown[] = []
        for (const t of tasksPayload) {
          const base = qp.length
          valuesSql.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`)
          qp.push(t.plan_id, t.sort_order, t.area, t.description, t.status, t.baseline_score, t.target_score, t.created_at, t.updated_at)
        }
        await c.query(`insert into action_plan_tasks ${cols} values ${valuesSql.join(', ')}`, qp)
      })
    } catch (e) {
      tInsErr = e
    }
  } else {
    const res = await supabase.from('action_plan_tasks').insert(tasksPayload)
    tInsErr = res.error
  }
  if (tInsErr) return { ok: false as const, error: (tInsErr as any)?.message || 'Failed to create tasks' }

  const { data: tasks, error: tErr } = isPgEnabled()
    ? await pgRead(
        `select id, sort_order, area, description, status, planned_at, learning_started_at, baseline_score, target_score, training_id, ai_suggestion, ai_text, ai_generated_at, ai_model, started_at, done_at
           from action_plan_tasks where plan_id = $1 order by sort_order asc`,
        [inserted.id]
      )
    : await supabase
        .from('action_plan_tasks')
        .select(
          'id, sort_order, area, description, status, planned_at, learning_started_at, baseline_score, target_score, training_id, ai_suggestion, ai_text, ai_generated_at, ai_model, started_at, done_at'
        )
        .eq('plan_id', inserted.id)
        .order('sort_order', { ascending: true })
  if (tErr) return { ok: false as const, error: (tErr as any)?.message || 'Failed to load tasks' }

  return { ok: true as const, plan: inserted, tasks: tasks || [] }
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const msg = (tr: string, en: string, fr: string) => (lang === 'fr' ? fr : lang === 'en' ? en : tr)
  if (!s?.uid) return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 401 })

  const rl = await rateLimitByUser(req, 'dashboard:action-plans:get', s.uid, 60, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: msg('Çok fazla istek yapıldı', 'Too many requests', 'Trop de requêtes') },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase)
    return NextResponse.json({ success: false, error: msg('Supabase yapılandırması eksik', 'Supabase configuration missing', 'Configuration Supabase manquante') }, { status: 503 })

  const periodId = (url.searchParams.get('period_id') || '').trim()

  const pickPeriodName = (p: any) => {
    if (!p) return ''
    if (lang === 'fr') return String(p.name_fr || p.name || '')
    if (lang === 'en') return String(p.name_en || p.name || '')
    return String(p.name || '')
  }

  // Period list from completed assignments (same as dashboard/development) — OKUMA fallback
  const { data: assignments, error: aErr } = isPgEnabled()
    ? await pgRead(
        `select ea.id, ea.status,
                case when ep.id is not null then jsonb_build_object('id', ep.id, 'name', ep.name, 'name_en', ep.name_en, 'name_fr', ep.name_fr, 'assessment_kind', ep.assessment_kind) else null end as evaluation_periods
           from evaluation_assignments ea
           left join evaluation_periods ep on ep.id = ea.period_id
          where ea.target_id = $1 and ea.status = 'completed'
          order by ea.completed_at desc`,
        [s.uid]
      )
    : await supabase
        .from('evaluation_assignments')
        .select('id, status, evaluation_periods(id, name, name_en, name_fr, assessment_kind)')
        .eq('target_id', s.uid)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
  if (aErr) return NextResponse.json({ success: false, error: (aErr as any).message || msg('Veri alınamadı', 'Failed to load data', 'Impossible de charger les données') }, { status: 400 })

  const uniq: { id: string; name: string }[] = []
  const seen = new Set<string>()
  const developmentAssignments = (assignments || []).filter((a: any) =>
    isPersonalDevelopmentPeriod(a?.evaluation_periods?.assessment_kind)
  )
  ;developmentAssignments.forEach((a: any) => {
    const pid = a?.evaluation_periods?.id
    const pname = pickPeriodName(a?.evaluation_periods)
    if (!pid || !pname) return
    if (seen.has(pid)) return
    seen.add(pid)
    uniq.push({ id: pid, name: pname })
  })

  if (!periodId) {
    // Best-effort merge plan status into period list
    const planByPeriod = new Map<string, any>()
    try {
      const ids = uniq.map((p) => p.id)
      if (ids.length) {
        const { data: plans } = isPgEnabled()
          ? await pgRead(
              `select period_id, status, due_at, started_at, completed_at from action_plans
                where user_id = $1 and source = 'development' and period_id = any($2)`,
              [s.uid, ids]
            )
          : await supabase
              .from('action_plans')
              .select('period_id,status,due_at,started_at,completed_at')
              .eq('user_id', s.uid)
              .eq('source', 'development')
              .in('period_id', ids)
        ;(plans || []).forEach((p: any) => {
          if (p?.period_id) planByPeriod.set(String(p.period_id), p)
        })
      }
    } catch {
      // ignore if table missing
    }

    return NextResponse.json({
      success: true,
      periods: uniq.map((p) => {
        const x = planByPeriod.get(p.id)
        return { ...p, plan: x ? { status: x.status, due_at: x.due_at, started_at: x.started_at, completed_at: x.completed_at } : null }
      }),
    })
  }

  const ensured = await ensurePlanAndTasks({ supabase, uid: s.uid, periodId, lang, session: s })
  if (!ensured.ok) {
    return NextResponse.json({ success: false, error: ensured.error || msg('Eylem planı alınamadı', 'Failed to load action plan', 'Impossible de charger le plan d’action') }, { status: 400 })
  }

  // Find the period name from assignments list (fallback to empty)
  const periodName = pickPeriodName((assignments || []).find((a: any) => String(a?.evaluation_periods?.id || '') === periodId)?.evaluation_periods)

  return NextResponse.json({ success: true, periods: uniq, periodName, plan: ensured.plan, tasks: ensured.tasks })
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const msg = (tr: string, en: string, fr: string) => (lang === 'fr' ? fr : lang === 'en' ? en : tr)
  if (!s?.uid) return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 401 })

  const rl = await rateLimitByUser(req, 'dashboard:action-plans:post', s.uid, 60, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: msg('Çok fazla istek yapıldı', 'Too many requests', 'Trop de requêtes') }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: msg('Supabase yapılandırması eksik', 'Supabase configuration missing', 'Configuration Supabase manquante') }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as any
  const planId = String(body.plan_id || '').trim()
  const taskId = String(body.task_id || '').trim()
  const action = String(body.action || '').trim()

  if (!planId) return NextResponse.json({ success: false, error: msg('plan_id gerekli', 'plan_id required', 'plan_id requis') }, { status: 400 })

  // Verify ownership (OKUMA fallback; id=$1 birebir)
  const { data: plan, error: pErr } = isPgEnabled()
    ? await pgReadOne('select id, user_id, status from action_plans where id = $1 limit 1', [planId])
    : await supabase.from('action_plans').select('id,user_id,status').eq('id', planId).maybeSingle()
  if (pErr || !plan) return NextResponse.json({ success: false, error: msg('Plan bulunamadı', 'Plan not found', 'Plan introuvable') }, { status: 404 })
  if (String((plan as any).user_id) !== String(s.uid)) return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 403 })

  const now = defaultNowIso()

  // YAZMA (hibrit): pg açıksa withActor → RLS org-context içinde parametreli UPDATE.
  // org/kullanıcı izolasyonu 2 katmanlı: (1) yukarıda plan.user_id === s.uid ownership (403);
  // (2) withActor RLS FORCE (app.current_org). WHERE id=$N birebir; kolon adları koddan (sabit).
  if (action === 'start_plan') {
    if (isPgEnabled()) {
      try {
        await withActor(buildActor(s), async (c) => {
          await c.query('update action_plans set status = $1, started_at = $2, updated_at = $3 where id = $4', ['in_progress', now, now, planId])
        })
      } catch (e: any) {
        return NextResponse.json({ success: false, error: String(e?.message || e) || msg('Plan güncellenemedi', 'Failed to update plan', 'Impossible de mettre à jour le plan') }, { status: 400 })
      }
    } else {
      const patch: any = { status: 'in_progress' as PlanStatus, started_at: now, updated_at: now }
      const { error } = await supabase.from('action_plans').update(patch).eq('id', planId)
      if (error) return NextResponse.json({ success: false, error: (error as any).message || msg('Plan güncellenemedi', 'Failed to update plan', 'Impossible de mettre à jour le plan') }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'complete_plan') {
    if (isPgEnabled()) {
      try {
        await withActor(buildActor(s), async (c) => {
          await c.query('update action_plans set status = $1, completed_at = $2, updated_at = $3 where id = $4', ['completed', now, now, planId])
        })
      } catch (e: any) {
        return NextResponse.json({ success: false, error: String(e?.message || e) || msg('Plan güncellenemedi', 'Failed to update plan', 'Impossible de mettre à jour le plan') }, { status: 400 })
      }
    } else {
      const patch: any = { status: 'completed' as PlanStatus, completed_at: now, updated_at: now }
      const { error } = await supabase.from('action_plans').update(patch).eq('id', planId)
      if (error) return NextResponse.json({ success: false, error: (error as any).message || msg('Plan güncellenemedi', 'Failed to update plan', 'Impossible de mettre à jour le plan') }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'update_task') {
    const nextStatus = String(body.status || '').trim() as TaskStatus
    if (!taskId) return NextResponse.json({ success: false, error: msg('task_id gerekli', 'task_id required', 'task_id requis') }, { status: 400 })
    if (nextStatus !== 'pending' && nextStatus !== 'started' && nextStatus !== 'done') {
      return NextResponse.json({ success: false, error: msg('Geçersiz durum', 'Invalid status', 'Statut invalide') }, { status: 400 })
    }

    // Verify task belongs to plan (OKUMA fallback)
    const { data: task, error: tErr } = isPgEnabled()
      ? await pgReadOne('select id, plan_id, status from action_plan_tasks where id = $1 limit 1', [taskId])
      : await supabase.from('action_plan_tasks').select('id,plan_id,status').eq('id', taskId).maybeSingle()
    if (tErr || !task) return NextResponse.json({ success: false, error: msg('Görev bulunamadı', 'Task not found', 'Tâche introuvable') }, { status: 404 })
    if (String((task as any).plan_id) !== String(planId)) return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 403 })

    const patch: any = { status: nextStatus, updated_at: now }
    if (nextStatus === 'started') patch.started_at = now
    if (nextStatus === 'done') patch.done_at = now
    if (nextStatus === 'pending') {
      patch.started_at = null
      patch.done_at = null
    }

    // YAZMA (hibrit): task update; ownership plan.user_id===s.uid (yukarıda) + task.plan_id===planId.
    // patch anahtarları koddan (status/updated_at/started_at/done_at) → enjeksiyon yok; değerler $N.
    if (isPgEnabled()) {
      try {
        await withActor(buildActor(s), async (c) => {
          const setCols: string[] = []
          const qp: unknown[] = []
          for (const [col, val] of Object.entries(patch)) {
            qp.push(val)
            setCols.push(`${col} = $${qp.length}`)
          }
          qp.push(taskId)
          await c.query(`update action_plan_tasks set ${setCols.join(', ')} where id = $${qp.length}`, qp)
        })
      } catch (e: any) {
        return NextResponse.json({ success: false, error: String(e?.message || e) || msg('Görev güncellenemedi', 'Failed to update task', 'Impossible de mettre à jour la tâche') }, { status: 400 })
      }
    } else {
      const { error: updErr } = await supabase.from('action_plan_tasks').update(patch).eq('id', taskId)
      if (updErr) return NextResponse.json({ success: false, error: (updErr as any).message || msg('Görev güncellenemedi', 'Failed to update task', 'Impossible de mettre à jour la tâche') }, { status: 400 })
    }

    // If any task is started/done, auto-start the plan (best-effort). WHERE id=$N and status='draft' birebir.
    try {
      if (nextStatus === 'started' || nextStatus === 'done') {
        if (isPgEnabled()) {
          await withActor(buildActor(s), async (c) => {
            await c.query("update action_plans set status = $1, started_at = $2, updated_at = $3 where id = $4 and status = 'draft'", ['in_progress', now, now, planId])
          })
        } else {
          await supabase.from('action_plans').update({ status: 'in_progress', started_at: now, updated_at: now }).eq('id', planId).eq('status', 'draft')
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'plan_training') {
    if (!taskId) return NextResponse.json({ success: false, error: msg('task_id gerekli', 'task_id required', 'task_id requis') }, { status: 400 })
    const { data: task, error: tErr } = isPgEnabled()
      ? await pgReadOne('select id, plan_id, planned_at from action_plan_tasks where id = $1 limit 1', [taskId])
      : await supabase.from('action_plan_tasks').select('id,plan_id,planned_at').eq('id', taskId).maybeSingle()
    if (tErr || !task) return NextResponse.json({ success: false, error: msg('Görev bulunamadı', 'Task not found', 'Tâche introuvable') }, { status: 404 })
    if (String((task as any).plan_id) !== String(planId)) return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 403 })

    // YAZMA (hibrit): planned_at update; ownership (plan.user_id + task.plan_id). kolonlar koddan; değerler $N.
    if (isPgEnabled()) {
      try {
        await withActor(buildActor(s), async (c) => {
          await c.query('update action_plan_tasks set planned_at = $1, updated_at = $2 where id = $3', [now, now, taskId])
        })
      } catch (e: any) {
        return NextResponse.json({ success: false, error: String(e?.message || e) || msg('Görev güncellenemedi', 'Failed to update task', 'Impossible de mettre à jour la tâche') }, { status: 400 })
      }
    } else {
      const { error: updErr } = await supabase
        .from('action_plan_tasks')
        .update({ planned_at: now, updated_at: now })
        .eq('id', taskId)
      if (updErr) return NextResponse.json({ success: false, error: (updErr as any)?.message || msg('Görev güncellenemedi', 'Failed to update task', 'Impossible de mettre à jour la tâche') }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'start_learning') {
    if (!taskId) return NextResponse.json({ success: false, error: msg('task_id gerekli', 'task_id required', 'task_id requis') }, { status: 400 })
    const { data: task, error: tErr } = isPgEnabled()
      ? await pgReadOne('select id, plan_id, status from action_plan_tasks where id = $1 limit 1', [taskId])
      : await supabase.from('action_plan_tasks').select('id,plan_id,status').eq('id', taskId).maybeSingle()
    if (tErr || !task) return NextResponse.json({ success: false, error: msg('Görev bulunamadı', 'Task not found', 'Tâche introuvable') }, { status: 404 })
    if (String((task as any).plan_id) !== String(planId)) return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 403 })

    // YAZMA (hibrit): task update; ownership (plan.user_id + task.plan_id). kolonlar koddan; değerler $N.
    if (isPgEnabled()) {
      try {
        await withActor(buildActor(s), async (c) => {
          await c.query('update action_plan_tasks set learning_started_at = $1, status = $2, started_at = $3, updated_at = $4 where id = $5', [now, 'started', now, now, taskId])
        })
      } catch (e: any) {
        return NextResponse.json({ success: false, error: String(e?.message || e) || msg('Görev güncellenemedi', 'Failed to update task', 'Impossible de mettre à jour la tâche') }, { status: 400 })
      }
    } else {
      const patch: any = { learning_started_at: now, status: 'started', started_at: now, updated_at: now }
      const { error: updErr } = await supabase.from('action_plan_tasks').update(patch).eq('id', taskId)
      if (updErr) return NextResponse.json({ success: false, error: (updErr as any)?.message || msg('Görev güncellenemedi', 'Failed to update task', 'Impossible de mettre à jour la tâche') }, { status: 400 })
    }
    // best-effort auto-start plan. WHERE id=$N and status='draft' birebir.
    try {
      if (isPgEnabled()) {
        await withActor(buildActor(s), async (c) => {
          await c.query("update action_plans set status = $1, started_at = $2, updated_at = $3 where id = $4 and status = 'draft'", ['in_progress', now, now, planId])
        })
      } else {
        await supabase.from('action_plans').update({ status: 'in_progress', started_at: now, updated_at: now }).eq('id', planId).eq('status', 'draft')
      }
    } catch {}
    return NextResponse.json({ success: true })
  }

  if (action === 'mark_done') {
    if (!taskId) return NextResponse.json({ success: false, error: msg('task_id gerekli', 'task_id required', 'task_id requis') }, { status: 400 })
    const { data: task, error: tErr } = isPgEnabled()
      ? await pgReadOne('select id, plan_id from action_plan_tasks where id = $1 limit 1', [taskId])
      : await supabase.from('action_plan_tasks').select('id,plan_id').eq('id', taskId).maybeSingle()
    if (tErr || !task) return NextResponse.json({ success: false, error: msg('Görev bulunamadı', 'Task not found', 'Tâche introuvable') }, { status: 404 })
    if (String((task as any).plan_id) !== String(planId)) return NextResponse.json({ success: false, error: msg('Yetkisiz', 'Unauthorized', 'Non autorisé') }, { status: 403 })

    // YAZMA (hibrit): task done update; ownership (plan.user_id + task.plan_id). kolonlar koddan; değerler $N.
    if (isPgEnabled()) {
      try {
        await withActor(buildActor(s), async (c) => {
          await c.query('update action_plan_tasks set status = $1, done_at = $2, updated_at = $3 where id = $4', ['done', now, now, taskId])
        })
      } catch (e: any) {
        return NextResponse.json({ success: false, error: String(e?.message || e) || msg('Görev güncellenemedi', 'Failed to update task', 'Impossible de mettre à jour la tâche') }, { status: 400 })
      }
    } else {
      const { error: updErr } = await supabase.from('action_plan_tasks').update({ status: 'done', done_at: now, updated_at: now }).eq('id', taskId)
      if (updErr) return NextResponse.json({ success: false, error: (updErr as any)?.message || msg('Görev güncellenemedi', 'Failed to update task', 'Impossible de mettre à jour la tâche') }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: false, error: msg('Geçersiz işlem', 'Invalid action', 'Action invalide') }, { status: 400 })
}

