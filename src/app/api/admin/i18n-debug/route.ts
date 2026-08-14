import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/server/session'
import { isPgEnabled } from '@/lib/db'
import { pgRead } from '@/lib/server/pg-read'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

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

function normKey(s: string) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9ğüşıöç\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase yapılandırması eksik' }, { status: 503 })

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') || 'fr').toLowerCase()
  const userId = (url.searchParams.get('user_id') || String(s.uid || '')).trim()
  const limit = Math.min(1000, Math.max(50, Number(url.searchParams.get('limit') || 200)))

  if (!userId) return NextResponse.json({ success: false, error: 'user_id gerekli' }, { status: 400 })

  // Load assignments for target user (completed)
  const { data: assigns, error: aErr } = isPgEnabled()
    ? await pgRead<{ id: string; target_id: string; status: string }>(
        'select id, target_id, status from evaluation_assignments where target_id = $1 and status = $2 order by completed_at desc limit 2500',
        [userId, 'completed']
      )
    : await supabase
        .from('evaluation_assignments')
        .select('id,target_id,status')
        .eq('target_id', userId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(2500)
  if (aErr) return NextResponse.json({ success: false, error: aErr.message || 'Atamalar alınamadı' }, { status: 400 })

  const assignmentIds = (assigns || []).map((a: any) => String(a?.id || '')).filter(Boolean)
  if (!assignmentIds.length) return NextResponse.json({ success: true, meta: { userId, limit }, counts: { assignments: 0 }, categories: [] })

  const responseAssignmentIds = assignmentIds.slice(0, 2000)
  const { data: responses, error: rErr } = isPgEnabled()
    ? await pgRead<{ assignment_id: string; question_id: string; category_name: string }>(
        'select assignment_id, question_id, category_name from evaluation_responses where assignment_id = any($1::uuid[]) order by created_at desc limit $2',
        [responseAssignmentIds, limit]
      )
    : await supabase
        .from('evaluation_responses')
        .select('assignment_id,question_id,category_name')
        .in('assignment_id', responseAssignmentIds)
        .order('created_at', { ascending: false })
        .limit(limit)
  if (rErr) return NextResponse.json({ success: false, error: rErr.message || 'Yanıtlar alınamadı' }, { status: 400 })

  const rows = (responses || []) as any[]
  const missingQuestionId = rows.filter((r) => !String(r?.question_id || '').trim()).length
  const missingCategoryName = rows.filter((r) => !String(r?.category_name || '').trim()).length

  // Build translation maps from category tables
  const pick = (row: any) => {
    if (!row) return ''
    if (lang === 'fr') return String(row.name_fr || row.name || '')
    if (lang === 'en') return String(row.name_en || row.name || '')
    return String(row.name || '')
  }
  const directMap = new Map<string, string>()
  const normMap = new Map<string, string>()
  const add = (name: string, label: string) => {
    const k = String(name || '').trim()
    const v = String(label || '').trim()
    if (!k || !v) return
    directMap.set(k, v)
    const nk = normKey(k)
    if (nk && !normMap.has(nk)) normMap.set(nk, v)
  }
  try {
    const [catsRes, qCatsRes] = isPgEnabled()
      ? await Promise.all([
          pgRead<{ name: string; name_en: string; name_fr: string }>('select name, name_en, name_fr from categories'),
          pgRead<{ name: string; name_en: string; name_fr: string }>('select name, name_en, name_fr from question_categories'),
        ])
      : await Promise.all([
          supabase.from('categories').select('name,name_en,name_fr'),
          supabase.from('question_categories').select('name,name_en,name_fr'),
        ])
    ;((catsRes.data || []) as any[]).forEach((r) => add(String(r?.name || ''), pick(r) || String(r?.name || '')))
    ;((qCatsRes.data || []) as any[]).forEach((r) => add(String(r?.name || ''), pick(r) || String(r?.name || '')))
  } catch {
    // ignore
  }

  // Build question->category mapping (if question_id exists)
  const qIds = Array.from(new Set(rows.map((r) => String(r?.question_id || '').trim()).filter(Boolean)))
  const qToCat = new Map<string, { key: string; label: string }>()
  if (qIds.length) {
    const fetchQ = async (mode: 'question_categories' | 'categories') => {
      if (isPgEnabled()) {
        const tbl = mode === 'question_categories' ? 'question_categories' : 'categories'
        return await pgRead<{ id: string; [k: string]: unknown }>(
          `select q.id,
                  case when c.id is not null then jsonb_build_object('name', c.name, 'name_en', c.name_en, 'name_fr', c.name_fr) else null end as ${tbl}
             from questions q
             left join ${tbl} c on c.id = q.category_id
            where q.id = any($1::uuid[])`,
          [qIds]
        )
      }
      const select =
        mode === 'question_categories'
          ? 'id, question_categories:category_id(name,name_en,name_fr)'
          : 'id, categories:category_id(name,name_en,name_fr)'
      return await supabase.from('questions').select(select).in('id', qIds)
    }
    let qRes: any = await fetchQ('question_categories')
    if (qRes?.error) qRes = await fetchQ('categories')
    if (qRes && !qRes.error) {
      ;((qRes.data || []) as any[]).forEach((q) => {
        const cat = (q as any)?.question_categories || (q as any)?.categories
        const key = String(cat?.name || '').trim()
        const label = (pick(cat) || key).trim()
        if (!key || !label) return
        qToCat.set(String((q as any)?.id || ''), { key, label })
      })
    }
  }

  // Aggregate raw category_name frequency and translation hit rate
  const freq = new Map<string, { n: number; translated: number; via: 'direct' | 'norm' | 'question' | 'none' }>()
  const translate = (raw: string, qid: string) => {
    const r = String(raw || '').trim()
    if (!r) return { label: '', via: 'none' as const }
    if (r.toLowerCase() === 'genel') return { label: lang === 'fr' ? 'Général' : lang === 'en' ? 'General' : 'Genel', via: 'direct' as const }
    const q = qid ? qToCat.get(qid) : null
    if (q?.label) return { label: q.label, via: 'question' as const }
    const d = directMap.get(r)
    if (d) return { label: d, via: 'direct' as const }
    const n = normMap.get(normKey(r))
    if (n) return { label: n, via: 'norm' as const }
    return { label: r, via: 'none' as const }
  }

  rows.forEach((x) => {
    const raw = String(x?.category_name || '').trim() || 'Genel'
    const qid = String(x?.question_id || '').trim()
    const cur = freq.get(raw) || { n: 0, translated: 0, via: 'none' as const }
    cur.n += 1
    const t = translate(raw, qid)
    if (t.via !== 'none') cur.translated += 1
    cur.via = t.via
    freq.set(raw, cur)
  })

  const categories = Array.from(freq.entries())
    .map(([raw, v]) => ({ raw, count: v.n, translatedCount: v.translated, via: v.via }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50)

  return NextResponse.json(
    {
      success: true,
      meta: { userId, limit, lang },
      counts: {
        assignments: assignmentIds.length,
        responses: rows.length,
        missingQuestionId,
        missingCategoryName,
        distinctCategoryNames: freq.size,
      },
      categories,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}

