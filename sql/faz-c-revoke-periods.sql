-- =====================================================================
-- FAZ C — evaluation_periods anon/authenticated erişimini kapat
-- =====================================================================
-- evaluation_periods client'taki TÜM erişimi (select + insert/update/delete)
-- /api/admin/periods server route'una (service-role) taşındı:
--   - C2b-1: GET (dönem listesi, org-scoped)
--   - C2b-2: periods sayfası select→GET, POST/DELETE anon fallback kaldırıldı (route tek yol)
--   - C2b-3: questions sayfası dönem select'i → GET (org-scoped, ?status=active)
-- Diğer okumalar (period-questions / period-duty-questions / results / evaluation /
-- compensation ...) evaluation_periods'ı zaten SERVICE-ROLE ile çekiyor → REVOKE'tan ETKİLENMEZ.
--
-- DİKKAT: questions göçü (Adım 3) ve kurum-ayrımı bu commit'in KAPSAMI DIŞINDA.
-- questions / question_categories / questions_answers / main_categories'e DOKUNULMAZ.
--
-- otp_codes / organizations / users / coefficients deseni (A5/B6/C1c):
--   1) anon + authenticated'tan GRANT REVOKE  (asıl koruma → 401)
--   2) RLS enable
--   3) RESTRICTIVE deny-all policy (yoksa oluştur) — savunma derinliği
--      (RESTRICTIVE; eski "Public access" USING(true) permissive policy varsa
--       onu AND ile ezip gerçek deny sağlar. Mevcut policy DROP EDİLMEZ.)
--
-- GÜVENLİ / IDEMPOTENT: DROP yok, DELETE yok, veri değişmez. Tekrar çalıştırılabilir.
-- Kırılırsa: sql/faz-c-rollback-periods.sql ile saniyede geri dön.

do $$
declare
  tbl text := 'evaluation_periods';
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  if to_regclass('public.' || tbl) is null then
    raise notice 'ATLANDI (tablo yok): %', tbl;
    return;
  end if;

  -- 1) GRANT revoke (asıl koruma)
  if has_anon then execute format('revoke all on public.%I from anon', tbl); end if;
  if has_auth then execute format('revoke all on public.%I from authenticated', tbl); end if;

  -- 2) RLS enable (zaten açıksa no-op)
  execute format('alter table public.%I enable row level security', tbl);

  -- 3) RESTRICTIVE deny-all — yoksa oluştur (DROP kullanmadan idempotent)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = tbl and policyname = 'faz_c_deny_all'
  ) then
    execute format(
      'create policy faz_c_deny_all on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      tbl
    );
  end if;

  raise notice 'KİLİTLENDİ: %', tbl;
end $$;

-- Not: service_role (BYPASSRLS) ve postgres bu policy'den etkilenmez → sunucu
-- route'ları (periods / period-questions / results / evaluation ...) çalışmaya devam eder.
