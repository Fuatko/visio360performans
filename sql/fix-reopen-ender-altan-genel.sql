-- Ender ÜSTÜNGEL → Altan KILIÇ genel değerlendirme yeniden aç
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Atama ID: 4e51be53-74d8-416d-9e3d-c96dbdeb54fb

begin;

-- Önce durum
select ea.id, ev.name as degerlendiren, tg.name as hedef, ea.status, ea.completed_at,
       (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as yanit_sayisi
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.id = '4e51be53-74d8-416d-9e3d-c96dbdeb54fb';

delete from evaluation_responses
where assignment_id = '4e51be53-74d8-416d-9e3d-c96dbdeb54fb';

delete from international_standard_scores
where assignment_id = '4e51be53-74d8-416d-9e3d-c96dbdeb54fb';

update evaluation_assignments
set status = 'pending', completed_at = null
where id = '4e51be53-74d8-416d-9e3d-c96dbdeb54fb';

-- Sonra durum
select ea.id, ea.slug, ea.status, ea.completed_at,
       (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as yanit_sayisi
from evaluation_assignments ea
where ea.id = '4e51be53-74d8-416d-9e3d-c96dbdeb54fb';

commit;
