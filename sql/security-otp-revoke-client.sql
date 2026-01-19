-- KVKK: OTP/security tablolarında anon/authenticated için explicit REVOKE (RLS deny-all ile birlikte)
-- Supabase SQL Editor'da çalıştırın.

do $$
begin
  if to_regclass('public.otp_codes') is not null then
    revoke all on table public.otp_codes from anon, authenticated;
  end if;
  if to_regclass('public.otp_rate_limits') is not null then
    revoke all on table public.otp_rate_limits from anon, authenticated;
  end if;
  if to_regclass('public.otp_verify_attempts') is not null then
    revoke all on table public.otp_verify_attempts from anon, authenticated;
  end if;
  if to_regclass('public.security_audit_logs') is not null then
    revoke all on table public.security_audit_logs from anon, authenticated;
  end if;
end
$$;

