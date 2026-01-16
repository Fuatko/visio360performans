-- VISIO360 - Şema Uyumluluk (eski/yeni tablo isimleri)
-- Supabase SQL Editor'da bir kez çalıştırın.
--
-- Amaç: Bazı projelerde `answers` yerine `question_answers` kullanılıyor.
-- Uygulama tarafında `answers` bekleyen ekranlar için view oluşturur.

do $$
begin
  if to_regclass('public.answers') is null and to_regclass('public.question_answers') is not null then
    execute $v$
      create or replace view public.answers as
      select
        id,
        question_id,
        text,
        text_en,
        text_fr,
        std_score,
        reel_score,
        sort_order as order_num,
        created_at
      from public.question_answers
    $v$;
  end if;
end $$;

