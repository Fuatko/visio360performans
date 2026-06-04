-- Peggy MOREL ÖZDEMİR — genel değerlendirmeyi 15 kişilik listeye hizala
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

begin;

create temp table _beklenen_peggy_genel15(name text) on commit drop;
insert into _beklenen_peggy_genel15(name) values
  ('Fadime ALPARSLAN'),
  ('Zeliha BARLAS'),
  ('Leyla CİDAL ALTINAYAR'),
  ('Marie Christine ÇANLI'),
  ('Eléonore DE BEAUMONT'),
  ('Elif DİVİTÇİOĞLU'),
  ('Hande KAHRAMAN'),
  ('Selin KARAKOÇ'),
  ('Elif KAZAN'),
  ('Christine KHOURY'),
  ('Stéphanie LEMAIRE'),
  ('Monique SERİM'),
  ('Belgin ŞİMŞEK'),
  ('Mişelin TAGAN'),
  ('Loïc VERTUAUX');

create temp table _to_remove_peggy_genel15(id uuid) on commit drop;
insert into _to_remove_peggy_genel15(id)
select ea.id
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
join users ev on ev.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Peggy MOREL ÖZDEMİR'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and not exists (select 1 from _beklenen_peggy_genel15 b where b.name = tg.name);

create temp table _to_add_peggy_genel15(target_id uuid) on commit drop;
insert into _to_add_peggy_genel15(target_id)
select tg.id
from users tg
where exists (select 1 from _beklenen_peggy_genel15 b where b.name = tg.name)
  and not exists (
    select 1
    from evaluation_assignments ea
    join users ev on ev.id = ea.evaluator_id
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ev.name = 'Peggy MOREL ÖZDEMİR'
      and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

delete from evaluation_responses er
where er.assignment_id in (select id from _to_remove_peggy_genel15);

delete from international_standard_scores iss
where iss.assignment_id in (select id from _to_remove_peggy_genel15);

delete from evaluation_assignments ea
where ea.id in (select id from _to_remove_peggy_genel15);

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  a.target_id,
  'genel',
  'pending'
from _to_add_peggy_genel15 a
cross join (select id from users where name = 'Peggy MOREL ÖZDEMİR' limit 1) ev;

-- kontrol (commit öncesi)
with db_genel as (
  select tg.name
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Peggy MOREL ÖZDEMİR'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select
  (select count(*) from _beklenen_peggy_genel15) as beklenen,
  (select count(*) from db_genel) as db,
  (select count(*) from _beklenen_peggy_genel15 b where not exists (select 1 from db_genel d where d.name = b.name)) as eksik,
  (select count(*) from db_genel d where not exists (select 1 from _beklenen_peggy_genel15 b where b.name = d.name)) as fazla;

commit;

