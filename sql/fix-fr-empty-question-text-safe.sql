-- FR boş soru metinlerini güvenli doldurma (TR fallback)
-- Sadece text_fr boşsa doldurur, mevcut FR çevirilere dokunmaz.
-- Hem LIVE (questions) hem SNAPSHOT tablolarını kapsar.

begin;

-- 1) LIVE questions: text_fr boş ve text_tr dolu ise text_fr = text_tr
with live_to_fix as (
  select
    q.id,
    trim(coalesce(q.text, '')) as text_tr
  from questions q
  where trim(coalesce(q.text_fr, '')) = ''
    and trim(coalesce(q.text, '')) <> ''
)
update questions q
set text_fr = l.text_tr
from live_to_fix l
where q.id = l.id;

-- 2) SNAPSHOT questions: text_fr boş ve text (TR) dolu ise text_fr = text
with snap_to_fix as (
  select
    s.id,
    s.period_id,
    trim(coalesce(s.text, '')) as text_tr
  from evaluation_period_questions_snapshot s
  where trim(coalesce(s.text_fr, '')) = ''
    and trim(coalesce(s.text, '')) <> ''
)
update evaluation_period_questions_snapshot s
set text_fr = x.text_tr
from snap_to_fix x
where s.id = x.id
  and s.period_id = x.period_id;

commit;

-- Doğrulama
select
  'LIVE' as source,
  count(*) as remaining_fr_empty
from questions
where trim(coalesce(text_fr, '')) = ''
  and trim(coalesce(text, '')) <> ''
union all
select
  'SNAPSHOT' as source,
  count(*) as remaining_fr_empty
from evaluation_period_questions_snapshot
where trim(coalesce(text_fr, '')) = ''
  and trim(coalesce(text, '')) <> '';

