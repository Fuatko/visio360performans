-- VISIO360 - TR/EN/FR Çeviri Kolonları
-- Supabase SQL Editor'da bir kez çalıştırın.

-- Main categories
alter table public.main_categories
  add column if not exists name_en text null,
  add column if not exists name_fr text null;

-- Categories (sub categories)
alter table public.categories
  add column if not exists name_en text null,
  add column if not exists name_fr text null;

-- Questions
alter table public.questions
  add column if not exists text_en text null,
  add column if not exists text_fr text null;

-- Answers
alter table public.answers
  add column if not exists text_en text null,
  add column if not exists text_fr text null;

