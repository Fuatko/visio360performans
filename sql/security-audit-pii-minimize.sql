-- KVKK / PII minimization for ops logs
-- Goal: security_audit_logs must never store raw `email`; only `email_hash`.
-- Safe & idempotent: can be re-run.

-- Ensure `email_hash` exists (some installs already applied `security-audit-email-hash.sql`)
alter table public.security_audit_logs
  add column if not exists email_hash text;

create index if not exists security_audit_logs_email_hash_idx
  on public.security_audit_logs (email_hash);

-- Drop any existing raw emails (irreversible PII removal)
update public.security_audit_logs
set email = null
where email is not null;

-- Enforce: email column must stay NULL (prevents accidental PII writes)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'security_audit_logs_email_must_be_null'
  ) then
    alter table public.security_audit_logs
      add constraint security_audit_logs_email_must_be_null
      check (email is null);
  end if;
end $$;

