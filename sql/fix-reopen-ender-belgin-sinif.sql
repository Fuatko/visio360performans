-- Ender ÜSTÜNGEL → Belgin ŞİMŞEK — Sınıf Öğretmeni değerlendirme yeniden aç
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Atama ID: 984ef5a2-cca6-4c3a-87ec-ccf28bbbe16b
-- matrix_context: sinif_ogretmeni
-- Uygulandı: 2026-06-03 (4 yanıt silindi, status → pending)

begin;

select ea.id, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context, ea.status, ea.completed_at,
       (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as yanit_sayisi
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.id = '984ef5a2-cca6-4c3a-87ec-ccf28bbbe16b';

delete from evaluation_responses
where assignment_id = '984ef5a2-cca6-4c3a-87ec-ccf28bbbe16b';

delete from international_standard_scores
where assignment_id = '984ef5a2-cca6-4c3a-87ec-ccf28bbbe16b';

update evaluation_assignments
set status = 'pending', completed_at = null
where id = '984ef5a2-cca6-4c3a-87ec-ccf28bbbe16b';

select ea.id, ea.status, ea.completed_at, ea.matrix_context,
       (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as yanit_sayisi
from evaluation_assignments ea
where ea.id = '984ef5a2-cca6-4c3a-87ec-ccf28bbbe16b';

commit;
