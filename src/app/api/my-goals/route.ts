import { NextRequest, NextResponse } from 'next/server'
import { isPgEnabled } from '@/lib/db'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { withActor, type Actor } from '@/lib/server/secure-query'
import { buildActor, getSupabaseAdmin } from '@/lib/server/admin-db'
import { canScoreGoals, serializeGoalForEmployee, weightTotal } from '@/lib/goals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Çalışanın KENDİ hedefleri. Kimlik YALNIZ oturumdan (s.uid); sorgudaki
 * user_id vb. okunmaz. Satırlar yalnız serializeGoalForEmployee'den geçer
 * (puan yalnız puan dolu + dönem 'completed' iken).
 * Bu uç kurum sonuç görünürlüğü anahtarına BAĞLI DEĞİLDİR (hedefte anonimlik sorunu yok).
 */

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

type PeriodRow = { id: string; name: string | null; name_en: string | null; name_fr: string | null; status: string | null; created_at: string | Date | null }

/** Kurum oturumdaki kişinin kendi kaydından (istekten ASLA). */
async function loadUserOrgId(uid: string): Promise<string | null> {
  if (isPgEnabled()) {
    // users FORCE RLS → kurum henüz bilinmediği için sistem aktörüyle tek satır (my-result deseni).
    const r = await withActor({ role: 'super_admin', orgId: null, userId: uid }, (c) =>
      c.query<{ organization_id: string | null }>('select organization_id from users where id = $1 limit 1', [uid])
    )
    return r.rows[0]?.organization_id ? String(r.rows[0].organization_id) : null
  }
  const supabase = getSupabaseAdmin()
  if (!supabase) return null
  const { data } = await supabase.from('users').select('organization_id').eq('id', uid).maybeSingle()
  return (data as { organization_id?: string | null } | null)?.organization_id ?? null
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  const rl = await rateLimitByUser(req, 'my-goals:get', String(s.uid), 30, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  const url = new URL(req.url)
  const l = (url.searchParams.get('lang') || 'tr').toLowerCase()
  const lang = l === 'en' || l === 'fr' ? l : 'tr'
  // Yalnız period_id ve lang okunur.
  const wantedPeriod = (url.searchParams.get('period_id') || '').trim()
  const uid = String(s.uid)

  try {
    const orgId = await loadUserOrgId(uid)
    if (!orgId) return NextResponse.json({ success: true, period: null, goals: [], weight_total: 0, score_pending: false })
    const actorFor = (o: string): Actor => buildActor({ role: s.role, org_id: o, uid })
    const actor = actorFor(orgId)

    let periods: PeriodRow[] = []
    if (isPgEnabled()) {
      const r = await withActor(actor, (c) =>
        c.query<PeriodRow>(
          'select id, name, name_en, name_fr, status, created_at from evaluation_periods where organization_id = $1 order by created_at desc',
          [orgId]
        )
      )
      periods = r.rows
    } else {
      const supabase = getSupabaseAdmin()
      if (!supabase) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })
      const { data, error } = await supabase
        .from('evaluation_periods')
        .select('id, name, name_en, name_fr, status, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      periods = (data || []) as PeriodRow[]
    }

    // period_id yoksa: en son 'completed', o da yoksa en son 'active' dönem.
    const period = wantedPeriod
      ? periods.find((p) => String(p.id) === wantedPeriod) || null
      : periods.find((p) => p.status === 'completed') || periods.find((p) => p.status === 'active') || null
    if (!period) return NextResponse.json({ success: true, period: null, goals: [], weight_total: 0, score_pending: false })

    let rows: Record<string, unknown>[] = []
    const cols = 'id, title, description, weight, target_text, due_date, status, score, score_rationale'
    if (isPgEnabled()) {
      const r = await withActor(actor, (c) =>
        c.query<Record<string, unknown>>(
          `select ${cols} from goals where period_id = $1 and user_id = $2 and organization_id = $3 order by created_at`,
          [period.id, uid, orgId]
        )
      )
      rows = r.rows
    } else {
      const supabase = getSupabaseAdmin()
      if (!supabase) return NextResponse.json({ success: false, error: 'Veritabanı yapılandırması eksik' }, { status: 503 })
      const { data, error } = await supabase
        .from('goals')
        .select(cols)
        .eq('period_id', period.id)
        .eq('user_id', uid)
        .eq('organization_id', orgId)
        .order('created_at')
      if (error) throw new Error(error.message)
      rows = (data || []) as Record<string, unknown>[]
    }

    const goals = rows.map((r) => serializeGoalForEmployee(r, period.status))
    const name = String((lang === 'en' ? period.name_en : lang === 'fr' ? period.name_fr : null) || period.name || '')
    return NextResponse.json(
      {
        success: true,
        period: { id: String(period.id), name, status: period.status },
        goals,
        weight_total: weightTotal(goals.map((g) => ({ weight: typeof g.weight === 'number' ? g.weight : null }))),
        // Dönem kapanmadıysa puanlama bekleniyor (puan değeri ya da varlığı söylenmez).
        score_pending: goals.length > 0 && !canScoreGoals(period.status),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch {
    return NextResponse.json({ success: false, error: 'Hedefler alınamadı' }, { status: 400 })
  }
}
