-- ============================================================================
-- FAZ 0 — RLS org izolasyonu (TASARIM / ŞABLON) — HENÜZ UYGULANMADI
-- ============================================================================
-- Bu dosya, pg göçünün güvenlik katmanının VERİTABANI tarafıdır.
-- visio360_prod'a veri restore edildikten SONRA (tablolar oluşunca) çalıştırılacak.
-- Amaç: uygulama bir sorguda WHERE organization_id yazmayı unutsa BİLE, DB'nin
-- cross-org satırları filtrelemesi (mimari sızıntı-önleme).
--
-- Nasıl çalışır:
--   - lib/server/secure-query.ts -> withActor() her transaction başında şunları set eder:
--       app.current_role  = 'super_admin' | 'org_admin' | 'user'
--       app.current_org   = <organization_id>
--   - Aşağıdaki politika: super_admin her şeyi görür; diğerleri SADECE current_org.
--   - FORCE ROW LEVEL SECURITY: tablo sahibi (visio360_app) BİLE politikaya tabi.
--   - visio360_app superuser DEĞİL, BYPASSRLS DEĞİL → politikadan kaçamaz.
--
-- NOT: Yalnızca organization_id kolonu OLAN (kuruma özel) tablolara uygulanır.
-- Global/paylaşımlı havuzlar (ör. questions/main_categories — daha önce tespit
-- ettiğimiz, org_id'si olmayan tablolar) BU LİSTEYE GİRMEZ; onların erişimi
-- uygulama katmanında ele alınır (ayrı iş / göç konusu).

-- Örnek — tek tablo için desen (organization_id kolonu olanlara uygulanır):
--
--   alter table public.<TABLO> enable row level security;
--   alter table public.<TABLO> force  row level security;
--   drop policy if exists org_isolation on public.<TABLO>;
--   create policy org_isolation on public.<TABLO>
--     for all to visio360_app
--     using (
--       current_setting('app.current_role', true) = 'super_admin'
--       or organization_id::text = current_setting('app.current_org', true)
--     )
--     with check (
--       current_setting('app.current_role', true) = 'super_admin'
--       or organization_id::text = current_setting('app.current_org', true)
--     );

-- Otomatik uygulama (organization_id kolonu olan TÜM public tablolar) — idempotent:
do $$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'organization_id'
  loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format('alter table public.%I force  row level security', r.table_name);
    execute format('drop policy if exists org_isolation on public.%I', r.table_name);
    execute format($f$
      create policy org_isolation on public.%I
        for all to visio360_app
        using (
          current_setting('app.current_role', true) = 'super_admin'
          or organization_id::text = current_setting('app.current_org', true)
        )
        with check (
          current_setting('app.current_role', true) = 'super_admin'
          or organization_id::text = current_setting('app.current_org', true)
        )
    $f$, r.table_name);
    raise notice 'RLS org_isolation uygulandi: %', r.table_name;
  end loop;
end $$;

-- Geri alma (gerekirse): her tabloda
--   drop policy if exists org_isolation on public.<TABLO>;
--   alter table public.<TABLO> no force row level security;
--   alter table public.<TABLO> disable row level security;
