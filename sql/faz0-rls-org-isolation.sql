-- ============================================================================
-- FAZ 0 — RLS ORG İZOLASYONU — SEÇENEK C (KADEMELİ FORCE) — FİNAL TASLAK
-- HENÜZ UYGULANMADI. PG17 kurulup visio360_prod restore edilince çalıştırılacak.
-- ============================================================================
-- Amaç: cross-org sızıntıyı YAPISAL engellemek. Uygulama "WHERE organization_id"
-- yazmayı unutsa bile DB'nin filtrelemesi.
--
-- ── SEÇENEK C KARARI (onaylandı) ────────────────────────────────────────────
-- Havuz TEK rol: visio360_app (NOSUPERUSER, NOBYPASSRLS, tabloların SAHİBİ).
-- İki DB yolu, ikisi de bu role bağlanır:
--   • withActor()  → begin; SET LOCAL app.current_role/org/user_id → RLS bağlamı DOLU
--   • pgRead/pgReadOne/query()/pgRes/pgUpsert/pgInsertMany → düz pool.query, tx YOK
--                    → RLS bağlamı AYARSIZ (current_setting = NULL)
--
-- İKİ YAPISAL GERÇEK, birlikte Seçenek C'yi tanımlar:
--   (1) KARADELİK: FORCE'lu tabloyu context-less okursan politika = FALSE → 0 satır.
--       => Bir tabloda tek bir context-less OKUMA bile varsa FORCE AÇILAMAZ.
--   (2) SAHİP BYPASS: visio360_app tabloların sahibi. RLS "enable ama FORCE değil"
--       ise SAHİP politikadan MUAF → hem pgRead hem withActor RLS'i by-pass eder
--       (dormant). Politika ancak FORCE ile "sahibe de" uygulanır.
--
-- SONUÇ (bu dosyanın yaptığı):
--   • FORCE-UYGUN 7 tablo (context-less erişimi OLMAYAN)  → ENABLE + FORCE + policy
--       => bunlarda org/sistem izolasyonu DB seviyesinde AKTİF.
--   • Kalan 41 tablo (bir yerde context-less okunuyor)     → ENABLE + policy, FORCE YOK
--       => politika HAZIR ama DORMANT (sahip bypass). İzolasyon JS katmanında
--          (göç boyunca her route'ta zaten var olan açık WHERE org filtresi).
--          Okuma yolu withActor'a taşınınca tek satırla FORCE'a alınır (Bölüm 6).
--
-- ⚠️  DÜRÜST UYARI — DESTRUCTIVE İKİNCİ KATMAN, evaluation tablolarında DEVREDE DEĞİL:
--   evaluation_responses / evaluation_assignments / evaluation_period_* raporlarda
--   context-less OKUNUYOR → FORCE alamıyorlar → sahip bypass → withActor YAZMALARI da
--   DB'de zorlanmıyor. Yani submit/clear-period/reopen'ın DB-seviyesi koruması bu
--   fazda YOK; koruma JS'te. DB-seviyesi istiyorsak: önce bu tabloların OKUMA
--   yollarını withActor'a taşı, sonra FORCE (bkz. Bölüm 6 "FORCE Dalgası-2").
--   Kanıt/analiz: _faz0-rls-analiz.md.
--
-- Aktör (secure-query.ts): app.current_role/current_org/current_user_id.
-- super_admin = TAM BYPASS (login send-otp, anket POST sistem aktörü bunu kullanır).

-- ============================================================================
-- 0) ÖN KOŞUL — rol yetkileri + SAHİPLİK (Seçenek C'nin dayandığı varsayımlar)
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'visio360_app') then
    raise exception 'visio360_app rolü yok — önce oluştur (NOSUPERUSER, NOBYPASSRLS).';
  end if;
  if (select rolsuper or rolbypassrls from pg_roles where rolname = 'visio360_app') then
    raise exception 'visio360_app superuser/BYPASSRLS OLMAMALI — FORCE''lu tablolarda RLS''den kaçar.';
  end if;
end $$;

-- SAHİPLİK NOTU: Seçenek C, "enable ama FORCE değil = dormant" davranışının
-- visio360_app'in tablo SAHİBİ olmasına dayandığını varsayar. Restore, tabloları
-- visio360_app'e ait yapmalı (ör. restore'u visio360_app ile çalıştır ya da
-- ALTER TABLE ... OWNER TO visio360_app). Sahip FARKLI bir rolse, "enable-no-force"
-- visio360_app'e de uygulanır → pgRead KARADELİĞE düşer. Aşağıdaki denetim uyarır:
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_roles r on r.oid = c.relowner
  where n.nspname = 'public' and c.relkind = 'r' and r.rolname <> 'visio360_app';
  if bad is not null then
    raise warning 'DİKKAT: visio360_app SAHİBİ OLMAYAN public tablolar: %  → enable-no-force bunlarda dormant DEĞİL, KARADELİK olur. Önce OWNER TO visio360_app.', bad;
  end if;
