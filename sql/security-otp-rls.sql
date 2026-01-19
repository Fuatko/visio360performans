-- OTP tabloları için KVKK uyumlu RLS (client erişimini kapatır, server/service role çalışır)
-- Supabase SQL Editor'da çalıştırın.

-- 1) otp_codes: OTP kodları client tarafından okunmamalı/yazılmamalı.
alter table public.otp_codes enable row level security;

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

-- 2) otp_rate_limits + security_audit_logs zaten security-otp-rate-limit.sql ile RLS deny-all olarak geliyor.
-- Eğer daha önce farklı policy'ler eklendiyse, istersen burada da deny-all'a çekebilirsin:
-- alter table public.otp_rate_limits enable row level security;
-- alter table public.security_audit_logs enable row level security;

