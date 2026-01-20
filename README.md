# VISIO 360° - Next.js Performans Değerlendirme Sistemi

## 🚀 Hızlı Başlangıç

### 1. Bağımlılıkları Yükle
```bash
npm install
```

### 2. Environment Değişkenleri
`.env.local` dosyası oluşturun:
```env
NEXT_PUBLIC_SUPABASE_URL=https://bwvvuyqaowbwlodxbbrl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## 🔒 Security & KVKK (Kurumsal Mod)

Bu proje, KVKK ve çoklu-kurum (multi-tenant) senaryoları için **client → DB direkt erişimini minimize edecek** şekilde tasarlanmıştır. Kritik tablolar **RLS deny-all + revoke** ile kapatılır; uygulama **server API (service role)** üzerinden çalışır.

### ✅ Önerilen Production Env (Vercel)

- **Supabase**
  - **SUPABASE_URL**: `https://<project>.supabase.co`
  - **NEXT_PUBLIC_SUPABASE_URL**: aynı URL (client için)
  - **NEXT_PUBLIC_SUPABASE_ANON_KEY**
  - **SUPABASE_SERVICE_ROLE_KEY** (server API için zorunlu)
- **OTP / Audit**
  - **OTP_PEPPER** (OTP hash doğrulama için)
  - **AUDIT_PEPPER** (ops log’da `email_hash` için; OTP_PEPPER ile aynı olabilir)
  - **OTP_HASH_ONLY=1** (OTP plaintext saklamayı kapatır)
- **Fallback kapatma (önerilir)**
  - **DISABLE_SUPABASE_FALLBACK=1**
  - **NEXT_PUBLIC_DISABLE_SUPABASE_FALLBACK=1**
- **Email Provider (OTP mail)**
  - Brevo kullanıyorsanız: **BREVO_API_KEY**, **BREVO_FROM_EMAIL**, **BREVO_FROM_NAME**

### 🔍 Doğrulama

- Uygulama içinden: **Admin → Ayarlar → “Güvenlik Durumu (KVKK)”**
- API: **GET /api/health/security**

### 🧩 Supabase SQL Kurulum Sırası (Özet)

#### OTP + Audit (KVKK)

- sql/security-otp-rate-limit.sql
- sql/security-otp-hash.sql
- sql/security-otp-verify-rate-limit.sql
- sql/security-otp-rls.sql
- sql/security-otp-revoke-client.sql
- sql/security-audit-email-hash.sql
- sql/security-audit-pii-minimize.sql (**raw email artık NULL olmalı**)
- sql/security-audit-retention.sql (audit cleanup + opsiyonel cron)
- sql/security-otp-cron.sql (OTP cleanup + opsiyonel cron)

**Retention varsayılanları**
- OTP tabloları: **30 gün**
- security_audit_logs: **180 gün**

#### Evaluation (KVKK + veri bütünlüğü)

- sql/security-evaluation-integrity.sql (dedupe + unique index)
- sql/security-evaluation-rls.sql
- sql/security-evaluation-revoke-client.sql

### 🧾 KVKK Operasyon Checklist (Deploy Sonrası)

#### 1) Env doğrulama
- Admin → Ayarlar → **Güvenlik Durumu (KVKK)** → **Durumu Yenile**
- Beklenen:
  - OTP_PEPPER: OK
  - AUDIT_PEPPER: OK (veya önerilir ama hashing çalışıyor)
  - OTP_HASH_ONLY: AÇIK
  - SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY: OK
  - Fallback (Server/Client): KAPALI

#### 1b) SQL doğrulama (Supabase)

Supabase SQL Editor’da hızlı kontrol için:

```sql
-- RLS açık mı?
select relname, relrowsecurity
from pg_class
where relname in ('evaluation_assignments','evaluation_responses','international_standard_scores','evaluation_period_questions','otp_codes','otp_rate_limits','otp_verify_attempts','security_audit_logs');
```

```sql
-- Policy’ler oluştu mu?
select schemaname, tablename, policyname, permissive, cmd
from pg_policies
where tablename in ('evaluation_assignments','evaluation_responses','international_standard_scores','evaluation_period_questions','otp_codes','otp_rate_limits','otp_verify_attempts','security_audit_logs')
order by tablename, policyname;
```

