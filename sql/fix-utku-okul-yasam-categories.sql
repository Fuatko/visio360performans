-- Utku Aytaç: okul_yasam hedeflerine 4 kategori kapsamı (atama eklemez)
-- Dönem: 2026 EĞİTMEN_İŞ PERFORMANS DEĞ.

begin;

delete from evaluation_period_evaluator_target_categories
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and matrix_context = 'okul_yasam'
  and scope_kind = 'period';

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
    ('24265170-2255-4e21-942e-4a70f4e0dd50'::uuid), -- Veli İletişimi
    ('3361c52e-abd5-4c9f-b758-defb70a22b51'::uuid), -- Öğrenci İlişkileri ve Empati
    ('716e059d-121c-47cc-9c5a-b565a566e9d5'::uuid)  -- Proje, Etkinlik ve Kurumsal Katkı
) as cats(cid)
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and s.evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and s.matrix_context = 'okul_yasam'
on conflict do nothing;

update evaluation_period_evaluator_target_scope
set restrict_period = true, duty_mode = 'none', updated_at = now()
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and matrix_context = 'okul_yasam';

commit;

-- Doğrulama
select count(distinct tc.category_id) as kategori_sayisi,
  array_agg(distinct cs.name order by cs.name) as kategoriler
from evaluation_period_evaluator_target_categories tc
left join evaluation_period_categories_snapshot cs on cs.id::text = tc.category_id::text
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = 'a4660428-7f1d-4cf8-8bfe-8c36b10dd48c'
  and tc.matrix_context = 'okul_yasam';
