-- organization_id eksik kolonları ekle
-- Tablolar başka bir kaynaktan oluşturulduysa (farklı şema) bu migration eksik kolonları ekler.
-- ERROR 42703: column "organization_id" does not exist hatasını giderir.
-- 00-base-schema.sql veya ilgili tablolar oluşturulduktan SONRA çalıştırın.

do $$
begin
  -- users tablosunda organization_id yoksa ekle
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'organization_id')
  then
    alter table public.users add column organization_id uuid null references public.organizations(id) on delete set null;
    create index if not exists users_org_idx on public.users(organization_id);
  end if;

  -- evaluation_periods tablosunda organization_id yoksa ekle
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'evaluation_periods')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'evaluation_periods' and column_name = 'organization_id')
  then
    alter table public.evaluation_periods add column organization_id uuid null references public.organizations(id) on delete cascade;
    create index if not exists evaluation_periods_org_idx on public.evaluation_periods(organization_id);
  end if;

  -- action_plans tablosunda organization_id yoksa ekle
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'action_plans')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'action_plans' and column_name = 'organization_id')
  then
    alter table public.action_plans add column organization_id uuid null references public.organizations(id) on delete cascade;
    create index if not exists action_plans_org_idx on public.action_plans(organization_id);
  end if;
end $$;
