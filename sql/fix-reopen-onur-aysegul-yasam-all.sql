-- Onur ERMAN & Ayşegül KAZMAZ — yasam_koordinatoru tüm atamaları yeniden aç
-- (Yeni 9 soruluk Okul İçi Yaşam Koordinatörü formu için)
--
-- Önerilen: node scripts/reopen-onur-aysegul-yasam-all.mjs --apply (otomatik yedek)

begin;

create temp table _targets(id uuid) on commit drop;
insert into _targets(id)
select id from users where name in ('Onur ERMAN', 'Ayşegül KAZMAZ');

create temp table _assign(id uuid) on commit drop;
insert into _assign(id)
select ea.id
from evaluation_assignments ea
join _targets tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.matrix_context = 'yasam_koordinatoru';

delete from evaluation_responses er
where er.assignment_id in (select id from _assign);

delete from international_standard_scores iss
where iss.assignment_id in (select id from _assign);

update evaluation_assignments ea
set status = 'pending', completed_at = null
where ea.id in (select id from _assign);

commit;

select ea.status, count(*) as n
from evaluation_assignments ea
join _targets tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.matrix_context = 'yasam_koordinatoru'
group by ea.status;
