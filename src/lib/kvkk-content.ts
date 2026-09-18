import type { Lang } from '@/lib/i18n'

/**
 * KVKK bilgilendirme metni — GEÇİCİ, kod-içi sabit.
 *
 * Ekim 2026'da kurum avukatıyla kesinleştirilecek ve KURUM-BAZLI düzenlenebilir
 * hale getirilecek. O zaman yalnızca `getKvkkContent` gövdesi DB/kurum ayarından
 * okuyacak şekilde değiştirilecek; sayfa ve menü kodu AYNEN kalacak.
 *
 * Metni değiştirmek için: aşağıdaki tr/fr/en markdown dizelerini güncelleyin.
 * Bir dil boşsa sayfa otomatik olarak Türkçeye düşer.
 */
export const KVKK_CONTENT: Record<Lang, string> = {
  tr: `# Kişisel Verilerin Korunması

_Bu metin geçici bir bilgilendirmedir; ayrıntılı aydınlatma metni hazırlanmaktadır._

<!-- METİN BURAYA: Türkçe kısa bilgilendirme -->
`,
  fr: `# Protection des données personnelles

_Ce texte est une information provisoire ; le texte d'information détaillé est en cours de préparation._

<!-- TEXTE ICI : information succincte en français -->
`,
  en: `# Personal Data Protection

_This is a provisional notice; the detailed privacy notice is being prepared._

<!-- TEXT HERE: brief notice in English -->
`,
}

export type KvkkContent = {
  /** Render edilecek markdown metni */
  markdown: string
  /** İçeriğin gösterildiği gerçek dil */
  lang: Lang
  /** İstenen dilde metin yoktu, Türkçeye düşüldü */
  fellBackToTr: boolean
}

/**
 * İstenen dildeki KVKK metnini döndürür; o dilde metin yoksa Türkçeye düşer.
 * Ekim'de imza değişmeden kurum-bazlı kaynağa çevrilecek tek giriş noktası.
 */
export function getKvkkContent(lang: Lang): KvkkContent {
  const requested = (KVKK_CONTENT[lang] || '').trim()
  if (requested) {
    return { markdown: requested, lang, fellBackToTr: false }
  }
  return { markdown: (KVKK_CONTENT.tr || '').trim(), lang: 'tr', fellBackToTr: lang !== 'tr' }
}
