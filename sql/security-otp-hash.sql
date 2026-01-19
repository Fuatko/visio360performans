-- KVKK için: OTP kodunu plaintext saklamadan doğrulamak üzere hash alanı ekler.
-- 1) otp_codes tablosuna code_hash ekle (idempotent)
alter table public.otp_codes add column if not exists code_hash text;

-- 2) Performans için index
create index if not exists otp_codes_email_code_hash_created_at_idx
  on public.otp_codes (email, code_hash, created_at desc);

-- 3) Hash-only moda geçebilmek için (opsiyonel): code alanını nullable yap
-- Not: Bazı eski şemalarda code NOT NULL olabilir. Bu satır güvenlidir; zaten nullable ise etkisizdir.
alter table public.otp_codes alter column code drop not null;

