-- Görev paketi (Formatör, Zümre…) seçimi: category_id sütununda duty_id saklanır
-- Mevcut kurulumlara zarar vermez; yalnızca scope_kind kısıtını genişletir.

alter table public.evaluation_period_evaluator_categories
  drop constraint if exists evaluation_period_evaluator_categories_scope_kind_check;

alter table public.evaluation_period_evaluator_categories
  add constraint evaluation_period_evaluator_categories_scope_kind_check
  check (scope_kind in ('period', 'duty', 'duty_id'));
