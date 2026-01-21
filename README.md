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
  - **`SUPABASE_URL`**: `https://<project>.supabase.co`
  - **`NEXT_PUBLIC_SUPABASE_URL`**: aynı URL (client için)
  - **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**
  - **`SUPABASE_SERVICE_ROLE_KEY`** (server API için zorunlu)
- **OTP / Audit**
  - **`OTP_PEPPER`** (OTP hash doğrulama için)
  - **`AUDIT_PEPPER`** (ops log’da `email_hash` için; OTP_PEPPER ile aynı olabilir)
  - **`OTP_HASH_ONLY=1`** (OTP plaintext saklamayı kapatır)
- **Fallback kapatma (önerilir)**
  - **`DISABLE_SUPABASE_FALLBACK=1`**
  - **`NEXT_PUBLIC_DISABLE_SUPABASE_FALLBACK=1`**
- **Email Provider (OTP mail)**
  - Brevo kullanıyorsanız: **`BREVO_API_KEY`**, **`BREVO_FROM_EMAIL`**, **`BREVO_FROM_NAME`**
- **Rate limit (500+ kullanıcı önerilir)**
  - **`UPSTASH_REDIS_REST_URL`**
  - **`UPSTASH_REDIS_REST_TOKEN`**

### 🔍 Doğrulama

- Uygulama içinden: **Admin → Ayarlar → “Güvenlik Durumu (KVKK)”**
- API: **`GET /api/health/security`**

### ✅ Go‑Live (Gerçek Kullanıcı) Smoke Test (10 dk)

- **Login / OTP**
  - 3 farklı kullanıcıyla giriş yapın (yanlış OTP → doğru OTP).
  - 429 limit testi: arka arkaya çok deneme → `Retry-After` header’ı gelmeli.
- **Değerlendirme akışı**
  - Bir kullanıcı `/dashboard/evaluations` listesini görmeli.
  - Bir değerlendirmeyi aç (`/evaluation/[slug]`) → form yüklenmeli.
  - Kaydet/submit → tekrar submit denemesinde 409 / “zaten tamamlanmış” görmelisiniz.
- **Sonuç ekranı**
  - `/dashboard/results` dönem seçimi + rapor görüntüleme.
  - “Ekip (Ortalama)” tek satır + Öz değerlendirme satırı (ekip tamamlanmadan ekip skoru kilitli).
- **Admin kritik ekranlar**
  - `/admin/matrix` veri geliyor mu (period/user listeleri).
  - `/admin/periods` → “Katsayıları Kilitle” çalışıyor mu (SQL kurulumu yapılmış olmalı).
  - `/admin/results` rapor alınıyor mu.
- **KVKK Health**
  - `/api/health/security` çıktısında `rate_limit_backend` ve `upstash_redis_configured` kontrol edin.

### 🧩 Supabase SQL Kurulum Sırası (Özet)

#### OTP + Audit (KVKK)

- `sql/security-otp-rate-limit.sql`
- `sql/security-otp-hash.sql`
- `sql/security-otp-verify-rate-limit.sql`
- `sql/security-otp-rls.sql`
- `sql/security-otp-revoke-client.sql`
- `sql/security-audit-email-hash.sql`
- `sql/security-audit-pii-minimize.sql` (**raw email artık NULL olmalı**)
- `sql/security-audit-retention.sql` (audit cleanup + opsiyonel cron)
- `sql/security-otp-cron.sql` (OTP cleanup + opsiyonel cron)

**Retention varsayılanları**
- OTP tabloları: **30 gün**
- `security_audit_logs`: **180 gün**

#### Evaluation (KVKK + veri bütünlüğü)

- `sql/security-evaluation-integrity.sql` (dedupe + unique index)
- `sql/security-evaluation-rls.sql`
- `sql/security-evaluation-revoke-client.sql`

#### Dönem Bazlı Katsayı Snapshot (Önerilir)

Katsayılar (değerlendirici ağırlıkları, kategori ağırlıkları) ve skorlama ayarları (güven/sapma) bazı kurumlarda **her değerlendirme döneminde farklı** olabilir. Bu yüzden dönem oluşturduktan sonra katsayıları **snapshot alarak kilitlemeniz** önerilir; böylece daha sonra kurum katsayıları değişse bile **geçmiş dönem raporları değişmez**.

- `sql/period-coefficients-snapshot.sql`

**Kullanım (Admin):**
- Admin → **Katsayı Ayarları**: Kurum katsayılarını ayarlayın.
- Admin → **Dönemler**: ilgili dönemin satırında **“Katsayıları Kilitle”** butonuna basın.

**Doğrulama (SQL):**
- Snapshot var mı?

```sql
select
  p.id as period_id,
  p.name,
  exists(select 1 from public.evaluation_period_scoring_settings s where s.period_id = p.id) as scoring_locked,
  (select count(*) from public.evaluation_period_evaluator_weights ew where ew.period_id = p.id) as evaluator_weights_count,
  (select count(*) from public.evaluation_period_category_weights cw where cw.period_id = p.id) as category_weights_count
from public.evaluation_periods p
order by p.created_at desc
limit 20;
```

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