# Erişilebilirlik Tercihleri Modeli

Bu modelin amacı kullanıcıları engel türüyle etiketlemek değil, kendi seçtikleri kullanım tercihlerini saklamaktır. Bu nedenle `blind`, `deaf`, `disabled` gibi hassas sağlık verisi niteliğinde alanlar tutulmaz.

## Kısa Vadeli Uygulama

Mevcut uygulama `localStorage` üzerinden çalışır:

- `highContrast`: yüksek kontrast görünüm
- `largeText`: büyük yazı ve daha geniş dokunma alanları
- `reducedMotion`: animasyon ve geçişleri azaltma

Bu yaklaşım canlı veriye ve Supabase tablolarına dokunmaz. Kullanıcının cihazında kalır ve test için güvenlidir.

## Kalıcı Model

Kurum onayı alınırsa tercihler ayrı bir tabloda saklanmalıdır:

- Mevcut `users` tablosu genişletilmez.
- Hassas engel tipi tutulmaz.
- Sadece ürün kullanım tercihleri saklanır.
- RLS ile kullanıcı sadece kendi tercihini görür/günceller.
- Admin raporlarına dahil edilmez.

Önerilen alanlar:

- `high_contrast`
- `large_text`
- `reduced_motion`
- `screen_reader_mode`
- `simple_language`
- `visual_cues`

## KVKK Notu

Erişilebilirlik tercihi, kullanıcı deneyimi ayarı olarak ele alınmalıdır. Kullanıcıya “görme engelli”, “sağır”, “dilsiz” gibi doğrudan sağlık/engel etiketi atanmaz. Böylece sistem hem daha saygılı hem de veri minimizasyonuna daha uygun kalır.
