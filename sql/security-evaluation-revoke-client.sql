-- KVKK: Evaluation tablolarında anon/authenticated için explicit REVOKE (RLS deny-all ile birlikte)
-- Supabase SQL Editor'da çalıştırın.

do $$
begin
  if to_regclass('public.evaluation_assignments') is not null then
    revoke all on table public.evaluation_assignments from anon, authenticated;
  end if;
  if to_regclass('public.evaluation_responses') is not null then
    revoke all on table public.evaluation_responses from anon, authenticated;
  end if;
  if to_regclass('public.international_standard_scores') is not null then
    revoke all on table public.international_standard_scores from anon, authenticated;
  end if;
  if to_regclass('public.evaluation_period_questions') is not null then
    revoke all on table public.evaluation_period_questions from anon, authenticated;
  end if;
end
$$;

