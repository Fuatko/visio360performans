# Yurt dışı bağlantılar ve veri yerleşimi

Son güncelleme: 30 Ekim 2026

Bu dosya, yazılımın dışarıya yaptığı bütün bağlantıları ve her birine giden
veriyi listeler. KVKK kapsamında yurt dışına veri aktarımı değerlendirmesi
buradan yapılır.

## Veri nerede duruyor

| Veri | Yer | Not |
|---|---|---|
| Bütün kişisel ve iş verisi | Türkiye (`visio360_prod`, kendi sunucumuz) | Tek veri kaynağı |
| Eski kopya (1 Temmuz 2026'ya kadar) | Frankfurt, Supabase `visio-360-pds` | Emekli; okunmuyor, yazılmıyor. Silinmesi değerlendiriliyor |

## Dışarıya giden bağlantılar

| Servis | Amaç | Giden veri | Konum | Not |
|---|---|---|---|---|
| Vercel | Barındırma, sunucu kodunun çalıştığı yer | Bütün istek/yanıt trafiği | doğrulanacak (fonksiyon bölgesi) | Aşağıdaki açık maddeye bak |
| OpenAI (`api.openai.com`) | Yapay zekâ analizleri (5 rota) | Toplu puanlar, kategori ve soru metinleri, takma adlar (K1, "Yönetici A"). Ayrıca: **departman adları** (kurum içgörüleri), **anket başlığı ve açık uçlu cevapların ham metni** (anket analizi), grup linki etiketleri | ABD | Ad, soyad, e-posta yapısal alan olarak gitmez. Açık uçlu metinde katılımcının yazdığı isim süzülmeden gider — açık maddeye bak |
| Brevo (`api.brevo.com`) | İşlem e-postaları (OTP, davet) | Alıcı e-posta adresi, ad, e-posta içeriği | Fransa (AB) | |
| Resend (`api.resend.com`) | Alternatif e-posta sağlayıcı | Aynı | ABD | **Pasif.** Yalnız `BREVO_API_KEY` tanımlı değilse kullanılır; canlı projede tanımlı. Brevo hata verirse Resend'e geçilmez |
| Upstash / Vercel KV | Hız sınırlama (rate limit) | **Ham IP adresi** ve kullanıcı kimliği (UUID) anahtar içinde, sayaç | doğrulanacak (bölge) | Kayıt yalnız sınırlama penceresi boyunca durur (genelde 60 sn), sonra kendiliğinden silinir |
| InspiraSuite (`www.inspirasuite.com`) | Eğitim atama/ilerleme entegrasyonu | Kişinin e-posta adresi, kurs bilgisi, atayan, atama gerekçesi (yetkinlik adı + puan/hedef), son tarih | kendi sistemimiz (Vercel'de barındırılıyor; bölge doğrulanacak) | |

## Açık maddeler

- **Vercel fonksiyon bölgesi doğrulanmalı.** `vercel.json` içinde `regions`
  tanımlı değil; bu durumda sunucu kodu Vercel'in varsayılan bölgesinde
  (genellikle ABD) çalışır. Veritabanı Türkiye'de olsa bile istekler orada
  işlenir. Vercel'in Türkiye bölgesi yoktur; en yakın seçenek Frankfurt
  (`fra1`). Bölgeyi sabitlemek hem gecikmeyi düşürür hem veri işleme yerini
  AB'ye taşır. Karar Fuat'ta.
- **Frankfurt'taki emekli Supabase projesi** içinde 1 Temmuz 2026'ya kadarki
  kişisel veri duruyor. Yedekleyip silmek veya saklamaya devam etmek — karar
  Fuat'ta.
- **`xlsx` paketi** (A1 bulgusu): `npm audit` → **high**, iki açık:
  Prototype Pollution (GHSA-4r6h-8v6p-xvw6) ve ReDoS (GHSA-5pgg-2g8v-p4x9),
  **"No fix available"** (npm'deki sürüm düzeltme almıyor). Paket kullanıcının
  yüklediği Excel dosyalarını işliyor (anket soru havuzu, toplu içe aktarma).
  Yükseltme / alternatif — karar Fuat'ta.
- **OpenAI'a açık uçlu anket cevapları ham gidiyor** (`surveys/ai-analyze`,
  en fazla 40 örnek, 240 karakter). Katılımcı cevabına isim yazarsa süzülmeden
  ABD'ye gider. Ayrıca kurum içgörülerinde (`insights-ai`) **departman adları**
  gönderiliyor (yönetici adları takma adla gizleniyor). Karar Fuat'ta.
- **Hız sınırlamada ham IP** Upstash'e anahtar olarak yazılıyor (kısa ömürlü).
  Upstash bölgesi doğrulanmalı.
- **InspiraSuite barındırma bölgesi** doğrulanmalı (Vercel'de; `regions` ayarı
  bilinmiyor). Kişinin e-posta adresi bu sisteme gidiyor.
