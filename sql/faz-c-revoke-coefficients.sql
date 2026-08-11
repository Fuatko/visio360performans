-- =====================================================================
-- FAZ C — coefficients'e özel 5 config tablosunun anon/authenticated erişimini kapat
-- =====================================================================
-- Bu 5 tablonun client'taki TÜM erişimi (16 anon .from) C1b ile
-- /api/admin/coefficients server route'una (service-role) taşındı.
-- Diğer tüm okumalar (results / evaluation / compensation / evaluator-answer-detail)
-- zaten SERVICE-ROLE ile yapılıyor → REVOKE'tan ETKİLENMEZ.
-- results sayfalarındaki eski client hesaplaması yorum bloğunda (ölü kod).
--
-- DİKKAT: question_categories BU LİSTEDE YOK — questions ile paylaşımlı,
-- Faz C Adım 3'te (questions göçü sonrası) kilitlenecek.
--
-- otp_codes / organizations / users deseni (A5/B6):
--   1) anon + authenticated'tan GRANT REVOKE  (asıl koruma → 401)
--   2) RLS enable
--   3) RESTRICTIVE deny-all policy (yoksa oluştur) — savunma derinliği
--      (RESTRICTIVE; eski "Public access" USING(true) permissive policy varsa
--       onu AND ile ezip gerçek deny sağlar. Mevcut policy DROP EDİLMEZ.)
--
-- GÜVENLİ / IDEMPOTENT: DROP yok, DELETE yok, veri değişmez. Tekrar çalıştırılabilir.
-- Kırılırsa: sql/faz-c-rollback-coefficients.sql ile saniyede geri dön.

do $$
declare
  tbl text;
  tbls text[] := array[
    'evaluator_weights',
    'category_weights',
    'confidence_settings',
    'deviation_settings',
    'international_standards'
  ];
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  foreach tbl in array tbls loop
    if to_regclass('public.' || tbl) is null then
      raise notice 'ATLANDI (tablo yok): %', tbl;
      continue;
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
  end loop;
end $$;

-- Not: service_role (BYPASSRLS) ve postgres bu policy'den etkilenmez → sunucu
-- route'ları (coefficients / results / evaluation / compensation) çalışmaya devam eder.
