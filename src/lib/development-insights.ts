import { trainingForCategory } from '@/lib/ai-insights'

export type CategoryScore = { name: string; selfScore: number; peerScore: number; gap: number }

export type DevelopmentInsightCard = {
  id: string
  kind: 'priority' | 'awareness_over' | 'awareness_under' | 'strength'
  category: string
  title: string
  body: string
  selfScore: number
  peerScore: number
  gap: number
  trainings: string[]
  microActions: string[]
}

export type DevelopmentActionStep = {
  category: string
  title: string
  goal: string
  hint: string
  microActions: string[]
}

type Lang = 'tr' | 'en' | 'fr'

function pick(lang: Lang, tr: string, en: string, fr: string) {
  return lang === 'fr' ? fr : lang === 'en' ? en : tr
}

function targetScore(peer: number) {
  return Math.min(5, Math.round((peer + 0.5) * 10) / 10)
}

export function buildDevelopmentInsights(categoryScores: CategoryScore[], lang: Lang = 'tr') {
  const strengths = categoryScores.filter((c) => c.peerScore >= 3.5).sort((a, b) => b.peerScore - a.peerScore)
  const improvements = categoryScores.filter((c) => c.peerScore < 3.5).sort((a, b) => a.peerScore - b.peerScore)
  const over = categoryScores.filter((c) => c.gap > 0.5).sort((a, b) => b.gap - a.gap)
  const under = categoryScores.filter((c) => c.gap < -0.5).sort((a, b) => a.gap - b.gap)

  const headline = improvements.length
    ? pick(
        lang,
        `Öncelik: ${improvements[0].name} alanında ekip beklentisi daha yüksek (${improvements[0].peerScore.toFixed(1)}/5).`,
        `Priority: team expectations are higher in ${improvements[0].name} (${improvements[0].peerScore.toFixed(1)}/5).`,
        `Priorité : attentes plus élevées sur ${improvements[0].name} (${improvements[0].peerScore.toFixed(1)}/5).`
      )
    : pick(
        lang,
        'Tüm kategorilerde ekip ortalamanız güçlü görünüyor — güçlerinizi paylaşmaya odaklanın.',
        'Your team averages look strong across categories — focus on sharing your strengths.',
        'Vos moyennes d’équipe sont solides — concentrez-vous sur le partage de vos points forts.'
      )

  const subline = pick(
    lang,
    'Bu sayfa Sonuçlarım’daki grafikleri tekrarlamaz; hangi alana odaklanmanız ve hangi adımları atmanız gerektiğini özetler.',
    'This page does not repeat Results charts; it summarizes where to focus and what to do next.',
    'Cette page ne répète pas les graphiques des Résultats ; elle indique où agir.'
  )

  const chartRows = [...categoryScores]
    .filter((c) => c.selfScore > 0 && c.peerScore > 0)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 8)

  const insightCards: DevelopmentInsightCard[] = []

  improvements.slice(0, 3).forEach((imp, i) => {
    const tgt = targetScore(imp.peerScore)
    insightCards.push({
      id: `priority-${i}`,
      kind: 'priority',
      category: imp.name,
      title: pick(lang, `${imp.name} — gelişim önceliği`, `${imp.name} — development priority`, `${imp.name} — priorité de développement`),
      body: pick(
        lang,
        `Ekip ortalamanız ${imp.peerScore.toFixed(1)}/5. 3 ay içinde ${tgt.toFixed(1)} hedefine yönelik küçük adımlar planlayın.`,
        `Team average is ${imp.peerScore.toFixed(1)}/5. Plan small steps toward ${tgt.toFixed(1)} within 3 months.`,
        `Moyenne équipe ${imp.peerScore.toFixed(1)}/5. Planifiez de petites actions vers ${tgt.toFixed(1)} en 3 mois.`
      ),
      selfScore: imp.selfScore,
      peerScore: imp.peerScore,
      gap: imp.gap,
      trainings: trainingForCategory(imp.name).slice(0, 3),
      microActions: [
        pick(lang, 'Bir meslektaşınızdan bu alanda gözlem geri bildirimi isteyin.', 'Ask a colleague for observation feedback in this area.', 'Demandez un retour d’observation à un collègue.'),
        pick(lang, 'Haftada bir uygulama örneği not edin (ders, toplantı, veli görüşmesi).', 'Log one weekly practice example (lesson, meeting, parent talk).', 'Notez une pratique hebdomadaire.'),
        pick(lang, 'İlgili eğitimi planlayın ve başlangıç tarihi belirleyin.', 'Schedule related training with a start date.', 'Planifiez une formation avec une date de début.'),
      ],
    })
  })

  if (over[0]) {
    const c = over[0]
    insightCards.push({
      id: 'awareness-over',
      kind: 'awareness_over',
      category: c.name,
      title: pick(lang, 'Öz algınız ekibinizden yüksek', 'Self-rating higher than team', 'Auto‑évaluation plus haute que l’équipe'),
      body: pick(
        lang,
        `"${c.name}" alanında kendinizi ${c.selfScore.toFixed(1)} görüyorsunuz; ekip ${c.peerScore.toFixed(1)} diyor. Geri bildirimle kalibrasyon yapın.`,
        `In "${c.name}" you rate yourself ${c.selfScore.toFixed(1)}; the team says ${c.peerScore.toFixed(1)}. Calibrate with feedback.`,
        `Sur "${c.name}" vous vous notez ${c.selfScore.toFixed(1)} ; l’équipe ${c.peerScore.toFixed(1)}. Calibrez-vous.`
      ),
      selfScore: c.selfScore,
      peerScore: c.peerScore,
      gap: c.gap,
      trainings: [],
      microActions: [
        pick(lang, 'Bu alanda son 2 haftada somut bir örnek yazın ve bir meslektaşa sorun.', 'Write two concrete examples from the last 2 weeks and ask a peer.', 'Notez deux exemples récents et demandez un avis.'),
      ],
    })
  }

  if (under[0]) {
    const c = under[0]
    insightCards.push({
      id: 'awareness-under',
      kind: 'awareness_under',
      category: c.name,
      title: pick(lang, 'Ekibiniz sizi daha yüksek görüyor', 'Team sees you higher', 'L’équipe vous voit plus haut'),
      body: pick(
        lang,
        `"${c.name}" alanında ekip ${c.peerScore.toFixed(1)} veriyor; siz ${c.selfScore.toFixed(1)}. Güçlü yönünüzü görünür kılın.`,
        `In "${c.name}" the team rates ${c.peerScore.toFixed(1)}; you ${c.selfScore.toFixed(1)}. Make your strength visible.`,
        `Sur "${c.name}" l’équipe ${c.peerScore.toFixed(1)} ; vous ${c.selfScore.toFixed(1)}. Rendez votre force visible.`
      ),
      selfScore: c.selfScore,
      peerScore: c.peerScore,
      gap: c.gap,
      trainings: [],
      microActions: [
        pick(lang, 'Bu alanda yaptığınız iyi bir uygulamayı paylaşın (ekip toplantısı veya öğretmen toplantısı).', 'Share one good practice you did in this area.', 'Partagez une bonne pratique dans ce domaine.'),
      ],
    })
  }

  if (strengths[0]) {
    const s = strengths[0]
    insightCards.push({
      id: 'strength-top',
      kind: 'strength',
      category: s.name,
      title: pick(lang, 'Güçlü alanınızı yaygınlaştırın', 'Spread your strength', 'Diffusez votre point fort'),
      body: pick(
        lang,
        `"${s.name}" (${s.peerScore.toFixed(1)}/5) güçlü bir alan. Mentorluk veya örnek ders ile ekibe katkı sağlayabilirsiniz.`,
        `"${s.name}" (${s.peerScore.toFixed(1)}/5) is a strength. Contribute via mentoring or model lessons.`,
        `"${s.name}" (${s.peerScore.toFixed(1)}/5) est un point fort. Contribuez par mentorat ou démonstration.`
      ),
      selfScore: s.selfScore,
      peerScore: s.peerScore,
      gap: s.gap,
      trainings: [],
      microActions: [
        pick(lang, 'Bir meslektaşa bu alanda kısa rehberlik teklif edin.', 'Offer brief guidance to a colleague in this area.', 'Proposez un court accompagnement à un collègue.'),
      ],
    })
  }

  const actionSteps: DevelopmentActionStep[] = improvements.slice(0, 3).map((imp) => {
    const tgt = targetScore(imp.peerScore)
    return {
      category: imp.name,
      title: pick(lang, `${imp.name} gelişim hedefi`, `${imp.name} development goal`, `Objectif : ${imp.name}`),
      goal: pick(
        lang,
        `${imp.peerScore.toFixed(1)} → ${tgt.toFixed(1)} (3 ay)`,
        `${imp.peerScore.toFixed(1)} → ${tgt.toFixed(1)} (3 months)`,
        `${imp.peerScore.toFixed(1)} → ${tgt.toFixed(1)} (3 mois)`
      ),
      hint: pick(
        lang,
        'Eylem Planlarım sayfasında adımları işaretleyerek ilerlemenizi takip edin.',
        'Track progress on the Action Plans page by marking steps.',
        'Suivez l’avancement sur la page Plans d’action.'
      ),
      microActions: trainingForCategory(imp.name).slice(0, 2).length
        ? [
            pick(lang, 'Eğitimi planla', 'Plan training', 'Planifier la formation'),
            pick(lang, 'Uygulamayı başlat', 'Start practice', 'Démarrer la pratique'),
            pick(lang, 'Sonucu değerlendir', 'Review outcome', 'Évaluer le résultat'),
          ]
        : [
            pick(lang, 'Hedefi yazılı netleştir', 'Clarify goal in writing', 'Clarifier l’objectif par écrit'),
            pick(lang, 'Haftalık uygulama yap', 'Weekly practice', 'Pratique hebdomadaire'),
            pick(lang, 'Geri bildirim al', 'Get feedback', 'Obtenir un retour'),
          ],
    }
  })

  const recommendations: string[] = insightCards.map((c) => `${c.title}: ${c.body}`)

  return {
    headline,
    subline,
    chartRows,
    insightCards,
    actionSteps,
    strengths,
    improvements,
    recommendations,
  }
}
