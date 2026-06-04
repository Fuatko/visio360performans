import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  fetchDutyScopeMetaForTarget,
  loadDutyQuestionsForEvaluation,
  questionScopeForId,
  resolvePeriodQuestionIdsForTarget,
  shouldMergeAllTargetDutyQuestions,
} from '@/lib/server/evaluation-duty-questions'
import { applyEvaluationQuestionScope } from '@/lib/server/evaluation-form-question-scope'
import { isCategoryMatrixContext, isDutyMatrixContext, normalizeMatrixContext } from '@/lib/matrix-evaluation-context'
import { enrichAnswersByQuestionFromLive, finalizeAnswersMapForQuestions } from '@/lib/evaluation-answers'
import { dutyLabelFallback } from '@/lib/duty-title-match'
import { evaluatorDisplayLang } from '@/lib/i18n'

export const runtime = 'nodejs'

function cleanText(v: unknown): string {
  return String(v ?? '').trim()
}

function isGenericQuestionLabel(v: unknown): boolean {
  const s = cleanText(v).toLowerCase()
  if (!s) return true
  return (
    /^\d+$/.test(s) ||
    /^question\s*$/.test(s) ||
    /^question\s*[:\-]?\s*\d*\s*$/.test(s) ||
    /^soru\s*[:\-]?\s*\d*\s*$/.test(s) ||
    /^q\s*[:\-]?\s*\d+\s*$/.test(s)
  )
}

function pickBetterQuestionText(currentValue: unknown, liveValue: unknown): string {
  const cur = cleanText(currentValue)
  const live = cleanText(liveValue)
  const curGeneric = isGenericQuestionLabel(cur)
  const liveGeneric = isGenericQuestionLabel(live)
  if (!curGeneric && cur) return cur
  if (!liveGeneric && live) return live
  return live || cur
}

