-- VISIO360 - Dönem Bazlı İçerik Snapshot (Soru/Kategori/Cevap Kilitleme)
-- Amaç: Bir dönem (period) için soru-kategori-cevap metinlerini o anki haliyle saklamak.
-- Böylece daha sonra global tablolar (questions/categories/answers) güncellense bile
-- geçmiş dönemlerin metinleri & kırılımları değişmez.
--
-- Supabase SQL Editor'da çalıştırın. İdempotent olacak şekilde yazılmıştır.

create extension if not exists "pgcrypto";

-- 1) Main categories snapshot
create table if not exists public.evaluation_period_main_categories_snapshot (
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  id uuid not null,
  name text not null,
  name_en text null,
  name_fr text null,
  description text null,
  description_en text null,
  description_fr text null,
  sort_order integer null,
  is_active boolean null,
  status text null,
  source_table text null default 'main_categories',
  snapshotted_at timestamptz not null default now(),
  primary key (period_id, id)
);

-- 2) Categories snapshot (covers both `categories` and `question_categories`)
create table if not exists public.evaluation_period_categories_snapshot (
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  id uuid not null,
  main_category_id uuid null,
  name text not null,
  name_en text null,
  name_fr text null,
  description text null,
  description_en text null,
  description_fr text null,
  sort_order integer null,
  is_active boolean null,
  source_table text null, -- 'categories' | 'question_categories'
  snapshotted_at timestamptz not null default now(),
  primary key (period_id, id)
);

create index if not exists idx_eval_period_cat_snap_period on public.evaluation_period_categories_snapshot(period_id);
create index if not exists idx_eval_period_cat_snap_main on public.evaluation_period_categories_snapshot(period_id, main_category_id);

-- 3) Questions snapshot
create table if not exists public.evaluation_period_questions_snapshot (
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  id uuid not null,
  category_id uuid null,
  text text not null,
  text_en text null,
  text_fr text null,
  sort_order integer null,
  is_active boolean null,
  category_source text null, -- 'categories' | 'question_categories'
  snapshotted_at timestamptz not null default now(),
  primary key (period_id, id)
);

create index if not exists idx_eval_period_q_snap_period on public.evaluation_period_questions_snapshot(period_id);
create index if not exists idx_eval_period_q_snap_cat on public.evaluation_period_questions_snapshot(period_id, category_id);

-- 4) Answers snapshot (covers both `answers` and `question_answers`)
create table if not exists public.evaluation_period_answers_snapshot (
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  id uuid not null,
  question_id uuid not null,
  text text not null,
  text_en text null,
  text_fr text null,
  level text null,
  std_score numeric null,
  reel_score numeric null,
  sort_order integer null,
  is_active boolean null,
  source_table text null, -- 'answers' | 'question_answers'
  snapshotted_at timestamptz not null default now(),
  primary key (period_id, id)
);

create index if not exists idx_eval_period_a_snap_period on public.evaluation_period_answers_snapshot(period_id);
create index if not exists idx_eval_period_a_snap_q on public.evaluation_period_answers_snapshot(period_id, question_id);

-- 5) KVKK/Security: client rollerine kapat (service_role server-side kullanır)
alter table public.evaluation_period_main_categories_snapshot enable row level security;
alter table public.evaluation_period_categories_snapshot enable row level security;
alter table public.evaluation_period_questions_snapshot enable row level security;
alter table public.evaluation_period_answers_snapshot enable row level security;

do $$
begin
  -- deny-all policies (idempotent)
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_period_main_categories_snapshot') then
    create policy "deny all" on public.evaluation_period_main_categories_snapshot for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_period_categories_snapshot') then
    create policy "deny all" on public.evaluation_period_categories_snapshot for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_period_questions_snapshot') then
    create policy "deny all" on public.evaluation_period_questions_snapshot for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_period_answers_snapshot') then
    create policy "deny all" on public.evaluation_period_answers_snapshot for all using (false) with check (false);
  end if;
exception when others then
  -- ignore if policies already exist with same name in some environments
  null;
end $$;

revoke all on public.evaluation_period_main_categories_snapshot from anon, authenticated;
revoke all on public.evaluation_period_categories_snapshot from anon, authenticated;
revoke all on public.evaluation_period_questions_snapshot from anon, authenticated;
revoke all on public.evaluation_period_answers_snapshot from anon, authenticated;

