-- Berna SÖĞÜTLÜ — genel değerlendirmeyi 36 kişilik güncel listeye hizala
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Berna ID: e6d63576-949b-480a-b19a-c7113f0bee01

begin;

create temp table _beklenen_berna_genel36(name text) on commit drop;
insert into _beklenen_berna_genel36(name) values
  ('Oğuzhan ÇETİN'),
  ('Gülen ERMAN'),
  ('Baran YILDIZ'),
  ('Tanya ERGÜNEŞ UĞUR'),
  ('Simge ŞENAY'),
  ('Şükran TOY'),
  ('Ayhan YAĞIZ'),
  ('Gökhan KARAMAN'),
  ('Uğur ÖZEN'),
  ('Jean-Marie DOLL'),
  ('Charbel JBEILY'),
  ('Farhad POURMIR'),
  ('Dilara ADAŞ'),
  ('Cécile BLANC'),
  ('Elif DİVİTÇİOĞLU'),
  ('Şeyma DOĞRUER'),
  ('Stanislaw EON DU VAL'),
  ('Stéphanie LEMAIRE'),
  ('Mişelin TAGAN'),
  ('Erhan ATASEVER'),
  ('Yonca İŞLEK'),
  ('Seda UĞUR'),
  ('Ilgın AYDIN'),
  ('Maral BASMA'),
  ('Binnaz BAYRAK ONUR'),
  ('Utku AYTAÇ'),
  ('Patrice CARINO'),
  ('Şahan İZGİ'),
  ('Arman KOMBIYIKYAN'),
  ('Gülnur TİRYAKİ'),
  ('Şule YENAL'),
  ('Sabriye ÇAVDARCIOĞLU TOPUZ'),
  ('Elif CANDEMİR'),
  ('Dilek KARAYAĞIZ'),
  ('Zuhal KILIÇASLAN'),
  ('Didem TEKİN');

create temp table _to_remove_berna_genel36(id uuid) on commit drop;
insert into _to_remove_berna_genel36(id)
select ea.id
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and not exists (select 1 from _beklenen_berna_genel36 b where b.name = tg.name);

create temp table _to_add_berna_genel36(target_id uuid) on commit drop;
insert into _to_add_berna_genel36(target_id)
select tg.id
from users tg
where exists (select 1 from _beklenen_berna_genel36 b where b.name = tg.name)
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
      and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

delete from evaluation_responses er
where er.assignment_id in (select id from _to_remove_berna_genel36);

delete from international_standard_scores iss
where iss.assignment_id in (select id from _to_remove_berna_genel36);

delete from evaluation_assignments ea
where ea.id in (select id from _to_remove_berna_genel36);

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  'e6d63576-949b-480a-b19a-c7113f0bee01',
  a.target_id,
  'genel',
  'pending'
from _to_add_berna_genel36 a;

-- commit öncesi kontrol
with db_genel as (
  select tg.name
  from evaluation_assignments ea
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select
  (select count(*) from _beklenen_berna_genel36) as beklenen,
  (select count(*) from db_genel) as db,
  (select count(*) from _beklenen_berna_genel36 b where not exists (select 1 from db_genel d where d.name = b.name)) as eksik,
  (select count(*) from db_genel d where not exists (select 1 from _beklenen_berna_genel36 b where b.name = d.name)) as fazla;

commit;

