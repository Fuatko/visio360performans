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
export const CONSENT_VERSION = '2026-09-tr-fr'

// Kaynak: okul yönetiminin Word belgesi (360_Gizlilik_Taahhudu_Imza_Listesi, Eylül 2026).
// Metne müdahale edilmedi; yalnız markdown biçimi uygulandı. en boş → Türkçeye düşer.
export const CONSENT_CONTENT: Record<Lang, string> = {
  tr: `## GİZLİLİK TAAHHÜDÜ VE BİLGİLENDİRME METNİ

Kurumumuzda yürütülen 360 derece performans değerlendirme süreci; çalışanın kendisi, yöneticisi, astları ve ekip arkadaşları tarafından çok yönlü şekilde değerlendirilmesini kapsamaktadır. Bu süreçte, değerlendirmelerin güvenilirliği ve sağlıklı yürütülmesi açısından gizlilik büyük önem taşımaktadır.

Bu doğrultuda;

- Değerlendirme sürecinde, kimi değerlendirdiğimi hiçbir şekilde üçüncü kişilerle paylaşmayacağımı,
- Beni kimin değerlendirdiğini öğrenmeye çalışmayacağımı ve bu konuda diğer kişilerle herhangi bir iletişime geçmeyeceğimi,
- Tüm sürecin gizlilik esasına göre yürütüldüğünü bildiğimi ve buna uygun davranacağımı,

kabul eder, bu ilkelere uyacağımı taahhüt ederim.

---

*Bu ekranı onaylayarak yukarıdaki metni okuduğunuzu ve belirtilen gizlilik ilkelerine uyacağınızı kabul etmiş olursunuz. Onayınız tarih ve saatiyle birlikte kayıt altına alınır.*
`,
  fr: `## ENGAGEMENT À LA CONFIDENTIALITÉ ET TEXTE D'ÉCLAIRCISSEMENT

Le processus d’évaluation à 360° des performances, en cours de réalisation dans notre établissement, comprend des travaux d’évaluation omnidirectionnels de l’employé·e lui ou elle-même, de ses administrateurs et/ou administratrices, des personnes placées sous son autorité ainsi que de ses coéquipier·ère·s. Tout au long dudit processus, la protection de la confidentialité la plus stricte revêt la plus haute importance pour assurer la fiabilité et la bonne marche des travaux d’évaluation.

En conséquence, j’accepte et m’engage à agir en conformité avec les principes suivants :

- Je ne divulguerai d’aucune manière à des tierces personnes qui j’ai évalué·e lors du processus d’évaluation.
- Je ne chercherai pas à découvrir qui m’a évalué·e et ne communiquerai avec personne à ce sujet.
- Je suis conscient·e que le processus dans son entièreté se déroule dans le respect du principe de confidentialité, et agirai moi-même dans le respect irréprochable de celui-ci.

---

*En validant cet écran, vous déclarez avoir lu le texte ci-dessus et vous engagez à respecter les principes de confidentialité qui y sont énoncés. Votre validation est enregistrée avec sa date et son heure.*
`,
  en: ``,
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
