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

-- Answers
alter table if exists public.answers
  add column if not exists text_en text null,
  add column if not exists text_fr text null;

-- If your schema uses question_categories / question_answers (older admin page), add translations there too.
alter table if exists public.question_categories
  add column if not exists name_en text null,
  add column if not exists name_fr text null;

alter table if exists public.question_answers
  add column if not exists text_en text null,
  add column if not exists text_fr text null;

