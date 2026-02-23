-- evaluation_assignments tablosu
-- Değerlendirme Matrisi (RACI) atamalarını saklar.
-- Bu tablo yoksa matris kaydedemezsiniz.
-- Önce sql/setup-action-plans-complete.sql veya 00-base-schema.sql çalıştırılmış olmalı (organizations, users, evaluation_periods).

create extension if not exists pgcrypto;

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

create unique index if not exists evaluation_assignments_period_eval_target_uidx
  on public.evaluation_assignments(period_id, evaluator_id, target_id);
create index if not exists evaluation_assignments_period_idx on public.evaluation_assignments(period_id);
create index if not exists evaluation_assignments_evaluator_idx on public.evaluation_assignments(evaluator_id);
create index if not exists evaluation_assignments_target_idx on public.evaluation_assignments(target_id);
create index if not exists evaluation_assignments_slug_idx on public.evaluation_assignments(slug) where slug is not null;
