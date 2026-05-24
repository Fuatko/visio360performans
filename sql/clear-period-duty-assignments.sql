-- Dönemdeki TÜM yan görev atamalarını siler (kişi–görev Excel).
-- Matris atamalarına ve genel soru seçimine dokunmaz.
-- :period_id yerine gerçek UUID yazın.

delete from public.evaluation_period_user_duties
where period_id = :'period_id'::uuid;

delete from public.evaluation_period_evaluator_categories
where period_id = :'period_id'::uuid and scope_kind = 'duty';

delete from public.evaluation_period_evaluator_target_categories
where period_id = :'period_id'::uuid and scope_kind = 'duty';

update public.evaluation_period_evaluator_scope
set duty_mode = 'none', duty_package_ids = '{}', updated_at = now()
where period_id = :'period_id'::uuid;

update public.evaluation_period_evaluator_target_scope
set duty_mode = 'none', duty_package_ids = '{}', updated_at = now()
where period_id = :'period_id'::uuid;
