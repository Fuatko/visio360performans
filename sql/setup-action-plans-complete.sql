-- ============================================================
-- VISIO360 - Tam Kurulum (Action Plans + Değerlendirme Matrisi)
-- ============================================================
-- Supabase SQL Editor'da bu dosyayı TEK SEFERDE çalıştırın.
-- organization_id / user_id hatalarını giderir.
-- Değerlendirme Matrisi (RACI) kaydetme sorununu çözer.
-- ============================================================

create extension if not exists pgcrypto;

-- ADIM 1: organizations tablosu
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_base64 text null,
  logo_url text null,
  created_at timestamptz not null default now()
);

-- ADIM 2: users tablosu - yoksa oluştur, varsa organization_id ekle
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text null,
  organization_id uuid null,
  title text null,
  department text null,
  manager_id uuid null,
  position_level text not null default 'peer',
  role text not null default 'user',
  status text not null default 'active',
  preferred_language text not null default 'tr',
  created_at timestamptz not null default now()
);

-- users'da organization_id yoksa ekle (tablo başka yerden oluşturulduysa)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='organization_id') then
    alter table public.users add column organization_id uuid null references public.organizations(id) on delete set null;
  end if;
end $$;
create index if not exists users_org_idx on public.users(organization_id);
create index if not exists users_email_idx on public.users(email);

-- ADIM 3: evaluation_periods tablosu
create table if not exists public.evaluation_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text null,
  name_fr text null,
  organization_id uuid null references public.organizations(id) on delete cascade,
  start_date date not null default current_date,
  end_date date not null default current_date,
  status text not null default 'inactive',
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='evaluation_periods' and column_name='organization_id') then
    alter table public.evaluation_periods add column organization_id uuid null references public.organizations(id) on delete cascade;
  end if;
end $$;
create index if not exists evaluation_periods_org_idx on public.evaluation_periods(organization_id);

-- ADIM 3b: evaluation_assignments (Değerlendirme Matrisi atamaları)
create table if not exists public.evaluation_assignments (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  evaluator_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','completed')),
  slug text null,
  token text null,
  completed_at timestamptz null,
  created_at timestamptz not null default now()
);
create unique index if not exists evaluation_assignments_period_eval_target_uidx on public.evaluation_assignments(period_id, evaluator_id, target_id);
create index if not exists evaluation_assignments_period_idx on public.evaluation_assignments(period_id);
create index if not exists evaluation_assignments_evaluator_idx on public.evaluation_assignments(evaluator_id);
create index if not exists evaluation_assignments_target_idx on public.evaluation_assignments(target_id);
create index if not exists evaluation_assignments_slug_idx on public.evaluation_assignments(slug) where slug is not null;

-- ADIM 4: action_plans tablosu
create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  period_id uuid null,
  user_id uuid null,
  department text null,
  source text not null default 'development',
  title text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz null,
  due_at timestamptz null,
  completed_at timestamptz null,
  reminder_first_sent_at timestamptz null,
  reminder_last_sent_at timestamptz null
);

-- action_plans için FK'lar (tablo zaten varsa sadece eksikleri ekle)
do $$
begin
  if not exists (select 1 from information_schema.table_constraints where constraint_schema='public' and table_name='action_plans' and constraint_name='action_plans_organization_id_fkey') then
    alter table public.action_plans add constraint action_plans_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade;
  end if;
  if not exists (select 1 from information_schema.table_constraints where constraint_schema='public' and table_name='action_plans' and constraint_name='action_plans_period_id_fkey') then
    alter table public.action_plans add constraint action_plans_period_id_fkey foreign key (period_id) references public.evaluation_periods(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.table_constraints where constraint_schema='public' and table_name='action_plans' and constraint_name='action_plans_user_id_fkey') then
    alter table public.action_plans add constraint action_plans_user_id_fkey foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists action_plans_user_period_source_uniq on public.action_plans(user_id, period_id, source);
create index if not exists action_plans_org_idx on public.action_plans(organization_id);
create index if not exists action_plans_period_idx on public.action_plans(period_id);
create index if not exists action_plans_user_idx on public.action_plans(user_id);
create index if not exists action_plans_status_idx on public.action_plans(status);

-- ADIM 5: action_plan_tasks
create table if not exists public.action_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  sort_order int not null default 0,
  area text not null default '',
  description text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz null,
  done_at timestamptz null
);

do $$
begin
  if not exists (select 1 from information_schema.table_constraints where constraint_schema='public' and table_name='action_plan_tasks' and constraint_name='action_plan_tasks_plan_id_fkey') then
    alter table public.action_plan_tasks add constraint action_plan_tasks_plan_id_fkey foreign key (plan_id) references public.action_plans(id) on delete cascade;
  end if;
end $$;

create index if not exists action_plan_tasks_plan_idx on public.action_plan_tasks(plan_id);

-- v2/v3 alanları (planned_at, training_id, ai_suggestion vb.)
alter table public.action_plan_tasks add column if not exists planned_at timestamptz null;
alter table public.action_plan_tasks add column if not exists learning_started_at timestamptz null;
alter table public.action_plan_tasks add column if not exists baseline_score numeric null;
alter table public.action_plan_tasks add column if not exists target_score numeric null;
alter table public.action_plan_tasks add column if not exists training_id uuid null;
alter table public.action_plan_tasks add column if not exists ai_suggestion jsonb null;
alter table public.action_plan_tasks add column if not exists ai_text text null;
alter table public.action_plan_tasks add column if not exists ai_generated_at timestamptz null;
