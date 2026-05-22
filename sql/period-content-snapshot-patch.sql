-- Eksik snapshot kolonları varsa ekle (period-content-snapshot.sql sonrası güvenli yama)
-- Supabase SQL Editor'da bir kez çalıştırın.

alter table if exists public.evaluation_period_questions_snapshot
  add column if not exists category_source text null;

alter table if exists public.evaluation_period_main_categories_snapshot
  add column if not exists status text null;

alter table if exists public.evaluation_period_answers_snapshot
  add column if not exists source_table text null;
