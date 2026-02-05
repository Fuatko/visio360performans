-- Training Catalog v2 (separate training duration vs program duration)
-- Idempotent migration.
--
-- - training_hours: the actual course duration (hours)
-- - program_weeks: suggested follow-up / practice period (weeks)
-- Backfill from legacy columns:
-- - hours -> training_hours
-- - duration_weeks -> program_weeks

alter table if exists public.training_catalog
  add column if not exists training_hours int null,
  add column if not exists program_weeks int null;

-- Backfill once (best-effort; keep legacy columns for backward compatibility)
update public.training_catalog
set training_hours = coalesce(training_hours, hours)
where training_hours is null and hours is not null;

update public.training_catalog
set program_weeks = coalesce(program_weeks, duration_weeks)
where program_weeks is null and duration_weeks is not null;

create index if not exists training_catalog_program_weeks_idx on public.training_catalog(program_weeks);
create index if not exists training_catalog_training_hours_idx on public.training_catalog(training_hours);

