-- Berna SÖĞÜTLÜ hedef kontrolü
-- Beklenen:
--   genel = 36
--   zumre = 14
--   kulup_ogretmeni = 47
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Berna ID: e6d63576-949b-480a-b19a-c7113f0bee01

-- 1) Hedef sayılar (tek satır)
select
  count(*) filter (where coalesce(matrix_context, 'genel') = 'genel') as genel,
  count(*) filter (where matrix_context = 'zumre') as zumre,
  count(*) filter (where matrix_context = 'kulup_ogretmeni') as kulup_ogretmeni
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01';

-- 2) Zümre 14 manuel listeye göre eksik/fazla
with expected(name) as (
  values
    ('Ebru AKTİMUR'),
    ('Altan KILIÇ'),
    ('Ayhan YAĞIZ'),
    ('Berna BENER'),
    ('Gökçe TAYLAN'),
    ('Gökhan BÜYÜKENGEZ'),
    ('Onur ERMAN'),
    ('Peggy MOREL ÖZDEMİR'),
    ('Stanislaw EON DU VAL'),
    ('Şule KOÇAK'),
    ('Yeliz ERARSLAN'),
    ('Yonca İŞLEK'),
    ('Zeynep DEDEBAŞ'),
    ('Erkan YILMAZ')
),
assigned as (
  select tg.name
  from evaluation_assignments ea
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
    and ea.matrix_context = 'zumre'
)
select 'ZUMRE_EKSIK' as rapor, e.name
from expected e
where not exists (select 1 from assigned a where a.name = e.name)
union all
select 'ZUMRE_FAZLA', a.name
from assigned a
where not exists (select 1 from expected e where e.name = a.name)
order by 1, 2;

-- 3) Kulüp 47 kontrolü (görev tabanı + Paul LAFORGE dahil, self hariç)
with duty_kulup as (
  select distinct epud.user_id
  from evaluation_period_user_duties epud
  join evaluation_duties d on d.id = epud.duty_id
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and (lower(d.name) like '%kulüp%' or lower(d.name) like '%kulup%')
),
paul_laforge as (
  select id from users where name = 'Paul LAFORGE' limit 1
),
expected as (
  select user_id as target_id from duty_kulup
  union
  select id from paul_laforge
),
expected_filtered as (
  select target_id
  from expected
  where target_id <> 'e6d63576-949b-480a-b19a-c7113f0bee01'::uuid
),
assigned as (
  select distinct target_id
  from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
    and matrix_context = 'kulup_ogretmeni'
)
select
  (select count(*) from expected_filtered) as kulup_beklenen,
  (select count(*) from assigned) as kulup_atanan,
  (select count(*) from expected_filtered e where not exists (select 1 from assigned a where a.target_id = e.target_id)) as kulup_eksik,
  (select count(*) from assigned a where not exists (select 1 from expected_filtered e where e.target_id = a.target_id)) as kulup_fazla;

-- 4) Genel isim listesi (36 hedefi gözle doğrulamak için)
select tg.name as genel_hedef
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
order by tg.name;

