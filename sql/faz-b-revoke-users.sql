-- =====================================================================
-- FAZ B — users tablosunun anon/authenticated erişimini kapat
-- =====================================================================
-- Client'ın users'a TÜM erişimi (direkt .from + update/delete) B3–B4 ile
-- server route'a taşındı; B5'te embed/dinamik/rpc dahil hiçbir gizli anon
-- yolu kalmadığı doğrulandı. Login (send-otp + /api/session) users'ı
-- SERVICE-ROLE ile okuyor → REVOKE'tan ETKİLENMEZ.
--
-- otp_codes / organizations deseni:
--   1) anon + authenticated'tan GRANT REVOKE  (asıl koruma → 401)
--   2) RLS enable
--   3) RESTRICTIVE deny-all policy (yoksa oluştur) — savunma derinliği
--      (RESTRICTIVE; çünkü users'ta eski "Public access" USING(true) permissive
--       policy'si var — RESTRICTIVE onu AND ile ezip gerçek deny sağlar.
--       Mevcut policy DROP EDİLMEZ; grant revoke sonrası zaten erişilemez.)
--
-- GÜVENLİ / IDEMPOTENT: DROP yok, DELETE yok, veri değişmez. Tekrar çalıştırılabilir.
-- Kırılırsa: sql/faz-b-rollback-users.sql ile saniyede geri dön.

do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  if to_regclass('public.users') is null then
    raise notice 'ATLANDI (tablo yok): users';
    return;
  end if;

  -- 1) GRANT revoke (asıl koruma)
  if has_anon then revoke all on public.users from anon; end if;
  if has_auth then revoke all on public.users from authenticated; end if;

  -- 2) RLS enable (zaten açıksa no-op)
  alter table public.users enable row level security;

  -- 3) RESTRICTIVE deny-all — yoksa oluştur (DROP kullanmadan idempotent)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'faz_b_deny_all'
  ) then
    create policy faz_b_deny_all on public.users
      as restrictive for all to anon, authenticated
      using (false) with check (false);
  end if;

  raise notice 'KİLİTLENDİ: users';
end $$;

-- Not: service_role (BYPASSRLS) ve postgres bu policy'den etkilenmez → sunucu route'ları
-- ve login (send-otp/session) çalışmaya devam eder.