end $$;

-- ============================================================================
-- 1) YARDIMCI FONKSİYONLAR (STABLE, SECURITY INVOKER) — politikalar DRY
-- ============================================================================
create or replace function public.app_is_super() returns boolean
  language sql stable as $$ select current_setting('app.current_role', true) = 'super_admin' $$;
create or replace function public.app_org() returns text
  language sql stable as $$ select current_setting('app.current_org', true) $$;
create or replace function public.app_period_in_org(p uuid) returns boolean
  language sql stable as $$ select public.app_is_super() or exists (
    select 1 from public.evaluation_periods ep where ep.id=p and ep.organization_id::text=public.app_org()) $$;
create or replace function public.app_assignment_in_org(a uuid) returns boolean
  language sql stable as $$ select public.app_is_super() or exists (
    select 1 from public.evaluation_assignments ea join public.evaluation_periods ep on ep.id=ea.period_id
    where ea.id=a and ep.organization_id::text=public.app_org()) $$;
create or replace function public.app_survey_in_org(s uuid) returns boolean
  language sql stable as $$ select public.app_is_super() or exists (
    select 1 from public.surveys sv where sv.id=s and sv.organization_id::text=public.app_org()) $$;
create or replace function public.app_response_in_org(r uuid) returns boolean
  language sql stable as $$ select public.app_is_super() or exists (
    select 1 from public.survey_responses sr join public.surveys sv on sv.id=sr.survey_id
    where sr.id=r and sv.organization_id::text=public.app_org()) $$;
create or replace function public.app_survey_assignment_in_org(a uuid) returns boolean
  language sql stable as $$ select public.app_is_super() or exists (
    select 1 from public.survey_assignments sa join public.surveys sv on sv.id=sa.survey_id
    where sa.id=a and sv.organization_id::text=public.app_org()) $$;
create or replace function public.app_plan_in_org(p uuid) returns boolean
  language sql stable as $$ select public.app_is_super() or exists (
    select 1 from public.action_plans ap where ap.id=p and ap.organization_id::text=public.app_org()) $$;
create or replace function public.app_user_in_org(u uuid) returns boolean
  language sql stable as $$ select public.app_is_super() or exists (
    select 1 from public.users us where us.id=u and us.organization_id::text=public.app_org()) $$;

grant execute on function
  public.app_is_super(), public.app_org(), public.app_period_in_org(uuid),
  public.app_assignment_in_org(uuid), public.app_survey_in_org(uuid),
  public.app_response_in_org(uuid), public.app_survey_assignment_in_org(uuid),
  public.app_plan_in_org(uuid), public.app_user_in_org(uuid)
  to visio360_app;

-- ============================================================================
-- 2) ORTAK UYGULAYICI — enable + policy HER ZAMAN; FORCE yalnız uygun tabloda
-- ============================================================================
-- FORCE-UYGUN 7 tablo: context-less erişimi OLMAYAN (bkz. _faz0-rls-analiz.md,
-- doğrulama ajanı file:line kanıtlı). Bunlar dışındaki her tablo DORMANT kalır.
create or replace function public.__rls_apply(
  tbl text, policy_name text, expr text, force_eligible boolean
) returns void language plpgsql as $$
begin
  if to_regclass('public.'||tbl) is null then
    raise notice 'ATLANDI (tablo yok): %', tbl; return;
  end if;
  execute format('alter table public.%I enable row level security', tbl);
  execute format('drop policy if exists %I on public.%I', policy_name, tbl);
  execute format('create policy %I on public.%I for all to visio360_app using (%s) with check (%s)',
                 policy_name, tbl, expr, expr);
  if force_eligible then
    execute format('alter table public.%I force row level security', tbl);
    raise notice 'AKTİF  (ENABLE+FORCE): %  [%]', tbl, policy_name;
  else
    execute format('alter table public.%I no force row level security', tbl);
    raise notice 'DORMANT (ENABLE, force YOK — context-less okuma var): %  [%]', tbl, policy_name;
  end if;
end $$;

