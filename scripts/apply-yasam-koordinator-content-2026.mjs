#!/usr/bin/env node
/**
 * 2026 EĞİTMEN — Okul İçi Yaşam Koordinatörü (gorev_4) — 9 kategori / soru / cevap (TR + FR)
 *
 *   node scripts/apply-yasam-koordinator-content-2026.mjs
 *   node scripts/apply-yasam-koordinator-content-2026.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const DUTY_ID = 'e8fa6928-4a58-4dd4-aa1e-2352bf3bbdae'
const MAIN_CATEGORY_ID = 'a629925c-bfd6-4db6-aa24-90a0be29ce6d'
const APPLY = process.argv.includes('--apply')

const BLOCKS = [
  {
    sort: 1,
    cat: {
      name: 'Prosedür ve Süreç Tasarımı',
      name_fr: 'Conception de procédures et processus',
    },
    q: {
      text: 'Öğretmenler için görev sistemi, ders değişiklikleri, kulüp süreçleri vb. konularda net ve anlaşılır prosedürler oluşturma konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa manière d'établir des procédures claires et compréhensibles pour les professeur·e·s (systèmes de garde, remplacements de cours, procédures concernant la conduite des clubs etc.) ?",
    },
    answers: [
      {
        std_score: 5,
        text: 'Süreçleri net, yazılı ve herkes için erişilebilir biçimde tanımlar; gerektiğinde günceller ve ekibi bilgilendirir.',
        text_fr:
          'Définit les processus de manière nette, écrite, et compréhensible pour tou·te·s ; les met à jour lorsque le cas l’exige et en tient l’équipe informée.',
      },
      {
        std_score: 3,
        text: 'Süreçler genel olarak işler ancak belirsizlikler veya güncellenmemiş prosedürler olabilir.',
        text_fr:
          'Gère les processus de manière générale mais des ambiguïtés ou des situations non mises à jour peuvent se produire.',
      },
      {
        std_score: 1,
        text: 'Süreç tanımları yetersiz veya dağınıktır; öğretmenler aynı soruları tekrar tekrar sormak zorunda kalır.',
        text_fr:
          'Définition insuffisante ou confuse des processus ; les professeur·e·s sont contraint·e·s de poser la même question à de nombreuses reprises.',
      },
      { std_score: 0, text: 'Fikrim yok.', text_fr: 'Aucune idée.' },
    ],
  },
  {
    sort: 2,
    cat: {
      name: 'Sorun Çözme ve Operasyonel Etkinlik',
      name_fr: 'Résolution de problèmes et effectivité opérationnelle',
    },
    q: {
      text: 'Günlük operasyonel sorunlara hızlı ve etkili çözümler üretme konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa manière de concevoir des solutions rapides et efficaces aux problèmes opérationnels ?",
    },
    answers: [
      {
        std_score: 5,
        text: 'Ortaya çıkan sorunlara anında müdahale eder; pratik ve sürdürülebilir çözümler üretir.',
        text_fr:
          'Réagit de manière immédiate à tous les problèmes qui peuvent advenir ; conçoit des solutions pratiques et durables.',
      },
      {
        std_score: 3,
        text: 'Sorunları çözer ancak müdahale gecikebilir veya çözümler kalıcı olmayabilir.',
        text_fr:
          'Résout les problèmes mais peut intervenir de façon tardive ou proposer des solutions non pérennes.',
      },
      {
        std_score: 1,
        text: 'Sorun çözmede yavaş veya yetersiz kalır.',
        text_fr: 'Lent·e ou insuffisant·e dans la résolution de problèmes.',
      },
      { std_score: 0, text: 'Fikrim yok.', text_fr: 'Aucune idée.' },
    ],
  },
  {
    sort: 3,
    cat: {
      name: 'Süreç Takibi ve Raporlama',
      name_fr: 'Suivi des processus et production de rapports',
    },
    q: {
      text: 'Süreçleri takip etme, işlerin tamamlanmasını kontrol etme ve raporlama konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa manière d'assurer le suivi des processus, de contrôler l'exécution des tâches jusqu'à leur terme et la production de rapports ?",
    },
    answers: [
      {
        std_score: 5,
        text: 'Süreçleri sistematik takip eder, işlerin sonuçlandığını kontrol eder ve düzenli raporlar.',
        text_fr:
          'Assure un suivi systématique des processus, contrôle l’exécution des tâches et dresse des rapports réguliers.',
      },
      {
        std_score: 3,
        text: 'Takip yapar ancak raporlama veya kapanış kontrollerinde aksaklıklar olabilir.',
        text_fr:
          'Assure un suivi mais des irrégularités peuvent avoir lieu au niveau de la production de rapports et du contrôle de l’exécution des tâches.',
      },
      {
        std_score: 1,
        text: 'Süreç takibi düzensizdir, raporlama eksik veya yetersizdir.',
        text_fr: 'Suivi des processus irrégulier ; production de rapport incomplète ou insuffisante.',
      },
      { std_score: 0, text: 'Fikrim yok.', text_fr: 'Aucune idée.' },
    ],
  },
  {
    sort: 4,
    cat: {
      name: 'Nöbet Sistemi Yönetimi',
      name_fr: 'Gestion du système des gardes',
    },
    q: {
      text: 'Nöbet sisteminin organizasyonu ve nöbetçi öğretmenlere destek konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne vis-à-vis de l'organisation du système des gardes, du contrôle et du soutien aux professeur·e·s de garde ?",
    },
    answers: [
      {
        std_score: 5,
        text: 'Nöbet sistemini etkili organize eder, sahada görünür olur, nöbetçi öğretmenlere aktif destek verir; öğretmenleri dinleyerek sürekli iyileştirmeler yapar.',
        text_fr:
          'Organise le système des gardes de façon efficace ; est présent·e de façon visible sur le terrain ; fournit un soutien actif aux professeur·e·s de garde ; cherche à effectuer des améliorations constantes en étant à l’écoute des professeur·e·s.',
      },
      {
        std_score: 3,
        text: 'Nöbet sistemini yürütür ancak saha takibi veya öğretmen geri bildirimlerine yanıt sınırlı olabilir.',
        text_fr:
          'Conduit le système de gardes mais le suivi sur le terrain ou les réponses aux feedbacks des professeur·e·s peuvent s’avérer limité·e·s.',
      },
      {
        std_score: 1,
        text: 'Nöbet sistemi yönetimi veya saha desteği yetersizdir.',
        text_fr: 'La gestion du système des gardes ou le soutien sur le terrain s’avèrent insuffisant·e·s.',
      },
      { std_score: 0, text: 'Fikrim yok.', text_fr: 'Aucune idée.' },
    ],
  },
  {
    sort: 5,
    cat: {
      name: 'Kulüp ve Etkinlik Koordinasyonu',
      name_fr: 'Coordination des clubs et activités',
    },
    q: {
      text: 'Kulüp dersleri ve okul içi etkinliklerin koordinasyonu konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne vis-à-vis de l'organisation des travaux des clubs et des activités organisées dans l'école ?",
    },
    answers: [
      {
        std_score: 5,
        text: 'Kulüp ve etkinlikleri planlı organize eder, sorumlulukları takip eder, öğrenci-öğretmen eşleştirmelerini etkili yönetir.',
        text_fr:
          'Organise les clubs et les activités de manière planifiée ; assure un suivi auprès des responsables ; gère efficacement les appariements élèves-professeur·e·s.',
      },
      {
        std_score: 3,
        text: 'Koordinasyon yapar ancak takip veya organizasyonda aksaklıklar olabilir.',
        text_fr:
          'Assure la coordination mais des accidents peuvent avoir lieu dans le suivi ou l’organisation.',
      },
      {
        std_score: 1,
        text: 'Kulüp/etkinlik koordinasyonu düzensiz veya yetersizdir.',
        text_fr: 'Coordination des clubs/activités irrégulière ou insuffisante.',
      },
      { std_score: 0, text: 'Fikrim yok.', text_fr: 'Aucune idée.' },
    ],
  },
  {
    sort: 6,
    cat: {
      name: 'Acil ve Son Dakika Düzenlemeler',
      name_fr: 'Ajustements urgents et de dernière minute',
    },
    q: {
      text: 'Öğretmen devamsızlıkları, son dakika ders değişiklikleri ve acil düzenlemeler konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de la gestion des absences des professeur·e·s, des changements de dernière minute et des ajustements aux situations urgentes ?",
    },
    answers: [
      {
        std_score: 5,
        text: 'Acil ve son dakika değişiklikleri hızlı, adil ve şeffaf biçimde organize eder; ilgili herkesi zamanında bilgilendirir.',
        text_fr:
          'Organise les ajustements de dernière minute et aux situations d’urgence de manière rapide, juste et transparente ; informe en temps voulu toutes les personnes concernées.',
      },
      {
        std_score: 3,
        text: 'Düzenlemeler yapar ancak gecikmeler, eşitsizlikler veya bilgilendirme eksikliği olabilir.',
        text_fr:
          'Réalise les ajustements mais des retards, des injustices ou des défauts de transmission d’information peuvent se faire jour.',
      },
      {
        std_score: 1,
        text: 'Acil düzenlemeleri yönetmekte zorlanır veya kaos yaratır.',
        text_fr: 'Éprouve des difficultés à gérer les ajustements d’urgence et cause des situations chaotiques.',
      },
      { std_score: 0, text: 'Fikrim yok.', text_fr: 'Aucune idée.' },
    ],
  },
  {
    sort: 7,
    cat: {
      name: 'Müdür Yardımcılarıyla İşbirliği',
      name_fr: 'Coopération avec les sous-directrices',
    },
    q: {
      text: 'Müdür yardımcılarıyla koordinasyon ve iş birliği konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de la coordination et de la coopération avec les sous-directrices ?",
    },
    answers: [
      {
        std_score: 5,
        text: 'Müdür yardımcılarıyla düzenli ve etkili bilgi alışverişi sağlar; ortak süreçlerde proaktif iş birliği kurar.',
        text_fr:
          'Assure une transmission d’information réciproque régulière et efficace avec les sous-directrices ; coopère de manière proactive sur les procédures communes.',
      },
      {
        std_score: 3,
        text: 'İş birliği kurar ancak iletişim sıklığı veya kapsamı sınırlı olabilir.',
        text_fr:
          'Collabore mais la fréquence ou le spectre de la communication peuvent s’avérer limité·e·s.',
      },
      {
        std_score: 1,
        text: 'Müdür yardımcılarıyla iş birliği zayıf veya kopuktur.',
        text_fr: 'Degré de collaboration avec les sous-directrices faible ou distendu.',
      },
      { std_score: 0, text: 'Fikrim yok.', text_fr: 'Aucune idée.' },
    ],
  },
  {
    sort: 8,
    cat: {
      name: 'Veli-Öğretmen Görüşme Organizasyonu',
      name_fr: 'Organisation des rencontres parents-professeur·e·s',
    },
    q: {
      text: 'Veli-öğretmen görüşmelerinin organizasyonu konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de l'organisation des rencontres parents-professeur·e·s ?",
    },
    answers: [
      {
        std_score: 5,
        text: 'Görüşmeleri planlı, sistematik ve akıcı biçimde organize eder; lojistik ve iletişim süreçlerini eksiksiz yürütür.',
        text_fr:
          'Mène les rencontres de manière planifiée, systématique et fluide ; conduit les processus logistiques et communicationnels sans faute.',
      },
      {
        std_score: 3,
        text: 'Organizasyon sağlar ancak planlama veya iletişimde aksaklıklar olabilir.',
        text_fr:
          'Assure l’organisation mais des accrocs peuvent se produire au niveau de la planification ou de la communication.',
      },
      {
        std_score: 1,
        text: 'Görüşme organizasyonu düzensiz veya yetersizdir.',
        text_fr: 'Organisation des rencontres irrégulière ou insuffisante.',
      },
      { std_score: 0, text: 'Fikrim yok.', text_fr: 'Aucune idée.' },
    ],
  },
  {
    sort: 9,
    cat: {
      name: 'Okul Yaşam Alanları & Güvenlik',
      name_fr: 'Espaces de Vie Scolaire & Sécurité',
    },
    q: {
      text: 'Okulun fiziksel yaşam alanlarının (koridor, kantin, servis, teneffüs) düzeni ve güvenliği konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne vis-à-vis de la régulation et de la sécurisation des espaces physiques de l'école (couloirs, réfectoires, zones des bus de transport scolaire, cours de récréation) ?",
    },
    answers: [
      {
        std_score: 5,
        text: 'Fiziksel alanları aktif takip eder; düzen, güvenlik ve hijyen konusunda proaktif önlemler alır.',
        text_fr:
          'Assure un suivi actif des espaces physiques du lycée ; prend des mesures proactives pour assurer la bonne organisation, la sécurité et l’hygiène de ceux-ci.',
      },
      {
        std_score: 3,
        text: 'Genel takip yapar ancak müdahaleler reaktif veya gecikmeli olabilir.',
        text_fr:
          'Assure un suivi général mais s’avère réactif·ve ou en retard en termes d’intervention.',
      },
      {
        std_score: 1,
        text: 'Fiziksel alan takibi yetersizdir.',
        text_fr: 'Suivi des espaces physiques insuffisant.',
      },
      { std_score: 0, text: 'Fikrim yok.', text_fr: 'Aucune idée.' },
    ],
  },
]

function loadEnv() {
  for (const f of ['.env.visio360.tmp', '.env.local']) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  }
}
loadEnv()

const sb = createClient(
  (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function syncSnapshot(questionIds, categoryIds) {
  const { data: qs } = await sb.from('questions').select('*').in('id', questionIds)
  for (const q of qs || []) {
    await sb.from('evaluation_period_questions_snapshot').upsert(
      {
        id: q.id,
        period_id: PERIOD,
        category_id: q.category_id,
        text: q.text,
        text_en: q.text_en,
        text_fr: q.text_fr,
        sort_order: q.sort_order ?? 0,
        is_active: q.is_active ?? true,
        snapshotted_at: new Date().toISOString(),
      },
      { onConflict: 'period_id,id' }
    )
  }

  const { data: cats } = await sb.from('question_categories').select('*').in('id', categoryIds)
  for (const c of cats || []) {
    await sb.from('evaluation_period_categories_snapshot').upsert(
      {
        id: c.id,
        period_id: PERIOD,
        main_category_id: c.main_category_id,
        name: c.name,
        name_en: c.name_en,
        name_fr: c.name_fr,
        sort_order: c.sort_order ?? 0,
        is_active: c.is_active ?? true,
        snapshotted_at: new Date().toISOString(),
      },
      { onConflict: 'period_id,id' }
    )
  }

  const { data: ans } = await sb
    .from('question_answers')
    .select('*')
    .in('question_id', questionIds)
    .eq('is_active', true)

  for (const a of ans || []) {
    await sb.from('evaluation_period_answers_snapshot').upsert(
      {
        id: a.id,
        period_id: PERIOD,
        question_id: a.question_id,
        text: a.text,
        text_en: a.text_en,
        text_fr: a.text_fr,
        level: a.level,
        std_score: a.std_score,
        reel_score: a.reel_score,
        sort_order: a.sort_order ?? 0,
        is_active: true,
        snapshotted_at: new Date().toISOString(),
      },
      { onConflict: 'period_id,id' }
    )
  }
}

async function main() {
  const { data: duty } = await sb.from('evaluation_duties').select('code,name').eq('id', DUTY_ID).single()
  if (duty?.code !== 'gorev_4') throw new Error(`Beklenen gorev_4, bulunan: ${duty?.code} ${duty?.name}`)

  const { count: oldLinks } = await sb
    .from('evaluation_period_duty_categories')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('duty_id', DUTY_ID)

  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run')
  console.log({ duty: duty.name, eski_kategori_bag: oldLinks, yeni_kategori: BLOCKS.length })

  if (!APPLY) {
    console.log('\nUygulamak: node scripts/apply-yasam-koordinator-content-2026.mjs --apply')
    return
  }

  await sb.from('evaluation_period_duty_categories').delete().eq('period_id', PERIOD).eq('duty_id', DUTY_ID)
  await sb.from('evaluation_period_duty_questions').delete().eq('period_id', PERIOD).eq('duty_id', DUTY_ID)

  const questionIds = []
  const categoryIds = []

  for (const block of BLOCKS) {
    const { data: cat, error: catErr } = await sb
      .from('question_categories')
      .insert({
        main_category_id: MAIN_CATEGORY_ID,
        name: block.cat.name,
        name_fr: block.cat.name_fr,
        sort_order: block.sort,
        is_active: true,
      })
      .select('id')
      .single()
    if (catErr) throw catErr
    categoryIds.push(cat.id)

    const { data: q, error: qErr } = await sb
      .from('questions')
      .insert({
        category_id: cat.id,
        text: block.q.text,
        text_fr: block.q.text_fr,
        sort_order: 1,
        is_active: true,
      })
      .select('id')
      .single()
    if (qErr) throw qErr
    questionIds.push(q.id)

    let sort = 1
    for (const spec of block.answers) {
      const level = spec.std_score === 0 ? 'no_opinion' : 'job_evaluation'
      const { error: aErr } = await sb.from('question_answers').insert({
        question_id: q.id,
        text: spec.text,
        text_fr: spec.text_fr,
        level,
        std_score: spec.std_score,
        reel_score: spec.std_score,
        sort_order: sort++,
        is_active: true,
      })
      if (aErr) throw aErr
    }

    const { error: linkErr } = await sb.from('evaluation_period_duty_categories').insert({
      period_id: PERIOD,
      duty_id: DUTY_ID,
      category_id: cat.id,
      category_source: 'question_categories',
      sort_order: block.sort,
      is_active: true,
    })
    if (linkErr) throw linkErr
  }

  await syncSnapshot(questionIds, categoryIds)

  const { count: newLinks } = await sb
    .from('evaluation_period_duty_categories')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('duty_id', DUTY_ID)

  console.log({ gorev_4_kategori: newLinks, soru: questionIds.length, snapshot_guncellendi: true })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
