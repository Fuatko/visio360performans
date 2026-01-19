-- KVKK: Evaluation tabloları için RLS (client erişimini kapatır; server/service-role API'ler çalışır)
-- Supabase SQL Editor'da çalıştırın.

do $$
begin
  -- evaluation_assignments
  if to_regclass('public.evaluation_assignments') is not null then
    alter table public.evaluation_assignments enable row level security;
    drop policy if exists "deny_all_select" on public.evaluation_assignments;
    create policy "deny_all_select" on public.evaluation_assignments for select using (false);
    drop policy if exists "deny_all_insert" on public.evaluation_assignments;
    create policy "deny_all_insert" on public.evaluation_assignments for insert with check (false);
    drop policy if exists "deny_all_update" on public.evaluation_assignments;
    create policy "deny_all_update" on public.evaluation_assignments for update using (false);
    drop policy if exists "deny_all_delete" on public.evaluation_assignments;
    create policy "deny_all_delete" on public.evaluation_assignments for delete using (false);
  end if;

  -- evaluation_responses
  if to_regclass('public.evaluation_responses') is not null then
    alter table public.evaluation_responses enable row level security;
    drop policy if exists "deny_all_select" on public.evaluation_responses;
    create policy "deny_all_select" on public.evaluation_responses for select using (false);
    drop policy if exists "deny_all_insert" on public.evaluation_responses;
    create policy "deny_all_insert" on public.evaluation_responses for insert with check (false);
    drop policy if exists "deny_all_update" on public.evaluation_responses;
    create policy "deny_all_update" on public.evaluation_responses for update using (false);
    drop policy if exists "deny_all_delete" on public.evaluation_responses;
    create policy "deny_all_delete" on public.evaluation_responses for delete using (false);
  end if;

  -- international_standard_scores (opsiyonel)
  if to_regclass('public.international_standard_scores') is not null then
    alter table public.international_standard_scores enable row level security;
    drop policy if exists "deny_all_select" on public.international_standard_scores;
    create policy "deny_all_select" on public.international_standard_scores for select using (false);
    drop policy if exists "deny_all_insert" on public.international_standard_scores;
    create policy "deny_all_insert" on public.international_standard_scores for insert with check (false);
    drop policy if exists "deny_all_update" on public.international_standard_scores;
    create policy "deny_all_update" on public.international_standard_scores for update using (false);
    drop policy if exists "deny_all_delete" on public.international_standard_scores;
    create policy "deny_all_delete" on public.international_standard_scores for delete using (false);
  end if;

  -- evaluation_period_questions (opsiyonel: dönem soru seçimleri)
  if to_regclass('public.evaluation_period_questions') is not null then
    alter table public.evaluation_period_questions enable row level security;
    drop policy if exists "deny_all_select" on public.evaluation_period_questions;
    create policy "deny_all_select" on public.evaluation_period_questions for select using (false);
    drop policy if exists "deny_all_insert" on public.evaluation_period_questions;
    create policy "deny_all_insert" on public.evaluation_period_questions for insert with check (false);
    drop policy if exists "deny_all_update" on public.evaluation_period_questions;
    create policy "deny_all_update" on public.evaluation_period_questions for update using (false);
    drop policy if exists "deny_all_delete" on public.evaluation_period_questions;
    create policy "deny_all_delete" on public.evaluation_period_questions for delete using (false);
  end if;
end
$$;

