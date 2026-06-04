-- Ebru AKTİMUR — genel değerlendirmeyi 31 kişilik onaylı listeye hizala
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Ebru ID: 63c3c8cf-df01-40f5-aaa4-1d0768b4d21d

begin;

create temp table _beklenen_ebru_genel31(match_name text) on commit drop;
insert into _beklenen_ebru_genel31(match_name) values
    ('Oğuzhan ÇETİN'),
    ('Baran YILDIZ'),
    ('Laurent CHAPDELAINE'),
    ('Yeliz ERARSLAN'),
    ('Rengin TAMKAN DOĞAN'),
    ('Farhad POURMIR'),
    ('Fadime ALPARSLAN'),
    ('Zeliha BARLAS'),
    ('Leyla CİDAL ALTINAYAR'),
    ('Elif DİVİTÇİOĞLU'),
    ('Hande KAHRAMAN'),
    ('Selin KARAKOÇ'),
    ('Elif KAZAN'),
    ('Christine KHOURY'),
    ('Stéphanie LEMAIRE'),
    ('Peggy MOREL ÖZDEMİR'),
    ('Monique SERİM'),
    ('Belgin ŞİMŞEK'),
    ('Mişelin TAGAN'),
    ('Loïc VERTUAUX'),
    ('Erhan ATASEVER'),
    ('Yonca İŞLEK'),
    ('Volkan OĞUZ'),
    ('Seda UĞUR'),
    ('Utku AYTAÇ'),
    ('Gökçe TAYLAN'),
    ('Erkan YILMAZ'),
    ('Elçin KONUK'),
    ('Zuhal KILIÇASLAN'),
    ('Didem TEKİN'),
    ('Selin YILMAZ');

create temp table _to_remove_ebru_genel31(id uuid) on commit drop;
insert into _to_remove_ebru_genel31(id)
with ebru as (
  select id from users where name = 'Ebru AKTİMUR' limit 1
)
select ea.id
from evaluation_assignments ea
join ebru e on e.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and not exists (select 1 from _beklenen_ebru_genel31 b where b.match_name = tg.name);

create temp table _to_add_ebru_genel31(target_id uuid) on commit drop;
insert into _to_add_ebru_genel31(target_id)
with ebru as (
  select id from users where name = 'Ebru AKTİMUR' limit 1
)
select tg.id as target_id
from users tg
where exists (select 1 from _beklenen_ebru_genel31 b where b.match_name = tg.name)
  and not exists (
    select 1
    from evaluation_assignments ea
    join ebru e on e.id = ea.evaluator_id
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

-- Fazla genel atamaların yanıtlarını temizle
delete from evaluation_responses er
where er.assignment_id in (select id from _to_remove_ebru_genel31);

delete from international_standard_scores iss
where iss.assignment_id in (select id from _to_remove_ebru_genel31);

-- Fazla genel atamaları sil
delete from evaluation_assignments ea
where ea.id in (select id from _to_remove_ebru_genel31);

-- Eksik iki kişiyi ekle
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  e.id,
  a.target_id,
  'genel',
  'pending'
from _to_add_ebru_genel31 a
cross join (select id from users where name = 'Ebru AKTİMUR' limit 1) e;

commit;

-- Son kontrol (31/31)
with beklenen(match_name) as (
  values
    ('Oğuzhan ÇETİN'),
    ('Baran YILDIZ'),
    ('Laurent CHAPDELAINE'),
    ('Yeliz ERARSLAN'),
    ('Rengin TAMKAN DOĞAN'),
    ('Farhad POURMIR'),
    ('Fadime ALPARSLAN'),
    ('Zeliha BARLAS'),
    ('Leyla CİDAL ALTINAYAR'),
    ('Elif DİVİTÇİOĞLU'),
    ('Hande KAHRAMAN'),
    ('Selin KARAKOÇ'),
    ('Elif KAZAN'),
    ('Christine KHOURY'),
    ('Stéphanie LEMAIRE'),
    ('Peggy MOREL ÖZDEMİR'),
    ('Monique SERİM'),
    ('Belgin ŞİMŞEK'),
    ('Mişelin TAGAN'),
    ('Loïc VERTUAUX'),
    ('Erhan ATASEVER'),
    ('Yonca İŞLEK'),
    ('Volkan OĞUZ'),
    ('Seda UĞUR'),
    ('Utku AYTAÇ'),
    ('Gökçe TAYLAN'),
    ('Erkan YILMAZ'),
    ('Elçin KONUK'),
    ('Zuhal KILIÇASLAN'),
    ('Didem TEKİN'),
    ('Selin YILMAZ')
),
db_genel as (
  select tg.name
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Ebru AKTİMUR'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select
  (select count(*) from beklenen) as beklenen,
  (select count(*) from db_genel) as db,
  (select count(*) from beklenen b where not exists (select 1 from db_genel d where d.name = b.match_name)) as eksik,
  (select count(*) from db_genel d where not exists (select 1 from beklenen b where b.match_name = d.name)) as fazla;

