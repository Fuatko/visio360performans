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
/** Tek istekte yapay zekâya gönderilecek en fazla girdi (maliyet ve süre için).
 *  Sınırın dışında kalanlar kural tabanlı üretilir, listeden düşmez. */
const AI_MAX_GROUP_GAPS = 12
const AI_MAX_BUNDLES = 12
/** Zorunlu temel eğitimlerde tek istekte yapay zekâya gönderilecek en fazla konu. */
const AI_MAX_BASELINE = 10
/** Öz değerlendirme ile ekip ortalaması arasındaki fark bu değeri aşarsa
 *  kişi öz-algı kovasına girer (her iki yönde de). */
const PERCEPTION_DELTA = 0.75
/** Öz-algı farkı bu sayıdan az değerlendiricide gürültüdür, sayılmaz. */
const PERCEPTION_MIN_EVALUATORS = 3

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

type AiPerceptionItem = Omit<AiGroupItem, 'category'> & { person_ref: string }

type BaselineRow = {
  category_name: string
  kisi: number
  ortalama: number
  en_dusuk: number
}

type PerceptionRow = {
  target_id: string
  oz: number
  ekip: number
  fark: number
  degerlendirici: number
}

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

/**
 * Sunum biçimi modelden değil, kategori içeriğinden ve formattan belirlenir.
 * Model bu alanı güvenilir döndürmüyor (çoğu zaman hiç döndürmüyor), bu yüzden
 * deterministik kural kullanılır.
 *
 * - koçluk / mentorluk birebir çalışmadır → her zaman yüz yüze
 * - kural, prosedür, düzen, mevzuat gibi bilgi aktarımı → SCORM (e-öğrenme)
 * - iletişim, geri bildirim, davranış gibi beceri → yüz yüze (prova gerektirir)
 */
/**
 * Sonu k, p, t ile biten kelimeler Türkçe'de ünlüyle başlayan ek alınca
 * yumuşar ("güvenlik" → "güvenliği", "ekip" → "ekibi"). Bu kelimeler son
 * ünsüzü atılmış köküyle aranır; kök hem yalın hem ekli biçimi yakalar.
 * Yumuşamaya uğramayanlar tam kelime olarak kalır.
 */
const SCORM_HINTS = [
  'hijyen', 'temizli', 'duzen', 'disiplin', 'zaman yonetimi', 'guvenli',
  'ekipman', 'bakim', 'mevzuat', 'vergi', 'muhasebe', 'raporlama', 'arsiv',
  // 'evra' kökü "devralma" içinde de geçtiği için iki biçim ayrı yazılır.
  'arsivleme', 'dijital', 'prosedur', 'kural', 'evrak', 'evrag', 'kalite', 'standar',
]
const FACE_HINTS = [
  'iletisim', 'geri bildirim', 'davranis', 'motivasyon', 'baglili', 'liderli',
  'empati', 'catisma', 'temsil', 'iliski', 'is birligi', 'isbirligi',
  'koordinasyon', 'ekip', 'ekib', 'memnuniyet', 'gelisim',
]

/**
 * Zorunlu temel eğitim konuları. Bunlar puan düşüklüğüne bağlı değildir:
 * mevzuat ve iş güvenliği gereği düzenli tekrarlanır. Kategori adı bu
 * anahtarlardan birini içeriyorsa konu bu kovaya girer.
 */
const BASELINE_HINTS = [
  'guvenli', 'is sagligi', 'sagligi', 'acil durum', 'tahliye', 'yangin',
  'ilk yardim', 'hijyen', 'temizli', 'ekipman', 'nobet', 'vardiya', 'risk',
  'mevzuat', 'kvkk', 'veri gizlili', 'koruyucu saglik',
]

function isBaselineCategory(name: string): boolean {
  const hay = asciiFold(name)
  return BASELINE_HINTS.some((k) => hay.includes(k))
}

function resolveDelivery(categoryText: string, format: string): 'yuz_yuze' | 'scorm' | 'karma' {
  if (format === 'kocluk' || format === 'mentorluk') return 'yuz_yuze'
  const hay = asciiFold(categoryText)
  let scormScore = 0
  let faceScore = 0
  for (const k of SCORM_HINTS) if (hay.includes(k)) scormScore += 1
  for (const k of FACE_HINTS) if (hay.includes(k)) faceScore += 1
  if (scormScore > faceScore) return 'scorm'
  if (faceScore > scormScore) return 'yuz_yuze'
  return 'karma'
}