function normalizedQuestionKey(question: any): string {
  const tr = cleanText(question?.text).toLowerCase()
  const en = cleanText(question?.text_en).toLowerCase()
  const fr = cleanText(question?.text_fr).toLowerCase()
  const base = tr || en || fr
  return base.replace(/\s+/g, ' ').trim()
}

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

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const s = sessionFromReq(req)
  if (!s?.uid) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })

  // Form load endpoint: rate limit by user to avoid corporate NAT false-positives
  const rl = await rateLimitByUser(req, 'evaluation:load:get', s.uid, 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const { slug } = await ctx.params
  const slugStr = String(slug || '').trim()
  if (!slugStr) return NextResponse.json({ success: false, error: 'slug gerekli' }, { status: 400 })

  const selectAssign = `
    *,
    evaluator:evaluator_id(name, preferred_language),
    target:target_id(name, department),
    evaluation_periods(id, name, name_en, name_fr, status, organization_id)
  `

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugStr)
  let assignData: any = null

  if (isUuid) {
    const { data, error } = await supabase.from('evaluation_assignments').select(selectAssign).eq('id', slugStr).maybeSingle()
    if (error) return NextResponse.json({ success: false, error: error.message || 'Atama alınamadı' }, { status: 400 })
    assignData = data
  }

  if (!assignData) {
    const { data, error } = await supabase.from('evaluation_assignments').select(selectAssign).eq('slug', slugStr).maybeSingle()
    if (error) return NextResponse.json({ success: false, error: error.message || 'Atama alınamadı' }, { status: 400 })
    assignData = data
  }

  if (!assignData) return NextResponse.json({ success: false, error: 'Değerlendirme bulunamadı' }, { status: 404 })

  if (String(assignData.evaluator_id) !== String(s.uid)) {
    return NextResponse.json({ success: false, error: 'Bu değerlendirmeye erişim yetkiniz yok' }, { status: 403 })
  }
  if (assignData.status === 'completed') {
    return NextResponse.json({ success: false, error: 'Bu değerlendirme zaten tamamlanmış' }, { status: 409 })
  }
  if (assignData.evaluation_periods?.status !== 'active') {
    return NextResponse.json({ success: false, error: 'Bu değerlendirme dönemi aktif değil' }, { status: 409 })
  }

  // Stabilizasyon modu:
  // Snapshot tablolarında soru metni bozulmaları (ör. "Question 1", "0.35") görüldüğü için
  // form yüklemede geçici olarak canlı kaynak zorlanır.
  // Not: Snapshot yaklaşımı raporlama için korunabilir; form doğruluğu burada önceliklidir.
  const periodId = String(assignData.period_id || assignData?.evaluation_periods?.id || '').trim()
  let useSnapshot = false
  void periodId

  // Optional: period question selection
  let periodQuestionIds: string[] | null = null
  if (!useSnapshot) {
    try {
      const { data: pq, error: pqErr } = await supabase
        .from('evaluation_period_questions')
        .select('question_id, sort_order, is_active')
        .eq('period_id', assignData.period_id)
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

    const matrixCtxForPool = normalizeMatrixContext(assignData.matrix_context)
    if (matrixCtxForPool !== 'genel') {
      try {
        if (shouldMergeAllTargetDutyQuestions(matrixCtxForPool)) {
          periodQuestionIds = await resolvePeriodQuestionIdsForTarget(
            supabase,
            periodId,
            String(assignData.target_id || ''),
            periodQuestionIds
          )
        } else if (isDutyMatrixContext(matrixCtxForPool)) {
          // Kulüp / nöbet / zümre / sınıf: yalnızca scope merge ile ilgili paket soruları
          periodQuestionIds = []
        }
        // okul_yasam: evaluation_period_questions kalır; hedef görev soruları eklenmez
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Görev bazlı sorular alınamadı' }, { status: 400 })
      }
    }
  }

  // International standards (org scoped)
  let standards: any[] = []
  const orgId = assignData?.evaluation_periods?.organization_id as string | null | undefined
  if (orgId) {
    try {
      const { data: stds, error: stdErr } = await supabase
        .from('international_standards')
        .select('id,code,title,description,sort_order,is_active,created_at')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at')
      if (!stdErr) standards = (stds || []) as any[]
    } catch {
      // ignore if table missing
    }
  }

  // Existing standard scores (if any)
  let standardScores: any[] = []
  try {
    const { data, error } = await supabase
      .from('international_standard_scores')
      .select('standard_id, score, justification, created_at')
      .eq('assignment_id', assignData.id)
    if (!error && data) standardScores = data as any[]
  } catch {
    // ignore missing table
  }

  let questions: any[] = []
  const answersByQuestion: Record<string, any[]> = {}
  let questionsBeforeScope: any[] = []
  let answersBeforeScope: Record<string, any[]> = {}
  const targetId = String(assignData.target_id || '')
  const evalLang = evaluatorDisplayLang(assignData.evaluator?.preferred_language)
  const dutyFallback = dutyLabelFallback(evalLang)
  const dutyScopeMeta =
    periodId && targetId ? await fetchDutyScopeMetaForTarget(supabase, periodId, targetId, evalLang) : null

  if (useSnapshot && periodId) {
    // Snapshot tables already contain localized names; we only provide structure to the UI.
    const [qSnapRes, aSnapRes, catSnapRes, mainSnapRes] = await Promise.all([
      supabase
        .from('evaluation_period_questions_snapshot')
        .select('id, category_id, text, text_en, text_fr, sort_order, is_active')
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
        .select('id, main_category_id, name, name_en, name_fr, is_active, sort_order')
        .eq('period_id', periodId),
      supabase
        .from('evaluation_period_main_categories_snapshot')
        .select('id, name, name_en, name_fr, is_active, status, sort_order')
        .eq('period_id', periodId),
    ])

    if (qSnapRes.error) {
      return NextResponse.json({ success: false, error: qSnapRes.error.message || 'Snapshot soruları alınamadı' }, { status: 400 })
    }
    if (aSnapRes.error) {
      return NextResponse.json({ success: false, error: aSnapRes.error.message || 'Snapshot cevapları alınamadı' }, { status: 400 })
    }

    const catById = new Map<string, any>()
    ;((catSnapRes.data || []) as any[]).forEach((c) => {
      if (c?.id) catById.set(String(c.id), c)
    })
    const mainById = new Map<string, any>()
    ;((mainSnapRes.data || []) as any[]).forEach((m) => {
      if (m?.id) mainById.set(String(m.id), m)
    })

    const qs = (qSnapRes.data || []) as any[]
    questions = qs
      .filter((q) => (typeof q.is_active === 'boolean' ? q.is_active : true))
      .map((q) => {
        const cat = q?.category_id ? catById.get(String(q.category_id)) : null
        const mc = cat?.main_category_id ? mainById.get(String(cat.main_category_id)) : null
        return {
          id: q.id,
          text: q.text,
          text_en: q.text_en ?? null,
          text_fr: q.text_fr ?? null,
          order_num: q.sort_order ?? 0,
          sort_order: q.sort_order ?? null,
          category_id: q.category_id,
          question_scope: 'period' as const,
          question_categories: cat
            ? {
                name: cat.name,
                name_en: cat.name_en ?? null,
                name_fr: cat.name_fr ?? null,
                main_categories: mc
                  ? {
                      name: mc.name,
                      name_en: mc.name_en ?? null,
                      name_fr: mc.name_fr ?? null,
                      status: mc.status ?? null,
                      is_active: typeof mc.is_active === 'boolean' ? mc.is_active : null,
                    }
                  : { name: '-', name_en: null, name_fr: null, status: null, is_active: null },
              }
            : null,
        }
      })

    ;((aSnapRes.data || []) as any[]).forEach((a: any) => {
      if (typeof a.is_active === 'boolean' && !a.is_active) return
      const qid = String(a.question_id || '')
      if (!qid) return
      if (!answersByQuestion[qid]) answersByQuestion[qid] = []
      answersByQuestion[qid].push({
        id: a.id,
        question_id: a.question_id,
        text: a.text,
        text_en: a.text_en ?? null,
        text_fr: a.text_fr ?? null,
        level: a.level ?? null,
        std_score: a.std_score ?? 0,
        reel_score: a.reel_score ?? 0,
        order_num: a.sort_order ?? 0,
        sort_order: a.sort_order ?? null,
      })
    })

    const matrixCtxSnap = normalizeMatrixContext(assignData.matrix_context)
    if (
      matrixCtxSnap !== 'genel' &&
      !isDutyMatrixContext(matrixCtxSnap) &&
      dutyScopeMeta?.dutyOnlyQuestionIds.size
    ) {
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
        let aRes = await supabase.from('question_answers').select('*').in('question_id', dutyIds)
        if (aRes?.error) aRes = await supabase.from('answers').select('*').in('question_id', dutyIds)
        ;((aRes.data || []) as any[]).forEach((a: any) => {
          if (typeof a.is_active === 'boolean' && !a.is_active) return
          const qid = String(a.question_id || '')
          if (!qid) return
          if (!answersByQuestion[qid]) answersByQuestion[qid] = []
          answersByQuestion[qid].push(a)
        })
        questions = [...questions, ...dutyQs]
      }
    }
  } else {
    // Questions (supports both question_categories and categories FK variants)
    const orderCols = ['sort_order', 'order_num'] as const
    const fetchQuestions = async (mode: 'question_categories' | 'categories') => {
      const select =
        mode === 'question_categories'
          ? `
        *,
        question_categories:category_id(
          name, name_en, name_fr,
          main_categories(*)
        )
      `
          : `
        *,
        categories:category_id(
          name, name_en, name_fr,
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

    const matrixCtxLive = normalizeMatrixContext(assignData.matrix_context)
    let questionsData: any[] = []
    if (!isDutyMatrixContext(matrixCtxLive)) {
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

    // Answers
    const questionIds = questions.map((q: any) => q.id)
    const fetchAnswers = async (table: 'answers' | 'question_answers') => {
      let lastErr: any = null
      for (const col of ['order_num', 'sort_order'] as const) {
        const res = await supabase.from(table).select('*').in('question_id', questionIds).order(col)
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

    let answersData: any[] = []
    try {
      answersData = questionIds.length ? await fetchAnswers('answers') : []
    } catch {
      answersData = questionIds.length ? await fetchAnswers('question_answers') : []
    }

    ;(answersData || []).forEach((a: any) => {
      if (typeof a.is_active === 'boolean' && !a.is_active) return
      const qid = String(a.question_id || '')
      if (!qid) return
      if (!answersByQuestion[qid]) answersByQuestion[qid] = []
      answersByQuestion[qid].push(a)
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

  // Scope uygulanmadan önce yedekle (scope aşırı daralırsa fail-open fallback için)
  questionsBeforeScope = [...questions]
  answersBeforeScope = { ...answersByQuestion }

  // Existing responses (if any)
  let existingResponses: any[] = []
  try {
    const { data, error } = await supabase.from('evaluation_responses').select('*').eq('assignment_id', assignData.id)
    if (!error && data) existingResponses = data as any[]
  } catch {
    // ignore
  }

  const evaluatorId = String(assignData.evaluator_id || '')
  const scoped = await applyEvaluationQuestionScope({
    supabase,
    periodId,
    evaluatorId,
    targetId,
    matrixContext: assignData.matrix_context,
    questions,
    answersByQuestion,
    dutyScopeMeta,
  })
  questions = scoped.questions
  Object.keys(answersByQuestion).forEach((k) => delete answersByQuestion[k])
  Object.assign(answersByQuestion, scoped.answersByQuestion)

  // Fail-open: yalnızca tanımsız özel bağlamlarda. Görev matrisi ve okul_yasam (Utku vb.)
  // kapsamında yanlış soru setini geri yüklemeyin.
  const matrixCtx = normalizeMatrixContext(assignData.matrix_context)
  if (
    questions.length === 0 &&
    questionsBeforeScope.length > 0 &&
    matrixCtx !== 'genel' &&
    !isDutyMatrixContext(matrixCtx) &&
    !isCategoryMatrixContext(matrixCtx)
  ) {
    questions = questionsBeforeScope
    Object.keys(answersByQuestion).forEach((k) => delete answersByQuestion[k])
    Object.assign(answersByQuestion, answersBeforeScope)
  }

  // Güvenlik: aynı soru id'si birden fazla kaynaktan geldiyse tekilleştir.
  // (Örn. period + duty merge senaryolarında tekrar nedeniyle "aynı soru" hissi oluşmasın)
  if (questions.length > 1) {
    const byId = new Map<string, any>()
    const ordered: any[] = []
    for (const q of questions) {
      const qid = String((q as any)?.id || '').trim()
      if (!qid) continue
      const prev = byId.get(qid)
      if (!prev) {
        byId.set(qid, q)
        ordered.push(q)
        continue
      }
      const merged = {
        ...prev,
        ...q,
        text: pickBetterQuestionText((prev as any)?.text, (q as any)?.text),
        text_en: pickBetterQuestionText((prev as any)?.text_en, (q as any)?.text_en) || null,
        text_fr: pickBetterQuestionText((prev as any)?.text_fr, (q as any)?.text_fr) || null,
      }
      byId.set(qid, merged)
      const idx = ordered.findIndex((x: any) => String(x?.id || '') === qid)
      if (idx >= 0) ordered[idx] = merged
    }
    questions = ordered
  }

  let questionIds = questions.map((q) => String((q as any).id || '')).filter(Boolean)

  // Snapshot'tan gelen generic/boş metinleri canlı questions tablosundan güvenli override et.
  if (questionIds.length) {
    try {
      const { data: liveRows, error: liveErr } = await supabase
        .from('questions')
        .select('id, text, text_en, text_fr')
        .in('id', questionIds)
      if (!liveErr && liveRows) {
        const liveById = new Map<string, any>()
        ;(liveRows as any[]).forEach((r) => {
          const id = String(r?.id || '').trim()
          if (id) liveById.set(id, r)
        })
        questions = questions.map((q: any) => {
          const qid = String(q?.id || '').trim()
          const live = qid ? liveById.get(qid) : null
          if (!live) return q

          const qText = cleanText(q?.text)
          const qTextEn = cleanText(q?.text_en)
          const qTextFr = cleanText(q?.text_fr)
          const lText = cleanText(live?.text)
          const lTextEn = cleanText(live?.text_en)
          const lTextFr = cleanText(live?.text_fr)

          return {
            ...q,
            text: pickBetterQuestionText(qText, lText),
            text_en: pickBetterQuestionText(qTextEn, lTextEn) || null,
            text_fr: pickBetterQuestionText(qTextFr, lTextFr) || null,
          }
        })
      }
    } catch {
      // Sessiz geç: canlı override olmazsa mevcut davranış devam eder.
    }
  }

  // Not:
  // Metin bazlı tekilleştirme genel değerlendirmede soru sayısını yanlış düşürebiliyor.
  // Bu yüzden soru sayısı yalnızca id bazlı tekilleştirme ile korunur.

  let answersFinal = await enrichAnswersByQuestionFromLive(supabase, answersByQuestion, questionIds)
  answersFinal = finalizeAnswersMapForQuestions(answersFinal, questionIds)

  // Kategori / ana başlık FR: canlı kayıtta boşsa dönem snapshot'tan tamamla
  if (periodId && questions.length) {
    try {
      const catIds = Array.from(
        new Set(
          questions
            .map((q: any) => String(q?.category_id || (q?.question_categories as any)?.id || '').trim())
            .filter(Boolean)
        )
      )
      const mainIds = Array.from(
        new Set(
          questions
            .map((q: any) => {
              const cat = q?.question_categories || q?.categories
              return String(cat?.main_category_id || cat?.main_categories?.id || '').trim()
            })
            .filter(Boolean)
        )
      )

      const [snapCatsRes, snapMainRes] = await Promise.all([
        catIds.length
          ? supabase
              .from('evaluation_period_categories_snapshot')
              .select('id, name_fr, name_en')
              .eq('period_id', periodId)
              .in('id', catIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        mainIds.length
          ? supabase
              .from('evaluation_period_main_categories_snapshot')
              .select('id, name_fr, name_en')
              .eq('period_id', periodId)
              .in('id', mainIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ])

      const snapCatById = new Map<string, any>()
      ;((snapCatsRes as any).data || []).forEach((c: any) => {
        if (c?.id) snapCatById.set(String(c.id), c)
      })
      const snapMainById = new Map<string, any>()
      ;((snapMainRes as any).data || []).forEach((m: any) => {
        if (m?.id) snapMainById.set(String(m.id), m)
      })

      const patchCat = (cat: any) => {
        if (!cat) return cat
        const sid = String(cat.id || '').trim()
        const snap = sid ? snapCatById.get(sid) : null
        const nameFr = cleanText(cat.name_fr) || cleanText(snap?.name_fr)
        const nameEn = cleanText(cat.name_en) || cleanText(snap?.name_en)
        return {
          ...cat,
          ...(nameFr ? { name_fr: nameFr } : {}),
          ...(nameEn ? { name_en: nameEn } : {}),
        }
      }

      const patchMain = (mc: any) => {
        if (!mc) return mc
        const sid = String(mc.id || '').trim()
        const snap = sid ? snapMainById.get(sid) : null
        const nameFr = cleanText(mc.name_fr) || cleanText(snap?.name_fr)
        const nameEn = cleanText(mc.name_en) || cleanText(snap?.name_en)
        return {
          ...mc,
          ...(nameFr ? { name_fr: nameFr } : {}),
          ...(nameEn ? { name_en: nameEn } : {}),
        }
      }

      questions = questions.map((q: any) => {
        const catKey = q.question_categories ? 'question_categories' : q.categories ? 'categories' : null
        if (!catKey) return q
        const cat = patchCat(q[catKey])
        const mc = patchMain(cat?.main_categories)
        return {
          ...q,
          [catKey]: mc ? { ...cat, main_categories: mc } : cat,
        }
      })
    } catch {
      // snapshot yoksa sessiz geç
    }
  }

  const hasDutyQuestions = questions.some((q) => String((q as any).question_scope || '') === 'duty')

  return NextResponse.json({
    success: true,
    assignment: assignData,
    questions,
    answersByQuestion: answersFinal,
    standards,
    standardScores,
    existingResponses,
    hasDutyQuestions,
  })
}

