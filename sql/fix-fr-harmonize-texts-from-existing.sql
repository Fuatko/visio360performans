-- FR metin harmonizasyonu (güvenli)
-- Amaç: Aynı TR metne karşılık gelen mevcut FR metni, eksik/bozuk kayıtların tamamına yayılır.
-- Bu script veri silmez; sadece text_fr/name_fr günceller.
-- Kapsam: questions, question_answers, answers, period snapshot tabloları.

begin;

-- 0) Hedef dönem
-- 2026 EĞİTMEN period_id
do $$
begin
  if not exists (
    select 1 from public.evaluation_periods
    where id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  ) then
    raise exception 'Period not found: %', 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6';
  end if;
end $$;

-- 1) Questions: TR -> FR canonical map (en uzun/kaliteli FR tercih)
create temp table _q_fr_map on commit drop as
select
  trim(q.text) as tr_text,
  (
    array_agg(trim(q.text_fr) order by length(trim(q.text_fr)) desc, q.id::text)
      filter (where trim(coalesce(q.text_fr, '')) <> '')
  )[1] as fr_text
from public.questions q
where trim(coalesce(q.text, '')) <> ''
group by trim(q.text);

-- questions: eksik veya TR ile aynı ise canonical FR ile doldur
update public.questions q
set text_fr = m.fr_text
from _q_fr_map m
where trim(coalesce(q.text, '')) = m.tr_text
  and trim(coalesce(m.fr_text, '')) <> ''
  and (
    trim(coalesce(q.text_fr, '')) = ''
    or lower(trim(q.text_fr)) = lower(trim(q.text))
    or lower(trim(q.text_fr)) ~ '^(question|q)\s*[:\-]?\s*\d*\s*$'
  );

-- 2) Answers: TR -> FR canonical map (question_answers + answers birlikte)
create temp table _a_fr_map on commit drop as
select
  tr_text,
  (
    array_agg(fr_text order by length(fr_text) desc, src)
      filter (where fr_text <> '')
  )[1] as fr_text
from (
  select 'qa' as src, trim(qa.text) as tr_text, trim(coalesce(qa.text_fr, '')) as fr_text
  from public.question_answers qa
  where trim(coalesce(qa.text, '')) <> ''
  union all
  select 'a' as src, trim(a.text) as tr_text, trim(coalesce(a.text_fr, '')) as fr_text
  from public.answers a
  where trim(coalesce(a.text, '')) <> ''
) s
group by tr_text;

update public.question_answers qa
set text_fr = m.fr_text
from _a_fr_map m
where trim(coalesce(qa.text, '')) = m.tr_text
  and trim(coalesce(m.fr_text, '')) <> ''
  and (
    trim(coalesce(qa.text_fr, '')) = ''
    or lower(trim(qa.text_fr)) = lower(trim(qa.text))
    or trim(qa.text_fr) ~ '^[0-9]+([.,][0-9]+)?$'
  );

update public.answers a
set text_fr = m.fr_text
from _a_fr_map m
where trim(coalesce(a.text, '')) = m.tr_text
  and trim(coalesce(m.fr_text, '')) <> ''
  and (
    trim(coalesce(a.text_fr, '')) = ''
    or lower(trim(a.text_fr)) = lower(trim(a.text))
    or trim(a.text_fr) ~ '^[0-9]+([.,][0-9]+)?$'
  );

-- 3) Snapshot questions harmonize (yalnız hedef dönem)
update public.evaluation_period_questions_snapshot s
set text_fr = m.fr_text
from _q_fr_map m
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and trim(coalesce(s.text, '')) = m.tr_text
  and trim(coalesce(m.fr_text, '')) <> ''
  and (
    trim(coalesce(s.text_fr, '')) = ''
    or lower(trim(s.text_fr)) = lower(trim(s.text))
    or lower(trim(s.text_fr)) ~ '^(question|q)\s*[:\-]?\s*\d*\s*$'
    or trim(s.text_fr) ~ '^[0-9]+([.,][0-9]+)?$'
  );

-- 4) Snapshot answers harmonize (yalnız hedef dönem)
update public.evaluation_period_answers_snapshot s
set text_fr = m.fr_text
from _a_fr_map m
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and trim(coalesce(s.text, '')) = m.tr_text
  and trim(coalesce(m.fr_text, '')) <> ''
  and (
    trim(coalesce(s.text_fr, '')) = ''
    or lower(trim(s.text_fr)) = lower(trim(s.text))
    or lower(trim(s.text_fr)) ~ '^(answer|réponse|q|question)\s*[:\-]?\s*\d*\s*$'
    or trim(s.text_fr) ~ '^[0-9]+([.,][0-9]+)?$'
  );

commit;

-- 5) Kontrol özeti
select
  (select count(*) from public.evaluation_period_questions_snapshot where period_id='a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid and trim(coalesce(text_fr,''))='') as q_fr_empty,
  (select count(*) from public.evaluation_period_answers_snapshot  where period_id='a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid and trim(coalesce(text_fr,''))='') as a_fr_empty,
  (select count(*) from public.evaluation_period_questions_snapshot where period_id='a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid and lower(trim(coalesce(text_fr,''))) = lower(trim(coalesce(text,'')))) as q_fr_eq_tr,
  (select count(*) from public.evaluation_period_answers_snapshot  where period_id='a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid and lower(trim(coalesce(text_fr,''))) = lower(trim(coalesce(text,'')))) as a_fr_eq_tr;

