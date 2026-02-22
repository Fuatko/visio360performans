-- Fix: action_plans tablosunda user_id kolonu eksikse ekle
-- ERROR 42703: column "user_id" does not exist hatasını giderir.
-- Idempotent: birden fazla kez çalıştırılabilir.
--
-- Önce sql/action-plans.sql çalıştırılmamışsa, önce onu çalıştırın.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'action_plans')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'action_plans' and column_name = 'user_id')
  then
    alter table public.action_plans
      add column user_id uuid null references public.users(id) on delete cascade;

    update public.action_plans ap
    set user_id = (select u.id from public.users u where u.organization_id = ap.organization_id and u.status = 'active' order by u.created_at limit 1)
    where ap.user_id is null and exists (select 1 from public.users u where u.organization_id = ap.organization_id and u.status = 'active');

    -- Null kalan yoksa NOT NULL yap
    if not exists (select 1 from public.action_plans where user_id is null) then
      alter table public.action_plans alter column user_id set not null;
    end if;

    create unique index if not exists action_plans_user_period_source_uniq on public.action_plans(user_id, period_id, source);
    create index if not exists action_plans_user_idx on public.action_plans(user_id);
  end if;
end $$;
