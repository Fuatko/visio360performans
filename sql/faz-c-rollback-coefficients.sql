-- =====================================================================
-- GERİ ALMA (ROLLBACK) — Faz C / coefficients 5 tablosunun anon erişimini aç
-- =====================================================================
-- Faz C REVOKE (sql/faz-c-revoke-coefficients.sql) sonrası bir şey kırılırsa
-- BU DOSYAYI Supabase SQL Editor'da çalıştır → 5 tablonun anon erişimi geri gelir.
--
-- NOT: Sadece re-GRANT YETMEZ; REVOKE migration'ı RLS + RESTRICTIVE deny de
-- eklediği için o katmanları da geri almak gerekir. Her tablo için 3 katman:
--   1) anon + authenticated'a tüm yetkileri geri ver
--   2) faz_c_deny_all restrictive policy'sini kaldır (yoksa re-grant'ı ezer)
--   3) RLS'i kapat (anon erişimini garanti aç — acil fren)
--
-- Veri DEĞİŞMEZ (sadece erişim). Idempotent. DROP/DELETE yok (policy drop hariç).

do $$
declare
  tbl text;
  tbls text[] := array[
    'evaluator_weights',
    'category_weights',
    'confidence_settings',
    'deviation_settings',
    'international_standards'
  ];
begin
  foreach tbl in array tbls loop
    if to_regclass('public.' || tbl) is null then
      raise notice 'ATLANDI (tablo yok): %', tbl;
      continue;
    end if;

    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', tbl);
    execute format('drop policy if exists faz_c_deny_all on public.%I', tbl);
    execute format('alter table public.%I disable row level security', tbl);

    raise notice 'GERİ ALINDI (anon açıldı): %', tbl;
  end loop;
end $$;

-- Doğrulama (opsiyonel): sonrasında anon 5 tablo → tekrar 200/206 dönmeli.
