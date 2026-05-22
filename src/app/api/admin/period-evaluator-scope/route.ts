import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  fetchEvaluatorScopeConfig,
  filterQuestionsForEvaluatorScope,
  loadDutyCategoryOptionsForPeriod,
  loadDutyPackagesForPeriod,
  loadPeriodCategoryOptions,
  mergeCategoryOptionsForPreview,
  resolveDutyPackagesForAdmin,
  periodUsesSnapshot,
  summarizeQuestionsByCategory,
  type EvaluatorDutyMode,
} from '@/lib/server/evaluation-evaluator-scope'
import {
  fetchDutyScopeMetaForTarget,
  loadDutyQuestionsForEvaluation,
  questionScopeForId,
  resolvePeriodQuestionIdsForTarget,
} from '@/lib/server/evaluation-duty-questions'
import { normalizeMatchKey } from '@/lib/duty-title-match'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SaveBody = {
  period_id?: string
  evaluator_id?: string
  /** Aynı kapsamı birden fazla değerlendirene uygula */
  evaluator_ids?: string[]
  /** Unvan (users.title) eşleşen tüm değerlendirenlere uygula */
  apply_by_title?: string
  /** Matristeki tüm değerlendirenlere uygula */
  apply_to_all_evaluators?: boolean
  restrict_period?: boolean
  duty_mode?: EvaluatorDutyMode
  period_category_ids?: string[]
  duty_category_ids?: string[]
  /** evaluation_duties.id — Formatör, Zümre vb. */
  duty_package_ids?: string[]
}

type ScopePayload = {
  restrict_period: boolean
  duty_mode: EvaluatorDutyMode
  period_category_ids: string[]
  duty_category_ids: string[]
  duty_package_ids: string[]
}

