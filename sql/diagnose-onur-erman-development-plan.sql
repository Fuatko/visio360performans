-- Onur ERMAN — Gelişim Planım neden boş? (Supabase SQL Editor, postgres)
-- user id: 83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679

-- 1) Aynı isimde başka kullanıcı var mı?
select id, name, email, role, created_at
from users
where name ilike '%onur%erman%'
order by created_at;

-- 2) Hedef olarak atama özeti (Gelişim Planım bunu kullanır)
select
  ep.name as period_name,
  ep.id as period_id,
  coalesce(ep.assessment_kind, 'development_360') as assessment_kind,
  ep.results_released,
  count(*) as total_as_target,
  count(*) filter (where ea.status = 'completed') as completed_as_target,
  count(*) filter (where ea.status = 'pending') as pending_as_target
from evaluation_assignments ea
join evaluation_periods ep on ep.id = ea.period_id
where ea.target_id = '83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679'::uuid
group by ep.id, ep.name, ep.assessment_kind, ep.results_released
order by ep.name;

-- 3) 2026 dönemi tek satır (period id sabit)
select
  count(*) as total,
  count(*) filter (where status = 'completed') as completed,
  count(*) filter (where status = 'pending') as pending
from evaluation_assignments
where target_id = '83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679'::uuid
  and period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

-- 4) Değerlendiren olarak (karşılaştırma — Gelişim Planı bunu saymaz)
select
  ep.name,
  count(*) filter (where ea.status = 'pending') as pending_as_evaluator,
  count(*) filter (where ea.status = 'completed') as completed_as_evaluator
from evaluation_assignments ea
join evaluation_periods ep on ep.id = ea.period_id
where ea.evaluator_id = '83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679'::uuid
  and period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
group by ep.name;

-- 5) Oturum e-postası bu id ile eşleşiyor mu?
select id, name, email from users where email = 'fuat.k@visiocct.com';

-- Beklenen (matrise göre):
--   total_as_target >> 0  (Onur hem hedef hem değerlendiren)
--   Gelişim Planım: total>0 ise dönem butonu görünür;
--   completed=0 ise "değerlendirmeler bekleniyor";
--   results_released=false ise "sonuçlar yayınlanmadı";
--   completed>0 ve released=true ise plan içeriği
