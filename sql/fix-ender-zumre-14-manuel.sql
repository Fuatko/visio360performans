-- Ender ÜSTÜNGEL — zümre matrisi manuel 14 kişi listesine hizalama
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Ender ID: 5ec438f5-1eb2-41a0-ab19-4b2a549991cd

begin;

with manuel_zumre(name) as (
  values
    ('Onur ERMAN'),
    ('Yeliz ERARSLAN'),
    ('Ayhan YAĞIZ'),
    ('Altan KILIÇ'),
    ('Ebru AKTİMUR'),
    ('Stanislaw EON DU VAL'),
    ('Peggy MOREL ÖZDEMİR'),
    ('Yonca İŞLEK'),
    ('Berna BENER'),
    ('Gökçe TAYLAN'),
    ('Erkan YILMAZ'),
    ('Şule KOÇAK'),
    ('Gökhan BÜYÜKENGEZ'),
    ('Zeynep DEDEBAŞ')
),
matches as (
  select u.id
  from users u
  join manuel_zumre m on m.name = u.name
)
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '5ec438f5-1eb2-41a0-ab19-4b2a549991cd',
  m.id,
  'zumre',
  'pending'
from matches m
where not exists (
  select 1
  from evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
    and ea.target_id = m.id
    and ea.matrix_context = 'zumre'
);

commit;

-- Doğrulama
with manuel_zumre(name) as (
  values
    ('Onur ERMAN'),
    ('Yeliz ERARSLAN'),
    ('Ayhan YAĞIZ'),
    ('Altan KILIÇ'),
    ('Ebru AKTİMUR'),
    ('Stanislaw EON DU VAL'),
    ('Peggy MOREL ÖZDEMİR'),
    ('Yonca İŞLEK'),
    ('Berna BENER'),
    ('Gökçe TAYLAN'),
    ('Erkan YILMAZ'),
    ('Şule KOÇAK'),
    ('Gökhan BÜYÜKENGEZ'),
    ('Zeynep DEDEBAŞ')
),
ender_zumre as (
  select distinct u.name
  from evaluation_assignments ea
  join users u on u.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
    and ea.matrix_context = 'zumre'
)
select 'SAYIM' as rapor, null::text as isim,
  format(
    'manuel=%s, ender=%s, eksik=%s, fazla=%s',
    (select count(*) from manuel_zumre),
    (select count(*) from ender_zumre),
    (select count(*) from manuel_zumre m where not exists (select 1 from ender_zumre e where e.name = m.name)),
    (select count(*) from ender_zumre e where not exists (select 1 from manuel_zumre m where m.name = e.name))
  ) as detay
union all
select 'EKSIK', m.name, 'Manuel listede var, Ender zümrede yok'
from manuel_zumre m
where not exists (select 1 from ender_zumre e where e.name = m.name)
union all
select 'FAZLA', e.name, 'Ender zümrede var, manuel listede yok'
from ender_zumre e
where not exists (select 1 from manuel_zumre m where m.name = e.name)
order by 1, 2 nulls first;

