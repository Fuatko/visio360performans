-- =====================================================================
-- FAZ B — organizations tablosunun anon/authenticated erişimini kapat
-- =====================================================================
-- Client'ın organizations'a TÜM erişimi (direkt .from + PostgREST embed)
-- A1–A4-fix ile server route'a taşındı ve doğrulandı. Artık organizations'a
-- yalnızca sunucu (service-role) erişiyor → service-role RLS'i baypas eder,
-- uygulama ETKİLENMEZ.
--
-- Faz A / otp_codes deseni:
--   1) anon + authenticated'tan GRANT REVOKE  (asıl koruma → 401)
--   2) RLS enable
--   3) RESTRICTIVE deny-all policy (yoksa oluştur) — savunma derinliği
--      (RESTRICTIVE; çünkü organizations'ta eski "Public access" USING(true)
--       permissive policy'si var — RESTRICTIVE onu AND ile ezip gerçek deny sağlar.
--       Mevcut policy DROP EDİLMEZ; grant revoke sonrası zaten erişilemez.)
--
-- GÜVENLİ / IDEMPOTENT: DROP yok, DELETE yok, veri değişmez. Tekrar çalıştırılabilir.
-- Kırılırsa: sql/faz-b-rollback-organizations.sql ile saniyede geri dön.

do $$
declare
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  if to_regclass('public.organizations') is null then
    raise notice 'ATLANDI (tablo yok): organizations';
    return;
  end if;

  -- 1) GRANT revoke (asıl koruma)
  if has_anon then revoke all on public.organizations from anon; end if;
  if has_auth then revoke all on public.organizations from authenticated; end if;

  -- 2) RLS enable (zaten açıksa no-op)
  alter table public.organizations enable row level security;

  -- 3) RESTRICTIVE deny-all — yoksa oluştur (DROP kullanmadan idempotent)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'organizations' and policyname = 'faz_b_deny_all'
  ) then
    create policy faz_b_deny_all on public.organizations
      as restrictive for all to anon, authenticated
      using (false) with check (false);
  end if;

  raise notice 'KİLİTLENDİ: organizations';
end $$;

-- Not: service_role (BYPASSRLS) ve postgres bu policy'den etkilenmez → sunucu route'ları çalışmaya devam eder.