/**
 * Model gerekçeye takma ad yazarsa ("K6'nın motivasyonu düşük") ekrana
 * çıkmadan önce temizlenir. Takma adlar yalnız yapay zekâ isteminin içinde
 * anlamlıdır; yöneticiye gösterilen metinde yer almamalı.
 */
const REF_SUFFIX_RULES: Array<[RegExp, string]> = [
  [/^n[ıiuü]n$/, 'ilgili kişinin'],
  [/^[dt][ae]n$/, 'ilgili kişiden'],
  [/^[dt][ae]$/, 'ilgili kişide'],
  [/^[yn]?[ae]$/, 'ilgili kişiye'],
  [/^[yn]?[ıi]$/, 'ilgili kişiyi'],
  [/^l[ae]$/, 'ilgili kişiyle'],
]

function scrubPersonRefs(text: string): string {
  return text.replace(
    /\bK\d+(?:['’]([A-Za-zÇĞİÖŞÜçğıöşü]+))?/g,
    (_m: string, suffix?: string) => {
      if (!suffix) return 'ilgili kişi'
      const s = suffix.toLocaleLowerCase('tr')
      for (const [re, out] of REF_SUFFIX_RULES) if (re.test(s)) return out
      return 'ilgili kişi'
    }
  )
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

  // Gövdeyi hız sınırından ÖNCE oku: stats_only ucuz bir sorgu, ayrı ve geniş
  // kovada değerlendirilir; yapay zekâ üretimi dar kovada kalır.
  const body = (await req.json().catch(() => ({}))) as {
    period_id?: string
    org_id?: string
    threshold?: number
    lang?: string
    stats_only?: boolean
    plan_only?: boolean
  }

  const isStatsOnly = body.stats_only === true
  const isPlanOnly = body.plan_only === true
  // Her ikisi de yalnız sorgu çalıştırır, yapay zekâ çağrısı yoktur.
  const isCheap = isStatsOnly || isPlanOnly
  const rl = await rateLimitByUser(
    req,
    isCheap ? 'admin:training-ai-seed:stats' : 'admin:training-ai-seed',
    String(s.uid || ''),
    isCheap ? 60 : 6,
    60 * 1000
  )
  if (rl.blocked) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek yapıldı', detail: `Lütfen ${rl.retryAfterSec} saniye sonra tekrar deneyin.` },
      { status: 429, headers: rl.headers }
    )
  }

  if (!isPgEnabled()) {
    return NextResponse.json({ success: false, error: 'Bu uç yalnızca PostgreSQL arka ucuyla çalışır' }, { status: 503 })
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

  // 0) Öz-algı farkı: öz değerlendirme ortalaması ile ekip ortalaması arasındaki
  // fark. Eşik altı açıktan bağımsızdır — kişi hiç açık vermeden de bu kovaya
  // girebilir.
  const perceptionSql = `
    with s as (
      select a.target_id, avg(r.reel_score) as oz
      from evaluation_assignments a
      join evaluation_responses r on r.assignment_id = a.id
      where a.period_id = $1
        and a.status = 'completed'
        and a.evaluator_id = a.target_id
        and r.reel_score > 0
      group by 1
    ),
    p as (
      select a.target_id,
             avg(r.reel_score) as ekip,
             count(distinct a.evaluator_id) as degerlendirici
      from evaluation_assignments a
      join evaluation_responses r on r.assignment_id = a.id
      where a.period_id = $1
        and a.status = 'completed'
        and a.evaluator_id <> a.target_id
        and r.reel_score > 0
      group by 1
    )
    select s.target_id::text as target_id,
           round(s.oz::numeric, 2)::float8 as oz,
           round(p.ekip::numeric, 2)::float8 as ekip,
           round((s.oz - p.ekip)::numeric, 2)::float8 as fark,
           p.degerlendirici::int as degerlendirici
    from s
    join p on p.target_id = s.target_id
    where p.degerlendirici >= $3
      and abs(s.oz - p.ekip) >= $2
    order by abs(s.oz - p.ekip) desc
    limit 50`

  let perceptionRows: PerceptionRow[] = []
  try {
    const r = await withActor(buildActor(s), (c) =>
      c.query<PerceptionRow>(perceptionSql, [periodId, PERCEPTION_DELTA, PERCEPTION_MIN_EVALUATORS])
    )
    perceptionRows = r.rows || []
  } catch {
    perceptionRows = []
  }

  // 0b) Zorunlu temel eğitimler için dönemdeki BÜTÜN kategoriler, eşikten
  // bağımsız. Seçim aşağıda anahtar kelimeyle yapılır.
  const baselineSql = `
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
           round(avg(ort)::numeric, 2)::float8 as ortalama,
           round(min(ort)::numeric, 2)::float8 as en_dusuk
    from c
    group by 1
    order by kisi desc, category_name`

  let baselineRows: BaselineRow[] = []
  try {
    const r = await withActor(buildActor(s), (c) => c.query<BaselineRow>(baselineSql, [periodId]))
    baselineRows = r.rows || []
  } catch {
    baselineRows = []
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

  const hasBaselineCandidate = baselineRows.some(
    (r) => r.kisi >= GROUP_MIN_PEOPLE && isBaselineCategory(r.category_name)
  )
  if (!rows.length && !perceptionRows.length && !hasBaselineCandidate) {
    return NextResponse.json({
      success: true,
      threshold,
      gaps: [],
      group_items: [],
      bundle_items: [],
      perception_items: [],
      baseline_items: [],
      note:
        lang === 'en'
          ? 'No category fell below the threshold in this period. Try raising the threshold.'
          : lang === 'fr'
            ? 'Aucune catégorie ne se situe sous le seuil pour cette période. Essayez de relever le seuil.'
            : 'Bu dönemde eşiğin altında kategori bulunamadı. Eşiği yükseltip tekrar deneyebilirsiniz.',
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

  // Öz-algı kovasındaki kişiler de takma ad alır; isim yapay zekâya gitmez.
  // Açık listesinde zaten yer alan kişi mevcut takma adını korur.
  const perceptionGaps = perceptionRows.map((row) => {
    const tid = String(row.target_id)
    if (!personRefById.has(tid)) personRefById.set(tid, `K${personRefById.size + 1}`)
    return {
      person_ref: personRefById.get(tid) as string,
      direction: Number(row.fark) > 0 ? ('yuksek' as const) : ('dusuk' as const),
      self_score: Number(row.oz),
      peer_score: Number(row.ekip),
      delta: Number(row.fark),
      evaluators: Number(row.degerlendirici),
    }
  })

  const groupGaps = gaps.filter((g) => g.kisi >= GROUP_MIN_PEOPLE)
  const groupCategorySet = new Set(groupGaps.map((g) => g.category_name))

  // Zorunlu temel eğitim adayları. Eşik altı grup önerisinde zaten yer alan
  // kategoriler dışlanır; aynı konu iki kez önerilmez.
  const baselineGaps = baselineRows
    .filter((r) => r.kisi >= GROUP_MIN_PEOPLE)
    .filter((r) => !groupCategorySet.has(r.category_name))
    .filter((r) => isBaselineCategory(r.category_name))
    .slice(0, AI_MAX_BASELINE)

  // Eğitim atama planı: hangi eğitime kimler girecek. Yapay zekâ çağrısı yok,
  // katalog veya InspiraSuite bağımlılığı yok — yalnız dönem verisi.
  if (isPlanOnly) {
    type PlanRow = {
      target_id: string
      name: string
      department: string | null
      category_name: string
      puan: number
    }
    const planSql = `
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
      select c.target_id::text as target_id,
             u.name,
             u.department,
             c.category_name,
             round(c.ort::numeric, 2)::float8 as puan
      from c
      join users u on u.id = c.target_id
      order by c.category_name, u.name`

    let planRows: PlanRow[] = []
    try {
      const pr = await withActor(buildActor(s), (c) => c.query<PlanRow>(planSql, [periodId]))
      planRows = pr.rows || []
    } catch {
      planRows = []
    }

    const byCategory = new Map<string, PlanRow[]>()
    const metaByTarget = new Map<string, PlanRow>()
    for (const row of planRows) {
      const list = byCategory.get(row.category_name) || []
      list.push(row)
      byCategory.set(row.category_name, list)
      if (!metaByTarget.has(row.target_id)) metaByTarget.set(row.target_id, row)
    }

    const toPerson = (r: PlanRow) => ({
      target_id: r.target_id,
      name: r.name,
      department: r.department || null,
      score: Number(r.puan),
    })

    return NextResponse.json({
      success: true,
      threshold,
      plan: {
        // Grup eğitimi: o kategoride eşiğin altında kalanlar
        group: groupGaps.map((g) => ({
          category: g.category_name,
          people: (byCategory.get(g.category_name) || [])
            .filter((r) => Number(r.puan) < threshold)
            .map(toPerson),
        })),
        // Zorunlu temel: o kategoride ölçülen herkes, puandan bağımsız
        baseline: baselineGaps.map((b) => ({
          category: b.category_name,
          people: (byCategory.get(b.category_name) || []).map(toPerson),
        })),
        // Öz-algı: kişi bazlı, kategoriye bağlı değil
        perception: perceptionRows.map((r) => {
          const meta = metaByTarget.get(String(r.target_id))
          return {
            target_id: String(r.target_id),
            name: meta?.name || '—',
            department: meta?.department || null,
            direction: Number(r.fark) > 0 ? 'yuksek' : 'dusuk',
            self_score: Number(r.oz),
            peer_score: Number(r.ekip),
            delta: Number(r.fark),
          }
        }),
      },
    })
  }

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
      'rationale içinde K1, K2 gibi kişi kodlarını ASLA kullanma. Kişiden söz etmen gerekiyorsa "ilgili kişi" de. Kodlar yalnız girdiyi eşleştirmek için var, yöneticiye gösterilecek metinde yer almaz.',
      'tags: 3 adet kısa anahtar kelime.',
      'rationale: İKİ cümle. Birinci cümle bu açığın işyerinde pratikte neye benzediğini somut olarak anlatsın. İkinci cümle eğitim sonunda hangi davranışın değişmiş olacağını söylesin. "Yardımcı olacaktır", "geliştirecektir" gibi genel ifadeler KULLANMA.',
      'bundle_items içinde covers: o programın kapsadığı kategori adları (girdiyle birebir aynı yazım).',
      'perception_gaps: öz değerlendirmesi ile ekip değerlendirmesi arasında belirgin fark olan kişiler. Her biri için BİR program öner. Bu kategorilerde puan düşüklüğü değil, algı farkı söz konusudur.',
      'direction "yuksek" ise kişi kendini ekibin gördüğünden yüksek puanlıyor: geri bildirim alma, öz farkındalık ve kör nokta çalışması öner. Suçlayıcı veya etiketleyici dil KULLANMA.',
      'direction "dusuk" ise kişi kendini ekibin gördüğünden düşük puanlıyor: özgüven, katkısını görünür kılma ve kendini ifade etme çalışması öner.',
      'perception_items için format her zaman kocluk olsun; bu bireysel farkındalık çalışmasıdır, sınıf eğitimi değildir.',
      'baseline_trainings: mevzuat ve iş güvenliği gereği zorunlu temel eğitim konuları. Bu kategorilerde puan düşüklüğü YOKTUR; öneriyi bir eksiklik gibi anlatma.',
      'baseline_items gerekçesi eğitimin neden düzenli tekrarlandığını ve kadronun hangi ortak standardı kazanacağını anlatsın. "zayıf", "yetersiz", "açık", "eksik" gibi ifadeler KULLANMA.',
      'baseline_items için training_hours 2-8 arası olsun; bunlar kısa tazeleme eğitimleridir. program_weeks 1.',
      'perception_items için area alanını MUTLAKA doldur, boş bırakma. Örnek: "Farkındalık, Geri Bildirim" veya "Özgüven, Görünürlük".',
      'perception_items süresi: koçluk seans bazlı çalışmadır. training_hours 4-8 arası olsun, 16 saat yazma. program_weeks 1-2.',
      'perception_items başlıkları birbirinin aynısı OLAMAZ. Her kişiye farkın büyüklüğüne ve yönüne uygun ayrı bir başlık ver.',
      'perception_items gerekçesi her kişi için farklı yazılmalı ve o kişinin delta değerine atıfta bulunmalı. Farkın büyüklüğü arttıkça dilin daha net olsun. "Farkı anlamasına yardımcı olacaktır" gibi kalıp cümleleri hiçbir gerekçede KULLANMA; bunun yerine farkın işyerinde pratikte neye benzediğini yaz.',
      'Çıktı dili: ' + lang,
    ],
    group_gaps: groupGaps.slice(0, AI_MAX_GROUP_GAPS).map((g) => ({
      category: g.category_name,
      people_count: g.kisi,
      lowest_score: g.en_dusuk,
      average_score: g.ortalama,
    })),
    individual_bundles: bundles
      .slice()
      .sort((a, b) => {
        const aLow = a.gaps.length ? Math.min(...a.gaps.map((g) => g.score)) : 99
        const bLow = b.gaps.length ? Math.min(...b.gaps.map((g) => g.score)) : 99
        return aLow - bLow
      })
      .slice(0, AI_MAX_BUNDLES),
    perception_gaps: perceptionGaps,
    baseline_trainings: baselineGaps.map((b) => ({
      category: b.category_name,
      people_count: b.kisi,
      average_score: b.ortalama,
    })),
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
      baseline_items: [
        {
          category: 'string (girdideki category ile birebir aynı)',
          title: 'string',
          area: 'string (2-4 kelime)',
          format: 'egitim',
          program_weeks: 'number (1)',
          training_hours: 'number (2-8)',
          level: 'baslangic|orta|ileri',
          tags: ['string'],
          rationale: 'string (iki cümle)',
        },
      ],
      perception_items: [
        {
          person_ref: 'string (girdideki person_ref)',
          title: 'string (her kişide farklı)',
          area: 'string (2-4 kelime, zorunlu)',
          format: 'kocluk',
          program_weeks: 'number (1-2)',
          training_hours: 'number (4-8)',
          level: 'baslangic|orta|ileri',
          tags: ['string'],
          rationale: 'string (iki cümle)',
        },
      ],
    },
  })

  const ai = await openaiJson<{
    group_items?: AiGroupItem[]
    bundle_items?: AiBundleItem[]
    perception_items?: AiPerceptionItem[]
    baseline_items?: AiGroupItem[]
  }>({
    system,
    user: userPrompt,
    temperature: 0.3,
    max_tokens: 4500,
    timeoutMs: 90000,
  })

  // Model çalışmazsa durma: aşağıdaki kural tabanlı yedek üretim tüm girdileri
  // doldurur. Yanıtta ai_available=false ile belirtilir.
  const aiAvailable =
    ai.ok &&
    Boolean(
      ai.data?.group_items?.length ||
        ai.data?.bundle_items?.length ||
        ai.data?.perception_items?.length ||
        ai.data?.baseline_items?.length
    )
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
      delivery: resolveDelivery(it.category, normFormat(it.format)),
      level: normLevel(it.level),
      program_weeks: clampInt(it.program_weeks, 1, MAX_PROGRAM_WEEKS, 1),
      training_hours: clampInt(it.training_hours, 1, MAX_TRAINING_HOURS, 8),
      tags: normTags(it.tags),
      rationale: scrubPersonRefs(String(it.rationale || '').trim()),
      people_count: stat?.kisi ?? null,
      lowest_score: stat?.en_dusuk ?? null,
      average_score: stat?.ortalama ?? null,
      ai_generated: true,
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
      delivery: resolveDelivery(g.category_name, format),
      level: 'orta',
      program_weeks: 1,
      training_hours: 8,
      tags: [],
      rationale: fallbackRationale([g.category_name], g.en_dusuk),
      people_count: g.kisi,
      lowest_score: g.en_dusuk,
      average_score: g.ortalama,
      ai_generated: false,
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
      delivery: resolveDelivery(
        individual.map((g) => g.category).join(' '),
        normFormat(it.format)
      ),
      level: normLevel(it.level),
      program_weeks: clampInt(it.program_weeks, 1, MAX_PROGRAM_WEEKS, 1),
      training_hours: clampInt(it.training_hours, 1, MAX_TRAINING_HOURS, 8),
      tags: normTags(it.tags),
      rationale: scrubPersonRefs(String(it.rationale || '').trim()),
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
      delivery: resolveDelivery(b.gaps.map((g) => g.category).join(' '), format),
      level: 'orta',
      program_weeks: 1,
      training_hours: 8,
      tags: [],
      rationale: fallbackRationale(b.gaps.map((g) => g.category), lowest),
      gap_count: b.gaps.length,
      ai_generated: false,
    })
  }

  // 6) Öz-algı önerileri. Kim listeye girdiği ve fark değerleri sunucudan;
  // başlık ve gerekçe modelden. Model bir kişiyi atlarsa kural tabanlı yedek.
  const perceptionRationale = (direction: 'yuksek' | 'dusuk', delta: number) =>
    direction === 'yuksek'
      ? `Öz değerlendirme puanı ekip ortalamasının ${Math.abs(delta).toFixed(2)} puan üzerinde. Program sonunda ilgili kişi ekip geri bildirimini daha doğru okuyacak ve kendi etkisini gerçekçi değerlendirecektir.`
      : `Öz değerlendirme puanı ekip ortalamasının ${Math.abs(delta).toFixed(2)} puan altında. Program sonunda ilgili kişi güçlü yönlerini daha net ifade edecek ve katkısını görünür kılacaktır.`

  const aiPerceptionByRef = new Map(
    ((ai.ok ? ai.data.perception_items : undefined) || [])
      .filter((it) => it && typeof it.person_ref === 'string')
      .map((it) => [String(it.person_ref), it])
  )

  const perception_items = perceptionGaps.map((p) => {
    const tid = refToTargetId.get(p.person_ref) || ''
    const base = {
      person_ref: p.person_ref,
      target_id: tid || null,
      person_name: tid ? nameById.get(tid) || null : null,
      direction: p.direction,
      self_score: p.self_score,
      peer_score: p.peer_score,
      delta: p.delta,
      evaluators: p.evaluators,
      // Farkındalık çalışması her zaman birebir ve yüz yüzedir.
      format: 'kocluk',
      delivery: 'yuz_yuze',
    }
    // Model area alanını boş bırakırsa normArea "Genel" döndürür; bu kovada
    // yöne göre anlamlı bir varsayılan kullanılır.
    const defaultArea =
      p.direction === 'yuksek' ? 'Farkındalık, Geri Bildirim' : 'Özgüven, Görünürlük'
    const it = aiPerceptionByRef.get(p.person_ref)
    if (!it) {
      aiMissing.push(`oz-algi: ${p.person_ref}`)
      return {
        ...base,
        title:
          p.direction === 'yuksek'
            ? 'Öz Farkındalık ve Geri Bildirim Koçluğu'
            : 'Özgüven ve Görünürlük Koçluğu',
        area: defaultArea,
        level: 'orta',
        program_weeks: 1,
        training_hours: 6,
        tags: [],
        rationale: perceptionRationale(p.direction, p.delta),
        ai_generated: false,
      }
    }
    return {
      ...base,
      title: String(it.title || '').trim(),
      // normArea boş girdide "Genel" döndürür; o durumda yöne göre yedek.
      area: (() => {
        const a = normArea(it.area)
        return a && a !== 'Genel' ? a : defaultArea
      })(),
      level: normLevel(it.level),
      program_weeks: clampInt(it.program_weeks, 1, 2, 1),
      // Koçluk seans bazlıdır: 16 saatlik tavan bu kovada 8'e iniyor.
      training_hours: clampInt(it.training_hours, 2, 8, 6),
      tags: normTags(it.tags),
      rationale: scrubPersonRefs(String(it.rationale || '').trim()),
      ai_generated: true,
    }
  })

  // 7) Zorunlu temel eğitimler. Seçim ve istatistik sunucudan, metin modelden.
  const aiBaselineByCategory = new Map(
    ((ai.ok ? ai.data.baseline_items : undefined) || [])
      .filter((it) => it && typeof it.category === 'string')
      .map((it) => [String(it.category), it])
  )

  const baselineRationale = (name: string, kisi: number) =>
    `${name} konusu bu kadronun günlük işinin parçası ve ${kisi} kişiyi kapsıyor; kural ve prosedürler düzenli tazelenmeden ortak standart korunamaz. Eğitim sonunda kadronun tamamı aynı güncel uygulamayı izler.`

  const baseline_items = baselineGaps.map((b) => {
    const it = aiBaselineByCategory.get(b.category_name)
    const base = {
      category: b.category_name,
      people_count: b.kisi,
      average_score: b.ortalama,
      lowest_score: b.en_dusuk,
      // Zorunlu temel konular kural ve prosedür aktarımıdır; sunum biçimi
      // kategori metninden belirlenir (koçluk olmadığı için egitim verilir).
      delivery: resolveDelivery(b.category_name, 'egitim'),
      format: 'egitim',
    }
    if (!it) {
      aiMissing.push(`temel: ${b.category_name}`)
      return {
        ...base,
        title: fallbackTitle(b.category_name, 'egitim'),
        area: fallbackArea(b.category_name),
        level: 'orta',
        program_weeks: 1,
        training_hours: 4,
        tags: [],
        rationale: baselineRationale(b.category_name, b.kisi),
        ai_generated: false,
      }
    }
    return {
      ...base,
      title: String(it.title || '').trim(),
      area: normArea(it.area),
      level: normLevel(it.level),
      program_weeks: 1,
      training_hours: clampInt(it.training_hours, 2, 8, 4),
      tags: normTags(it.tags),
      rationale: scrubPersonRefs(String(it.rationale || '').trim()),
      ai_generated: true,
    }
  })

  // 8) Kategori adlarını seçili dile çevir.
  // Kategori adı veritabanında Türkçe saklanıyor ve içeride üç işi görüyor:
  // gruplama anahtarı, yapay zekâ çıktısını girdiyle eşleştirme, ve sunum
  // biçimi kuralı (resolveDelivery Türkçe anahtar kelimelere bakıyor).
  // Bu yüzden çeviri yalnız burada, yanıta çıkarken uygulanır.
  const categoryLabelTr = new Map<string, string>()
  if (lang !== 'tr') {
    const col = lang === 'fr' ? 'name_fr' : 'name_en'
    const take = (catRows: Array<Record<string, unknown>>, onlyMissing: boolean) => {
      for (const r of catRows || []) {
        const key = String(r?.name || '').trim()
        const val = String(r?.[col] || '').trim()
        if (!key || !val) continue
        if (onlyMissing && categoryLabelTr.has(key)) continue
        categoryLabelTr.set(key, val)
      }
    }
    try {
      const snap = await withActor(buildActor(s), (c) =>
        c.query(
          'select name, name_en, name_fr from evaluation_period_categories_snapshot where period_id = $1',
          [periodId]
        )
      )
      take(snap.rows as Array<Record<string, unknown>>, false)
    } catch {
      /* dönem kopyası yoksa genel katalog devreye girer */
    }
    try {
      // Sabit sıralama: aynı Türkçe adın birden çok çevirisi olabiliyor,
      // hangisinin kazandığı çağrıdan çağrıya değişmemeli.
      const cat = await withActor(buildActor(s), (c) =>
        c.query('select name, name_en, name_fr from question_categories order by name, name_fr, name_en')
      )
      take(cat.rows as Array<Record<string, unknown>>, true)
    } catch {
      /* okunamazsa Türkçe ad gösterilir */
    }
  }
  const catLabel = (name: unknown) => {
    const key = String(name ?? '').trim()
    return categoryLabelTr.get(key) || key
  }

  return NextResponse.json({
    success: true,
    threshold,
    group_min_people: GROUP_MIN_PEOPLE,
    perception_delta: PERCEPTION_DELTA,
    gaps: gaps.map((g) => ({ ...g, category_name: catLabel(g.category_name) })),
    group_items: group_items.map((g) => ({ ...g, category: catLabel(g.category) })),
    bundle_items: bundle_items.map((b) => ({
      ...b,
      covers: (b.covers || []).map((c) => catLabel(c)),
    })),
    perception_items,
    baseline_items: baseline_items.map((b) => ({ ...b, category: catLabel(b.category) })),
    // Modelin atladığı ve kural tabanlı yedekle doldurulan girdiler.
    ai_missing: aiMissing,
    ai_available: aiAvailable,
    ai_error: aiError,
    stats: periodStats,
    suggested_threshold: suggestedThreshold,
    ai_payload_limited:
      groupGaps.length > AI_MAX_GROUP_GAPS || bundles.length > AI_MAX_BUNDLES,
  })
}
