import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import {
  buildQuestionsImportTemplateWorkbook,
  parseQuestionsExcelBuffer,
  type QuestionsImportRow,
} from '@/lib/questions-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getSupabaseAdmin() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl.replace(/\/$/, ''), service)
}

async function ensureMainCategory(supabase: any, name: string, nameFr: string) {
  const { data: existing } = await supabase.from('main_categories').select('id').eq('name', name).maybeSingle()
  if (existing?.id) {
    if (nameFr) {
      await supabase
        .from('main_categories')
        .update({ name_fr: nameFr })
        .eq('id', existing.id)
        .is('name_fr', null)
    }
    return String(existing.id)
  }

  const payload: Record<string, unknown> = {
    name,
    description: null,
    sort_order: 0,
    is_active: true,
    language: 'tr',
  }
  if (nameFr) payload.name_fr = nameFr

  const { data: inserted, error } = await supabase.from('main_categories').insert(payload).select('id').single()
  if (error) throw error
  return String(inserted?.id)
}

async function applyImport(
  supabase: any,
  mainCategoryId: string,
  rows: QuestionsImportRow[],
  updateExisting: boolean
) {
  const catIdByName = new Map<string, string>()
  const qIdByKey = new Map<string, string>()

  let categoriesCreated = 0
  let categoriesUpdated = 0
  let questionsCreated = 0
  let questionsUpdated = 0
  let answersCreated = 0
  let answersUpdated = 0

  const uniqueCats = [...new Map(rows.map((r) => [r.cat_tr, r])).values()]
  for (const r of uniqueCats) {
    const { data: found } = await supabase
      .from('question_categories')
      .select('id, name_fr')
      .eq('main_category_id', mainCategoryId)
      .eq('name', r.cat_tr)
      .maybeSingle()

    if (found?.id) {
      catIdByName.set(r.cat_tr, String(found.id))
      if (updateExisting && r.cat_fr && !found.name_fr) {
        await supabase.from('question_categories').update({ name_fr: r.cat_fr }).eq('id', found.id)
        categoriesUpdated += 1
      }
      continue
    }

    const { data: ins, error } = await supabase
      .from('question_categories')
      .insert({
        main_category_id: mainCategoryId,
        name: r.cat_tr,
        name_fr: r.cat_fr || null,
        sort_order: r.q_order || 0,
        is_active: true,
      })
      .select('id')
      .single()
    if (error) throw error
    catIdByName.set(r.cat_tr, String(ins?.id))
    categoriesCreated += 1
  }

  const questionGroups = new Map<string, QuestionsImportRow>()
  for (const r of rows) {
    const k = `${r.cat_tr}::${r.q_tr}`
    if (!questionGroups.has(k)) questionGroups.set(k, r)
  }

  for (const [key, r] of questionGroups) {
    const catId = catIdByName.get(r.cat_tr)
    if (!catId) continue

    const { data: found } = await supabase
      .from('questions')
      .select('id, text_fr')
      .eq('category_id', catId)
      .eq('text', r.q_tr)
      .maybeSingle()

    if (found?.id) {
      qIdByKey.set(key, String(found.id))
      if (updateExisting && r.q_fr) {
        await supabase
          .from('questions')
          .update({ text_fr: r.q_fr, sort_order: r.q_order || 0 })
          .eq('id', found.id)
        questionsUpdated += 1
      }
      continue
    }

    const { data: ins, error } = await supabase
      .from('questions')
      .insert({
        category_id: catId,
        text: r.q_tr,
        text_fr: r.q_fr || null,
        sort_order: r.q_order || 0,
        is_active: true,
      })
      .select('id')
      .single()
    if (error) throw error
    qIdByKey.set(key, String(ins?.id))
    questionsCreated += 1
  }

  const answerSeen = new Set<string>()
  for (const r of rows) {
    const qKey = `${r.cat_tr}::${r.q_tr}`
    const qid = qIdByKey.get(qKey)
    if (!qid) continue
    const dedupe = `${qid}::${r.a_tr}`
    if (answerSeen.has(dedupe)) continue
    answerSeen.add(dedupe)

    const level = r.level?.trim() || null
    const { data: found } = await supabase
      .from('question_answers')
      .select('id')
      .eq('question_id', qid)
      .eq('text', r.a_tr)
      .maybeSingle()

    const payload = {
      question_id: qid,
      text: r.a_tr,
      text_fr: r.a_fr || null,
      level,
      std_score: r.std_score,
      reel_score: r.reel_score,
      sort_order: r.a_order || 0,
      is_active: true,
    }

    if (found?.id) {
      if (updateExisting) {
        await supabase.from('question_answers').update(payload).eq('id', found.id)
        answersUpdated += 1
      }
      continue
    }

    const { error } = await supabase.from('question_answers').insert(payload)
    if (error) throw error
    answersCreated += 1
  }

  return {
    categoriesCreated,
    categoriesUpdated,
    questionsCreated,
    questionsUpdated,
    answersCreated,
    answersUpdated,
  }
}

