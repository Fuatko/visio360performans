-- Değerlendirme yeniden açmadan ÖNCE durum kontrolü (veri değiştirmez)
-- Parametreleri değiştirin:
--   :evaluator_name  örn. 'Ender ÜSTÜNGEL'
--   :target_name     örn. 'Baran YILDIZ'
--   :matrix_context  örn. 'kulup_ogretmeni'
--   :period_id       örn. 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

with params as (
  select
    'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id,
    'Ender ÜSTÜNGEL' as evaluator_name,
    'Baran YILDIZ' as target_name,
    'kulup_ogretmeni' as matrix_context
),
pair as (
  select
    ev.id as evaluator_id,
    tg.id as target_id,
    p.period_id,
    p.matrix_context
  from params p
  join users ev on ev.name ilike p.evaluator_name
  join users tg on tg.name ilike p.target_name
)
select
  ea.id as assignment_id,
  ev.name as degerlendiren,
  tg.name as hedef,
  ea.matrix_context,
  ea.status,
  ea.completed_at,
  (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as yanit_sayisi,
  (select count(*) from international_standard_scores iss where iss.assignment_id = ea.id) as standart_sayisi
from evaluation_assignments ea
join pair on pair.evaluator_id = ea.evaluator_id
  and pair.target_id = ea.target_id
  and pair.period_id = ea.period_id
  and pair.matrix_context = ea.matrix_context
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id;

-- Son yedek durumu
select public.backup_health() as son_yedek;

select status, started_at, finished_at, left(storage_path, 80) as path
from public.backup_runs
order by started_at desc
limit 3;
