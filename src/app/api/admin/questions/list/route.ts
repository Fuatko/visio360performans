import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { resolveBackend, buildActor } from '@/lib/server/admin-db'
import { withActor } from '@/lib/server/secure-query'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// =====================================================================
// GET /api/admin/questions/list — global soru bankası okuma (pg göçü)
// main_categories + question_categories + questions + question_answers
// Önceden admin/questions sayfası bunları DOĞRUDAN Supabase'den okuyordu;
// import ise PG'ye yazıyordu → yeni veriler ekranda görünmüyordu. Bu route
// okumayı PG'ye taşır (Supabase fallback deploy güvenliği için korunur).
// GÜVENLİK: super_admin + org_admin görebilir (global banka salt okuma).
// Kolon adları koddan sabit; tüm değerler parametreli/where'siz düz select.
// =====================================================================

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:questions:list', String(s.uid || ''), 120, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json({ success: false, error: 'Çok fazla istek' }, { status: 429, headers: rl.headers })
  }

  const backend = resolveBackend()
  if (!backend) return NextResponse.json({ success: false, error: 'Veri kaynağı yapılandırması eksik' }, { status: 503 })

  try {
    if (backend.mode === 'pg') {
      const data = await withActor(buildActor(s), async (c) => {
        const [mc, qc, q, qa] = await Promise.all([
          c.query(
            'select id, name, description, sort_order, is_active, created_at, name_en, name_fr, language from main_categories order by sort_order'
          ),
          c.query(
            'select id, main_category_id, name, description, sort_order, is_active, created_at, name_en, name_fr from question_categories order by sort_order'
          ),
          c.query(
            'select id, category_id, text, sort_order, is_active, created_at, text_en, text_fr from questions order by sort_order'
          ),
          c.query(
            'select id, question_id, text, level, std_score, reel_score, sort_order, is_active, created_at, text_en, text_fr, level_en, level_fr from question_answers order by sort_order'
          ),
        ])
        return {
          mainCategories: mc.rows,
          categories: qc.rows,
          questions: q.rows,
          answers: qa.rows,
        }
      })

      // İç içe nesneleri (Supabase select şekliyle birebir) JS'te kur
      const mainById = new Map<string, any>(
        (data.mainCategories as any[]).map((m) => [String(m.id), { id: m.id, name: m.name }])
      )
      const categories = (data.categories as any[]).map((c) => ({
        ...c,
        main_categories: c.main_category_id ? mainById.get(String(c.main_category_id)) || null : null,
      }))
      const catById = new Map<string, any>(
        categories.map((c) => [
          String(c.id),
          {
            id: c.id,
            name: c.name,
            main_category_id: c.main_category_id,
            main_categories: c.main_categories,
          },
        ])
      )
      const questions = (data.questions as any[]).map((q) => ({
        ...q,
        question_categories: q.category_id ? catById.get(String(q.category_id)) || null : null,
      }))

      return NextResponse.json({
        success: true,
        mainCategories: data.mainCategories,
        categories,
        questions,
        answers: data.answers,
      })
    }

    // ---- Supabase yolu (deploy güvenli fallback — mevcut select şekilleri) ----
    const supabase = backend.supabase
    const [mainRes, catRes, qRes, aRes] = await Promise.all([
      supabase.from('main_categories').select('*').order('sort_order'),
      supabase.from('question_categories').select('*, main_categories(id,name)').order('sort_order'),
      supabase
        .from('questions')
        .select('*, question_categories(id,name,main_category_id, main_categories(id,name))')
        .order('sort_order'),
      supabase.from('question_answers').select('*').order('sort_order'),
    ])
    const err = mainRes.error || catRes.error || qRes.error || aRes.error
    if (err) return NextResponse.json({ success: false, error: err.message || 'Okuma hatası' }, { status: 400 })
    return NextResponse.json({
      success: true,
      mainCategories: mainRes.data || [],
      categories: catRes.data || [],
      questions: qRes.data || [],
      answers: aRes.data || [],
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error)?.message || 'Soru bankası okunamadı' },
      { status: 400 }
    )
  }
}