async function persistEvaluatorScope(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  periodId: string,
  evaluatorId: string,
  scope: ScopePayload
) {
  if (!supabase) throw new Error('Supabase yapılandırması eksik')

  const { error: upsertErr } = await supabase.from('evaluation_period_evaluator_scope').upsert(
    {
      period_id: periodId,
      evaluator_id: evaluatorId,
      restrict_period: scope.restrict_period,
      duty_mode: scope.duty_mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'period_id,evaluator_id' }
  )
  if (upsertErr) throw upsertErr

  await supabase
    .from('evaluation_period_evaluator_categories')
    .delete()
    .eq('period_id', periodId)
    .eq('evaluator_id', evaluatorId)

  const catPayload = [
    ...scope.period_category_ids.map((category_id) => ({
      period_id: periodId,
      evaluator_id: evaluatorId,
      category_id,
      scope_kind: 'period',
      is_active: true,
    })),
    ...scope.duty_category_ids.map((category_id) => ({
      period_id: periodId,
      evaluator_id: evaluatorId,
      category_id,
      scope_kind: 'duty',
      is_active: true,
    })),
    ...scope.duty_package_ids.map((duty_id) => ({
      period_id: periodId,
      evaluator_id: evaluatorId,
      category_id: duty_id,
      scope_kind: 'duty_id',
      is_active: true,
    })),
  ]

  if (catPayload.length) {
    const { error: insErr } = await supabase.from('evaluation_period_evaluator_categories').insert(catPayload)
    if (insErr) throw insErr
  }
}

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl.replace(/\/$/, ''), service)
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const periodId = (url.searchParams.get('period_id') || '').trim()
  const evaluatorId = (url.searchParams.get('evaluator_id') || '').trim()
  const previewTargetId = (url.searchParams.get('preview_target_id') || '').trim()

  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String((period as any).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  const orgId = String((period as any).organization_id || '')

  const [categories, dutyCategories, dutyPackages, assignmentsRes, usersRes, scopesRes, catsRes] = await Promise.all([
    loadPeriodCategoryOptions(supabase, periodId),
    loadDutyCategoryOptionsForPeriod(supabase, periodId),
    loadDutyPackagesForPeriod(supabase, periodId),
    supabase.from('evaluation_assignments').select('evaluator_id, target_id').eq('period_id', periodId),
    supabase.from('users').select('id, name, email, title, department').eq('organization_id', orgId).eq('status', 'active').order('name'),
    supabase.from('evaluation_period_evaluator_scope').select('*').eq('period_id', periodId),
    supabase
      .from('evaluation_period_evaluator_categories')
      .select('evaluator_id, category_id, scope_kind')
      .eq('period_id', periodId)
      .eq('is_active', true),
  ])

  const evaluatorIds = Array.from(
    new Set(((assignmentsRes.data || []) as any[]).map((a) => String(a.evaluator_id || '')).filter(Boolean))
  )
  const targetIds = Array.from(
    new Set(((assignmentsRes.data || []) as any[]).map((a) => String(a.target_id || '')).filter(Boolean))
  )

  const users = (usersRes.data || []) as any[]
  const mapUser = (u: any) => ({
    id: String(u.id),
    name: String(u.name || u.email || ''),
    email: u.email,
    title: u.title,
    department: u.department,
  })
  const evaluators = evaluatorIds
    .map((id) => users.find((u) => String(u.id) === id))
    .filter(Boolean)
    .map(mapUser)
  const targets = targetIds
    .map((id) => users.find((u) => String(u.id) === id))
    .filter(Boolean)
    .map(mapUser)

  const scopeByEvaluator: Record<string, any> = {}
  ;((scopesRes.data || []) as any[]).forEach((row) => {
    scopeByEvaluator[String(row.evaluator_id)] = {
      restrict_period: Boolean(row.restrict_period),
      duty_mode: String(row.duty_mode || 'full'),
      period_category_ids: [] as string[],
      duty_category_ids: [] as string[],
      duty_package_ids: [] as string[],
    }
  })
  ;((catsRes.data || []) as any[]).forEach((row) => {
    const eid = String(row.evaluator_id || '')
    if (!scopeByEvaluator[eid]) {
      scopeByEvaluator[eid] = {
        restrict_period: false,
        duty_mode: 'full',
        period_category_ids: [],
        duty_category_ids: [],
        duty_package_ids: [],
      }
    }
    const cid = String(row.category_id || '')
    if (!cid) return
    const kind = String(row.scope_kind || '')
    if (kind === 'duty_id') scopeByEvaluator[eid].duty_package_ids.push(cid)
    else if (kind === 'duty') scopeByEvaluator[eid].duty_category_ids.push(cid)
    else scopeByEvaluator[eid].period_category_ids.push(cid)
  })

  let preview_question_count: number | null = null
  let preview_breakdown: ReturnType<typeof summarizeQuestionsByCategory> = []
  if (evaluatorId && previewTargetId) {
    try {
      const config = await fetchEvaluatorScopeConfig(supabase, periodId, evaluatorId)
      const useSnap = await periodUsesSnapshot(supabase, periodId)
      const dutyMeta = await fetchDutyScopeMetaForTarget(supabase, periodId, previewTargetId)
      let questions: any[] = []
      if (useSnap) {
        const { data: qs } = await supabase
          .from('evaluation_period_questions_snapshot')
          .select('id, category_id, is_active')
          .eq('period_id', periodId)
        questions = ((qs || []) as any[])
          .filter((q) => (typeof q.is_active === 'boolean' ? q.is_active : true))
          .map((q) => ({ ...q, question_scope: 'period' as const }))
        if (dutyMeta?.dutyOnlyQuestionIds.size) {
          const snapIds = new Set(questions.map((q) => String(q.id)))
          const { questions: dutyQs } = await loadDutyQuestionsForEvaluation(supabase, periodId, previewTargetId, snapIds)
          questions = [...questions, ...dutyQs]
        }
      } else {
        let periodQuestionIds: string[] | null = null
        const { data: pq } = await supabase
          .from('evaluation_period_questions')
          .select('question_id')
          .eq('period_id', periodId)
          .eq('is_active', true)
        const ids = (pq || []).map((r: any) => r.question_id).filter(Boolean)
        if (ids.length) periodQuestionIds = ids
        periodQuestionIds = await resolvePeriodQuestionIdsForTarget(supabase, periodId, previewTargetId, periodQuestionIds)
        const q = supabase.from('questions').select('id, category_id')
        if (periodQuestionIds?.length) q.in('id', periodQuestionIds)
        const { data: qd } = await q
        questions = (qd || []).map((row: any) => {
          const scoped = dutyMeta ? questionScopeForId(String(row.id), dutyMeta) : { scope: 'period' as const }
          return { ...row, question_scope: scoped.scope }
        })
      }
      const filtered = filterQuestionsForEvaluatorScope(questions, config)
      preview_question_count = filtered.length
      preview_breakdown = summarizeQuestionsByCategory(
        filtered,
        mergeCategoryOptionsForPreview(categories, dutyCategories)
      )
    } catch {
      preview_question_count = null
      preview_breakdown = []
    }
  }

  const current = evaluatorId ? scopeByEvaluator[evaluatorId] || null : null

  return NextResponse.json({
    success: true,
    categories,
    duty_categories: dutyCategories,
    duty_packages: resolveDutyPackagesForAdmin(dutyPackages, dutyCategories),
    evaluators,
    targets,
    scope_by_evaluator: scopeByEvaluator,
    current,
    preview_question_count,
    preview_breakdown,
  })
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:period-evaluator-scope', String(s.uid || ''), 60, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek', detail: `Lütfen ${rl.retryAfterSec} sn sonra deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as SaveBody
  const periodId = String(body.period_id || '').trim()
  const evaluatorId = String(body.evaluator_id || '').trim()
  const restrictPeriod = Boolean(body.restrict_period)
  const dutyMode = String(body.duty_mode || 'full') as EvaluatorDutyMode
  const periodCategoryIds = Array.from(new Set((body.period_category_ids || []).map(String).filter(Boolean)))
  const dutyCategoryIds = Array.from(new Set((body.duty_category_ids || []).map(String).filter(Boolean)))
  const dutyPackageIds = Array.from(new Set((body.duty_package_ids || []).map(String).filter(Boolean)))
  const applyByTitle = String(body.apply_by_title || '').trim()
  const applyToAll = Boolean(body.apply_to_all_evaluators)
  const bulkEvaluatorIds = Array.from(new Set((body.evaluator_ids || []).map(String).filter(Boolean)))

  const isBulk = applyToAll || !!applyByTitle || bulkEvaluatorIds.length > 0

  if (!periodId) {
    return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })
  }
  if (!isBulk && !evaluatorId) {
    return NextResponse.json({ success: false, error: 'period_id ve evaluator_id gerekli' }, { status: 400 })
  }
  if (!['full', 'categories', 'none'].includes(dutyMode)) {
    return NextResponse.json({ success: false, error: 'Geçersiz duty_mode' }, { status: 400 })
  }
  if (restrictPeriod && !periodCategoryIds.length) {
    return NextResponse.json({ success: false, error: 'Genel kısıt açıkken en az bir alt kategori seçin' }, { status: 400 })
  }
  if (dutyMode === 'categories' && !dutyCategoryIds.length && !dutyPackageIds.length) {
    return NextResponse.json(
      { success: false, error: 'Görev kısıtı için en az bir görev başlığı (Formatör vb.) veya alt kategori seçin' },
      { status: 400 }
    )
  }

  const { data: period, error: pErr } = await supabase
    .from('evaluation_periods')
    .select('id, organization_id')
    .eq('id', periodId)
    .maybeSingle()
  if (pErr || !period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String((period as any).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  const orgId = String((period as any).organization_id || '')
  const scope: ScopePayload = {
    restrict_period: restrictPeriod,
    duty_mode: dutyMode,
    period_category_ids: periodCategoryIds,
    duty_category_ids: dutyCategoryIds,
    duty_package_ids: dutyPackageIds,
  }

  if (isBulk) {
    const { data: assignRows } = await supabase
      .from('evaluation_assignments')
      .select('evaluator_id')
      .eq('period_id', periodId)

    const evaluatorIdSet = new Set(
      ((assignRows || []) as any[]).map((r) => String(r.evaluator_id || '')).filter(Boolean)
    )

    const { data: users } = await supabase
      .from('users')
      .select('id, title')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .in('id', Array.from(evaluatorIdSet))

    let targetIds = bulkEvaluatorIds.filter((id) => evaluatorIdSet.has(id))

    if (applyToAll) {
      targetIds = Array.from(evaluatorIdSet)
    } else if (applyByTitle) {
      const titleKey = normalizeMatchKey(applyByTitle)
      targetIds = ((users || []) as any[])
        .filter((u) => evaluatorIdSet.has(String(u.id)) && normalizeMatchKey(String(u.title || '')) === titleKey)
        .map((u) => String(u.id))
    }

    targetIds = Array.from(new Set(targetIds))
    if (!targetIds.length) {
      return NextResponse.json({ success: false, error: 'Toplu uygulama için değerlendiren bulunamadı' }, { status: 400 })
    }

    let applied = 0
    const errors: string[] = []
    for (const eid of targetIds) {
      try {
        await persistEvaluatorScope(supabase, periodId, eid, scope)
        applied += 1
      } catch (e: any) {
        errors.push(e?.message || eid)
      }
    }

    if (!applied) {
      return NextResponse.json(
        {
          success: false,
          error: errors[0] || 'Toplu kayıt başarısız',
          hint: 'sql/period-evaluator-question-scope.sql ve sql/period-evaluator-scope-duty-id.sql dosyalarını Supabase SQL Editor’da çalıştırın.',
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      bulk: true,
      applied_count: applied,
      target_count: targetIds.length,
      errors: errors.length ? errors.slice(0, 5) : undefined,
    })
  }

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, organization_id')
    .eq('id', evaluatorId)
    .maybeSingle()
  if (uErr || !user || String((user as any).organization_id) !== orgId) {
    return NextResponse.json({ success: false, error: 'Değerlendiren kullanıcı bulunamadı' }, { status: 404 })
  }

  try {
    await persistEvaluatorScope(supabase, periodId, evaluatorId, scope)
  } catch (upsertErr: any) {
    return NextResponse.json(
      {
        success: false,
        error: upsertErr?.message || 'Kapsam kaydedilemedi',
        hint: 'sql/period-evaluator-question-scope.sql ve sql/period-evaluator-scope-duty-id.sql dosyalarını Supabase SQL Editor’da çalıştırın.',
      },
      { status: 400 }
    )
  }

  const config = await fetchEvaluatorScopeConfig(supabase, periodId, evaluatorId)

  return NextResponse.json({ success: true, config })
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const periodId = (url.searchParams.get('period_id') || '').trim()
  const evaluatorId = (url.searchParams.get('evaluator_id') || '').trim()
  if (!periodId || !evaluatorId) {
    return NextResponse.json({ success: false, error: 'period_id ve evaluator_id gerekli' }, { status: 400 })
  }

  const { data: period } = await supabase.from('evaluation_periods').select('organization_id').eq('id', periodId).maybeSingle()
  if (!period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String((period as any).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  await supabase.from('evaluation_period_evaluator_categories').delete().eq('period_id', periodId).eq('evaluator_id', evaluatorId)
  await supabase.from('evaluation_period_evaluator_scope').delete().eq('period_id', periodId).eq('evaluator_id', evaluatorId)

  return NextResponse.json({ success: true })
}
