# Alan Bazlı Şifreleme Yol Haritası

Bu yol haritası raporlama, arama ve puanlama mantığını bozmadan hassas verileri aşamalı korumak için hazırlanmıştır.

## Şimdi Şifrelenmemesi Gereken Alanlar

Bu alanlar sistemin join, filtre, hesaplama ve raporlama yapması için gereklidir:

- UUID primary/foreign key alanları
- `organization_id`
- `period_id`
- `assignment_id`
- `question_id`
- `manager_id`
- `department`
- `position_level`
- `std_score`, `reel_score`, `score`
- `status`
- tarih alanları

Bu alanlar yerine erişim kontrolü, RLS, service-role-only API ve şifreli backup ile korunmalıdır.

## İlk Şifreleme Adayları

Düşük riskli, sorgulama bağımlılığı daha az alanlar:

- AI açıklama metinleri
- Admin serbest notları
- Snapshot JSON payload içindeki rapor açıklamaları
- Audit log içindeki detay/metaveri alanları

Bu alanlar için önerilen model:

- `*_encrypted` alanı: AES-GCM ile şifreli içerik
- `*_hash` alanı: gerekiyorsa lookup için HMAC-SHA256
- Key yönetimi: `APP_FIELD_ENCRYPTION_KEY`

## PII Alanları

`users.email`, `users.name`, `users.phone` hassastır; ancak uygulamada yoğun kullanılır.

Önerilen aşamalı model:

1. Yeni kolonlar eklenir:
   - `email_hash`
   - `email_encrypted`
   - `phone_encrypted`
2. Login/OTP araması `email_hash` ile yapılacak şekilde ayrı planlanır.
3. UI için decrypt yalnızca server API içinde yapılır.
4. Eski açık alanlar bir geçiş süresi korunur.
5. Geçiş tamamlanınca açık alanların kullanımını azaltma planı yapılır.

## Key Yönetimi

- Backup şifreleme anahtarı ile uygulama alan şifreleme anahtarı ayrı olmalıdır.
- Önerilen env değerleri:
  - `BACKUP_ENCRYPTION_PASSWORD`
  - `APP_FIELD_ENCRYPTION_KEY`
  - `APP_FIELD_ENCRYPTION_KEY_ID`
- Key rotasyonu ayrı migration/runbook ile yapılmalıdır.

## Öncelik Sırası

1. Backup/restore çalışır hale gelsin.
2. Backup health ve restore testi otursun.
3. Audit log ve snapshot payload minimizasyonu yapılsın.
4. AI/serbest metin alanları için yeni encrypted kolonlar tasarlansın.
5. PII hash + encrypted value modeli için ayrı küçük proje planı çıkarılsın.

## Risk Notları

- E-posta direkt şifrelenirse OTP/login araması bozulur.
- İsim direkt şifrelenirse raporlar ve admin listeleri etkilenir.
- Skorlar şifrelenirse sonuç hesaplama yapılamaz.
- Departman şifrelenirse filtreler ve karşılaştırmalar bozulur.

Bu nedenle şifreleme veriyi korumanın tek katmanı değil; RLS, server-only erişim, şifreli backup ve audit ile birlikte uygulanmalıdır.
