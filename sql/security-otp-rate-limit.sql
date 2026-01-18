-- KVKK/kurumsal kullanım için OTP rate-limit + audit log (opsiyonel)
-- Bu SQL'i Supabase SQL Editor'da çalıştırabilirsiniz.

-- 1) Audit log (PII azaltmak için email hash önerilir; burada düz email de tutulabilir)
create table if not exists public.security_audit_logs (
  id uuid primary key default gen_random_uuid()
);

-- Idempotent: add missing columns if table already exists with older schema
alter table public.security_audit_logs add column if not exists created_at timestamptz not null default now();
alter table public.security_audit_logs add column if not exists event_type text not null default 'unknown';
alter table public.security_audit_logs add column if not exists email text null;
alter table public.security_audit_logs add column if not exists ip text null;
alter table public.security_audit_logs add column if not exists meta jsonb null;

-- RLS: sadece server-side (service role) yazsın. Client okumayı kapat.
alter table public.security_audit_logs enable row level security;
drop policy if exists "deny_all_select" on public.security_audit_logs;
create policy "deny_all_select" on public.security_audit_logs for select using (false);
drop policy if exists "deny_all_insert" on public.security_audit_logs;
create policy "deny_all_insert" on public.security_audit_logs for insert with check (false);

-- 2) OTP rate limit log
create table if not exists public.otp_rate_limits (
  id bigserial primary key
);

-- Idempotent: add missing columns if table already exists with older schema
alter table public.otp_rate_limits add column if not exists created_at timestamptz not null default now();
alter table public.otp_rate_limits add column if not exists email text not null default '';

create index if not exists otp_rate_limits_email_created_at_idx on public.otp_rate_limits (email, created_at desc);

alter table public.otp_rate_limits enable row level security;
drop policy if exists "deny_all_select" on public.otp_rate_limits;
create policy "deny_all_select" on public.otp_rate_limits for select using (false);
drop policy if exists "deny_all_insert" on public.otp_rate_limits;
create policy "deny_all_insert" on public.otp_rate_limits for insert with check (false);

-- 3) RPC: check_otp_rate_limit(email)
-- Varsayılan: 10 dakikada max 12 OTP isteği/email
create or replace function public.check_otp_rate_limit(p_email text)
returns void
language plpgsql
security definer
as $$
declare
  recent_count int;
begin
  -- Insert an event first (counts even if later mail fails; this is ok for abuse protection)
  insert into public.otp_rate_limits(email) values (lower(trim(p_email)));

  select count(*)
    into recent_count
    from public.otp_rate_limits
   where email = lower(trim(p_email))
     and created_at >= now() - interval '10 minutes';

  if recent_count > 12 then
    raise exception 'OTP rate limit exceeded';
  end if;
end;
$$;

-- Limit function execution to privileged roles only (service role bypasses, but keep it tight)
revoke all on function public.check_otp_rate_limit(text) from public;

