-- KVKK / Ops: Audit log retention & cleanup (idempotent)
-- Goal: keep audit logs for a limited window (default 180 days) and purge older rows.
-- Safe to re-run. Works with/without pg_cron.

-- Helpful index for purging by created_at (optional)
create index if not exists security_audit_logs_created_at_idx
  on public.security_audit_logs (created_at desc);

create or replace function public.security_audit_cleanup(p_keep_days integer default 180)
returns void
language plpgsql
security definer
as $$
begin
  if to_regclass('public.security_audit_logs') is not null then
    delete from public.security_audit_logs
     where created_at < now() - make_interval(days => greatest(p_keep_days, 1));
  end if;
end;
$$;

revoke all on function public.security_audit_cleanup(integer) from public;

-- Optional: schedule daily cleanup at 03:10 (if pg_cron is enabled)
do $$
begin
  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'security_audit_cleanup_daily') then
      perform cron.schedule(
        'security_audit_cleanup_daily',
        '10 3 * * *',
        $cmd$select public.security_audit_cleanup(180);$cmd$
      );
    end if;
  end if;
end
$$;

