-- Onur ERMAN & Ayşegül KAZMAZ: genel değerlendirmede yalnızca 5 dönem kategorisi
-- (yaşam koordinatörü + kulüp ayrı matris kartlarında kalır)
-- Değerlendirenler: Paul GEORGES, Ender ÜSTÜNGEL, Şule KOÇAK
-- Referans: Ayşegül → Onur genel kapsamı (5 kategori)

begin;

delete from evaluation_period_evaluator_target_categories
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id in (
    '6350a539-e0aa-49b7-8895-9ee572124bfe',
    '5ec438f5-1eb2-41a0-ab19-4b2a549991cd',
    '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
  )
  and target_id in ('83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679', '9db639d7-e80b-415b-90d1-b7f9e65fa6c2')
  and matrix_context = 'genel'
  and scope_kind = 'period';

insert into evaluation_period_evaluator_target_scope
  (period_id, evaluator_id, target_id, matrix_context, restrict_period, duty_mode, duty_package_ids, updated_at)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.evaluator_id,
  tg.target_id,
  'genel',
  true,
  'none',
  '{}'::uuid[],
  now()
from (
  values
    ('6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid),
    ('5ec438f5-1eb2-41a0-ab19-4b2a549991cd'::uuid),
    ('6b73c2a6-afb2-437d-b9cc-1c789e13344c'::uuid)
) as ev(evaluator_id)
cross join (
  values
    ('83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679'::uuid),
    ('9db639d7-e80b-415b-90d1-b7f9e65fa6c2'::uuid)
) as tg(target_id)
where exists (
  select 1 from evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = ev.evaluator_id
    and ea.target_id = tg.target_id
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
on conflict (period_id, evaluator_id, target_id, matrix_context)
do update set
  restrict_period = true,
  duty_mode = 'none',
  duty_package_ids = '{}'::uuid[],
  updated_at = now();

insert into evaluation_period_evaluator_target_categories
  (period_id, evaluator_id, target_id, matrix_context, category_id, scope_kind, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.evaluator_id,
  tg.target_id,
  'genel',
  cid,
  'period',
  true
from (
  values
    ('6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid),
    ('5ec438f5-1eb2-41a0-ab19-4b2a549991cd'::uuid),
    ('6b73c2a6-afb2-437d-b9cc-1c789e13344c'::uuid)
) as ev(evaluator_id)
cross join (
  values
    ('83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679'::uuid),
    ('9db639d7-e80b-415b-90d1-b7f9e65fa6c2'::uuid)
) as tg(target_id)
cross join (
  values
    ('a41e0b6b-d9f0-476b-aac1-ec7265813643'::uuid), -- Mesleki Sorumluluk
    ('24265170-2255-4e21-942e-4a70f4e0dd50'::uuid), -- Veli İletişimi
    ('3361c52e-abd5-4c9f-b758-defb70a22b51'::uuid), -- Öğrenci İlişkileri ve Empati
    ('716e059d-121c-47cc-9c5a-b565a566e9d5'::uuid), -- Proje, Etkinlik ve Kurumsal Katkı
    ('1bbd8465-51d5-47bc-9fbe-eb67701d9d42'::uuid)  -- Kurum İçi İletişim ve İşbirliği
) as cats(cid)
where exists (
  select 1 from evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = ev.evaluator_id
    and ea.target_id = tg.target_id
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
on conflict do nothing;

commit;

-- Doğrulama
select ev.name as degerlendiren, tg.name as hedef,
  (select count(*) from evaluation_period_evaluator_target_categories tc
   where tc.period_id = s.period_id and tc.evaluator_id = s.evaluator_id and tc.target_id = s.target_id
     and tc.matrix_context = 'genel' and tc.scope_kind = 'period') as kategori_sayisi,
  array_agg(cs.name order by cs.sort_order) as kategoriler
from evaluation_period_evaluator_target_scope s
join users ev on ev.id = s.evaluator_id
join users tg on tg.id = s.target_id
join evaluation_period_evaluator_target_categories tc
  on tc.period_id = s.period_id and tc.evaluator_id = s.evaluator_id and tc.target_id = s.target_id
  and tc.matrix_context = s.matrix_context and tc.scope_kind = 'period'
join evaluation_period_categories_snapshot cs on cs.id::text = tc.category_id::text
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and s.matrix_context = 'genel'
  and ev.name in ('Paul GEORGES', 'Ender ÜSTÜNGEL', 'Şule KOÇAK')
  and tg.name in ('Onur ERMAN', 'Ayşegül KAZMAZ')
group by ev.name, tg.name, s.period_id, s.evaluator_id, s.target_id
order by 1, 2;
