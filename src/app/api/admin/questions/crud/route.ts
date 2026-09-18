import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { resolveBackend, buildActor } from '@/lib/server/admin-db'
import { withActor } from '@/lib/server/secure-query'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// =====================================================================
// POST /api/admin/questions/crud — global soru bankası yaz (pg göçü)
// Önceden admin/questions sayfası ekleme/düzenleme/silmeyi DOĞRUDAN Supabase'e
// yapıyordu → değerlendirme formu (PG'den okur) bu değişiklikleri görmüyordu.
// Bu route yazmayı PG'ye taşır (Supabase fallback korunur).
// GÜVENLİK (B-3): global banka yalnız super_admin tarafından değiştirilebilir.
// Tablo adları ve kolonlar KODDAN SABİT beyaz-liste; değerler $N parametre.
// =====================================================================

type Entity = 'main' | 'categories' | 'questions' | 'answers'
type Op = 'insert' | 'update' | 'delete'

const TABLE: Record<Entity, string> = {
  main: 'main_categories',
  categories: 'question_categories',
  questions: 'questions',
  answers: 'question_answers',
}

// Yazılabilir kolonlar (id/created_at hariç) — payload yalnız bunlarla sınırlanır
const COLS: Record<Entity, string[]> = {
  main: ['name', 'description', 'sort_order', 'is_active', 'language', 'name_en', 'name_fr'],
  categories: ['main_category_id', 'name', 'description', 'sort_order', 'is_active', 'name_en', 'name_fr'],
  questions: ['category_id', 'text', 'sort_order', 'is_active', 'text_en', 'text_fr'],
  answers: [
    'question_id',
    'text',
    'text_fr',
    'text_en',
    'level',
    'level_en',
    'level_fr',
    'std_score',
    'reel_score',
    'sort_order',
    'is_active',
  ],
}

type Body = { entity?: Entity; op?: Op; id?: string; payload?: Record<string, unknown> }

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

/** payload'ı entity beyaz-listesine göre süz (bilinmeyen/enjeksiyon kolonlarını at) */
function pickCols(entity: Entity, payload: Record<string, unknown>) {
  const allow = COLS[entity]
  const cols: string[] = []
  const vals: unknown[] = []
  for (const c of allow) {
    if (Object.prototype.hasOwnProperty.call(payload, c)) {
      cols.push(c)
      vals.push(payload[c])
    }
  }
  return { cols, vals }
}

export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s) return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  // B-3: global soru bankası yazımı yalnız super_admin
  if (s.role !== 'super_admin') {
    return NextResponse.json(
      { success: false, error: 'Global soru bankası yalnızca süper admin tarafından değiştirilebilir' },
      { status: 403 }
    )
  }

  const rl = await rateLimitByUser(req, 'admin:questions:crud', String(s.uid || ''), 60, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json({ success: false, error: 'Çok fazla istek' }, { status: 429, headers: rl.headers })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  const entity = body.entity
  const op = body.op
  if (!entity || !(entity in TABLE)) {
    return NextResponse.json({ success: false, error: 'Geçersiz entity' }, { status: 400 })
  }
  if (op !== 'insert' && op !== 'update' && op !== 'delete') {
    return NextResponse.json({ success: false, error: 'Geçersiz op' }, { status: 400 })
  }
  const table = TABLE[entity]
  const id = String(body.id || '').trim()
  if ((op === 'update' || op === 'delete') && !id) {
    return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400 })
  }

  let cols: string[] = []
  let vals: unknown[] = []
  if (op === 'insert' || op === 'update') {
    const picked = pickCols(entity, body.payload || {})
    cols = picked.cols
    vals = picked.vals
    if (!cols.length) return NextResponse.json({ success: false, error: 'Geçerli alan yok' }, { status: 400 })
  }

  const backend = resolveBackend()
  if (!backend) return NextResponse.json({ success: false, error: 'Veri kaynağı yapılandırması eksik' }, { status: 503 })

  try {
    if (backend.mode === 'pg') {
      const resultId = await withActor(buildActor(s), async (c) => {
        if (op === 'insert') {
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
          const { rows } = await c.query<{ id: string }>(
            `insert into ${table} (${cols.join(', ')}) values (${placeholders}) returning id`,
            vals
          )
          return rows[0]?.id ?? null
        }
        if (op === 'update') {
          const setClause = cols.map((col, i) => `${col} = $${i + 1}`).join(', ')
          await c.query(`update ${table} set ${setClause} where id = $${cols.length + 1}`, [...vals, id])
          return id
        }
        // delete
        await c.query(`delete from ${table} where id = $1`, [id])
        return id
      })
      return NextResponse.json({ success: true, id: resultId })
    }

    // ---- Supabase yolu (deploy güvenli fallback) ----
    const supabase = backend.supabase
    const payloadObj: Record<string, unknown> = {}
    cols.forEach((c, i) => (payloadObj[c] = vals[i]))
    if (op === 'insert') {
      const { data, error } = await supabase.from(table).insert(payloadObj).select('id').single()
      if (error) throw error
      return NextResponse.json({ success: true, id: data?.id ?? null })
    }
    if (op === 'update') {
      const { error } = await supabase.from(table).update(payloadObj).eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true, id })
    }
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true, id })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error)?.message || 'İşlem başarısız' },
      { status: 400 }
    )
  }
}
