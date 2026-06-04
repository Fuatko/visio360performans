-- FR şablon soru metinlerini güvenli düzeltme (TR fallback kopyası)
-- Kural:
-- - Sadece text_fr şablon/generic ise günceller (Question 1, Q2, vb.)
-- - text_tr dolu olmalı
-- - Başka satırlara dokunmaz
--
-- Not: Snapshot tabloları formda kullanıldığı için hem LIVE hem SNAPSHOT güncellenir.

begin;

-- 1) LIVE questions
with to_fix_live as (
  select
    q.id,
    trim(coalesce(q.text, '')) as text_tr,
    trim(coalesce(q.text_fr, '')) as text_fr
  from questions q
  where trim(coalesce(q.text, '')) <> ''
    and lower(trim(coalesce(q.text_fr, ''))) ~ '^(question|q)\s*[0-9]+\s*$'
)
update questions q
set text_fr = t.text_tr
from to_fix_live t
where q.id = t.id;

-- 2) SNAPSHOT questions
with to_fix_snap as (
  select
    s.id,
    s.period_id,
    trim(coalesce(s.text, '')) as text_tr,
    trim(coalesce(s.text_fr, '')) as text_fr
  from evaluation_period_questions_snapshot s
  where trim(coalesce(s.text, '')) <> ''
    and lower(trim(coalesce(s.text_fr, ''))) ~ '^(question|q)\s*[0-9]+\s*$'
)
update evaluation_period_questions_snapshot s
set text_fr = t.text_tr
from to_fix_snap t
where s.id = t.id
  and s.period_id = t.period_id;

commit;

-- Doğrulama özeti:
select
  'LIVE' as source,
  count(*) as kalan_placeholder
from questions
where lower(trim(coalesce(text_fr, ''))) ~ '^(question|q)\s*[0-9]+\s*$'
union all
select
  'SNAPSHOT' as source,
  count(*) as kalan_placeholder
from evaluation_period_questions_snapshot
where lower(trim(coalesce(text_fr, ''))) ~ '^(question|q)\s*[0-9]+\s*$';

