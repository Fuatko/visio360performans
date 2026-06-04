-- Gülnaz PEKİN — genel değerlendirmeyi 32 kişilik güncel listeye hizala
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Gülnaz ID: b70802b2-6c38-4461-b30b-2af73f2e58e6

begin;

create temp table _beklenen_gulnaz_genel32(match_name text) on commit drop;
insert into _beklenen_gulnaz_genel32(match_name) values
  ('Oğuzhan ÇETİN'),
  ('Gülen ERMAN'),
  ('Tanya ERGÜNEŞ UĞUR'),
  ('Simge ŞENAY'),
  ('Şükran TOY'),
  ('Ayhan YAĞIZ'),
  ('Gökhan KARAMAN'),
  ('Altan KILIÇ'),
  ('Charbel JBEILY'),
  ('Farhad POURMIR'),
  ('Zeliha BARLAS'),
  ('Leyla CİDAL ALTINAYAR'),
  ('Marie Christine ÇANLI'),
  ('Eléonore DE BEAUMONT'),
  ('Hande KAHRAMAN'),
  ('Selin KARAKOÇ'),
  ('Elif KAZAN'),
  ('Belgin ŞİMŞEK'),
  ('Loïc VERTUAUX'),
  ('Volkan OĞUZ'),
  ('Ilgın AYDIN'),
  ('Berna BENER'),
  ('Binnaz BAYRAK ONUR'),
  ('Şahan İZGİ'),
  ('Nesrin KARAKAŞ'),
  ('Gökçe TAYLAN'),
  ('Erkan YILMAZ'),
  ('Tunç ÖNDEMİR'),
  ('Didem KANDİL'),
  ('Özcan AKÇAKAYA'),
  ('Dilek KARAYAĞIZ'),
  ('Selin YILMAZ');

create temp table _to_remove_gulnaz_genel32(id uuid) on commit drop;
insert into _to_remove_gulnaz_genel32(id)
select ea.id
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and not exists (select 1 from _beklenen_gulnaz_genel32 b where b.match_name = tg.name);

create temp table _to_add_gulnaz_genel32(target_id uuid) on commit drop;
insert into _to_add_gulnaz_genel32(target_id)
select tg.id
from users tg
where exists (select 1 from _beklenen_gulnaz_genel32 b where b.match_name = tg.name)
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
      and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

-- Fazla genel atamaların yanıtlarını temizle
delete from evaluation_responses er
where er.assignment_id in (select id from _to_remove_gulnaz_genel32);

delete from international_standard_scores iss
where iss.assignment_id in (select id from _to_remove_gulnaz_genel32);

-- Fazla genel atamaları sil
delete from evaluation_assignments ea
where ea.id in (select id from _to_remove_gulnaz_genel32);

-- Eksikleri ekle
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  'b70802b2-6c38-4461-b30b-2af73f2e58e6',
  a.target_id,
  'genel',
  'pending'
from _to_add_gulnaz_genel32 a;

-- Son kontrol (commit öncesi)
with db_genel as (
  select tg.name
  from evaluation_assignments ea
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select
  (select count(*) from _beklenen_gulnaz_genel32) as beklenen,
  (select count(*) from db_genel) as db,
  (select count(*) from _beklenen_gulnaz_genel32 b where not exists (select 1 from db_genel d where d.name = b.match_name)) as eksik,
  (select count(*) from db_genel d where not exists (select 1 from _beklenen_gulnaz_genel32 b where b.match_name = d.name)) as fazla;

commit;

