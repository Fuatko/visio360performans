-- =====================================================================
-- GERİ ALMA (ROLLBACK) — Faz C / evaluation_periods anon erişimini aç
-- =====================================================================
-- Faz C REVOKE (sql/faz-c-revoke-periods.sql) sonrası bir şey kırılırsa
-- BU DOSYAYI Supabase SQL Editor'da çalıştır → evaluation_periods anon erişimi geri gelir.
--
-- NOT: Sadece re-GRANT YETMEZ; REVOKE migration'ı RLS + RESTRICTIVE deny de
-- eklediği için o katmanları da geri almak gerekir. 3 katman:
--   1) anon + authenticated'a tüm yetkileri geri ver
--   2) faz_c_deny_all restrictive policy'sini kaldır (yoksa re-grant'ı ezer)
--   3) RLS'i kapat (anon erişimini garanti aç — acil fren)
--
-- Veri DEĞİŞMEZ (sadece erişim). Idempotent. DROP/DELETE yok (policy drop hariç).

do $$
declare
  tbl text := 'evaluation_periods';
begin
  if to_regclass('public.' || tbl) is null then
    raise notice 'ATLANDI (tablo yok): %', tbl;
    return;
  end if;

  execute format('grant select, insert, update, delete on public.%I to anon, authenticated', tbl);
  execute format('drop policy if exists faz_c_deny_all on public.%I', tbl);
  execute format('alter table public.%I disable row level security', tbl);

  raise notice 'GERİ ALINDI (anon açıldı): %', tbl;
end $$;

-- Doğrulama (opsiyonel): sonrasında anon evaluation_periods → tekrar 200/206 dönmeli.
