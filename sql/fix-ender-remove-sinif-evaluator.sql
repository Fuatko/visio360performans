-- Ender ÜSTÜNGEL — değerlendirici olarak sınıf öğretmeni matrisi kaldırılır
-- (Paul / Şule sınıf atamaları etkilenmez)
--
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Ender: 5ec438f5-1eb2-41a0-ab19-4b2a549991cd
--
-- Uygulama: node scripts/fix-ender-remove-sinif-evaluator.mjs --apply

begin;

do $$
declare
  v_name text;
begin
  select name into v_name from public.users where id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd';
  if v_name is distinct from 'Ender ÜSTÜNGEL' then
    raise exception 'Güvenlik: 5ec438f5… Ender ÜSTÜNGEL değil (%)', v_name;
  end if;
end $$;

create temp table _ender_sinif_assign(id uuid) on commit drop;
insert into _ender_sinif_assign(id)
select ea.id
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
  and ea.matrix_context = 'sinif_ogretmeni';

delete from public.evaluation_responses er
where er.assignment_id in (select id from _ender_sinif_assign);

delete from public.international_standard_scores iss
where iss.assignment_id in (select id from _ender_sinif_assign);

delete from public.evaluation_assignments ea
where ea.id in (select id from _ender_sinif_assign);

delete from public.evaluation_period_evaluator_target_categories tc
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
  and tc.matrix_context = 'sinif_ogretmeni';

delete from public.evaluation_period_evaluator_target_scope ts
where ts.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ts.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
  and ts.matrix_context = 'sinif_ogretmeni';

commit;

select count(*) as ender_sinif_kalan
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
  and ea.matrix_context = 'sinif_ogretmeni';
