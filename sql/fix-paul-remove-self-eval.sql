-- Paul GEORGES — öz değerlendirme atamalarını kaldır (bu dönemde öz değerlendirme yok)
-- evaluator_id = target_id = Paul GEORGES
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- Paul: 6350a539-e0aa-49b7-8895-9ee572124bfe
--
-- Not: Paul başkaları tarafından değerlendirilmeye devam eder (hedef olarak kalır).

begin;

do $$
declare
  v_name text;
begin
  select name into v_name from public.users where id = '6350a539-e0aa-49b7-8895-9ee572124bfe';
  if v_name is distinct from 'Paul GEORGES' then
    raise exception 'Güvenlik: ID Paul GEORGES değil (%)', v_name;
  end if;
end $$;

-- Teşhis (silmeden önce)
select
  ea.id as assignment_id,
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  ea.status
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and ea.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid;

delete from public.evaluation_responses er
where er.assignment_id in (
  select ea.id
  from public.evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
    and ea.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
);

delete from public.international_standard_scores iss
where iss.assignment_id in (
  select ea.id
  from public.evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
    and ea.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
);

delete from public.evaluation_period_evaluator_target_categories tc
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and tc.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and tc.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid;

delete from public.evaluation_period_evaluator_target_scope ts
where ts.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ts.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and ts.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid;

delete from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and ea.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid;

commit;

-- Doğrulama
select count(*) as paul_oz_degerlendirme_kalan
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and ea.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid;

select
  count(*) filter (where coalesce(matrix_context, 'genel') = 'genel') as genel_atama,
  count(*) filter (where coalesce(matrix_context, 'genel') = 'genel' and status <> 'completed') as genel_bekleyen
from public.evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid;
