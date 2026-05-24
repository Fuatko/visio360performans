-- Yalnızca SEÇİLİ DÖNEM + Utku Aytaç öz değerlendirmesi
-- Diğer dönemlerde Utku (ve diğerleri) öz değerlendirme yapabilir; bu script onlara dokunmaz.
--
-- PERIOD_UUID: Supabase → evaluation_periods → yeni matris döneminin id

-- 1) Önizleme
select
  ea.id as assignment_id,
  ea.period_id,
  ep.name as period_name,
  u.name as person_name,
  ea.status,
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as response_rows
from evaluation_assignments ea
join evaluation_periods ep on ep.id = ea.period_id
join users u on u.id = ea.evaluator_id
where ea.period_id = 'PERIOD_UUID_HERE'::uuid
  and ea.evaluator_id = ea.target_id
  and u.name ilike '%utku%'
  and (u.name ilike '%aytac%' or u.name ilike '%aytaç%');

-- 2) Silme (önizleme doğruysa yorumu kaldırın; PERIOD_UUID_HERE değiştirin)
/*
delete from evaluation_responses
where assignment_id in (
  select ea.id
  from evaluation_assignments ea
  join users u on u.id = ea.evaluator_id
  where ea.period_id = 'PERIOD_UUID_HERE'::uuid
    and ea.evaluator_id = ea.target_id
    and u.name ilike '%utku%'
    and (u.name ilike '%aytac%' or u.name ilike '%aytaç%')
);

delete from international_standard_scores
where assignment_id in (
  select ea.id
  from evaluation_assignments ea
  join users u on u.id = ea.evaluator_id
  where ea.period_id = 'PERIOD_UUID_HERE'::uuid
    and ea.evaluator_id = ea.target_id
    and u.name ilike '%utku%'
    and (u.name ilike '%aytac%' or u.name ilike '%aytaç%')
);

delete from evaluation_assignments ea
using users u
where ea.period_id = 'PERIOD_UUID_HERE'::uuid
  and ea.evaluator_id = ea.target_id
  and u.id = ea.evaluator_id
  and u.name ilike '%utku%'
  and (u.name ilike '%aytac%' or u.name ilike '%aytaç%');
*/
