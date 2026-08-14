import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { evaluatorDisplayLang } from '@/lib/i18n'
import { dutyLabelFallback } from '@/lib/duty-title-match'
import { getMaxSelectionsForAnswers, isNoInfoAnswer } from '@/lib/evaluation-scale'
import {
  fetchDutyScopeMetaForTarget,
  loadDutyQuestionsForEvaluation,
  questionScopeForId,
  resolvePeriodQuestionIdsForTarget,
  shouldMergeAllTargetDutyQuestions,
} from '@/lib/server/evaluation-duty-questions'
import { applyEvaluationQuestionScope } from '@/lib/server/evaluation-form-question-scope'
import {
  isCategoryMatrixContext,
  isDutyMatrixContext,
  normalizeMatrixContext,
} from '@/lib/matrix-evaluation-context'
import { alignResponsesToQuestions } from '@/lib/evaluation-form-utils'
import { enrichAnswersByQuestionFromLive, finalizeAnswersMapForQuestions } from '@/lib/evaluation-answers'
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

/** GET ile aynı: aynı soru id'si birden fazla kaynaktan gelirse tekilleştir. */
function dedupeQuestionsById(questions: any[]): any[] {
  if (questions.length <= 1) return questions
  const byId = new Map<string, any>()
  const ordered: any[] = []
  for (const q of questions) {
    const qid = String(q?.id || '').trim()
    if (!qid) continue
    if (!byId.has(qid)) {
      byId.set(qid, q)
      ordered.push(q)
      continue
    }
    const prev = byId.get(qid)
    const merged = { ...prev, ...q }
    byId.set(qid, merged)
    const idx = ordered.findIndex((x) => String(x?.id || '') === qid)
    if (idx >= 0) ordered[idx] = merged
  }
  return ordered
}

/** Formda seçilen cevap id'leri submit havuzunda yoksa (snapshot/canlı farkı) DB'den tamamla. */
async function hydrateMissingSelectedAnswers(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  answersByQuestion: Map<string, any[]>,
  alignedResponses: Record<string, string[]>,
  questions: any[]
) {
  const missingIds = new Set<string>()
  for (const q of questions) {
    const qid = String(q.id)
    const selectedIds = (alignedResponses[qid] || []).map(String).filter(Boolean)
    const poolIds = new Set((answersByQuestion.get(qid) || []).map((a) => String(a.id)))
    for (const sid of selectedIds) {
      if (!poolIds.has(sid)) missingIds.add(sid)
    }
  }
  if (!missingIds.size) return

  const ids = [...missingIds]
  for (const table of ['question_answers', 'answers'] as const) {
    // OKUMA: .in('id', ids) → id = any($1::uuid[])
    const { data } = isPgEnabled()
      ? await pgRead<any>(`select * from ${table} where id = any($1::uuid[])`, [ids])
      : await supabase.from(table).select('*').in('id', ids)
    for (const a of (data || []) as any[]) {
      const qid = String(a.question_id || '')
      if (!qid) continue
      const cur = answersByQuestion.get(qid) || []
      if (cur.some((x) => String(x.id) === String(a.id))) continue
      cur.push(a)
      answersByQuestion.set(qid, cur)
    }
  }
}

