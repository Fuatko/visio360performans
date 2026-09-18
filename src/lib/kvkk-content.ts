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
  tr: `## Kişisel Verilerin Korunması

İstanbul Özel Saint-Joseph Fransız Lisesi olarak, performans değerlendirme sistemi kapsamında işlenen kişisel verilerinizin korunmasına önem veriyoruz. Bu sayfa, hangi verilerin neden işlendiği konusunda sizi bilgilendirmek amacıyla hazırlanmıştır.

### Hangi verileriniz işleniyor?

- Ad, soyad ve kurumsal e-posta adresiniz
- Telefon numaranız
- Birim, görev ve unvan bilgileriniz
- Değerlendirme sonuçlarınız: aldığınız puanlar, verdiğiniz puanlar, öz değerlendirmeniz ve açık uçlu yorumlar
- Sistem güvenliği kayıtları: giriş zamanları ve IP adresi

### Neden işleniyor?

Performansın ölçülmesi, gelişim alanlarının belirlenmesi, eğitim ihtiyaçlarının planlanması ve kurum içi insan kaynakları süreçlerinin yürütülmesi amacıyla.

Bu işleme, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 5. maddesinde düzenlenen **sözleşmenin ifası** ve **meşru menfaat** hukuki sebeplerine dayanmaktadır.

### Verileriniz nerede tutuluyor?

Verileriniz **Türkiye'de bulunan sunucularda** saklanmaktadır. Sistemin işleyişi için doğrulama kodu e-postalarının gönderimi ve uygulama barındırma hizmeti alınan sağlayıcılara sınırlı aktarım yapılmaktadır. Yapay zeka destekli analizlerde kimlik bilgileriniz paylaşılmaz.

### Ne kadar süre saklanıyor?

Değerlendirme sonuçlarınız, yıllar arası gelişiminizin izlenebilmesi için görev süreniz boyunca saklanır. Teknik güvenlik kayıtları en fazla 180 gün, doğrulama kodları en fazla 30 gün tutulur ve otomatik olarak silinir.

### Haklarınız

Kanun'un 11. maddesi uyarınca; verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini isteme, aktarıldığı tarafları bilme ve kanuna aykırı işleme nedeniyle zarara uğramanız halinde giderim talep etme haklarına sahipsiniz.

Talepleriniz için kurumun insan kaynakları birimine başvurabilirsiniz.

---

*Ayrıntılı aydınlatma metni hazırlanmaktadır ve tamamlandığında bu sayfada yayımlanacaktır.*
`,
  fr: `## Protection des données personnelles

Le Lycée Français Privé Saint-Joseph d'Istanbul accorde une grande importance à la protection de vos données personnelles traitées dans le cadre du système d'évaluation de la performance. Cette page a pour objet de vous informer sur les données traitées et leurs finalités.

### Quelles données sont traitées ?

- Nom, prénom et adresse électronique professionnelle
- Numéro de téléphone
- Service, fonction et titre
- Résultats d'évaluation : notes reçues, notes attribuées, auto-évaluation et commentaires libres
- Journaux de sécurité : horodatage des connexions et adresse IP

### Pourquoi sont-elles traitées ?

Pour mesurer la performance, identifier les axes de développement, planifier les besoins de formation et assurer la gestion des processus de ressources humaines.

Ce traitement repose sur les bases légales de l'**exécution du contrat** et de l'**intérêt légitime**, prévues à l'article 5 de la loi turque n° 6698 sur la protection des données personnelles.

### Où vos données sont-elles conservées ?

Vos données sont hébergées sur des **serveurs situés en Turquie**. Pour le fonctionnement du système, des transferts limités sont effectués vers les prestataires assurant l'envoi des codes de vérification et l'hébergement de l'application. Vos données d'identification ne sont pas partagées lors des analyses assistées par intelligence artificielle.

### Pendant combien de temps ?

Vos résultats d'évaluation sont conservés pendant la durée de vos fonctions, afin de permettre le suivi de votre évolution d'une année à l'autre. Les journaux de sécurité sont conservés au maximum 180 jours et les codes de vérification au maximum 30 jours, puis supprimés automatiquement.

### Vos droits

Conformément à l'article 11 de la loi, vous avez le droit de savoir si vos données sont traitées, d'en demander communication, d'en demander la rectification, de connaître les destinataires et de demander réparation en cas de préjudice résultant d'un traitement illicite.

Pour toute demande, vous pouvez vous adresser au service des ressources humaines de l'établissement.

---

*Une note d'information détaillée est en cours de préparation et sera publiée sur cette page.*
`,
  en: `## Personal Data Protection

İstanbul Private Saint-Joseph French High School attaches great importance to protecting the personal data processed within the performance evaluation system. This page informs you about what data is processed and why.

### What data is processed?

- Name, surname and corporate email address
- Telephone number
- Unit, role and title
- Evaluation data: scores received, scores given, self-assessment and open-ended comments
- Security records: login timestamps and IP address

### Why is it processed?

To measure performance, identify development areas, plan training needs and manage internal human resources processes.

This processing is based on the legal grounds of **performance of a contract** and **legitimate interest**, as set out in Article 5 of Turkish Law No. 6698 on the Protection of Personal Data.

### Where is your data stored?

Your data is hosted on **servers located in Türkiye**. For the system to operate, limited transfers are made to providers handling verification code emails and application hosting. Your identifying information is not shared in AI-assisted analyses.

### How long is it kept?

Your evaluation results are retained for the duration of your employment, so that your development can be tracked from year to year. Security logs are kept for a maximum of 180 days and verification codes for a maximum of 30 days, after which they are automatically deleted.

### Your rights

Under Article 11 of the Law, you have the right to learn whether your data is being processed, to request information about it, to request correction, to know the parties it is transferred to, and to claim compensation for damage arising from unlawful processing.

For any request, please contact the institution's human resources department.

---

*A detailed privacy notice is being prepared and will be published on this page.*
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
