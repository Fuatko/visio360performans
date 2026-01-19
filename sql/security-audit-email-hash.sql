-- KVKK: audit log'da PII azaltmak için email_hash kolonu ekler (idempotent)
-- Supabase SQL Editor'da çalıştırın.

alter table public.security_audit_logs add column if not exists email_hash text null;
create index if not exists security_audit_logs_email_hash_created_at_idx
  on public.security_audit_logs (email_hash, created_at desc);

