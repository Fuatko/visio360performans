-- Dönemdeki TÜM matris atamalarını ve (isteğe bağlı) soru kapsamını siler.
-- Supabase SQL Editor'da çalıştırın; :period_id yerine gerçek UUID yazın.
--
-- Örnek:
--   \set period_id 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

-- 1) Yanıtlar ve skorlar
delete from public.evaluation_responses
where assignment_id in (
  select id from public.evaluation_assignments where period_id = :'period_id'::uuid
);

delete from public.international_standard_scores
where assignment_id in (
  select id from public.evaluation_assignments where period_id = :'period_id'::uuid
);

-- 2) Atamalar
delete from public.evaluation_assignments
where period_id = :'period_id'::uuid;

-- 3) Soru kapsamı (tablolar yoksa satırı atlayın)
delete from public.evaluation_period_evaluator_target_categories where period_id = :'period_id'::uuid;
delete from public.evaluation_period_evaluator_target_scope where period_id = :'period_id'::uuid;
delete from public.evaluation_period_evaluator_categories where period_id = :'period_id'::uuid;
delete from public.evaluation_period_evaluator_scope where period_id = :'period_id'::uuid;
