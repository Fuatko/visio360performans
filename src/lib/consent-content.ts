import type { Lang } from '@/lib/i18n'

/**
 * Gizlilik / veri işleme TAAHHÜT (onay) metni — kod-içi sabit, kvkk-content.ts deseni.
 *
 * ⚠️ PLACEHOLDER: Aşağıdaki tr/fr metinleri geçicidir. Kurumun onayladığı NİHAİ
 * taahhüt metnini buraya yapıştırın. Metin her değiştiğinde CONSENT_VERSION'ı da
 * artırın (ör. '2026-09-24' → '2026-10-01'); sürüm değişince kullanıcılardan
 * onay YENİDEN istenir (accepted_at kaydı text_version ile eşleşmezse gate tekrar çıkar).
 *
 * Metni değiştirmek için: tr/fr markdown dizelerini güncelle + CONSENT_VERSION'ı güncelle.
 * Bir dil boşsa otomatik Türkçeye düşer.
 */

/** Metin sürümü — değişince onay yeniden istenir. Kayıtlarda text_version olarak tutulur. */
export const CONSENT_VERSION = '2026-09-24'

export const CONSENT_CONTENT: Record<Lang, string> = {
  tr: `## Gizlilik ve Veri İşleme Taahhüdü

Değerlendirme sürecine başlamadan önce aşağıdaki hususları okuyup onaylamanız gerekmektedir.

- Bu sistemde girdiğiniz değerlendirmelerin **gizli** tutulacağını ve yalnızca yetkili kişilerce, insan kaynakları süreçleri kapsamında görüleceğini,
- Değerlendirmeleri **dürüst, tarafsız ve gerçek gözlemlerinize dayanarak** yapacağınızı,
- Değerlendirme içeriğini üçüncü kişilerle paylaşmayacağınızı,
- Kişisel verilerinizin 6698 sayılı Kanun kapsamında işlendiğine dair [bilgilendirme metnini](/kvkk) okuduğunuzu

kabul ve taahhüt edersiniz.

*(Bu metin geçicidir; kurumun onayladığı nihai taahhüt metni ile değiştirilecektir.)*
`,
  fr: `## Engagement de confidentialité et de traitement des données

Avant de commencer le processus d'évaluation, vous devez lire et approuver les points suivants.

- Les évaluations que vous saisissez dans ce système resteront **confidentielles** et ne seront consultées que par les personnes autorisées, dans le cadre des processus de ressources humaines,
- Vous réaliserez les évaluations de manière **honnête, impartiale et fondée sur vos observations réelles**,
- Vous ne partagerez pas le contenu des évaluations avec des tiers,
- Vous avez lu la [note d'information](/kvkk) relative au traitement de vos données personnelles au titre de la loi n° 6698.

*(Ce texte est provisoire ; il sera remplacé par le texte d'engagement définitif approuvé par l'établissement.)*
`,
  en: `## Confidentiality and Data Processing Undertaking

Before starting the evaluation process, you must read and approve the following.

- The evaluations you enter in this system will remain **confidential** and will only be viewed by authorized persons within human resources processes,
- You will carry out the evaluations **honestly, impartially and based on your real observations**,
- You will not share the content of the evaluations with third parties,
- You have read the [information notice](/kvkk) regarding the processing of your personal data under Law No. 6698.

*(This text is provisional and will be replaced by the final undertaking text approved by the institution.)*
`,
}

export type ConsentContent = {
  /** Render edilecek markdown metni */
  markdown: string
  /** İçeriğin gösterildiği gerçek dil */
  lang: Lang
  /** İstenen dilde metin yoktu, Türkçeye düşüldü */
  fellBackToTr: boolean
  /** Kayıtta tutulacak metin sürümü */
  version: string
}

/**
 * İstenen dildeki taahhüt metnini döndürür; o dilde metin yoksa Türkçeye düşer.
 * Nihai metne geçişte imza değişmeden yalnız bu dosyanın içeriği güncellenecek.
 */
export function getConsentContent(lang: Lang): ConsentContent {
  const requested = (CONSENT_CONTENT[lang] || '').trim()
  if (requested) {
    return { markdown: requested, lang, fellBackToTr: false, version: CONSENT_VERSION }
  }
  return { markdown: (CONSENT_CONTENT.tr || '').trim(), lang: 'tr', fellBackToTr: lang !== 'tr', version: CONSENT_VERSION }
}
