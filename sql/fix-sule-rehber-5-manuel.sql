-- Şule KOÇAK — rehberlik_ogretmeni: 5 kişi (kendini değerlendirmez)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Rehberlik Zümre Başkanı ekip içi rehber öğretmen değerlendirmesi

begin;

create temp table _beklenen_sule_rehber5(name text) on commit drop;
insert into _beklenen_sule_rehber5(name) values
  ('Elçin KONUK'),
  ('Sevcan ÖZKILINÇ'),
  ('Doruk ATIŞKAN'),
  ('Tolga ÇAKIROĞLU'),
  ('Murat KAZANOĞLU');

create temp table _to_remove_sule_rehber5(id uuid) on commit drop;
insert into _to_remove_sule_rehber5(id)
select ea.id
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
join users ev on ev.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Şule KOÇAK'
  and ea.matrix_context = 'rehberlik_ogretmeni'
  and (
    tg.name = 'Şule KOÇAK'
    or not exists (select 1 from _beklenen_sule_rehber5 b where b.name = tg.name)
  );

create temp table _to_add_sule_rehber5(target_id uuid) on commit drop;
insert into _to_add_sule_rehber5(target_id)
select tg.id
from users tg
where exists (select 1 from _beklenen_sule_rehber5 b where b.name = tg.name)
  and tg.name <> 'Şule KOÇAK'
  and not exists (
    select 1
    from evaluation_assignments ea
    join users ev on ev.id = ea.evaluator_id
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ev.name = 'Şule KOÇAK'
      and ea.target_id = tg.id
      and ea.matrix_context = 'rehberlik_ogretmeni'
  );

delete from evaluation_responses er
where er.assignment_id in (select id from _to_remove_sule_rehber5);

delete from international_standard_scores iss
where iss.assignment_id in (select id from _to_remove_sule_rehber5);

delete from evaluation_assignments ea
where ea.id in (select id from _to_remove_sule_rehber5);

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  a.target_id,
  'rehberlik_ogretmeni',
  'pending'
from _to_add_sule_rehber5 a
cross join (select id from users where name = 'Şule KOÇAK' limit 1) ev;

with db_rehber as (
  select tg.name
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Şule KOÇAK'
    and ea.matrix_context = 'rehberlik_ogretmeni'
)
select
  (select count(*) from _beklenen_sule_rehber5) as beklenen,
  (select count(*) from db_rehber) as db,
  (select count(*) from _beklenen_sule_rehber5 b where not exists (select 1 from db_rehber d where d.name = b.name)) as eksik,
  (select count(*) from db_rehber d where not exists (select 1 from _beklenen_sule_rehber5 b where b.name = d.name)) as fazla;

commit;

-- Liste (commit sonrası)
select u.name as hedef
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users u on u.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Şule KOÇAK'
  and ea.matrix_context = 'rehberlik_ogretmeni'
order by u.name;
