-- VISIO360 - Şema Uyumluluk (eski/yeni tablo isimleri)
-- Supabase SQL Editor'da bir kez çalıştırın.
--
-- Amaç: Bazı projelerde `answers` yerine `question_answers` kullanılıyor.
-- Uygulama tarafında `answers` bekleyen ekranlar için view oluşturur.

do $$
declare
  has_text_en boolean;
  has_text_fr boolean;
  has_created_at boolean;
  has_sort_order boolean;
  has_order_num boolean;
begin
  if to_regclass('public.answers') is null and to_regclass('public.question_answers') is not null then
    select exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='question_answers' and column_name='text_en'
    ) into has_text_en;
    select exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='question_answers' and column_name='text_fr'
    ) into has_text_fr;
    select exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='question_answers' and column_name='created_at'
    ) into has_created_at;
    select exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='question_answers' and column_name='sort_order'
    ) into has_sort_order;
    select exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='question_answers' and column_name='order_num'
    ) into has_order_num;

    execute format(
      'create or replace view public.answers as
       select
         id,
         question_id,
         text,
         %s as text_en,
         %s as text_fr,
         std_score,
         reel_score,
         %s as order_num,
         %s as created_at
       from public.question_answers',
      case when has_text_en then 'text_en' else 'NULL::text' end,
      case when has_text_fr then 'text_fr' else 'NULL::text' end,
      case
        when has_sort_order then 'sort_order'
        when has_order_num then 'order_num'
        else '0'
      end,
      case when has_created_at then 'created_at' else 'NULL::timestamptz' end
    );
  end if;
end $$;

