-- Integration logs (outbound/inbound events to external platforms, e.g. InspiraSuite)
-- Idempotent migration.
--
-- Records every cross-platform event so admins can audit what was assigned,
-- by whom, and whether the remote call succeeded.

create table if not exists public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  platform text not null,                 -- 'inspirasuite'
  direction text not null,                -- 'outbound' | 'inbound'
  event_type text not null,               -- 'course_assigned', 'course_matched', ...
  user_email text null,                   -- affected end-user (evaluatee)
  organization_id uuid null,
  status text not null default 'success', -- 'success' | 'error'
  payload jsonb null,                     -- request/response detail
  error text null,
  created_at timestamptz not null default now()
);

create index if not exists integration_logs_platform_idx on public.integration_logs(platform);
create index if not exists integration_logs_user_email_idx on public.integration_logs(user_email);
create index if not exists integration_logs_event_type_idx on public.integration_logs(event_type);
create index if not exists integration_logs_created_at_idx on public.integration_logs(created_at desc);

-- Writes go through the service-role key on the server; keep RLS on with no public policy.
alter table if exists public.integration_logs enable row level security;
