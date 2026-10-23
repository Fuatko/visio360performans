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
/** Bir kategoride bu kadar veya daha fazla kişi açık veriyorsa grup eğitimi önerilir. */
const GROUP_MIN_PEOPLE = 3
/** Kurum kapasitesi: tek bir eğitim en fazla 2 gün (16 saat) sürebilir. */
const MAX_TRAINING_HOURS = 16
const MAX_PROGRAM_WEEKS = 2

type GapRow = { target_id: string; category_name: string; puan: number }

type AiGroupItem = {
  category: string
  title: string
  area: string
  format: string
  delivery?: string
  program_weeks: number
  training_hours: number
  level: string
  tags: string[]
  rationale: string
}

type AiBundleItem = AiGroupItem & { person_ref: string; covers: string[] }

function sessionFromReq(req: NextRequest) {
  return verifySession(req.cookies.get('visio360_session')?.value)
}

function asciiFold(v: unknown): string {
  // Türkçe büyük harfler ÖNCE sadeleştirilir: 'İ'.toLowerCase() 'i' + U+0307 üretir,
  // sonradan yapılan değiştirme eşleşmez. Artakalan birleşik nokta da temizlenir.
  return String(v ?? '')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ç/g, 'C')
    .replace(/Ö/g, 'O')
    .replace(/Ü/g, 'U')
    .toLowerCase()
    .replace(/̇/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .trim()
}

function normLevel(v: unknown): 'baslangic' | 'orta' | 'ileri' {
  const s = asciiFold(v)
  if (s.startsWith('bas')) return 'baslangic'
  if (s.startsWith('ile')) return 'ileri'
  return 'orta'
}

function normFormat(v: unknown): 'egitim' | 'atolye' | 'kocluk' | 'mentorluk' {
  const s = asciiFold(v)
  if (s.startsWith('ato')) return 'atolye'
  if (s.startsWith('koc')) return 'kocluk'
  if (s.startsWith('men')) return 'mentorluk'
  return 'egitim'
}

/** Sunum biçimi: yüz yüze sınıf, SCORM (e-öğrenme paketi) veya karma. */
function normDelivery(v: unknown): 'yuz_yuze' | 'scorm' | 'karma' {
  const s = asciiFold(v)
  if (s.includes('scorm') || s.includes('e-og') || s.includes('eog') || s.includes('online') || s.includes('dijital')) {
    return 'scorm'
  }
  if (s.includes('karma') || s.includes('hibrit') || s.includes('blend')) return 'karma'
  return 'yuz_yuze'
}

