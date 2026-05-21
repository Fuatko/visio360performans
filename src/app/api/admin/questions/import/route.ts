import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { resolveImportAnswerLevel } from '@/lib/evaluation-scale'
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

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function throwImportError(stage: string, err: { message?: string; details?: string; hint?: string; code?: string }) {
  const msg = err?.message || 'Bilinmeyen veritabanı hatası'
  const extra = [err?.details, err?.hint].filter(Boolean).join(' — ')
  const e = new Error(extra ? `${stage}: ${msg} (${extra})` : `${stage}: ${msg}`) as Error & {
    code?: string
    stage?: string
  }
  e.code = err?.code
  e.stage = stage
  throw e
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

  const { data: existingCats, error: catLoadErr } = await supabase
    .from('question_categories')
    .select('id, name, name_fr')
    .eq('main_category_id', mainCategoryId)
  if (catLoadErr) throwImportError('Kategoriler okunamadı', catLoadErr)

  for (const c of existingCats || []) {
    catIdByName.set(String(c.name), String(c.id))
  }

  const catsToInsert = uniqueCats
    .filter((r) => !catIdByName.has(r.cat_tr))
    .map((r) => ({
      main_category_id: mainCategoryId,
      name: r.cat_tr,
      name_fr: r.cat_fr || null,
      sort_order: r.q_order || 0,
      is_active: true,
    }))

  for (const batch of chunkArray(catsToInsert, 40)) {
    const { data: ins, error } = await supabase.from('question_categories').insert(batch).select('id, name')
    if (error) throwImportError('Kategori eklenemedi', error)
    for (const c of ins || []) {
      catIdByName.set(String(c.name), String(c.id))
      categoriesCreated += 1
    }
  }

  if (updateExisting) {
    for (const r of uniqueCats) {
      const id = catIdByName.get(r.cat_tr)
      if (!id || !r.cat_fr) continue
      const prev = (existingCats || []).find((c: any) => String(c.id) === id)
      if (prev && !prev.name_fr) {
        const { error } = await supabase
          .from('question_categories')
          .update({ name_fr: r.cat_fr })
          .eq('id', id)
        if (error) throwImportError('Kategori güncellenemedi', error)
        categoriesUpdated += 1
      }
    }
  }

  const questionGroups = new Map<string, QuestionsImportRow>()
  for (const r of rows) {
    const k = `${r.cat_tr}::${r.q_tr}`
    if (!questionGroups.has(k)) questionGroups.set(k, r)
  }

  const categoryIds = [...new Set([...catIdByName.values()])]
  const catIdToName = new Map<string, string>()
  catIdByName.forEach((id, name) => catIdToName.set(id, name))

  const existingQuestions: Array<{ id: string; text: string; category_id: string; text_fr: string | null }> = []
  for (const batch of chunkArray(categoryIds, 40)) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, text, category_id, text_fr')
      .in('category_id', batch)
    if (error) throwImportError('Sorular okunamadı', error)
    existingQuestions.push(...(data || []))
  }

  for (const q of existingQuestions) {
    const catName = catIdToName.get(String(q.category_id))
    if (catName) qIdByKey.set(`${catName}::${q.text}`, String(q.id))
  }

  const questionsToInsert: Array<Record<string, unknown>> = []

  for (const [key, r] of questionGroups) {
    const catId = catIdByName.get(r.cat_tr)
    if (!catId) continue
    if (qIdByKey.has(key)) {
      if (updateExisting && r.q_fr) {
        const qid = qIdByKey.get(key)!
        const prev = existingQuestions.find((q) => String(q.id) === qid)
        if (prev && !prev.text_fr) {
          const { error } = await supabase
            .from('questions')
            .update({ text_fr: r.q_fr, sort_order: r.q_order || 0 })
            .eq('id', qid)
          if (error) throwImportError('Soru güncellenemedi', error)
          questionsUpdated += 1
        }
      }
      continue
    }
    questionsToInsert.push({
      category_id: catId,
      text: r.q_tr,
      text_fr: r.q_fr || null,
      sort_order: r.q_order || 0,
      is_active: true,
    })
  }

  for (const batch of chunkArray(questionsToInsert, 40)) {
    const { data: ins, error } = await supabase.from('questions').insert(batch).select('id, text, category_id')
    if (error) throwImportError('Soru eklenemedi', error)
    for (const q of ins || []) {
      const catName = catIdToName.get(String(q.category_id))
      if (catName) qIdByKey.set(`${catName}::${q.text}`, String(q.id))
      questionsCreated += 1
    }
  }

  const allQIds = [...new Set([...qIdByKey.values()])]
  const existingAnswerIdByKey = new Map<string, string>()
  for (const batch of chunkArray(allQIds, 40)) {
    const { data, error } = await supabase
      .from('question_answers')
      .select('id, question_id, text')
      .in('question_id', batch)
    if (error) throwImportError('Cevaplar okunamadı', error)
    for (const a of data || []) {
      existingAnswerIdByKey.set(`${a.question_id}::${a.text}`, String(a.id))
    }
  }

  const answersToInsert: Array<Record<string, unknown>> = []
  const answersToUpdate: Array<{ id: string; payload: Record<string, unknown> }> = []
  const answerSeen = new Set<string>()

  for (const r of rows) {
    const qKey = `${r.cat_tr}::${r.q_tr}`
    const qid = qIdByKey.get(qKey)
    if (!qid) continue
    const dedupe = `${qid}::${r.a_tr}`
    if (answerSeen.has(dedupe)) continue
    answerSeen.add(dedupe)

    const payload: Record<string, unknown> = {
      question_id: qid,
      text: r.a_tr,
      text_fr: r.a_fr || null,
      level: resolveImportAnswerLevel(r),
      std_score: r.std_score,
      reel_score: r.reel_score,
      sort_order: r.a_order || 0,
      is_active: true,
    }

    const existingId = existingAnswerIdByKey.get(dedupe)
    if (existingId) {
      if (updateExisting) answersToUpdate.push({ id: existingId, payload })
      continue
    }

    answersToInsert.push(payload)
  }

  for (const batch of chunkArray(answersToInsert, 80)) {
    const { error } = await supabase.from('question_answers').insert(batch)
    if (error) throwImportError('Cevap eklenemedi', error)
    answersCreated += batch.length
  }

  for (const batch of chunkArray(answersToUpdate, 40)) {
    for (const item of batch) {
      const { error } = await supabase.from('question_answers').update(item.payload).eq('id', item.id)
      if (error) throwImportError('Cevap güncellenemedi', error)
      answersUpdated += 1
    }
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
  if (delErr) throwImportError('Dönem soruları temizlenemedi', delErr)
  if (!questionIds.length) return 0
  let linked = 0
  for (let idx = 0; idx < questionIds.length; idx += 100) {
    const slice = questionIds.slice(idx, idx + 100)
    const payload = slice.map((qid, j) => ({
      period_id: periodId,
      question_id: qid,
      sort_order: idx + j + 1,
      is_active: true,
    }))
    const { error: insErr } = await supabase.from('evaluation_period_questions').insert(payload)
    if (insErr) throwImportError('Döneme soru bağlanamadı', insErr)
    linked += slice.length
  }
  return linked
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

      const allCatNames = [...new Set(preview.rows.map((r) => r.cat_tr))]
      let catNamesToLink = allCatNames
      const linkCatsRaw = String(form.get('link_period_categories') || '').trim()
      if (linkCatsRaw) {
        try {
          const parsed = JSON.parse(linkCatsRaw) as unknown
          if (Array.isArray(parsed) && parsed.length) {
            const want = new Set(parsed.map((x) => String(x).trim()).filter(Boolean))
            catNamesToLink = allCatNames.filter((n) => want.has(n))
          }
        } catch {
          // ignore invalid JSON → link all
        }
      }
      const { data: cats } = await supabase
        .from('question_categories')
        .select('id')
        .eq('main_category_id', mainId)
        .in('name', catNamesToLink)
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
    const message = e?.message || 'İçe aktarma hatası'
    const status = message.includes('Yetkisiz') ? 401 : 500
    return NextResponse.json(
      {
        success: false,
        error: message,
        stage: e?.stage || null,
        code: e?.code || null,
      },
      { status }
    )
  }
}
