-- KVKK: OTP tabloları için temizlik ve plaintext azaltma (idempotent)
-- Supabase SQL Editor'da çalıştırın.

-- 1) otp_codes: hash varsa plaintext code'u null'la (hash-only geçişi için)
do $$
begin
  if to_regclass('public.otp_codes') is not null then
    -- Sadece code nullable ise başarılı olur; değilse hata verebilir. Bu yüzden exception swallow.
    begin
      update public.otp_codes
         set code = null
       where code_hash is not null
         and code is not null;
    exception when others then
      -- ignore (code column may still be NOT NULL)
      null;
    end;

    -- 2) otp_codes: eski kayıtları sil (used veya expire olmuş)
    -- Keep window: 30 gün
    delete from public.otp_codes
     where (used = true and created_at < now() - interval '30 days')
        or (expires_at < now() - interval '30 days');
  end if;
end
$$;

-- 3) otp_rate_limits: eski kayıtları sil (abuse log)
do $$
begin
  if to_regclass('public.otp_rate_limits') is not null then
    delete from public.otp_rate_limits
     where created_at < now() - interval '30 days';
  end if;
end
$$;

-- 4) otp_verify_attempts: eski kayıtları sil (verify abuse log)
do $$
begin
  if to_regclass('public.otp_verify_attempts') is not null then
    delete from public.otp_verify_attempts
     where created_at < now() - interval '30 days';
  end if;
end
$$;

-- 5) security_audit_logs: eski audit kayıtları (ops) - 180 gün tut (kurumsal opsiyon)
do $$
begin
  if to_regclass('public.security_audit_logs') is not null then
    delete from public.security_audit_logs
     where created_at < now() - interval '180 days';
  end if;
end
$$;