function normArea(v: unknown): string {
  const raw = String(v ?? '').trim().replace(/\s+/g, ' ')
  if (!raw) return 'Genel'
  const MINOR_WORDS = new Set(['ve', 'ile', 'veya', 'ya', 'da', 'de'])
  const titleCase = (s: string) =>
    s
      .split(' ')
      .map((w, i) => {
        if (!w.length) return w
        // Bağlaçlar küçük kalır ("Mali Analiz ve Raporlama"), ilk kelime hariç.
        if (i > 0 && MINOR_WORDS.has(w.toLocaleLowerCase('tr'))) return w.toLocaleLowerCase('tr')
        return w[0].toLocaleUpperCase('tr') + w.slice(1)
      })
      .join(' ')
  // Virgülle ayrılmış parçalar bütün olarak alınır; kelime sınırı aşılınca
  // parçanın ortasından kesmek yerine o parça hiç alınmaz.
  const segments = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const picked: string[] = []
  let words = 0
  for (const seg of segments) {
    const segWords = seg.split(' ')
    // İlk parça da 4 kelimeyle sınırlı (virgülsüz uzun değerler için).
    const trimmed = picked.length ? seg : segWords.slice(0, 4).join(' ')
    const n = trimmed.split(' ').length
    if (picked.length && words + n > 4) break
    picked.push(titleCase(trimmed))
    words += n
    if (words >= 4) break
  }
  return picked.join(', ') || 'Genel'
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Model bir girdiyi atlarsa kural tabanlı yedek öneri üretir. */
function fallbackFormat(score: number, peopleCount: number): 'egitim' | 'atolye' | 'kocluk' {
  if (peopleCount >= GROUP_MIN_PEOPLE) return 'egitim'
  if (score < 3.2) return 'kocluk'
  return 'atolye'
}

function fallbackTitle(category: string, format: string): string {
  const base = category.split(',')[0].trim() || category.trim()
  if (format === 'kocluk') return `${base} Koçluğu`
  if (format === 'atolye') return `${base} Atölyesi`
  return `${base} Eğitimi`
}

function fallbackArea(category: string): string {
  return normArea(category.split(',').slice(0, 2).join(' ').replace(/\s+/g, ' '))
}

function fallbackRationale(categories: string[], lowest: number): string {
  const list = categories.join(', ')
  return `Ekip değerlendirmesinde ${list} alanında ortalama ${lowest.toFixed(2)} puan alınmış; bu alanlarda gözlenen davranışlar beklentinin altında kalıyor. Program sonunda bu alanlarda ölçülebilir bir iyileşme hedefleniyor.`
}

function normTags(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((t) => String(t).trim()).filter(Boolean).slice(0, 5)
}

// POST — dönemdeki yetkinlik açıklarına karşılık eğitim önerisi üretir.
// Yazma yapmaz. Yapay zekâya kişisel veri gönderilmez (takma referans kullanılır).
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
    return NextResponse.json({ success: false, error: 'Bu uç yalnızca PostgreSQL arka ucuyla çalışır' }, { status: 503 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    period_id?: string
    org_id?: string
    threshold?: number
    lang?: string
    stats_only?: boolean
  }

  const periodId = String(body.period_id || '').trim()
  const orgIdParam = String(body.org_id || '').trim()
  const orgId = s.role === 'org_admin' ? String(s.org_id || '') : orgIdParam

  if (!periodId || !orgId) {
    return NextResponse.json({ success: false, error: 'period_id ve org_id gerekli' }, { status: 400 })
  }

  const threshold =
    typeof body.threshold === 'number' && Number.isFinite(body.threshold) ? body.threshold : DEFAULT_THRESHOLD
  const lang = body.lang === 'en' || body.lang === 'fr' ? body.lang : 'tr'

  // Dönem/kurum sahipliği (evaluation_assignments / _responses tablolarında FORCE RLS
  // henüz verilmediği için kod tarafında şart).
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

  // Dönemin kişi-kategori dağılımı: eşik önerisi ve bağlam için.
  const statsSql = `
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
    select count(*)::int as pairs,
           round(avg(ort)::numeric, 2)::float8 as ortalama,
           round(min(ort)::numeric, 2)::float8 as en_dusuk,
           round(max(ort)::numeric, 2)::float8 as en_yuksek,
           round(percentile_cont(0.10) within group (order by ort)::numeric, 2)::float8 as p10,
           round(percentile_cont(0.25) within group (order by ort)::numeric, 2)::float8 as p25
    from c`

  type PeriodStats = {
    pairs: number
    ortalama: number
    en_dusuk: number
    en_yuksek: number
    p10: number
    p25: number
  }
  let periodStats: PeriodStats | null = null
  try {
    const r = await withActor(buildActor(s), (c) => c.query(statsSql, [periodId]))
    periodStats = (r.rows[0] as PeriodStats | undefined) ?? null
  } catch {
    periodStats = null
  }

  // Önerilen eşik: dağılımın 10. yüzdeliği (yaklaşık en zayıf %10).
  const suggestedThreshold =
    periodStats && periodStats.pairs > 0 && Number.isFinite(periodStats.p10)
      ? Math.min(4.5, Math.max(1, Math.round(periodStats.p10 * 100) / 100))
      : DEFAULT_THRESHOLD

  if (body.stats_only === true) {
    return NextResponse.json({
      success: true,
      stats: periodStats,
      suggested_threshold: suggestedThreshold,
    })
  }

  // 1) Kişi-kategori açıkları (öz değerlendirme ve puansız cevaplar hariç)
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
    select target_id::text as target_id,
           category_name,
           round(ort::numeric, 2)::float8 as puan
    from c
    where ort < $2
    order by target_id, ort
    limit 500`

  let rows: GapRow[] = []
  try {
    const r = await withActor(buildActor(s), (c) => c.query<GapRow>(gapSql, [periodId, threshold]))
    rows = r.rows || []
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Açık listesi alınamadı'
    return NextResponse.json({ success: false, error: msg }, { status: 400 })
  }

  if (!rows.length) {
    return NextResponse.json({
      success: true,
      threshold,
      gaps: [],
      group_items: [],
      bundle_items: [],
      note: 'Bu dönemde eşiğin altında kategori bulunamadı. Eşiği yükseltip tekrar deneyebilirsiniz.',
    })
  }

  // 2) Takma referanslar (yapay zekâya isim gitmez) + kategori istatistikleri
  const personRefById = new Map<string, string>()
  const gapsByPerson = new Map<string, Array<{ category: string; score: number }>>()
  const catStats = new Map<string, { count: number; lowest: number; total: number }>()

  for (const row of rows) {
    const tid = String(row.target_id)
    if (!personRefById.has(tid)) personRefById.set(tid, `K${personRefById.size + 1}`)
    const list = gapsByPerson.get(tid) || []
    list.push({ category: row.category_name, score: Number(row.puan) })
    gapsByPerson.set(tid, list)

    const cur = catStats.get(row.category_name) || { count: 0, lowest: 99, total: 0 }
    cur.count += 1
    cur.total += Number(row.puan)
    cur.lowest = Math.min(cur.lowest, Number(row.puan))
    catStats.set(row.category_name, cur)
  }

  const gaps = Array.from(catStats.entries())
    .map(([category_name, v]) => ({
      category_name,
      kisi: v.count,
      en_dusuk: Math.round(v.lowest * 100) / 100,
      ortalama: Math.round((v.total / v.count) * 100) / 100,
    }))
    .sort((a, b) => b.kisi - a.kisi || a.en_dusuk - b.en_dusuk)

  const groupGaps = gaps.filter((g) => g.kisi >= GROUP_MIN_PEOPLE)
  const groupCategorySet = new Set(groupGaps.map((g) => g.category_name))

  // Kişisel program yalnız grup eğitiminin kapsamadığı açıklar için kurulur.
  // Tüm açıkları grupça kapsanan kişi listeye girmez (çifte öneri olmasın).
  const bundles = Array.from(gapsByPerson.entries())
    .map(([tid, list]) => {
      const individual = list.filter((g) => !groupCategorySet.has(g.category))
      const coveredByGroup = list.filter((g) => groupCategorySet.has(g.category))
      return {
        tid,
        person_ref: personRefById.get(tid) as string,
        gaps: individual.sort((a, b) => a.score - b.score),
        covered_by_group: coveredByGroup.map((g) => g.category),
      }
    })
    .filter((b) => b.gaps.length >= 1)
    .map(({ person_ref, gaps: g, covered_by_group }) => ({
      person_ref,
      gaps: g,
      covered_by_group,
    }))

  // 3) Yapay zekâ önerisi
  const system =
    'Sen kurumsal İK ve öğrenme-gelişim uzmanısın. YALNIZCA geçerli JSON döndür, markdown kullanma. ' +
    'Kişisel veri üretme veya isteme. Öneriler Türkiye kurumsal eğitim pazarında karşılığı olan, ' +
    'gerçekçi ve uygulanabilir olsun. Genel geçer cümleler kurma.'

  const userPrompt = JSON.stringify({
    language: lang,
    scale: '1-5 (5 en yüksek, 3.5 altı gelişim gerektirir)',
    threshold,
    rules: [
      'group_gaps: bu kategorilerde birden çok kişi açık veriyor → her biri için BİR grup eğitimi öner.',
      'individual_bundles: bir kişinin grup eğitimiyle kapsanmayan açıkları → o kişi için TEK birleşik program öner, ayrı ayrı değil.',
      'covered_by_group alanındaki kategoriler o kişi için grup eğitimiyle zaten ele alınıyor; kişisel programda onları tekrar etme, covers listesine de ekleme.',
      'format: egitim | atolye | kocluk | mentorluk. Grup ihtiyacında egitim veya atolye; tek kişide ve puan 3.2 altındaysa kocluk tercih et.',
      'level: SADECE şu üç değerden biri, Türkçe karakter kullanma: baslangic, orta, ileri.',
      'area: kataloglama için 2-4 kelime, her kelimenin ilk harfi büyük.',
      'SÜRE TAVANI: Kurum kapasitesi gereği hiçbir eğitim 2 günü (16 saat) geçemez. training_hours 1-16 arası olmalı, tipik 4-8. program_weeks 1-2 olmalı.',
      'Bir kişinin birden çok açığı varsa programı uzatma; en kritik 1-2 konuya odaklan ve yine 16 saati aşma.',
      'delivery: yuz_yuze | scorm | karma. SCORM, PowerPoint tabanlı e-öğrenme paketidir. Saha ve operasyon rollerine yönelik temel konularda (hijyen, iş yeri düzeni, iş disiplini, güvenlik kuralları) scorm tercih et — bu kadroları aynı anda sınıfa toplamak zordur. Davranış ve iletişim becerisi gerektiren konularda yuz_yuze veya karma seç.',
      'tags: 3 adet kısa anahtar kelime.',
      'rationale: İKİ cümle. Birinci cümle bu açığın işyerinde pratikte neye benzediğini somut olarak anlatsın. İkinci cümle eğitim sonunda hangi davranışın değişmiş olacağını söylesin. "Yardımcı olacaktır", "geliştirecektir" gibi genel ifadeler KULLANMA.',
      'bundle_items içinde covers: o programın kapsadığı kategori adları (girdiyle birebir aynı yazım).',
      'Çıktı dili: ' + lang,
    ],
    group_gaps: groupGaps.map((g) => ({
      category: g.category_name,
      people_count: g.kisi,
      lowest_score: g.en_dusuk,
      average_score: g.ortalama,
    })),
    individual_bundles: bundles,
    output_schema: {
      group_items: [
        {
          category: 'string (girdideki category ile birebir aynı)',
          title: 'string',
          area: 'string',
          format: 'egitim|atolye|kocluk|mentorluk',
          delivery: 'yuz_yuze|scorm|karma',
          program_weeks: 'number',
          training_hours: 'number',
          level: 'baslangic|orta|ileri',
          tags: ['string'],
          rationale: 'string (iki cümle)',
        },
      ],
      bundle_items: [
        {
          person_ref: 'string (girdideki person_ref)',
          title: 'string',
          area: 'string',
          format: 'egitim|atolye|kocluk|mentorluk',
          delivery: 'yuz_yuze|scorm|karma',
          program_weeks: 'number',
          training_hours: 'number',
          level: 'baslangic|orta|ileri',
          tags: ['string'],
          covers: ['string'],
          rationale: 'string (iki cümle)',
        },
      ],
    },
  })

  const ai = await openaiJson<{ group_items?: AiGroupItem[]; bundle_items?: AiBundleItem[] }>({
    system,
    user: userPrompt,
    temperature: 0.3,
    max_tokens: 3500,
    timeoutMs: 90000,
  })

  // Model çalışmazsa durma: aşağıdaki kural tabanlı yedek üretim tüm girdileri
  // doldurur. Yanıtta ai_available=false ile belirtilir.
  const aiAvailable = ai.ok && Boolean(ai.data?.group_items?.length || ai.data?.bundle_items?.length)
  const aiError = !ai.ok ? ai.error || null : null

  // 4) Normalizasyon + istatistik birleştirme
  const statByCategory = new Map(gaps.map((g) => [g.category_name, g]))

  const groupGapNames = new Set(groupGaps.map((g) => g.category_name))
  const seenGroupCategories = new Set<string>()

  const group_items = ((ai.ok ? ai.data.group_items : undefined) || [])
    // Girdide olmayan veya tekrar eden kategorileri ele.
    .filter((it) => {
      const cat = String(it?.category || '')
      if (!groupGapNames.has(cat)) return false
      if (seenGroupCategories.has(cat)) return false
      seenGroupCategories.add(cat)
      return true
    })
    .map((it) => {
    const stat = statByCategory.get(it.category)
    return {
      category: it.category,
      title: String(it.title || '').trim(),
      area: normArea(it.area),
      format: normFormat(it.format),
      delivery: normDelivery(it.delivery),
      level: normLevel(it.level),
      program_weeks: clampInt(it.program_weeks, 1, MAX_PROGRAM_WEEKS, 1),
      training_hours: clampInt(it.training_hours, 1, MAX_TRAINING_HOURS, 8),
      tags: normTags(it.tags),
      rationale: String(it.rationale || '').trim(),
      people_count: stat?.kisi ?? null,
      lowest_score: stat?.en_dusuk ?? null,
      average_score: stat?.ortalama ?? null,
    }
  })

  const aiMissing: string[] = []

  // Model bir grup kategorisini atladıysa yedek kayıt üret.
  const coveredGroupCategories = new Set(group_items.map((g) => g.category))
  for (const g of groupGaps) {
    if (coveredGroupCategories.has(g.category_name)) continue
    aiMissing.push(`grup: ${g.category_name}`)
    const format = fallbackFormat(g.en_dusuk, g.kisi)
    group_items.push({
      category: g.category_name,
      title: fallbackTitle(g.category_name, format),
      area: fallbackArea(g.category_name),
      format,
      delivery: 'karma' as const,
      level: 'orta',
      program_weeks: 1,
      training_hours: 8,
      tags: [],
      rationale: fallbackRationale([g.category_name], g.en_dusuk),
      people_count: g.kisi,
      lowest_score: g.en_dusuk,
      average_score: g.ortalama,
    })
  }

  // 5) person_ref → gerçek kişi (isim ASLA yapay zekâya gitmedi, burada ekleniyor)
  const refToTargetId = new Map(Array.from(personRefById.entries()).map(([tid, ref]) => [ref, tid]))
  const targetIds = Array.from(personRefById.keys())
  const nameById = new Map<string, string>()
  try {
    const r = await withActor(buildActor(s), (c) =>
      c.query<{ id: string; name: string }>('select id::text as id, name from users where id = any($1::uuid[])', [targetIds])
    )
    for (const u of r.rows || []) nameById.set(String(u.id), String(u.name || '-'))
  } catch {
    // isim çözülemezse öneriler yine döner, yalnız ad boş kalır
  }

  // Kişinin bireysel (grup eğitimiyle kapsanmayan) açıkları — kapsam buradan gelir.
  const individualGapsByRef = new Map(bundles.map((b) => [b.person_ref, b.gaps]))

  const seenRefs = new Set<string>()

  const bundle_items = ((ai.ok ? ai.data.bundle_items : undefined) || [])
    // Girdide olmayan veya tekrar eden kişi referanslarını ele.
    .filter((it) => {
      const r = String(it?.person_ref || '')
      if (!individualGapsByRef.has(r)) return false
      if (seenRefs.has(r)) return false
      seenRefs.add(r)
      return true
    })
    .map((it) => {
      const ref = String(it.person_ref || '')
    const tid = refToTargetId.get(ref) || ''
    const individual = individualGapsByRef.get(ref) || []
    return {
      person_ref: ref,
      target_id: tid || null,
      person_name: tid ? nameById.get(tid) || null : null,
      // Kapsam modelden değil, gerçek açık listesinden kurulur.
      covers: individual.map((g) => g.category),
      title: String(it.title || '').trim(),
      area: normArea(it.area),
      format: normFormat(it.format),
      delivery: normDelivery(it.delivery),
      level: normLevel(it.level),
      program_weeks: clampInt(it.program_weeks, 1, MAX_PROGRAM_WEEKS, 1),
      training_hours: clampInt(it.training_hours, 1, MAX_TRAINING_HOURS, 8),
      tags: normTags(it.tags),
      rationale: String(it.rationale || '').trim(),
      gap_count: individual.length,
      ai_generated: true,
    }
  })

  // Model bir kişiyi atladıysa yedek kayıt üret.
  const coveredRefs = new Set(bundle_items.map((b) => b.person_ref))
  for (const b of bundles) {
    if (coveredRefs.has(b.person_ref)) continue
    aiMissing.push(`kisi: ${b.person_ref}`)
    const tid = refToTargetId.get(b.person_ref) || ''
    const lowest = b.gaps.length ? Math.min(...b.gaps.map((g) => g.score)) : 0
    const format = fallbackFormat(lowest, 1)
    const primary = b.gaps[0]?.category || 'Genel'
    bundle_items.push({
      person_ref: b.person_ref,
      target_id: tid || null,
      person_name: tid ? nameById.get(tid) || null : null,
      covers: b.gaps.map((g) => g.category),
      title: fallbackTitle(primary, format),
      area: fallbackArea(primary),
      format,
      delivery: 'karma' as const,
      level: 'orta',
      program_weeks: 1,
      training_hours: 8,
      tags: [],
      rationale: fallbackRationale(b.gaps.map((g) => g.category), lowest),
      gap_count: b.gaps.length,
      ai_generated: false,
    })
  }

  return NextResponse.json({
    success: true,
    threshold,
    group_min_people: GROUP_MIN_PEOPLE,
    gaps,
    group_items,
    bundle_items,
    // Modelin atladığı ve kural tabanlı yedekle doldurulan girdiler.
    ai_missing: aiMissing,
    ai_available: aiAvailable,
    ai_error: aiError,
    stats: periodStats,
    suggested_threshold: suggestedThreshold,
  })
}
