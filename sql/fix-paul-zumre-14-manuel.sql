-- Paul GEORGES — zümre matrisi manuel 14 kişi listesine göre hizalama
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Paul ID: 6350a539-e0aa-49b7-8895-9ee572124bfe
--
-- Görselden okunan zümre listesi (14):
-- Onur ERMAN, Yeliz ERARSLAN, Ayhan YAĞIZ, Altan KILIÇ, Ebru AKTİMUR,
-- Stanislaw EON DU VAL, Peggy MOREL ÖZDEMİR, Yonca İŞLEK, Berna BENER,
-- Gökçe TAYLAN, Erkan YILMAZ, Şule KOÇAK, Gökhan BÜYÜKENGEZ, Zeynep DEDEBAŞ

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
  select u.id, u.name
  from users u
  join manuel_zumre m on m.name = u.name
)
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '6350a539-e0aa-49b7-8895-9ee572124bfe',
  m.id,
  'zumre',
  'pending'
from matches m
where not exists (
  select 1 from evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
    and ea.target_id = m.id
    and ea.matrix_context = 'zumre'
);

commit;

-- Doğrulama: manuel 14 listeye göre eksik/fazla
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
paul_zumre as (
  select distinct u.name
  from evaluation_assignments ea
  join users u on u.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
    and ea.matrix_context = 'zumre'
)
select 'SAYIM' as rapor, null::text as isim,
  format(
    'manuel=%s, paul=%s, eksik=%s, fazla=%s',
    (select count(*) from manuel_zumre),
    (select count(*) from paul_zumre),
    (select count(*) from manuel_zumre m where not exists (select 1 from paul_zumre p where p.name = m.name)),
    (select count(*) from paul_zumre p where not exists (select 1 from manuel_zumre m where m.name = p.name))
  ) as detay
union all
select 'EKSIK', m.name, 'Manuel listede var, Paul zümrede yok'
from manuel_zumre m
where not exists (select 1 from paul_zumre p where p.name = m.name)
union all
select 'FAZLA', p.name, 'Paul zümrede var, manuel listede yok'
from paul_zumre p
where not exists (select 1 from manuel_zumre m where m.name = p.name)
order by rapor, isim nulls first;

