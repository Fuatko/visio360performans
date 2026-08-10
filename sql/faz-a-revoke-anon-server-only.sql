-- =====================================================================
-- FAZ A — Server-only tabloların anon/authenticated erişimini kapat
-- =====================================================================
-- Bu tablolar UYGULAMADA yalnızca sunucu (service-role) tarafından kullanılıyor;
-- client (tarayıcı, anon key) hiçbiri için sorgu ATMIYOR (kod taramasıyla doğrulandı).
-- service-role RLS'i baypas ettiği için uygulama ETKİLENMEZ — sıfır kırılma beklenir.
--
-- GÜVENLİ / EKLEMELİ / IDEMPOTENT: DROP yok, DELETE yok, veri değişmez.
--   1) anon + authenticated rollerinden GRANT'ları REVOKE et  (asıl koruma → 401)
--   2) RLS enable
--   3) RESTRICTIVE deny-all policy (yoksa oluştur) — savunma derinliği
--      (RESTRICTIVE kullanıyoruz; aksi halde tablodaki eski "USING(true)" permissive
--       policy'ler OR ile deny'i ezerdi. RESTRICTIVE AND'lenir → gerçek deny.
--       Not: mevcut policy'ler DROP EDİLMEZ; grant revoke sonrası zaten erişilemez olurlar.)
--
-- users / organizations / evaluation_periods / questions / question_answers /
-- question_categories / main_categories / category_weights / evaluator_weights /
-- answers / confidence_settings / deviation_settings / international_standards
-- BU DOSYADA YOK — onlar client'tan kullanılıyor, Faz B'de ayrıca ele alınacak.

do $$
declare
  t text;
  faz_a_tables text[] := array[
    -- --- Senin listendeki 12 tablo ---
    'user_sessions',
    'login_attempts',
    'calculated_scores',
    'weighted_results',
    'departments',
    'company_data',
    'performance_trends',
    'benchmark_data',
    'training_assignments',
    'integration_logs',
    'surveys',
    'action_plans',
    -- --- Analizde bulunan EK server-only RLS-kapalı tablolar ---
    -- (client-anon haritasında YOK → güvenli. İstemezsen bu 5'i çıkarabilirsin.)
    'categories',
    'evaluation_forms',
    'period_categories',
    'position_category_weights',
    'system_logs'
  ];
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  foreach t in array faz_a_tables loop
    -- Tablo yoksa atla (idempotent / güvenli)
    if to_regclass('public.' || t) is null then
      raise notice 'ATLANDI (tablo yok): %', t;
      continue;
    end if;

    -- 1) GRANT revoke (asıl koruma). Rol yoksa atla (taşınabilirlik için).
    if has_anon then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if has_auth then
      execute format('revoke all on public.%I from authenticated', t);
    end if;

    -- 2) RLS enable (zaten açıksa no-op)
    execute format('alter table public.%I enable row level security', t);

    -- 3) RESTRICTIVE deny-all policy — yoksa oluştur (DROP kullanmadan idempotent)
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'faz_a_deny_all'
    ) then
      execute format(
        'create policy faz_a_deny_all on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
        t
      );
    end if;

    raise notice 'KİLİTLENDİ: %', t;
  end loop;
end $$;

-- Not: service_role (BYPASSRLS) ve postgres bu policy'lerden etkilenmez;
-- uygulamanın sunucu route'ları service-role kullandığı için normal çalışmaya devam eder.