```sql
-- anon/authenticated grant kaldı mı? (beklenen: 0 satır)
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('evaluation_assignments','evaluation_responses','international_standard_scores','evaluation_period_questions','otp_codes','otp_rate_limits','otp_verify_attempts','security_audit_logs')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;
```

```sql
-- Audit PII: email NULL mı? (beklenen: 0)
select count(*) as email_not_null
from public.security_audit_logs
where email is not null;
```

#### 2) OTP akışı testi
- /login → OTP iste → mail gelir mi?
- OTP doğrula → dashboard açılır mı?

#### 3) Evaluation akışı testi
- /dashboard/evaluations → 1 değerlendirme aç
- 1-2 soru işaretle → sayfayı yenile → cevaplar geri geliyor mu?
- Gönder → başarıyla kaydedildi mi?

#### 4) Admin testleri (KVKK/RLS sonrası)
- /admin/matrix → liste geliyor mu? atama ekle/sil çalışıyor mu?
- /admin/periods → soru seçimi (modal) açılıyor ve kaydediyor mu?

#### 5) Audit log PII kontrolü
- security_audit_logs.email her zaman **NULL** olmalı (DB constraint ile).
- email_hash doluyor mu kontrol edin.

#### 6) Retention / cron kontrolü (opsiyonel)
- security_otp_cleanup_daily ve security_audit_cleanup_daily cron job’ları (varsa) görünüyor mu?
- Retention: OTP 30 gün, audit 180 gün.

### 🧯 Rollback Notları (Acil Durum)

> Not: Rollback, KVKK politikalarını gevşetir. Sadece geçici arıza giderme için kullanın.

- **Evaluation RLS kapatma (geçici):**
  - alter table public.evaluation_assignments disable row level security;
  - alter table public.evaluation_responses disable row level security;
  - alter table public.international_standard_scores disable row level security;
  - alter table public.evaluation_period_questions disable row level security;

- **Revoke geri alma (gerekirse):**
  - Supabase dashboard’dan ilgili tablolara anon/authenticated grant vermek gerekir.


### 3. Geliştirme Sunucusu
```bash
npm run dev
```

### 4. Production Build
```bash
npm run build
npm start
```

---

## 📁 Proje Yapısı

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/               # Auth sayfaları (login)
│   ├── (admin)/              # Admin paneli
│   │   └── admin/
│   │       ├── page.tsx      # Dashboard
│   │       ├── users/        # Kullanıcı yönetimi
│   │       ├── organizations/# Kurum yönetimi
│   │       ├── periods/      # Dönem yönetimi
│   │       ├── matrix/       # Değerlendirme matrisi
│   │       └── questions/    # Soru yönetimi
│   └── (dashboard)/          # Kullanıcı paneli
├── components/               # React bileşenleri
├── lib/                      # Yardımcı fonksiyonlar
├── store/                    # Zustand store
└── types/                    # TypeScript tipleri
```

---

## 🔧 Teknolojiler

- **Framework:** Next.js 16 (App Router)
- **UI:** Tailwind CSS
- **State:** Zustand
- **Database:** Supabase
- **Icons:** Lucide React

---

## 📱 Sayfalar

### 🔐 Auth
- `/login` - Email OTP ile giriş

### 👤 Kullanıcı Paneli
- `/dashboard` - Ana sayfa
- `/dashboard/evaluations` - Değerlendirmelerim
- `/dashboard/results` - Sonuçlarım

### ⚙️ Admin Paneli
- `/admin` - Dashboard
- `/admin/users` - Kullanıcı yönetimi
- `/admin/organizations` - Kurum yönetimi
- `/admin/periods` - Dönem yönetimi
- `/admin/matrix` - Değerlendirme matrisi (3 görünüm)

---

## 🚀 Vercel Deploy

1. GitHub'a push edin
2. Vercel'e bağlayın
3. Environment değişkenlerini ayarlayın

---

© 2026 MFK Danışmanlık - VISIO 360°
# Deploy trigger
