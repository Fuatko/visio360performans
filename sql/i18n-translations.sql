-- VISIO360 - TR/EN/FR Çeviri Kolonları
-- Supabase SQL Editor'da bir kez çalıştırın.

-- Main categories
alter table if exists public.main_categories
  add column if not exists name_en text null,
  add column if not exists name_fr text null;

-- Categories (sub categories)
alter table if exists public.categories
  add column if not exists name_en text null,
  add column if not exists name_fr text null;

-- Questions
alter table if exists public.questions
  add column if not exists text_en text null,
  add column if not exists text_fr text null;

-- Evaluation Periods (period names)
alter table if exists public.evaluation_periods
  add column if not exists name_en text null,
  add column if not exists name_fr text null;

-- Answers
do $$
begin
  -- answers bir view olabilir (schema-compat ile). View üzerinde ADD COLUMN yapılamaz.
  if to_regclass('public.answers') is not null then
    if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='answers' and c.relkind='r') then
      execute 'alter table public.answers add column if not exists text_en text null, add column if not exists text_fr text null';
    end if;
  end if;
end $$;

-- If your schema uses question_categories / question_answers (older admin page), add translations there too.
alter table if exists public.question_categories
  add column if not exists name_en text null,
  add column if not exists name_fr text null;

alter table if exists public.question_answers
  add column if not exists text_en text null,
  add column if not exists text_fr text null;

