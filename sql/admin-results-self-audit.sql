-- Admin Sonuçlar "Öz" sütunu teşhisi: öz ataması + yanıt satırı
-- Aşağıdaki UUID'leri kendi period_id / org hedefinize göre değiştirin.

-- 1) Dönemde öz (evaluator = target) atamaları ve yanıt sayısı
select
  ea.id as assignment_id,
  ea.evaluator_id,
  ea.target_id,
  ea.status,
  count(er.id) as response_rows,
  coalesce(sum(case when er.reel_score is not null or er.std_score is not null or er.score is not null then 1 else 0 end), 0) as rows_with_any_score
from evaluation_assignments ea
left join evaluation_responses er on er.assignment_id = ea.id
where ea.period_id = 'PERIOD_UUID_HERE'::uuid
  and ea.evaluator_id = ea.target_id
group by ea.id, ea.evaluator_id, ea.target_id, ea.status
order by ea.target_id;

-- 2) Belirli bir hedef için öz ataması var mı, yanıt var mı? (TARGET_UUID_HERE)
select ea.*, (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as response_count
from evaluation_assignments ea
where ea.period_id = 'PERIOD_UUID_HERE'::uuid
  and ea.target_id = 'TARGET_UUID_HERE'::uuid
  and ea.evaluator_id = ea.target_id;
