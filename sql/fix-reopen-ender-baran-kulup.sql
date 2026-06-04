-- Ender ÜSTÜNGEL → Baran YILDIZ — Kulüp Öğretmeni değerlendirme yeniden aç
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Atama ID: e55d4e0d-0120-4e55-89a0-d0ef6fd16836
-- matrix_context: kulup_ogretmeni
-- Uygulandı: 2026-06-03 (5 yanıt silindi, status → pending)

begin;

select ea.id, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context, ea.status, ea.completed_at,
       (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as yanit_sayisi
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.id = 'e55d4e0d-0120-4e55-89a0-d0ef6fd16836';

delete from evaluation_responses
where assignment_id = 'e55d4e0d-0120-4e55-89a0-d0ef6fd16836';

delete from international_standard_scores
where assignment_id = 'e55d4e0d-0120-4e55-89a0-d0ef6fd16836';

update evaluation_assignments
set status = 'pending', completed_at = null
where id = 'e55d4e0d-0120-4e55-89a0-d0ef6fd16836';

select ea.id, ea.status, ea.completed_at, ea.matrix_context,
       (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as yanit_sayisi
from evaluation_assignments ea
where ea.id = 'e55d4e0d-0120-4e55-89a0-d0ef6fd16836';

commit;
