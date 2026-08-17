# KESİŞ RUNBOOK — Supabase → TR PostgreSQL (PLAN, uygulama YOK)

> Sıralı + dur-kontrol noktalı. Her ✅ doğrulanmadan sonraki adıma GEÇME.
> Onaylanan kararlar: PG17 temiz kurulum · visio360_app sahiplik · Inspira modeli
> (açık port + SSL + güçlü parola) + verify-full · Seçenek C RLS (5 FORCE / 43 dormant)
> · Dalga-2 (destructive DB-koruması) kesiş SONRASI.
> Hedef: 185.149.103.48:35342 · Domain: db.visio360performance.com

═══════════════════════════════════════════════════════════════════════════════
## BÖLÜM 1 — T-1: KESİŞ ÖNCESİ HAZIRLIK (canlıya DOKUNMAZ, Supabase çalışmaya devam)
═══════════════════════════════════════════════════════════════════════════════
Bu bölümün TAMAMI Supabase canlıdayken yapılır. Hiçbir adım prod trafiğini etkilemez.

### 1.1 PG17 temiz kurulum
- [ ] PG15'i durdur/kaldır (veri prova → yedek gereksiz).
- [ ] PGDG deposundan PostgreSQL 17 kur.
- [ ] `initdb`: **UTF8**, Supabase ile uyumlu locale/collation.
- [ ] `postgresql.conf`: `listen_addresses`, `max_connections`, `port=35342`.
- ✅ **DUR-KONTROL:** `psql -c "select version();"` → 17.x. Yerelden bağlanılıyor.

### 1.2 DB + roller (SAHİPLİK KRİTİK)
- [ ] `create role visio360_app login password '<uzun-rastgele>' nosuperuser nobypassrls nocreatedb nocreaterole;`
- [ ] `create database visio360_prod owner visio360_app encoding 'UTF8';`
- ✅ **DUR-KONTROL:** `select rolsuper, rolbypassrls from pg_roles where rolname='visio360_app';`
      → **her ikisi de f (false).** (faz0-RLS ön-koşul denetiminin beklentisi.)

### 1.3 DNS + Let's Encrypt (SSL — SUNUCU tarafı ÖNCE)
- [ ] DNS: `db.visio360performance.com` A → 185.149.103.48. (propagasyonu bekle: `dig`.)
- [ ] certbot **DNS-01** ile cert (80 açmadan). fullchain.pem + privkey.pem.
- [ ] `postgresql.conf`: `ssl=on`, `ssl_cert_file=fullchain`, `ssl_key_file=privkey`
      (key: owner postgres, `chmod 600`).
- [ ] `pg_hba.conf`: `hostssl visio360_prod visio360_app 0.0.0.0/0 scram-sha-256`
      (yalnız SSL, yalnız bu DB+rol; düz `host` satırı YOK).
- [ ] certbot renew + **deploy-hook: `systemctl reload postgresql`** (90 günlük yenileme).
- ✅ **DUR-KONTROL:** dışarıdan `psql "host=db.visio360performance.com port=35342
      dbname=visio360_prod user=visio360_app sslmode=verify-full"` → bağlanıyor, cert
      DOĞRULANIYOR (verify-full geçiyor). Ham IP ile verify-full BAŞARISIZ olmalı (beklenen).
- ⚠️ **SIRA:** Sunucu cert burada oturur; istemci `rejectUnauthorized:true`'ya BÖLÜM 3'te geçilir.

### 1.4 Firewall + fail2ban
- [ ] Firewall: 35342 açık (Inspira modeli — IP-allowlist yok, Vercel dinamik egress).
      SSH portu kısıtlı. Gereksiz portlar kapalı.
- [ ] fail2ban: PG auth-fail + ssh jail.
- ✅ **DUR-KONTROL:** `nmap`/dışarıdan yalnız 35342 (+ssh) açık; başka port yok.

### 1.5 Şema/RLS/RPC dry-run (BOŞ DB'de, veri YOK)
> Amaç: SQL'ler restore edilmiş şema üzerinde HATASIZ mı? Boşta test et.
- [ ] Şema göçünü prova et (ör. `pg_dump --schema-only` Supabase 17.x → boş visio360_prod).
- [ ] `sql/faz0-rls-org-isolation.sql` çalıştır → NOTICE'ları oku:
      **5 AKTİF (FORCE) + 43 DORMANT** raporlanmalı; ownership WARNING ÇIKMAMALI.
