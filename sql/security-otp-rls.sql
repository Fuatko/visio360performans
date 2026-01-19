-- OTP tabloları için KVKK uyumlu RLS (client erişimini kapatır, server/service role çalışır)
-- Supabase SQL Editor'da çalıştırın.

-- 1) otp_codes: OTP kodları client tarafından okunmamalı/yazılmamalı.
alter table if exists public.otp_codes enable row level security;

drop policy if exists "otp_codes_deny_select" on public.otp_codes;
create policy "otp_codes_deny_select" on public.otp_codes
  for select
  using (false);

drop policy if exists "otp_codes_deny_insert" on public.otp_codes;
create policy "otp_codes_deny_insert" on public.otp_codes
  for insert
  with check (false);

drop policy if exists "otp_codes_deny_update" on public.otp_codes;
create policy "otp_codes_deny_update" on public.otp_codes
  for update
  using (false);

drop policy if exists "otp_codes_deny_delete" on public.otp_codes;
create policy "otp_codes_deny_delete" on public.otp_codes
  for delete
  using (false);

-- 2) otp_rate_limits: client erişimini kapat (rate limit insertleri RPC ile yapılır, server/service role etkilenmez)
alter table if exists public.otp_rate_limits enable row level security;
drop policy if exists "deny_all_select" on public.otp_rate_limits;
create policy "deny_all_select" on public.otp_rate_limits for select using (false);
drop policy if exists "deny_all_insert" on public.otp_rate_limits;
create policy "deny_all_insert" on public.otp_rate_limits for insert with check (false);

-- 3) security_audit_logs: client erişimini kapat (audit log insertleri server/service role ile yapılır)
alter table if exists public.security_audit_logs enable row level security;
drop policy if exists "deny_all_select" on public.security_audit_logs;
create policy "deny_all_select" on public.security_audit_logs for select using (false);
drop policy if exists "deny_all_insert" on public.security_audit_logs;
create policy "deny_all_insert" on public.security_audit_logs for insert with check (false);

