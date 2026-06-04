-- Kategori / ana başlık FR isimleri (canlı tablolar + dönem snapshot)
-- Soru/cevap harmonize sonrası kategori başlıkları boş kalabiliyor → formda TR görünür.

begin;

-- question_categories: aynı TR isim için en iyi FR
create temp table _cat_fr_map on commit drop as
select
  trim(c.name) as tr_name,
  (
    array_agg(trim(c.name_fr) order by length(trim(c.name_fr)) desc, c.id::text)
      filter (where trim(coalesce(c.name_fr, '')) <> '')
  )[1] as fr_name
from public.question_categories c
where trim(coalesce(c.name, '')) <> ''
group by trim(c.name);

update public.question_categories c
set name_fr = m.fr_name
from _cat_fr_map m
where trim(c.name) = m.tr_name
  and trim(coalesce(m.fr_name, '')) <> ''
  and (
    trim(coalesce(c.name_fr, '')) = ''
    or lower(trim(c.name_fr)) = lower(trim(c.name))
  );

-- main_categories
create temp table _mc_fr_map on commit drop as
select
  trim(m.name) as tr_name,
  (
    array_agg(trim(m.name_fr) order by length(trim(m.name_fr)) desc, m.id::text)
      filter (where trim(coalesce(m.name_fr, '')) <> '')
  )[1] as fr_name
from public.main_categories m
where trim(coalesce(m.name, '')) <> ''
group by trim(m.name);

update public.main_categories m
set name_fr = x.fr_name
from _mc_fr_map x
where trim(m.name) = x.tr_name
  and trim(coalesce(x.fr_name, '')) <> ''
  and (
    trim(coalesce(m.name_fr, '')) = ''
    or lower(trim(m.name_fr)) = lower(trim(m.name))
  );

-- Snapshot (2026 EĞİTMEN)
update public.evaluation_period_categories_snapshot s
set name_fr = m.fr_name
from _cat_fr_map m
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and trim(s.name) = m.tr_name
  and trim(coalesce(m.fr_name, '')) <> ''
  and (
    trim(coalesce(s.name_fr, '')) = ''
    or lower(trim(s.name_fr)) = lower(trim(s.name))
  );

update public.evaluation_period_main_categories_snapshot s
set name_fr = m.fr_name
from _mc_fr_map m
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and trim(s.name) = m.tr_name
  and trim(coalesce(m.fr_name, '')) <> ''
  and (
    trim(coalesce(s.name_fr, '')) = ''
    or lower(trim(s.name_fr)) = lower(trim(s.name))
  );

commit;

select
  (select count(*) from public.question_categories where trim(coalesce(name_fr, '')) = '') as live_cat_fr_empty,
  (select count(*) from public.questions where trim(coalesce(text_fr, '')) = '') as live_q_fr_empty,
  (select count(*) from public.question_answers where trim(coalesce(text_fr, '')) = '') as live_a_fr_empty;
