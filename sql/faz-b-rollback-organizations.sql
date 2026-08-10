-- =====================================================================
-- GERİ ALMA (ROLLBACK) — organizations anon erişimini eski haline döndür
-- =====================================================================
-- Faz B REVOKE (sql/faz-b-revoke-organizations.sql) sonrası bir şey kırılırsa
-- BU DOSYAYI Supabase SQL Editor'da çalıştır → organizations A5 ÖNCESİ haline döner.
--
-- NOT: Sadece re-GRANT YETMEZ; REVOKE migration'ı RLS enable + RESTRICTIVE deny
-- de eklediği için o iki katmanı da geri almak gerekir. Aşağıdaki 3 satır
-- organizations'ı A5 öncesi duruma (RLS kapalı, anon tam erişim) tam döndürür.
-- Veri DEĞİŞMEZ (sadece erişim). Idempotent.

-- 1) anon + authenticated'a tüm yetkileri geri ver
grant select, insert, update, delete on public.organizations to anon, authenticated;

-- 2) Faz B'nin eklediği restrictive deny policy'sini kaldır (yoksa re-grant'ı ezer)
drop policy if exists faz_b_deny_all on public.organizations;

-- 3) RLS'i A5 öncesi gibi kapat (organizations A5 öncesinde RLS-KAPALI idi)
alter table public.organizations disable row level security;

-- Doğrulama (opsiyonel): sonrasında anon organizations → tekrar 200/206 dönmeli.
