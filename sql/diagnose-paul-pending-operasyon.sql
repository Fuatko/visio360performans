-- Paul GEORGES — operasyonel özet (bekleyen / yarım kalan / genel hedef listesi)
-- period_id: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- Paul: 6350a539-e0aa-49b7-8895-9ee572124bfe

-- 1) Bekleyen dağılım (matrix_context)
select
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  count(*) as bekleyen
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and ea.status <> 'completed'
group by coalesce(ea.matrix_context, 'genel')
order by bekleyen desc, matrix_context;

-- 2) Tamamlanan özeti
select
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  count(*) as tamamlanan
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and ea.status = 'completed'
group by coalesce(ea.matrix_context, 'genel')
order by tamamlanan desc;

-- 3) Yarım kalan: pending + en az 1 evaluation_responses satırı
select
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  count(*) as yarim_kalan
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and ea.status <> 'completed'
  and exists (
    select 1 from public.evaluation_responses er where er.assignment_id = ea.id
  )
group by coalesce(ea.matrix_context, 'genel')
order by yarim_kalan desc;

select
  tg.name as hedef,
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  count(distinct er.question_id) as cevaplanan_soru,
  count(er.id) as response_satir,
  ea.id as assignment_id,
  ea.slug
from public.evaluation_assignments ea
join public.users tg on tg.id = ea.target_id
join public.evaluation_responses er on er.assignment_id = ea.id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and ea.status <> 'completed'
group by tg.name, ea.matrix_context, ea.id, ea.slug
order by matrix_context, cevaplanan_soru desc, hedef;

-- 4) Bekleyen GENEL — tüm hedef listesi (85)
select
  tg.name as hedef,
  ea.status,
  ea.id as assignment_id,
  ea.slug,
  exists (
    select 1 from public.evaluation_responses er where er.assignment_id = ea.id
  ) as baslamis,
  (
    select count(distinct er.question_id)
    from public.evaluation_responses er
    where er.assignment_id = ea.id
  ) as cevaplanan_soru
from public.evaluation_assignments ea
join public.users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and ea.status <> 'completed'
order by baslamis desc, cevaplanan_soru desc, tg.name;

-- 5) Bekleyen GENEL — sadece başlamış olanlar
select
  tg.name as hedef,
  count(distinct er.question_id) as cevaplanan_soru,
  ea.id as assignment_id
from public.evaluation_assignments ea
join public.users tg on tg.id = ea.target_id
join public.evaluation_responses er on er.assignment_id = ea.id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and ea.status <> 'completed'
group by tg.name, ea.id
order by cevaplanan_soru desc, hedef;

-- 6) Ender vs Paul genel hedef parity (eksik/fazla)
with paul_genel as (
  select ea.target_id
  from public.evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
    and coalesce(ea.matrix_context, 'genel') = 'genel'
),
ender_genel as (
  select ea.target_id
  from public.evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'::uuid
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select 'Paul''da eksik (Ender''de var)' as tip, u.name as hedef
from ender_genel e
left join paul_genel p on p.target_id = e.target_id
join public.users u on u.id = e.target_id
where p.target_id is null
union all
select 'Paul''da fazla (Ender''de yok)' as tip, u.name as hedef
from paul_genel p
left join ender_genel e on e.target_id = p.target_id
join public.users u on u.id = p.target_id
where e.target_id is null
order by tip, hedef;
