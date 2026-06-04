-- Ender ÜSTÜNGEL → Dilara ADAŞ — genel değerlendirme yeniden aç
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Atama ID: 355482ba-2b95-433b-b011-de7a4647a516
-- Uygulandı: 2026-06-02 (21 yanıt silindi, status → pending)

begin;

select ea.id, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context, ea.status, ea.completed_at,
       (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as yanit_sayisi
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.id = '355482ba-2b95-433b-b011-de7a4647a516';

delete from evaluation_responses
where assignment_id = '355482ba-2b95-433b-b011-de7a4647a516';

delete from international_standard_scores
where assignment_id = '355482ba-2b95-433b-b011-de7a4647a516';

update evaluation_assignments
set status = 'pending', completed_at = null
where id = '355482ba-2b95-433b-b011-de7a4647a516';

select ea.id, ea.status, ea.completed_at,
       (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as yanit_sayisi
from evaluation_assignments ea
where ea.id = '355482ba-2b95-433b-b011-de7a4647a516';

commit;
