-- KVKK/kurumsal kullanım için OTP doğrulama (verify) rate-limit (DB seviyesinde)
-- Supabase SQL Editor'da çalıştırın.

-- 1) Verify attempts log table
create table if not exists public.otp_verify_attempts (
  id bigserial primary key
);

alter table public.otp_verify_attempts add column if not exists created_at timestamptz not null default now();
alter table public.otp_verify_attempts add column if not exists email text not null default '';
alter table public.otp_verify_attempts add column if not exists ip text not null default '';

create index if not exists otp_verify_attempts_email_created_at_idx
  on public.otp_verify_attempts (email, created_at desc);
create index if not exists otp_verify_attempts_ip_created_at_idx
  on public.otp_verify_attempts (ip, created_at desc);

-- RLS: client erişimini kapat (service role bypass eder)
alter table public.otp_verify_attempts enable row level security;
drop policy if exists "deny_all_select" on public.otp_verify_attempts;
create policy "deny_all_select" on public.otp_verify_attempts for select using (false);
drop policy if exists "deny_all_insert" on public.otp_verify_attempts;
create policy "deny_all_insert" on public.otp_verify_attempts for insert with check (false);

-- 2) RPC: check_otp_verify_rate_limit(email, ip)
-- Varsayılan limitler (10 dk):
-- - Email: 20 (brute-force koruması)
-- - IP: 300 (kurumsal NAT için daha geniş)
create or replace function public.check_otp_verify_rate_limit(p_email text, p_ip text)
returns void
language plpgsql
security definer
as $$
declare
  email_count int;
  ip_count int;
begin
  insert into public.otp_verify_attempts(email, ip)
  values (lower(trim(p_email)), coalesce(nullif(trim(p_ip), ''), 'unknown'));

  select count(*)
    into email_count
    from public.otp_verify_attempts
   where email = lower(trim(p_email))
     and created_at >= now() - interval '10 minutes';

  select count(*)
    into ip_count
    from public.otp_verify_attempts
   where ip = coalesce(nullif(trim(p_ip), ''), 'unknown')
     and created_at >= now() - interval '10 minutes';

  if email_count > 20 then
    raise exception 'OTP verify rate limit exceeded (email)';
  end if;

  if ip_count > 300 then
    raise exception 'OTP verify rate limit exceeded (ip)';
  end if;
end;
$$;

revoke all on function public.check_otp_verify_rate_limit(text, text) from public;