- [ ] RPC/fonksiyonlar: `check_otp_rate_limit`, `check_otp_verify_rate_limit`
      (**SECURITY DEFINER**, sahibi visio360_app), ayrıca `snapshot_period_coefficients`,
      `backup_health`, `security_ops_health` — hepsi mevcut mu? `\df public.*`
- [ ] **SECURITY DEFINER hardening:** iki OTP fonksiyonuna `SET search_path = public, pg_temp`.
- [x] ✅ **YAPILDI (2026-08-17): dry-run tamamlandı, gerçek 68-tablo şemada doğrulandı.**
      - Şema reçetesi çalıştı → 68 tablo, 0 anlamlı hata.
      - faz0-RLS: 0 hata, 57 policy, **FORCE=4** (backup_runs/otp_codes/security_audit_logs/
        training_completions; `user_accessibility_preferences` CANLIDA YOK → 5 değil 4), ORPHAN=0.
      - 4 legacy period tablo auto-detect ile kapsandı (Seçenek 3).
      - FORCE enforcement smoke: visio360_app context-less→0, super→görür (DB katmanı kanıtlı).
      - prova düşürüldü, visio360_prod boş + public=pg_database_owner.
- ⚠️ NOT: FORCE listesi **4** (5 değil) — user_accessibility_preferences Supabase'de yok.

📌 **BÖLÜM 1 ÇIKIŞ KRİTERİ:** 1.1–1.5 hepsi ✅ TAMAM. Supabase hâlâ canlı, hiç dokunulmadı.

═══════════════════════════════════════════════════════════════════════════════
## BÖLÜM 2 — T0: KESİŞ ANI (kısa yazma-donması penceresi)
═══════════════════════════════════════════════════════════════════════════════
> Bu bölüm bir bakım penceresidir. Süre = dump+restore+doğrulama. Kullanıcıya duyur.

### 2.1 Supabase yazmayı durdur (tutarlı dump için)
- [ ] Uygulamayı **bakım moduna** al VEYA Supabase'i read-only'ye çek (yeni yazma yok).
      Amaç: dump anındaki satır sayısı sabitlensin, dump sırasında yazma kaçmasın.
- ✅ **DUR-KONTROL:** yeni yazma denemesi reddediliyor; okuma çalışıyor.

### 2.2 Taze dump (pg_dump 17.x — visio360_backup rolü, TÜM 68 tablo)
- [ ] `pg_dump` **17.x** (sunucuda mevcut), bağlantı `visio360_backup` (BYPASSRLS → tüm satırlar),
      `"$(cat /root/.supabase_url)"`.
- [ ] Kapsam: **`--schema=public --no-owner --no-privileges`**, **68 tablonun TAMAMI**
      (Seçenek 3 tam sadakat — `--exclude-table` YOK). Format: custom **`-Fc`** (paralel restore).
      (`--no-privileges` ŞART: Supabase'in anon/authenticated/service_role GRANT'ları hata verir.)
- ✅ **DUR-KONTROL:** `pg_restore -l dump.fc` → ~68 tablo + 18 fonksiyon + 1 view.

### 2.3 T0 ŞEMA-PREP REÇETESİ (restore'dan ÖNCE — dry-run'da DOĞRULANDI)
> Bunlar olmadan restore Supabase-özgü hatalarla dolar: 11× `extensions` şeması + 26× `anon`.
> visio360_prod'da **postgres** olarak (sunucuda çoğu zaten var — idempotent):
```sql
create schema if not exists extensions;
create extension if not exists "uuid-ossp" schema extensions;   -- 11× extensions.uuid_generate_v4 icin
grant usage on schema extensions to visio360_app;
grant execute on all functions in schema extensions to visio360_app;
do $$ declare r text; begin foreach r in array array['anon','authenticated','service_role'] loop
  if not exists(select 1 from pg_roles where rolname=r) then execute format('create role %I nologin',r); end if;
end loop; end $$;   -- policy'lerdeki TO <rol> stub'lari
```

### 2.4 Restore (SAHİPLİK kritik)
- [ ] `pg_restore --no-owner --no-privileges --role=visio360_app -d visio360_prod dump.fc`
      → tüm public nesneleri **visio360_app'e ait** (dormant-RLS ön-koşulu). public zaten
      pg_database_owner → visio360_app create edebilir.
