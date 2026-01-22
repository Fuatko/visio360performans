import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { sendTransactionalEmail } from '@/lib/server/email'

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

function baseUrl() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
  if (explicit) return explicit
  const vercel = (process.env.VERCEL_URL || '').trim()
  if (vercel) return `https://${vercel}`
  return ''
}

function pick(lang: string, tr: string, en: string, fr: string) {
  return lang === 'fr' ? fr : lang === 'en' ? en : tr
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:action-plans:remind', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as any
  const planId = String(body.plan_id || '').trim()
  const force = Boolean(body.force)
  if (!planId) return NextResponse.json({ success: false, error: 'plan_id gerekli' }, { status: 400 })

  // Load plan + user + period + org, and enforce KVKK for org_admin
  const { data: plan, error: pErr } = await supabase
    .from('action_plans')
    .select(
      `
      id, organization_id, period_id, user_id, status, started_at, due_at,
      reminder_last_sent_at, reminder_first_sent_at,
      user:users(id,name,email,preferred_language),
      period:evaluation_periods(id,name,name_en,name_fr),
      org:organizations(id,name)
    `
    )
    .eq('id', planId)
    .maybeSingle()
  if (pErr || !plan) return NextResponse.json({ success: false, error: 'Plan bulunamadı' }, { status: 404 })

  if (s.role === 'org_admin' && String((plan as any).organization_id || '') !== String(s.org_id || '')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 403 })
  }

  // Only allow reminders for not-started plans by default
  const status = String((plan as any).status || 'draft')
  const startedAt = (plan as any).started_at
  if (!force && (status !== 'draft' || startedAt)) {
    return NextResponse.json({ success: false, error: 'Sadece başlatılmamış planlar için hatırlatma gönderilebilir' }, { status: 400 })
  }

  // Anti-spam: block if sent in last 12h unless force
  const last = (plan as any).reminder_last_sent_at ? new Date(String((plan as any).reminder_last_sent_at)).getTime() : 0
  if (!force && last && Date.now() - last < 12 * 60 * 60 * 1000) {
    return NextResponse.json({ success: false, error: 'Hatırlatma çok yakın zamanda gönderildi' }, { status: 429 })
  }

  const u = (plan as any).user || {}
  const email = String(u.email || '').trim()
  if (!email) return NextResponse.json({ success: false, error: 'Kullanıcı email yok' }, { status: 400 })

  const lang = String(u.preferred_language || 'tr').toLowerCase()
  const period = (plan as any).period || null
  const org = (plan as any).org || null

  const periodName =
    lang === 'fr' ? String(period?.name_fr || period?.name || '') : lang === 'en' ? String(period?.name_en || period?.name || '') : String(period?.name || '')
  const orgName = String(org?.name || '').trim()
  const toName = String(u.name || '').trim() || pick(lang, 'Kullanıcı', 'User', 'Utilisateur')

  const app = baseUrl()
  const link = app ? `${app}/dashboard/action-plans${(plan as any).period_id ? `?period_id=${encodeURIComponent(String((plan as any).period_id))}` : ''}` : ''

  const subject = pick(lang, 'Eylem planınızı başlatmayı unutmayın', 'Don’t forget to start your action plan', 'N’oubliez pas de démarrer votre plan d’action')
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
  if (!res.ok) {
    return NextResponse.json({ success: false, error: 'Email gönderilemedi', detail: (res as any).detail || (res as any).error || 'unknown' }, { status: 502 })
  }

  const nowIso = new Date().toISOString()
  try {
    await supabase
      .from('action_plans')
      .update({
        reminder_first_sent_at: (plan as any).reminder_first_sent_at || nowIso,
        reminder_last_sent_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', planId)
  } catch {
    // ignore
  }

  return NextResponse.json({ success: true, provider: res.provider, message_id: res.message_id })
}

