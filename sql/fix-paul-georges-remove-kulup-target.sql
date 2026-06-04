-- Paul GEORGES — Kulüp Öğretmeni olarak değerlendirilmesin
-- Yan görev profilde görünse bile kulüp matrisi atamaları ve görev kaydı kaldırılır.
-- Paul LAFORGE (gerçek kulüp öğretmeni) etkilenmez.
--
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Paul GEORGES: 6350a539-e0aa-49b7-8895-9ee572124bfe
-- Kulüp duty_id: ed8f387d-ee3f-473e-a54f-321c521c4a10
--
-- Uygulama: node scripts/fix-paul-georges-remove-kulup-target.mjs --apply

begin;

do $$
declare
  v_name text;
begin
  select name into v_name from public.users where id = '6350a539-e0aa-49b7-8895-9ee572124bfe';
  if v_name is distinct from 'Paul GEORGES' then
    raise exception 'Güvenlik: 6350a539… Paul GEORGES değil (%)', v_name;
  end if;
end $$;

create temp table _paul_kulup_assign(id uuid) on commit drop;
insert into _paul_kulup_assign(id)
select ea.id
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and ea.matrix_context = 'kulup_ogretmeni';

delete from public.evaluation_responses er
where er.assignment_id in (select id from _paul_kulup_assign);

delete from public.international_standard_scores iss
where iss.assignment_id in (select id from _paul_kulup_assign);

delete from public.evaluation_assignments ea
where ea.id in (select id from _paul_kulup_assign);

delete from public.evaluation_period_evaluator_target_categories tc
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and tc.matrix_context = 'kulup_ogretmeni';

delete from public.evaluation_period_evaluator_target_scope ts
where ts.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ts.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and ts.matrix_context = 'kulup_ogretmeni';

delete from public.evaluation_period_user_duties epud
where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and epud.user_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and epud.duty_id = 'ed8f387d-ee3f-473e-a54f-321c521c4a10';

commit;

-- Doğrulama
select count(*) as paul_kulup_atama_kalan
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.target_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and ea.matrix_context = 'kulup_ogretmeni';

select count(*) as paul_kulup_gorev_kalan
from public.evaluation_period_user_duties epud
where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and epud.user_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and epud.duty_id = 'ed8f387d-ee3f-473e-a54f-321c521c4a10';
