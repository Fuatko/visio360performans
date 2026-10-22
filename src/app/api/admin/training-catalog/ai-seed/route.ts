import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { isPgEnabled } from '@/lib/db'
import { withActor } from '@/lib/server/secure-query'
import { buildActor } from '@/lib/server/admin-db'
import { openaiJson } from '@/lib/server/openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DEFAULT_THRESHOLD = 3.5

type GapRow = {
  category_name: string
  kisi: number
  en_dusuk: number
  ortalama: number
}

type Suggestion = {
  category: string
  title: string
  area: string
  format: string
  program_weeks: number | null
  training_hours: number | null
  level: string
  tags: string[]
  rationale: string
}

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

// POST — dönemdeki yetkinlik açıklarına karşılık gelen eğitim önerilerini üretir.
// Yazma yapmaz. Yapay zekâya KİŞİSEL VERİ GÖNDERİLMEZ: yalnız kategori adı ve
// puan istatistikleri gider (KVKK: isim / e-posta / departman yok).
export async function POST(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'admin:training-ai-seed', String(s.uid || ''), 6, 60 * 1000)
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  if (!isPgEnabled()) {
    return NextResponse.json(
      { success: false, error: 'Bu uç yalnızca PostgreSQL arka ucuyla çalışır' },
      { status: 503 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    period_id?: string
    org_id?: string
    threshold?: number
    lang?: string
  }

  const periodId = String(body.period_id || '').trim()
  const orgIdParam = String(body.org_id || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : orgIdParam

  if (!periodId || !orgId) {
    return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })
  }

  // Dönem/kurum sahipliği: org_admin başka kurumun dönemini sorgulayamaz.
  // (evaluation_assignments / evaluation_responses tablolarında FORCE RLS henüz
  // verilmediği için bu kontrol kod tarafında şart.)
  const { data: period, error: pErr } = await withActor(buildActor(s), (c) =>
    c.query('select id, organization_id from evaluation_periods where id = $1 limit 1', [periodId])
  )
    .then((r) => ({ data: (r.rows[0] ?? null) as { organization_id?: string } | null, error: null as unknown }))
    .catch((e) => ({ data: null as { organization_id?: string } | null, error: e as unknown }))

  if (pErr || !period) {
    return NextResponse.json({ success: false, error: 'Dönem bulunamadı' }, { status: 404 })
  }
  if (String(period.organization_id || '') !== orgId) {
    return NextResponse.json({ success: false, error: 'Dönem/kurum uyuşmuyor' }, { status: 403 })
  }

  const threshold =
    typeof body.threshold === 'number' && Number.isFinite(body.threshold)
      ? body.threshold
      : DEFAULT_THRESHOLD

  const lang = body.lang === 'en' || body.lang === 'fr' ? body.lang : 'tr'

  // 1) Açık çıkan kategoriler: kişi-kategori ekip ortalaması eşiğin altındaysa.
  //    Öz değerlendirme hariç, "fikrim yok" / 0 puan hariç.
  const gapSql = `
    with c as (
      select a.target_id, r.category_name, avg(r.reel_score) as ort
      from evaluation_assignments a
      join evaluation_responses r on r.assignment_id = a.id
      where a.period_id = $1
        and a.status = 'completed'
        and a.evaluator_id <> a.target_id
        and r.reel_score > 0
        and coalesce(trim(r.category_name), '') <> ''
      group by 1, 2
    )
    select category_name,
           count(*)::int as kisi,
           round(min(ort)::numeric, 2)::float8 as en_dusuk,
           round(avg(ort)::numeric, 2)::float8 as ortalama
    from c
    where ort < $2
    group by 1
    order by count(*) desc, min(ort) asc
    limit 40`

  let gaps: GapRow[] = []
  try {
    const r = await withActor(buildActor(s), (c) => c.query<GapRow>(gapSql, [periodId, threshold]))
    gaps = r.rows || []
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Açık listesi alınamadı'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }

  if (!gaps.length) {
    return NextResponse.json({
      success: true,
      threshold,
      gaps: [],
      items: [],
      note: 'Bu dönemde eşiğin altında kategori bulunamadı. Eşiği yükseltip tekrar deneyebilirsiniz.',
    })
  }

  // 2) Yapay zekâ önerisi — yalnız kategori adı ve istatistik gider.
  const system =
    'Sen kurumsal İK ve öğrenme-gelişim uzmanısın. YALNIZCA geçerli JSON döndür, markdown kullanma. ' +
    'Kişisel veri üretme veya isteme. Öneriler Türkiye kurumsal eğitim pazarında karşılığı olan, ' +
    'gerçekçi ve uygulanabilir olsun.'

  const userPrompt = JSON.stringify({
    language: lang,
    scale: '1-5 (5 en yüksek)',
    threshold,
    instruction: [
      'Her yetkinlik açığı için BİR eğitim önerisi üret.',
      'title: eğitimin adı, kuruma sunulabilecek netlikte (ör. "Geri Bildirim Verme ve Zor Konuşmalar Atölyesi").',
      'area: kataloglama için kısa alan adı (2-4 kelime).',
      'format: egitim | atolye | kocluk | mentorluk — puan çok düşükse ve kişi sayısı azsa kocluk tercih et.',
      'program_weeks: 1-12 arası tam sayı. training_hours: 4-60 arası tam sayı.',
      'level: baslangic | orta | ileri.',
      'tags: 3 adet kısa anahtar kelime.',
      'rationale: tek cümle, neden bu eğitim.',
      'Çıktı dili: ' + lang,
    ],
    gaps: gaps.map((g) => ({
      category: g.category_name,
      people_count: g.kisi,
      lowest_score: g.en_dusuk,
      average_score: g.ortalama,
    })),
    output_schema: {
      items: [
        {
          category: 'string (girdideki category ile birebir aynı)',
          title: 'string',
          area: 'string',
          format: 'string',
          program_weeks: 'number',
          training_hours: 'number',
          level: 'string',
          tags: ['string'],
          rationale: 'string',
        },
      ],
    },
  })

  const ai = await openaiJson<{ items: Suggestion[] }>({
    system,
    user: userPrompt,
    temperature: 0.3,
    max_tokens: 2500,
    timeoutMs: 60000,
  })

  if (!ai.ok || !ai.data?.items?.length) {
    return NextResponse.json(
      {
        success: false,
        error: 'Yapay zekâ önerisi alınamadı',
        detail: !ai.ok ? ai.error || null : null,
        gaps,
        threshold,
      },
      { status: 502 }
    )
  }

  // 3) Öneriyi açık istatistikleriyle birleştir (arayüzde bağlam göstermek için).
  const statByCategory = new Map(gaps.map((g) => [g.category_name, g]))
  const items = ai.data.items.map((it) => {
    const stat = statByCategory.get(it.category)
    return {
      ...it,
      tags: Array.isArray(it.tags) ? it.tags.slice(0, 5).map((t) => String(t)) : [],
      people_count: stat?.kisi ?? null,
      lowest_score: stat?.en_dusuk ?? null,
      average_score: stat?.ortalama ?? null,
    }
  })

  return NextResponse.json({ success: true, threshold, gaps, items })
}
