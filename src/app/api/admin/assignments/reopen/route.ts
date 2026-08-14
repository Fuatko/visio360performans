import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isPgEnabled } from '@/lib/db'
import { pgReadOne } from '@/lib/server/pg-read'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

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

type Body = {
  assignment_id?: string
  /** default true: clear existing responses & standard scores */
  clear_data?: boolean
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:assignments:reopen:post', String(s.uid || ''), 20, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Body
  const assignmentId = String(body.assignment_id || '').trim()
  const clearData = body.clear_data !== false

  if (!assignmentId) {
    return NextResponse.json({ success: false, error: 'assignment_id gerekli' }, { status: 400 })
  }

  // OKUMA (org doğrulama): embed(evaluation_periods→organization_id) JOIN. org-scope: aşağıda org eşleşme kontrolü.
  const { data: assignment, error: aErr } = isPgEnabled()
    ? await pgReadOne<any>(
        `select a.id, a.status, a.period_id,
           case when ep.id is not null then jsonb_build_object('organization_id', ep.organization_id) else null end as evaluation_periods
         from evaluation_assignments a
         left join evaluation_periods ep on ep.id = a.period_id
         where a.id = $1 limit 1`,
        [assignmentId]
      )
    : await supabase
        .from('evaluation_assignments')
        .select('id, status, period_id, evaluation_periods(organization_id)')
        .eq('id', assignmentId)
        .maybeSingle()
  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atama alınamadı' }, { status: 400 })
  if (!assignment) return NextResponse.json({ success: false, error: 'Atama bulunamadı' }, { status: 404 })

  const orgId = (assignment as any)?.evaluation_periods?.organization_id ? String((assignment as any).evaluation_periods.organization_id) : ''
  if (s.role === 'org_admin' && String(s.org_id || '') !== orgId) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  // YAZMA (hibrit + iki katman): pg açıksa TEK withActor tx (atomik clear+reopen), RLS org-context.
  // org izolasyonu: (1) yukarıdaki KVKK JS kontrolü (org_admin ≠ assignment.org → 403, yazmaya ulaşamaz),
  // (2) withActor RLS FORCE. DELETE/UPDATE WHERE'leri supabase ile BİREBİR: assignment_id = $1 / id = $1.
  // clearData koşulu birebir korundu. international_standard_scores eksik tablo → SAVEPOINT ile yutulur (tx abort olmaz).
  if (isPgEnabled()) {
    try {
      await withActor(buildActor(s), async (c) => {
        if (clearData) {
          await c.query('delete from evaluation_responses where assignment_id = $1', [assignmentId])
          await c.query('savepoint sp_iss')
          try {
            await c.query('delete from international_standard_scores where assignment_id = $1', [assignmentId])
          } catch {
            await c.query('rollback to savepoint sp_iss') // tablo yok → yut, tx devam
          }
        }
        await c.query("update evaluation_assignments set status = 'pending', completed_at = null where id = $1", [assignmentId])
      })
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error)?.message || 'Atama güncellenemedi' }, { status: 400 })
    }
    return NextResponse.json({ success: true, assignment_id: assignmentId, cleared: clearData })
  }

  if (clearData) {
    // Clear competency responses first
    await supabase.from('evaluation_responses').delete().eq('assignment_id', assignmentId)
    // Clear standard scores (table may not exist)
    try {
      await supabase.from('international_standard_scores').delete().eq('assignment_id', assignmentId)
    } catch {
      // ignore missing table
    }
  }

  const { error: updErr } = await supabase
    .from('evaluation_assignments')
    .update({ status: 'pending', completed_at: null })
    .eq('id', assignmentId)
  if (updErr) return NextResponse.json({ success: false, error: updErr.message || 'Atama güncellenemedi' }, { status: 400 })

  return NextResponse.json({ success: true, assignment_id: assignmentId, cleared: clearData })
}

