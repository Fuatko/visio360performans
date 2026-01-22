-- Action Plans v2 (adds per-task training workflow fields)
-- Idempotent migration.

alter table if exists public.action_plan_tasks
  add column if not exists planned_at timestamptz null,
  add column if not exists learning_started_at timestamptz null,
  add column if not exists baseline_score numeric null,
  add column if not exists target_score numeric null;

create index if not exists action_plan_tasks_planned_at_idx on public.action_plan_tasks(planned_at);
create index if not exists action_plan_tasks_learning_started_at_idx on public.action_plan_tasks(learning_started_at);

