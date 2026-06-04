-- Paul GEORGES — rehberlik_ogretmeni düzeltmesi
-- Hatalı hedef: Şule YENAL
-- Doğru hedef: Şule KOÇAK
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

begin;

create temp table _to_remove_paul_rehber(id uuid) on commit drop;
insert into _to_remove_paul_rehber(id)
select ea.id
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Paul GEORGES'
  and ea.matrix_context = 'rehberlik_ogretmeni'
  and tg.name = 'Şule YENAL';

delete from evaluation_responses er
where er.assignment_id in (select id from _to_remove_paul_rehber);

delete from international_standard_scores iss
where iss.assignment_id in (select id from _to_remove_paul_rehber);

delete from evaluation_assignments ea
where ea.id in (select id from _to_remove_paul_rehber);

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'rehberlik_ogretmeni',
  'pending'
from users ev
join users tg on tg.name = 'Şule KOÇAK'
where ev.name = 'Paul GEORGES'
  and ev.id <> tg.id
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and ea.matrix_context = 'rehberlik_ogretmeni'
  );

commit;

-- Kontrol
select tg.name as hedef
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Paul GEORGES'
  and ea.matrix_context = 'rehberlik_ogretmeni'
order by tg.name;
