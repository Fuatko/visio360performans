import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { matchCategoryLabelToIds } from '@/lib/matrix-evaluator-category-scope'
import { loadPeriodCategoryOptions, persistEvaluatorScopeConfig } from '@/lib/server/evaluation-evaluator-scope'
import { normalizeMatrixContext } from '@/lib/matrix-evaluation-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OKUL_YASAM_DEFAULT_LABELS = [
  'Teknolojik Yetkinlikler',
  'Veli İletişimi',
  'Öğrenci İlişkileri ve Empati',
  'Proje, Etkinlik ve Kurumsal Katkı',
]

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

/** Atama eklemeden değerlendiren→hedef kategori kapsamını etiket listesiyle yazar. */
export async function POST(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:apply-evaluator-category-labels', String(s.uid || ''), 20, 60_000)
  if (rl.blocked) {
    return NextResponse.json({ success: false, error: 'Çok fazla istek' }, { status: 429 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  let body: {
    period_id?: string
    evaluator_id?: string
    evaluator_name?: string
    matrix_context?: string
    category_labels?: string[]
    dry_run?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Geçersiz JSON' }, { status: 400 })
  }

  const periodId = String(body.period_id || '').trim()
  const evaluatorId = String(body.evaluator_id || '').trim()
  const evaluatorName = String(body.evaluator_name || '').trim()
  const matrixContext = normalizeMatrixContext(body.matrix_context || 'okul_yasam')
  const dryRun = Boolean(body.dry_run)
  const labels =
    Array.isArray(body.category_labels) && body.category_labels.length
      ? body.category_labels.map((x) => String(x).trim()).filter(Boolean)
      : OKUL_YASAM_DEFAULT_LABELS

  if (!periodId) return NextResponse.json({ success: false, error: 'period_id gerekli' }, { status: 400 })

  const { data: period } = await supabase.from('evaluation_periods').select('organization_id').eq('id', periodId).single()
  if (!period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  if (s.role === 'org_admin' && s.org_id && String((period as { organization_id?: string }).organization_id) !== String(s.org_id)) {
    return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
  }

  let evId = evaluatorId
  if (!evId && evaluatorName) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .ilike('name', `%${evaluatorName.replace(/[%_]/g, '')}%`)
    const hit = (users || []).find((u: { name?: string }) => {
      const n = String(u.name || '').toLowerCase()
      return n.includes('utku') && n.includes('aytac')
    }) as { id: string } | undefined
    evId = hit?.id || ''
  }
  if (!evId) return NextResponse.json({ success: false, error: 'evaluator_id veya evaluator_name gerekli' }, { status: 400 })

  const categories = await loadPeriodCategoryOptions(supabase, periodId)
  const matchedIds: string[] = []
  const unmatched: string[] = []
  for (const label of labels) {
    const ids = matchCategoryLabelToIds(label, categories)
    if (ids.length) matchedIds.push(...ids)
    else unmatched.push(label)
  }
  const uniqueIds = [...new Set(matchedIds)]
  if (!uniqueIds.length) {
    return NextResponse.json({ success: false, error: 'Hiçbir kategori eşleşmedi', unmatched }, { status: 400 })
  }

  const { data: assignments, error: aErr } = await supabase
    .from('evaluation_assignments')
    .select('id, target_id')
    .eq('period_id', periodId)
    .eq('evaluator_id', evId)
    .eq('matrix_context', matrixContext)
  if (aErr) return NextResponse.json({ success: false, error: aErr.message }, { status: 400 })

  const targets = (assignments || []) as Array<{ target_id: string }>
  if (!targets.length) {
    return NextResponse.json({ success: false, error: 'Bu dönemde değerlendiren için atama bulunamadı' }, { status: 404 })
  }

  if (!dryRun) {
    for (const row of targets) {
      await persistEvaluatorScopeConfig(
        supabase,
        periodId,
        evId,
        {
          restrict_period: true,
          duty_mode: 'none',
          period_category_ids: uniqueIds,
          duty_category_ids: [],
          duty_package_ids: [],
        },
        row.target_id,
        matrixContext
      )
    }
  }

  return NextResponse.json({
    success: true,
    dry_run: dryRun,
    evaluator_id: evId,
    matrix_context: matrixContext,
    targets_updated: targets.length,
    category_ids: uniqueIds,
    category_labels: labels,
    unmatched_labels: unmatched,
    message: dryRun
      ? `${targets.length} hedef için ${uniqueIds.length} kategori uygulanacak (önizleme)`
      : `${targets.length} hedefe kategori kapsamı yazıldı`,
  })
}
