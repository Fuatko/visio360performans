-- Tamamı «Fikrim yok» (puanlanabilir yanıt yok) tamamlanmış değerlendirmeler — salt okunur
-- Dönem id'sini değiştirin: period_id = '...'

with completed as (
  select
    ea.id as assignment_id,
    ea.period_id,
    ea.matrix_context,
    ea.completed_at,
    ev.name as evaluator_name,
    tg.name as target_name,
    tg.department as target_dept
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.status = 'completed'
),
resp_stats as (
  select
    er.assignment_id,
    count(*) as response_count,
    count(*) filter (where coalesce(er.reel_score, er.std_score, 0) > 0) as scorable_count
  from evaluation_responses er
  join completed c on c.assignment_id = er.assignment_id
  group by er.assignment_id
)
select
  c.evaluator_name,
  c.target_name,
  c.target_dept,
  coalesce(c.matrix_context, 'genel') as matrix_context,
  rs.response_count,
  c.completed_at::date as completed_date
from completed c
join resp_stats rs on rs.assignment_id = c.assignment_id
where rs.response_count > 0
  and rs.scorable_count = 0
order by c.evaluator_name, c.target_name;

-- Özet
with completed as (
  select ea.id
  from evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.status = 'completed'
),
resp_stats as (
  select
    er.assignment_id,
    count(*) as response_count,
    count(*) filter (where coalesce(er.reel_score, er.std_score, 0) > 0) as scorable_count
  from evaluation_responses er
  where er.assignment_id in (select id from completed)
  group by er.assignment_id
)
select count(*) as tamami_fikrim_yok
from resp_stats
where response_count > 0 and scorable_count = 0;
