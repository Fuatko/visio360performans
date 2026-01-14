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
