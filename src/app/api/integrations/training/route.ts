import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { logIntegration, verifyInboundApiKey } from '@/lib/server/inspirasuite'
import { isPgEnabled } from '@/lib/db'
import { withActor } from '@/lib/server/secure-query'

export const runtime = 'nodejs'

function getSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !service) return null
  return createClient(supabaseUrl, service)
}

// GET — InspiraSuite "Bağlantıyı Test Et" sağlık kontrolü (inbound).
// Header: x-api-key == paylaşılan anahtar (POST ile aynı doğrulama). Veri yazmaz.
export async function GET(req: NextRequest) {
  if (!(await verifyInboundApiKey(req.headers.get('x-api-key')))) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }
  return NextResponse.json({ success: true, service: 'visio360-training', ts: Date.now() })
}

// POST — InspiraSuite'ten gelen "eğitim tamamlandı" bildirimi (inbound webhook)
// Header: x-api-key == paylaşılan anahtar (InspiraSuite'te VISIO360PDS_API_KEY)
// Body: { user_email, user_name?, course_id, course_title, score?, completed_at?, certificate_url?, certificate_no? }
export async function POST(req: NextRequest) {
  if (!(await verifyInboundApiKey(req.headers.get('x-api-key')))) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const body = (await req.json().catch(() => ({}))) as {
    user_email?: string
    user_name?: string
    course_id?: string
    course_title?: string
    score?: number | null
    completed_at?: string
    certificate_url?: string | null
    certificate_no?: string | null
  }

  const email = String(body.user_email || '').trim().toLowerCase()
  if (!email) {
    await logIntegration(supabase, {
      direction: 'inbound',
      event_type: 'training_complete',
      status: 'error',
      payload: body,
      error: 'user_email eksik',
    })
    return NextResponse.json({ success: false, error: 'user_email gerekli' }, { status: 400 })
  }

  // Kalıcı tamamlanma kaydı (kişi + kurs bazında upsert). Best-effort.
  let persisted = false
  const completedAt = body.completed_at || new Date().toISOString()
  const scoreVal = typeof body.score === 'number' ? body.score : body.score ? Number(body.score) : null
  if (isPgEnabled()) {
    // YAZMA (hibrit): webhook — OTURUM YOK → sistem aktörü (super_admin, org null).
    // training_completions GLOBAL tablo (organization_id yok) → RLS org_isolation yok; sistem
    // aktörü tam yetkili. conflict cols supabase onConflict ile BİREBİR: (user_email, course_id).
    // Kolon adları KODDAN sabit → enjeksiyon yok; değerler $N param.
    try {
      await withActor({ role: 'super_admin', orgId: null, userId: 'system' }, async (c) => {
        await c.query(
          `insert into training_completions
             (user_email, course_id, course_title, score, certificate_no, certificate_url, source, completed_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (user_email, course_id) do update set
             course_title = excluded.course_title,
             score = excluded.score,
             certificate_no = excluded.certificate_no,
             certificate_url = excluded.certificate_url,
             source = excluded.source,
             completed_at = excluded.completed_at,
             updated_at = excluded.updated_at`,
          [
            email,
            body.course_id ?? null,
            body.course_title ?? null,
            scoreVal,
            body.certificate_no ?? null,
            body.certificate_url ?? null,
            'inspirasuite',
            completedAt,
            new Date().toISOString(),
          ]
        )
      })
      persisted = true
    } catch (e) {
      persisted = false
      await logIntegration(supabase, {
        direction: 'inbound',
        event_type: 'training_complete',
        user_email: email,
        status: 'error',
        payload: { course_id: body.course_id ?? null, course_title: body.course_title ?? null },
        error: (e as Error)?.message || 'pg upsert hatası',
      })
    }
  } else if (supabase) {
    const { error } = await supabase.from('training_completions').upsert(
      {
        user_email: email,
        course_id: body.course_id ?? null,
        course_title: body.course_title ?? null,
        score: scoreVal,
        certificate_no: body.certificate_no ?? null,
        certificate_url: body.certificate_url ?? null,
        source: 'inspirasuite',
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_email,course_id' }
    )
    persisted = !error
    if (error) {
      await logIntegration(supabase, {
        direction: 'inbound',
        event_type: 'training_complete',
        user_email: email,
        status: 'error',
        payload: { course_id: body.course_id ?? null, course_title: body.course_title ?? null },
        error: error.message,
      })
    }
  }

  await logIntegration(supabase, {
    direction: 'inbound',
    event_type: 'training_complete',
    user_email: email,
    payload: {
      course_id: body.course_id ?? null,
      course_title: body.course_title ?? null,
      score: body.score ?? null,
      completed_at: body.completed_at ?? null,
      certificate_no: body.certificate_no ?? null,
      certificate_url: body.certificate_url ?? null,
      persisted,
    },
  })

  return NextResponse.json({ success: true, received: true, persisted })
}
