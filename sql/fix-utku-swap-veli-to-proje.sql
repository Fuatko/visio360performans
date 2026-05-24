-- Utku: Veli İletişimi → Proje, Etkinlik ve Kurumsal Katkı (Teknolojik kalır)
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6

begin;

delete from evaluation_period_evaluator_target_categories
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and matrix_context = 'okul_yasam'
  and category_id = '24265170-2255-4e21-942e-4a70f4e0dd50'; -- Veli İletişimi

insert into evaluation_period_evaluator_target_categories
  (period_id, evaluator_id, target_id, matrix_context, category_id, scope_kind, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c',
  s.target_id,
  'okul_yasam',
  '716e059d-121c-47cc-9c5a-b565a566e9d5'::uuid,
  'period',
  true
from evaluation_period_evaluator_target_scope s
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and s.evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and s.matrix_context = 'okul_yasam'
on conflict do nothing;

commit;

select count(distinct category_id) as kategori_sayisi,
  array_agg(distinct cs.name order by cs.name) as kategoriler
from evaluation_period_evaluator_target_categories tc
left join evaluation_period_categories_snapshot cs on cs.id::text = tc.category_id::text and cs.period_id = tc.period_id
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and tc.matrix_context = 'okul_yasam';
