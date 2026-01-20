-- KVKK/kurumsal kullanım: OTP temizlik fonksiyonu + (opsiyonel) pg_cron schedule
-- Supabase SQL Editor'da çalıştırın.
-- Not: pg_cron her projede açık olmayabilir. Script, cron yoksa sadece fonksiyonu oluşturur.

-- 1) Temizlik fonksiyonu (idempotent)
create or replace function public.security_otp_cleanup()
returns void
language plpgsql
security definer
as $$
begin
  -- otp_codes
  if to_regclass('public.otp_codes') is not null then
    begin
      update public.otp_codes
         set code = null
       where code_hash is not null
         and code is not null;
    exception when others then
      null;
    end;

    delete from public.otp_codes
     where (used = true and created_at < now() - interval '30 days')
        or (expires_at < now() - interval '30 days');
  end if;

  -- otp_rate_limits
  if to_regclass('public.otp_rate_limits') is not null then
    delete from public.otp_rate_limits
     where created_at < now() - interval '30 days';
  end if;

  -- otp_verify_attempts
  if to_regclass('public.otp_verify_attempts') is not null then
    delete from public.otp_verify_attempts
     where created_at < now() - interval '30 days';
  end if;

  -- security_audit_logs
  if to_regclass('public.security_audit_logs') is not null then
    -- Prefer shared audit cleanup function if installed
    if to_regclass('public.security_audit_cleanup') is not null then
      perform public.security_audit_cleanup(180);
    else
      delete from public.security_audit_logs
       where created_at < now() - interval '180 days';
    end if;
  end if;
end;
$$;

revoke all on function public.security_otp_cleanup() from public;

-- 2) Opsiyonel: günlük 03:00'te çalıştır (cron varsa)
do $$
begin
  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'security_otp_cleanup_daily') then
      perform cron.schedule(
        'security_otp_cleanup_daily',
        '0 3 * * *',
        $cmd$select public.security_otp_cleanup();$cmd$
      );
    end if;
  end if;
end
$$;

