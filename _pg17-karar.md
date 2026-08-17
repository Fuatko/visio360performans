# PG17 Kararı — dump/restore sürüm uyumu + temiz kurulum planı (ANALİZ, uygula YOK)

> Kaynak: Supabase **PG 17.6**. Hedef sunucu şu an **PG 15.14** (185.149.103.48).
> Hedefteki veri "prova"ydı → silmek kayıp değil.

## 1. GERÇEKTEN PG17 GEREKLİ Mİ? — EVET (17.6 → 15 restore desteklenmiyor)

PostgreSQL'in resmi kuralları, iki yönden de aynı sonuca çıkıyor:

**a) pg_dump yön kuralı.** pg_dump, KENDİ majör sürümünden **yeni** bir sunucudan
dump ALAMAZ (denemeden abort eder). Yani Supabase 17.6'yı dökmek için **pg_dump 17.x
şart**. Ürettiği dump, "kendi sürümü ve DAHA YENİ" sunuculara yüklenmek üzere tasarlıdır.
15 (daha eski) hedefe yükleme **desteklenen yön değildir**.

**b) Arşiv format sürümü.** custom (`-Fc`) / directory (`-Fd`) dump'ı 17'nin pg_dump'ı
üretir; arşivin bir format-sürüm damgası vardır. PG15'in `pg_restore`'u 17 arşivini
**okuyamaz** → `unsupported version in file header` ile sert hata. (pg_restore ancak
kendi sürümü ve daha eskisini okur.)

**c) Düz SQL (`-Fp`) hedefe psql ile.** Kısmen çalışır ama 17'ye özgü öğelerde patlar:
- Preamble'daki `SET transaction_timeout = 0;` → PG17 YENİ GUC → PG15'te
  `unrecognized configuration parameter` hatası.
- Builtin locale provider / `BUILTIN` collation (PG17 yeni), bazı `GRANT ... MAINTAIN`
  (PG17 yeni ayrıcalık) → PG15 tanımaz.
- Elle düzenlenebilir ama gerçek bir kesişte KIRILGAN ve hataya açık.

**Dürüst değerlendirme:** Majör sürüm DÜŞÜRME (17→15) pg_dump ile resmen desteklenmez.
15'te kalıp 17.6 dump'ı restore etmeye çalışmak = kırılgan, elle yama gerektiren,
kesiş gecesi sürpriz üreten yol. **Hedefi 17'ye almak temiz ve tek güvenli seçenek.**
(Minör önemsiz: 17.x hedefi, 17.6 dump'ını sorunsuz yükler.)

## 2. PG17 KURULUM PLANI — TEMİZ KURULUM (in-place upgrade DEĞİL)

Sunucu boş/prova olduğundan `pg_upgrade` (mevcut veriyi koruma aracı) gereksiz.
**Temiz PG17 kurulumu en basiti:**

1. PG15'i durdur/kaldır (veya 17'yi kurup portu 17'ye devret). Veri prova → yedek şart değil.
2. PGDG deposundan **PostgreSQL 17** kur (Debian/Ubuntu varsayımı: `apt` PGDG repo).
3. `initdb`: encoding **UTF8**, locale Supabase ile uyumlu. (Collation-provider farkı
   restore'da uyarı üretebilir → kaynak collation'ı ile eşle; en güveni ICU yerine
   Supabase'in kullandığıyla aynı provider.)
4. `visio360_prod` DB'yi oluştur (aynı encoding/locale).
5. Rolleri ÖNCE oluştur (aşağıda), dump'ı **`--no-owner --role=visio360_app`** ile
   restore et → böylece **public tabloların SAHİBİ visio360_app olur**
   (Seçenek C'nin "dormant = sahip bypass" varsayımının ön-koşulu — kritik).
6. Dump kapsamı: yalnız uygulama şeması (`--schema=public` + gereken veriler);
   Supabase-içi şemaları (auth/storage/…) ALMA → 17'ye özgü sistem-nesnesi yükünü
   ve gereksiz bağımlılığı azaltır.
7. Restore SONRASI: `sql/faz0-rls-org-isolation.sql` çalıştır (7 FORCE / 41 dormant).

**visio360_prod + visio360_app + firewall yeniden kurulacak mı?** — Evet, sunucu
sıfırlandığı için hepsi yeniden. Aşağıdaki checklist mevcut sertleştirmeyi birebir taşır.

## 3. GÜVENLİK AYARLARI — PG17'de BİREBİR (yeniden kurulum checklist)

| Öğe | Hedef (mevcut sertleştirme korunur) | Not / ⚠️ |
|---|---|---|
| Rol `visio360_app` | LOGIN, **NOSUPERUSER, NOBYPASSRLS**, NOCREATEDB, NOCREATEROLE, güçlü parola | RLS ön-koşul denetimi bunu zorunlu kılıyor |
| Tablo sahipliği | public tabloları **visio360_app'e ait** | dormant-RLS bunun üstüne kurulu; restore `--role` ile sağla |
| `postgres` superuser | yalnız yerel/bastion, uzaktan kapalı | — |
| pg_hba.conf | `hostssl`, `scram-sha-256`, DB/rol bazlı kısıt | md5 değil scram |
| SSL/TLS | `ssl=on`, sertifika+anahtar | Şu an snakeoil self-signed + `rejectUnauthorized:false`. **Prod'a geçmeden Let's Encrypt (doğrulanabilir cert) + `rejectUnauthorized:true`** (db.ts'de not düşülmüş) |
| Firewall | Port **35342** yalnız izinli IP'lere | ⚠️ **Vercel Fluid Compute egress IP'leri statik DEĞİL** → IP allowlist app'i dışarıda bırakır. Çözüm gerekir: Vercel dedicated/static egress, bastion/proxy ya da tünel. **Kesiş öncesi netleştir.** |
| fail2ban | PG auth-fail + ssh jail yeniden | — |
| Dinleme | `listen_addresses` yalnız gerekli arayüz | 0.0.0.0 açıp firewall'a güvenmek yerine mümkünse dar |

## 4. ÖNERİ (özet)

- **PG17'ye geç** (15'te kalma) — 17.6→15 restore desteklenmiyor, kırılgan.
- **Temiz PG17 kurulumu** (boş sunucu → pg_upgrade gereksiz).
- Restore'u **visio360_app sahipliğiyle** yap (dormant-RLS ön-koşulu).
- Kesişten önce çözülecek **iki açık nokta:** (1) Vercel→DB firewall/egress yolu,
  (2) SSL doğrulanabilir cert + `rejectUnauthorized:true`.

Onaylarsan: PGDG repo + initdb + rol/DB + firewall/SSL adımlarını sırayla kurarız
(komutları çalıştırmadan önce her adımı göstererek).