-- ============================================================================
-- 3) POLİTİKALARI KUR — tüm sınıflar (FORCE bayrağı: yalnız 7 uygun tablo true)
-- ============================================================================
do $$
declare
  force_ok text[] := array[  -- context-less erişimi OLMAYAN, FORCE güvenli (5 tablo)
    'training_completions',   -- yazma: withActor{super} (integrations/training:58)
    'security_audit_logs',    -- yazma: withActor{super} (session/send-otp)
    'otp_codes',              -- oku/yaz: withActor{super} (session/send-otp login)
    'backup_runs',            -- pg erişimi yok
    'user_accessibility_preferences'  -- pg erişimi yok (me/preference migre olunca withActor)
  ];
  -- ⚠️ DORMANT bırakıldı (FORCE YOK) — SEBEP: SECURITY DEFINER + context-less:
  --   otp_rate_limits / otp_verify_attempts YALNIZCA check_otp_rate_limit /
  --   check_otp_verify_rate_limit (SECURITY DEFINER) fonksiyonlarından yazılıp okunur;
  --   bu fonksiyonlar send-otp:177 / session:101'de pgQuery ile (context-less) çağrılır.
  --   Restore sonrası fonksiyon SAHİBİ visio360_app (NOBYPASSRLS) → FORCE olsaydı
  --   fonksiyon içi insert/select politikaya takılır → OTP rate-limit KIRILIRDI.
  --   Sahip-bypass (enable-no-force) ile fonksiyon serbest çalışır. (Supabase'de
  --   definer superuser olduğu için sorun yoktu; yeni sunucuda değil.)
  --   İstenirse ALTERNATİF: bu 2 fonksiyona BYPASSRLS'li ayrı sahip ver + FORCE.
  r record; t text;
begin
  ------------------------------------------------------------------ SINIF A: doğrudan org kolonu
  for r in
    select c.table_name from information_schema.columns c
    join information_schema.tables t2 on t2.table_schema=c.table_schema and t2.table_name=c.table_name
    where c.table_schema='public' and c.column_name='organization_id' and t2.table_type='BASE TABLE'
  loop
    perform public.__rls_apply(r.table_name, 'org_isolation',
      'public.app_is_super() or organization_id::text = public.app_org()',
      r.table_name = any(force_ok));
  end loop;

  ------------------------------------------------------------------ organizations (kolon = id)
  perform public.__rls_apply('organizations', 'org_self',
    'public.app_is_super() or id::text = public.app_org()',
    'organizations' = any(force_ok));

  ------------------------------------------------------------------ SINIF B: period_id join — AUTO-DETECT
  -- Kural: period_id kolonu VAR + organization_id kolonu YOK → period→org join politikasi.
  -- (org kolonu OLANLAR Sinif A'da; evaluation_period_user_report_snapshots gibi org+period
  --  tablolari A'ya gider, burada DEGIL.) 68-tablo canli semada dogrulandi: bu kalibi taşiyan
  --  19 tablonun 18'i FK ile evaluation_periods'a bagli, biri (calculated_scores) FK'siz ama
  --  ayni hedef. Legacy period tablolari (calculated_scores/performance_trends/period_categories/
  --  weighted_results) bu sayede OTOMATIK kapsanir — elle liste bakimina gerek yok.
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t2
      on t2.table_schema=c.table_schema and t2.table_name=c.table_name
    where c.table_schema='public' and c.column_name='period_id' and t2.table_type='BASE TABLE'
      and not exists (
        select 1 from information_schema.columns o
        where o.table_schema='public' and o.table_name=c.table_name and o.column_name='organization_id')
  loop
    perform public.__rls_apply(r.table_name, 'org_isolation_join',
      'public.app_period_in_org(period_id)', r.table_name = any(force_ok));
  end loop;

  ------------------------------------------------------------------ SINIF C: assignment_id join (2 hop)
  foreach t in array array['evaluation_responses','international_standard_scores'] loop
    perform public.__rls_apply(t, 'org_isolation_join',
      'public.app_assignment_in_org(assignment_id)', t = any(force_ok));
  end loop;

  ------------------------------------------------------------------ SINIF D: survey (1 hop)
  foreach t in array array['survey_questions','survey_assignments','survey_ai_analyses','survey_responses'] loop
    perform public.__rls_apply(t, 'org_isolation_survey',
      'public.app_survey_in_org(survey_id)', t = any(force_ok));
  end loop;
  perform public.__rls_apply('survey_answers', 'org_isolation_survey',
    'public.app_response_in_org(response_id)', 'survey_answers' = any(force_ok));
  foreach t in array array['survey_assignment_categories','survey_assignment_questions'] loop
    perform public.__rls_apply(t, 'org_isolation_survey',
      'public.app_survey_assignment_in_org(assignment_id)', t = any(force_ok));
  end loop;

  ------------------------------------------------------------------ Tekil join'ler
  perform public.__rls_apply('action_plan_tasks', 'org_isolation_join',
    'public.app_plan_in_org(plan_id)', 'action_plan_tasks' = any(force_ok));
  perform public.__rls_apply('user_accessibility_preferences', 'org_isolation_join',
    'public.app_user_in_org(user_id)', 'user_accessibility_preferences' = any(force_ok));

  ------------------------------------------------------------------ SINIF G: global/sistem (super_admin only)
  foreach t in array array[
    'platform_settings','integration_settings','backup_runs',
    'otp_rate_limits','otp_verify_attempts','security_audit_logs',
    'training_completions','otp_codes']
  loop
    perform public.__rls_apply(t, 'system_only',
      'public.app_is_super()', t = any(force_ok));
  end loop;

  ------------------------------------------------------------------ SINIF-DISI TEMIZLIK
  -- faz0-RLS'in policy UYGULAMADIGI ama (Supabase dump'indan) RLS-enabled kalmis tablolar:
  -- global paylasimli havuzlar (questions/categories/main_categories/question_*...) + legacy
  -- (sj_import/company_data/login_attempts/user_sessions...). Bunlar bilinçli org-izole DEGIL.
  -- Orphan "enable ama policy YOK" birakmak, sahip-disi bir rol icin deny-all olur → RLS'i KAPAT.
  -- (visio360_app tam erisir; paylasimli havuzlar tum org'lara ortak, dogru davranis.)
  for r in
    select c.relname as tname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and c.relrowsecurity
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  loop
    execute format('alter table public.%I disable row level security', r.tname);
    raise notice 'SINIF-DISI RLS kapatildi (paylasimli/legacy): %', r.tname;
  end loop;
end $$;

-- NOT (survey anonim insert): ayrı public-insert politikası YOK. Anket POST'u
-- SYSTEM_ACTOR{super_admin} ile withActor açar → app_is_super()=TRUE → WITH CHECK
-- geçer. Güvenlik yapısal (survey_id sunucuda çözülür, alanlar sunucu-set, atomik tx).
--
-- NOT (integration_logs / platform_settings / integration_settings / training_assignments):
-- context-less okunuyorlar → DORMANT (FORCE YOK). Okuma withActor'a taşınınca FORCE.

-- ============================================================================
-- 4) otp_codes — bu repoda CREATE YOK (erken şema). Restore SONRASI kontrol:
-- ============================================================================
--   select to_regclass('public.otp_codes');   -- NULL ise Bölüm 3-G listesi onu ATLAR
-- Tablo restore ile geldiyse yukarıdaki G bloğu system_only + FORCE uygular (uygun).
-- Gelmediyse: şema tamamlanınca bu dosyayı yeniden çalıştır ya da elle ekle.

