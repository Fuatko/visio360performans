-- Action Plans v3 (adds AI suggestion fields + catalog link per task)
-- Idempotent migration.

alter table if exists public.action_plan_tasks
  add column if not exists training_id uuid null references public.training_catalog(id) on delete set null,
  add column if not exists ai_suggestion jsonb null,
  add column if not exists ai_text text null,
  add column if not exists ai_generated_at timestamptz null,
  add column if not exists ai_generated_by uuid null references public.users(id) on delete set null,
  add column if not exists ai_model text null;

create index if not exists action_plan_tasks_training_idx on public.action_plan_tasks(training_id);
create index if not exists action_plan_tasks_ai_generated_at_idx on public.action_plan_tasks(ai_generated_at);

