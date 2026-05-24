-- Çoklu görev: aynı değerlendiren→hedef çifti farklı matrislerde ayrı atama olabilir
-- (genel, okul yaşam, nöbetçi öğretmen vb.)

alter table public.evaluation_assignments
  add column if not exists matrix_context text not null default 'genel';

drop index if exists public.evaluation_assignments_period_eval_target_uidx;
create unique index if not exists evaluation_assignments_period_eval_target_ctx_uidx
  on public.evaluation_assignments(period_id, evaluator_id, target_id, matrix_context);

alter table public.evaluation_period_evaluator_target_scope
  add column if not exists matrix_context text not null default 'genel';

alter table public.evaluation_period_evaluator_target_categories
  add column if not exists matrix_context text not null default 'genel';

-- Hedef kapsamı: görev bağlamına göre ayrı kayıt
alter table public.evaluation_period_evaluator_target_scope
  drop constraint if exists evaluation_period_evaluator_target_scope_pkey;

alter table public.evaluation_period_evaluator_target_scope
  add primary key (period_id, evaluator_id, target_id, matrix_context);

drop index if exists evaluation_period_evaluator_target_categories_period_id_evaluator_id_targ_key;
create unique index if not exists evaluation_period_evaluator_target_categories_ctx_uidx
  on public.evaluation_period_evaluator_target_categories(
    period_id, evaluator_id, target_id, category_id, scope_kind, matrix_context
  );

-- Mevcut okul yaşam matrisi kapsamlarını işaretle (5 kategori + restrict_period)
-- İsteğe bağlı: yalnızca okul yaşam importundan sonra bir kez çalıştırın
/*
update public.evaluation_period_evaluator_target_scope s
set matrix_context = 'okul_yasam'
where s.restrict_period = true
  and s.duty_mode = 'none'
  and exists (
    select 1 from public.evaluation_period_evaluator_target_categories c
    where c.period_id = s.period_id
      and c.evaluator_id = s.evaluator_id
      and c.target_id = s.target_id
      and c.scope_kind = 'period'
    having count(*) between 4 and 6
  );
*/

revoke all on table public.evaluation_assignments from anon, authenticated;
