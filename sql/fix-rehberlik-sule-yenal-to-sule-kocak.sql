-- Rehberlik matrisi toplu düzeltme:
-- Hedefte Şule YENAL olan tüm atamaları kaldır, aynı değerlendiricilere Şule KOÇAK ekle.
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

begin;

create temp table _yenal_rehber_pairs(evaluator_id uuid, assignment_id uuid) on commit drop;
insert into _yenal_rehber_pairs(evaluator_id, assignment_id)
select ea.evaluator_id, ea.id
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.matrix_context = 'rehberlik_ogretmeni'
  and tg.name = 'Şule YENAL';

delete from evaluation_responses er
where er.assignment_id in (select assignment_id from _yenal_rehber_pairs);

delete from international_standard_scores iss
where iss.assignment_id in (select assignment_id from _yenal_rehber_pairs);

delete from evaluation_assignments ea
where ea.id in (select assignment_id from _yenal_rehber_pairs);

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  p.evaluator_id,
  sk.id,
  'rehberlik_ogretmeni',
  'pending'
from (select distinct evaluator_id from _yenal_rehber_pairs) p
cross join (select id from users where name = 'Şule KOÇAK' limit 1) sk
where p.evaluator_id <> sk.id
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = p.evaluator_id
      and ea.target_id = sk.id
      and ea.matrix_context = 'rehberlik_ogretmeni'
  );

commit;

-- Son kontrol
with rehber as (
  select ev.name as degerlendiren, tg.name as hedef
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.matrix_context = 'rehberlik_ogretmeni'
)
select
  (select count(*) from rehber where hedef = 'Şule YENAL') as sule_yenal_kaldi,
  (select count(*) from rehber where hedef = 'Şule KOÇAK') as sule_kocak_toplam;
