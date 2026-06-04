#!/usr/bin/env node
/**
 * 2026 EĞİTMEN — Sınıf Öğretmeni (gorev_6) kategori / soru / cevap metinleri (TR + FR)
 *
 *   node scripts/apply-sinif-ogretmeni-content-2026.mjs
 *   node scripts/apply-sinif-ogretmeni-content-2026.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const DUTY_ID = '6f89850d-8ae7-4bdd-a424-8b6415b094f9'
const APPLY = process.argv.includes('--apply')

const CATEGORIES = {
  ogrenci: '015fe496-1dc8-44f3-93b0-9bd216b17c2d',
  bilgi: 'a5d41ba5-482b-439e-ac01-79c8684f38ab',
  pdr: '3068b16d-30c5-4b73-8b70-9f6ca19afa69',
  kurul: '82c97112-b83b-478e-b1cf-222ed5c89222',
  karne: '193fd0b5-6df1-401a-960e-8952c2d75e88',
}

const QUESTIONS = {
  ogrenci: 'b2416236-3ebd-45d7-a771-712f19f2385a',
  bilgi: '34c6b504-01d8-4ab0-a9e6-70daafe8df22',
  pdr: 'fbeee132-a86f-48c0-840b-7c257355ba53',
  kurul: 'ec68d68d-d463-451a-914c-9403b09c610b',
  karne: 'a3dd6b49-bcb5-4962-a503-a185f6a24f94',
}

/** @type {Record<string, { cat: { name: string, name_fr: string, sort: number }, q: { text: string, text_fr: string }, answers: { std_score: number, level: string, text: string, text_fr: string, sort_order: number }[] }>} */
const CONTENT = {
  ogrenci: {
    cat: {
      name: 'Öğrenci Gelişimi Takibi',
      name_fr: 'Suivi du développement des élèves',
      sort: 1,
    },
    q: {
      text: 'Sınıfındaki öğrencilerin akademik, sosyal ve davranışsal gelişimini izleme konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa manière d'assurer le suivi du développement académique, social et comportemental des élèves de sa classe ?",
    },
    answers: [
      {
        std_score: 5,
        level: 'job_evaluation',
        text: 'Öğrencilerin gelişim süreçlerini sistemli biçimde takip eder, gözlem ve verileri düzenli olarak kayıt altına alır.',
        text_fr:
          'Assure un suivi systématique des processus de développement de ses élèves ; prend note de manière régulière et soignée de ses observations et des données les concernant.',
        sort_order: 1,
      },
      {
        std_score: 3,
        level: 'job_evaluation',
        text: 'Genel olarak takip eder ancak sistematik kayıt veya düzenli izleme eksik kalabilir.',
        text_fr:
          "Assure globalement un suivi mais la notation systématique ou le suivi régulier peuvent s'avérer insuffisant·e·s.",
        sort_order: 2,
      },
      {
        std_score: 1,
        level: 'job_evaluation',
        text: 'Öğrenci takibi yüzeysel veya düzensizdir.',
        text_fr: 'Suivi superficiel ou irrégulier des élèves.',
        sort_order: 3,
      },
      {
        std_score: 0,
        level: 'no_opinion',
        text: 'Fikrim yok.',
        text_fr: 'Aucune idée.',
        sort_order: 4,
      },
    ],
  },
  bilgi: {
    cat: {
      name: 'Birimler Arası Bilgi Akışı',
      name_fr: 'Flux d’informations entre équipes',
      sort: 2,
    },
    q: {
      text: 'Sınıfındaki öğrencilerle ilgili gözlem ve durumları, ilgili birimlerle (PDR, müdür yardımcısı, branş öğretmenleri) zamanında ve uygun şekilde paylaşma konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa manière d'informer en temps voulu et de façon appropriée les équipes concernées (bureau d'orientation, sous-directrices, professeur·e·s de telle ou telle discipline) en partageant ses observations et les situations concernant les élèves de sa classe ?",
    },
    answers: [
      {
        std_score: 5,
        level: 'job_evaluation',
        text: 'Öğrencilerle ilgili gözlemlerini doğru birime, zamanında ve uygun çerçevede iletir; bilgi akışını proaktif olarak yürütür.',
        text_fr:
          'Transmet ses observations à propos des élèves aux équipes concernées en temps voulu et dans un cadre approprié ; assure le flux d’information de manière proactive.',
        sort_order: 1,
      },
      {
        std_score: 3,
        level: 'job_evaluation',
        text: 'Bilgilendirme yapar ancak gecikmeler veya yanlış birime yönlendirme olabilir.',
        text_fr:
          'Assure une transmission d’informations mais des retards ou des transmissions d’informations erronées peuvent avoir lieu.',
        sort_order: 2,
      },
      {
        std_score: 1,
        level: 'job_evaluation',
        text: 'Gerekli bilgilendirmeleri yapmaz veya ciddi gecikmeler yaşanır.',
        text_fr: 'Non transmission des informations nécessaires ou retards très significatifs.',
        sort_order: 3,
      },
      {
        std_score: 0,
        level: 'no_opinion',
        text: 'Fikrim yok.',
        text_fr: 'Aucune idée.',
        sort_order: 4,
      },
    ],
  },
  pdr: {
    cat: {
      name: 'PDR Planı ve Rehberlik Etkinlikleri',
      name_fr: 'Plan d’orientation et activités de vie de classe',
      sort: 3,
    },
    q: {
      text: 'Rehberlik bürosu tarafından verilen planı ve rehberlik etkinliklerini uygulama konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa manière d'appliquer le plan et les activités de vie de classe transmis·es par le bureau d'orientation ?",
    },
    answers: [
      {
        std_score: 5,
        level: 'job_evaluation',
        text: 'Rehberlik planını ve etkinliklerini eksiksiz, planlı ve zamanında uygular; PDR ile geri bildirim akışı kurar.',
        text_fr:
          'Applique le plan et les activités d’orientation de façon régulière et en temps voulu ; assure une saine transmission des feedbacks avec le bureau d’orientation.',
        sort_order: 1,
      },
      {
        std_score: 3,
        level: 'job_evaluation',
        text: 'Etkinlikleri uygular ancak planlama veya uygulama tutarlılığında aksaklıklar olur.',
        text_fr:
          'Applique les activités mais des accidents dans la constance de l’application ou la planification peuvent se faire jour.',
        sort_order: 2,
      },
      {
        std_score: 1,
        level: 'job_evaluation',
        text: 'Etkinlikleri yüzeysel uygular veya atlar.',
        text_fr: 'Applique les activités de façon superficielle ou les néglige.',
        sort_order: 3,
      },
      {
        std_score: 0,
        level: 'no_opinion',
        text: 'Fikrim yok.',
        text_fr: 'Aucune idée.',
        sort_order: 4,
      },
    ],
  },
  kurul: {
    cat: {
      name: 'Sınıf Kurulu Yönetimi',
      name_fr: 'Gestion des conseils de classe',
      sort: 4,
    },
    q: {
      text: 'Sınıf kurulu toplantılarını yönetme konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa gestion des conseils de classe ?",
    },
    answers: [
      {
        std_score: 5,
        level: 'job_evaluation',
        text: 'Toplantıyı önceden planlar (belgeler, öğrenci temsilcileri, gündem); süreci verimli yürütür ve çıktıları (aile mektupları vb.) zamanında paylaşır.',
        text_fr:
          'Planifie le conseil de classe à l’avance (documents, représentation des élèves, ordre du jour) ; gère le processus de manière efficace et transmet les décisions (lettre aux parents etc.) en temps voulu',
        sort_order: 1,
      },
      {
        std_score: 3,
        level: 'job_evaluation',
        text: 'Toplantıyı yönetir ancak hazırlık veya çıktı paylaşımında eksiklikler olur.',
        text_fr:
          'Gère le conseil de classe mais des insuffisances se font jour du point de vue de la préparation en amont ou de la transmission des décisions.',
        sort_order: 2,
      },
      {
        std_score: 1,
        level: 'job_evaluation',
        text: 'Sınıf kurulu yönetimi düzensiz veya yetersizdir.',
        text_fr: 'Gestion irrégulière ou insuffisante du conseil de classe.',
        sort_order: 3,
      },
      {
        std_score: 0,
        level: 'no_opinion',
        text: 'Fikrim yok.',
        text_fr: 'Aucune idée.',
        sort_order: 4,
      },
    ],
  },
  karne: {
    cat: {
      name: 'Karne Yorumları',
      name_fr: 'Appréciations du carnet',
      sort: 5,
    },
    q: {
      text: 'Karne değerlendirme yorumlarını yazma konusunda tutumu nasıldır?',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa manière de rédiger ses appréciations dans les carnets de ses élèves ?",
    },
    answers: [
      {
        std_score: 5,
        level: 'job_evaluation',
        text: 'Yorumları her öğrenciye özel, özenli ve içerikli biçimde, belirlenen tarihte tamamlar.',
        text_fr:
          'Complète les appréciations du carnet de façon individualisée par élève, soignée et riche de contenu, dans les délais prévus',
        sort_order: 1,
      },
      {
        std_score: 3,
        level: 'job_evaluation',
        text: 'Yorumları zamanında yazar ancak içerik genel veya yüzeysel kalabilir.',
        text_fr:
          'Complète les appréciations dans les délais prévus mais le contenu s’avère général ou superficiel',
        sort_order: 2,
      },
      {
        std_score: 1,
        level: 'job_evaluation',
        text: 'Yorumlar geç, eksik veya birbirinin tekrarı niteliğindedir.',
        text_fr: 'Les appréciations sont rédigées de manière tardive, incomplète ou standardisée',
        sort_order: 3,
      },
      {
        std_score: 0,
        level: 'no_opinion',
        text: 'Fikrim yok.',
        text_fr: 'Aucune idée.',
        sort_order: 4,
      },
    ],
  },
}

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
  if (duty?.code !== 'gorev_6') throw new Error(`Beklenen gorev_6, bulunan: ${duty?.code}`)

  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run')
  console.log({ duty: duty.name, soru: Object.keys(CONTENT).length })

  if (!APPLY) {
    console.log('\nUygulamak: node scripts/apply-sinif-ogretmeni-content-2026.mjs --apply')
    return
  }

  for (const [key, block] of Object.entries(CONTENT)) {
    const catId = CATEGORIES[key]
    const qId = QUESTIONS[key]

    await sb
      .from('question_categories')
      .update({ name: block.cat.name, name_fr: block.cat.name_fr, sort_order: block.cat.sort })
      .eq('id', catId)

    await sb
      .from('evaluation_period_duty_categories')
      .update({ sort_order: block.cat.sort })
      .eq('period_id', PERIOD)
      .eq('duty_id', DUTY_ID)
      .eq('category_id', catId)

    await sb
      .from('questions')
      .update({
        category_id: catId,
        text: block.q.text,
        text_fr: block.q.text_fr,
        sort_order: 1,
        is_active: true,
      })
      .eq('id', qId)

    const { data: existing } = await sb
      .from('question_answers')
      .select('id,std_score,is_active')
      .eq('question_id', qId)

    const activeByScore = new Map()
    for (const row of existing || []) {
      if (!row.is_active) continue
      if (!activeByScore.has(row.std_score)) activeByScore.set(row.std_score, row.id)
    }

    for (const spec of block.answers) {
      const answerId = activeByScore.get(spec.std_score)
      if (!answerId) throw new Error(`${key}: std_score ${spec.std_score} için aktif cevap yok`)
      await sb
        .from('question_answers')
        .update({
          text: spec.text,
          text_fr: spec.text_fr,
          level: spec.level,
          std_score: spec.std_score,
          reel_score: spec.std_score,
          sort_order: spec.sort_order,
          is_active: true,
        })
        .eq('id', answerId)
    }
  }

  const questionIds = Object.values(QUESTIONS)
  const categoryIds = Object.values(CATEGORIES)
  await syncSnapshot(questionIds, categoryIds)

  const { count } = await sb
    .from('evaluation_period_duty_categories')
    .select('*', { count: 'exact', head: true })
    .eq('period_id', PERIOD)
    .eq('duty_id', DUTY_ID)

  console.log({ gorev_6_kategori_bagli: count, snapshot_guncellendi: questionIds.length })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
