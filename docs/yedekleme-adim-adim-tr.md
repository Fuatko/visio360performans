# Yedekleme — basit kurulum (veritabanı bozulmaz)

## Sorun büyük mü?

**Hayır.** Veritabanınız bozuk değil. Sağlık taraması şunu söylüyor:

- «Henüz otomatik yedek çalışmamış» veya «Vercel’de BACKUP_* env yok»

`sql/backup-ops.sql` çalıştırdıysanız doğru adımı attınız: sadece **izleme tablosu** (`backup_runs`) ve `backup_health()` eklendi. **Veri silinmez / değişmez.**

---

## 3 katman (önerilen)

| Katman | Ne işe yarar | Siz ne yaparsınız |
|--------|----------------|------------------|
| 1. Supabase | Platform yedeği | Supabase Dashboard → Project → **Backups** (Pro plan) |
| 2. GitHub Actions | Şifreli `pg_dump` + S3/R2 | Aşağıdaki 5 adım |
| 3. Sağlık paneli | Son yedeği gösterir | İlk başarılı job’dan sonra yeşillenir |

---

## Adım 1 — SQL (siz yaptınız ✓)

Supabase SQL Editor’da bir kez:

- `sql/backup-ops.sql`
- `sql/backup-user.sql` (yedek kullanıcısı)
- `sql/backup-user-runs-grant.sql` (sağlık paneli için — GitHub job `backup_runs` yazar)

Kontrol:

```sql
select * from public.backup_health();
```

`latest_status` null ise henüz yedek job çalışmamış — normal.

---

## Adım 2 — Supabase bağlantı dizesi

GitHub’a koyacağınız **SUPABASE_DB_URL** (Session Pooler, IPv4 uyumlu):

1. Supabase → **Project Settings** → **Database**
2. **Connection string** → **URI** → **Session pooler**
3. Şifreyi yapıştırın (`[YOUR-PASSWORD]` yerine)

Örnek format (başında **`postgresql://` zorunlu** — sadece host veya kullanıcı yapıştırmayın):

```text
postgresql://visio360_backup.bwvvuyqaowbwlodxbbrl:ŞİFRE@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require
```

Pooler kullanıcı adı: `rol.proje_ref` (ör. `visio360_backup.bwvvuyqaowbwlodxbbrl`). Yalnızca `visio360_backup` → `no tenant identifier` hatası.

`sql/backup-user.sql` çalıştırdıysanız şifre o script’teki paroladır; ana `postgres` şifresi değil.

**Hata: `password authentication failed for user "visio360_backup"`** — Node/action sürümüyle ilgili değil. `backup-user.sql`’i tekrar çalıştırdıysanız veya secret’ı düzenlediyseniz GitHub **SUPABASE_DB_URL** güncel değildir. Script’teki parolayı URI’ye yazıp secret’ı kaydedin, workflow’u yeniden çalıştırın.

---

## Adım 3 — GitHub Secrets (repo: visio360performans)

GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

### Zorunlu (minimum yedek)

| Secret adı | Değer |
|------------|--------|
| `SUPABASE_DB_URL` | Adım 2’deki URI |
| `BACKUP_ENCRYPTION_PASSWORD` | Uzun rastgele parola (1Password vb. saklayın; kaybolursa yedek açılamaz) |

### Variables (Settings → Actions → **Variables**)

| Variable | Değer |
|----------|--------|
| `BACKUP_STORAGE_PROVIDER` | İlk test: `local` — S3/R2 yoksa yeterli |

### S3 veya Cloudflare R2 kullanacaksanız (ek)

| Secret | Açıklama |
|--------|----------|
| `BACKUP_S3_BUCKET` | Bucket adı |
| `BACKUP_S3_ENDPOINT` | R2: `https://<account>.r2.cloudflarestorage.com` |
| `AWS_ACCESS_KEY_ID` | R2/S3 key |
| `AWS_SECRET_ACCESS_KEY` | R2/S3 secret |

| Variable | Örnek |
|----------|--------|
| `BACKUP_STORAGE_PROVIDER` | `r2` veya `s3` |
| `BACKUP_S3_PREFIX` | `visio360/db` |
| `AWS_DEFAULT_REGION` | R2 için `auto` |

---

## Adım 4 — İlk yedeği al (veritabanına dokunmaz)

GitHub → **Actions** → **Supabase encrypted backup** → **Run workflow** → Run.

- Başarılı: `backup_runs` tablosuna `success` yazar.
- `local` modda: workflow **Artifacts** içinde `.enc` dosyası (7 gün).

Hata olursa: Actions log’unda `SUPABASE_DB_URL` / şifre / pooler hatasına bakın.

---

## Adım 5 — Sağlık panelini kontrol

Admin → yazılım sağlığı:

- **Son 24 saatte başarılı yedek** → Evet
- **Son başarılı yedek** → tarih görünür

Vercel’de `BACKUP_S3_*` olmasa da olur; yedek **GitHub’da** çalışır. Sistem Sağlığı panelinde «Vercel S3/R2» satırı **yeşil (opsiyonel)** görünür; uyarı değildir.

---

## Cron secret uyarısı (Vercel)

Vercel’de günlük hatırlatma cron’u (`vercel.json`) **x-vercel-cron** ile çalışır; `CRON_SECRET` zorunlu değil.

İsterseniz ek güvenlik için Vercel Production env:

- `CRON_SECRET` = rastgele uzun string

---

## Sık sorular

**Canlı DB’ye restore yapılır mı bu script ile?**  
Hayır. `backup-supabase.sh` sadece **okur** (pg_dump). Restore ayrı script ve **staging** projede test edilir.

**Yedek nerede durur?**  
- `local` → GitHub artifact  
- `r2` / `s3` → bucket’ta `visio360/db/…dump.enc`

**Günlük otomatik?**  
Workflow zaten her gün **02:15 UTC** çalışacak şekilde ayarlı (secret’lar tanımlı olunca).

---

## Hızlı kontrol SQL

```sql
select status, started_at, finished_at, storage_path, error_message
from public.backup_runs
order by started_at desc
limit 5;
```

`status = success` görürseniz yedekleme çalışıyor demektir.
