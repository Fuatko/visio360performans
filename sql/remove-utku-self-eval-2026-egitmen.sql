-- Utku Aytaç öz değerlendirmesi — yalnızca 2026 EĞİTMEN_İŞ PERFORMANS DEĞ.
-- Diğer dönemlere (ör. Q1 Kişisel Gelişim) dokunulmaz.
-- Supabase → SQL Editor → postgres ile çalıştırın.

begin;

delete from evaluation_responses
where assignment_id = '13291cb5-98b8-4980-8525-e1b7048138b2';

delete from international_standard_scores
where assignment_id = '13291cb5-98b8-4980-8525-e1b7048138b2';

delete from evaluation_assignments
where id = '13291cb5-98b8-4980-8525-e1b7048138b2'
  and period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = target_id;

commit;

-- Doğrulama (0 satır dönmeli)
select ea.id, ep.name, u.name, ea.status
from evaluation_assignments ea
join evaluation_periods ep on ep.id = ea.period_id
join users u on u.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = ea.target_id
  and u.name ilike '%utku%aytac%';
