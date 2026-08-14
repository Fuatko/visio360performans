import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isPgEnabled } from '@/lib/db'
import { pgRead, pgReadOne } from '@/lib/server/pg-read'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

type DutyInput = {
  id?: string
  code?: string
  name?: string
  name_en?: string | null
  name_fr?: string | null
  sort_order?: number
  is_active?: boolean
}

type Body = {
  period_id?: string
  duty_scope_mode?: 'additive' | 'duty_only' | string
  duties?: DutyInput[]
  user_duties?: Array<{ user_id?: string; duty_id?: string; is_active?: boolean }>
  duty_categories?: Array<{ duty_id?: string; category_id?: string; category_source?: string; sort_order?: number; is_active?: boolean }>
  duty_questions?: Array<{ duty_id?: string; question_id?: string; sort_order?: number; is_active?: boolean }>
}

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl.replace(/\/$/, ''), service)
}

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

async function loadPeriodOrError(supabase: any, periodId: string, session: any) {
  const { data: period, error } = isPgEnabled()
    ? await pgReadOne<any>('select id, organization_id from evaluation_periods where id = $1 limit 1', [periodId])
    : await supabase
        .from('evaluation_periods')
        .select('id, organization_id')
        .eq('id', periodId)
        .maybeSingle()

  if (error || !period) return { error: NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 }) }
  if (session.role === 'org_admin' && session.org_id && String(period.organization_id) !== String(session.org_id)) {
    return { error: NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 }) }
  }
  return { period }
}

function missingTablesResponse() {
  return NextResponse.json(
    {
      success: false,
      error: 'Görev bazlı soru tabloları bulunamadı.',
      hint: 'Önce sql/period-duty-questions.sql dosyasını veritabanında çalıştırın.',
    },
    { status: 400 }
  )
}

