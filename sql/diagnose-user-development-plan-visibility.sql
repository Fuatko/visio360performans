-- Gelişim Planım görünürlüğü (Supabase SQL Editor)
-- İsim veya id: Onur ERMAN = 83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679

with u as (
  select id, name, email, role from users
  where id = '83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679'::uuid
     or name = 'Onur ERMAN'
  limit 1
),
target_rows as (
  select
    ea.id as assignment_id,
    ea.status,
    ep.id as period_id,
    ep.name as period_name,
    ep.assessment_kind,
    ep.results_released,
    ev.name as evaluator_name
  from evaluation_assignments ea
  join u on u.id = ea.target_id
  join evaluation_periods ep on ep.id = ea.period_id
  left join users ev on ev.id = ea.evaluator_id
)
select
  period_name,
  coalesce(assessment_kind, 'development_360') as assessment_kind,
  results_released,
  count(*) filter (where status = 'completed') as completed_as_target,
  count(*) as total_as_target,
  count(*) filter (where status = 'completed' and coalesce(assessment_kind, 'development_360') = 'development_360') as dev360_completed
from target_rows
group by period_id, period_name, assessment_kind, results_released
order by period_name;

select id, name, email, role from users
where id = '83e4c2ee-39b3-4ad9-b5dd-20bd32a9e679'::uuid;
