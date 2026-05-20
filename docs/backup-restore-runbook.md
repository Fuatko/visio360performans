# Backup ve Restore Runbook

Bu doküman canlı veriyi korumak için şifreli backup alma, backup durumunu izleme ve staging ortamına restore testini tarif eder.

## Ön Koşullar

Supabase SQL Editor'da çalıştırılacak dosya:

- `sql/backup-ops.sql`
- Opsiyonel ayrı backup kullanıcısı için: `sql/backup-user.sql`

Gerekli secret/env değerleri:

- `SUPABASE_DB_URL`: Supabase PostgreSQL connection string. IPv4 kısıtı varsa Session Pooler URI kullanılmalı.
- `BACKUP_ENCRYPTION_PASSWORD`: Backup şifreleme parolası. Güçlü ve ayrı saklanmalı.
- `BACKUP_SCHEMAS`: Varsayılan `public`. Uygulama tablolarını dump eder. Tam DB için boş bırakılabilir ama bunun için daha yüksek yetkili DB kullanıcısı gerekir.
- `BACKUP_STORAGE_PROVIDER`: `local`, `s3` veya `r2`.
- `BACKUP_S3_BUCKET`: S3/R2 bucket adı.
- `BACKUP_S3_PREFIX`: Örn. `visio360/db`.
- `BACKUP_S3_ENDPOINT`: Cloudflare R2 gibi S3 uyumlu endpoint kullanılıyorsa.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`.

## Backup Alma

Lokal veya CI ortamında:

```bash
SUPABASE_DB_URL="postgresql://..." \
BACKUP_ENCRYPTION_PASSWORD="..." \
BACKUP_STORAGE_PROVIDER="local" \
bash scripts/backup-supabase.sh
```

R2/S3 yükleme:

```bash
SUPABASE_DB_URL="postgresql://..." \
BACKUP_ENCRYPTION_PASSWORD="..." \
BACKUP_STORAGE_PROVIDER="r2" \
BACKUP_S3_BUCKET="..." \
BACKUP_S3_PREFIX="visio360/db" \
BACKUP_S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com" \
AWS_ACCESS_KEY_ID="..." \
AWS_SECRET_ACCESS_KEY="..." \
AWS_DEFAULT_REGION="auto" \
bash scripts/backup-supabase.sh
```

Backup başarılı olursa `backup_runs` tablosuna `success` kaydı yazılır. Dosya uzantısı `.dump.enc` olur ve yanında `.sha256` checksum dosyası üretilir.

## GitHub Actions

Workflow:

- `.github/workflows/supabase-backup.yml`

Varsayılan çalışma:

- Her gün UTC `02:15`
- Manuel `workflow_dispatch`

GitHub secrets:

- `SUPABASE_DB_URL`
- `BACKUP_ENCRYPTION_PASSWORD`
- `BACKUP_S3_BUCKET`
- `BACKUP_S3_ENDPOINT`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

GitHub variables:

- `BACKUP_STORAGE_PROVIDER`: `r2`, `s3` veya `local`
- `BACKUP_SCHEMAS`: Varsayılan `public`
- `BACKUP_S3_PREFIX`
- `AWS_DEFAULT_REGION`

### Ayrı Backup Kullanıcısı

Ana `postgres` database şifresi bilinmiyorsa veya resetlemek istenmiyorsa ayrı bir backup kullanıcısı oluşturulabilir:

1. `sql/backup-user.sql` dosyasında `CHANGE_THIS_LONG_RANDOM_PASSWORD` değerini güçlü bir parola ile değiştirin.
2. SQL'i Supabase SQL Editor'da çalıştırın.
3. GitHub secret `SUPABASE_DB_URL` değerini Session Pooler ile şu formatta güncelleyin:

```text
postgresql://visio360_backup:<PASSWORD>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require
```

Bu kullanıcı uygulama satırlarını değiştirmez; sadece `public` şemasındaki tabloları yedeklemek için okunur yetki alır. Supabase'in kendi scheduled backup'ı tam platform backup'ı olarak ayrıca açık kalmalıdır.

## Backup Health Kontrolü

Super admin API:

```text
GET /api/admin/security-health
```

Döner:

- Gerekli env değerlerinin varlığı
- Son başarılı backup zamanı
- Son backup durumu
- Kritik tablolar için RLS durumu

## Restore Testi

Restore her zaman önce staging/geçici Supabase projesinde test edilmelidir. Canlı DB'ye doğrudan restore yapılmaz.

```bash
RESTORE_DB_URL="postgresql://staging..." \
BACKUP_ENCRYPTION_PASSWORD="..." \
bash scripts/restore-supabase.sh backups/visio360_full_YYYYMMDDTHHMMSSZ.dump.enc
```

Restore sonrası doğrulama:

```sql
select count(*) from public.users;
select count(*) from public.evaluation_periods;
select count(*) from public.evaluation_assignments;
select count(*) from public.evaluation_responses;
select count(*) from public.organizations;
```

Smoke test:

- Login/OTP çalışıyor mu?
- Admin dönemler ekranı açılıyor mu?
- Sonuçlar raporu çalışıyor mu?
- Bir test kullanıcının değerlendirme formu açılıyor mu?

Restore başarılıysa `backup_runs` tablosuna manuel olarak test sonucu eklenebilir:

```sql
insert into public.backup_runs(status, backup_kind, storage_provider, encrypted, meta, finished_at)
values (
  'restore_test_success',
  'restore_test',
  'staging',
  true,
  jsonb_build_object('note', 'Monthly restore test completed'),
  now()
);
```

## Rutin

- Günlük otomatik backup.
- Ayda bir staging restore testi.
- 3 ayda bir RLS/security audit.
- Kritik migration öncesi manuel backup.
- `BACKUP_ENCRYPTION_PASSWORD` güvenli kasada saklanmalı; kaybolursa backup geri açılamaz.
