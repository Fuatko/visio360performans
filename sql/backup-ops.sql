-- ============================================================
-- Backup / Restore operasyon izleme
-- ============================================================
-- Canlı veriye dokunmaz; sadece backup job sonuçlarını ve restore
-- testlerini izlemek için ek tablo/fonksiyon oluşturur.
-- ============================================================

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'running'
    check (status in ('running', 'success', 'failed', 'restore_test_success', 'restore_test_failed')),
  backup_kind text not null default 'full'
    check (backup_kind in ('full', 'schema', 'data', 'restore_test')),
  storage_provider text null,
  storage_path text null,
  file_size_bytes bigint null,
  sha256 text null,
  encrypted boolean not null default true,
  error_message text null,
  meta jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_backup_runs_started_at
  on public.backup_runs(started_at desc);

create index if not exists idx_backup_runs_status
  on public.backup_runs(status, started_at desc);

alter table public.backup_runs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'backup_runs'
      and policyname = 'deny all'
  ) then
    create policy "deny all" on public.backup_runs
      for all using (false) with check (false);
  end if;
exception when others then
  null;
end $$;

revoke all on public.backup_runs from anon, authenticated;

create or replace function public.backup_health()
returns jsonb
language plpgsql
security definer
as $$
declare
  latest_success public.backup_runs%rowtype;
  latest_any public.backup_runs%rowtype;
begin
  select *
    into latest_success
    from public.backup_runs
   where status = 'success'
   order by started_at desc
   limit 1;

  select *
    into latest_any
    from public.backup_runs
   order by started_at desc
   limit 1;

  return jsonb_build_object(
    'latest_success_at', latest_success.finished_at,
    'latest_success_path', latest_success.storage_path,
    'latest_success_size_bytes', latest_success.file_size_bytes,
    'latest_success_sha256', latest_success.sha256,
    'latest_status', latest_any.status,
    'latest_started_at', latest_any.started_at,
    'latest_finished_at', latest_any.finished_at,
    'latest_error', latest_any.error_message,
    'has_success_last_24h',
      latest_success.finished_at is not null
      and latest_success.finished_at > now() - interval '24 hours'
  );
end;
$$;

revoke all on function public.backup_health() from public;

create or replace function public.security_ops_health()
returns jsonb
language plpgsql
security definer
as $$
declare
  tables_to_check text[] := array[
    'evaluation_assignments',
    'evaluation_responses',
    'international_standard_scores',
    'evaluation_period_questions',
    'evaluation_period_questions_snapshot',
    'evaluation_period_answers_snapshot',
    'evaluation_period_user_report_snapshots',
    'evaluation_duties',
    'evaluation_period_user_duties',
    'evaluation_period_duty_categories',
    'evaluation_period_duty_questions',
    'backup_runs'
  ];
  item text;
  result jsonb := '[]'::jsonb;
begin
  foreach item in array tables_to_check loop
    result := result || jsonb_build_array(jsonb_build_object(
      'table', item,
      'exists', to_regclass('public.' || item) is not null,
      'rls_enabled', coalesce((
        select relrowsecurity
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = item
      ), false)
    ));
  end loop;

  return jsonb_build_object(
    'checked_at', now(),
    'tables', result
  );
end;
$$;

revoke all on function public.security_ops_health() from public;