-- ============================================================================
-- 5) KAPSAM ÖZ-DENETİMİ — uygulamadan sonra çalıştır
-- ============================================================================
-- (a) Beklenen FORCE'lu tam liste (5): sonuç birebir bunlar olmalı
--   select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relkind='r' and c.relforcerowsecurity order by 1;
--   -- beklenen: backup_runs, otp_codes(varsa), security_audit_logs,
--   --           training_completions, user_accessibility_preferences
--   -- DİKKAT: otp_rate_limits / otp_verify_attempts LİSTEDE OLMAMALI (dormant — SECURITY DEFINER)
-- (b) RLS açık ama politikasız (yanlışlıkla tam-kilit) — BOŞ dönmeli:
--   select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relkind='r' and c.relrowsecurity
--     and not exists (select 1 from pg_policy p where p.polrelid=c.oid);
-- (c) FORCE'lu bir tabloya yanlışlıkla context-less erişim regresyonu:
--   smoke test → her FORCE'lu tabloyu withActor(super) ile SELECT et, satır gelmeli;
--   pgRead ile SELECT et, 0 satır gelmeli (beklenen davranış).

-- ============================================================================
-- 6) SONRAKİ ADIM — "FORCE Dalgası-2" (evaluation destructive tabloları DB'ye al)
-- ============================================================================
-- Destructive ikinci katmanı gerçekten DB'ye taşımak için, önce şu tabloların
-- TÜM context-less okuma yollarını withActor'a taşı, SONRA tek satırla FORCE:
--   alter table public.evaluation_responses      force row level security;
--   alter table public.evaluation_assignments    force row level security;
--   -- (+ ilgili evaluation_period_* / snapshot okuma yolları withActor olunca onlar da)
-- Taşınacak context-less okuyucular (kanıt: _faz0-rls-analiz.md tablosu), örn:
--   src/lib/server/fetch-evaluation-responses.ts, matrix-*-build.ts,
--   dashboard/results, no-opinion-report, evaluator-answer-detail-fetch, ...
-- Her tablo için: okuma yolu %100 withActor → smoke test → FORCE. Kademeli, güvenli.

-- ============================================================================
-- GERİ ALMA (rollback)
-- ============================================================================
-- Tek tablo:  drop policy if exists <ad> on public.<TABLO>;
--             alter table public.<TABLO> no force row level security;
--             alter table public.<TABLO> disable row level security;
-- Yardımcıları da kaldırmak için: drop function public.__rls_apply(...), app_*.
