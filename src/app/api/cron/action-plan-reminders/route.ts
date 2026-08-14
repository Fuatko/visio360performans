import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTransactionalEmail } from '@/lib/server/email'
import { isPgEnabled } from '@/lib/db'
import { pgRead } from '@/lib/server/pg-read'
import { withActor } from '@/lib/server/secure-query'

// Cron SİSTEM aktörü: kullanıcı session'ı yok, cron secret ile tetiklenir, TÜM org'larda çalışır.
// super_admin + orgId:null → RLS bypass (sistem işi = bugünkü service-role davranışı).
const SYSTEM_ACTOR = { role: 'super_admin' as const, orgId: null, userId: 'system' }

export const runtime = 'nodejs'

function isAuthorized(req: NextRequest) {
  // Vercel Cron adds this header
  const vercelCron = req.headers.get('x-vercel-cron')
  if (vercelCron) return true

  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) return false

  const bearer = (req.headers.get('authorization') || '').trim()
  if (bearer.toLowerCase().startsWith('bearer ')) {
    if (bearer.slice(7).trim() === secret) return true
  }

  const url = new URL(req.url)
  if ((url.searchParams.get('secret') || '').trim() === secret) return true

  return false
}

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

function baseUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
  if (explicit) return explicit
  const vercel = (process.env.VERCEL_URL || '').trim()
  if (vercel) return `https://${vercel}`
  return ''
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ ok: false, error: 'Supabase configuration missing' }, { status: 503 })

  const now = Date.now()
  const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString()

  const pick = (lang: string, tr: string, en: string, fr: string) =>
    lang === 'fr' ? fr : lang === 'en' ? en : tr

  const computeTop3WeakAreas = async (uid: string, periodId: string) => {
    // Use the same logic as dashboard action plan generation:
    // peer average score < 3.5 → improvement areas.
    const { data: assignments, error: aErr } = isPgEnabled()
      ? await pgRead(
          "select id, evaluator_id, target_id from evaluation_assignments where target_id = $1 and period_id = $2 and status = 'completed' order by completed_at desc",
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

  // 1) Backfill missing plans (so reminder works even if user never opened the page)
  const { data: recentCompleted, error: cErr } = isPgEnabled()
    ? await pgRead(
        "select target_id, period_id, completed_at from evaluation_assignments where status = 'completed' and period_id is not null and target_id is not null and completed_at < $1 order by completed_at desc limit 1500",
        [tenDaysAgo]
      )
    : await supabase
        .from('evaluation_assignments')
        .select('target_id, period_id, completed_at')
        .eq('status', 'completed')
        .not('period_id', 'is', null)
        .not('target_id', 'is', null)
        .lt('completed_at', tenDaysAgo)
        .order('completed_at', { ascending: false })
        .limit(1500)

  if (cErr) {
    // If eval tables are missing/misconfigured, don't break the cron completely
    console.error('cron: completed assignments query failed', (cErr as any)?.message || cErr)
  }

  const latestByKey = new Map<string, string>() // key -> latest completed_at
  ;(recentCompleted || []).forEach((r: any) => {
    const uid = String(r.target_id || '')
    const pid = String(r.period_id || '')
    const doneAt = String(r.completed_at || '')
    if (!uid || !pid || !doneAt) return
    const k = `${uid}::${pid}`
    const cur = latestByKey.get(k)
    if (!cur || new Date(doneAt).getTime() > new Date(cur).getTime()) latestByKey.set(k, doneAt)
  })

  const keys = Array.from(latestByKey.keys()).slice(0, 250)
  const userIds = Array.from(new Set(keys.map((k) => k.split('::')[0]).filter(Boolean)))
  const periodIds = Array.from(new Set(keys.map((k) => k.split('::')[1]).filter(Boolean)))

  const existingKeys = new Set<string>()
  if (userIds.length && periodIds.length) {
    try {
      const { data: existingPlans } = isPgEnabled()
        ? await pgRead(
            "select user_id, period_id, source from action_plans where source = 'development' and user_id = any($1) and period_id = any($2) limit 2000",
            [userIds, periodIds]
          )
        : await supabase
            .from('action_plans')
            .select('user_id, period_id, source')
            .eq('source', 'development')
            .in('user_id', userIds)
            .in('period_id', periodIds)
            .limit(2000)
      ;(existingPlans || []).forEach((p: any) => {
        const uid = String(p.user_id || '')
        const pid = String(p.period_id || '')
        if (uid && pid) existingKeys.add(`${uid}::${pid}`)
      })
    } catch {
      // ignore
    }
  }

  const userMap = new Map<string, any>()
  const periodMap = new Map<string, any>()
  const orgMap = new Map<string, any>()

  if (userIds.length) {
    const { data: users } = isPgEnabled()
      ? await pgRead('select id, name, email, preferred_language, organization_id, department, status from users where id = any($1)', [userIds])
      : await supabase.from('users').select('id,name,email,preferred_language,organization_id,department,status').in('id', userIds)
    ;(users || []).forEach((u: any) => userMap.set(String(u.id), u))
  }
  if (periodIds.length) {
    const { data: periods } = isPgEnabled()
      ? await pgRead('select id, name, name_en, name_fr from evaluation_periods where id = any($1)', [periodIds])
      : await supabase.from('evaluation_periods').select('id,name,name_en,name_fr').in('id', periodIds)
    ;(periods || []).forEach((p: any) => periodMap.set(String(p.id), p))
  }
  const orgIds = Array.from(
    new Set(Array.from(userMap.values()).map((u: any) => String(u.organization_id || '')).filter(Boolean))
  )
  if (orgIds.length) {
    const { data: orgs } = isPgEnabled()
      ? await pgRead('select id, name from organizations where id = any($1)', [orgIds])
      : await supabase.from('organizations').select('id,name').in('id', orgIds)
    ;(orgs || []).forEach((o: any) => orgMap.set(String(o.id), o))
  }

  const backfilled: any[] = []
  for (const k of keys) {
    if (existingKeys.has(k)) continue
    const [uid, pid] = k.split('::')
    const u = userMap.get(uid)
    if (!u || u.status === 'inactive') continue
    if (!u.organization_id) continue

    const doneAt = latestByKey.get(k) || tenDaysAgo
    const lang = String(u.preferred_language || 'tr').toLowerCase()
    const areasRes = await computeTop3WeakAreas(uid, pid)
    if (!areasRes.ok || !areasRes.areas.length) continue

    const createdAt = doneAt
    const dueAt = new Date(new Date(doneAt).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()

    const title = pick(lang, 'Eylem Planı', 'Action Plan', 'Plan d’action')
    // YAZMA (hibrit): sistem aktörü (super_admin/orgId:null) → RLS bypass, TÜM org'larda çalışır.
    // Etkilenen satır birebir: aynı organization_id/period_id/user_id/source/status alanları.
    let planRow: any = null
    let insErr: any = null
    if (isPgEnabled()) {
      try {
        planRow = await withActor(SYSTEM_ACTOR, async (c) => {
          const r = await c.query(
            `insert into action_plans (organization_id, period_id, user_id, department, source, title, status, created_at, updated_at, due_at)
               values ($1, $2, $3, $4, 'development', $5, 'draft', $6, $7, $8)
               returning id, period_id, user_id, created_at, due_at, status, reminder_first_sent_at`,
            [String(u.organization_id), pid, uid, u.department ? String(u.department) : null, title, createdAt, createdAt, dueAt]
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
          organization_id: String(u.organization_id),
          period_id: pid,
          user_id: uid,
          department: u.department ? String(u.department) : null,
          source: 'development',
          title,
          status: 'draft',
          created_at: createdAt,
          updated_at: createdAt,
          due_at: dueAt,
        })
        .select('id, period_id, user_id, created_at, due_at, status, reminder_first_sent_at')
        .single()
      planRow = res.data
      insErr = res.error
    }
    if (insErr || !planRow?.id) continue

    const tasksPayload = areasRes.areas.map((x, idx) => ({
      plan_id: planRow.id,
      sort_order: idx + 1,
      area: String(x.name || ''),
      description: pick(lang, `"${x.name}" alanında gelişim planı başlat`, `Start a development plan for "${x.name}"`, `Démarrer un plan de développement pour « ${x.name} »`),
      status: 'pending',
      baseline_score: Number(x.avg || 0) || null,
      target_score: Number(x.avg || 0) ? Math.min(5, Number(x.avg || 0) + 1) : null,
      created_at: createdAt,
      updated_at: createdAt,
    }))
    try {
      if (isPgEnabled()) {
        await withActor(SYSTEM_ACTOR, async (c) => {
          const params: unknown[] = []
          const valueTuples = tasksPayload.map((t) => {
            const b = params.length
            params.push(t.plan_id, t.sort_order, t.area, t.description, t.status, t.baseline_score, t.target_score, t.created_at, t.updated_at)
            return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9})`
          })
          await c.query(
            `insert into action_plan_tasks (plan_id, sort_order, area, description, status, baseline_score, target_score, created_at, updated_at) values ${valueTuples.join(', ')}`,
            params
          )
        })
      } else {
        await supabase.from('action_plan_tasks').insert(tasksPayload)
      }
    } catch {
      // ignore
    }

    backfilled.push({
      ...planRow,
      user: u,
      period: periodMap.get(pid) || null,
      org: orgMap.get(String(u.organization_id)) || null,
    })
  }

  // 2) Fetch draft plans older than 10 days, not started, not reminded yet.
  const { data: plans, error } = isPgEnabled()
    ? await pgRead(
        `select ap.id, ap.period_id, ap.user_id, ap.created_at, ap.due_at, ap.status, ap.reminder_first_sent_at,
                case when u.id is not null then jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'preferred_language', u.preferred_language) else null end as user,
                case when ep.id is not null then jsonb_build_object('id', ep.id, 'name', ep.name, 'name_en', ep.name_en, 'name_fr', ep.name_fr) else null end as period,
                case when o.id is not null then jsonb_build_object('id', o.id, 'name', o.name) else null end as org
           from action_plans ap
           left join users u on u.id = ap.user_id
           left join evaluation_periods ep on ep.id = ap.period_id
           left join organizations o on o.id = ap.organization_id
          where ap.status = 'draft' and ap.started_at is null and ap.reminder_first_sent_at is null and ap.created_at < $1
          limit 200`,
        [tenDaysAgo]
      )
    : await supabase
        .from('action_plans')
        .select(
          `
      id, period_id, user_id, created_at, due_at, status, reminder_first_sent_at,
      user:users(id,name,email,preferred_language),
      period:evaluation_periods(id,name,name_en,name_fr),
      org:organizations(id,name)
    `
        )
        .eq('status', 'draft')
        .is('started_at', null)
        .is('reminder_first_sent_at', null)
        .lt('created_at', tenDaysAgo)
        .limit(200)

  if (error) {
    const msg = String((error as any)?.message || '')
    if (msg.includes('action_plans') && msg.toLowerCase().includes('relation')) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'action_plans table missing' })
    }
    return NextResponse.json({ ok: false, error: msg || 'Query failed' }, { status: 400 })
  }

  const app = baseUrl()
  let sent = 0
  let failed = 0
  const details: Array<{ plan_id: string; ok: boolean; provider?: string; message_id?: string; error?: string }> = []

  const toRemind = [...(plans || []), ...backfilled]
  const remindedIds = new Set<string>()

  for (const p of toRemind) {
    const planId = String((p as any).id || '')
    if (!planId || remindedIds.has(planId)) continue
    remindedIds.add(planId)

    const user = (p as any).user || null
    const org = (p as any).org || null
    const period = (p as any).period || null
    const email = String(user?.email || '').trim()
    if (!email) continue

    const lang = String(user?.preferred_language || 'tr').toLowerCase()
    const periodName =
      lang === 'fr' ? String(period?.name_fr || period?.name || '') : lang === 'en' ? String(period?.name_en || period?.name || '') : String(period?.name || '')

    const subject = pick(lang, 'Eylem planınızı başlatmayı unutmayın', 'Don’t forget to start your action plan', 'N’oubliez pas de démarrer votre plan d’action')
    const toName = String(user?.name || '').trim() || pick(lang, 'Kullanıcı', 'User', 'Utilisateur')
    const orgName = String(org?.name || '').trim()
    const link = app ? `${app}/dashboard/action-plans${p.period_id ? `?period_id=${encodeURIComponent(String(p.period_id))}` : ''}` : ''

    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 12px 0;color:#111827;">${subject}</h2>
        <p style="margin:0 0 14px 0;color:#374151;">
          ${pick(lang, 'Merhaba', 'Hi', 'Bonjour')} <strong>${toName}</strong>,
        </p>
        <p style="margin:0 0 14px 0;color:#374151;">
          ${pick(
            lang,
            'Gelişim eylem planınız henüz başlatılmadı. Lütfen planınızı oluşturup harekete geçirin.',
            'Your development action plan hasn’t been started yet. Please create your plan and take action.',
            'Votre plan d’action de développement n’a pas encore démarré. Merci de le compléter et de passer à l’action.'
          )}
        </p>
        ${periodName ? `<p style="margin:0 0 14px 0;color:#6b7280;">${pick(lang, 'Dönem', 'Period', 'Période')}: <strong>${periodName}</strong></p>` : ''}
        ${orgName ? `<p style="margin:0 0 14px 0;color:#6b7280;">${pick(lang, 'Kurum', 'Organization', 'Organisation')}: <strong>${orgName}</strong></p>` : ''}
        ${
          link
            ? `<p style="margin:18px 0 0 0;">
                 <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:600;">
                   ${pick(lang, 'Eylem Planına Git', 'Open Action Plan', 'Ouvrir le plan')}
                 </a>
               </p>`
            : ''
        }
        <p style="margin:18px 0 0 0;color:#9ca3af;font-size:12px;">
          ${pick(lang, 'Bu otomatik bir hatırlatmadır.', 'This is an automated reminder.', 'Ceci est un rappel automatique.')}
        </p>
      </div>
    `

    const res = await sendTransactionalEmail({ to: email, subject, html })
    if (res.ok) {
      sent += 1
      details.push({ plan_id: planId, ok: true, provider: res.provider, message_id: res.message_id })
      try {
        // YAZMA (hibrit): sistem aktörü → RLS bypass. Etkilenen küme birebir: where id = $planId.
        if (isPgEnabled()) {
          const nowIso = new Date().toISOString()
          await withActor(SYSTEM_ACTOR, async (c) => {
            await c.query(
              'update action_plans set reminder_first_sent_at = $1, reminder_last_sent_at = $2, updated_at = $3 where id = $4',
              [nowIso, nowIso, nowIso, planId]
            )
          })
        } else {
          await supabase
            .from('action_plans')
            .update({ reminder_first_sent_at: new Date().toISOString(), reminder_last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', planId)
        }
      } catch {
        // ignore
      }
    } else {
      failed += 1
      details.push({ plan_id: planId, ok: false, provider: (res as any).provider, error: (res as any).error || 'send failed' })
    }
  }

  return NextResponse.json({
    ok: true,
    checked: (plans || []).length,
    backfilled: backfilled.length,
    sent,
    failed,
    details: details.slice(0, 50),
  })
}

