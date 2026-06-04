#!/usr/bin/env node
/**
 * Rehber Öğretmeni (gorev_5) — FR soru/cevap metinleri resmi tabloya hizalanır (tüm rehberlik formları).
 *
 *   node scripts/apply-rehber-ogretmeni-fr-content-2026.mjs
 *   node scripts/apply-rehber-ogretmeni-fr-content-2026.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const PERIOD = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
const DUTY_ID = 'b90674da-1e89-4cfc-93ba-dff055ab02c4'
const APPLY = process.argv.includes('--apply')

/** @type {Record<string, { catSort: number, cat_fr: string, q: { id: string, text_fr: string }, answers: { std_score: number, text_fr: string }[] }>} */
const UPDATES = {
  program: {
    catId: '9b3c3eb0-011c-4a44-a748-c2d3d74b52ba',
    catSort: 1,
    cat_fr: 'Programme d’orientation et planification',
    q: {
      id: '5d979457-c5e9-40b2-81f5-a2be93c42eaa',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa manière de planifier et de mettre en œuvre le programme d'orientation de l'école sur la base de l'analyse des besoins ?",
    },
    answers: [
      {
        std_score: 5,
        text_fr:
          'Réalise une analyse approfondie des besoins de l’école et des élèves en début d’année ; planifie et met en œuvre de façon régulière le programme en fonction de cette analyse.',
      },
      {
        std_score: 3,
        text_fr:
          'Établit un programme et le met en œuvre partiellement mais l’analyse des besoins est insuffisante ou bien la correspondance entre le plan et sa mise en application est faible.',
      },
      {
        std_score: 1,
        text_fr:
          'Ne met pas en application systématiquement un programme ; les activités proposées avancent de façon désordonnée et déstructurée.',
      },
      { std_score: 0, text_fr: 'Aucune idée.' },
    ],
  },
  bireysel: {
    catId: '22e8feae-911f-4371-bd35-5eb7a960c6a0',
    catSort: 2,
    cat_fr: 'Travaux individuels et de groupe',
    q: {
      id: 'e968412a-f45b-4579-a413-ce981c3ad816',
      sort_order: 1,
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa manière de planifier et de mener efficacement les rencontres individuelles avec les élèves ?",
    },
    answers: [
      {
        std_score: 5,
        text_fr:
          'Mène les rencontres de manière régulière, planifiée et conforme à des objectifs ; assure la conservation de la trace écrite et le suivi de chaque rencontre sans faille.',
      },
      {
        std_score: 3,
        text_fr:
          'Mène les rencontres mais des accrocs peuvent se produire dans la planification, l’enregistrement ou le suivi.',
      },
      {
        std_score: 1,
        text_fr: 'Les rencontres individuelles sont désorganisées, insuffisantes ou non suivies d’effets.',
      },
      { std_score: 0, text_fr: 'Aucune idée.' },
    ],
  },
  grup: {
    catId: '22e8feae-911f-4371-bd35-5eb7a960c6a0',
    q: {
      id: '31dc5d72-3e6d-460c-a82f-52a0f40e0667',
      sort_order: 2,
      text_fr:
        "Comment évaluez-vous l'attitude de la personne vis-à-vis de l'organisation des travaux d'orientation de groupe (portant sur l'anxiété en situation d'examen, les compétences sociales, les relations entre pairs etc.) ?",
    },
    answers: [
      {
        std_score: 5,
        text_fr:
          'Les sessions d’orientation de groupe sont menées sur la base de l’analyse des besoins, de manière régulière et efficace.',
      },
      {
        std_score: 3,
        text_fr:
          'Organise des travaux de groupe mais ceux-ci demeurent limités en termes de continuité ou d’efficacité.',
      },
      {
        std_score: 1,
        text_fr: 'Les travaux d’orientation de groupe demeurent rares ou insuffisants.',
      },
      { std_score: 0, text_fr: 'Aucune idée.' },
    ],
  },
  risk: {
    catId: 'd8ac2ba4-689f-4950-9308-c0977b25e260',
    catSort: 3,
    cat_fr: 'Suivi des risques et orientation vers les services',
    q: {
      id: 'b32668b8-6cbc-4dae-a143-fa979584f7d4',
      sort_order: 1,
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de sa manière de gérer les processus d'identification des élèves à risque (en termes académiques, émotionnels, comportementaux) et d'intervention appropriée ?",
    },
    answers: [
      {
        std_score: 5,
        text_fr:
          'Identifie les élèves à risque de manière précoce ; conduit les processus d’intervention appropriée, d’orientation vers les services concernés et de suivi de manière systématique.',
      },
      {
        std_score: 3,
        text_fr:
          'Identifie les situations saillantes et intervient mais des insuffisances peuvent avoir lieu en termes de suivi ou d’orientation vers les services.',
      },
      { std_score: 1, text_fr: 'Identification et suivi des élèves à risque insuffisant·e·s.' },
      { std_score: 0, text_fr: 'Aucune idée.' },
    ],
  },
  risk_ext: {
    catId: 'd8ac2ba4-689f-4950-9308-c0977b25e260',
    q: {
      id: 'd500155b-c5df-45a7-b2f3-edee65525623',
      sort_order: 2,
      text_fr:
        "Comment évaluez-vous l'attitude de la personne vis-à-vis de la coopération, lorsque le cas le demande, avec le RAM, les services de santé et autres organismes extérieurs au lycée ?",
    },
    answers: [
      {
        std_score: 5,
        text_fr:
          'Collabore en temps voulu et de manière efficace avec les organismes extérieurs lorsque le cas le demande ; en assure le suivi jusqu’au bout.',
      },
      {
        std_score: 3,
        text_fr:
          'Collabore lorsque le cas l’exige mais des insuffisances peuvent demeurer en termes de suivi du processus ou de transmission de feedbacks.',
      },
      {
        std_score: 1,
        text_fr:
          'Éprouve des difficultés à initier ou à mener à bien la collaboration avec des organismes extérieurs.',
      },
      { std_score: 0, text_fr: 'Aucune idée.' },
    ],
  },
  kriz: {
    catId: 'c01aced5-5200-4003-a2ab-a699801862ef',
    catSort: 4,
    cat_fr: 'Gestion des crises',
    q: {
      id: '42675064-279f-4c70-8ef9-3ccfb5c95d86',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de l'identification des et de l'intervention en cas de situations de crise (deuil, traumatisme, harcèlement par les pairs, dispositions au suicide etc.) ?",
    },
    answers: [
      {
        std_score: 5,
        text_fr:
          'Identifie les signaux d’alerte des situations de crise à un stade précoce ; applique les méthodes d’intervention appropriée de manière calme et professionnelle ; assure le suivi post-crise.',
      },
      {
        std_score: 3,
        text_fr:
          'Intervient en situation de crise mais demeure insuffisant·e en termes de détection précoce ou de suivi en aval.',
      },
      {
        std_score: 1,
        text_fr: 'Éprouve des difficultés à intervenir en cas de crise ou à gérer le processus efficacement.',
      },
      { std_score: 0, text_fr: 'Aucune idée.' },
    ],
  },
  mahremiyet: {
    catId: '2bed4546-7359-4c00-b6e4-c993842c22eb',
    catSort: 5,
    cat_fr: 'Confidentialité et éthique',
    q: {
      id: '188dd455-2340-4ad9-a6d5-eee4fe7bed0c',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de la conformité aux principes de la confidentialité et de l'éthique lors des rencontres individuelles ?",
    },
    answers: [
      {
        std_score: 5,
        text_fr:
          'Préserve la confidentialité des contenus évoqués lors des rencontres de manière scrupuleuse ; ne partage les informations que dans un cadre éthique et légal rigoureux, avec les personnes habilitées à les recevoir.',
      },
      {
        std_score: 3,
        text_fr:
          'Est généralement attentif·ve à la confidentialité mais peut se livrer à des partages d’informations non appropriés dans des contextes informels.',
      },
      {
        std_score: 1,
        text_fr:
          'Éprouve des difficultés marquées en ce qui concerne la confidentialité ou les principes éthiques.',
      },
      { std_score: 0, text_fr: 'Aucune idée.' },
    ],
  },
  yonetim: {
    catId: 'c9d8c4cf-fe98-4a45-a941-5a2bd38ede07',
    catSort: 6,
    cat_fr: 'Coopération direction - professeur·e·s (d’orientation spécifiquement)',
    q: {
      id: 'aa86790a-df9c-433e-bf12-727213b811a5',
      text_fr:
        "Comment évaluez-vous l'attitude de la personne du point de vue de la collaboration entre professeur·e·s titulaires, sous-directrice et direction au sujet du suivi des élèves ?",
    },
    answers: [
      {
        std_score: 5,
        text_fr:
          'Informe en temps voulu et dans un cadre approprié les personnes concernées des situations vécues par les élèves ; apporte une contribution active au processus de résolution commune.',
      },
      {
        std_score: 3,
        text_fr:
          'Transmet les informations mais des retards ou des manquements dans l’étendue des transmissions peuvent se produire.',
      },
      {
        std_score: 1,
        text_fr:
          'Communication et collaboration au sujet des situations vécues par les élèves insuffisantes.',
      },
      { std_score: 0, text_fr: 'Aucune idée.' },
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

async function updateQuestionAnswers(qId, specs) {
  const { data: existing } = await sb
    .from('question_answers')
    .select('id,std_score')
    .eq('question_id', qId)
    .eq('is_active', true)
  const byScore = new Map((existing || []).map((r) => [r.std_score, r.id]))
  for (const spec of specs) {
    const id = byScore.get(spec.std_score)
    if (!id) throw new Error(`${qId}: cevap std_score ${spec.std_score} yok`)
    await sb.from('question_answers').update({ text_fr: spec.text_fr }).eq('id', id)
  }
}

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
  if (duty?.code !== 'gorev_5') throw new Error(`Beklenen gorev_5, bulunan: ${duty?.code}`)

  console.log(APPLY ? 'MODE: --apply' : 'MODE: dry-run')
  console.log({ duty: duty.name, soru_guncelleme: 8, kategori_sira: 6 })

  if (!APPLY) {
    console.log('\nUygulamak: node scripts/apply-rehber-ogretmeni-fr-content-2026.mjs --apply')
    return
  }

  const catSortDone = new Set()
  const questionIds = []
  const categoryIds = new Set()

  for (const block of Object.values(UPDATES)) {
    if (block.catSort && block.catId && !catSortDone.has(block.catId)) {
      catSortDone.add(block.catId)
      await sb
        .from('question_categories')
        .update({ name_fr: block.cat_fr, sort_order: block.catSort })
        .eq('id', block.catId)
      await sb
        .from('evaluation_period_duty_categories')
        .update({ sort_order: block.catSort })
        .eq('period_id', PERIOD)
        .eq('duty_id', DUTY_ID)
        .eq('category_id', block.catId)
      categoryIds.add(block.catId)
    } else if (block.catId) {
      categoryIds.add(block.catId)
    }

    const qPatch = { text_fr: block.q.text_fr }
    if (block.q.sort_order != null) qPatch.sort_order = block.q.sort_order
    await sb.from('questions').update(qPatch).eq('id', block.q.id)
    questionIds.push(block.q.id)
    await updateQuestionAnswers(block.q.id, block.answers)
  }

  await syncSnapshot(questionIds, [...categoryIds])

  console.log({ guncellenen_soru: questionIds.length, snapshot: true })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
