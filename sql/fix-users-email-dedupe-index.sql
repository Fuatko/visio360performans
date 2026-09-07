-- ============================================================================
-- users.email — gereksiz ÇİFT unique index temizliği (2026-09-07)
-- ============================================================================
-- HENÜZ UYGULANMADI — inceleme için hazırlandı. Elle çalıştırılacak.
--
-- SORUN: public.users.email üzerinde İKİ unique index var:
--   • users_email_key  → UNIQUE constraint (full btree: email)
--   • idx_users_email  → partial unique index (btree: email WHERE email IS NOT NULL)
-- İkisi de non-null email tekilliğini zorluyor → gereksiz çift. Her INSERT/UPDATE
-- iki index birden bakım görüyor; ihlalde PG hangisini raporlayacağı belirsizleşiyor
-- (app catch'i bu yüzden constraint-adı-bağımsız yapıldı: isEmailUniqueViolation).
--
-- KARAR: named UNIQUE constraint `users_email_key` KALIR; standalone partial index
-- `idx_users_email` DÜŞER. (İkisi de çoklu NULL'a izin verir → davranış birebir aynı;
-- constraint kalması daha standart. App artık hangisi kalırsa kalsın 409 döndürür.)

-- ── ÖN KONTROL: iki index de mevcut mu? (uygulamadan önce çalıştır) ─────────────
select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='users'
  and indexname in ('users_email_key','idx_users_email')
order by indexname;

-- ── UYGULA: users_email_key YERİNDEYSE idx_users_email'i düşür ──────────────────
-- Güvenlik: users_email_key (tek kalan tekillik kaynağı) yoksa DÜŞÜRME.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid='public.users'::regclass and conname='users_email_key' and contype='u'
  ) then
    drop index if exists public.idx_users_email;
    raise notice 'idx_users_email düşürüldü — users_email_key tekilliği koruyor.';
  else
    raise warning 'users_email_key UNIQUE constraint YOK → idx_users_email KORUNDU (tek tekillik kaynağı, düşürülmedi).';
  end if;
end $$;

-- ── DOĞRULAMA: yalnız users_email_key kalmalı ─────────────────────────────────
select indexname from pg_indexes
where schemaname='public' and tablename='users'
  and indexname in ('users_email_key','idx_users_email')
order by indexname;

-- ============================================================================
-- GERİ ALMA (rollback) — istenirse partial index'i geri oluştur:
--   create unique index idx_users_email on public.users using btree (email)
--     where (email is not null);
-- ============================================================================
