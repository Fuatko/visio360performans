# Değerlendirme yeniden açma — yedekleme prosedürü

Bu doküman, bir değerlendiricinin tamamladığı formu **silip yeniden açmadan önce** alınması gereken yedekleri tanımlar.

> **Kural:** Canlıda `evaluation_responses` silinmeden önce **mutlaka yedek alın**. Gece otomatik yedeği tek başına yeterli değildir — silme işleminden **sonra** alınan gece yedeğinde eski cevaplar artık yoktur.

---

## Yedek türleri (üç katman)

| Katman | Ne korur | Ne zaman |
|--------|----------|----------|
| **A — Atama anlık yedeği** | Tek çift + bağlam (genel/kulüp/…) yanıtları | **Her yeniden açmadan hemen önce** (zorunlu) |
| **B — GitHub Actions tam yedek** | Tüm `public` şema (pg_dump, şifreli) | Her gece 02:15 UTC + kritik işlem öncesi manuel |
| **C — Supabase platform yedeği** | Supabase panelindeki proje yedeği | Ayrı olarak açık tutulmalı |

**A** hızlı geri dönüş içindir (tek kişi). **B/C** felaket kurtarma içindir.

---

## Standart akış (önerilen)

### 1) Durumu kontrol et

Supabase SQL Editor veya:

```bash
# .env.visio360.tmp yüklü ortamda
node scripts/reopen-evaluation-assignment.mjs \
  --evaluator "Ender ÜSTÜNGEL" \
  --target "Baran YILDIZ" \
  --context kulup_ogretmeni \
  --dry-run
```

SQL şablonu: `sql/diagnose-assignment-before-reopen.sql`

### 2) Atama yedeği al (zorunlu)

```bash
node scripts/backup-assignment-before-reopen.mjs \
  --evaluator "Ender ÜSTÜNGEL" \
  --target "Baran YILDIZ" \
  --context kulup_ogretmeni
```

veya atama UUID biliniyorsa:

```bash
node scripts/backup-assignment-before-reopen.mjs --assignment-id <uuid>
```

Çıktı: `backups/assignments/<timestamp>_<degerlendiren>_<hedef>_<context>.json`

Bu dosyayı **güvenli bir yere kopyalayın** (şifreli disk, kurumsal depolama). Repo'ya commit etmeyin.

### 3) (Önerilen) Tam DB yedeği — çok sayıda yenileme / kritik dönem

GitHub → **Actions** → **Supabase encrypted backup** → **Run workflow**

veya lokal:

```bash
SUPABASE_DB_URL="postgresql://..." \
BACKUP_ENCRYPTION_PASSWORD="..." \
BACKUP_STORAGE_PROVIDER="local" \
bash scripts/backup-supabase.sh
```

Durum kontrolü: `sql/backup-kontrol.sql` veya Admin → güvenlik sağlığı API.

### 4) Yeniden aç

Script otomatik yedek alır, sonra açar:

```bash
node scripts/reopen-evaluation-assignment.mjs \
  --evaluator "Ender ÜSTÜNGEL" \
  --target "Baran YILDIZ" \
  --context kulup_ogretmeni
```

Yedek zaten alındıysa:

```bash
node scripts/reopen-evaluation-assignment.mjs \
  --assignment-id <uuid> \
  --backup-file backups/assignments/....json
```

**Yapılanlar:** `evaluation_responses` silinir, `international_standard_scores` silinir, atama `pending` + `completed_at = null`. Matris satırı **silinmez**.

### 5) Doğrula

Değerlendirici dashboard'da satır **Bekliyor** görünmeli; yanıt sayısı 0.

---

## Geri yükleme (tek atama)

Yanlışlıkla silindi veya eski cevaplar geri gelsin isteniyorsa:

```bash
node scripts/restore-assignment-from-backup.mjs backups/assignments/<dosya>.json
```

Önce deneme:

```bash
node scripts/restore-assignment-from-backup.mjs backups/assignments/<dosya>.json --dry-run
```

Bu işlem yedekteki yanıtları ve atama `status` / `completed_at` değerlerini geri yazar.

---

## Tam DB restore (felaket / staging)

Canlıya **doğrudan** tam restore yapılmaz. Önce staging projesinde test:

```bash
RESTORE_DB_URL="postgresql://staging..." \
BACKUP_ENCRYPTION_PASSWORD="..." \
bash scripts/restore-supabase.sh backups/visio360_full_YYYYMMDD.dump.enc
```

Ayrıntı: [backup-restore-runbook.md](./backup-restore-runbook.md)

---

## `matrix_context` değerleri (örnek)

| Etiket | `matrix_context` |
|--------|------------------|
| Genel Değerlendirme | `genel` |
| Kulüp Öğretmeni | `kulup_ogretmeni` |
| Nöbetçi Öğretmen | `nobetci_ogretmeni` |
| Sınıf Öğretmeni | `sinif_ogretmeni` |
| Zümre | `zumre` |
| Rehberlik Öğretmeni | `rehberlik_ogretmeni` |

---

## Checklist (kopyala-yapıştır)

```
[ ] Atama doğrulandı (değerlendiren, hedef, bağlam, dönem)
[ ] backup-assignment-before-reopen.mjs çalıştırıldı
[ ] JSON yedek güvenli depoya kopyalandı
[ ] (Önerilen) GitHub Actions tam yedek veya manuel pg_dump
[ ] reopen-evaluation-assignment.mjs çalıştırıldı
[ ] Dashboard'da pending + 0 yanıt doğrulandı
[ ] sql/fix-reopen-*.sql runbook dosyası repo'ya eklendi (isteğe bağlı)
```

---

## Sık sorulan sorular

**Deploy veya GitHub gerekir mi?**  
Hayır. Yeniden açma ve yedekleme **yalnızca Supabase** üzerinde çalışır.

**Gece yedeği yetmez mi?**  
Silme, son gece yedeğinden **sonra** yapıldıysa o cevaplar yedekte yoktur. Bu yüzden adım 2 zorunludur.

**Yedek dosyaları repoda mı?**  
Hayır. `backups/assignments/` `.gitignore` içindedir; KVKK nedeniyle commit edilmez.

**Eski SQL dosyaları (`fix-reopen-ender-*.sql`)?**  
Dokümantasyon amaçlı kalabilir; yeni işlemlerde script kullanın.
