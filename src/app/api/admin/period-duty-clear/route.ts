import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

function normalizeConfirm(raw: string) {
  return raw
    .trim()
    .replace(/\u0130/g, 'I')
    .replace(/\u0131/g, 'i')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .toLocaleUpperCase('en-US')
}

function isMissingTableError(message: string) {
  return /does not exist|relation .* does not exist/i.test(message)
}

/**
 * Dönemdeki tüm yan görev verilerini siler: kişi–görev Excel kayıtları + kapsamdaki görev seçimleri.
 * Matris atamalarına dokunmaz.
 */
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:period-duty-clear', String(s.uid || ''), 5, 60 * 1000)
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
  }

  const periodId = String(body.period_id || '').trim()
  const orgIdParam = String(body.organization_id || '').trim()
  const confirm = normalizeConfirm(String(body.confirm || ''))

  if (!periodId) {
    return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })
  }
  if (confirm !== 'GOREV') {
    return NextResponse.json(
      { success: false, error: 'Onay gerekli: kutuya GOREV veya GÖREV yazın' },
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
    return NextResponse.json({ success: false, error: 'Kurum bilgisi bulunamadı' }, { status: 400 })
  }
  if (periodOrgId !== orgToUse) {
    return NextResponse.json({ success: false, error: 'KVKK: dönem/kurum uyuşmuyor' }, { status: 403 })
  }

  let deletedUserDuties = 0
  let clearedDutyScopeRows = 0

  try {
    const { count: beforeDuties } = await supabase
      .from('evaluation_period_user_duties')
      .select('user_id', { count: 'exact', head: true })
      .eq('period_id', periodId)

    const { error: delDutiesErr } = await supabase
      .from('evaluation_period_user_duties')
      .delete()
      .eq('period_id', periodId)
    if (delDutiesErr && !isMissingTableError(String(delDutiesErr.message || ''))) throw delDutiesErr
    deletedUserDuties = beforeDuties ?? 0

    const catTables = [
      'evaluation_period_evaluator_categories',
      'evaluation_period_evaluator_target_categories',
    ] as const
    for (const table of catTables) {
      const { error } = await supabase.from(table).delete().eq('period_id', periodId).eq('scope_kind', 'duty')
      if (error && !isMissingTableError(String(error.message || ''))) throw error
    }

    const scopeTables = [
      'evaluation_period_evaluator_scope',
      'evaluation_period_evaluator_target_scope',
    ] as const
    for (const table of scopeTables) {
      const { data: rows } = await supabase.from(table).select('id').eq('period_id', periodId)
      if (!rows?.length) continue

      const patch: Record<string, unknown> = {
        duty_mode: 'none',
        updated_at: new Date().toISOString(),
      }

      const { error: updErr } = await supabase.from(table).update(patch).eq('period_id', periodId)
      if (updErr && String(updErr.message || '').includes('duty_package_ids')) {
        const { error: legacyErr } = await supabase.from(table).update(patch).eq('period_id', periodId)
        if (legacyErr && !isMissingTableError(String(legacyErr.message || ''))) throw legacyErr
      } else if (updErr && !isMissingTableError(String(updErr.message || ''))) {
        throw updErr
      }

      const { error: pkgErr } = await supabase
        .from(table)
        .update({ duty_package_ids: [], updated_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('period_id', periodId)
      if (pkgErr && !String(pkgErr.message || '').includes('duty_package_ids') && !isMissingTableError(String(pkgErr.message || ''))) {
        throw pkgErr
      }

      clearedDutyScopeRows += rows.length
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Yan görev temizliği başarısız'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    period_id: periodId,
    period_name: (period as { name?: string }).name || null,
    deleted_user_duty_rows: deletedUserDuties,
    reset_scope_rows: clearedDutyScopeRows,
    message: `Yan görev sıfırlandı: ${deletedUserDuties} kişi–görev kaydı silindi. Matris atamaları duruyor; genel kapsam (21 soru) korunur.`,
  })
}
