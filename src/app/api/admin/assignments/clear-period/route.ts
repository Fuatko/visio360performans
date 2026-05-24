import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'

export const runtime = 'nodejs'

const CHUNK = 100

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteInChunks(supabase: any, table: string, column: string, ids: string[]) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { error } = await supabase.from(table).delete().in(column, chunk)
    if (error) throw error
  }
}

function isMissingTableError(message: string) {
  return /does not exist|relation .* does not exist/i.test(message)
}

/**
 * Dönemdeki TÜM matris atamalarını siler (bekleyen + tamamlanmış).
 * İsteğe bağlı: değerlendiren/hedef soru kapsamı kayıtları.
 */
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:assignments:clear-period', String(s.uid || ''), 5, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek', detail: `Lütfen ${rl.retryAfterSec} sn sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as {
    period_id?: string
    organization_id?: string
    confirm?: string
    clear_scope?: boolean
  }

  const periodId = String(body.period_id || '').trim()
  const orgIdParam = String(body.organization_id || '').trim()
  const confirm = String(body.confirm || '').trim()
  const clearScope = Boolean(body.clear_scope)

  if (!periodId) {
    return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })
  }
  const confirmNorm = confirm.replace(/\u0130/g, 'I').replace(/\u0131/g, 'i').toLocaleUpperCase('en-US')
  if (confirmNorm !== 'SIL') {
    return NextResponse.json(
      { success: false, error: 'Onay gerekli: confirm alanına SIL veya SİL yazın' },
      { status: 400 }
    )
  }

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id, name')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })

  const periodOrgId = String((period as { organization_id?: string }).organization_id || '')
  const orgToUse =
    s.role === 'org_admin' ? String(s.org_id || '') : orgIdParam || periodOrgId

  if (!orgToUse) {
    return NextResponse.json(
      { success: false, error: 'Kurum bilgisi bulunamadı — üst menüden kurum seçin veya döneme bağlı kurum eksik' },
      { status: 400 }
    )
  }
  if (periodOrgId !== orgToUse) {
    return NextResponse.json({ success: false, error: 'KVKK: dönem/kurum uyuşmuyor' }, { status: 403 })
  }

  const { data: rows, error: aErr } = await supabase.from('evaluation_assignments').select('id').eq('period_id', periodId)
  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atamalar okunamadı' }, { status: 400 })

  const assignmentIds = ((rows || []) as { id: string }[]).map((r) => String(r.id)).filter(Boolean)

  try {
    if (assignmentIds.length) {
      await deleteInChunks(supabase, 'evaluation_responses', 'assignment_id', assignmentIds)
      try {
        await deleteInChunks(supabase, 'international_standard_scores', 'assignment_id', assignmentIds)
      } catch (scoreErr: unknown) {
        const msg = scoreErr instanceof Error ? scoreErr.message : String(scoreErr)
        if (!isMissingTableError(msg)) throw scoreErr
      }
      const { error: delErr } = await supabase.from('evaluation_assignments').delete().eq('period_id', periodId)
      if (delErr) throw delErr
    }

    if (clearScope) {
      const scopeTables = [
        'evaluation_period_evaluator_target_categories',
        'evaluation_period_evaluator_target_scope',
        'evaluation_period_evaluator_categories',
        'evaluation_period_evaluator_scope',
      ] as const
      for (const table of scopeTables) {
        const { error } = await supabase.from(table).delete().eq('period_id', periodId)
        if (error && !isMissingTableError(String(error.message || ''))) throw error
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Silme başarısız'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }

  const { count: remaining } = await supabase
    .from('evaluation_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('period_id', periodId)

  if (remaining && remaining > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Silme tamamlanamadı — dönemde hâlâ ${remaining} atama var. Tekrar deneyin veya sql/clear-period-assignments.sql çalıştırın.`,
        deleted_assignments: assignmentIds.length,
        remaining_assignments: remaining,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    period_id: periodId,
    period_name: (period as { name?: string }).name || null,
    organization_id: orgToUse,
    deleted_assignments: assignmentIds.length,
    cleared_scope: clearScope,
    message: `${assignmentIds.length} atama silindi.${clearScope ? ' Soru kapsamı kayıtları da temizlendi.' : ' (Soru kapsamı kutusu işaretliyse bir sonraki denemede kapsam da silinir.)'}`,
  })
}