- ✅ **DUR-KONTROL:** 68 tablo; `select tableowner from pg_tables where schemaname='public'
      and tableowner<>'visio360_app'` → **BOŞ**. (Dosya /root'taysa postgres erişemez → stdin `<`
      veya pg_restore'u root çalıştır.)

### 2.5 Temiz sayfa + otp_codes + faz0-RLS
- [ ] **otp_codes:** `select to_regclass('public.otp_codes')` → dry-run'da VAR (login şart). G kapsar.
- [ ] **CLEAN SLATE:** mevcut ~114 Supabase policy'sini düşür (yoksa bizimkilerle çakışır):
      `psql -tAc "select 'drop policy '||quote_ident(polname)||' on '||polrelid::regclass||';' from pg_policy" | psql`
- [ ] `psql -f sql/faz0-rls-org-isolation.sql`
- ✅ **DUR-KONTROL:** 0 hata, **57 policy**, **FORCE=4**, **ORPHAN=0** (Sınıf-dışı temizlik global
      havuzlara RLS kapatır). Öz-denetim (SQL Bölüm 5): forced-liste = 4.
- ✅ **DUR-KONTROL:** NOTICE = **5 FORCE + 43 DORMANT**; ownership WARNING yok;
      öz-denetim (Bölüm 5): forced-liste tam 5, politikasız-RLS tablo BOŞ.

### 2.6 RPC/fonksiyonları uygula (dump'ta yoksa)
- [ ] `check_otp_rate_limit`, `check_otp_verify_rate_limit` (+ diğerleri) mevcut mu?
      Dump getirdiyse tamam; getirmediyse ilgili sql dosyalarını çalıştır.
      SECURITY DEFINER + owner=visio360_app + `search_path` set.
- ✅ **DUR-KONTROL:** `select public.check_otp_rate_limit('probe@example.com');` context-less
      (düz psql) çalışıyor (dormant tablo → sahip-bypass → HATA YOK). Sonra probe satırını temizle.

### 2.7 Satır doğrulama (Supabase ile birebir)
- [ ] Her tablo için satır sayısı: yeni DB == Supabase (donmuş andaki). Örn.
      `select 'organizations', count(*) from organizations union all select 'users', count(*) from users ...`
      İki tarafın çıktısını KARŞILAŞTIR (beklenen sayılar Supabase'den okunur, sabit değil).
- [ ] Kritik spot-check: birkaç org'un users/periods/responses sayısı eşleşiyor mu?
- ✅ **DUR-KONTROL:** TÜM tablolarda satır sayıları eşit. Fark VARSA → **kesiş DURDUR**,
      Supabase'i yazmaya geri aç (henüz flip yapılmadı → risksiz), sebebi araştır.

📌 **BÖLÜM 2 ÇIKIŞ KRİTERİ:** veri+RLS+RPC yeni DB'de doğrulandı. Uygulama HÂLÂ Supabase'e
bakıyor (env flip yapılmadı). Buraya kadar her şey geri-alınabilir (Supabase'i aç, bitti).

═══════════════════════════════════════════════════════════════════════════════
## BÖLÜM 3 — T1: FLIP (uygulamayı yeni DB'ye çevir)
═══════════════════════════════════════════════════════════════════════════════

### 3.1 İstemci SSL'i sıkılaştır (SSL SIRASININ SON adımı)
- [ ] `src/lib/db.ts`: `ssl: { rejectUnauthorized: true }` (LE public köke zincirlenir,
      ek `ca` gerekmez). Host = **domain** (ham IP değil).
- [ ] `PG_DATABASE_URL=postgresql://visio360_app:***@db.visio360performance.com:35342/visio360_prod?sslmode=verify-full`
- ✅ **DUR-KONTROL:** kod değişikliği build ediliyor (lokal `next build` yeşil).

### 3.2 Env flip (Vercel)
- [ ] `PG_DATABASE_URL`'i Vercel prod env'e ekle (Production scope).
      Not: `isPgEnabled()` env'i **modül yükleme anında** okur → yeni deploy şart
      (mevcut instance'lar env değişimini görmez).
- [ ] **Redeploy** (yeni deployment = pg yolu aktif).
- ✅ **DUR-KONTROL:** deploy başarılı; `/api/health/db` (varsa) yeni DB'ye bağlanıyor,
      verify-full geçiyor.

### 3.3 🔴 SMOKE TEST (canlı, sırayla)
- [ ] **Login (OTP):** send-otp → mail geliyor → session verify → giriş. (otp_codes +
      rate-limit RPC + security_audit_logs yolu.)
- [ ] **Salt-okuma:** dashboard, coefficients, bir rapor (matrix) → veri geliyor, org-scope doğru.
- [ ] **Org-izolasyon:** org_admin(A) ile giriş → yalnız A'nın verisi. (Mümkünse 2. org ile çapraz dene.)
- [ ] **FORCE tabloları regresyon:** login sonrası rate-limit çalışıyor (dormant OTP tablolar OK);
      training webhook/audit yazımı hata vermiyor.
- [ ] **BİR destructive (DİKKATLİ):** tercihen düşük-riskli/geri-alınabilir bir işlem
      (ör. tek bir reopen), izole test datası üzerinde. Sonucu doğrula.
- ✅ **DUR-KONTROL:** tüm smoke ✅. Aksi halde → **BÖLÜM 4 rollback.**

### 3.4 İzle
- [ ] İlk 30–60 dk: hata oranı, DB bağlantı sayısı (max), latency, fail2ban logu.
- [ ] Supabase'i **hemen silme** — rollback penceresi için birkaç gün beklet (read-only bırak).

📌 **BÖLÜM 3 ÇIKIŞ KRİTERİ:** smoke tam ✅ + izleme temiz. Kesiş tamam.

═══════════════════════════════════════════════════════════════════════════════
## BÖLÜM 4 — ROLLBACK (her an, T1 sonrası)
═══════════════════════════════════════════════════════════════════════════════
> Env flip mekanizması geri-alımı BASİT ve HIZLI kılar.

**Nasıl (en hızlı):**
- [ ] **Vercel Instant Rollback:** flip ÖNCESİ deployment'a (PG_DATABASE_URL'siz) geri dön
      → saniyeler, **rebuild YOK**. Uygulama anında Supabase'e döner. (En temiz yol.)
- [ ] Alternatif: `PG_DATABASE_URL` env'i **sil** → redeploy. `isPgEnabled()=false` →
      `resolveBackend()` Supabase'e düşer. (Rebuild gerektirir → Instant Rollback daha hızlı.)
- ⚠️ Not: Env silmek TEK BAŞINA mevcut instance'ları döndürmez (env modül-yükleme'de
      okunuyor) → ya Instant Rollback ya redeploy şart.

**Ön koşul (rollback'in çalışması için):** Supabase kesiş penceresinde SİLİNMEMİŞ,
yazmaya geri açılabilir olmalı. T0'da read-only'ye alındı → rollback'te tekrar yazılır yap.
⚠️ T1 sonrası yeni DB'ye yazılan veriler Supabase'de YOK → rollback bu veriyi kaybeder.
Bu yüzden smoke penceresini kısa tut; kalıcı kabul öncesi ağır yazma trafiği bekletilebilir.

**Hangi durumda rollback? (kriterler):**
- Login/OTP çalışmıyor (kimse giremiyor).
- Org-izolasyon sızıntısı (A, B'nin verisini görüyor) — GÜVENLİK, anında rollback.
- Yaygın 5xx / DB bağlantı doygunluğu / verify-full TLS hatası.
- Destructive işlem yanlış/eksik veri yazıyor.
- Satır/veri tutarsızlığı fark edildi.
**Rollback DEĞİL (ileri düzelt):** tek bir raporun kozmetik hatası, FORCE'suz tabloda
küçük sapma → canlıda hotfix daha uygun.

═══════════════════════════════════════════════════════════════════════════════
## GENEL DUR-KONTROL ÖZETİ
═══════════════════════════════════════════════════════════════════════════════
1. Bölüm 1 bitmeden Bölüm 2'ye geçme (sunucu+SSL+RLS dry-run hazır olmadan dump alma).
2. Satır doğrulama (2.7) eşleşmeden FLIP (Bölüm 3) YAPMA.
3. SSL sırası: sunucu cert (1.3) → … → istemci verify-full (3.1). Ters SIRA = kırık bağlantı.
4. Smoke (3.3) tamamlanmadan Supabase'i read-only'den çıkarma/silme.
5. Rollback penceresi boyunca (birkaç gün) Supabase'i tutmadan kesişi "kalıcı" sayma.
