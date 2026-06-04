-- Paul GEORGES ↔ Ender ÜSTÜNGEL — yan görev (matrix_context) karşılaştırması
-- Genel hariç veya dahil; Supabase'de dosyanın tamamını çalıştırın.
--
-- SADECE okuma / teşhis. Paul LAFORGE'a dokunmaz.
-- Paul GEORGES: 6350a539-e0aa-49b7-8895-9ee572124bfe
-- Ender ÜSTÜNGEL: 5ec438f5-1eb2-41a0-ab19-4b2a549991cd

-- 1) Görev bağlamına göre satır sayıları (Paul vs Ender)
select
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  count(*) filter (where ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe') as paul_n,
  count(*) filter (where ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd') as ender_n,
  count(*) filter (where ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe')
    - count(*) filter (where ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd') as paul_minus_ender
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id in (
    '6350a539-e0aa-49b7-8895-9ee572124bfe',
    '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
  )
group by coalesce(ea.matrix_context, 'genel')
order by matrix_context;

-- 2) Özet: yan görevler (genel dışı) toplam
select
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  count(*) filter (where ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe') as paul_n,
  count(*) filter (where ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd') as ender_n
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id in (
    '6350a539-e0aa-49b7-8895-9ee572124bfe',
    '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
  )
  and coalesce(ea.matrix_context, 'genel') <> 'genel'
group by 1
having count(*) filter (where ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe')
    <> count(*) filter (where ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd')
order by matrix_context;

-- 3) Ender'de var, Paul'da yok (eksik — ilk 50)
with ender_pairs as (
  select distinct
    ea.target_id,
    coalesce(ea.matrix_context, 'genel') as matrix_context
  from public.evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'::uuid
),
paul_pairs as (
  select distinct
    ea.target_id,
    coalesce(ea.matrix_context, 'genel') as matrix_context
  from public.evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
)
select
  e.matrix_context,
  u.name as hedef,
  'Paul eksik' as durum
from ender_pairs e
join public.users u on u.id = e.target_id
where not exists (
  select 1 from paul_pairs p
  where p.target_id = e.target_id and p.matrix_context = e.matrix_context
)
order by e.matrix_context, u.name
limit 50;

-- 4) Paul'da var, Ender'de yok (fazla — ilk 50)
with ender_pairs as (
  select distinct ea.target_id, coalesce(ea.matrix_context, 'genel') as matrix_context
  from public.evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'::uuid
),
paul_pairs as (
  select distinct ea.target_id, coalesce(ea.matrix_context, 'genel') as matrix_context
  from public.evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
)
select
  p.matrix_context,
  u.name as hedef,
  'Paul fazla' as durum
from paul_pairs p
join public.users u on u.id = p.target_id
where not exists (
  select 1 from ender_pairs e
  where e.target_id = p.target_id and e.matrix_context = p.matrix_context
)
order by p.matrix_context, u.name
limit 50;

-- 5) Bekleyen / tamamlanan (Paul, yan görev)
select
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  count(*) filter (where ea.status = 'completed') as paul_completed,
  count(*) filter (where ea.status <> 'completed') as paul_pending
from public.evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid
  and coalesce(ea.matrix_context, 'genel') <> 'genel'
group by 1
order by 1;
