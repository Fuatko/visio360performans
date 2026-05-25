-- Tek seferlik: yarım «running» satırlarını kapat + backup_health() güncelle.
-- Supabase SQL Editor → Run (veri silinmez).

-- 1) Yarım kalan job satırları
update public.backup_runs
   set status = 'failed',
       finished_at = coalesce(finished_at, now()),
       error_message = coalesce(
         nullif(trim(error_message), ''),
         'stale: job did not finish (manual cleanup)'
       )
 where status = 'running'
   and finished_at is null;

-- 2) Güncel backup_health() (panel «Son çalıştırma» = son tamamlanan job)
create or replace function public.backup_health()
returns jsonb
language plpgsql
security definer
as $$
declare
  latest_success public.backup_runs%rowtype;
  latest_any public.backup_runs%rowtype;
  latest_finished public.backup_runs%rowtype;
  display_status text;
begin
  select *
    into latest_success
    from public.backup_runs
   where status = 'success'
   order by finished_at desc nulls last, started_at desc
   limit 1;

  select *
    into latest_any
    from public.backup_runs
   where not (
     status = 'failed'
     and coalesce(error_message, '') like 'stale:%'
   )
   order by started_at desc
   limit 1;

  select *
    into latest_finished
    from public.backup_runs
   where finished_at is not null
     and not (
       status = 'failed'
       and coalesce(error_message, '') like 'stale:%'
     )
   order by finished_at desc
   limit 1;

  if latest_any.status = 'running' and latest_any.finished_at is null then
    if latest_finished.id is not null then
      display_status := latest_finished.status;
    elsif latest_any.started_at < now() - interval '30 minutes' then
      display_status := 'failed';
    else
      display_status := 'running';
    end if;
  else
    display_status := latest_any.status;
  end if;

  return jsonb_build_object(
    'latest_success_at', latest_success.finished_at,
    'latest_success_path', latest_success.storage_path,
    'latest_success_size_bytes', latest_success.file_size_bytes,
    'latest_success_sha256', latest_success.sha256,
    'latest_status', display_status,
    'latest_started_at', coalesce(latest_finished.started_at, latest_any.started_at),
    'latest_finished_at', coalesce(latest_finished.finished_at, latest_any.finished_at),
    'latest_error', coalesce(latest_finished.error_message, latest_any.error_message),
    'stale_running',
      exists (
        select 1
          from public.backup_runs r
         where r.status = 'running'
           and r.finished_at is null
           and r.started_at < now() - interval '5 minutes'
      ),
    'has_success_last_24h',
      latest_success.finished_at is not null
      and latest_success.finished_at > now() - interval '24 hours'
  );
end;
$$;

revoke all on function public.backup_health() from public;

-- 3) Kontrol (stale_running görünmeli; latest_status → success)
select public.backup_health();

select status, started_at, finished_at
  from public.backup_runs
 order by started_at desc
 limit 5;
