-- =====================================================================
-- GERİ ALMA (ROLLBACK) — users anon erişimini eski haline döndür
-- =====================================================================
-- Faz B REVOKE (sql/faz-b-revoke-users.sql) sonrası bir şey kırılırsa
-- BU DOSYAYI Supabase SQL Editor'da çalıştır → users anon erişimi geri gelir.
--
-- NOT: Sadece re-GRANT YETMEZ; REVOKE migration'ı RLS + RESTRICTIVE deny de
-- eklediği için o katmanları da geri almak gerekir. Aşağıdaki 3 satır anon
-- erişimini garanti geri açar. Veri DEĞİŞMEZ (sadece erişim). Idempotent.

-- 1) anon + authenticated'a tüm yetkileri geri ver
grant select, insert, update, delete on public.users to anon, authenticated;

-- 2) Faz B'nin eklediği restrictive deny policy'sini kaldır (yoksa re-grant'ı ezer)
drop policy if exists faz_b_deny_all on public.users;

-- 3) RLS'i kapat (anon erişimini garanti aç — acil fren)
alter table public.users disable row level security;

-- Doğrulama (opsiyonel): sonrasında anon users → tekrar 200/206 dönmeli.
