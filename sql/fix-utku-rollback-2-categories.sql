-- ACİL: Utku Aytaç — 9 kategori / genel görünüm geri al → yalnızca 2 kategori
-- Dönem: 2026 EĞİTMEN_İŞ PERFORMANS DEĞ. (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Varsayılan 2 kategori: Teknolojik Yetkinlikler + Veli İletişimi
-- (Excel’de farklı 2 kategori ise UUID’leri değiştirin)

begin;

-- Yanlışlıkla eklenmiş genel atamalar (varsa)
delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
    and coalesce(matrix_context, 'genel') = 'genel'
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and coalesce(matrix_context, 'genel') = 'genel';

-- Öz değerlendirme (varsa)
delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
    and evaluator_id = target_id
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and evaluator_id = target_id;

-- Tüm yanlış kategori linklerini temizle (okul_yasam)
delete from evaluation_period_evaluator_target_categories
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and matrix_context = 'okul_yasam';

-- Yalnızca 2 kategori
insert into evaluation_period_evaluator_target_categories
  (period_id, evaluator_id, target_id, matrix_context, category_id, scope_kind, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c',
  s.target_id,
  'okul_yasam',
  cid,
  'period',
  true
from evaluation_period_evaluator_target_scope s
cross join (
  values
    ('2d2a0881-ac59-43af-b43b-d65df3593475'::uuid), -- Teknolojik Yetkinlikler
    ('24265170-2255-4e21-942e-4a70f4e0dd50'::uuid)  -- Veli İletişimi
) as cats(cid)
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and s.evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and s.matrix_context = 'okul_yasam';

update evaluation_period_evaluator_target_scope
set restrict_period = true, duty_mode = 'none', updated_at = now()
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and matrix_context = 'okul_yasam';

commit;

select count(distinct category_id) as kategori_sayisi,
  array_agg(distinct cs.name order by cs.name) as kategoriler
from evaluation_period_evaluator_target_categories tc
left join evaluation_period_categories_snapshot cs on cs.id::text = tc.category_id::text
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and tc.matrix_context = 'okul_yasam';
