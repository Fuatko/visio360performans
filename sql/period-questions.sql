-- VISIO360 - Dönem Bazlı Soru Seçimi
-- Supabase SQL Editor'da bir kez çalıştırın.

create extension if not exists "pgcrypto";

create table if not exists public.evaluation_period_questions (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (period_id, question_id)
);

create index if not exists idx_epq_period on public.evaluation_period_questions(period_id);
create index if not exists idx_epq_question on public.evaluation_period_questions(question_id);