type Body = {
  assignment_id?: string
  responses?: Record<string, string[]>
  standard_scores?: Record<string, { score: number; rationale?: string }>
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  // Submission endpoint: limit by user (not IP) to avoid corporate NAT false-positives.
  // 20/min is generous for autosave-style clients while still preventing abuse.
  const rl = await rateLimitByUser(req, 'evaluation:submit:post', s.uid, 20, 60 * 1000)
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
  const responses = (body.responses || {}) as Record<string, string[]>
  const standardScores = (body.standard_scores || {}) as Record<string, { score: number; rationale?: string }>
  if (!assignmentId) return NextResponse.json({ success: false, error: 'assignment_id gerekli' }, { status: 400 })

  // Validate assignment ownership + status
  // OKUMA: embed(evaluator:evaluator_id→users, evaluation_periods→evaluation_periods) LEFT JOIN + jsonb_build_object.
  // org-scope WHERE: a.id = $1. Ownership/KVKK/status kontrolleri aşağıda JS'te (supabase ile BİREBİR).
  const { data: assignment, error: aErr } = isPgEnabled()
    ? await pgReadOne<any>(
        `select a.id, a.evaluator_id, a.target_id, a.status, a.period_id, a.matrix_context,
           case when ev.id is not null then jsonb_build_object('preferred_language', ev.preferred_language) else null end as evaluator,
           case when ep.id is not null then jsonb_build_object('status', ep.status, 'organization_id', ep.organization_id) else null end as evaluation_periods
         from evaluation_assignments a
         left join users ev on ev.id = a.evaluator_id
         left join evaluation_periods ep on ep.id = a.period_id
         where a.id = $1 limit 1`,
        [assignmentId]
      )
    : await supabase
        .from('evaluation_assignments')
        .select(
          'id,evaluator_id,target_id,status,period_id,matrix_context,evaluator:evaluator_id(preferred_language),evaluation_periods(status,organization_id)'
        )
        .eq('id', assignmentId)
        .maybeSingle()
  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atama alınamadı' }, { status: 400 })
  if (!assignment) return NextResponse.json({ success: false, error: 'Atama bulunamadı' }, { status: 404 })
  if (String((assignment as any).evaluator_id) !== String(s.uid)) {
    return NextResponse.json({ success: false, error: 'Bu değerlendirmeye erişim yetkiniz yok' }, { status: 403 })
  }

  // KVKK: cross-org guard (defense-in-depth)
  // Even though assignment creation already checks org, keep submit resilient against bad/old data.
  const periodOrgId = (assignment as any).evaluation_periods?.organization_id ? String((assignment as any).evaluation_periods.organization_id) : ''
  if (periodOrgId) {
    // OKUMA: .eq('id', s.uid) → id = $1
    const { data: me, error: meErr } = isPgEnabled()
      ? await pgReadOne<any>('select id, organization_id from users where id = $1 limit 1', [s.uid])
      : await supabase.from('users').select('id,organization_id').eq('id', s.uid).maybeSingle()
    if (meErr || !me) return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 })
    if (String((me as any).organization_id || '') !== periodOrgId) {
      return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
    }
  }
  if ((assignment as any).status === 'completed') {
    return NextResponse.json({ success: false, error: 'Bu değerlendirme zaten tamamlanmış' }, { status: 409 })
  }
  if ((assignment as any).evaluation_periods?.status && String((assignment as any).evaluation_periods.status) !== 'active') {
    return NextResponse.json({ success: false, error: 'Bu değerlendirme dönemi aktif değil' }, { status: 409 })
  }

  const periodId = String((assignment as any).period_id || '').trim()
  const matrixContext = normalizeMatrixContext((assignment as any).matrix_context)
  const isGenelAssignment = matrixContext === 'genel'

  // If period content snapshot exists, prefer snapshot tables for questions/answers.
  let useSnapshot = false
  if (periodId) {
    try {
      // OKUMA (probe): .eq('period_id', periodId).limit(1) → period_id = $1 limit 1
      const probe = isPgEnabled()
        ? await pgRead<any>('select id from evaluation_period_questions_snapshot where period_id = $1 limit 1', [periodId])
        : await supabase.from('evaluation_period_questions_snapshot').select('id').eq('period_id', periodId).limit(1)
      if (!probe.error && (probe.data || []).length > 0) useSnapshot = true
    } catch {
      // ignore
    }
  }

  // Load questions + answers for scoring (respects period selection if table exists)
  let periodQuestionIds: string[] | null = null
  try {
    // OKUMA: .eq('period_id',X).eq('is_active',true).order(sort_order).order(created_at)
    //        → period_id = $1 and is_active = true order by sort_order, created_at
    const { data: pq, error: pqErr } = isPgEnabled()
      ? await pgRead<any>(
          'select question_id, sort_order, is_active from evaluation_period_questions where period_id = $1 and is_active = true order by sort_order, created_at',
          [(assignment as any).period_id]
        )
      : await supabase
          .from('evaluation_period_questions')
          .select('question_id, sort_order, is_active')
          .eq('period_id', (assignment as any).period_id)
          .eq('is_active', true)
          .order('sort_order')
          .order('created_at')
    if (!pqErr) {
      const ids = (pq || []).map((r: any) => r.question_id).filter(Boolean)
      if (ids.length > 0) periodQuestionIds = ids
    }
  } catch {
    // ignore missing table
  }

  // GET ile aynı: yan görev matrisinde hedefin tüm görev sorularını havuza ekleme.
  if (!isGenelAssignment) {
    try {
      if (shouldMergeAllTargetDutyQuestions(matrixContext)) {
        periodQuestionIds = await resolvePeriodQuestionIdsForTarget(
          supabase,
          periodId,
          String((assignment as any).target_id || ''),
          periodQuestionIds
        )
      } else if (isDutyMatrixContext(matrixContext)) {
        periodQuestionIds = []
      }
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message || 'Görev bazlı sorular alınamadı' }, { status: 400 })
    }
  }

  let questions: any[] = []
  const answersByQuestion = new Map<string, any[]>()
  const snapshotCategoryNameById = new Map<string, string>()
  const targetId = String((assignment as any).target_id || '')
  const evalLang = evaluatorDisplayLang((assignment as any).evaluator?.preferred_language)
  const dutyFallback = dutyLabelFallback(evalLang)
  // Form yükleme (GET) ile aynı meta — gönderim doğrulaması UI ile uyumlu kalsın
  let dutyScopeMeta =
    periodId && targetId ? await fetchDutyScopeMetaForTarget(supabase, periodId, targetId, evalLang) : null

  if (useSnapshot && periodId) {
    // OKUMA (Promise.all): 3 snapshot tablosu. .eq('period_id',X).order(sort_order).order(snapshotted_at)
    //   → period_id = $1 order by sort_order, snapshotted_at (kategori tablosunda order yok, birebir).
    const [qSnapRes, aSnapRes, cSnapRes] = isPgEnabled()
      ? await Promise.all([
          pgRead<any>(
            'select id, category_id, text, text_en, text_fr, sort_order, is_active, category_source from evaluation_period_questions_snapshot where period_id = $1 order by sort_order, snapshotted_at',
            [periodId]
          ),
          pgRead<any>(
            'select id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active from evaluation_period_answers_snapshot where period_id = $1 order by sort_order, snapshotted_at',
            [periodId]
          ),
          pgRead<any>('select id, name from evaluation_period_categories_snapshot where period_id = $1', [periodId]),
        ])
      : await Promise.all([
          supabase
            .from('evaluation_period_questions_snapshot')
            .select('id, category_id, text, text_en, text_fr, sort_order, is_active, category_source')
            .eq('period_id', periodId)
            .order('sort_order')
            .order('snapshotted_at'),
          supabase
            .from('evaluation_period_answers_snapshot')
            .select('id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active')
            .eq('period_id', periodId)
            .order('sort_order')
            .order('snapshotted_at'),
          supabase
            .from('evaluation_period_categories_snapshot')
            .select('id, name')
            .eq('period_id', periodId),
        ])

    if (qSnapRes.error) return NextResponse.json({ success: false, error: qSnapRes.error.message || 'Snapshot soruları alınamadı' }, { status: 400 })
    if (aSnapRes.error) return NextResponse.json({ success: false, error: aSnapRes.error.message || 'Snapshot cevapları alınamadı' }, { status: 400 })
    if (!cSnapRes.error) {
      ;((cSnapRes.data || []) as any[]).forEach((c) => {
        if (c?.id && c?.name) snapshotCategoryNameById.set(String(c.id), String(c.name))
      })
    }

    // GET ile aynı: görev matrisinde (kulüp/nöbet/zümre…) snapshot havuzunun tamamı yüklenir,
    // soru seti applyEvaluationQuestionScope + mergeEvaluatorScopedDutyQuestions ile süzülür.
    // Boş Set kullanmak tüm soruları siler ve «en az bir cevap» / cevapsız hata üretirdi.
    const selected =
      periodQuestionIds?.length && !isDutyMatrixContext(matrixContext)
        ? new Set(periodQuestionIds.map(String))
        : null
    questions = ((qSnapRes.data || []) as any[])
      .filter((q) => (typeof q.is_active === 'boolean' ? q.is_active : true))
      .filter((q) => (selected ? selected.has(String(q?.id || '')) : true))

    ;((aSnapRes.data || []) as any[]).forEach((a) => {
      if (typeof a.is_active === 'boolean' && !a.is_active) return
      const qid = String(a.question_id || '')
      if (!qid) return
      if (selected && !selected.has(qid)) return
      const cur = answersByQuestion.get(qid) || []
      cur.push(a)
      answersByQuestion.set(qid, cur)
    })

    questions = questions.map((q) => ({ ...q, question_scope: 'period' as const }))

    if (!isGenelAssignment && !isDutyMatrixContext(matrixContext) && dutyScopeMeta?.dutyOnlyQuestionIds.size) {
      const snapIds = new Set(questions.map((q) => String(q.id)))
      const { questions: dutyQs } = await loadDutyQuestionsForEvaluation(
        supabase,
        periodId,
        targetId,
        snapIds,
        evalLang
      )
      if (dutyQs.length) {
        const dutyIds = dutyQs.map((q: any) => String(q.id))
        // OKUMA: .in('question_id', dutyIds) → question_id = any($1::uuid[]) (question_answers, fallback answers)
        const aRes = isPgEnabled()
          ? await pgRead<any>('select * from question_answers where question_id = any($1::uuid[])', [dutyIds])
          : await supabase.from('question_answers').select('*').in('question_id', dutyIds)
        const answersData = (aRes?.data || []) as any[]
        if (aRes?.error) {
          const legacy = isPgEnabled()
            ? await pgRead<any>('select * from answers where question_id = any($1::uuid[])', [dutyIds])
            : await supabase.from('answers').select('*').in('question_id', dutyIds)
          ;((legacy.data || []) as any[]).forEach((a) => {
            const qid = String(a.question_id || '')
            if (!qid) return
            const cur = answersByQuestion.get(qid) || []
            cur.push(a)
            answersByQuestion.set(qid, cur)
          })
        } else {
          answersData.forEach((a) => {
            const qid = String(a.question_id || '')
            if (!qid) return
            const cur = answersByQuestion.get(qid) || []
            cur.push(a)
            answersByQuestion.set(qid, cur)
          })
        }
        questions = [...questions, ...dutyQs]
      }
    }
  } else {
    const orderCols = ['sort_order', 'order_num'] as const
    const fetchQuestions = async (mode: 'question_categories' | 'categories') => {
      // OKUMA: embed(*, category→main_categories) → q.* + LEFT JOIN + jsonb_build_object(nested to_jsonb).
      //   Supabase alias (question_categories/categories) pg tarafında AYNI kolon adıyla üretilir.
      //   tbl/col sabit whitelist (mode/orderCols) → enjeksiyon yok. .in('id', X)→id = any($1::uuid[]) (opsiyonel).
      //   42703 (order_num/sort_order kolon yok) fallback: bir sonraki order kolonuna geç (birebir).
      if (isPgEnabled()) {
        const tbl = mode === 'question_categories' ? 'question_categories' : 'categories'
        const hasIds = !!(periodQuestionIds && periodQuestionIds.length)
        let lastErr: any = null
        for (const col of orderCols) {
          const { data: rows, error } = await pgRead<any>(
            `select q.*,
               case when c.id is not null then jsonb_build_object(
                 'id', c.id, 'name', c.name, 'name_en', c.name_en, 'name_fr', c.name_fr,
                 'main_categories', to_jsonb(mc.*)
               ) else null end as ${tbl}
             from questions q
             left join ${tbl} c on c.id = q.category_id
             left join main_categories mc on mc.id = c.main_category_id
             ${hasIds ? 'where q.id = any($1::uuid[])' : ''}
             order by q.${col}`,
            hasIds ? [periodQuestionIds] : []
          )
          if (!error) return (rows || []) as any[]
          const code = (error as any)?.code
          const msg = String((error as any)?.message || '')
          if (code === '42703' && (msg.includes('order_num') || msg.includes('sort_order'))) {
            lastErr = error
            continue
          }
          throw error
        }
        if (lastErr) throw lastErr
        return []
      }

      const select =
        mode === 'question_categories'
          ? `
        *,
        question_categories:category_id(
          id, name, name_en, name_fr,
          main_categories(*)
        )
      `
          : `
        *,
        categories:category_id(
          id, name, name_en, name_fr,
          main_categories(*)
        )
      `
      let lastErr: any = null
      for (const col of orderCols) {
        const q = supabase.from('questions').select(select)
        if (periodQuestionIds && periodQuestionIds.length) q.in('id', periodQuestionIds)
        const res = await q.order(col)
        if (!res.error) return (res.data || []) as any[]
        const code = (res.error as any)?.code
        const msg = String((res.error as any)?.message || '')
        if (code === '42703' && (msg.includes('order_num') || msg.includes('sort_order'))) {
          lastErr = res.error
          continue
        }
        throw res.error
      }
      if (lastErr) throw lastErr
      return []
    }

    let questionsData: any[] = []
    if (!isDutyMatrixContext(matrixContext)) {
      try {
        questionsData = await fetchQuestions('question_categories')
      } catch {
        questionsData = await fetchQuestions('categories')
      }
    }

    questions = (questionsData || []).filter((q: any) => {
      const cat = q.question_categories || q.categories
      const mc: any = cat?.main_categories
      if (!mc) return true
      if (typeof mc.is_active === 'boolean') return mc.is_active
      if (typeof mc.status === 'string') return mc.status === 'active'
      return true
    })

    const questionIds = questions.map((q: any) => q.id)
    // OKUMA: .in('question_id', questionIds) → question_id = any($1::uuid[])
    const fetchAnswers = async (table: 'answers' | 'question_answers') => {
      return isPgEnabled()
        ? await pgRead<any>(`select * from ${table} where question_id = any($1::uuid[])`, [questionIds])
        : await supabase.from(table).select('*').in('question_id', questionIds)
    }
    let aRes: any = questionIds.length ? await fetchAnswers('answers') : { data: [] }
    if (aRes?.error) aRes = questionIds.length ? await fetchAnswers('question_answers') : { data: [] }
    const answersData = (aRes?.data || []) as any[]
    ;(answersData as any[]).forEach((a) => {
      if (typeof a.is_active === 'boolean' && !a.is_active) return
      const qid = String(a.question_id || '')
      if (!qid) return
      const cur = answersByQuestion.get(qid) || []
      cur.push(a)
      answersByQuestion.set(qid, cur)
    })

    if (dutyScopeMeta) {
      questions = questions.map((q) => {
        const scoped = questionScopeForId(String(q.id), dutyScopeMeta)
        const duty = dutyScopeMeta.questionDutyMap.get(String(q.id))
        return {
          ...q,
          question_scope: scoped.scope,
          duty_id: scoped.dutyId,
          duty_name: scoped.scope === 'duty' ? duty?.dutyName || dutyFallback : null,
        }
      })
    }
  }

  const evaluatorId = String((assignment as any).evaluator_id || '')
  const answersRecordPre: Record<string, any[]> = {}
  answersByQuestion.forEach((v, k) => {
    answersRecordPre[k] = v
  })
  const questionsBeforeScope = [...questions]
  const answersBeforeScope: Record<string, any[]> = {}
  answersByQuestion.forEach((v, k) => {
    answersBeforeScope[k] = v
  })
  const scoped = await applyEvaluationQuestionScope({
    supabase,
    periodId,
    evaluatorId,
    targetId,
    matrixContext: (assignment as any).matrix_context,
    questions,
    answersByQuestion: answersRecordPre,
    dutyScopeMeta,
  })
  questions = scoped.questions
  answersByQuestion.clear()
  Object.entries(scoped.answersByQuestion).forEach(([k, v]) => answersByQuestion.set(k, v))

  // Görev matrisi: scope sonrası soru kalmadıysa snapshot öncesi havuzu geri yükleme (GET ile uyumlu fail-open yok)
  if (
    questions.length === 0 &&
    questionsBeforeScope.length > 0 &&
    !isGenelAssignment &&
    !isDutyMatrixContext(matrixContext) &&
    !isCategoryMatrixContext(matrixContext)
  ) {
    questions = questionsBeforeScope
    answersByQuestion.clear()
    Object.entries(answersBeforeScope).forEach(([k, v]) => answersByQuestion.set(k, v))
  }

  questions = dedupeQuestionsById(questions)

  const questionIds = questions.map((q: any) => String(q.id || '')).filter(Boolean)
  const answersRecord: Record<string, any[]> = { ...scoped.answersByQuestion }
  let answersNormalized = await enrichAnswersByQuestionFromLive(supabase, answersRecord, questionIds)
  answersNormalized = finalizeAnswersMapForQuestions(answersNormalized, questionIds)
  answersByQuestion.clear()
  Object.entries(answersNormalized).forEach(([k, v]) => answersByQuestion.set(k, v))

  const alignedResponses = alignResponsesToQuestions(responses, questions)
  await hydrateMissingSelectedAnswers(supabase, answersByQuestion, alignedResponses, questions)

  // Validate unanswered
  const unanswered = questions.filter((q: any) => !alignedResponses[q.id] || (alignedResponses[q.id] || []).length === 0)
  if (unanswered.length > 0) {
    return NextResponse.json({ success: false, error: `${unanswered.length} soru cevaplanmamış` }, { status: 400 })
  }

  for (const q of questions) {
    const qid = String(q.id)
    const selectedIds = alignedResponses[qid] || []
    const allAnswers = answersByQuestion.get(qid) || []
    const maxSelections = getMaxSelectionsForAnswers(allAnswers)
    if (selectedIds.length > maxSelections) {
      return NextResponse.json(
        {
          success: false,
          error:
            maxSelections === 1
              ? 'Bu soru için en fazla 1 cevap işaretleyebilirsiniz.'
              : `Bu soru için en fazla ${maxSelections} cevap seçilebilir.`,
        },
        { status: 400 }
      )
    }
  }

  // Standards: if present, require scores
  // (If standards table is not installed or empty, skip)
  let standards: any[] = []
  try {
    const orgId = (assignment as any)?.evaluation_periods?.organization_id as string | null | undefined
    if (orgId) {
      // OKUMA: .eq('organization_id',X).eq('is_active',true) → organization_id = $1 and is_active = true
      const { data } = isPgEnabled()
        ? await pgRead<any>('select id, is_active from international_standards where organization_id = $1 and is_active = true', [orgId])
        : await supabase
            .from('international_standards')
            .select('id,is_active')
            .eq('organization_id', orgId)
            .eq('is_active', true)
      standards = (data || []) as any[]
    }
  } catch {
    // ignore
  }

  // W1 payload (standards). Doğrulama (eksik puan → 400) her iki yolda da yazmadan önce çalışır.
  // pg yolunda ASIL yazma aşağıdaki TEK withActor tx içinde (W1→W2→W3, atomik). Supabase yolu: burada yazar (birebir).
  let standardsPayload: any[] = []
  if (standards.length > 0) {
    const missing = standards.filter((st: any) => !standardScores[st.id] || !Number(standardScores[st.id]?.score || 0))
    if (missing.length > 0) {
      return NextResponse.json({ success: false, error: 'Tüm standartları puanlamalısınız.' }, { status: 400 })
    }

    standardsPayload = standards.map((st: any) => ({
      assignment_id: assignmentId,
      standard_id: st.id,
      score: Number(standardScores[st.id]?.score || 0),
      justification: (standardScores[st.id]?.rationale || '').trim() || null,
    }))

    if (!isPgEnabled()) {
      const payload = standardsPayload
      try {
        const { error } = await supabase.from('international_standard_scores').upsert(payload, { onConflict: 'assignment_id,standard_id' })
        if (error) throw error
      } catch (e: any) {
        const msg = String(e?.message || '')
        if (msg.toLowerCase().includes('no unique') || msg.toLowerCase().includes('no unique or exclusion')) {
          await supabase.from('international_standard_scores').delete().eq('assignment_id', assignmentId)
          const { error: insErr } = await supabase.from('international_standard_scores').insert(payload)
          if (insErr) return NextResponse.json({ success: false, error: insErr.message || 'Standartlar kaydedilemedi' }, { status: 400 })
        } else if (String(e?.code || '') === '42P01') {
          return NextResponse.json({ success: false, error: 'Uluslararası standart tabloları yok. Admin önce SQL dosyasını çalıştırmalı.' }, { status: 400 })
        } else {
          return NextResponse.json({ success: false, error: msg || 'Standartlar kaydedilemedi' }, { status: 400 })
        }
      }
    }
  }

  // Build response rows with scoring
  const rows: any[] = []
  for (const q of questions) {
    const qid = String(q.id)
    const selectedIds = (alignedResponses[qid] || []).map(String).filter(Boolean)
    if (!selectedIds.length) continue

    const allAnswers = answersByQuestion.get(qid) || []
    const selected = allAnswers.filter((a: any) => selectedIds.includes(String(a.id)))
    const meaningful = selected.filter((a: any) => !isNoInfoAnswer(a))
    const useForScoring = meaningful.length > 0 ? meaningful : selected.length > 0 ? selected : selectedIds.map((id) => ({ id, std_score: 0, reel_score: 0 }))
    const avgStd = useForScoring.reduce((sum: number, a: any) => sum + Number(a.std_score || 0), 0) / useForScoring.length
    const avgReel = useForScoring.reduce((sum: number, a: any) => sum + Number(a.reel_score || 0), 0) / useForScoring.length
    const catObj = (q as any).question_categories || (q as any).categories || null
    const categorySource =
      useSnapshot && (q as any)?.category_source
        ? String((q as any).category_source)
        : (q as any).question_categories
          ? 'question_categories'
          : (q as any).categories
            ? 'categories'
            : null
    const snapCatName =
      useSnapshot && (q as any)?.category_id ? snapshotCategoryNameById.get(String((q as any).category_id)) || null : null
    const scopeInfo =
      dutyScopeMeta != null
        ? questionScopeForId(String(q.id), dutyScopeMeta)
        : { scope: ((q as any).question_scope as 'period' | 'duty') || 'period', dutyId: (q as any).duty_id || null }

    rows.push({
      assignment_id: assignmentId,
      question_id: q.id,
      answer_ids: selectedIds,
      std_score: avgStd,
      reel_score: avgReel,
      category_name: catObj?.name || snapCatName || null,
      category_id: catObj?.id || (q as any)?.category_id || null,
      category_source: categorySource,
      question_scope: scopeInfo.scope,
      duty_id: scopeInfo.dutyId,
    })
  }

  // Tüm cevaplar «Fikrim yok» olsa bile kaydet; puanlama aggregateAssignmentResponses içinde score>0 ile ayrılır.

  // Save responses (idempotent)
  const saveResponses = async (payload: any[]) => {
    if (!payload.length) return
    try {
      const { error } = await supabase.from('evaluation_responses').upsert(payload, { onConflict: 'assignment_id,question_id' })
      if (!error) return
      throw error
    } catch (e: any) {
      const msg = String(e?.message || '')
      const code = String(e?.code || '')
      // If DB schema is older (missing columns), retry with a stripped payload.
      if (code === 'PGRST204') {
        const missingAnswerIds = msg.includes("'answer_ids'")
        const missingCategoryId = msg.includes("'category_id'")
        const missingCategorySource = msg.includes("'category_source'")
        const stripped = payload.map((row) => {
          const next = { ...row }
          if (missingAnswerIds) delete (next as any).answer_ids
          if (missingCategoryId) delete (next as any).category_id
          if (missingCategorySource) delete (next as any).category_source
          return next
        })
        const { error: retryErr } = await supabase.from('evaluation_responses').upsert(stripped, { onConflict: 'assignment_id,question_id' })
        if (!retryErr) return
        throw retryErr
      }
      if (msg.toLowerCase().includes('no unique') || msg.toLowerCase().includes('no unique or exclusion')) {
        await supabase.from('evaluation_responses').delete().eq('assignment_id', assignmentId)
        const { error: insErr } = await supabase.from('evaluation_responses').insert(payload)
        if (!insErr) return
        const insMsg = String((insErr as any)?.message || '')
        const insCode = String((insErr as any)?.code || '')
        if (insCode === 'PGRST204') {
          const missingAnswerIds = insMsg.includes("'answer_ids'")
          const missingCategoryId = insMsg.includes("'category_id'")
          const missingCategorySource = insMsg.includes("'category_source'")
          const stripped = payload.map((row) => {
            const next = { ...row }
            if (missingAnswerIds) delete (next as any).answer_ids
            if (missingCategoryId) delete (next as any).category_id
            if (missingCategorySource) delete (next as any).category_source
            return next
          })
          const { error: insRetryErr } = await supabase.from('evaluation_responses').insert(stripped)
          if (!insRetryErr) return
          throw insRetryErr
        }
        throw insErr
      }
      throw e
    }
  }

  // ============================================================================
  // 🔴 YAZMA — EN KRİTİK: pg yolunda W1→W2→W3 TEK withActor(buildActor(s)) tx = ATOMİK.
  //   İki katman güvenlik: (1) yukarıdaki JS ownership(evaluator_id===uid → 403) + KVKK org + 409 çift-submit/pasif-dönem
  //   kontrolleri yazmaya ulaşmadan önce döner; (2) withActor RLS FORCE org-context (SET LOCAL app.current_*).
  //   Idempotency: on conflict (assignment_id,standard_id) / (assignment_id,question_id) → aynı submit iki kez = update, duplicate yok.
  // ============================================================================
  if (isPgEnabled()) {
    try {
      await withActor(buildActor(s), async (c) => {
        // ---- W1: international_standard_scores (yalnızca standarts modunda) ----
        if (standardsPayload.length > 0) {
          const cols = ['assignment_id', 'standard_id', 'score', 'justification']
          const flat: unknown[] = []
          const tuples = standardsPayload.map((row, i) => {
            const base = i * cols.length
            flat.push(row.assignment_id, row.standard_id, row.score, row.justification)
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`
          })
          const insertSql = `insert into international_standard_scores (${cols.join(', ')}) values ${tuples.join(', ')}`
          const upsertSql = `${insertSql} on conflict (assignment_id, standard_id) do update set score = excluded.score, justification = excluded.justification`
          // SAVEPOINT: 42P01(tablo yok)→400'e map; 42P10(unique yok)→rollback+delete+insert (onConflict conflict cols birebir).
          await c.query('savepoint sp_w1')
          try {
            await c.query(upsertSql, flat)
          } catch (e: any) {
            await c.query('rollback to savepoint sp_w1')
            const code = String(e?.code || '')
            if (code === '42P01') {
              const err: any = new Error('Uluslararası standart tabloları yok. Admin önce SQL dosyasını çalıştırmalı.')
              err.httpMessage = 'Uluslararası standart tabloları yok. Admin önce SQL dosyasını çalıştırmalı.'
              throw err
            } else if (code === '42P10') {
              // no unique/exclusion constraint → replace stratejisi (delete-then-bulk-insert)
              await c.query('delete from international_standard_scores where assignment_id = $1', [assignmentId])
              await c.query(insertSql, flat)
            } else {
              throw e
            }
          }
        }

        // ---- W2: evaluation_responses (idempotent upsert) ----
        if (rows.length > 0) {
          const cols = [
            'assignment_id',
            'question_id',
            'answer_ids',
            'std_score',
            'reel_score',
            'category_name',
            'category_id',
            'category_source',
            'question_scope',
            'duty_id',
          ]
          const flat: unknown[] = []
          const tuples = rows.map((row, i) => {
            const base = i * cols.length
            flat.push(
              row.assignment_id,
              row.question_id,
              row.answer_ids, // text[]/uuid[] array kolonu → JS array param (node-pg array olarak gönderir)
              row.std_score,
              row.reel_score,
              row.category_name,
              row.category_id,
              row.category_source,
              row.question_scope,
              row.duty_id
            )
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`
          })
          const insertSql = `insert into evaluation_responses (${cols.join(', ')}) values ${tuples.join(', ')}`
          const upsertSql = `${insertSql} on conflict (assignment_id, question_id) do update set answer_ids = excluded.answer_ids, std_score = excluded.std_score, reel_score = excluded.reel_score, category_name = excluded.category_name, category_id = excluded.category_id, category_source = excluded.category_source, question_scope = excluded.question_scope, duty_id = excluded.duty_id`
          // SAVEPOINT: 42P10(unique yok)→rollback+delete+bulk insert. (PGRST204 kolon-strip fallback SUPABASE-only → pg'de gerekmez.)
          await c.query('savepoint sp_w2')
          try {
            await c.query(upsertSql, flat)
          } catch (e: any) {
            await c.query('rollback to savepoint sp_w2')
            const code = String(e?.code || '')
            if (code === '42P10') {
              await c.query('delete from evaluation_responses where assignment_id = $1', [assignmentId])
              await c.query(insertSql, flat)
            } else {
              throw e
            }
          }
        }

        // ---- W3: evaluation_assignments → completed (çift-submit sonrası idempotent) ----
        await c.query("update evaluation_assignments set status = 'completed', completed_at = now() where id = $1", [assignmentId])
      })
    } catch (e: any) {
      const detail = e?.httpMessage || e?.message || e?.detail || e?.hint || 'unknown'
      return NextResponse.json({ success: false, error: `Değerlendirme kaydedilemedi (${detail})` }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  }

  try {
    await saveResponses(rows)
  } catch (e: any) {
    const detail = e?.message || e?.details || e?.hint || 'unknown'
    return NextResponse.json({ success: false, error: `Yanıtlar kaydedilemedi (${detail})` }, { status: 400 })
  }

  const { error: updErr } = await supabase
    .from('evaluation_assignments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', assignmentId)
  if (updErr) {
    const detail = (updErr as any)?.message || (updErr as any)?.details || (updErr as any)?.hint || 'unknown'
    return NextResponse.json({ success: false, error: `Atama güncellenemedi (${detail})` }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