async function linkQuestionsToPeriod(supabase: any, periodId: string, questionIds: string[]) {
  const { error: delErr } = await supabase.from('evaluation_period_questions').delete().eq('period_id', periodId)
  if (delErr) throw delErr
  if (!questionIds.length) return 0
  const payload = questionIds.map((qid, idx) => ({
    period_id: periodId,
    question_id: qid,
    sort_order: idx + 1,
    is_active: true,
  }))
  const { error: insErr } = await supabase.from('evaluation_period_questions').insert(payload)
  if (insErr) throw insErr
  return questionIds.length
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const buf = buildQuestionsImportTemplateWorkbook()
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="soru_bankasi_sablonu.xlsx"',
    },
  })
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  const s = verifySession(token)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:questions:import', String(s.uid || ''), 10, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek', detail: `Lütfen ${rl.retryAfterSec} sn sonra deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const form = await req.formData()
  const file = form.get('file')
  const mainCategoryName = String(form.get('main_category_name') || '').trim()
  const mainCategoryFr = String(form.get('main_category_fr') || '').trim()
  const dryRun = String(form.get('dry_run') || 'true') === 'true'
  const updateExisting = String(form.get('update_existing') || 'true') === 'true'
  const periodId = String(form.get('period_id') || '').trim()
  const linkPeriod = String(form.get('link_period') || 'false') === 'true'

  if (!mainCategoryName) {
    return NextResponse.json({ success: false, error: 'Ana başlık (main_category_name) gerekli' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Excel dosyası (file) gerekli' }, { status: 400 })
  }

  const buf = await file.arrayBuffer()
  const preview = parseQuestionsExcelBuffer(buf)
  if (preview.errors.length) {
    return NextResponse.json({ success: false, dry_run: true, preview }, { status: 400 })
  }

  if (dryRun) {
    return NextResponse.json({ success: true, dry_run: true, preview })
  }

  try {
    const mainId = await ensureMainCategory(supabase, mainCategoryName, mainCategoryFr)
    const applied = await applyImport(supabase, mainId, preview.rows, updateExisting)

    let periodLinked = 0
    if (linkPeriod && periodId) {
      const { data: period } = await supabase
        .from('evaluation_periods')
        .select('id, organization_id')
        .eq('id', periodId)
        .single()
      if (!period) return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
      if (s.role === 'org_admin' && s.org_id && String((period as any).organization_id) !== String(s.org_id)) {
        return NextResponse.json({ success: false, error: 'KVKK: kurum yetkisi yok' }, { status: 403 })
      }

      const catIds = [...new Set(preview.rows.map((r) => r.cat_tr))]
      const { data: cats } = await supabase
        .from('question_categories')
        .select('id')
        .eq('main_category_id', mainId)
        .in('name', catIds)
      const categoryIds = (cats || []).map((c: any) => String(c.id))
      const { data: qs } = categoryIds.length
        ? await supabase.from('questions').select('id').in('category_id', categoryIds).eq('is_active', true)
        : { data: [] }
      const qIds = [...new Set((qs || []).map((q: any) => String(q.id)))]
      periodLinked = await linkQuestionsToPeriod(supabase, periodId, qIds)
    }

    return NextResponse.json({
      success: true,
      dry_run: false,
      preview: preview.stats,
      main_category_id: mainId,
      applied,
      period_linked_count: periodLinked,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'İçe aktarma hatası' }, { status: 400 })
  }
}
