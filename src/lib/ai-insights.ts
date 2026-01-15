'use client'

type Named = { name: string }

export function trainingForCategory(categoryName: string): string[] {
  const n = (categoryName || '').toLowerCase()
  const out: string[] = []

  const push = (s: string) => {
    if (!out.includes(s)) out.push(s)
  }

  if (/(iletişim|iletisim|dinleme|empati)/.test(n)) push('Etkili İletişim ve Aktif Dinleme')
  if (/(geri bildirim|geribildirim|feedback)/.test(n)) push('Geri Bildirim Verme ve Alma (Koçluk Yaklaşımı)')
  if (/(takım|takim|işbirliği|isbirligi|ekip)/.test(n)) push('Takım Çalışması ve İşbirliği')
  if (/(çatış|catis|müzakere|muzakere)/.test(n)) push('Çatışma Yönetimi ve Müzakere')
  if (/(zaman|öncelik|oncelik|planlama|organizasyon)/.test(n)) push('Zaman Yönetimi ve Önceliklendirme')
  if (/(lider|koç|koc|yönet|yonet)/.test(n)) push('Liderlik ve Koçluk Becerileri')
  if (/(problem|analitik|veri|karar)/.test(n)) push('Problem Çözme ve Analitik Düşünme')
  if (/(strateji|vizyon)/.test(n)) push('Stratejik Düşünme ve Hedef Yönetimi')
  if (/(değişim|degisim|esneklik|uyum)/.test(n)) push('Değişim Yönetimi ve Adaptasyon')

  if (out.length === 0 && categoryName) {
    push(`Yetkinlik Gelişimi: ${categoryName}`)
  }
  return out
}

export function buildAiInsightsFromSwotPeer(swotPeer: {
  strengths: Named[]
  weaknesses: Named[]
}): { summary: string; trainings: string[] } {
  const strong = (swotPeer?.strengths || []).slice(0, 2).map((s) => s.name).filter(Boolean)
  const weak = (swotPeer?.weaknesses || []).slice(0, 3).map((w) => w.name).filter(Boolean)

  const trainings = weak.flatMap((c) => trainingForCategory(c)).slice(0, 6)

  const summaryParts: string[] = []
  if (strong.length) summaryParts.push(`Ekip güçlü gördüğü alanlar: ${strong.join(', ')}`)
  if (weak.length) summaryParts.push(`Gelişim alanları: ${weak.join(', ')}`)
  const summary = summaryParts.length ? `${summaryParts.join('. ')}.` : 'Yeterli veri yok.'

  return { summary, trainings }
}