function isMissingTable(error: any) {
  const code = String(error?.code || '')
  const msg = String(error?.message || '').toLowerCase()
  return code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:period-duty-questions:get', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const periodId = (url.searchParams.get('period_id') || '').trim()
  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  const periodRes = await loadPeriodOrError(supabase, periodId, s)
  if (periodRes.error) return periodRes.error
  const orgId = String((periodRes.period as any).organization_id || '')

  let duty_scope_mode: 'additive' | 'duty_only' = 'additive'
  try {
    const { data: periodRow } = isPgEnabled()
      ? await pgReadOne<any>('select duty_scope_mode from evaluation_periods where id = $1 limit 1', [periodId])
      : await supabase
          .from('evaluation_periods')
          .select('duty_scope_mode')
          .eq('id', periodId)
          .maybeSingle()
    if (String((periodRow as any)?.duty_scope_mode || '') === 'duty_only') duty_scope_mode = 'duty_only'
  } catch {
    // column may not exist yet
  }

  try {
    const [duties, userDuties, dutyCategories, dutyQuestions, users] = await Promise.all([
      isPgEnabled()
        ? pgRead<any>('select * from evaluation_duties where period_id = $1 order by sort_order, created_at', [periodId])
        : supabase.from('evaluation_duties').select('*').eq('period_id', periodId).order('sort_order').order('created_at'),
      isPgEnabled()
        ? pgRead<any>(
            'select period_id, duty_id, user_id, is_active from evaluation_period_user_duties where period_id = $1 and is_active = true',
            [periodId]
          )
        : supabase.from('evaluation_period_user_duties').select('period_id,duty_id,user_id,is_active').eq('period_id', periodId).eq('is_active', true),
      isPgEnabled()
        ? pgRead<any>(
            'select * from evaluation_period_duty_categories where period_id = $1 and is_active = true order by sort_order',
            [periodId]
          )
        : supabase.from('evaluation_period_duty_categories').select('*').eq('period_id', periodId).eq('is_active', true).order('sort_order'),
      isPgEnabled()
        ? pgRead<any>(
            'select * from evaluation_period_duty_questions where period_id = $1 and is_active = true order by sort_order',
            [periodId]
          )
        : supabase.from('evaluation_period_duty_questions').select('*').eq('period_id', periodId).eq('is_active', true).order('sort_order'),
      isPgEnabled()
        ? pgRead<any>(
            'select id, name, email, title, department, status, organization_id from users where organization_id = $1 order by name',
            [orgId]
          )
        : supabase
            .from('users')
            .select('id,name,email,title,department,status,organization_id')
            .eq('organization_id', orgId)
            .order('name'),
    ])

    const firstError = [duties.error, userDuties.error, dutyCategories.error, dutyQuestions.error, users.error].find(Boolean)
    if (firstError) {
      if (isMissingTable(firstError)) return missingTablesResponse()
      return NextResponse.json({ success: false, error: firstError.message || 'Veri alınamadı' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      period_id: periodId,
      duty_scope_mode,
      duties: duties.data || [],
      user_duties: userDuties.data || [],
      duty_categories: dutyCategories.data || [],
      duty_questions: dutyQuestions.data || [],
      users: users.data || [],
    })
  } catch (e: any) {
    if (isMissingTable(e)) return missingTablesResponse()
    return NextResponse.json({ success: false, error: e?.message || 'Veri alınamadı' }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:period-duty-questions:post', String(s.uid || ''), 30, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const periodId = String(body.period_id || '').trim()
  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  const periodRes = await loadPeriodOrError(supabase, periodId, s)
  if (periodRes.error) return periodRes.error
  const orgId = String((periodRes.period as any).organization_id || '')

  const dutyScopeRaw = String(body.duty_scope_mode || 'additive').trim()
  const duty_scope_mode = dutyScopeRaw === 'duty_only' ? 'duty_only' : 'additive'
  try {
    if (isPgEnabled()) {
      // Supabase: .update({ duty_scope_mode }).eq('id', periodId) → tek filtre id
      await withActor(buildActor(s), async (c) => {
        await c.query('update evaluation_periods set duty_scope_mode = $1 where id = $2', [duty_scope_mode, periodId])
      })
    } else {
      const { error: modeErr } = await supabase
        .from('evaluation_periods')
        .update({ duty_scope_mode })
        .eq('id', periodId)
      if (modeErr && !String(modeErr.message || '').toLowerCase().includes('duty_scope_mode')) {
        return NextResponse.json({ success: false, error: modeErr.message || 'Kapsam modu kaydedilemedi' }, { status: 400 })
      }
    }
  } catch {
    // column may not exist until migration runs
  }

  const duties = (body.duties || [])
    .map((d, idx) => ({
      id: String(d.id || '').trim(),
      period_id: periodId,
      organization_id: orgId,
      code: String(d.code || d.name || '').trim().toLowerCase().replace(/\s+/g, '_'),
      name: String(d.name || '').trim(),
      name_en: d.name_en ? String(d.name_en).trim() : null,
      name_fr: d.name_fr ? String(d.name_fr).trim() : null,
      sort_order: Number(d.sort_order ?? idx + 1) || idx + 1,
      is_active: typeof d.is_active === 'boolean' ? d.is_active : true,
    }))
    .filter((d) => d.id && d.code && d.name)

  const dutyIds = new Set(duties.map((d) => d.id))
  const userDuties = (body.user_duties || [])
    .map((r) => ({
      period_id: periodId,
      duty_id: String(r.duty_id || '').trim(),
      user_id: String(r.user_id || '').trim(),
      is_active: typeof r.is_active === 'boolean' ? r.is_active : true,
    }))
    .filter((r) => dutyIds.has(r.duty_id) && r.user_id)

  const dutyCategories = (body.duty_categories || [])
    .map((r, idx) => ({
      period_id: periodId,
      duty_id: String(r.duty_id || '').trim(),
      category_id: String(r.category_id || '').trim(),
      category_source: String(r.category_source || 'question_categories') === 'categories' ? 'categories' : 'question_categories',
      sort_order: Number(r.sort_order ?? idx + 1) || idx + 1,
      is_active: typeof r.is_active === 'boolean' ? r.is_active : true,
    }))
    .filter((r) => dutyIds.has(r.duty_id) && r.category_id)

  const dutyQuestions = (body.duty_questions || [])
    .map((r, idx) => ({
      period_id: periodId,
      duty_id: String(r.duty_id || '').trim(),
      question_id: String(r.question_id || '').trim(),
      sort_order: Number(r.sort_order ?? idx + 1) || idx + 1,
      is_active: typeof r.is_active === 'boolean' ? r.is_active : true,
    }))
    .filter((r) => dutyIds.has(r.duty_id) && r.question_id)

  try {
    if (isPgEnabled()) {
      // Replace pattern (atomik): delete evaluation_duties + 4 tabloya insert AYNI transaction'da.
      await withActor(buildActor(s), async (c) => {
        // Supabase: .from('evaluation_duties').delete().eq('period_id', periodId) → tek filtre period_id
        await c.query('delete from evaluation_duties where period_id = $1', [periodId])

        for (const d of duties) {
          await c.query(
            `insert into evaluation_duties (id, period_id, organization_id, code, name, name_en, name_fr, sort_order, is_active)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [d.id, d.period_id, d.organization_id, d.code, d.name, d.name_en, d.name_fr, d.sort_order, d.is_active]
          )
        }
        for (const r of userDuties) {
          await c.query(
            'insert into evaluation_period_user_duties (period_id, duty_id, user_id, is_active) values ($1, $2, $3, $4)',
            [r.period_id, r.duty_id, r.user_id, r.is_active]
          )
        }
        for (const r of dutyCategories) {
          await c.query(
            `insert into evaluation_period_duty_categories (period_id, duty_id, category_id, category_source, sort_order, is_active)
             values ($1, $2, $3, $4, $5, $6)`,
            [r.period_id, r.duty_id, r.category_id, r.category_source, r.sort_order, r.is_active]
          )
        }
        for (const r of dutyQuestions) {
          await c.query(
            `insert into evaluation_period_duty_questions (period_id, duty_id, question_id, sort_order, is_active)
             values ($1, $2, $3, $4, $5)`,
            [r.period_id, r.duty_id, r.question_id, r.sort_order, r.is_active]
          )
        }
      })
    } else {
      const del = await supabase.from('evaluation_duties').delete().eq('period_id', periodId)
      if (del.error) {
        if (isMissingTable(del.error)) return missingTablesResponse()
        return NextResponse.json({ success: false, error: del.error.message || 'Silme hatası' }, { status: 400 })
      }

      if (duties.length) {
        const { error } = await supabase.from('evaluation_duties').insert(duties)
        if (error) return NextResponse.json({ success: false, error: error.message || 'Görevler kaydedilemedi' }, { status: 400 })
      }
      if (userDuties.length) {
        const { error } = await supabase.from('evaluation_period_user_duties').insert(userDuties)
        if (error) return NextResponse.json({ success: false, error: error.message || 'Kişi görevleri kaydedilemedi' }, { status: 400 })
      }
      if (dutyCategories.length) {
        const { error } = await supabase.from('evaluation_period_duty_categories').insert(dutyCategories)
        if (error) return NextResponse.json({ success: false, error: error.message || 'Görev kategorileri kaydedilemedi' }, { status: 400 })
      }
      if (dutyQuestions.length) {
        const { error } = await supabase.from('evaluation_period_duty_questions').insert(dutyQuestions)
        if (error) return NextResponse.json({ success: false, error: error.message || 'Görev soruları kaydedilemedi' }, { status: 400 })
      }
    }

    return NextResponse.json({
      success: true,
      counts: {
        duties: duties.length,
        user_duties: userDuties.length,
        duty_categories: dutyCategories.length,
        duty_questions: dutyQuestions.length,
      },
    })
  } catch (e: any) {
    if (isMissingTable(e)) return missingTablesResponse()
    return NextResponse.json({ success: false, error: e?.message || 'Kaydetme hatası' }, { status: 400 })
  }
}
