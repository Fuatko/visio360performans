# Security & KVKK Hardening (VISIO 360°)

Bu doküman, VISIO 360° uygulamasında **siber saldırılara karşı** yaptığımız güvenlik sertleştirmelerini, “güvenlik duvarı / WAF” yaklaşımını ve **hangi standartlarla hizalı** çalıştığımızı açıklar.

> Not: Bu doküman **uygulamanın güvenli olduğunu garanti etmez** ve resmi bir sertifika (ISO 27001 vb.) yerine geçmez. Buradaki maddeler “uygulanan kontroller + operasyonel öneriler”dir.

## Kapsam ve Mimari (Özet)

- **Frontend**: Next.js (App Router)
- **Backend**: Next.js API Routes (Node runtime)
- **DB**: Supabase (Postgres)
- **Kimlik doğrulama**: OTP (email) + server-side session (httpOnly cookie)
- **Çoklu kurum (multi-tenant)**: organization_id üzerinden ayrım; cross-org erişim engelleri

## “Firewall / WAF” Yaklaşımı

Uygulama güvenliği “tek bir duvar” ile değil **katmanlı savunma (defense-in-depth)** ile sağlanır:

- **Edge/CDN katmanı (Vercel)**:
  - TLS/HTTPS terminasyonu ve DDoS mitigasyonu (platform kabiliyetleri)
  - Öneri: ihtiyaç halinde Vercel Firewall/WAF veya Cloudflare gibi bir WAF ile “IP/Geo/ASN” bazlı kurallar
- **Uygulama katmanı (bizim kontroller)**:
  - OTP ve kritik admin endpoint’lerde **rate limiting** (429 + Retry-After)
  - **Session cookie** ile server-side auth; client tarafında DB yetkisi verilmez
- **Veri katmanı (Supabase Postgres)**:
  - Kritik tablolarda **RLS deny-all** + **explicit REVOKE** (anon/authenticated)

## Uygulanan Güvenlik Kontrolleri (Bugünkü Durum)

### 1) KVKK / PII minimizasyonu

- Audit log’larda **raw email saklanmaz**, sadece `email_hash` tutulur.
- DB seviyesinde constraint ile `security_audit_logs.email` **her zaman NULL** olacak şekilde kilitlenir.
- Retention ile audit log’lar belirli bir sürede (varsayılan 180 gün) temizlenir.

İlgili SQL:
- `sql/security-audit-email-hash.sql`
- `sql/security-audit-pii-minimize.sql`
- `sql/security-audit-retention.sql`

### 2) OTP güvenliği

- OTP kayıtları için:
  - **Hash storage** (`code_hash`) + opsiyonel “hash-only” mod (`OTP_HASH_ONLY=1`)
  - DB-level rate limit (RPC) + app-level rate limit
  - Otomatik temizlik (cleanup) ve opsiyonel cron schedule
  - OTP tablolarında **RLS deny-all** + **REVOKE**

İlgili SQL:
- `sql/security-otp-hash.sql`
- `sql/security-otp-rate-limit.sql`
- `sql/security-otp-verify-rate-limit.sql`
- `sql/security-otp-rls.sql`
- `sql/security-otp-revoke-client.sql`
- `sql/security-otp-cleanup.sql`
- `sql/security-otp-cron.sql`

### 3) Evaluation (değerlendirme) tabloları güvenliği

- Evaluation tabloları client erişimine kapalıdır:
  - **RLS deny-all** + **REVOKE**
  - UI fallback’leri kaldırıldı; veri akışı server API üzerinden yürür.
- Veri bütünlüğü (integrity) için:
  - upsert hedefleri için **unique index** ve otomatik dedupe
  - submit endpoint’inde **cross-org guard** (defense-in-depth)

İlgili SQL:
- `sql/security-evaluation-integrity.sql`
- `sql/security-evaluation-rls.sql`
- `sql/security-evaluation-revoke-client.sql`

### 4) Güvenli session yönetimi

- Login sonrası session bilgisi **httpOnly cookie** ile tutulur.
- Admin işlemleri ve server-side data access bu cookie ile doğrulanır.

### 5) HTTP Security Headers (baseline)

`next.config.ts` içinde tüm route’lara baseline security headers uygulanır:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-site`

> Not: CSP (Content-Security-Policy) gibi daha agresif header’lar ileride eklenebilir; mevcut akışları bozmamak için şimdilik “konservatif” ilerlenmiştir.

## Standartlar ve Referanslar (Hizalanma)

Bu proje “uygulanan kontroller” anlamında aşağıdaki standart ve iyi pratiklerle **hizalıdır**:

### KVKK (Kişisel Verilerin Korunması Kanunu) prensipleri

- **Veri minimizasyonu**: audit log’larda PII azaltma (`email` yerine `email_hash`)
- **Erişim kontrolü**: RLS + revoke ile client erişimini kapatma
- **Saklama süresi (retention)**: audit/OTP cleanup
- **İzlenebilirlik**: event_type + ip + meta ile operasyonel iz

### OWASP Top 10 / OWASP ASVS (pratik hizalanma)

- **Broken Access Control**: server-side session + DB’de RLS deny-all
- **Cryptographic Failures**: OTP hash (HMAC), httpOnly cookie yaklaşımı
- **Identification & Authentication**: OTP verify rate limit, brute-force önleme
- **Security Logging & Monitoring**: audit log altyapısı + retention

### ISO/IEC 27001 (kontrol perspektifi)

Resmi sertifikasyon değildir; ancak aşağıdaki alanlarda “kontrol yaklaşımı” uyumludur:

- **Access control**: least privilege, role-based server API
- **Operations security**: log/retention, anahtar yönetimi (env)
- **Supplier relationships**: Vercel/Supabase/Brevo gibi üçüncü tarafların sınırlarının dokümante edilmesi

## Operasyonel Öneriler (Kurumsal Kullanım)

- **WAF**: Vercel Firewall/WAF veya Cloudflare (IP allowlist/geo/ASN/rate rules)
- **Secrets yönetimi**: Vercel Production env’de tutulmalı; düzenli rotation planı olmalı
- **Ayrı pepper’lar**: `AUDIT_PEPPER` ve `OTP_PEPPER` ayrıştırılabilir (security separation)
- **Backup/restore**: Supabase backup stratejisi ve test edilmiş restore prosedürü
- **Incident response**: KVKK ihlal bildirim süreçleri (iç prosedür)

## Güvenlik İletişimi / Sorumlu Bildirim

Güvenlik açığı bildirimi için kurum içinde bir email adresi belirleyin (ör. `security@...`) ve burada yayınlayın.

