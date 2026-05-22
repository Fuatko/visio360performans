-- Görev paketi seçimi (Formatör, Zümre…) — evaluation_period_evaluator_scope üzerinde
-- evaluation_period_evaluator_categories içinde scope_kind='duty_id' KULLANMAYIN.

alter table public.evaluation_period_evaluator_scope
  add column if not exists duty_package_ids uuid[] not null default '{}';
