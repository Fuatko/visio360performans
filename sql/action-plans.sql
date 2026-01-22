-- Action Plans (Eylem Planı Takibi)
-- Idempotent migration for Supabase Postgres.
--
-- Creates:
-- - public.action_plans: one plan per (user, period, source)
-- - public.action_plan_tasks: tasks/items under a plan
--
-- Notes:
-- - Intended to be accessed via server APIs (service role). RLS can remain deny-all.
-- - Keep data minimal (KVKK): no sensitive free-form PII beyond work-related notes.

create extension if not exists pgcrypto;

create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_id uuid null references public.evaluation_periods(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  department text null,
  source text not null default 'development',
  title text not null default '',
  status text not null default 'draft' check (status in ('draft','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz null,
  due_at timestamptz null,
  completed_at timestamptz null,
  reminder_first_sent_at timestamptz null,
  reminder_last_sent_at timestamptz null
);

-- One plan per user per period (per source)
create unique index if not exists action_plans_user_period_source_uniq
  on public.action_plans(user_id, period_id, source);

create index if not exists action_plans_org_idx on public.action_plans(organization_id);
create index if not exists action_plans_period_idx on public.action_plans(period_id);
create index if not exists action_plans_user_idx on public.action_plans(user_id);
create index if not exists action_plans_status_idx on public.action_plans(status);
create index if not exists action_plans_due_idx on public.action_plans(due_at);

create table if not exists public.action_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.action_plans(id) on delete cascade,
  sort_order int not null default 0,
  area text not null default '',
  description text not null default '',
  status text not null default 'pending' check (status in ('pending','started','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz null,
  done_at timestamptz null
);

create index if not exists action_plan_tasks_plan_idx on public.action_plan_tasks(plan_id);
create index if not exists action_plan_tasks_status_idx on public.action_plan_tasks(status);

